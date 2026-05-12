import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  FlatList,
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

function todayYmd() {
  return new Date().toLocaleDateString('en-CA');
}

function FieldLabel({ children, colors }) {
  return <Text style={[styles.label, { color: colors.textMuted }]}>{children}</Text>;
}

export function ExpenseModal({ visible, onClose, colors, onSave, busy }) {
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [dateStr, setDateStr] = useState(todayYmd());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (visible) {
      setAmount('');
      setPurpose('');
      setDateStr(todayYmd());
      setNotes('');
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Add expense</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
            <FieldLabel colors={colors}>Amount *</FieldLabel>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <FieldLabel colors={colors}>Purpose *</FieldLabel>
            <TextInput
              value={purpose}
              onChangeText={setPurpose}
              placeholder="e.g. transport, rent, airtime"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <FieldLabel colors={colors}>Date (YYYY-MM-DD) *</FieldLabel>
            <TextInput
              value={dateStr}
              onChangeText={setDateStr}
              placeholder="2026-04-25"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <FieldLabel colors={colors}>Notes (optional)</FieldLabel>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Extra detail"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.input, styles.tallInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <Pressable
              onPress={() => onSave({ amount, purpose, occurredOn: dateStr, notes })}
              disabled={busy}
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
              <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Save expense</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function WithdrawalModal({ visible, onClose, colors, onSave, busy }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [dateStr, setDateStr] = useState(todayYmd());
  const [withdrawnBy, setWithdrawnBy] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (visible) {
      setAmount('');
      setReason('');
      setDateStr(todayYmd());
      setWithdrawnBy('');
      setNotes('');
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Record withdrawal</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
            <FieldLabel colors={colors}>Amount *</FieldLabel>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <FieldLabel colors={colors}>Reason *</FieldLabel>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. supplier, owner use"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <FieldLabel colors={colors}>Date (YYYY-MM-DD) *</FieldLabel>
            <TextInput
              value={dateStr}
              onChangeText={setDateStr}
              placeholder="2026-04-25"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <FieldLabel colors={colors}>Withdrawn by (optional)</FieldLabel>
            <TextInput
              value={withdrawnBy}
              onChangeText={setWithdrawnBy}
              placeholder="Name or role"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <FieldLabel colors={colors}>Notes (optional)</FieldLabel>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              style={[styles.input, styles.tallInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <Pressable
              onPress={() => onSave({ amount, reason, occurredOn: dateStr, withdrawnBy, notes })}
              disabled={busy}
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
              <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Save withdrawal</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function CapitalModal({ visible, onClose, colors, onSave, busy }) {
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [dateStr, setDateStr] = useState(todayYmd());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (visible) {
      setAmount('');
      setSource('');
      setDateStr(todayYmd());
      setNotes('');
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Add capital</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
            <FieldLabel colors={colors}>Amount *</FieldLabel>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <FieldLabel colors={colors}>Source *</FieldLabel>
            <TextInput
              value={source}
              onChangeText={setSource}
              placeholder="e.g. owner top-up, initial capital"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <FieldLabel colors={colors}>Date (YYYY-MM-DD) *</FieldLabel>
            <TextInput
              value={dateStr}
              onChangeText={setDateStr}
              placeholder="2026-04-25"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <FieldLabel colors={colors}>Note (optional)</FieldLabel>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              style={[styles.input, styles.tallInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <Pressable
              onPress={() => onSave({ amount, source, occurredOn: dateStr, notes })}
              disabled={busy}
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
              <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Save capital</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function CapitalAdjustmentModal({ visible, onClose, colors, onSave, busy }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [dateStr, setDateStr] = useState(todayYmd());
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState('add');

  useEffect(() => {
    if (visible) {
      setAmount('');
      setReason('');
      setDateStr(todayYmd());
      setNotes('');
      setMode('add');
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Adjust available capital</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
            <FieldLabel colors={colors}>Action *</FieldLabel>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setMode('add')}
                style={[
                  styles.primaryBtn,
                  { flex: 1, minHeight: 42, marginTop: 0, backgroundColor: mode === 'add' ? colors.primary : colors.inputBg },
                ]}>
                <Text style={[styles.primaryBtnText, { color: mode === 'add' ? colors.onPrimary : colors.text }]}>Add</Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('subtract')}
                style={[
                  styles.primaryBtn,
                  { flex: 1, minHeight: 42, marginTop: 0, backgroundColor: mode === 'subtract' ? colors.primary : colors.inputBg },
                ]}>
                <Text style={[styles.primaryBtnText, { color: mode === 'subtract' ? colors.onPrimary : colors.text }]}>Subtract</Text>
              </Pressable>
            </View>
            <FieldLabel colors={colors}>Amount *</FieldLabel>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <FieldLabel colors={colors}>Reason *</FieldLabel>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Why this adjustment?"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <FieldLabel colors={colors}>Date (YYYY-MM-DD) *</FieldLabel>
            <TextInput
              value={dateStr}
              onChangeText={setDateStr}
              placeholder="2026-04-25"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <FieldLabel colors={colors}>Note (optional)</FieldLabel>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              style={[styles.input, styles.tallInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <Pressable
              onPress={() => onSave({ amount, mode, reason, occurredOn: dateStr, notes })}
              disabled={busy}
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
              <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Save adjustment</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function BreakageModal({ visible, onClose, colors, onSave, busy, products }) {
  const [productId, setProductId] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [dateStr, setDateStr] = useState(todayYmd());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (visible) {
      setProductId(null);
      setQuantity('1');
      setReason('');
      setDateStr(todayYmd());
      setNotes('');
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlayCol}>
        <View style={[styles.breakageSheet, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Record breakage</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Select a product. Stock will be reduced and the loss value recorded in your ledger.
          </Text>
          <FlatList
            data={products}
            keyExtractor={(item) => String(item.id)}
            style={styles.productPickList}
            ListEmptyComponent={<Text style={{ color: colors.textMuted, padding: 12 }}>No products in stock.</Text>}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setProductId(item.id)}
                style={[
                  styles.productRow,
                  {
                    borderColor: productId === item.id ? colors.primary : colors.border,
                    backgroundColor: productId === item.id ? colors.inputBg : 'transparent',
                  },
                ]}>
                <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Stock: {item.stock}</Text>
              </Pressable>
            )}
          />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formTight}>
            <FieldLabel colors={colors}>Quantity *</FieldLabel>
            <TextInput
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <FieldLabel colors={colors}>Reason *</FieldLabel>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. damaged, expired"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <FieldLabel colors={colors}>Date (YYYY-MM-DD) *</FieldLabel>
            <TextInput
              value={dateStr}
              onChangeText={setDateStr}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <FieldLabel colors={colors}>Notes (optional)</FieldLabel>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              style={[styles.input, styles.tallInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <Pressable
              onPress={() => onSave({ productId, quantity, reason, occurredOn: dateStr, notes })}
              disabled={busy}
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
              <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Save & deduct stock</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 12 },
  overlayCol: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', paddingTop: 40 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: {
    borderRadius: 16,
    maxHeight: '88%',
    paddingBottom: 20,
    overflow: 'hidden',
  },
  breakageSheet: { flex: 1, marginTop: 8, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sheetTitle: { fontSize: 18, fontWeight: '900' },
  form: { padding: 4, paddingBottom: 32 },
  formTight: { paddingBottom: 32 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
  },
  tallInput: { minHeight: 72, textAlignVertical: 'top' },
  primaryBtn: { borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryBtnText: { fontSize: 16, fontWeight: '800' },
  hint: { fontSize: 13, marginBottom: 8, lineHeight: 18 },
  productPickList: { maxHeight: 160, marginBottom: 8 },
  productRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
