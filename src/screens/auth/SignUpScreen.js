import { Link, Redirect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../context/AppThemeContext';

export default function SignUpScreen() {
  const { colors } = useAppTheme();
  const { signUp, isAuthenticated, authReady } = useAuth();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopNumber, setShopNumber] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const styles = useMemo(() => makeStyles(), []);
  if (authReady && isAuthenticated) return <Redirect href="/(tabs)" />;

  const nextStep = () => {
    if (!phone.trim() || !password.trim() || !confirmPassword.trim()) {
      Alert.alert('Missing details', 'Phone, password, and confirm password are required.');
      return;
    }
    setStep(2);
  };

  const onSignUp = async () => {
    if (!fullName.trim() || !streetAddress.trim() || !city.trim()) {
      Alert.alert('Missing details', 'Full name, street address, and city are required.');
      return;
    }
    if (!agreeTerms) {
      Alert.alert('Terms required', 'Please accept TillMate terms and services to continue.');
      return;
    }
    setBusy(true);
    try {
      await signUp({
        email,
        phone,
        password,
        confirmPassword,
        fullName,
        streetAddress,
        city,
        shopName,
        shopNumber,
      });
      router.replace({ pathname: '/sign-in', params: { identifier: phone } });
    } catch (e) {
      Alert.alert('Sign up failed', e?.message ?? 'Could not create account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient
      colors={[colors.background, colors.surface, colors.inputBg]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive">
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.brandWrap}>
            <View style={[styles.brandLogoShell, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <Image source={require('../../../assets/images/tillmate.png')} style={styles.brandLogo} resizeMode="contain" />
            </View>
            <Text style={[styles.appName, { color: colors.primary }]}>TillMate</Text>
            <Text style={[styles.welcomeText, { color: colors.textMuted }]}>
              Welcome to TillMate - create your account
            </Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Create account</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            Step {step} of 2
          </Text>
          {step === 1 ? (
            <>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email (optional)"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              />
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone e.g. 0771234567"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
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
              <View style={styles.passRow}>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showConfirmPassword}
                  style={[styles.input, styles.passInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
                />
                <Pressable onPress={() => setShowConfirmPassword((v) => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
                </Pressable>
              </View>
              <Pressable onPress={nextStep} style={[styles.btn, { backgroundColor: colors.primary }]}>
                <Text style={[styles.btnText, { color: colors.onPrimary }]}>Continue</Text>
              </Pressable>
            </>
          ) : (
            <>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Full name"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              />
              <TextInput
                value={streetAddress}
                onChangeText={setStreetAddress}
                placeholder="Street address e.g. 12 George Ave"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              />
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder="City e.g. Chegutu"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              />
              <TextInput
                value={shopName}
                onChangeText={setShopName}
                placeholder="Shop name (optional)"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              />
              <TextInput
                value={shopNumber}
                onChangeText={setShopNumber}
                placeholder="Shop number e.g. Shop 2 (optional)"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              />
              <Pressable onPress={() => setAgreeTerms((v) => !v)} style={styles.termsRow}>
                <View style={[styles.box, { borderColor: colors.border, backgroundColor: agreeTerms ? colors.primary : colors.inputBg }]}>
                  {agreeTerms ? <Text style={{ color: colors.onPrimary, fontWeight: '800' }}>✓</Text> : null}
                </View>
                <Text style={[styles.termsText, { color: colors.textMuted }]}>
                  On finishing signing up you agree to the terms and services of TillMate.
                </Text>
              </Pressable>
              <View style={styles.row}>
                <Pressable onPress={() => setStep(1)} style={[styles.btnGhost, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>Back</Text>
                </Pressable>
                <Pressable onPress={onSignUp} disabled={busy} style={[styles.btnFlex, { backgroundColor: colors.primary }, busy && { opacity: 0.6 }]}>
                  <Text style={[styles.btnText, { color: colors.onPrimary }]}>{busy ? 'Creating...' : 'Finish sign up'}</Text>
                </Pressable>
              </View>
            </>
          )}
          <Text style={[styles.footer, { color: colors.textMuted }]}>
            Have an account? <Link href="/sign-in" style={{ color: colors.primary, fontWeight: '800' }}>Login</Link>
          </Text>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
      gap: 10,
      borderRadius: 22,
      padding: 18,
      borderWidth: 1,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 12 },
      elevation: 7,
    },
    brandWrap: { alignItems: 'center', marginBottom: 2 },
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
    termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 },
    box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    termsText: { flex: 1, fontSize: 13, lineHeight: 19 },
    btn: { marginTop: 10, borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
    btnText: { fontSize: 17, fontWeight: '800' },
    row: { marginTop: 10, flexDirection: 'row', gap: 10 },
    btnGhost: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    btnFlex: { flex: 2, minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    footer: { marginTop: 10, fontSize: 14 },
  });
}
