import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import ScreenHeader from '../components/ScreenHeader';
import ThermalPrinterSection from '../components/ThermalPrinterSection';
import { useAppTheme } from '../context/AppThemeContext';
import { useAuth } from '../context/AuthContext';

function TabButton({ label, active, onPress, colors, ui }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        ui.tabBtn,
        {
          backgroundColor: active ? colors.primary : colors.inputBg,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}>
      <Text style={[ui.tabText, { color: active ? colors.onPrimary : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { user, updateProfile, changePassword, deleteAccount } = useAuth();
  const stylesMemo = useMemo(() => makeStyles(), []);

  const [rootTab, setRootTab] = useState('profile');
  const [changeTab, setChangeTab] = useState('general');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [streetAddress, setStreetAddress] = useState(user?.streetAddress ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [shopName, setShopName] = useState(user?.shopName ?? '');
  const [shopNumber, setShopNumber] = useState(user?.shopNumber ?? '');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhone, setDeletePhone] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const onSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const updated = await updateProfile({
        fullName,
        email,
        phone,
        streetAddress,
        city,
        shopName,
        shopNumber,
      });
      setFullName(updated.fullName);
      setEmail(updated.email);
      setPhone(updated.phone);
      setStreetAddress(updated.streetAddress);
      setCity(updated.city);
      setShopName(updated.shopName);
      setShopNumber(updated.shopNumber);
      Alert.alert('Saved', 'Profile updated successfully.');
    } catch (e) {
      Alert.alert('Could not save profile', e?.message ?? 'Try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  const onChangePassword = async () => {
    setSavingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword, confirmPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Success', 'Password changed successfully.');
    } catch (e) {
      Alert.alert('Could not change password', e?.message ?? 'Try again.');
    } finally {
      setSavingPassword(false);
    }
  };

  const onDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await deleteAccount({ phone: deletePhone, password: deletePassword });
      setDeleteOpen(false);
      setDeletePhone('');
      setDeletePassword('');
      Alert.alert('Account deleted', 'Your account and all your data were deleted.');
    } catch (e) {
      Alert.alert('Delete failed', e?.message ?? 'Could not delete account.');
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <SafeAreaView style={[stylesMemo.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Profile" subtitle="Manage your account settings" />
      <KeyboardAvoidingView
        style={stylesMemo.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 72 : 0}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={stylesMemo.content}>
        <View style={stylesMemo.tabsRow}>
          <TabButton label="Profile" active={rootTab === 'profile'} onPress={() => setRootTab('profile')} colors={colors} ui={stylesMemo} />
          <TabButton label="Edit profile" active={rootTab === 'change'} onPress={() => setRootTab('change')} colors={colors} ui={stylesMemo} />
          {/* <TabButton label="Printer" active={rootTab === 'printer'} onPress={() => setRootTab('printer')} colors={colors} ui={stylesMemo} /> */}
        </View>

        {rootTab === 'profile' ? (
          <View style={[stylesMemo.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[stylesMemo.sectionTitle, { color: colors.text }]}>Profile details</Text>
            <View style={[stylesMemo.readOnlyCard, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <Text style={[stylesMemo.readOnlyLabel, { color: colors.textMuted }]}>Full name</Text>
              <Text style={[stylesMemo.readOnlyValue, { color: colors.text }]}>{fullName || '—'}</Text>
            </View>

            <View style={[stylesMemo.readOnlyCard, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <Text style={[stylesMemo.readOnlyLabel, { color: colors.textMuted }]}>Email</Text>
              <Text style={[stylesMemo.readOnlyValue, { color: colors.text }]}>{email || '—'}</Text>
            </View>

            <View style={[stylesMemo.readOnlyCard, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <Text style={[stylesMemo.readOnlyLabel, { color: colors.textMuted }]}>Phone</Text>
              <Text style={[stylesMemo.readOnlyValue, { color: colors.text }]}>{phone || '—'}</Text>
            </View>

            <View style={[stylesMemo.readOnlyCard, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <Text style={[stylesMemo.readOnlyLabel, { color: colors.textMuted }]}>Street address</Text>
              <Text style={[stylesMemo.readOnlyValue, { color: colors.text }]}>{streetAddress || '—'}</Text>
            </View>

            <View style={[stylesMemo.readOnlyCard, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <Text style={[stylesMemo.readOnlyLabel, { color: colors.textMuted }]}>City</Text>
              <Text style={[stylesMemo.readOnlyValue, { color: colors.text }]}>{city || '—'}</Text>
            </View>

            <View style={[stylesMemo.readOnlyCard, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <Text style={[stylesMemo.readOnlyLabel, { color: colors.textMuted }]}>Shop name</Text>
              <Text style={[stylesMemo.readOnlyValue, { color: colors.text }]}>{shopName || '—'}</Text>
            </View>

            <View style={[stylesMemo.readOnlyCard, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <Text style={[stylesMemo.readOnlyLabel, { color: colors.textMuted }]}>Shop number</Text>
              <Text style={[stylesMemo.readOnlyValue, { color: colors.text }]}>{shopNumber || '—'}</Text>
            </View>
          </View>
        ) : rootTab === 'change' ? (
          <View style={[stylesMemo.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <View style={stylesMemo.tabsRow}>
              <TabButton label="General info" active={changeTab === 'general'} onPress={() => setChangeTab('general')} colors={colors} ui={stylesMemo} />
              <TabButton label="Password" active={changeTab === 'password'} onPress={() => setChangeTab('password')} colors={colors} ui={stylesMemo} />
            </View>

            {changeTab === 'general' ? (
              <>
                <Text style={[stylesMemo.sectionTitle, { color: colors.text }]}>Change general info</Text>
                <Text style={[stylesMemo.label, { color: colors.text }]}>Full name</Text>
                <TextInput value={fullName} onChangeText={setFullName} style={[stylesMemo.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]} />
                <Text style={[stylesMemo.label, { color: colors.text }]}>Email (optional)</Text>
                <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={[stylesMemo.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]} />
                <Text style={[stylesMemo.label, { color: colors.text }]}>Phone</Text>
                <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={[stylesMemo.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]} />

                <Text style={[stylesMemo.label, { color: colors.text }]}>Street address</Text>
                <TextInput value={streetAddress} onChangeText={setStreetAddress} style={[stylesMemo.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]} />

                <Text style={[stylesMemo.label, { color: colors.text }]}>City</Text>
                <TextInput value={city} onChangeText={setCity} style={[stylesMemo.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]} />

                <Text style={[stylesMemo.label, { color: colors.text }]}>Shop name</Text>
                <TextInput value={shopName} onChangeText={setShopName} style={[stylesMemo.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]} />

                <Text style={[stylesMemo.label, { color: colors.text }]}>Shop number</Text>
                <TextInput value={shopNumber} onChangeText={setShopNumber} style={[stylesMemo.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]} />
                <Pressable onPress={onSaveProfile} disabled={savingProfile} style={[stylesMemo.primaryBtn, { backgroundColor: colors.primary }, savingProfile && { opacity: 0.7 }]}>
                  <Text style={[stylesMemo.primaryBtnText, { color: colors.onPrimary }]}>{savingProfile ? 'Saving...' : 'Save general info'}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[stylesMemo.sectionTitle, { color: colors.text }]}>Change password</Text>
                <Text style={[stylesMemo.label, { color: colors.text }]}>Current password</Text>
                <View style={stylesMemo.passRow}>
                  <TextInput
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry={!showCurrentPassword}
                    style={[stylesMemo.input, stylesMemo.passInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
                  />
                  <Pressable onPress={() => setShowCurrentPassword((v) => !v)} style={stylesMemo.eyeBtn}>
                    <Ionicons name={showCurrentPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
                <Text style={[stylesMemo.label, { color: colors.text }]}>New password</Text>
                <View style={stylesMemo.passRow}>
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNewPassword}
                    style={[stylesMemo.input, stylesMemo.passInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
                  />
                  <Pressable onPress={() => setShowNewPassword((v) => !v)} style={stylesMemo.eyeBtn}>
                    <Ionicons name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
                <Text style={[stylesMemo.label, { color: colors.text }]}>Confirm new password</Text>
                <View style={stylesMemo.passRow}>
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    style={[stylesMemo.input, stylesMemo.passInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
                  />
                  <Pressable onPress={() => setShowConfirmPassword((v) => !v)} style={stylesMemo.eyeBtn}>
                    <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
                <Pressable onPress={onChangePassword} disabled={savingPassword} style={[stylesMemo.primaryBtn, { backgroundColor: colors.primary }, savingPassword && { opacity: 0.7 }]}>
                  <Text style={[stylesMemo.primaryBtnText, { color: colors.onPrimary }]}>{savingPassword ? 'Updating...' : 'Update password'}</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      'Delete account?',
                      'This permanently deletes your account and all data. This cannot be undone.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Continue', style: 'destructive', onPress: () => setDeleteOpen(true) },
                      ]
                    )
                  }
                  style={[stylesMemo.dangerBtn, { borderColor: colors.danger ?? '#b42318' }]}>
                  <Text style={[stylesMemo.dangerBtnText, { color: colors.danger ?? '#b42318' }]}>Delete Account</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : (
          <ThermalPrinterSection colors={colors} />
        )}
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <View style={stylesMemo.modalOverlay}>
          <Pressable style={stylesMemo.modalBackdrop} onPress={() => setDeleteOpen(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={stylesMemo.modalKb}>
            <Pressable onPress={(e) => e.stopPropagation()} style={stylesMemo.modalPressableInner}>
              <View style={[stylesMemo.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[stylesMemo.modalTitle, { color: colors.text }]}>Confirm account deletion</Text>
                <Text style={[stylesMemo.readOnlyLabel, { color: colors.textMuted }]}>
                  Enter your phone number and password to confirm owner access.
                </Text>
                <TextInput
                  value={deletePhone}
                  onChangeText={setDeletePhone}
                  keyboardType="phone-pad"
                  placeholder="Phone number"
                  placeholderTextColor={colors.textMuted}
                  style={[stylesMemo.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
                />
                <TextInput
                  value={deletePassword}
                  onChangeText={setDeletePassword}
                  placeholder="Password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  style={[stylesMemo.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
                />
                <View style={stylesMemo.modalActions}>
                  <Pressable onPress={() => setDeleteOpen(false)} style={[stylesMemo.modalGhost, { borderColor: colors.border }]}>
                    <Text style={[stylesMemo.modalGhostTxt, { color: colors.text }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={onDeleteAccount}
                    disabled={deletingAccount}
                    style={[stylesMemo.modalSave, { backgroundColor: colors.danger ?? '#b42318' }, deletingAccount && { opacity: 0.7 }]}>
                    <Text style={[stylesMemo.modalSaveTxt, { color: colors.onPrimary }]}>
                      {deletingAccount ? 'Deleting...' : 'Delete'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles() {
  return StyleSheet.create({
    safe: { flex: 1 },
    flex1: { flex: 1 },
    content: { padding: 18, gap: 12, paddingBottom: 28 },
    panel: { borderWidth: 1, borderRadius: 14, padding: 14 },
    tabsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    tabBtn: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 10, minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    tabText: { fontSize: 14, fontWeight: '800' },
    sectionTitle: { fontSize: 20, fontWeight: '900', marginBottom: 8 },
    label: { fontSize: 14, fontWeight: '700', marginTop: 8, marginBottom: 6 },
    input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
    passRow: { position: 'relative', justifyContent: 'center' },
    passInput: { paddingRight: 46 },
    eyeBtn: { position: 'absolute', right: 12, padding: 6 },
    readOnlyCard: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 8 },
    readOnlyLabel: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
    readOnlyValue: { fontSize: 16, fontWeight: '600' },
    primaryBtn: { marginTop: 14, borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
    primaryBtnText: { fontSize: 16, fontWeight: '800' },
    dangerBtn: {
      marginTop: 12,
      borderRadius: 12,
      minHeight: 48,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dangerBtnText: { fontSize: 15, fontWeight: '900' },
    modalOverlay: {
      flex: 1,
      justifyContent: 'center',
      padding: 18,
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    modalKb: {
      flex: 1,
      width: '100%',
      justifyContent: 'center',
    },
    modalPressableInner: {
      width: '100%',
      maxHeight: '100%',
    },
    modalCard: {
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      gap: 8,
      width: '100%',
      maxHeight: '92%',
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '900',
      marginBottom: 2,
    },
    modalActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 6,
    },
    modalGhost: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 10,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalGhostTxt: { fontSize: 14, fontWeight: '700' },
    modalSave: {
      flex: 1,
      borderRadius: 10,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalSaveTxt: { fontSize: 14, fontWeight: '800' },
  });
}
