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
  const [savingEdit, setSavingEdit] = useState(false);
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
  };

  const closeEdit = () => {
    setEditProduct(null);
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
    setSavingEdit(true);
    try {
      await productService.updateProduct({
        userId: user?.id,
        id: editProduct.id,
        name: editName.trim(),
        price: p,
        stock: s,
        category: editCategory.trim() || 'General',
        costPrice: costVal,
      });
      closeEdit();
      await loadItems();
      await notifyDataChanged();
      Alert.alert('Saved', 'Product updated.');
    } catch (e) {
      Alert.alert('Error', e?.message ?? 'Could not save.');
    } finally {
      setSavingEdit(false);
    }
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

  const editModalCardMax = Math.min(windowHeight * 0.94, windowHeight - 24);
  /** Room for title, paddings, and Save/Cancel row — keeps the form scroll inside the card. */
  const editModalScrollMax = Math.max(260, editModalCardMax - 200);
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const name = String(item.name || '').toLowerCase();
      const category = String(item.category || '').toLowerCase();
      return name.includes(q) || category.includes(q);
    });
  }, [items, searchQuery]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader
        title="Stock"
        subtitle="Adjust your stock from here."
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

      <View style={[styles.toggleRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.toggleLabel, { color: colors.text }]}>Show removed products</Text>
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
      <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search name or category"
          placeholderTextColor={colors.textMuted}
          style={[styles.searchInput, { color: colors.text }]}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => String(item.id)}
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

      <Modal visible={!!editProduct} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeEdit} accessibilityLabel="Close" />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKb}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View
                style={[
                  styles.modalCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    maxHeight: editModalCardMax,
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
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    toggleLabel: {
      fontSize: 16,
      fontWeight: '700',
    },
    toggleChip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
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
      width: '100%',
    },
    modalCard: {
      borderRadius: 16,
      borderWidth: 1,
      width: '100%',
      padding: 16,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '800',
      marginBottom: 12,
    },
    modalScroll: {
      flexGrow: 0,
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
