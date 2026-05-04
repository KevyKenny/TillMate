import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../src/context/AuthContext';
import { useAppTheme } from '../../src/context/AppThemeContext';

export default function TabLayout() {
  const { colors } = useAppTheme();
  const { isAuthenticated, authReady } = useAuth();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);
  if (authReady && !isAuthenticated) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        headerShown: false,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: {
          paddingTop: 4,
          paddingBottom: bottomPad,
          height: 54 + bottomPad,
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Sales',
          tabBarIcon: ({ color, size }) => <Ionicons name="cart" color={color} size={size ?? 24} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Stock',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube-outline" color={color} size={size ?? 24} />
          ),
        }}
      />
      <Tabs.Screen
        name="add-product"
        options={{
          title: 'Add',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" color={color} size={size ?? 24} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" color={color} size={size ?? 24} />
          ),
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: 'Finance',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" color={color} size={size ?? 24} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
