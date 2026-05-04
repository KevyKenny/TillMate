import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../context/AppThemeContext';

export default function CheckoutReviewModal({
  visible,
  cart,
  subtotal,
  onClose,
  onIncrement,
  onDecrement,
  onRemove,
  onClear,
  onContinue,
}) {
  const { colors } = useAppTheme();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <Pressable onPress={onClose} style={styles.topBtn} hitSlop={8}>
            <Text style={[styles.topBtnText, { color: colors.primary }]}>Back</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Review cart</Text>
          <View style={styles.topBtn} />
        </View>

        <FlatList
          style={styles.flex}
          data={cart}
          keyExtractor={(item) => String(item.productId)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <Text style={[styles.sub, { color: colors.textMuted }]}>
                Check quantities before taking payment. Scroll to see all lines.
              </Text>
              {cart.length > 0 ? (
                <Pressable onPress={onClear} style={styles.clearLink}>
                  <Text style={[styles.clearLinkText, { color: colors.danger }]}>Clear cart</Text>
                </Pressable>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.line, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.lineName, { color: colors.text }]} numberOfLines={3}>
                {item.name}
              </Text>
              <View style={styles.lineRow}>
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  ${Number(item.price).toFixed(2)} each
                </Text>
                <View style={styles.qty}>
                  <Pressable
                    onPress={() => onDecrement(item.productId)}
                    style={[styles.round, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.roundTxt, { color: colors.onPrimary }]}>−</Text>
                  </Pressable>
                  <Text style={[styles.qtyNum, { color: colors.text }]}>{item.quantity}</Text>
                  <Pressable
                    onPress={() => onIncrement(item.productId)}
                    disabled={item.quantity >= item.maxStock}
                    style={[
                      styles.round,
                      { backgroundColor: colors.primary },
                      item.quantity >= item.maxStock && { opacity: 0.35 },
                    ]}>
                    <Text style={[styles.roundTxt, { color: colors.onPrimary }]}>+</Text>
                  </Pressable>
                </View>
              </View>
              <Pressable onPress={() => onRemove(item.productId)} style={styles.removeWrap}>
                <Text style={[styles.remove, { color: colors.danger }]}>Remove line</Text>
              </Pressable>
            </View>
          )}
        />

        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.text }]}>Subtotal</Text>
            <Text style={[styles.totalVal, { color: colors.primary }]}>${Number(subtotal).toFixed(2)}</Text>
          </View>
          <Pressable
            onPress={onContinue}
            disabled={!cart.length}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: colors.primary },
              !cart.length && { opacity: 0.45 },
              pressed && cart.length > 0 && { opacity: 0.9 },
            ]}>
            <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Continue to payment</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  topBtn: {
    minWidth: 64,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  topBtnText: {
    fontSize: 17,
    fontWeight: '700',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  list: {
    padding: 16,
    paddingBottom: 24,
  },
  headerBlock: {
    marginBottom: 12,
  },
  sub: {
    fontSize: 15,
    lineHeight: 21,
  },
  clearLink: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  clearLinkText: {
    fontSize: 16,
    fontWeight: '700',
  },
  line: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  lineName: {
    fontSize: 17,
    fontWeight: '700',
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  meta: {
    fontSize: 15,
  },
  qty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  round: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundTxt: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: -2,
  },
  qtyNum: {
    fontSize: 18,
    fontWeight: '800',
    minWidth: 28,
    textAlign: 'center',
  },
  removeWrap: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  remove: {
    fontSize: 15,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
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
    fontWeight: '700',
  },
  totalVal: {
    fontSize: 22,
    fontWeight: '900',
  },
  cta: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 18,
    fontWeight: '800',
  },
});
