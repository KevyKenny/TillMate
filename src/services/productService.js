import { getDb } from '../database/db';
import { addStockMovementEntryInTransaction } from './financeService';
import { recordStockEventInTransaction } from './stockService';
import { enqueueProductSync } from './syncService';

function assertUserId(userId) {
  if (!userId) throw new Error('User session is required.');
}

function todayYmd() {
  return new Date().toLocaleDateString('en-CA');
}

export async function getAllProducts(userId, activeOnly = true) {
  assertUserId(userId);
  const db = await getDb();
  const where = activeOnly
    ? 'WHERE owner_user_id = ? AND deleted_at IS NULL'
    : 'WHERE owner_user_id = ?';
  const order = activeOnly
    ? 'ORDER BY name COLLATE NOCASE ASC'
    : 'ORDER BY (CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END), name COLLATE NOCASE ASC';
  return db.getAllAsync(
    `SELECT id, name, price, stock, category, cost_price, created_at, updated_at, deleted_at
     FROM products ${where}
     ${order};`,
    [userId]
  );
}

/**
 * Active products only (for sales grid).
 */
export async function getActiveProducts(userId) {
  assertUserId(userId);
  const db = await getDb();
  return db.getAllAsync(
    `SELECT id, name, price, stock, category, cost_price, created_at, updated_at, deleted_at
     FROM products
     WHERE owner_user_id = ? AND deleted_at IS NULL AND stock > 0
     ORDER BY name COLLATE NOCASE ASC;`,
    [userId]
  );
}

/**
 * @param {{ name: string; price: number; stock: number; category?: string; costPrice?: number | null }} input
 */
export async function addProduct({ userId, name, price, stock, category, costPrice }) {
  assertUserId(userId);
  const db = await getDb();
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Product name is required.');
  }
  const dup = await db.getFirstAsync(
    `SELECT id FROM products
     WHERE owner_user_id = ? AND deleted_at IS NULL AND lower(trim(name)) = lower(trim(?))
     LIMIT 1;`,
    [userId, trimmed]
  );
  if (dup) {
    throw new Error('A product with this name already exists. Adjust the existing product instead.');
  }
  const cat = (category ?? 'General').trim() || 'General';
  const cost =
    costPrice === null || costPrice === undefined || String(costPrice).trim() === ''
      ? null
      : Number(costPrice);
  if (cost === null || Number.isNaN(cost) || cost < 0) {
    throw new Error('Cost price is required and must be a valid non-negative number.');
  }
  const initialStock = Math.max(0, Math.floor(Number(stock)));
  let newId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO products (owner_user_id, name, price, stock, category, cost_price, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, datetime('now'));`,
      [userId, trimmed, Number(price), cat, cost]
    );
    newId = Number(result.lastInsertRowId);
    if (initialStock > 0) {
      await recordStockEventInTransaction(db, {
        userId,
        productId: newId,
        eventType: 'stock_addition',
        quantityDelta: initialStock,
        unitCost: cost,
        referenceType: 'add_product',
        notes: 'Initial stock addition',
      });
      await addStockMovementEntryInTransaction(db, {
        userId,
        type: 'stock_purchase',
        amount: cost * initialStock,
        occurredOn: todayYmd(),
        description: `Stock purchase: ${trimmed}`,
        productId: newId,
        productName: trimmed,
        quantity: initialStock,
      });
    }
  });
  enqueueProductSync(userId, newId).catch(() => {});
  return newId;
}

/**
 * @param {{ id: number; name: string; price: number; stock: number; category?: string; costPrice?: number | null }} input
 */
export async function updateProduct({ userId, id, name, price, stock, category, costPrice }) {
  assertUserId(userId);
  const db = await getDb();
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Product name is required.');
  }
  const dup = await db.getFirstAsync(
    `SELECT id FROM products
     WHERE owner_user_id = ? AND deleted_at IS NULL AND lower(trim(name)) = lower(trim(?)) AND id != ?
     LIMIT 1;`,
    [userId, trimmed, id]
  );
  if (dup) {
    throw new Error('A product with this name already exists. Adjust the existing product instead.');
  }
  const cat = (category ?? 'General').trim() || 'General';
  const cost =
    costPrice === null || costPrice === undefined || String(costPrice).trim() === ''
      ? null
      : Number(costPrice);
  if (cost === null || Number.isNaN(cost) || cost < 0) {
    throw new Error('Cost price is required and must be a valid non-negative number.');
  }
  const targetStock = Math.max(0, Math.floor(Number(stock)));
  await db.withTransactionAsync(async () => {
    const prev = await db.getFirstAsync(
      `SELECT stock FROM products WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL;`,
      [id, userId]
    );
    if (!prev) throw new Error('Product not found.');
    const delta = targetStock - Number(prev.stock || 0);
    await db.runAsync(
      `UPDATE products
       SET name = ?, price = ?, category = ?, cost_price = ?, updated_at = datetime('now')
       WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL;`,
      [trimmed, Number(price), cat, cost, id, userId]
    );
    if (delta !== 0) {
      await recordStockEventInTransaction(db, {
        userId,
        productId: id,
        eventType: 'stock_edition',
        quantityDelta: delta,
        unitCost: cost,
        referenceType: 'inventory_edit',
        notes: `Inventory edit (${delta > 0 ? '+' : ''}${delta})`,
      });
      await addStockMovementEntryInTransaction(db, {
        userId,
        type: delta > 0 ? 'stock_purchase' : 'stock_adjustment',
        amount: Math.abs(delta) * cost,
        occurredOn: todayYmd(),
        description: `${delta > 0 ? 'Stock purchase' : 'Stock adjustment'}: ${trimmed}`,
        productId: id,
        productName: trimmed,
        quantity: Math.abs(delta),
      });
    }
  });
  enqueueProductSync(userId, id).catch(() => {});
}

export async function adjustStock(userId, productId, delta) {
  assertUserId(userId);
  const db = await getDb();
  const d = Math.trunc(Number(delta) || 0);
  if (!d) return;
  await db.withTransactionAsync(async () => {
    const p = await db.getFirstAsync(
      `SELECT name, cost_price FROM products WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL;`,
      [productId, userId]
    );
    if (!p) throw new Error('Product not found.');
    const unitCost = Number(p.cost_price || 0);
    await recordStockEventInTransaction(db, {
      userId,
      productId,
      eventType: 'adjustment',
      quantityDelta: d,
      unitCost,
      referenceType: 'manual_adjustment',
      notes: `Adjustment (${d > 0 ? '+' : ''}${d})`,
    });
    await addStockMovementEntryInTransaction(db, {
      userId,
      type: d > 0 ? 'stock_purchase' : 'stock_adjustment',
      amount: Math.abs(d) * unitCost,
      occurredOn: todayYmd(),
      description: `Stock adjustment: ${p.name}`,
      productId,
      productName: p.name,
      quantity: Math.abs(d),
    });
  });
  enqueueProductSync(userId, productId).catch(() => {});
}

/** Soft-delete: product hidden from sales/stock until restored (no DB cascade). */
export async function softDeleteProduct(userId, productId) {
  assertUserId(userId);
  const db = await getDb();
  await db.runAsync(
    `UPDATE products
     SET deleted_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL;`,
    [productId, userId]
  );
  enqueueProductSync(userId, productId).catch(() => {});
}

export async function restoreProduct(userId, productId) {
  assertUserId(userId);
  const db = await getDb();
  await db.runAsync(
    `UPDATE products
     SET deleted_at = NULL, updated_at = datetime('now')
     WHERE id = ? AND owner_user_id = ?;`,
    [productId, userId]
  );
  enqueueProductSync(userId, productId).catch(() => {});
}

export async function hardDeleteProduct(userId, productId) {
  assertUserId(userId);
  const db = await getDb();
  let name = '';
  await db.withTransactionAsync(async () => {
    const p = await db.getFirstAsync(
      `SELECT id, name, category, price, cost_price, stock
       FROM products WHERE id = ? AND owner_user_id = ?;`,
      [productId, userId]
    );
    if (!p) throw new Error('Product not found.');
    name = p.name;
    const details = `Deleted product record: ${p.name} | category=${p.category || 'General'} | price=${Number(
      p.price || 0
    ).toFixed(2)} | cost=${Number(p.cost_price || 0).toFixed(2)} | stock=${Number(p.stock || 0)}`;
    await addStockMovementEntryInTransaction(db, {
      userId,
      type: 'stock_adjustment',
      amount: Math.max(0, Number(p.stock || 0)) * Math.max(0, Number(p.cost_price || 0)),
      occurredOn: todayYmd(),
      description: `Permanent delete: ${p.name}`,
      notes: details,
      productId: p.id,
      productName: p.name,
      quantity: Math.max(0, Number(p.stock || 0)),
    });
    await db.runAsync(`DELETE FROM products WHERE id = ? AND owner_user_id = ?;`, [productId, userId]);
  });
  enqueueProductSync(userId, productId).catch(() => {});
  return name;
}
