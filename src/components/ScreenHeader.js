import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/AppThemeContext';

function initialsFromName(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0];
    const b = parts[parts.length - 1][0];
    return `${a}${b}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length === 1) {
    return parts[0].toUpperCase();
  }
  return '?';
}

export default function ScreenHeader({ title, subtitle, rightSlot }) {
  const { colors, preference, cyclePreference } = useAppTheme();
  const { isAuthenticated, user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const avatarRef = useRef(null);

  const themeIcon =
    preference === 'dark' ? 'moon' : preference === 'light' ? 'sunny' : 'phone-portrait-outline';

  const openMenu = useCallback(() => {
    avatarRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setMenuOpen(true);
    });
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const onThemeInMenu = useCallback(() => {
    cyclePreference();
  }, [cyclePreference]);

  const themeLabel =
    preference === 'dark' ? 'Dark' : preference === 'light' ? 'Light' : 'System';

  const onLogoutInMenu = useCallback(() => {
    closeMenu();
    logout();
  }, [closeMenu, logout]);

  const windowW = Dimensions.get('window').width;
  const menuWidth = Math.min(208, windowW - 24);
  const menuLeft = Math.max(12, anchor.x + anchor.width - menuWidth);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.sub, { color: colors.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>

      {rightSlot ? <View style={styles.rightSlotWrap}>{rightSlot}</View> : null}

      {isAuthenticated && user ? (
        <>
          <Pressable
            ref={avatarRef}
            onPress={openMenu}
            style={({ pressed }) => [
              styles.avatar,
              { backgroundColor: colors.primary, borderColor: colors.primaryMuted },
              pressed && { opacity: 0.88 },
            ]}
            accessibilityLabel="Account menu"
            hitSlop={6}>
            <Text style={[styles.avatarText, { color: colors.onPrimary }]}>
              {initialsFromName(user.fullName)}
            </Text>
          </Pressable>

          <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={closeMenu}>
            <Pressable style={styles.backdrop} onPress={closeMenu} accessibilityLabel="Close menu" />
            <View
              pointerEvents="box-none"
              style={[
                styles.menuSheet,
                {
                  top: anchor.y + anchor.height + 6,
                  left: menuLeft,
                  width: menuWidth,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}>
              <Pressable
                onPress={onThemeInMenu}
                style={({ pressed }) => [
                  styles.menuItem,
                  { backgroundColor: colors.inputBg, borderColor: colors.border },
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityLabel="Cycle color theme">
                <Ionicons name={themeIcon} size={20} color={colors.primary} />
                <Text style={[styles.menuItemText, { color: colors.text }]} numberOfLines={1}>
                  {themeLabel}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  closeMenu();
                  router.push('/(tabs)/profile');
                }}
                style={({ pressed }) => [
                  styles.menuItem,
                  { backgroundColor: colors.inputBg, borderColor: colors.border },
                  pressed && { opacity: 0.85 },
                ]}>
                <Ionicons name="person-circle-outline" size={20} color={colors.primary} />
                <Text style={[styles.menuItemText, { color: colors.text }]} numberOfLines={1}>
                  My Profile
                </Text>
              </Pressable>

              <Pressable
                onPress={onLogoutInMenu}
                style={({ pressed }) => [
                  styles.menuItem,
                  { backgroundColor: colors.inputBg, borderColor: colors.border },
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityLabel="Log out">
                <Ionicons name="log-out-outline" size={20} color={colors.danger} />
                <Text style={[styles.menuItemText, { color: colors.danger }]} numberOfLines={1}>
                  Logout
                </Text>
              </Pressable>
            </View>
          </Modal>
        </>
      ) : (
        <Pressable
          onPress={() => cyclePreference()}
          style={({ pressed }) => [
            styles.avatar,
            styles.themeOnly,
            { backgroundColor: colors.inputBg, borderColor: colors.border },
            pressed && { opacity: 0.85 },
          ]}
          accessibilityLabel="Cycle color theme: system, light, dark">
          <Ionicons name={themeIcon} size={22} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  textBlock: {
    flex: 1,
    paddingRight: 12,
  },
  rightSlotWrap: {
    justifyContent: 'center',
    marginRight: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  sub: {
    fontSize: 15,
    marginTop: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeOnly: {
    borderRadius: 12,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  menuSheet: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 1,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  menuItem: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
});
