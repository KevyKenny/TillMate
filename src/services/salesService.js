import { getDb } from '../database/db';
import { recordProfitFromSaleInTransaction } from './financeService';
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
