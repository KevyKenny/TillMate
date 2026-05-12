import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { BarChart, LineChart } from 'react-native-chart-kit';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import ReceiptModal from '../components/ReceiptModal';
import ScreenHeader from '../components/ScreenHeader';
import { DEFAULT_TAX } from '../constants/receipt';
import { useAppTheme } from '../context/AppThemeContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useThermalReceiptPrint } from '../hooks/useThermalReceiptPrint';
import * as reportsService from '../services/reportsService';
import * as salesService from '../services/salesService';
import { getPresetRange } from '../utils/dateRange';
import { formatHarare } from '../utils/datetime';

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This week' },
  { id: 'last_week', label: 'Last week' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_year', label: 'This year' },
];
const PROFIT_GREEN = '#067647';

function parseYmd(raw) {
  const s = String(raw ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, mo, d] = s.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return s;
}

function normalizeRange(nextStart, nextEnd) {
  if (nextStart > nextEnd) {
    return { startYmd: nextEnd, endYmd: nextStart };
  }
  return { startYmd: nextStart, endYmd: nextEnd };
}

function getStockBadgeTone(stock) {
  if (stock <= 5) return { bg: '#fde8e8', text: '#b42318' };
  if (stock <= 10) return { bg: '#fff7cc', text: '#8a6a00' };
  return { bg: '#e9f8ef', text: '#067647' };
}

function formatAxisDateLabel(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`;
}

function eachDayInclusive(startYmd, endYmd) {
  const out = [];
  const start = new Date(`${startYmd}T00:00:00`);
  const end = new Date(`${endYmd}T00:00:00`);
  for (let dt = start; dt <= end; dt.setDate(dt.getDate() + 1)) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
  }
  return out;
}

export default function ReportsScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const { dataVersion, notifyDataChanged } = useCart();
  const printThermalReceipt = useThermalReceiptPrint();
  const insets = useSafeAreaInsets();
  const initial = getPresetRange('today');
  const [preset, setPreset] = useState(null);
  const [hasQueried, setHasQueried] = useState(false);
  const [startYmd, setStartYmd] = useState(initial.startYmd);
  const [endYmd, setEndYmd] = useState(initial.endYmd);
  const [draftStart, setDraftStart] = useState(initial.startYmd);
  const [draftEnd, setDraftEnd] = useState(initial.endYmd);
  const [sales, setSales] = useState([]);
  const [productStats, setProductStats] = useState([]);
  const [productView, setProductView] = useState('table');
  const [loading, setLoading] = useState(false);
  const [histReceipt, setHistReceipt] = useState(null);
  const [histVisible, setHistVisible] = useState(false);
  /** When false, filter UI is hidden and sales list is shown with a heading + Back. */
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [resultHeading, setResultHeading] = useState('');
  const [reportTab, setReportTab] = useState('general');
  const [advancedChart, setAdvancedChart] = useState('salesTrend');
  const [dailySalesSeries, setDailySalesSeries] = useState([]);
  const [lowStockAlerts, setLowStockAlerts] = useState(0);
  const [reversalBusySaleId, setReversalBusySaleId] = useState(null);
  const [reversalModal, setReversalModal] = useState(null);
  const [reversalReason, setReversalReason] = useState('');

  const goBackToFilters = useCallback(() => {
    const t = getPresetRange('today');
    setFiltersVisible(true);
    setHasQueried(false);
    setPreset(null);
    setSales([]);
    setProductStats([]);
    setResultHeading('');
    setStartYmd(t.startYmd);
    setEndYmd(t.endYmd);
    setDraftStart(t.startYmd);
    setDraftEnd(t.endYmd);
    setReportTab('general');
    setAdvancedChart('salesTrend');
    setDailySalesSeries([]);
    setLowStockAlerts(0);
    setReversalModal(null);
    setReversalReason('');
  }, []);

  const applyPreset = useCallback((id) => {
    const r = getPresetRange(id);
    setPreset(id);
    setStartYmd(r.startYmd);
    setEndYmd(r.endYmd);
    setDraftStart(r.startYmd);
    setDraftEnd(r.endYmd);
    setResultHeading(r.label ?? id);
    setHasQueried(true);
    setFiltersVisible(false);
    setReportTab('general');
  }, []);

  const applyCustomRange = useCallback(() => {
    const a = parseYmd(draftStart);
    const b = parseYmd(draftEnd);
    if (!a || !b) {
      Alert.alert('Invalid date', 'Use format YYYY-MM-DD (e.g. 2026-04-18).');
      return;
    }
    const r = normalizeRange(a, b);
    setStartYmd(r.startYmd);
    setEndYmd(r.endYmd);
    setDraftStart(r.startYmd);
    setDraftEnd(r.endYmd);
    setPreset('custom');
    setResultHeading(`Custom · ${r.startYmd} – ${r.endYmd}`);
    setHasQueried(true);
    setFiltersVisible(false);
    setReportTab('general');
  }, [draftStart, draftEnd]);

  const load = useCallback(async () => {
    if (!hasQueried) return;
    if (!user?.id) {
      setSales([]);
      setProductStats([]);
      setDailySalesSeries([]);
      setLowStockAlerts(0);
      return;
    }
    setLoading(true);
    try {
      const [rows, productRows, dailyRows, lowStockCount] = await Promise.all([
        reportsService.getSalesInDateRange(user?.id, startYmd, endYmd),
        reportsService.getProductPerformance(user?.id, startYmd, endYmd),
        reportsService.getDailySalesSeries(user?.id, startYmd, endYmd),
        reportsService.getLowStockAlertsCount(user?.id, 5),
      ]);
      setSales(rows);
      setProductStats(productRows);
      setDailySalesSeries(dailyRows);
      setLowStockAlerts(lowStockCount);
    } finally {
      setLoading(false);
    }
  }, [hasQueried, startYmd, endYmd, user?.id]);

  useEffect(() => {
    if (hasQueried && !filtersVisible) load();
  }, [dataVersion, filtersVisible, hasQueried, load]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (hasQueried && !filtersVisible) load();
    }, [hasQueried, filtersVisible, load])
  );

  const openSale = async (item) => {
    if (!user?.id) return;
    const header = await reportsService.getSaleHeader(user?.id, item.id);
    const lines = await reportsService.getSaleLines(user?.id, item.id);
    if (!header) return;
    setHistReceipt({
      shopName: user?.displayShopName || user?.shopName || 'My Shop',
      shopAddress: user?.shopAddress || '',
      shopPhone: user?.phone || '',
      cashierName: user?.fullName || 'Cashier',
      invoiceNumber: `INV-${String(header.id).padStart(6, '0')}`,
      paymentMethod: header.payment_method || 'Cash',
      lines: lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
      })),
      invoiceTotal: header.total,
      tax: DEFAULT_TAX,
      paidAmount: header.paid_amount ?? header.total,
      change: header.change_amount ?? 0,
      createdAt: header.created_at,
      createdAtDisplay: formatHarare(header.created_at),
    });
    setHistVisible(true);
  };

  const openReversalModal = async (sale) => {
    if (!user?.id) return;
    try {
      const lines = await reportsService.getSaleLines(user.id, sale.id);
      const eligible = lines.filter((l) => Number(l.netQuantity || 0) > 0);
      if (!eligible.length) {
        Alert.alert('Nothing to reverse', 'All items in this sale were already reversed.');
        return;
      }
      setReversalReason('');
      setReversalModal({
        sale,
        lines: eligible.map((l) => ({
          ...l,
          draftQty: '',
        })),
      });
    } catch (e) {
      Alert.alert('Error', e?.message ?? 'Could not load invoice lines.');
    }
  };

  const submitReversalFromModal = async () => {
    if (!reversalModal || !user?.id) return;
    const linesToReverse = [];
    for (const row of reversalModal.lines) {
      const q = Math.max(0, parseInt(String(row.draftQty).trim(), 10) || 0);
      if (q <= 0) continue;
      const max = Number(row.netQuantity || 0);
      if (q > max) {
        Alert.alert('Invalid quantity', `${row.name}: you can reverse at most ${max} for this line.`);
        return;
      }
      linesToReverse.push({ saleItemId: row.saleItemId, quantity: q });
    }
    if (!linesToReverse.length) {
      Alert.alert('Enter quantities', 'Set how many units to reverse for at least one product line.');
      return;
    }
    setReversalBusySaleId(reversalModal.sale.id);
    try {
      await salesService.reverseSaleItemsForUser(
        user.id,
        reversalModal.sale.id,
        linesToReverse,
        reversalReason.trim() || 'Sale reversal'
      );
      setReversalModal(null);
      setReversalReason('');
      await notifyDataChanged();
      await load();
      Alert.alert('Updated', 'Reversal applied. Stock and finance figures were updated!.');
    } catch (e) {
      Alert.alert('Reversal failed', e?.message ?? 'Could not reverse this sale.');
    } finally {
      setReversalBusySaleId(null);
    }
  };

  const updateReversalDraft = (saleItemId, text) => {
    setReversalModal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lines: prev.lines.map((row) =>
          row.saleItemId === saleItemId ? { ...row, draftQty: text } : row
        ),
      };
    });
  };

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const totalSales = useMemo(
    () => sales.reduce((sum, s) => sum + Number(s.total || 0), 0),
    [sales]
  );
  const totalSoldItems = useMemo(
    () => productStats.reduce((sum, p) => sum + Number(p.soldQty || 0), 0),
    [productStats]
  );
  const totalProductRevenue = useMemo(
    () => productStats.reduce((sum, p) => sum + Number(p.salesBalance || 0), 0),
    [productStats]
  );
  const totalProfit = useMemo(
    () => productStats.reduce((sum, p) => sum + Number(p.profit || 0), 0),
    [productStats]
  );
  const chartWidth = useMemo(() => Math.max(300, Dimensions.get('window').width - 56), []);
  const todayYmd = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
  }, []);
  const totalSalesToday = useMemo(() => {
    const todayRow = dailySalesSeries.find((row) => row.day === todayYmd);
    return Number(todayRow?.totalSales || 0);
  }, [dailySalesSeries, todayYmd]);

  const dailySalesChart = useMemo(() => {
    const dayMap = new Map(dailySalesSeries.map((row) => [row.day, Number(row.totalSales || 0)]));
    const days = eachDayInclusive(startYmd, endYmd);
    const rawValues = days.map((d) => dayMap.get(d) || 0);
    const step = Math.max(1, Math.ceil(days.length / 6));
    const labels = days.map((d, i) => (i % step === 0 || i === days.length - 1 ? formatAxisDateLabel(d) : ''));
    return { labels, values: rawValues };
  }, [dailySalesSeries, startYmd, endYmd]);

  const topSellingProducts = useMemo(
    () =>
      [...productStats]
        .sort((a, b) => Number(b.soldQty || 0) - Number(a.soldQty || 0))
        .slice(0, 5),
    [productStats]
  );
  const mostProfitableProducts = useMemo(
    () =>
      [...productStats]
        .filter((p) => Number(p.profit || 0) > 0)
        .sort((a, b) => Number(b.profit || 0) - Number(a.profit || 0))
        .slice(0, 5),
    [productStats]
  );
  const chartConfig = useMemo(
    () => ({
      backgroundColor: colors.surface,
      backgroundGradientFrom: colors.surface,
      backgroundGradientTo: colors.surface,
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(30, 120, 190, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(95, 102, 112, ${opacity})`,
      propsForDots: { r: '3', strokeWidth: '1', stroke: colors.primary },
      propsForBackgroundLines: { stroke: colors.border },
      barPercentage: 0.55,
      fillShadowGradientOpacity: 0.15,
    }),
    [colors]
  );
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Reports" subtitle="Pick a range, then view sales below" />

      {filtersVisible ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flexShrink: 0 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.topSection, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Custom date range</Text>
          <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
            Tap Apply to load sales for the selected range.
          </Text>
          <View style={styles.inputsRow}>
            <View style={styles.inputCol}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Start</Text>
              <TextInput
                value={draftStart}
                onChangeText={setDraftStart}
                placeholder="2026-04-01"
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.inputBg,
                    color: colors.text,
                  },
                ]}
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>End</Text>
              <TextInput
                value={draftEnd}
                onChangeText={setDraftEnd}
                placeholder="2026-04-30"
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.inputBg,
                    color: colors.text,
                  },
                ]}
              />
            </View>
          </View>
          <Pressable
            onPress={applyCustomRange}
            style={({ pressed }) => [
              styles.applyBtn,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.9 },
            ]}>
            <Text style={[styles.applyBtnText, { color: colors.onPrimary }]}>Apply custom range</Text>
          </Pressable>

          <Text style={[styles.presetTitle, { color: colors.text }]}>Quick ranges</Text>
          <View style={styles.presetGrid}>
            {PRESETS.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => applyPreset(p.id)}
                style={({ pressed }) => [
                  styles.presetBtn,
                  {
                    backgroundColor: preset === p.id ? colors.primary : colors.inputBg,
                    borderColor: colors.border,
                  },
                  pressed && { opacity: 0.92 },
                ]}>
                <Text
                  style={[
                    styles.presetBtnText,
                    { color: preset === p.id ? colors.onPrimary : colors.text },
                  ]}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <View style={[styles.resultsBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable onPress={goBackToFilters} style={styles.backHit} hitSlop={8}>
            <View style={styles.backRow}>
              <Ionicons name="chevron-back" size={22} color={colors.primary} />
              <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
            </View>
          </Pressable>
          <View style={styles.headingWrap}>
            <Text style={[styles.resultsHeading, { color: colors.text }]} numberOfLines={2}>
              {resultHeading}
            </Text>
            <Text style={[styles.resultsSub, { color: colors.textMuted }]} numberOfLines={1}>
              {startYmd === endYmd ? startYmd : `${startYmd} → ${endYmd}`}
            </Text>
          </View>
          <View style={styles.backSpacer} />
        </View>
      )}
      {!filtersVisible ? (
        <View style={[styles.reportTabsRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => setReportTab('general')}
            style={[
              styles.reportTabBtn,
              {
                backgroundColor: reportTab === 'general' ? colors.primary : colors.inputBg,
                borderColor: colors.border,
              },
            ]}>
            <Text style={[styles.reportTabBtnText, { color: reportTab === 'general' ? colors.onPrimary : colors.text }]}>
              General Info
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setReportTab('advanced')}
            style={[
              styles.reportTabBtn,
              {
                backgroundColor: reportTab === 'advanced' ? colors.primary : colors.inputBg,
                borderColor: colors.border,
              },
            ]}>
            <Text
              style={[styles.reportTabBtnText, { color: reportTab === 'advanced' ? colors.onPrimary : colors.text }]}>
              Advanced Reports
            </Text>
          </Pressable>
        </View>
      ) : null}

      {filtersVisible && !hasQueried ? (
        <View style={styles.hintBox}>
          <Text style={[styles.hintText, { color: colors.textMuted }]}>
            Choose a quick range or apply a custom range to load sales.
          </Text>
        </View>
      ) : null}

      {!filtersVisible && hasQueried && loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : null}

      {!filtersVisible && hasQueried && !loading ? (
        reportTab === 'general' ? (
          <FlatList
            style={styles.listFlex}
            data={sales}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.metricsWrap}>
                <View style={styles.topStatsRow}>
                  <View style={[styles.rangeTotalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.rangeTotalLabel, { color: colors.textMuted }]}>Total Sales</Text>
                    <Text style={[styles.rangeTotalValue, { color: colors.text }]}>${totalSales.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.rangeTotalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.rangeTotalLabel, { color: colors.textMuted }]}>Total Sold</Text>
                    <Text style={[styles.rangeTotalValue, { color: colors.text }]}>{totalSoldItems}</Text>
                  </View>
                  <View style={[styles.rangeTotalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.rangeTotalLabel, { color: colors.textMuted }]}>Total Profit</Text>
                    <Text style={[styles.rangeTotalValue, { color: PROFIT_GREEN }]}>${totalProfit.toFixed(2)}</Text>
                  </View>
                </View>
                <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Per-product performance</Text>
                  <View style={styles.productViewTabs}>
                    <Pressable
                      onPress={() => setProductView('table')}
                      style={[
                        styles.productViewBtn,
                        {
                          backgroundColor: productView === 'table' ? colors.primary : colors.inputBg,
                          borderColor: colors.border,
                        },
                      ]}>
                      <Text style={[styles.productViewBtnText, { color: productView === 'table' ? colors.onPrimary : colors.text }]}>Table</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setProductView('grid')}
                      style={[
                        styles.productViewBtn,
                        {
                          backgroundColor: productView === 'grid' ? colors.primary : colors.inputBg,
                          borderColor: colors.border,
                        },
                      ]}>
                      <Text style={[styles.productViewBtnText, { color: productView === 'grid' ? colors.onPrimary : colors.text }]}>Grid</Text>
                    </Pressable>
                  </View>

                  {productView === 'grid' ? (
                    <View style={styles.productGrid}>
                      {productStats.length === 0 ? (
                        <Text style={[styles.metricHint, { color: colors.textMuted }]}>No product sales in this range.</Text>
                      ) : (
                        productStats.map((p) => (
                          <View
                            key={String(p.productId)}
                            style={[styles.productGridCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                            <View style={styles.productGridHeadRow}>
                              <Text style={[styles.productGridName, { color: colors.text }]} numberOfLines={1}>
                                {p.productName}
                              </Text>
                              {p.category ? (
                                <View style={[styles.categoryBadge, { backgroundColor: colors.primaryMuted }]}>
                                  <Text style={[styles.badgeText, { color: colors.onPrimary }]} numberOfLines={1}>
                                    {p.category}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                            <View style={styles.badgeRow}>
                              <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                                <Text style={[styles.badgeText, { color: colors.textMuted }]}>
                                  Sales {Number(p.salesCount || 0)}
                                </Text>
                              </View>
                              <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                                <Text style={[styles.badgeText, { color: colors.textMuted }]}>
                                  Sold {Number(p.soldQty || 0)}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.productGridMoneyRow}>
                              <Text style={[styles.productGridMoneyLabel, { color: colors.textMuted }]}>Price/item</Text>
                              <Text style={[styles.productGridMoneyValue, { color: colors.text }]}>
                                ${Number(p.pricePerItem || 0).toFixed(2)}
                              </Text>
                            </View>
                            <View style={styles.productGridMoneyRow}>
                              <Text style={[styles.productGridMoneyLabel, { color: colors.textMuted }]}>Total</Text>
                              <Text style={[styles.productGridMoneyValue, { color: colors.text }]}>
                                ${Number(p.salesBalance || 0).toFixed(2)}
                              </Text>
                            </View>
                            <View style={styles.profitStockRow}>
                              <Text style={[styles.productGridProfit, { color: PROFIT_GREEN }]}>
                                Profit: {p.costPrice == null ? '—' : `$${Number(p.profit || 0).toFixed(2)}`}
                              </Text>
                              <View
                                style={[
                                  styles.stockBadgeBottom,
                                  {
                                    backgroundColor: getStockBadgeTone(Number(p.remainingStock || 0)).bg,
                                  },
                                ]}>
                                <Text
                                  style={[
                                    styles.stockBadgeBottomText,
                                    { color: getStockBadgeTone(Number(p.remainingStock || 0)).text },
                                  ]}>
                                  Stock {Number(p.remainingStock || 0)}
                                </Text>
                              </View>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  ) : (
                    <View style={styles.productTableWrap}>
                      <View style={styles.productTableInner}>
                        <View style={[styles.productRow, styles.productHeadRow, { borderBottomColor: colors.border }]}>
                          <Text style={[styles.colName, styles.colHead, { color: colors.textMuted }]}>Product</Text>
                          <Text style={[styles.colMini, styles.colHead, { color: colors.textMuted }]}>Sold</Text>
                          <Text style={[styles.colMoney, styles.colHead, { color: colors.textMuted }]}>Total</Text>
                          <Text style={[styles.colMoney, styles.colHead, { color: colors.textMuted }]}>Profit*</Text>
                        </View>
                        {productStats.length === 0 ? (
                          <View style={[styles.productRow, { borderBottomColor: colors.border }]}>
                            <Text style={[styles.colName, styles.tableEmptyMessage, { color: colors.textMuted }]}>
                              No product sales in this range.
                            </Text>
                          </View>
                        ) : (
                          productStats.map((p) => (
                            <View key={String(p.productId)} style={[styles.productRow, { borderBottomColor: colors.border }]}>
                              <Text style={[styles.colName, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
                                {p.productName}
                              </Text>
                              <Text style={[styles.colMini, { color: colors.text }]}>{Number(p.soldQty || 0)}</Text>
                              <Text style={[styles.colMoney, { color: colors.text }]} numberOfLines={1}>
                                ${Number(p.salesBalance || 0).toFixed(2)}
                              </Text>
                              <Text style={[styles.colMoney, { color: PROFIT_GREEN }]} numberOfLines={1}>
                                {p.costPrice == null ? '—' : `$${Number(p.profit || 0).toFixed(2)}`}
                              </Text>
                            </View>
                          ))
                        )}
                        {productStats.length > 0 ? (
                          <View style={[styles.productRow, styles.productFootRow, { borderBottomColor: colors.border }]}>
                            <Text style={[styles.colName, styles.footLabel, { color: colors.text }]} numberOfLines={1}>
                              Total Sales
                            </Text>
                            <Text style={[styles.colMini, styles.footValue, { color: colors.text }]}>
                              {totalSoldItems}
                            </Text>
                            <Text style={[styles.colMoney, styles.footValue, { color: colors.text }]} numberOfLines={1}>
                              ${totalProductRevenue.toFixed(2)}
                            </Text>
                            <Text style={[styles.colMoney, styles.footValue, { color: PROFIT_GREEN }]} numberOfLines={1}>
                              ${totalProfit.toFixed(2)}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  )}
                </View>
              </View>
            }
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.textMuted }]}>
                No sales in this range. Complete a sale on the Sales tab to see it here.
              </Text>
            }
            renderItem={({ item }) => (
              <View
                style={[
                  styles.row,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}>
                <Pressable onPress={() => openSale(item)} style={styles.rowLeft}>
                  <Text style={[styles.inv, { color: colors.primary }]}>
                    INV-{String(item.id).padStart(6, '0')}
                  </Text>
                  <Text style={[styles.when, { color: colors.textMuted }]}>
                    {formatHarare(item.created_at)}
                  </Text>
                  <Text style={[styles.when, { color: colors.textMuted }]}>
                    Profit: ${Number(item.estimated_profit || 0).toFixed(2)}
                  </Text>
                </Pressable>
                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                  <Text style={[styles.tot, { color: colors.text }]}>${Number(item.total).toFixed(2)}</Text>
                  <Pressable
                    onPress={() => openReversalModal(item)}
                    disabled={reversalBusySaleId === item.id}
                    style={[
                      styles.productViewBtn,
                      {
                        minHeight: 32,
                        paddingHorizontal: 10,
                        backgroundColor: colors.inputBg,
                        borderColor: colors.border,
                        opacity: reversalBusySaleId === item.id ? 0.6 : 1,
                      },
                    ]}>
                    <Text style={[styles.productViewBtnText, { color: colors.text }]}>
                      {reversalBusySaleId === item.id ? 'Working…' : 'Reverse items'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.advancedList}>
            <View style={styles.topStatsRow}>
              <View style={[styles.rangeTotalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.rangeTotalLabel, { color: colors.textMuted }]}>Total Sales Today</Text>
                <Text style={[styles.rangeTotalValue, { color: colors.text }]}>${totalSalesToday.toFixed(2)}</Text>
              </View>
              <View style={[styles.rangeTotalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.rangeTotalLabel, { color: colors.textMuted }]}>Total Profit</Text>
                <Text style={[styles.rangeTotalValue, { color: PROFIT_GREEN }]}>${totalProfit.toFixed(2)}</Text>
              </View>
              <View style={[styles.rangeTotalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.rangeTotalLabel, { color: colors.textMuted }]}>Total Items Sold</Text>
                <Text style={[styles.rangeTotalValue, { color: colors.text }]}>{totalSoldItems}</Text>
              </View>
            </View>
            <View style={[styles.alertCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.alertLabel, { color: colors.textMuted }]}>Low Stock Alerts</Text>
              <Text style={[styles.alertValue, { color: '#b42318' }]}>{lowStockAlerts}</Text>
            </View>

            <View style={styles.productViewTabs}>
              <Pressable
                onPress={() => setAdvancedChart('salesTrend')}
                style={[
                  styles.productViewBtn,
                  {
                    backgroundColor: advancedChart === 'salesTrend' ? colors.primary : colors.inputBg,
                    borderColor: colors.border,
                  },
                ]}>
                <Text style={[styles.productViewBtnText, { color: advancedChart === 'salesTrend' ? colors.onPrimary : colors.text }]}>
                  Sales Trend
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setAdvancedChart('topSelling')}
                style={[
                  styles.productViewBtn,
                  {
                    backgroundColor: advancedChart === 'topSelling' ? colors.primary : colors.inputBg,
                    borderColor: colors.border,
                  },
                ]}>
                <Text style={[styles.productViewBtnText, { color: advancedChart === 'topSelling' ? colors.onPrimary : colors.text }]}>
                  Top Products
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setAdvancedChart('profit')}
                style={[
                  styles.productViewBtn,
                  {
                    backgroundColor: advancedChart === 'profit' ? colors.primary : colors.inputBg,
                    borderColor: colors.border,
                  },
                ]}>
                <Text style={[styles.productViewBtnText, { color: advancedChart === 'profit' ? colors.onPrimary : colors.text }]}>
                  Profit
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setAdvancedChart('stock')}
                style={[
                  styles.productViewBtn,
                  {
                    backgroundColor: advancedChart === 'stock' ? colors.primary : colors.inputBg,
                    borderColor: colors.border,
                  },
                ]}>
                <Text style={[styles.productViewBtnText, { color: advancedChart === 'stock' ? colors.onPrimary : colors.text }]}>
                  Stock
                </Text>
              </Pressable>
            </View>

            {advancedChart === 'salesTrend' ? (
              <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>Total Sales Over Time</Text>
                {dailySalesChart.values.length === 0 ? (
                  <Text style={[styles.metricHint, { color: colors.textMuted }]}>No sales data for this range.</Text>
                ) : (
                  <LineChart
                    data={{ labels: dailySalesChart.labels, datasets: [{ data: dailySalesChart.values }] }}
                    width={chartWidth}
                    height={220}
                    chartConfig={chartConfig}
                    withInnerLines
                    withOuterLines={false}
                    bezier
                    style={styles.chartBlock}
                  />
                )}
              </View>
            ) : null}

            {advancedChart === 'topSelling' ? (
              <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>Top-Selling Products (Top 5)</Text>
                {topSellingProducts.length === 0 ? (
                  <Text style={[styles.metricHint, { color: colors.textMuted }]}>No product sales in this range.</Text>
                ) : (
                  <BarChart
                    data={{
                      labels: topSellingProducts.map((p) => String(p.productName || 'Item').slice(0, 8)),
                      datasets: [{ data: topSellingProducts.map((p) => Number(p.soldQty || 0)) }],
                    }}
                    width={chartWidth}
                    height={230}
                    chartConfig={chartConfig}
                    fromZero
                    withInnerLines
                    showValuesOnTopOfBars
                    style={styles.chartBlock}
                  />
                )}
              </View>
            ) : null}

            {advancedChart === 'profit' ? (
              <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>Profit Per Product (Top 5)</Text>
                {mostProfitableProducts.length === 0 ? (
                  <Text style={[styles.metricHint, { color: colors.textMuted }]}>Add cost prices to view profit leaders.</Text>
                ) : (
                  <BarChart
                    data={{
                      labels: mostProfitableProducts.map((p) => String(p.productName || 'Item').slice(0, 8)),
                      datasets: [{ data: mostProfitableProducts.map((p) => Number(p.profit || 0)) }],
                    }}
                    width={chartWidth}
                    height={230}
                    chartConfig={{ ...chartConfig, color: (opacity = 1) => `rgba(6, 118, 71, ${opacity})` }}
                    fromZero
                    withInnerLines
                    showValuesOnTopOfBars
                    style={styles.chartBlock}
                  />
                )}
              </View>
            ) : null}

            {advancedChart === 'stock' ? (
              <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>Stock Levels (Top 5 Products)</Text>
                {topSellingProducts.length === 0 ? (
                  <Text style={[styles.metricHint, { color: colors.textMuted }]}>No products to show.</Text>
                ) : (
                  topSellingProducts.map((p) => {
                    const stock = Number(p.remainingStock || 0);
                    const tone = getStockBadgeTone(stock);
                    const maxStockValue = Math.max(...topSellingProducts.map((x) => Number(x.remainingStock || 0)), 1);
                    const widthPct = Math.min(100, Math.round((stock / maxStockValue) * 100));
                    return (
                      <View key={`stock-${p.productId}`} style={styles.stockRow}>
                        <View style={styles.stockNameWrap}>
                          <Text style={[styles.stockName, { color: colors.text }]} numberOfLines={1}>
                            {p.productName}
                          </Text>
                        </View>
                        <View style={[styles.stockTrack, { backgroundColor: colors.inputBg }]}>
                          <View style={[styles.stockFill, { width: `${widthPct}%`, backgroundColor: tone.text }]} />
                        </View>
                        <Text style={[styles.stockValue, { color: tone.text }]}>{stock}</Text>
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}
          </ScrollView>
        )
      ) : null}

      <Modal
        visible={!!reversalModal}
        transparent
        animationType="slide"
        onRequestClose={() => setReversalModal(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.reversalModalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setReversalModal(null)} />
          <View
            style={[
              styles.reversalSheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                paddingBottom: Math.max(16, insets.bottom + 12),
              },
            ]}>
            <Text style={[styles.reversalTitle, { color: colors.text }]}>
              Reverse items
              {reversalModal ? ` · INV-${String(reversalModal.sale.id).padStart(6, '0')}` : ''}
            </Text>
            <Text style={[styles.reversalHint, { color: colors.textMuted }]}>
              Enter how many units to return to stock per line (max = units still counted as sold).
            </Text>
            <FlatList
              data={reversalModal?.lines || []}
              keyExtractor={(l) => String(l.saleItemId)}
              style={styles.reversalList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: line }) => (
                <View style={[styles.reversalLineCard, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
                  <Text style={[styles.reversalLineName, { color: colors.text }]} numberOfLines={2}>
                    {line.name}
                  </Text>
                  <Text style={[styles.reversalLineMeta, { color: colors.textMuted }]}>
                    Max to reverse: {Number(line.netQuantity || 0)}
                  </Text>
                  <TextInput
                    value={String(line.draftQty ?? '')}
                    onChangeText={(t) => updateReversalDraft(line.saleItemId, t)}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    style={[
                      styles.reversalQtyInput,
                      { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text },
                    ]}
                  />
                </View>
              )}
            />
            <Text style={[styles.reversalReasonLabel, { color: colors.textMuted }]}>Reason (optional)</Text>
            <TextInput
              value={reversalReason}
              onChangeText={setReversalReason}
              placeholder="e.g. customer return"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.reversalReasonInput,
                { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text },
              ]}
            />
            <View style={styles.reversalActions}>
              <Pressable
                onPress={() => setReversalModal(null)}
                style={[styles.reversalGhostBtn, { borderColor: colors.border }]}>
                <Text style={[styles.reversalGhostBtnText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitReversalFromModal}
                disabled={reversalBusySaleId !== null}
                style={[
                  styles.reversalPrimaryBtn,
                  { backgroundColor: colors.primary },
                  reversalBusySaleId !== null && { opacity: 0.6 },
                ]}>
                <Text style={[styles.reversalPrimaryBtnText, { color: colors.onPrimary }]}>Apply reversal</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ReceiptModal
        visible={histVisible}
        receipt={histReceipt}
        onClose={() => setHistVisible(false)}
        onPrint={printThermalReceipt}
      />
    </SafeAreaView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    safe: { flex: 1 },
    topSection: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '800',
      marginBottom: 4,
    },
    sectionHint: {
      fontSize: 13,
      marginBottom: 12,
      lineHeight: 18,
    },
    inputsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    inputCol: {
      flex: 1,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 14,
      fontSize: 16,
      minHeight: 52,
    },
    applyBtn: {
      marginTop: 14,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      minHeight: 50,
      justifyContent: 'center',
    },
    applyBtnText: {
      fontSize: 16,
      fontWeight: '800',
    },
    presetTitle: {
      fontSize: 16,
      fontWeight: '800',
      marginTop: 20,
      marginBottom: 10,
    },
    presetGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    presetBtn: {
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      width: '48%',
      maxWidth: '48%',
      alignItems: 'center',
    },
    presetBtnText: {
      fontSize: 15,
      fontWeight: '800',
    },
    resultsBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 12,
      borderBottomWidth: 1,
      gap: 4,
    },
    backHit: {
      paddingVertical: 10,
      paddingHorizontal: 8,
      minWidth: 88,
    },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    backText: {
      fontSize: 17,
      fontWeight: '800',
    },
    backSpacer: {
      minWidth: 88,
    },
    headingWrap: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    resultsHeading: {
      fontSize: 20,
      fontWeight: '900',
      textAlign: 'center',
    },
    resultsSub: {
      fontSize: 13,
      fontWeight: '600',
      marginTop: 4,
      textAlign: 'center',
    },
    reportTabsRow: {
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
      borderBottomWidth: 1,
    },
    reportTabBtn: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 10,
      minHeight: 38,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    reportTabBtnText: {
      fontSize: 13,
      fontWeight: '800',
    },
    listFlex: {
      flex: 1,
    },
    hintBox: {
      padding: 20,
      flex: 1,
    },
    hintText: {
      fontSize: 16,
      textAlign: 'center',
      lineHeight: 22,
    },
    list: {
      padding: 16,
      paddingBottom: 40,
    },
    metricsWrap: {
      marginBottom: 14,
      gap: 10,
    },
    topStatsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    rangeTotalCard: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    rangeTotalLabel: {
      fontSize: 11,
      fontWeight: '700',
      marginBottom: 3,
    },
    rangeTotalValue: {
      fontSize: 20,
      fontWeight: '900',
    },
    metricCard: {
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    metricLabel: {
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 3,
    },
    metricValue: {
      fontSize: 20,
      fontWeight: '900',
    },
    metricHint: {
      fontSize: 12,
      lineHeight: 17,
      paddingHorizontal: 2,
    },
    productViewTabs: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
      marginBottom: 8,
    },
    productViewBtn: {
      borderWidth: 1,
      borderRadius: 10,
      minHeight: 36,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    productViewBtnText: {
      fontSize: 13,
      fontWeight: '800',
    },
    productGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2,
    },
    productGridCard: {
      width: '48%',
      borderWidth: 1,
      borderRadius: 12,
      padding: 10,
      minHeight: 160,
    },
    productGridHeadRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 6,
    },
    productGridName: {
      flex: 1,
      fontSize: 14,
      fontWeight: '800',
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 8,
    },
    badge: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
      maxWidth: '100%',
    },
    categoryBadge: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
      maxWidth: '45%',
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    productGridMoneyRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 3,
      gap: 6,
    },
    productGridMoneyLabel: {
      fontSize: 11,
      fontWeight: '700',
    },
    productGridMoneyValue: {
      fontSize: 13,
      fontWeight: '800',
    },
    productGridProfit: {
      fontSize: 12,
      fontWeight: '900',
    },
    profitStockRow: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
    },
    stockBadgeBottom: {
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    stockBadgeBottomText: {
      fontSize: 10,
      fontWeight: '800',
    },
    productTableWrap: {
      marginTop: 8,
      width: '100%',
      alignSelf: 'stretch',
    },
    productTableInner: {
      width: '100%',
    },
    productHeadRow: {
      paddingTop: 0,
    },
    productRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      paddingVertical: 8,
      width: '100%',
      gap: 4,
    },
    productFootRow: {
      borderBottomWidth: 0,
      borderTopWidth: 1,
      marginTop: 2,
      paddingTop: 10,
    },
    colHead: {
      fontSize: 10,
      fontWeight: '800',
    },
    colName: {
      flex: 2.1,
      minWidth: 0,
      fontSize: 12,
      fontWeight: '700',
      paddingRight: 2,
    },
    colMini: {
      flex: 0.55,
      flexGrow: 0,
      flexBasis: 34,
      maxWidth: 44,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'right',
    },
    colMoney: {
      flex: 1,
      minWidth: 0,
      fontSize: 11,
      fontWeight: '800',
      textAlign: 'right',
    },
    tableEmptyMessage: {
      flex: 1,
      minWidth: 0,
      fontSize: 13,
      fontWeight: '600',
    },
    footLabel: {
      fontSize: 12,
      fontWeight: '800',
    },
    footValue: {
      fontSize: 14,
      fontWeight: '900',
    },
    advancedList: {
      padding: 16,
      paddingBottom: 32,
      gap: 10,
    },
    alertCard: {
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    alertLabel: {
      fontSize: 12,
      fontWeight: '700',
    },
    alertValue: {
      fontSize: 22,
      fontWeight: '900',
    },
    chartCard: {
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 10,
      overflow: 'hidden',
    },
    chartTitle: {
      fontSize: 14,
      fontWeight: '800',
      marginBottom: 8,
    },
    chartBlock: {
      borderRadius: 10,
      marginLeft: -8,
    },
    stockRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
      gap: 8,
    },
    stockNameWrap: {
      width: 110,
    },
    stockName: {
      fontSize: 12,
      fontWeight: '700',
    },
    stockTrack: {
      flex: 1,
      height: 10,
      borderRadius: 999,
      overflow: 'hidden',
    },
    stockFill: {
      height: '100%',
      borderRadius: 999,
    },
    stockValue: {
      width: 34,
      textAlign: 'right',
      fontSize: 12,
      fontWeight: '800',
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    empty: {
      textAlign: 'center',
      fontSize: 16,
      marginTop: 32,
      paddingHorizontal: 16,
      lineHeight: 22,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      marginBottom: 10,
    },
    rowLeft: {
      flex: 1,
      paddingRight: 12,
    },
    inv: {
      fontSize: 16,
      fontWeight: '800',
    },
    when: {
      fontSize: 14,
      marginTop: 4,
    },
    tot: {
      fontSize: 18,
      fontWeight: '900',
    },
    reversalModalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    reversalSheet: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingTop: 16,
      maxHeight: '88%',
    },
    reversalTitle: {
      fontSize: 18,
      fontWeight: '900',
      marginBottom: 6,
    },
    reversalHint: {
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 12,
    },
    reversalList: {
      maxHeight: 280,
      marginBottom: 8,
    },
    reversalLineCard: {
      borderWidth: 1,
      borderRadius: 10,
      padding: 10,
      marginBottom: 8,
    },
    reversalLineName: {
      fontSize: 15,
      fontWeight: '800',
    },
    reversalLineMeta: {
      fontSize: 12,
      marginTop: 4,
    },
    reversalQtyInput: {
      marginTop: 8,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 10,
      fontSize: 16,
    },
    reversalReasonLabel: {
      fontSize: 12,
      fontWeight: '700',
      marginTop: 4,
    },
    reversalReasonInput: {
      marginTop: 6,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 10,
      fontSize: 15,
    },
    reversalActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
    },
    reversalGhostBtn: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
    },
    reversalGhostBtnText: {
      fontSize: 15,
      fontWeight: '800',
    },
    reversalPrimaryBtn: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
    },
    reversalPrimaryBtnText: {
      fontSize: 15,
      fontWeight: '900',
    },
  });
}
