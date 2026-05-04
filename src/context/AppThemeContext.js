import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';

import { getPalette } from '../theme/palette';

const STORAGE_KEY = '@pos_theme_preference';

/** @typedef {'system' | 'light' | 'dark'} ThemePreference */

const ThemeContext = createContext(null);

export function AppThemeProvider({ children }) {
  const deviceScheme = useDeviceColorScheme();
  const [preference, setPreferenceState] = useState(/** @type {ThemePreference} */ ('system'));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (raw === 'light' || raw === 'dark' || raw === 'system')) {
          setPreferenceState(raw);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback(async (next) => {
    setPreferenceState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const cyclePreference = useCallback(() => {
    const order = /** @type {const} */ (['system', 'light', 'dark']);
    const i = order.indexOf(preference);
    const next = order[(i + 1) % order.length];
    setPreference(next);
  }, [preference, setPreference]);

  const resolvedScheme = useMemo(() => {
    if (preference === 'system') {
      return deviceScheme === 'dark' ? 'dark' : 'light';
    }
    return preference;
  }, [preference, deviceScheme]);

  const colors = useMemo(() => getPalette(resolvedScheme), [resolvedScheme]);

  const value = useMemo(
    () => ({
      loaded,
      preference,
      setPreference,
      cyclePreference,
      resolvedScheme,
      colors,
    }),
    [loaded, preference, setPreference, cyclePreference, resolvedScheme, colors]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }
  return ctx;
}
