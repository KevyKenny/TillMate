import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import CheckoutReviewModal from '../components/CheckoutReviewModal';
import PaymentModal from '../components/PaymentModal';
import ReceiptModal from '../components/ReceiptModal';
import { DEFAULT_TAX } from '../constants/receipt';
import { useAuth } from './AuthContext';
import { initDatabase } from '../database/db';
import * as productService from '../services/productService';
import * as salesService from '../services/salesService';
import { useThermalReceiptPrint } from '../hooks/useThermalReceiptPrint';
import { formatHarare } from '../utils/datetime';

const CartContext = createContext(null);

function formatMoney(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function CartProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const printThermalReceipt = useThermalReceiptPrint();
  const [ready, setReady] = useState(false);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [dataVersion, setDataVersion] = useState(0);

  const refreshProducts = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setProducts([]);
      return;
    }
    const rows = await productService.getActiveProducts(user.id);
    setProducts(rows);
    const byId = new Map(rows.map((p) => [p.id, p]));
    setCart((prev) =>
      prev
        .map((line) => {
          const p = byId.get(line.productId);
          if (!p) return null;
          const maxStock = p.stock;
          const quantity = Math.min(line.quantity, maxStock);
          if (quantity <= 0) return null;
          return {
            ...line,
            name: p.name,
            price: p.price,
            maxStock,
            quantity,
          };
        })
        .filter(Boolean)
    );
  }, [isAuthenticated, user?.id]);

  const notifyDataChanged = useCallback(async () => {
    await refreshProducts();
    setDataVersion((v) => v + 1);
  }, [refreshProducts]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initDatabase();
        if (!isAuthenticated || !user?.id) {
          if (!cancelled) {
            setProducts([]);
            setCart([]);
            setReady(true);
          }
          return;
        }
        const rows = await productService.getActiveProducts(user.id);
        if (!cancelled) {
          setProducts(rows);
          setReady(true);
        }
      } catch (e) {
        console.error(e);
        Alert.alert('Database error', e?.message ?? 'Could not open local database.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

  const addToCart = useCallback((product) => {
    if (product.stock <= 0) {
      Alert.alert('Out of stock', `${product.name} has no stock left.`);
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.productId === product.id);
      if (idx === -1) {
        return [
          ...prev,
          {
            productId: product.id,
            name: product.name,
            price: product.price,
            quantity: 1,
            maxStock: product.stock,
          },
        ];
      }
      const line = prev[idx];
      if (line.quantity >= line.maxStock) {
        return prev;
      }
      const next = [...prev];
      next[idx] = { ...line, quantity: line.quantity + 1 };
      return next;
    });
  }, []);

  const incrementLine = useCallback((productId) => {
    setCart((prev) =>
      prev.map((line) => {
        if (line.productId !== productId) return line;
        if (line.quantity >= line.maxStock) return line;
        return { ...line, quantity: line.quantity + 1 };
      })
    );
  }, []);

  const decrementLine = useCallback((productId) => {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.productId !== productId) return line;
          return { ...line, quantity: line.quantity - 1 };
        })
        .filter((line) => line.quantity > 0)
    );
  }, []);

  const removeLine = useCallback((productId) => {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [cart]
  );

  const beginCheckout = useCallback(() => {
    if (!cart.length) {
      Alert.alert('Empty cart', 'Add products before completing a sale.');
      return;
    }
    setReviewVisible(true);
  }, [cart.length]);

  const cancelReview = useCallback(() => setReviewVisible(false), []);

  const proceedToPayment = useCallback(() => {
    setReviewVisible(false);
    setPaymentVisible(true);
  }, []);

  const cancelPayment = useCallback(() => setPaymentVisible(false), []);

  const confirmPayment = useCallback(
    async (paidStr) => {
      const paid = parseFloat(String(paidStr).replace(',', '.'));
      const total = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
      const totalCents = Math.round(total * 100);
      const paidCents = Math.round(paid * 100);
      if (Number.isNaN(paid) || paidCents < totalCents) {
        Alert.alert('Insufficient amount', `Enter at least $${formatMoney(total)}.`);
        return;
      }
      const lines = cart.map((l) => ({
        productId: l.productId,
        productName: l.name,
        quantity: l.quantity,
        unitPrice: l.price,
      }));
      try {
        if (!user?.id) {
          throw new Error('Please login again.');
        }
        const result = await salesService.completeSaleForUser(user.id, lines, paid, 'Cash');
        const lineReceipt = lines.map((l) => ({
          name: l.productName,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.quantity * l.unitPrice,
        }));
        setReceipt({
          shopName: user.displayShopName || user.shopName,
          shopAddress: user.shopAddress,
          shopPhone: user.phone,
          cashierName: user.fullName,
          invoiceNumber: `INV-${String(Number(result.saleId)).padStart(6, '0')}`,
          paymentMethod: result.paymentMethod,
          lines: lineReceipt,
          invoiceTotal: result.total,
          tax: DEFAULT_TAX,
          paidAmount: result.paid,
          change: result.changeAmount,
          createdAt: result.createdAt,
          createdAtDisplay: formatHarare(result.createdAt),
        });
        setPaymentVisible(false);
        setCart([]);
        await notifyDataChanged();
        setReceiptVisible(true);
      } catch (e) {
        Alert.alert('Sale failed', e?.message ?? 'Could not complete sale.');
      }
    },
    [cart, notifyDataChanged, user]
  );

  const dismissReceipt = useCallback(() => {
    setReceiptVisible(false);
    setReceipt(null);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      products,
      refreshProducts,
      dataVersion,
      notifyDataChanged,
      cart,
      addToCart,
      incrementLine,
      decrementLine,
      removeLine,
      clearCart,
      subtotal,
      beginCheckout,
      reviewVisible,
      cancelReview,
      proceedToPayment,
    }),
    [
      ready,
      products,
      refreshProducts,
      dataVersion,
      notifyDataChanged,
      cart,
      addToCart,
      incrementLine,
      decrementLine,
      removeLine,
      clearCart,
      subtotal,
      beginCheckout,
      reviewVisible,
      cancelReview,
      proceedToPayment,
    ]
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      <CheckoutReviewModal
        visible={reviewVisible}
        cart={cart}
        subtotal={subtotal}
        onClose={cancelReview}
        onIncrement={incrementLine}
        onDecrement={decrementLine}
        onRemove={removeLine}
        onClear={clearCart}
        onContinue={proceedToPayment}
      />
      <PaymentModal
        visible={paymentVisible}
        subtotal={subtotal}
        onCancel={cancelPayment}
        onConfirm={confirmPayment}
      />
      <ReceiptModal visible={receiptVisible} receipt={receipt} onClose={dismissReceipt} onPrint={printThermalReceipt} />
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within CartProvider');
  }
  return ctx;
}
