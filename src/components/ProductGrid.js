import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/AppThemeContext';
import ProductTile from './ProductTile';

export default function ProductGrid({
  products,
  onProductPress,
  loading,
  onRefresh,
  refreshing,
  emptyText,
}) {
  const { colors } = useAppTheme();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!products.length) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          {emptyText || 'No products yet. Add some in the Stock tab.'}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={products}
      extraData={products}
      keyExtractor={(item) => String(item.id)}
      numColumns={3}
      contentContainerStyle={styles.list}
      columnWrapperStyle={styles.row}
      renderItem={({ item }) => (
        <ProductTile product={item} onPress={onProductPress} disabled={loading} />
      )}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 12,
    paddingHorizontal: 4,
  },
  row: {
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  empty: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
});
