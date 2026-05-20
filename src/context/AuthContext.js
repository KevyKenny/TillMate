import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { InteractionManager } from 'react-native';

import { initDatabase } from '../database/db';
import * as authService from '../services/authService';
import {
  clearCloudToken,
  drainOutboxUntilEmpty,
  enqueueUserRegisterOperation,
  ensureCloudSessionAfterSignup,
  flushOutboxBestEffort,
  maybeEnqueueInitialFullSync,
  runPostLoginCloudSync,
  startBackgroundSync,
  tryPullCloudBootstrapIntoDb,
} from '../services/syncService';

const SESSION_KEY = '@pos_auth_session_v1';
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const AuthContext = createContext(null);

function toUserProfile(row) {
  if (!row) return null;
  const shopName = (row.shop_name ?? '').trim();
  const shopNumber = (row.shop_number ?? '').trim();
  const shopAddress = `${row.street_address}, ${row.city}`;
  return {
    id: Number(row.id),
    fullName: row.full_name,
    email: row.email || '',
    phone: row.phone,
    streetAddress: row.street_address,
    city: row.city,
    shopName: shopName || 'My Shop',
    shopNumber: shopNumber || '',
    shopAddress,
    displayShopName: shopNumber ? `${shopName || 'My Shop'} / ${shopNumber}` : (shopName || 'My Shop'),
  };
}

export function AuthProvider({ children }) {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initDatabase();
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (!raw) return;
        const session = JSON.parse(raw);
        if (!session?.userId || !session?.expiresAt || Date.now() > Number(session.expiresAt)) {
          await AsyncStorage.removeItem(SESSION_KEY);
          return;
        }
        const dbUser = await authService.getUserById(Number(session.userId));
        if (!dbUser) {
          await AsyncStorage.removeItem(SESSION_KEY);
          return;
        }
        await authService.claimUnownedData(Number(session.userId));
        if (!cancelled) setUser(toUserProfile(dbUser));
      } catch {
        await AsyncStorage.removeItem(SESSION_KEY);
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    startBackgroundSync();
  }, [authReady]);

  useEffect(() => {
    if (!authReady || !user) return undefined;
    InteractionManager.runAfterInteractions(() => {
      flushOutboxBestEffort().catch(() => {});
    });
    return undefined;
  }, [authReady, user]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const t = setInterval(() => {
      flushOutboxBestEffort().catch(() => {});
    }, 40000);
    return () => clearInterval(t);
  }, [user?.id]);

  const persistSession = useCallback(async (userId, rememberMe) => {
    if (!rememberMe) {
      await AsyncStorage.removeItem(SESSION_KEY);
      return;
    }
    await AsyncStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        userId: Number(userId),
        expiresAt: Date.now() + SIX_HOURS_MS,
      })
    );
  }, []);

  const signUp = useCallback(async (payload) => {
    const created = await authService.signUp(payload);
    await authService.claimUnownedData(Number(created.id));
    return toUserProfile(created);
  }, []);

  const login = useCallback(async ({ identifier, password, rememberMe }) => {
    const dbUser = await authService.login({ identifier, password });
    await authService.claimUnownedData(Number(dbUser.id));
    await persistSession(dbUser.id, !!rememberMe);
    const profile = toUserProfile(dbUser);
    setUser(profile);
    const pwd = password;
    InteractionManager.runAfterInteractions(() => {
      void runPostLoginCloudSync(dbUser, pwd);
    });
    return profile;
  }, [persistSession]);

  const completeSignupAndLogin = useCallback(async (payload) => {
    const created = await authService.signUp(payload);
    await authService.claimUnownedData(Number(created.id));
    await persistSession(created.id, true);
    const profile = toUserProfile(created);
    setUser(profile);
    InteractionManager.runAfterInteractions(() => {
      void (async () => {
        await ensureCloudSessionAfterSignup(payload, Number(created.id)).catch(() => {});
        const merged = await tryPullCloudBootstrapIntoDb(Number(created.id)).catch(() => false);
        if (!merged) {
          await maybeEnqueueInitialFullSync(Number(created.id)).catch(() => {});
        } else {
          await enqueueUserRegisterOperation(Number(created.id)).catch(() => {});
        }
        await drainOutboxUntilEmpty().catch(() => {});
      })();
    });
    return profile;
  }, [persistSession]);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    await clearCloudToken();
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (payload) => {
    if (!user?.id) throw new Error('Please login again.');
    const updated = await authService.updateUserProfile({ ...payload, userId: user.id });
    const profile = toUserProfile(updated);
    setUser(profile);
    await enqueueUserRegisterOperation(profile.id).catch(() => {});
    InteractionManager.runAfterInteractions(() => {
      flushOutboxBestEffort().catch(() => {});
    });
    return profile;
  }, [user?.id]);

  const changePassword = useCallback(async ({ currentPassword, newPassword, confirmPassword }) => {
    if (!user?.id) throw new Error('Please login again.');
    return authService.changePassword({
      userId: user.id,
      currentPassword,
      newPassword,
      confirmPassword,
    });
  }, [user?.id]);

  const verifyPasswordResetIdentity = useCallback(async ({ phone, fullName }) => {
    return authService.verifyPasswordResetIdentity({ phone, fullName });
  }, []);

  const resetPasswordWithRecovery = useCallback(async ({ phone, fullName, newPassword, confirmPassword }) => {
    return authService.resetPasswordWithRecovery({ phone, fullName, newPassword, confirmPassword });
  }, []);

  const deleteAccount = useCallback(async ({ phone, password }) => {
    if (!user?.id) throw new Error('Please login again.');
    await authService.deleteAccountWithVerification({ userId: user.id, phone, password });
    await AsyncStorage.removeItem(SESSION_KEY);
    await clearCloudToken();
    setUser(null);
  }, [user?.id]);

  const value = useMemo(
    () => ({
      authReady,
      user,
      isAuthenticated: !!user,
      signUp,
      login,
      completeSignupAndLogin,
      logout,
      updateProfile,
      changePassword,
      verifyPasswordResetIdentity,
      resetPasswordWithRecovery,
      deleteAccount,
    }),
    [
      authReady,
      user,
      signUp,
      login,
      completeSignupAndLogin,
      logout,
      updateProfile,
      changePassword,
      verifyPasswordResetIdentity,
      resetPasswordWithRecovery,
      deleteAccount,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
