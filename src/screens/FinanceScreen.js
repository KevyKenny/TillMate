import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BreakageModal, CapitalAdjustmentModal, CapitalModal, ExpenseModal, WithdrawalModal } from '../components/finance/FinanceEntryModals';
import ScreenHeader from '../components/ScreenHeader';
import { useAppTheme } from '../context/AppThemeContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import * as financeService from '../services/financeService';
import * as productService from '../services/productService';
import { getPresetRange } from '../utils/dateRange';

function parseYmd(raw) {
  const s = String(raw ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, mo, d] = s.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return s;
}

function formatMoney(n) {
  const x = Number(n);
  const sign = x < 0 ? '-' : '';
  return `${sign}$${Math.abs(x).toFixed(2)}`;
}

function formatLedgerAmount(type, amount) {
  const raw = Number(amount) || 0;
  const x = Math.abs(raw);
  const s = `$${x.toFixed(2)}`;
  if (['expense', 'withdrawal', 'breakage', 'stock_purchase', 'stock_adjustment', 'sale_reversal', 'profit_reversal'].includes(type)) {
    return `−${s}`;
  }
  const isIn = type === 'profit' || type === 'capital' || type === 'stock_reversal' || type === 'capital_adjustment';
  return isIn ? `+${s}` : `−${s}`;
}

const FILTER_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This week' },
  { id: 'this_month', label: 'This month' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom range' },
];

export default function FinanceScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const { notifyDataChanged, dataVersion } = useCart();
  const styles = useMemo(() => makeStyles(), []);
  const insets = useSafeAreaInsets();

  const [summary, setSummary] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);

  const [filterId, setFilterId] = useState('all');
  const [draftStart, setDraftStart] = useState(() => getPresetRange('today').startYmd);
  const [draftEnd, setDraftEnd] = useState(() => getPresetRange('today').endYmd);
  /** When filter is custom, ledger uses this range (set by Apply, or when choosing Custom chip). */
  const [customApplied, setCustomApplied] = useState(null);

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [capitalOpen, setCapitalOpen] = useState(false);
  const [capitalAdjustOpen, setCapitalAdjustOpen] = useState(false);
  const [breakageOpen, setBreakageOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editLedgerOpen, setEditLedgerOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editEntryAmount, setEditEntryAmount] = useState('');
  const [editEntryDate, setEditEntryDate] = useState('');
  const [editEntryDesc, setEditEntryDesc] = useState('');
  const [editEntryNotes, setEditEntryNotes] = useState('');

  const ledgerRange = useMemo(() => {
    if (filterId === 'all') return { start: null, end: null };
    if (filterId === 'custom') {
      if (!customApplied) return null;
      return { start: customApplied.start, end: customApplied.end };
    }
    const r = getPresetRange(filterId);
    return { start: r.startYmd, end: r.endYmd };
  }, [filterId, customApplied]);

  const load = useCallback(
    async (options = {}) => {
      const { soft } = options;
      if (!user?.id) {
        setSummary(null);
        setLedger([]);
        setLoading(false);
        return;
      }
      if (!soft) setLoading(true);
      try {
        let start = null;
        let end = null;
        if (filterId !== 'all') {
          if (filterId === 'custom' && !ledgerRange) {
            start = null;
            end = null;
          } else if (ledgerRange) {
            start = ledgerRange.start;
            end = ledgerRange.end;
          }
        }
        const [sum, prods, led] = await Promise.all([
          financeService.getFinanceSummary(user.id, start, end),
          productService.getActiveProducts(user.id),
          financeService.getLedger(user.id, start, end),
        ]);
        setSummary(sum);
        setProducts(prods);
        setLedger(led);
      } catch (e) {
        console.error(e);
        Alert.alert('Error', e?.message ?? 'Could not load finance data.');
      } finally {
        if (!soft) setLoading(false);
      }
    },
    [user?.id, filterId, ledgerRange]
  );

  useEffect(() => {
    if (!user?.id) return;
    load({ soft: true });
  }, [dataVersion, load, user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load({ soft: true });
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const onApplyCustom = () => {
    const a = parseYmd(draftStart);
    const b = parseYmd(draftEnd);
    if (!a || !b) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD for start and end.');
      return;
    }
    setFilterId('custom');
    setCustomApplied(a <= b ? { start: a, end: b } : { start: b, end: a });
  };

  const openExpense = () => setExpenseOpen(true);
  const openWithdraw = () => setWithdrawOpen(true);
  const openCapital = () => setCapitalOpen(true);
  const openBreakage = () => setBreakageOpen(true);

  const handleExpense = async (data) => {
    if (!user?.id) return;
    const a = parseYmd(data.occurredOn);
    if (!a) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
      return;
    }
    if (!String(data.purpose || '').trim()) {
      Alert.alert('Required', 'Enter a purpose.');
      return;
    }
    const expAmt = parseFloat(String(data.amount).replace(',', '.'));
    if (Number.isNaN(expAmt) || expAmt <= 0) {
      Alert.alert('Invalid amount', 'Enter a positive number.');
      return;
    }
    setSaving(true);
    try {
      await financeService.addExpense({
        userId: user.id,
        amount: expAmt,
        purpose: data.purpose,
        occurredOn: a,
        notes: data.notes,
      });
      setExpenseOpen(false);
      await load({ soft: true });
      await notifyDataChanged();
    } catch (e) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleWithdraw = async (data) => {
    if (!user?.id) return;
    const a = parseYmd(data.occurredOn);
    if (!a) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
      return;
    }
    if (!String(data.reason || '').trim()) {
      Alert.alert('Required', 'Enter a reason.');
      return;
    }
    const wAmt = parseFloat(String(data.amount).replace(',', '.'));
    if (Number.isNaN(wAmt) || wAmt <= 0) {
      Alert.alert('Invalid amount', 'Enter a positive number.');
      return;
    }
    setSaving(true);
    try {
      await financeService.addWithdrawal({
        userId: user.id,
        amount: wAmt,
        reason: data.reason,
        occurredOn: a,
        withdrawnBy: data.withdrawnBy,
        notes: data.notes,
      });
      setWithdrawOpen(false);
      await load({ soft: true });
      await notifyDataChanged();
    } catch (e) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCapital = async (data) => {
    if (!user?.id) return;
    const a = parseYmd(data.occurredOn);
    if (!a) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
      return;
    }
    if (!String(data.source || '').trim()) {
      Alert.alert('Required', 'Enter a source.');
      return;
    }
    const cAmt = parseFloat(String(data.amount).replace(',', '.'));
    if (Number.isNaN(cAmt) || cAmt <= 0) {
      Alert.alert('Invalid amount', 'Enter a positive number.');
      return;
    }
    setSaving(true);
    try {
      await financeService.addCapital({
        userId: user.id,
        amount: cAmt,
        source: data.source,
        occurredOn: a,
        notes: data.notes,
      });
      setCapitalOpen(false);
      await load({ soft: true });
      await notifyDataChanged();
    } catch (e) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCapitalAdjustment = async (data) => {
    if (!user?.id) return;
    const a = parseYmd(data.occurredOn);
    if (!a) return Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
    const value = parseFloat(String(data.amount).replace(',', '.'));
    if (Number.isNaN(value) || value <= 0) return Alert.alert('Invalid amount', 'Enter a positive number.');
    if (!String(data.reason || '').trim()) return Alert.alert('Required', 'Enter a reason.');
    setSaving(true);
    try {
      await financeService.addCapitalAdjustment({
        userId: user.id,
        amount: value,
        mode: data.mode,
        reason: data.reason,
        occurredOn: a,
        notes: data.notes,
      });
      setCapitalAdjustOpen(false);
      await load({ soft: true });
      await notifyDataChanged();
    } catch (e) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleBreakage = async (data) => {
    if (!user?.id) return;
    if (!data.productId) {
      Alert.alert('Select product', 'Choose a product for breakage.');
      return;
    }
    const a = parseYmd(data.occurredOn);
    if (!a) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
      return;
    }
    if (!String(data.reason || '').trim()) {
      Alert.alert('Required', 'Enter a reason.');
      return;
    }
    setSaving(true);
    try {
      await financeService.recordBreakage({
        userId: user.id,
        productId: data.productId,
        quantity: data.quantity,
        reason: data.reason,
        occurredOn: a,
        notes: data.notes,
      });
      setBreakageOpen(false);
      await load({ soft: true });
      await notifyDataChanged();
    } catch (e) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const filterLabel = useMemo(() => {
    if (filterId === 'all') return 'All time';
    if (filterId === 'custom' && ledgerRange)
      return `${ledgerRange.start} → ${ledgerRange.end}`;
    const p = FILTER_OPTIONS.find((f) => f.id === filterId);
    return p?.label || '';
  }, [filterId, ledgerRange]);

  const currentCards = useMemo(
    () => [
      {
        key: 'available-capital',
        label: 'Available Capital',
        value: summary?.current?.availableCapital ?? 0,
        icon: 'wallet-outline',
        tone: 'profit',
        hint: 'Cash On Hand',
        compact: true,
        onPress: () => setCapitalAdjustOpen(true),
      },
      {
        key: 'stock-value',
        label: 'Stock Order Value',
        value: summary?.current?.stockValue ?? 0,
        icon: 'cube-outline',
        tone: 'blue',
        hint: 'Stock x Cost',
        compact: true,
      },
      {
        key: 'stock-potential',
        label: 'Remaining Sales',
        value: summary?.current?.potentialValue ?? 0,
        icon: 'pricetag-outline',
        tone: 'blue',
        hint: 'Stock x Selling',
        compact: true,
      },
      {
        key: 'low-stock',
        label: 'Low Stock Count',
        value: summary?.current?.lowStockCount ?? 0,
        icon: 'alert-circle-outline',
        tone: 'red',
        isCount: true,
        hint: 'Products <= 5',
        compact: true,
      },
    ],
    [summary]
  );

  const periodCards = useMemo(
    () => [
      { key: 'revenue', label: 'Total Revenue', value: summary?.period?.totalRevenue ?? 0, icon: 'cash-outline', tone: 'green' },
      { key: 'cos', label: 'Cost of Goods Sold', value: summary?.period?.costOfGoodsSold ?? 0, icon: 'pricetag-outline', tone: 'red' },
      { key: 'gross-profit', label: 'Gross Profit', value: summary?.period?.grossProfit ?? 0, icon: 'bar-chart-outline', tone: 'green' },
      { key: 'expenses', label: 'Total Expenses', value: summary?.period?.totalExpenses ?? 0, icon: 'receipt-outline', tone: 'red' },
      { key: 'withdrawals', label: 'Total Withdrawals', value: summary?.period?.totalWithdrawals ?? 0, icon: 'arrow-down-circle-outline', tone: 'red' },
      { key: 'breakage', label: 'Breakage Loss', value: summary?.period?.breakageLoss ?? 0, icon: 'warning-outline', tone: 'red' },
      { key: 'net-profit', label: 'Net Profit', value: summary?.period?.netProfit ?? 0, icon: 'trending-up-outline', tone: 'profit', highlight: true },
      { key: 'transactions', label: 'Total Transactions', value: summary?.period?.totalTransactions ?? 0, icon: 'swap-horizontal-outline', tone: 'blue', isCount: true },
      { key: 'goods-sold', label: 'Total goods sold', value: summary?.period?.totalGoodsSold ?? 0, icon: 'cube-outline', tone: 'blue', isCount: true },
    ],
    [summary]
  );

  const openActionById = (id) => {
    setActionsOpen(false);
    if (id === 'expense') openExpense();
    if (id === 'withdraw') openWithdraw();
    if (id === 'breakage') openBreakage();
    if (id === 'capital') openCapital();
  };

  const renderLedgerItem = ({ item }) => {
    const type = item.type;
    const t = financeService.typeLabel(type);
    const isCapitalSubtract =
      type === 'capital_adjustment' && String(item.notes || '').startsWith('[subtract]');
    const isOutflow =
      ['expense', 'withdrawal', 'breakage', 'stock_purchase', 'stock_adjustment', 'sale_reversal', 'profit_reversal'].includes(
        type
      ) || isCapitalSubtract;
    const isIn = !isOutflow;
    return (
      <View style={[styles.ledgerRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.ledgerTop}>
          <View style={[styles.typePill, { backgroundColor: isIn ? 'rgba(6,118,71,0.12)' : 'rgba(180,35,24,0.08)' }]}>
            <Text style={[styles.typePillText, { color: isIn ? colors.success ?? '#067647' : colors.danger ?? '#b42318' }]}>
              {t}
            </Text>
          </View>
          <Text style={[styles.ledgerDate, { color: colors.textMuted }]}>{item.occurred_on}</Text>
        </View>
        <Text style={[styles.ledgerDesc, { color: colors.text }]} numberOfLines={2}>
          {item.description}
        </Text>
        {item.notes ? (
          <Text style={[styles.ledgerNotes, { color: colors.textMuted }]} numberOfLines={10}>
            {item.notes}
          </Text>
        ) : null}
        {type === 'breakage' && item.product_name ? (
          <Text style={[styles.ledgerSub, { color: colors.textMuted }]}>
            Product: {item.product_name} · Qty: {item.quantity}
          </Text>
        ) : null}
        {type === 'withdrawal' && item.withdrawn_by ? (
          <Text style={[styles.ledgerSub, { color: colors.textMuted }]}>By: {item.withdrawn_by}</Text>
        ) : null}
        <Text style={[styles.ledgerAmount, { color: isIn ? (colors.success ?? '#067647') : colors.text }]}>
          {isCapitalSubtract ? `−$${Math.abs(Number(item.amount) || 0).toFixed(2)}` : formatLedgerAmount(type, item.amount)}
        </Text>
        <View style={styles.ledgerActions}>
          <Pressable
            onPress={() => {
              setEditingEntry(item);
              setEditEntryAmount(String(item.amount ?? ''));
              setEditEntryDate(String(item.occurred_on ?? ''));
              setEditEntryDesc(String(item.description ?? ''));
              setEditEntryNotes(String(item.notes ?? ''));
              setEditLedgerOpen(true);
            }}
            style={({ pressed }) => [
              styles.ledgerActionBtn,
              { borderColor: colors.border, backgroundColor: colors.inputBg, opacity: pressed ? 0.82 : 1 },
            ]}>
            <Ionicons name="create-outline" size={14} color={colors.primary} />
            <Text style={[styles.ledgerActionText, { color: colors.text }]}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              Alert.alert('Hide entry?', 'This removes the row from your ledger view only. Totals and capital are not changed.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    if (!user?.id) return;
                    try {
                      await financeService.deleteLedgerEntry(user.id, item.id);
                      await load({ soft: true });
                      await notifyDataChanged();
                    } catch (e) {
                      Alert.alert('Delete failed', e?.message ?? 'Could not delete entry.');
                    }
                  },
                },
              ])
            }
            style={({ pressed }) => [
              styles.ledgerActionBtn,
              { borderColor: colors.border, backgroundColor: colors.inputBg, opacity: pressed ? 0.82 : 1 },
            ]}>
            <Ionicons name="trash-outline" size={14} color={colors.danger ?? '#b42318'} />
            <Text style={[styles.ledgerActionText, { color: colors.danger ?? '#b42318' }]}>Delete</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderMetricCard = (item) => {
    const isNegativeValue = Number(item.value) < 0;
    const toneColor =
      item.tone === 'green'
        ? colors.success ?? '#067647'
        : item.tone === 'red'
          ? colors.danger ?? '#b42318'
          : item.tone === 'profit'
            ? isNegativeValue
              ? colors.danger ?? '#b42318'
              : colors.success ?? '#067647'
            : colors.primary;

    const valueLabel = item.isCount ? String(Math.round(Number(item.value) || 0)) : formatMoney(item.value);
    return (
      <Pressable
        key={item.key}
        disabled={!item.onPress}
        onPress={item.onPress}
        style={[
          item.compact ? styles.metricCardFour : styles.metricCard,
          {
            backgroundColor: colors.surface,
            borderColor: item.highlight ? toneColor : colors.border,
          },
        ]}>
        <View style={styles.metricTop}>
          <Ionicons name={item.icon} size={14} color={toneColor} />
          <Text style={[styles.metricLabel, { color: colors.textMuted }]} numberOfLines={2}>
            {item.label}
          </Text>
        </View>
        <Text style={[styles.metricValue, { color: toneColor }]} numberOfLines={1}>
          {valueLabel}
        </Text>
        {item.hint ? (
          <Text style={[styles.metricHintTiny, { color: colors.textMuted }]} numberOfLines={1}>
            {item.hint}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Finance" subtitle="Business money in one place" />
      {loading && !summary ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={ledger}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderLedgerItem}
          contentContainerStyle={styles.scroll}
          style={styles.listFlex}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListHeaderComponent={
            <View>
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Current Position</Text>
              <Text style={[styles.currentTag, { color: colors.primary }]}>Current</Text>
            </View>
            <View style={styles.metricGrid}>{currentCards.map(renderMetricCard)}</View>
          </View>

          <View style={styles.ledgerHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Date Filter</Text>
            <Text style={[styles.filterTag, { color: colors.textMuted }]}>{filterLabel}</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChips}
            style={styles.filterScroll}>
            {FILTER_OPTIONS.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => {
                  if (f.id === 'custom') {
                    setFilterId('custom');
                    const t = getPresetRange('today');
                    setDraftStart(t.startYmd);
                    setDraftEnd(t.endYmd);
                    setCustomApplied({ start: t.startYmd, end: t.endYmd });
                    return;
                  }
                  setFilterId(f.id);
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: filterId === f.id ? colors.primary : colors.inputBg,
                    borderColor: filterId === f.id ? colors.primary : colors.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.chipText,
                    { color: filterId === f.id ? colors.onPrimary : colors.text },
                  ]}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {filterId === 'custom' ? (
            <View style={styles.customRange}>
              <View style={styles.customInputs}>
                <View style={styles.customCol}>
                  <Text style={[styles.miniLabel, { color: colors.textMuted }]}>From</Text>
                  <TextInput
                    value={draftStart}
                    onChangeText={setDraftStart}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                    style={[
                      styles.inputSm,
                      { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text },
                    ]}
                  />
                </View>
                <View style={styles.customCol}>
                  <Text style={[styles.miniLabel, { color: colors.textMuted }]}>To</Text>
                  <TextInput
                    value={draftEnd}
                    onChangeText={setDraftEnd}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                    style={[
                      styles.inputSm,
                      { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text },
                    ]}
                  />
                </View>
              </View>
              <Pressable
                onPress={onApplyCustom}
                style={[styles.applyFilterBtn, { backgroundColor: colors.primary }]}>
                <Text style={[styles.applyFilterText, { color: colors.onPrimary }]}>Apply range</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.sectionWrap}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Period Metrics</Text>
            <View style={styles.metricGrid}>{periodCards.map(renderMetricCard)}</View>
          </View>

          <View style={styles.quickActionsRow}>
            <Text style={[styles.quickActionsLabel, { color: colors.text }]}>Quick Actions</Text>
            <View style={styles.quickActionsWrap}>
              <Pressable
                onPress={() => setActionsOpen((s) => !s)}
                style={({ pressed }) => [
                  styles.dropdownBtn,
                  { backgroundColor: colors.inputBg, borderColor: colors.border, opacity: pressed ? 0.92 : 1 },
                ]}>
                <Text style={[styles.dropdownBtnText, { color: colors.text }]}>Choose Action</Text>
                <Ionicons name={actionsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>

          <View style={styles.ledgerHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Ledger</Text>
            <Text style={[styles.filterTag, { color: colors.textMuted }]}>{filterLabel}</Text>
          </View>

          {loading && summary ? (
            <ActivityIndicator style={{ marginTop: 12, marginBottom: 8 }} color={colors.primary} />
          ) : null}
            </View>
          }
          ListEmptyComponent={
            <Text style={[styles.emptyLedger, { color: colors.textMuted, paddingTop: 8 }]}>
              No entries for this view.
            </Text>
          }
        />
      )}

      <Modal visible={actionsOpen} transparent animationType="fade" onRequestClose={() => setActionsOpen(false)}>
        <View style={styles.actionModalOverlay}>
          <Pressable style={styles.actionBackdrop} onPress={() => setActionsOpen(false)} />
          <View style={[styles.actionSheet, { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(10, insets.bottom + 4) }]}>
            <Text style={[styles.actionSheetTitle, { color: colors.text }]}>Quick Actions</Text>
            <Pressable style={styles.dropdownItem} onPress={() => openActionById('expense')}>
              <Text style={[styles.dropdownItemText, { color: colors.text }]}>Add Expense</Text>
            </Pressable>
            <Pressable style={styles.dropdownItem} onPress={() => openActionById('withdraw')}>
              <Text style={[styles.dropdownItemText, { color: colors.text }]}>Record Withdrawal</Text>
            </Pressable>
            <Pressable style={styles.dropdownItem} onPress={() => openActionById('breakage')}>
              <Text style={[styles.dropdownItemText, { color: colors.text }]}>Add Breakage</Text>
            </Pressable>
            <Pressable style={styles.dropdownItem} onPress={() => openActionById('capital')}>
              <Text style={[styles.dropdownItemText, { color: colors.text }]}>Add Capital</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={editLedgerOpen} transparent animationType="fade" onRequestClose={() => setEditLedgerOpen(false)}>
        <KeyboardAvoidingView style={styles.actionModalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.actionBackdrop} onPress={() => setEditLedgerOpen(false)} />
          <View style={[styles.actionSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.actionSheetTitle, { color: colors.text }]}>Edit Ledger Entry</Text>
            <TextInput
              value={editEntryAmount}
              onChangeText={setEditEntryAmount}
              keyboardType="decimal-pad"
              placeholder="Amount"
              placeholderTextColor={colors.textMuted}
              style={[styles.inputSm, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text, marginHorizontal: 10, marginBottom: 8 }]}
            />
            <TextInput
              value={editEntryDate}
              onChangeText={setEditEntryDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              style={[styles.inputSm, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text, marginHorizontal: 10, marginBottom: 8 }]}
            />
            <TextInput
              value={editEntryDesc}
              onChangeText={setEditEntryDesc}
              placeholder="Description"
              placeholderTextColor={colors.textMuted}
              style={[styles.inputSm, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text, marginHorizontal: 10, marginBottom: 8 }]}
            />
            <TextInput
              value={editEntryNotes}
              onChangeText={setEditEntryNotes}
              placeholder="Notes"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.inputSm, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text, marginHorizontal: 10, marginBottom: 10, minHeight: 72, textAlignVertical: 'top' }]}
            />
            <View style={styles.editLedgerButtons}>
              <Pressable onPress={() => setEditLedgerOpen(false)} style={[styles.editLedgerBtn, { borderColor: colors.border }]}>
                <Text style={[styles.editLedgerBtnText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!user?.id || !editingEntry) return;
                  const d = parseYmd(editEntryDate);
                  const amount = parseFloat(String(editEntryAmount).replace(',', '.'));
                  if (!d) return Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
                  if (Number.isNaN(amount) || amount < 0) return Alert.alert('Invalid amount', 'Use a valid number.');
                  try {
                    await financeService.updateLedgerEntry(user.id, editingEntry.id, {
                      amount,
                      occurredOn: d,
                      description: editEntryDesc,
                      notes: editEntryNotes,
                    });
                    setEditLedgerOpen(false);
                    setEditingEntry(null);
                    await load({ soft: true });
                    await notifyDataChanged();
                  } catch (e) {
                    Alert.alert('Update failed', e?.message ?? 'Could not update entry.');
                  }
                }}
                style={[styles.editLedgerBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                <Text style={[styles.editLedgerBtnText, { color: colors.onPrimary }]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ExpenseModal
        visible={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        colors={colors}
        onSave={handleExpense}
        busy={saving}
      />
      <WithdrawalModal
        visible={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        colors={colors}
        onSave={handleWithdraw}
        busy={saving}
      />
      <CapitalModal
        visible={capitalOpen}
        onClose={() => setCapitalOpen(false)}
        colors={colors}
        onSave={handleCapital}
        busy={saving}
      />
      <CapitalAdjustmentModal
        visible={capitalAdjustOpen}
        onClose={() => setCapitalAdjustOpen(false)}
        colors={colors}
        onSave={handleCapitalAdjustment}
        busy={saving}
      />
      <BreakageModal
        visible={breakageOpen}
        onClose={() => setBreakageOpen(false)}
        colors={colors}
        onSave={handleBreakage}
        busy={saving}
        products={products}
      />
    </SafeAreaView>
  );
}

function makeStyles() {
  return StyleSheet.create({
    safe: { flex: 1 },
    listFlex: { flex: 1 },
    scroll: { flexGrow: 1, padding: 16, paddingBottom: 32 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    sectionWrap: { marginTop: 10 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    currentTag: { fontSize: 11, fontWeight: '800' },
    sectionTitle: { fontSize: 15, fontWeight: '900', marginTop: 6, marginBottom: 6 },
    metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
    metricCard: {
      width: '31.5%',
      minHeight: 78,
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    metricCardFour: {
      width: '23.7%',
      minHeight: 84,
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 6,
      paddingVertical: 8,
    },
    metricTop: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
    metricLabel: { fontSize: 10, fontWeight: '700', flex: 1 },
    metricValue: { fontSize: 13, fontWeight: '900' },
    metricHintTiny: { fontSize: 9, fontWeight: '600', marginTop: 4 },
    ledgerHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 12 },
    filterTag: { fontSize: 12, fontWeight: '700' },
    filterScroll: { marginTop: 8, marginBottom: 4 },
    filterChips: { gap: 8, paddingVertical: 4 },
    chip: {
      borderRadius: 999,
      borderWidth: 1,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    chipText: { fontSize: 12, fontWeight: '800' },
    customRange: { marginTop: 8, marginBottom: 8, gap: 8 },
    customInputs: { flexDirection: 'row', gap: 10 },
    customCol: { flex: 1 },
    miniLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
    inputSm: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 10,
      fontSize: 14,
    },
    applyFilterBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
    applyFilterText: { fontSize: 14, fontWeight: '800' },
    quickActionsRow: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 5,
    },
    quickActionsLabel: { fontSize: 14, fontWeight: '900' },
    quickActionsWrap: { minWidth: 172, position: 'relative' },
    dropdownBtn: {
      borderWidth: 1,
      borderRadius: 10,
      minHeight: 38,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    dropdownBtnText: { fontSize: 12, fontWeight: '700' },
    dropdownItem: { paddingHorizontal: 10, paddingVertical: 10 },
    dropdownItemText: { fontSize: 12, fontWeight: '700' },
    actionModalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.25)',
      padding: 16,
    },
    actionBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    actionSheet: {
      borderWidth: 1,
      borderRadius: 12,
      overflow: 'hidden',
    },
    actionSheetTitle: {
      fontSize: 13,
      fontWeight: '900',
      paddingHorizontal: 10,
      paddingTop: 10,
      paddingBottom: 4,
    },
    ledgerRow: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
    },
    ledgerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    typePill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    typePillText: { fontSize: 11, fontWeight: '800' },
    ledgerDate: { fontSize: 12, fontWeight: '700' },
    ledgerDesc: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
    ledgerNotes: { fontSize: 12, lineHeight: 16, marginBottom: 4 },
    ledgerSub: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
    ledgerAmount: { fontSize: 17, fontWeight: '900', marginTop: 4, textAlign: 'right' },
    ledgerActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
    ledgerActionBtn: {
      borderWidth: 1,
      borderRadius: 8,
      minHeight: 30,
      paddingHorizontal: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    ledgerActionText: { fontSize: 12, fontWeight: '700' },
    editLedgerButtons: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 10 },
    editLedgerBtn: { flex: 1, borderWidth: 1, borderRadius: 10, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
    editLedgerBtnText: { fontSize: 13, fontWeight: '800' },
    emptyLedger: { textAlign: 'center', padding: 20, fontSize: 15 },
  });
}
