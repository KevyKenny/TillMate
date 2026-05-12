import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '../components/ScreenHeader';
import { useAppTheme } from '../context/AppThemeContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import * as productService from '../services/productService';

export default function AddProductScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const { notifyDataChanged } = useCart();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [stock, setStock] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!user?.id) {
      Alert.alert('Session expired', 'Please login again.');
      return;
    }
    const p = parseFloat(price);
    const s = parseInt(String(stock).trim(), 10);
    if (!name.trim()) {
      Alert.alert('Missing name', 'Enter a product name.');
      return;
    }
    if (Number.isNaN(p) || p < 0) {
      Alert.alert('Invalid price', 'Enter a valid selling price (0 or more).');
      return;
    }
    if (String(stock).trim() === '' || Number.isNaN(s) || s < 0) {
      Alert.alert('Invalid stock', 'Enter a whole number for starting stock (0 or more).');
      return;
    }
    const costRaw = String(costPrice).trim();
    const costVal =
      costRaw === '' ? null : parseFloat(costRaw.replace(',', '.'));
    if (costVal === null || Number.isNaN(costVal) || costVal < 0) {
      Alert.alert('Invalid cost', 'Enter a valid non-negative cost price.');
      return;
    }
    setSaving(true);
    try {
      await productService.addProduct({
        userId: user?.id,
        name: name.trim(),
        price: p,
        stock: s,
        category: category.trim() || 'General',
        costPrice: costVal,
      });
      setName('');
      setCategory('General');
      setPrice('');
      setCostPrice('');
      setStock('');
      await notifyDataChanged();
      Alert.alert('Saved', 'Product added to stock.');
    } catch (e) {
      if (Platform.OS === 'android' && String(e?.message || '').startsWith('Insufficient capital')) {
        ToastAndroid.show(e.message, ToastAndroid.LONG);
      } else {
        Alert.alert('Error', e?.message ?? 'Could not save product.');
      }
    } finally {
      setSaving(false);
    }
  };

  const styles = useMemo(() => makeStyles(), []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Add product" subtitle="Selling price, category, and cost required." />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { color: colors.text }]}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Lifebouy"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: colors.inputBg,
                color: colors.text,
              },
            ]}
            autoCapitalize="sentences"
            returnKeyType="next"
          />
          <Text style={[styles.label, { color: colors.text }]}>Category</Text>
          <TextInput
            value={category}
            onChangeText={setCategory}
            placeholder="e.g. Soap"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: colors.inputBg,
                color: colors.text,
              },
            ]}
            autoCapitalize="sentences"
          />
          <Text style={[styles.label, { color: colors.text }]}>Selling price ($)</Text>
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: colors.inputBg,
                color: colors.text,
              },
            ]}
            keyboardType="decimal-pad"
          />
          <Text style={[styles.label, { color: colors.text }]}>Cost price ($)</Text>
          <TextInput
            value={costPrice}
            onChangeText={setCostPrice}
            placeholder="(Total Cost price / Quantity)"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: colors.inputBg,
                color: colors.text,
              },
            ]}
            keyboardType="decimal-pad"
          />
          <Text style={[styles.label, { color: colors.text }]}>Starting stock</Text>
          <TextInput
            value={stock}
            onChangeText={setStock}
            placeholder="Enter quantity (whole number)"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: colors.inputBg,
                color: colors.text,
              },
            ]}
            keyboardType="number-pad"
          />
          <Pressable
            onPress={save}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: colors.primary },
              saving && { opacity: 0.55 },
              pressed && !saving && { opacity: 0.9 },
            ]}>
            <Text style={[styles.saveText, { color: colors.onPrimary }]}>
              {saving ? 'Saving…' : 'Save product'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles() {
  return StyleSheet.create({
    safe: { flex: 1 },
    flex: { flex: 1 },
    form: {
      paddingTop: 12,
      paddingHorizontal: 20,
      gap: 6,
      paddingBottom: 32,
    },
    label: {
      fontSize: 16,
      fontWeight: '600',
      marginTop: 8,
    },
    hint: {
      fontSize: 14,
      marginTop: 2,
      marginBottom: 4,
      lineHeight: 20,
    },
    input: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
      fontSize: 18,
      minHeight: 56,
    },
    saveBtn: {
      marginTop: 24,
      paddingVertical: 18,
      borderRadius: 14,
      alignItems: 'center',
      minHeight: 58,
      justifyContent: 'center',
    },
    saveText: {
      fontSize: 18,
      fontWeight: '700',
    },
  });
}
