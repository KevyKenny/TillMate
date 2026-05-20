import { getDb } from '../database/db';
import { enqueueProductSync, enqueueStockEventSync } from './syncService';

function assertUserId(userId) {
  if (!userId) throw new Error('User session is required.');
}

export async function recordStockEventInTransaction(
  db,
  {
    userId,
    productId,
    eventType,
    quantityDelta,
    unitCost = null,
    referenceType = null,
    referenceId = null,
    notes = null,
  }
) {
  assertUserId(userId);
  const delta = Math.trunc(Number(quantityDelta) || 0);
  if (!delta) return null;

  const product = await db.getFirstAsync(
    `SELECT stock FROM products
     WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL;`,
    [productId, userId]
  );
  if (!product) throw new Error('Product not found.');
  const nextStock = Number(product.stock || 0) + delta;
  if (nextStock < 0) {
    throw new Error('Stock cannot be negative.');
  }

  await db.runAsync(
    `UPDATE products
     SET stock = ?, updated_at = datetime('now')
     WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL;`,
    [nextStock, productId, userId]
  );
  const ins = await db.runAsync(
    `INSERT INTO stock_events (
      owner_user_id, product_id, event_type, quantity_delta, unit_cost, reference_type, reference_id, notes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [userId, productId, eventType, delta, unitCost, referenceType, referenceId, notes]
  );
  return Number(ins.lastInsertRowId);
}

export async function applyStockAdjustment({
  userId,
  productId,
  quantityDelta,
  eventType = 'adjustment',
  unitCost = null,
  referenceType = null,
  referenceId = null,
  notes = null,
}) {
  assertUserId(userId);
  const db = await getDb();
  let stockEventId = null;
  await db.withTransactionAsync(async () => {
    stockEventId = await recordStockEventInTransaction(db, {
      userId,
      productId,
      eventType,
      quantityDelta,
      unitCost,
      referenceType,
      referenceId,
      notes,
    });
  });
  enqueueProductSync(userId, productId).catch(() => {});
  if (stockEventId) enqueueStockEventSync(userId, stockEventId).catch(() => {});
}
