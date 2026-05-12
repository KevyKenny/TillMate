import React from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/AppThemeContext';

function Divider({ color }) {
  return <View style={[styles.divider, { borderBottomColor: color }]} />;
}

/**
 * @param {{ visible: boolean; receipt: object | null; onClose: () => void; onPrint?: (receipt: object) => void }} props
 */
export default function ReceiptModal({ visible, receipt, onClose, onPrint }) {
  const { colors } = useAppTheme();
  if (!receipt) return null;

  const paper = colors.inputBg;
  const ink = colors.text;
  const muted = colors.textMuted;
  const when = receipt.createdAtDisplay || receipt.createdAt || '';
  const cashier = receipt.cashierName ?? 'Kenny';
  const handlePrint = () => {
    Alert.alert('Print', 'Coming soon...');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Receipt</Text>
            <View style={styles.headerActions}>
              {/* <Pressable
                onPress={handlePrint}
                hitSlop={10}
                style={[styles.printBtn, { backgroundColor: colors.primary }]}>
                <Ionicons name="print-outline" size={16} color={colors.onPrimary} />
                <Text style={[styles.printText, { color: colors.onPrimary }]}></Text>
              </Pressable> */}
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeHit}>
                <Text style={[styles.closeText, { color: colors.primary }]}>Done</Text>
              </Pressable>
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={[styles.receipt, { backgroundColor: paper, borderColor: colors.border }]}>
              <Text style={[styles.shopName, { color: ink }]}>{receipt.shopName}</Text>
              <Text style={[styles.shopLine, { color: muted }]}>{receipt.shopAddress}</Text>
              <Text style={[styles.shopLine, { color: muted }]}>{receipt.shopPhone}</Text>
              <Divider color={muted} />
              <View style={styles.rowBetween}>
                <Text style={[styles.label, { color: ink }]}>Invoice</Text>
                <Text style={[styles.value, { color: ink }]}>{receipt.invoiceNumber}</Text>
              </View>
              <View style={styles.rowBetween}>
                <Text style={[styles.label, { color: ink }]}>Date & time</Text>
                <Text style={[styles.valueSm, { color: muted }]}>{when}</Text>
              </View>
              <View style={styles.rowBetween}>
                <Text style={[styles.label, { color: ink }]}>Payment</Text>
                <Text style={[styles.value, { color: ink }]}>{receipt.paymentMethod}</Text>
              </View>
              <Divider color={muted} />

              <View style={[styles.tableHeader, { borderBottomColor: muted }]}>
                <Text style={[styles.thItem, { color: ink }]}>Items</Text>
                <Text style={[styles.thQty, { color: ink }]}>Qnty</Text>
                <Text style={[styles.thPrice, { color: ink }]}>Unit Price</Text>
                <Text style={[styles.thTot, { color: ink }]}>Total</Text>
              </View>
              {receipt.lines.map((line, i) => (
                <View key={i} style={[styles.tableRow, { borderBottomColor: muted }]}>
                  <Text style={[styles.tdItem, { color: ink }]} numberOfLines={3}>
                    {line.name}
                  </Text>
                  <Text style={[styles.tdQty, { color: ink }]}>{line.quantity}</Text>
                  <Text style={[styles.tdPrice, { color: ink }]}>${Number(line.unitPrice).toFixed(2)}</Text>
                  <Text style={[styles.tdTot, { color: ink }]}>${Number(line.lineTotal).toFixed(2)}</Text>
                </View>
              ))}

              <Divider color={muted} />
              <View style={styles.rowBetween}>
                <Text style={[styles.totalLabel, { color: ink }]}>Invoice total</Text>
                <Text style={[styles.totalValue, { color: ink }]}>
                  ${Number(receipt.invoiceTotal).toFixed(2)}
                </Text>
              </View>
              <View style={styles.rowBetween}>
                <Text style={[styles.label, { color: ink }]}>Total tax</Text>
                <Text style={[styles.value, { color: ink }]}>${Number(receipt.tax).toFixed(2)}</Text>
              </View>
              <Divider color={muted} />
              <View style={styles.rowBetween}>
                <Text style={[styles.totalLabel, { color: ink }]}>Paid amount</Text>
                <Text style={[styles.totalValue, { color: ink }]}>
                  ${Number(receipt.paidAmount).toFixed(2)}
                </Text>
              </View>
              <View style={styles.rowBetween}>
                <Text style={[styles.totalLabel, { color: ink }]}>Change</Text>
                <Text style={[styles.totalValue, { color: ink }]}>${Number(receipt.change).toFixed(2)}</Text>
              </View>

              <Text style={[styles.cashier, { color: ink }]}>Cashier: {cashier}</Text>
              <Text style={[styles.thanks, { color: ink }]}>Thank you for your purchase!</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  closeHit: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  closeText: {
    fontSize: 17,
    fontWeight: '700',
  },
  Btn: {
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  printText: {
    fontSize: 14,
    fontWeight: '800',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  receipt: {
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  shopName: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  shopLine: {
    fontSize: 14,
    textAlign: 'center',
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginVertical: 12,
    opacity: 0.55,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
  value: {
    fontSize: 15,
    fontWeight: '700',
  },
  valueSm: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    marginBottom: 4,
    borderBottomWidth: 1,
  },
  thItem: { flex: 2.2, fontSize: 12, fontWeight: '800' },
  thQty: { width: 36, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  thPrice: { flex: 1, fontSize: 11, fontWeight: '800', textAlign: 'right' },
  thTot: { width: 64, fontSize: 11, fontWeight: '800', textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tdItem: { flex: 2.2, fontSize: 13, fontWeight: '600', paddingRight: 4 },
  tdQty: { width: 36, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  tdPrice: { flex: 1, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  tdTot: { width: 64, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  totalLabel: {
    fontSize: 17,
    fontWeight: '800',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  cashier: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  thanks: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
