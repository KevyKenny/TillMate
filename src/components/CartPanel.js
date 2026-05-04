import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/AppThemeContext';

export default function CartPanel({
  cart,
  subtotal,
  onIncrement,
  onDecrement,
  onRemove,
  onClear,
  onCheckout,
}) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.panel, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>Cart</Text>
        {cart.length > 0 && (
          <Pressable onPress={onClear} style={styles.clearBtn}>
            <Text style={[styles.clearText, { color: colors.textMuted }]}>Clear</Text>
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {!cart.length ? (
          <Text style={[styles.hint, { color: colors.textMuted }]}>Tap products to add them here.</Text>
        ) : (
          cart.map((line) => (
            <View
              key={line.productId}
              style={[styles.line, { borderBottomColor: colors.borderLight }]}>
              <View style={styles.lineInfo}>
                <Text style={[styles.lineName, { color: colors.text }]} numberOfLines={2}>
                  {line.name}
                </Text>
                <Text style={[styles.lineMeta, { color: colors.textMuted }]}>
                  ${Number(line.price).toFixed(2)} × {line.quantity}
                </Text>
              </View>
              <View style={styles.qtyRow}>
                <Pressable
                  onPress={() => onDecrement(line.productId)}
                  style={[styles.roundBtn, { backgroundColor: colors.primary }]}
                  accessibilityLabel="Decrease quantity">
                  <Text style={[styles.roundBtnText, { color: colors.onPrimary }]}>−</Text>
                </Pressable>
                <Text style={[styles.qty, { color: colors.text }]}>{line.quantity}</Text>
                <Pressable
                  onPress={() => onIncrement(line.productId)}
                  style={[
                    styles.roundBtn,
                    { backgroundColor: colors.primary },
                    line.quantity >= line.maxStock && styles.roundBtnDisabled,
                  ]}
                  disabled={line.quantity >= line.maxStock}
                  accessibilityLabel="Increase quantity">
                  <Text style={[styles.roundBtnText, { color: colors.onPrimary }]}>+</Text>
                </Pressable>
                <Pressable onPress={() => onRemove(line.productId)} style={styles.removeBtn}>
                  <Text style={[styles.removeText, { color: colors.danger }]}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: colors.text }]}>Total</Text>
          <Text style={[styles.totalValue, { color: colors.primary }]}>
            ${Number(subtotal).toFixed(2)}
          </Text>
        </View>
        <Pressable
          onPress={onCheckout}
          disabled={!cart.length}
          style={({ pressed }) => [
            styles.checkout,
            { backgroundColor: cart.length ? colors.primary : colors.border },
            pressed && cart.length > 0 && styles.checkoutPressed,
          ]}>
          <Text
            style={[
              styles.checkoutText,
              { color: cart.length ? colors.onPrimary : colors.textMuted },
            ]}>
            Complete sale
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderTopWidth: 2,
    maxHeight: '46%',
    minHeight: 220,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  clearBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  clearText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  hint: {
    fontSize: 15,
    padding: 16,
    textAlign: 'center',
  },
  line: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  lineInfo: {
    marginBottom: 8,
  },
  lineName: {
    fontSize: 16,
    fontWeight: '600',
  },
  lineMeta: {
    fontSize: 14,
    marginTop: 4,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  roundBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBtnDisabled: {
    opacity: 0.35,
  },
  roundBtnText: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: -2,
  },
  qty: {
    fontSize: 18,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'center',
  },
  removeBtn: {
    marginLeft: 'auto',
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  removeText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  checkout: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  checkoutPressed: {
    opacity: 0.88,
  },
  checkoutText: {
    fontSize: 18,
    fontWeight: '700',
  },
});
