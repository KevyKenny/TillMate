import { getDb } from '../database/db';
import { recordProfitFromSaleInTransaction, recordProfitReversalForSaleInTransaction } from './financeService';
import { recordStockEventInTransaction } from './stockService';
import { enqueueProductSync, enqueueSaleSync } from './syncService';

function localSaleDateYmd() {
  return new Date().toLocaleDateString('en-CA');
}

/**
 * @param {Array<{ productId: number; productName: string; quantity: number; unitPrice: number }>} lines
 * @param {number} paidAmount
 * @param {string} [paymentMethod]
 */
export async function completeSale(lines, paidAmount, paymentMethod = 'Cash') {
  if (!lines.length) {
    throw new Error('Cart is empty.');
  }

  const db = await getDb();
  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const paid = Number(paidAmount);
  const totalCents = Math.round(total * 100);
  const paidCents = Math.round(paid * 100);
  if (Number.isNaN(paid) || paidCents < totalCents) {
    throw new Error('Paid amount must be at least the invoice total.');
  }
  const changeAmount = (paidCents - totalCents) / 100;
  const saleDate = localSaleDateYmd();

  let saleId = 0;
  const productMeta = new Map();

  await db.withTransactionAsync(async () => {
    for (const line of lines) {
      const row = await db.getFirstAsync(
        `SELECT stock, owner_user_id, cost_price FROM products WHERE id = ? AND deleted_at IS NULL;`,
        [line.productId]
      );
      if (!row) {
        throw new Error(`Product #${line.productId} no longer exists.`);
      }
      if (row.stock < line.quantity) {
        throw new Error('Not enough stock for one or more items.');
      }
      productMeta.set(line.productId, row);
    }

    const insertSale = await db.runAsync(
      `INSERT INTO sales (total, paid_amount, change_amount, payment_method, sale_date)
       VALUES (?, ?, ?, ?, ?);`,
      [total, paid, changeAmount, paymentMethod, saleDate]
    );
    saleId = Number(insertSale.lastInsertRowId);

    for (const line of lines) {
      const name = (line.productName ?? '').trim() || `Product #${line.productId}`;
      const row = productMeta.get(line.productId);
      if (!row) throw new Error(`Product #${line.productId} no longer exists.`);
      await db.runAsync(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, product_name)
         VALUES (?, ?, ?, ?, ?);`,
        [saleId, line.productId, line.quantity, line.unitPrice, name]
      );
      if (!row.owner_user_id) {
        throw new Error('Product owner is missing. Please re-add the product before selling.');
      }
      await recordStockEventInTransaction(db, {
        userId: row.owner_user_id,
        productId: line.productId,
        eventType: 'sale',
        quantityDelta: -line.quantity,
        unitCost: row.cost_price == null ? null : Number(row.cost_price),
        referenceType: 'sale',
        referenceId: saleId,
      });
    }
  });

  const row = await db.getFirstAsync(
    `SELECT created_at FROM sales WHERE id = ?;`,
    [saleId]
  );

  return { saleId, total, paid, changeAmount, paymentMethod, createdAt: row?.created_at ?? null };
}

/**
 * @param {number} userId
 * @param {Array<{ productId: number; productName: string; quantity: number; unitPrice: number }>} lines
 * @param {number} paidAmount
 * @param {string} [paymentMethod]
 */
export async function completeSaleForUser(userId, lines, paidAmount, paymentMethod = 'Cash') {
  if (!userId) throw new Error('User session is required.');
  if (!lines.length) throw new Error('Cart is empty.');

  const db = await getDb();
  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const paid = Number(paidAmount);
  const totalCents = Math.round(total * 100);
  const paidCents = Math.round(paid * 100);
  if (Number.isNaN(paid) || paidCents < totalCents) {
    throw new Error('Paid amount must be at least the invoice total.');
  }
  const changeAmount = (paidCents - totalCents) / 100;
  const saleDate = localSaleDateYmd();

  let saleId = 0;
  const productMeta = new Map();
  await db.withTransactionAsync(async () => {
    for (const line of lines) {
      const row = await db.getFirstAsync(
        `SELECT stock, cost_price FROM products WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL;`,
        [line.productId, userId]
      );
      if (!row) throw new Error(`Product #${line.productId} no longer exists.`);
      if (row.stock < line.quantity) throw new Error('Not enough stock for one or more items.');
      productMeta.set(line.productId, row);
    }
    const insertSale = await db.runAsync(
      `INSERT INTO sales (owner_user_id, total, paid_amount, change_amount, payment_method, sale_date)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [userId, total, paid, changeAmount, paymentMethod, saleDate]
    );
    saleId = Number(insertSale.lastInsertRowId);
    for (const line of lines) {
      const name = (line.productName ?? '').trim() || `Product #${line.productId}`;
      const row = productMeta.get(line.productId);
      if (!row) throw new Error(`Product #${line.productId} no longer exists.`);
      await db.runAsync(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, product_name)
         VALUES (?, ?, ?, ?, ?);`,
        [saleId, line.productId, line.quantity, line.unitPrice, name]
      );
      await recordStockEventInTransaction(db, {
        userId,
        productId: line.productId,
        eventType: 'sale',
        quantityDelta: -line.quantity,
        unitCost: row.cost_price == null ? null : Number(row.cost_price),
        referenceType: 'sale',
        referenceId: saleId,
      });
    }
    await recordProfitFromSaleInTransaction(db, userId, saleId, saleDate, lines);
  });

  const row = await db.getFirstAsync(`SELECT created_at FROM sales WHERE id = ? AND owner_user_id = ?;`, [
    saleId,
    userId,
  ]);
  enqueueSaleSync(userId, saleId).catch(() => {});
  for (const line of lines) {
    enqueueProductSync(userId, line.productId).catch(() => {});
  }
  return { saleId, total, paid, changeAmount, paymentMethod, createdAt: row?.created_at ?? null };
}

export async function reverseSaleItemsForUser(userId, saleId, reverseLines, reason) {
  if (!userId) throw new Error('User session is required.');
  if (!Array.isArray(reverseLines) || reverseLines.length === 0) {
    throw new Error('No sale items selected for reversal.');
  }
  const db = await getDb();
  const today = localSaleDateYmd();
  let reversalValue = 0;
  const detailParts = [];
  const profitLines = [];
  const productIdsToSync = new Set();
  await db.withTransactionAsync(async () => {
    const sale = await db.getFirstAsync(
      `SELECT id, total, sale_date FROM sales WHERE id = ? AND owner_user_id = ?;`,
      [saleId, userId]
    );
    if (!sale) throw new Error('Sale not found.');
    const profitDate = String(sale.sale_date || today).trim() || today;
    for (const line of reverseLines) {
      const itemId = Number(line.saleItemId);
      const qtyToReverse = Math.max(0, Math.floor(Number(line.quantity)));
      if (!itemId || qtyToReverse <= 0) continue;
      const item = await db.getFirstAsync(
        `SELECT id, product_id, quantity, reversed_quantity, unit_price, product_name
         FROM sale_items
         WHERE id = ? AND sale_id = ?;`,
        [itemId, saleId]
      );
      if (!item) throw new Error('Sale item not found.');
      const remaining = Number(item.quantity) - Number(item.reversed_quantity || 0);
      if (qtyToReverse > remaining) throw new Error('Reversal quantity exceeds sold quantity.');
      await db.runAsync(
        `UPDATE sale_items
         SET reversed_quantity = COALESCE(reversed_quantity, 0) + ?
         WHERE id = ?;`,
        [qtyToReverse, itemId]
      );
      const product = await db.getFirstAsync(
        `SELECT cost_price FROM products WHERE id = ? AND owner_user_id = ?;`,
        [item.product_id, userId]
      );
      await recordStockEventInTransaction(db, {
        userId,
        productId: item.product_id,
        eventType: 'adjustment',
        quantityDelta: qtyToReverse,
        unitCost: product?.cost_price == null ? null : Number(product.cost_price),
        referenceType: 'sale_reversal',
        referenceId: saleId,
        notes: String(reason || '').trim() || 'Sale reversal',
      });
      const lineValue = qtyToReverse * Number(item.unit_price || 0);
      reversalValue += lineValue;
      const nm = (item.product_name || '').trim() || `Product #${item.product_id}`;
      detailParts.push(`${nm} ×${qtyToReverse} = $${lineValue.toFixed(2)}`);
      profitLines.push({
        productId: item.product_id,
        unitPrice: Number(item.unit_price || 0),
        quantity: qtyToReverse,
      });
      productIdsToSync.add(item.product_id);
    }
    if (reversalValue <= 0) {
      throw new Error('Enter at least one unit to reverse.');
    }
    await db.runAsync(
      `UPDATE sales
       SET reversed_total = COALESCE(reversed_total, 0) + ?,
           total = MAX(0, total - ?)
       WHERE id = ? AND owner_user_id = ?;`,
      [reversalValue, reversalValue, saleId, userId]
    );
    const notesBody = [
      `INV-${String(saleId).padStart(6, '0')}`,
      detailParts.length ? `Items: ${detailParts.join('; ')}` : '',
      `Value: $${reversalValue.toFixed(2)}`,
      reason ? `Reason: ${String(reason).trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    await db.runAsync(
      `INSERT INTO finance_transactions (owner_user_id, type, amount, occurred_on, description, notes, sale_id)
       VALUES (?, 'sale_reversal', ?, ?, ?, ?, ?);`,
      [
        userId,
        reversalValue,
        today,
        `Sale reversal: INV-${String(saleId).padStart(6, '0')}`,
        notesBody,
        saleId,
      ]
    );
    await recordProfitReversalForSaleInTransaction(db, userId, saleId, profitDate, profitLines);
  });
  enqueueSaleSync(userId, saleId).catch(() => {});
  for (const pid of productIdsToSync) {
    enqueueProductSync(userId, pid).catch(() => {});
  }
  return { reversedValue: reversalValue };
}
