import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { AppThemeProvider, useAppTheme } from '../src/context/AppThemeContext';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { CartProvider } from '../src/context/CartContext';

export const unstable_settings = {
  /** Start at sign-in so we never mount (tabs) with a null user (avoids redirect loop on Android). */
  anchor: 'sign-in',
};

function RootNavigation() {
  const { resolvedScheme, colors } = useAppTheme();
  const { authReady } = useAuth();
  const base = resolvedScheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.primary,
    },
  };

  return (
    <ThemeProvider value={theme}>
      {!authReady ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <Stack>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="sign-up" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      )}
      <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AuthProvider>
        <CartProvider>
          <RootNavigation />
        </CartProvider>
      </AuthProvider>
    </AppThemeProvider>
  );
}
