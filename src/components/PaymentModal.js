import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAppTheme } from '../context/AppThemeContext';

/** Keeps one decimal point and up to 2 fraction digits; trims bogus leading zeros. */
function normalizeCashInput(text) {
  const cleaned = String(text).replace(/[^0-9.]/g, '');
  if (cleaned === '') return '';
  if (cleaned === '.') return '0.';
  const dot = cleaned.indexOf('.');
  let intPart;
  let frac = '';
  if (dot === -1) {
    intPart = cleaned;
  } else {
    intPart = cleaned.slice(0, dot);
    frac = cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  }
  intPart = intPart.replace(/^0+(?=\d)/, '');
  if (intPart === '' && (frac.length > 0 || cleaned.includes('.'))) intPart = '0';
  if (intPart === '' && !cleaned.includes('.')) {
    if (/^0+$/.test(cleaned)) return '0';
    return '';
  }
  if (cleaned.includes('.')) return `${intPart}.${frac}`;
  return intPart;
}

export default function PaymentModal({ visible, subtotal, onCancel, onConfirm }) {
  const { colors } = useAppTheme();
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (visible) {
      setAmount('');
    }
  }, [visible]);

  const displayValue = amount === '' ? '0' : amount;

  const onChangeText = (text) => {
    if (text === '') {
      setAmount('');
      return;
    }
    setAmount(normalizeCashInput(text));
  };

  const submit = () => {
    onConfirm(amount === '' ? '0' : amount);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.center}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Cash payment</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              Total due:{' '}
              <Text style={{ fontWeight: '800', color: colors.primary }}>
                ${Number(subtotal).toFixed(2)}
              </Text>
            </Text>
            <Text style={[styles.label, { color: colors.text }]}>Amount received</Text>
            <TextInput
              value={displayValue}
              onChangeText={onChangeText}
              keyboardType="decimal-pad"
              style={[
                styles.input,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.inputBg,
                  color: colors.text,
                },
              ]}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.row}>
              <Pressable
                onPress={onCancel}
                style={[styles.btn, styles.btnGhost, { borderColor: colors.border }]}>
                <Text style={[styles.btnGhostText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.primary }]}>
                <Text style={styles.btnPrimaryText}>Confirm & receipt</Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  center: {
    width: '100%',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  meta: {
    fontSize: 16,
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    minHeight: 54,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  btnGhost: {
    borderWidth: 1,
  },
  btnGhostText: {
    fontSize: 16,
    fontWeight: '700',
  },
  btnPrimary: {},
  btnPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
});
