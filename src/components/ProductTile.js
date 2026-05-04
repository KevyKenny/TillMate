import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/AppThemeContext';

export default function ProductTile({ product, onPress, disabled }) {
  const { colors } = useAppTheme();
  const stockN = Math.max(0, Math.floor(Number(product?.stock ?? 0)));
  const out = stockN <= 0;
  const cat = product.category || 'General';

  return (
    <Pressable
      onPress={() => onPress(product)}
      disabled={disabled || out}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: colors.inputBg,
          borderColor: colors.border,
        },
        out && styles.tileDisabled,
        pressed && !out && { borderColor: colors.primary, backgroundColor: colors.surfaceElevated },
      ]}>
      <Text style={[styles.cat, { color: colors.textMuted }]} numberOfLines={1}>
        {cat}
      </Text>
      <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
        {product.name}
      </Text>
      <Text style={[styles.price, { color: colors.primary }]}>${Number(product.price).toFixed(2)}</Text>
      <View style={[styles.stockBadge, { backgroundColor: colors.surface }]}>
        <Text style={[styles.stockText, { color: colors.textMuted }]}>Stock: {stockN}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 108,
    padding: 10,
    margin: 6,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  tileDisabled: {
    opacity: 0.45,
  },
  cat: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
  },
  price: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 4,
  },
  stockBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stockText: {
    fontSize: 12,
  },
});
