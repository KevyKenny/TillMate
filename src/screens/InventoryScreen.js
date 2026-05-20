import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
  ToastAndroid,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '../components/ScreenHeader';
import { useAppTheme } from '../context/AppThemeContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import * as productService from '../services/productService';
import { formatHarare } from '../utils/datetime';

function marginLine(item) {
  const cost = item.cost_price;
  if (cost === null || cost === undefined || Number.isNaN(Number(cost))) {
    return null;
  }
  const c = Number(cost);
  const p = Number(item.price);
  const per = Math.round((p - c) * 100) / 100;
  return `Cost $${c.toFixed(2)} · Margin/unit $${per.toFixed(2)}`;
}

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export default function InventoryScreen() {
  const { height: windowHeight } = useWindowDimensions();
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const { notifyDataChanged, dataVersion, ready } = useCart();
  const [showRemoved, setShowRemoved] = useState(false);
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');
  const [editCost, setEditCost] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [stockTab, setStockTab] = useState('overview');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editReason, setEditReason] = useState('');
  const styles = useMemo(() => makeStyles(), []);

  const loadItems = useCallback(async () => {
    if (!user?.id) {
      setItems([]);
      return;
    }
    const rows = await productService.getAllProducts(user?.id, !showRemoved);
    setItems(rows);
  }, [showRemoved, user?.id]);

  useEffect(() => {
    loadItems();
  }, [loadItems, dataVersion]);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadItems();
      await notifyDataChanged();
    } finally {
      setRefreshing(false);
    }
  }, [loadItems, notifyDataChanged]);

  const openEdit = (item) => {
    if (item.deleted_at) return;
    setEditProduct(item);
    setEditName(item.name);
    setEditCategory(item.category || 'General');
    setEditPrice(String(item.price));
    setEditStock(String(item.stock));
    setEditCost(
      item.cost_price === null || item.cost_price === undefined ? '' : String(item.cost_price)
    );
    setEditReason('');
  };

  const closeEdit = () => {
    setEditProduct(null);
  };

  const runSave = async () => {
    if (!editProduct) return;
    const p = parseFloat(editPrice);
    const s = parseInt(editStock, 10);
    setSavingEdit(true);
    try {
      await productService.updateProduct({
        userId: user?.id,
        id: editProduct.id,
        name: editName.trim(),
        price: p,
        stock: s,
        category: editCategory.trim() || 'General',
        costPrice: parseFloat(String(editCost).trim().replace(',', '.')),
        reason: editReason,
      });
      closeEdit();
      await loadItems();
      await notifyDataChanged();
      Alert.alert('Saved', 'Product updated.');
    } catch (e) {
      const msg = String(e?.message || '');
      if (
        Platform.OS === 'android' &&
        (msg.startsWith('Insufficient capital') || msg.startsWith('Reason is required'))
      ) {
        ToastAndroid.show(msg, ToastAndroid.LONG);
      } else {
        Alert.alert('Error', e?.message ?? 'Could not save.');
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const saveEdit = async () => {
    if (!editProduct) return;
    const p = parseFloat(editPrice);
    const s = parseInt(editStock, 10);
    if (!editName.trim()) {
      Alert.alert('Missing name', 'Enter a product name.');
      return;
    }
    if (Number.isNaN(p) || p < 0) {
      Alert.alert('Invalid price', 'Enter a valid selling price.');
      return;
    }
    if (Number.isNaN(s) || s < 0) {
      Alert.alert('Invalid stock', 'Enter a whole number for stock.');
      return;
    }
    const costRaw = String(editCost).trim();
    const costVal =
      costRaw === '' ? null : parseFloat(costRaw.replace(',', '.'));
    if (costVal === null || Number.isNaN(costVal) || costVal < 0) {
      Alert.alert('Invalid cost', 'Cost is required and must be a valid amount.');
      return;
    }
    const prevStock = Math.max(0, Math.floor(Number(editProduct.stock || 0)));
    const prevCost =
      editProduct.cost_price == null || Number.isNaN(Number(editProduct.cost_price))
        ? 0
        : Number(editProduct.cost_price);
    const oldTotal = roundMoney(prevStock * prevCost);
    const newTotal = roundMoney(s * costVal);
    const valueDiff = roundMoney(newTotal - oldTotal);
    const costChanged = Math.abs(prevCost - costVal) > 1e-9;
    const needsReason =
      s !== prevStock ||
      costChanged ||
      Math.abs(valueDiff) > 1e-9;
    if (needsReason && !editReason.trim()) {
      Alert.alert(
        'Reason required',
        'Enter a short note whenever stock quantity, cost price, or total inventory value changes. This is stored on the finance ledger.'
      );
      return;
    }
    await runSave();
  };

  const confirmRemove = (product) => {
    Alert.alert(
      'Remove from shelf?',
      `"${product.name}" will be hidden from sales and stock lists. Past sales stay intact. You can show removed items and restore later.`,
      [
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              const deletedName = await productService.hardDeleteProduct(user?.id, product.id);
              await loadItems();
              await notifyDataChanged();
              Alert.alert('Deleted', `${deletedName || product.name} was permanently deleted.`);
            } catch (e) {
              Alert.alert('Error', e?.message ?? 'Could not delete product.');
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await productService.softDeleteProduct(user?.id, product.id);
              await loadItems();
              await notifyDataChanged();
            } catch (e) {
              Alert.alert('Error', e?.message ?? 'Could not remove.');
            }
          },
        },
      ]
    );
  };

  const restore = async (product) => {
    try {
      await productService.restoreProduct(user?.id, product.id);
      await loadItems();
      await notifyDataChanged();
    } catch (e) {
      Alert.alert('Error', e?.message ?? 'Could not restore.');
    }
  };

  /** Caps form scroll area; uses window height (post–keyboard-resize on Android) so the sheet stays usable. */
  const editModalScrollMax = Math.max(180, Math.min(windowHeight * 0.62, windowHeight - 230));

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const name = String(item.name || '').toLowerCase();
      const category = String(item.category || '').toLowerCase();
      return name.includes(q) || category.includes(q);
    });
  }, [items, searchQuery]);

  const tableRows = useMemo(
    () =>
      [...filteredItems].sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
      ),
    [filteredItems]
  );

  const tableTotals = useMemo(() => {
    let units = 0;
    let costSum = 0;
    for (const row of tableRows) {
      const c = Math.max(0, Math.floor(Number(row.stock || 0)));
      const unitCost =
        row.cost_price == null || Number.isNaN(Number(row.cost_price)) ? 0 : Number(row.cost_price);
      units += c;
      costSum += c * unitCost;
    }
    return { units, cost: roundMoney(costSum) };
  }, [tableRows]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader
        title="Stock"
        subtitle={stockTab === 'overview' ? 'Book value by product, or switch to Manage to edit.' : 'Search, edit, remove, or restore products.'}
        rightSlot={
          <Pressable
            onPress={onRefresh}
            style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.75 : 1 }]}
            accessibilityLabel="Refresh stock and sync sales grid"
            hitSlop={10}>
            <Ionicons name="refresh" size={22} color={colors.primary} />
          </Pressable>
        }
      />

      <View style={[styles.stockTopRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.tabGroup}>
          <Pressable
            onPress={() => setStockTab('overview')}
            style={[
              styles.stockTab,
              stockTab === 'overview' && { backgroundColor: colors.primary },
              { borderColor: colors.border },
            ]}>
            <Text
              style={[
                styles.stockTabText,
                { color: stockTab === 'overview' ? colors.onPrimary : colors.text },
              ]}>
              Overview
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setStockTab('manage')}
            style={[
              styles.stockTab,
              stockTab === 'manage' && { backgroundColor: colors.primary },
              { borderColor: colors.border },
            ]}>
            <Text
              style={[
                styles.stockTabText,
                { color: stockTab === 'manage' ? colors.onPrimary : colors.text },
              ]}>
              Manage
            </Text>
          </Pressable>
        </View>
        <View style={styles.removedInline}>
          <Text
            style={[styles.toggleLabelInline, { color: colors.text }]}
            numberOfLines={2}
            accessibilityLabel="Show removed products">
            Show removed products
          </Text>
          <Pressable
            onPress={() => setShowRemoved((v) => !v)}
            style={[
              styles.toggleChip,
              { borderColor: colors.border, backgroundColor: showRemoved ? colors.primary : colors.inputBg },
            ]}>
            <Text style={{ fontWeight: '800', color: showRemoved ? colors.onPrimary : colors.text }}>
              {showRemoved ? 'On' : 'Off'}
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={stockTab === 'overview' ? 'Filter table by name or category' : 'Search name or category'}
          placeholderTextColor={colors.textMuted}
          style={[styles.searchInput, { color: colors.text }]}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {stockTab === 'overview' ? (
        <View
          style={[
            styles.stockTableCard,
            { borderColor: colors.border, backgroundColor: colors.surface },
          ]}>
          <FlatList
            data={tableRows}
            keyExtractor={(item) => String(item.id)}
            style={styles.tabListFlex}
            contentContainerStyle={styles.stockTableListContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
            ListHeaderComponent={
              <View style={[styles.stockTableRow, styles.stockTableHeadRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.stockColProduct, styles.stockColHead, { color: colors.textMuted }]}>Product</Text>
                <Text style={[styles.stockColCount, styles.stockColHead, { color: colors.textMuted }]} numberOfLines={1}>
                  Count
                </Text>
                <Text style={[styles.stockColMoney, styles.stockColHead, { color: colors.textMuted }]}>Total Cost</Text>
              </View>
            }
            ListEmptyComponent={
              <View style={[styles.stockTableRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.stockColProduct, styles.stockTableEmpty, { color: colors.textMuted }]}>
                  {!ready ? 'Loading…' : 'No products in this view.'}
                </Text>
              </View>
            }
            ListFooterComponent={
              tableRows.length > 0 ? (
                <View style={[styles.stockTableRow, styles.stockTableFootRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.stockColProduct, styles.stockFootLabel, { color: colors.text }]} numberOfLines={1}>
                    Totals
                  </Text>
                  <Text style={[styles.stockColCount, styles.stockFootValue, { color: colors.text }]}>
                    {tableTotals.units}
                  </Text>
                  <Text style={[styles.stockColMoney, styles.stockFootValue, { color: colors.primary }]} numberOfLines={1}>
                    ${tableTotals.cost.toFixed(2)}
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const removed = !!item.deleted_at;
              const count = Math.max(0, Math.floor(Number(item.stock || 0)));
              const unitCost =
                item.cost_price == null || Number.isNaN(Number(item.cost_price)) ? 0 : Number(item.cost_price);
              const lineTotal = roundMoney(count * unitCost);
              return (
                <View
                  style={[
                    styles.stockTableRow,
                    { borderBottomColor: colors.border },
                    removed && { opacity: 0.65 },
                  ]}>
                  <Text
                    style={[styles.stockColProduct, styles.stockCellText, { color: colors.text }, removed && styles.strike]}
                    numberOfLines={1}
                    ellipsizeMode="tail">
                    {item.name}
                    {removed ? ' (removed)' : ''}
                  </Text>
                  <Text
                    style={[
                      styles.stockColCount,
                      styles.stockCellText,
                      { color: count <= 5 ? colors.danger ?? '#b42318' : colors.text },
                    ]}>
                    {count}
                  </Text>
                  <Text style={[styles.stockColMoney, styles.stockCellText, { color: colors.text }]} numberOfLines={1}>
                    ${lineTotal.toFixed(2)}
                  </Text>
                </View>
              );
            }}
          />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => String(item.id)}
          style={styles.tabListFlex}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              {!ready ? 'Loading…' : searchQuery ? 'No matching products.' : 'No products in this view.'}
            </Text>
          }
          renderItem={({ item }) => {
          const removed = !!item.deleted_at;
          const margin = marginLine(item);
          const dateOpts = { dateStyle: 'short', timeStyle: 'short' };
          const added = formatHarare(item.created_at, dateOpts);
          const modified = formatHarare(item.updated_at || item.created_at, dateOpts);
          return (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: removed ? 0.72 : 1,
                },
              ]}>
              {removed ? (
                <Text style={[styles.removedBadge, { color: colors.danger }]}>Removed</Text>
              ) : null}
              <Pressable
                onPress={() => !removed && openEdit(item)}
                disabled={removed}
                style={({ pressed }) => [styles.cardBody, !removed && pressed && { opacity: 0.92 }]}>
                <View style={styles.topRow}>
                  <Text
                    style={[styles.nameTop, { color: colors.text }, removed && styles.strike]}
                    numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text
                    style={[styles.catTop, { color: colors.primary }]}
                    numberOfLines={1}>
                    {item.category || 'General'}
                  </Text>
                </View>
                <Text style={[styles.price, { color: colors.primary }]}>
                  ${Number(item.price).toFixed(2)} each
                </Text>
                {margin ? (
                  <Text style={[styles.margin, { color: colors.textMuted }]}>{margin}</Text>
                ) : null}
                <Text style={[styles.stockLine, { color: colors.textMuted }]}>
                  Stock <Text style={[styles.stockNumInline, { color: colors.text }]}>{item.stock}</Text> units
                </Text>
              </Pressable>
              {!removed ? (
                <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                  <View style={styles.dateCol}>
                    <Text style={[styles.dateLine, { color: colors.textMuted }]}>
                      Added <Text style={{ color: colors.text }}>{added || '—'}</Text>
                    </Text>
                    <Text style={[styles.dateLine, { color: colors.textMuted }]}>
                      Modified <Text style={{ color: colors.text }}>{modified || '—'}</Text>
                    </Text>
                  </View>
                  <View style={styles.iconActions}>
                    <Pressable
                      accessibilityLabel="Edit product"
                      onPress={() => openEdit(item)}
                      style={({ pressed }) => [
                        styles.iconBtn,
                        { borderColor: colors.border, backgroundColor: colors.inputBg },
                        pressed && { opacity: 0.75 },
                      ]}>
                      <Ionicons name="pencil" size={20} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Remove from shelf"
                      onPress={() => confirmRemove(item)}
                      style={({ pressed }) => [
                        styles.iconBtn,
                        { borderColor: colors.border, backgroundColor: colors.inputBg },
                        pressed && { opacity: 0.75 },
                      ]}>
                      <Ionicons name="trash-outline" size={20} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable onPress={() => restore(item)} style={styles.restoreBtn}>
                  <Text style={[styles.restoreText, { color: colors.primary }]}>Restore product</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />
      )}

      <Modal visible={!!editProduct} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeEdit} accessibilityLabel="Close" />
          <KeyboardAvoidingView
            // Android: `height` shrinks this view with the keyboard and collapses the card; rely on
            // window resize + ScrollView instead. iOS: `padding` lifts content above the keyboard.
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKb}>
            <Pressable onPress={(e) => e.stopPropagation()} style={styles.modalPressableInner}>
              <View
                style={[
                  styles.modalCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edit product</Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={[styles.modalScroll, { maxHeight: editModalScrollMax }]}
              contentContainerStyle={styles.modalScrollContent}>
              <Text style={[styles.modalLabel, { color: colors.text }]}>Name</Text>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
              />
              <Text style={[styles.modalLabel, { color: colors.text }]}>Category</Text>
              <TextInput
                value={editCategory}
                onChangeText={setEditCategory}
                style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
              />
              <Text style={[styles.modalLabel, { color: colors.text }]}>Selling price ($)</Text>
              <TextInput
                value={editPrice}
                onChangeText={setEditPrice}
                keyboardType="decimal-pad"
                style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
              />
              <Text style={[styles.modalLabel, { color: colors.text }]}>Stock</Text>
              <TextInput
                value={editStock}
                onChangeText={setEditStock}
                keyboardType="number-pad"
                style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
              />
              <Text style={[styles.modalLabel, { color: colors.text }]}>Cost ($)</Text>
              <TextInput
                value={editCost}
                onChangeText={setEditCost}
                keyboardType="decimal-pad"
                placeholder="(Total Cost price / Quantity)"
                placeholderTextColor={colors.textMuted}
                style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
              />
              <Text style={[styles.modalLabel, { color: colors.text }]}>
                Reason (required when quantity, cost, or inventory value changes)
              </Text>
              <TextInput
                value={editReason}
                onChangeText={setEditReason}
                placeholder="e.g. damaged stock, count correction"
                placeholderTextColor={colors.textMuted}
                style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
              />
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable onPress={closeEdit} style={[styles.modalGhost, { borderColor: colors.border }]}>
                <Text style={[styles.modalGhostTxt, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveEdit}
                disabled={savingEdit}
                style={[styles.modalSave, { backgroundColor: colors.primary }, savingEdit && { opacity: 0.55 }]}>
                <Text style={[styles.modalSaveTxt, { color: colors.onPrimary }]}>
                  {savingEdit ? 'Saving…' : 'Save'}
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
    stockTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
    },
    tabGroup: {
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      minWidth: 0,
    },
    removedInline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 1,
      minWidth: 0,
      marginLeft: 4,
    },
    toggleLabelInline: {
      fontSize: 11,
      fontWeight: '700',
      flexShrink: 1,
      textAlign: 'right',
      minWidth: 0,
      maxWidth: 118,
    },
    stockTab: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
    },
    stockTabText: { fontSize: 14, fontWeight: '800' },
    tabListFlex: { flex: 1 },
    stockTableCard: {
      flex: 1,
      marginHorizontal: 16,
      marginTop: 8,
      borderRadius: 12,
      borderWidth: 1,
      overflow: 'hidden',
      minHeight: 100,
    },
    stockTableListContent: {
      flexGrow: 1,
      paddingBottom: 24,
    },
    stockTableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      paddingVertical: 8,
      paddingHorizontal: 12,
      gap: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    stockTableHeadRow: {
      paddingTop: 4,
      borderBottomWidth: 1,
    },
    stockTableFootRow: {
      borderBottomWidth: 0,
      borderTopWidth: 1,
      paddingTop: 10,
      paddingBottom: 10,
      marginTop: 0,
    },
    stockColProduct: {
      flex: 2.1,
      minWidth: 0,
      paddingRight: 2,
    },
    stockColCount: {
      flexGrow: 0,
      flexShrink: 0,
      width: 54,
      minWidth: 54,
      textAlign: 'center',
    },
    stockColMoney: {
      flex: 1,
      minWidth: 0,
      textAlign: 'right',
    },
    stockColHead: {
      fontSize: 10,
      fontWeight: '800',
    },
    stockCellText: {
      fontSize: 12,
      fontWeight: '700',
    },
    stockTableEmpty: {
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      fontWeight: '600',
      paddingVertical: 6,
    },
    stockFootLabel: {
      fontSize: 12,
      fontWeight: '800',
    },
    stockFootValue: {
      fontSize: 13,
      fontWeight: '900',
    },
    toggleChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
    },
    list: {
      padding: 16,
      paddingBottom: 32,
    },
    searchWrap: {
      marginHorizontal: 16,
      marginTop: 10,
      borderWidth: 1,
      borderRadius: 12,
      minHeight: 44,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      paddingVertical: 10,
    },
    empty: {
      fontSize: 16,
      textAlign: 'center',
      marginTop: 48,
      paddingHorizontal: 24,
    },
    card: {
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
    },
    removedBadge: {
      fontSize: 13,
      fontWeight: '800',
      marginBottom: 8,
    },
    strike: {
      textDecorationLine: 'line-through',
    },
    cardBody: {
      paddingBottom: 4,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 8,
    },
    nameTop: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      paddingRight: 4,
    },
    catTop: {
      flexShrink: 0,
      maxWidth: '42%',
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      textAlign: 'right',
    },
    price: {
      fontSize: 16,
      marginTop: 2,
      fontWeight: '600',
    },
    margin: {
      fontSize: 14,
      marginTop: 6,
    },
    stockLine: {
      fontSize: 14,
      marginTop: 8,
      fontWeight: '600',
    },
    stockNumInline: {
      fontWeight: '800',
    },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    dateCol: {
      flex: 1,
      paddingRight: 8,
    },
    dateLine: {
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '600',
    },
    iconActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    iconBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    restoreBtn: {
      marginTop: 4,
      paddingVertical: 12,
      alignSelf: 'flex-start',
    },
    restoreText: {
      fontSize: 16,
      fontWeight: '800',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: 16,
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
      borderRadius: 16,
      borderWidth: 1,
      width: '100%',
      maxHeight: '92%',
      padding: 16,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '800',
      marginBottom: 12,
    },
    modalScroll: {
      flexGrow: 0,
      flexShrink: 1,
    },
    modalScrollContent: {
      paddingBottom: 8,
    },
    modalLabel: {
      fontSize: 15,
      fontWeight: '700',
      marginTop: 8,
      marginBottom: 6,
    },
    modalInput: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 17,
      minHeight: 50,
    },
    modalActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 16,
    },
    modalGhost: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    modalGhostTxt: {
      fontSize: 16,
      fontWeight: '700',
    },
    modalSave: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    modalSaveTxt: {
      fontSize: 16,
      fontWeight: '800',
    },
  });
}
