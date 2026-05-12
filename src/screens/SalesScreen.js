import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CartPanel from '../components/CartPanel';
import ProductGrid from '../components/ProductGrid';
import ScreenHeader from '../components/ScreenHeader';
import { useAppTheme } from '../context/AppThemeContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { getAllTimeSummary } from '../services/financeService';

export default function SalesScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [listRefreshing, setListRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [capitalReady, setCapitalReady] = useState(true);
  const {
    ready,
    products,
    cart,
    addToCart,
    incrementLine,
    decrementLine,
    removeLine,
    clearCart,
    subtotal,
    beginCheckout,
    refreshProducts,
    dataVersion,
  } = useCart();

  const firstName = useMemo(() => {
    const n = String(user?.fullName || '').trim();
    if (!n) return '';
    return n.split(/\s+/)[0];
  }, [user?.fullName]);

  useEffect(() => {
    if (!user?.id) return;
    getAllTimeSummary(user.id)
      .then((s) =>
        setCapitalReady(
          Number(s.totalCapital || 0) > 0 || Number(s.totalCapitalAdjustments || 0) > 0
        )
      )
      .catch(() => {});
  }, [user?.id, dataVersion]);

  useFocusEffect(
    useCallback(() => {
      refreshProducts();
    }, [refreshProducts])
  );

  const onRefreshStock = useCallback(async () => {
    setListRefreshing(true);
    try {
      await refreshProducts();
    } finally {
      setListRefreshing(false);
    }
  }, [refreshProducts]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const name = String(p.name || '').toLowerCase();
      const category = String(p.category || '').toLowerCase();
      return name.includes(q) || category.includes(q);
    });
  }, [products, searchQuery]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader
        title="Sales"
        subtitle="Tap products to add to the cart"
        rightSlot={
          <Pressable
            onPress={onRefreshStock}
            style={({ pressed }) => [styles.headerIconBtn, { opacity: pressed ? 0.75 : 1 }]}
            accessibilityLabel="Refresh stock from database"
            hitSlop={10}>
            <Ionicons name="refresh" size={22} color={colors.primary} />
          </Pressable>
        }
      />
      <View style={styles.container}>
        {!capitalReady ? (
          <View style={[styles.welcomeBanner, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.welcomeTitle, { color: colors.text }]}>
              {firstName
                ? `Welcome, ${firstName}! Please add your starting capital to begin using TillMate.`
                : 'Welcome! Please add your starting capital to start purchasing orders!'}
            </Text>
          </View>
        ) : null}
        <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search products or category"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <ProductGrid
          products={filteredProducts}
          onProductPress={addToCart}
          loading={!ready}
          onRefresh={onRefreshStock}
          refreshing={listRefreshing}
          emptyText={searchQuery ? 'No matching products found.' : undefined}
        />
        <CartPanel
          cart={cart}
          subtotal={subtotal}
          onIncrement={incrementLine}
          onDecrement={decrementLine}
          onRemove={removeLine}
          onClear={clearCart}
          onCheckout={beginCheckout}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 8,
  },
  searchWrap: {
    marginTop: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  welcomeBanner: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  welcomeTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 10,
  },
  headerIconBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
