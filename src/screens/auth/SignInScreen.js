import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../../context/AppThemeContext';
import { useAuth } from '../../context/AuthContext';

export default function SignInScreen() {
  const { colors } = useAppTheme();
  const { login, isAuthenticated, authReady, verifyPasswordResetIdentity, resetPasswordWithRecovery } = useAuth();
  const params = useLocalSearchParams();
  const [identifier, setIdentifier] = useState(String(params.identifier ?? ''));
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [recoveryName, setRecoveryName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const styles = useMemo(() => makeStyles(), []);
  if (authReady && isAuthenticated) return <Redirect href="/(tabs)" />;

  const onLogin = async () => {
    if (!identifier.trim() || !password.trim()) {
      Alert.alert('Missing details', 'Enter phone/email and password.');
      return;
    }
    setBusy(true);
    try {
      await login({ identifier, password, rememberMe: remember });
    } catch (e) {
      Alert.alert('Login failed', e?.message ?? 'Invalid credentials.');
    } finally {
      setBusy(false);
    }
  };

  const onVerifyIdentity = async () => {
    setRecoveryBusy(true);
    try {
      await verifyPasswordResetIdentity({ phone: recoveryPhone, fullName: recoveryName });
      setForgotOpen(false);
      setResetOpen(true);
    } catch (e) {
      Alert.alert('Verification failed', e?.message ?? 'Could not verify account.');
    } finally {
      setRecoveryBusy(false);
    }
  };

  const onResetPassword = async () => {
    setRecoveryBusy(true);
    try {
      await resetPasswordWithRecovery({
        phone: recoveryPhone,
        fullName: recoveryName,
        newPassword,
        confirmPassword: confirmNewPassword,
      });
      setResetOpen(false);
      setNewPassword('');
      setConfirmNewPassword('');
      Alert.alert('Success', 'You have successfully reset your password.');
    } catch (e) {
      Alert.alert('Reset failed', e?.message ?? 'Could not reset password.');
    } finally {
      setRecoveryBusy(false);
    }
  };

  return (
    <LinearGradient colors={[colors.background, colors.surface, colors.inputBg]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.brandWrap}>
                <View style={[styles.brandLogoShell, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
                  <Image source={require('../../../assets/images/tillmate.png')} style={styles.brandLogo} resizeMode="contain" />
                </View>
                <Text style={[styles.appName, { color: colors.primary }]}>TillMate</Text>
                <Text style={[styles.welcomeText, { color: colors.textMuted }]}>Smart checkout for your shop</Text>
              </View>
              <Text style={[styles.title, { color: colors.text }]}>Welcome back</Text>
              <Text style={[styles.sub, { color: colors.textMuted }]}>Login with email or phone number.</Text>
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="Email or 0771234567"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              />
              <View style={styles.passRow}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPassword}
                  style={[styles.input, styles.passInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
                </Pressable>
              </View>
              <Pressable onPress={() => setForgotOpen(true)} style={styles.forgotBtn}>
                <Text style={[styles.forgotText, { color: colors.primary }]}>Forgot password?</Text>
              </Pressable>
              <Pressable onPress={() => setRemember((v) => !v)} style={styles.rememberRow}>
                <View style={[styles.box, { borderColor: colors.border, backgroundColor: remember ? colors.primary : colors.inputBg }]}>
                  {remember ? <Text style={{ color: colors.onPrimary, fontWeight: '800' }}>✓</Text> : null}
                </View>
                <Text style={[styles.rememberText, { color: colors.text }]}>Remember me (6 hours)</Text>
              </Pressable>
              <Pressable onPress={onLogin} disabled={busy} style={[styles.btn, { backgroundColor: colors.primary }, busy && { opacity: 0.6 }]}>
                <Text style={[styles.btnText, { color: colors.onPrimary }]}>{busy ? 'Logging in...' : 'Login'}</Text>
              </Pressable>
              <Text style={[styles.footer, { color: colors.textMuted }]}>
                No account? <Link href="/sign-up" style={{ color: colors.primary, fontWeight: '800' }}>Sign up</Link>
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal visible={forgotOpen} transparent animationType="fade" onRequestClose={() => setForgotOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setForgotOpen(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Forgot password</Text>
            <TextInput
              value={recoveryPhone}
              onChangeText={setRecoveryPhone}
              placeholder="Phone number"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
            />
            <TextInput
              value={recoveryName}
              onChangeText={setRecoveryName}
              placeholder="Full name as registered"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
            />
            <Pressable onPress={onVerifyIdentity} disabled={recoveryBusy} style={[styles.btn, { backgroundColor: colors.primary }, recoveryBusy && { opacity: 0.6 }]}>
              <Text style={[styles.btnText, { color: colors.onPrimary }]}>{recoveryBusy ? 'Verifying...' : 'Verify owner'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={resetOpen} transparent animationType="fade" onRequestClose={() => setResetOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setResetOpen(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Reset password</Text>
            <View style={styles.passRow}>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showNewPassword}
                style={[styles.input, styles.passInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              />
              <Pressable onPress={() => setShowNewPassword((v) => !v)} style={styles.eyeBtn}>
                <Ionicons name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={styles.passRow}>
              <TextInput
                value={confirmNewPassword}
                onChangeText={setConfirmNewPassword}
                placeholder="Confirm password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showConfirmNewPassword}
                style={[styles.input, styles.passInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              />
              <Pressable onPress={() => setShowConfirmNewPassword((v) => !v)} style={styles.eyeBtn}>
                <Ionicons name={showConfirmNewPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <Pressable onPress={onResetPassword} disabled={recoveryBusy} style={[styles.btn, { backgroundColor: colors.primary }, recoveryBusy && { opacity: 0.6 }]}>
              <Text style={[styles.btnText, { color: colors.onPrimary }]}>{recoveryBusy ? 'Resetting...' : 'Reset password'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

function makeStyles() {
  return StyleSheet.create({
    gradient: { flex: 1 },
    safe: { flex: 1 },
    flex: { flex: 1 },
    scrollContent: { padding: 18, paddingTop: 24, paddingBottom: 28 },
    card: {
      borderRadius: 22,
      gap: 10,
      padding: 18,
      borderWidth: 1,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 12 },
      elevation: 7,
    },
    brandWrap: { alignItems: 'center', marginBottom: 4 },
    brandLogoShell: {
      width: 132,
      height: 132,
      borderRadius: 24,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
      overflow: 'hidden',
    },
    brandLogo: { width: 116, height: 116, borderRadius: 20 },
    appName: { fontSize: 24, fontWeight: '900' },
    welcomeText: { fontSize: 13, fontWeight: '600' },
    title: { fontSize: 28, fontWeight: '900' },
    sub: { fontSize: 14, marginBottom: 8 },
    input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16 },
    passRow: { position: 'relative', justifyContent: 'center' },
    passInput: { paddingRight: 46 },
    eyeBtn: { position: 'absolute', right: 12, padding: 6 },
    forgotBtn: { marginTop: -2, alignSelf: 'flex-end' },
    forgotText: { fontSize: 13, fontWeight: '700' },
    rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
    box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    rememberText: { fontSize: 15, fontWeight: '600' },
    btn: { marginTop: 10, borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
    btnText: { fontSize: 17, fontWeight: '800' },
    footer: { marginTop: 10, fontSize: 14 },
    modalOverlay: { flex: 1, justifyContent: 'center', padding: 18 },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
    modalCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
    modalTitle: { fontSize: 18, fontWeight: '900', marginBottom: 4 },
  });
}
