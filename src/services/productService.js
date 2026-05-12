import { getDb } from '../database/db';
import { addStockMovementEntryInTransaction, getAllTimeSummary } from './financeService';
import { recordStockEventInTransaction } from './stockService';
import { enqueueProductSync } from './syncService';

function assertUserId(userId) {
  if (!userId) throw new Error('User session is required.');
}

function todayYmd() {
  return new Date().toLocaleDateString('en-CA');
}

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/**
 * Ensures available capital can absorb an increase in inventory book value (qty × cost).
 * @param {number} difference Must be > 0 (additional investment into stock).
 */
async function ensureCapitalForInventoryValueIncrease(userId, difference) {
  const d = roundMoney(difference);
  if (d <= 0) return;
  const summary = await getAllTimeSummary(userId);
  const available = roundMoney(Math.max(0, Number(summary.availableCapital || 0)));
  if (d > available) {
    const additional = roundMoney(d - available);
    throw new Error(`Insufficient capital. You need an additional ${additional.toFixed(2)}.`);
  }
}

function formatMoney(n) {
  return `$${roundMoney(n).toFixed(2)}`;
}

/**
 * User-facing ledger title and detail text (no internal field names).
 * @param {'inventory_edit'|'add_product'|'manual_adjustment'|'delete_product'} source
 */
function buildHumanStockValueLedgerCopy({
  productName,
  oldQty,
  oldCost,
  newQty,
  newCost,
  oldTotal,
  newTotal,
  difference,
  reason,
  source,
}) {
  const src =
    source === 'add_product'
      ? 'Opening stock when this product was first added.'
      : source === 'manual_adjustment'
        ? 'Stock quantity was changed with a manual adjustment.'
        : source === 'delete_product'
          ? 'This product was permanently deleted; value of remaining units was released back to available capital.'
          : 'You updated this product from Inventory.';

  const absDiff = Math.abs(roundMoney(difference));
  const flow =
    difference > 0
      ? `${formatMoney(absDiff)} was taken from available capital and added to this product's stock (at cost).`
      : `${formatMoney(absDiff)} was returned from this product's stock to available capital.`;

  const noteLine = reason && String(reason).trim() ? `Your note: ${String(reason).trim()}` : null;

  const notes = [
    src,
    `Before: ${oldQty} units at ${formatMoney(oldCost)} each · book value ${formatMoney(oldTotal)}`,
    `After: ${newQty} units at ${formatMoney(newCost)} each · book value ${formatMoney(newTotal)}`,
    flow,
    `Current inventory value for this product: ${formatMoney(newTotal)}.`,
    noteLine,
  ]
    .filter(Boolean)
    .join('\n');

  const description =
    difference > 0
      ? `Stock purchase · ${productName} · added ${formatMoney(absDiff)} (on-hand value now ${formatMoney(newTotal)})`
      : `Stock value returned · ${productName} · released ${formatMoney(absDiff)} (on-hand value now ${formatMoney(newTotal)})`;

  return { description, notes };
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
  const oldQty = 0;
  const oldCost = 0;
  const newQty = initialStock;
  const newCost = cost;
  const oldTotal = roundMoney(oldQty * oldCost);
  const newTotal = roundMoney(newQty * newCost);
  const difference = roundMoney(newTotal - oldTotal);

  if (difference > 0) {
    await ensureCapitalForInventoryValueIncrease(userId, difference);
  }

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
    }
    if (Math.abs(difference) > 1e-9) {
      const { description, notes } = buildHumanStockValueLedgerCopy({
        productName: trimmed,
        oldQty,
        oldCost,
        newQty,
        newCost,
        oldTotal,
        newTotal,
        difference,
        reason: 'Initial stock when adding this product',
        source: 'add_product',
      });
      await addStockMovementEntryInTransaction(db, {
        userId,
        type: 'stock_purchase',
        amount: Math.abs(difference),
        occurredOn: todayYmd(),
        description,
        notes,
        productId: newId,
        productName: trimmed,
        quantity: newQty,
      });
    }
  });
  enqueueProductSync(userId, newId).catch(() => {});
  return newId;
}

/**
 * @param {{ id: number; name: string; price: number; stock: number; category?: string; costPrice?: number | null; reason?: string }} input
 */
export async function updateProduct({ userId, id, name, price, stock, category, costPrice, reason }) {
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

  const prev = await db.getFirstAsync(
    `SELECT stock, cost_price FROM products WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL;`,
    [id, userId]
  );
  if (!prev) throw new Error('Product not found.');

  const oldQty = Math.max(0, Math.floor(Number(prev.stock || 0)));
  const oldCost =
    prev.cost_price == null || Number.isNaN(Number(prev.cost_price)) ? 0 : Number(prev.cost_price);
  const newQty = targetStock;
  const newCost = cost;
  const oldTotal = roundMoney(oldQty * oldCost);
  const newTotal = roundMoney(newQty * newCost);
  const difference = roundMoney(newTotal - oldTotal);
  const qtyDelta = newQty - oldQty;
  const costChanged = Math.abs(oldCost - newCost) > 1e-9;

  if ((qtyDelta !== 0 || costChanged || Math.abs(difference) > 1e-9) && !String(reason || '').trim()) {
    throw new Error(
      'Reason is required when changing stock quantity, cost price, or the total inventory value for this product.'
    );
  }

  if (difference > 0) {
    await ensureCapitalForInventoryValueIncrease(userId, difference);
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE products
       SET name = ?, price = ?, category = ?, cost_price = ?, updated_at = datetime('now')
       WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL;`,
      [trimmed, Number(price), cat, cost, id, userId]
    );
    if (qtyDelta !== 0) {
      await recordStockEventInTransaction(db, {
        userId,
        productId: id,
        eventType: 'stock_edition',
        quantityDelta: qtyDelta,
        unitCost: newCost,
        referenceType: 'inventory_edit',
        notes: `Inventory edit (${qtyDelta > 0 ? '+' : ''}${qtyDelta})`,
      });
    }
    if (Math.abs(difference) > 1e-9) {
      const { description, notes } = buildHumanStockValueLedgerCopy({
        productName: trimmed,
        oldQty,
        oldCost,
        newQty,
        newCost,
        oldTotal,
        newTotal,
        difference,
        reason,
        source: 'inventory_edit',
      });
      if (difference > 0) {
        await addStockMovementEntryInTransaction(db, {
          userId,
          type: 'stock_purchase',
          amount: difference,
          occurredOn: todayYmd(),
          description,
          notes,
          productId: id,
          productName: trimmed,
          quantity: newQty,
        });
      } else {
        await addStockMovementEntryInTransaction(db, {
          userId,
          type: 'stock_reversal',
          amount: Math.abs(difference),
          occurredOn: todayYmd(),
          description,
          notes,
          productId: id,
          productName: trimmed,
          quantity: newQty,
        });
      }
    }
  });
  enqueueProductSync(userId, id).catch(() => {});
}

export async function adjustStock(userId, productId, delta) {
  assertUserId(userId);
  const db = await getDb();
  const d = Math.trunc(Number(delta) || 0);
  if (!d) return;

  const p = await db.getFirstAsync(
    `SELECT id, name, stock, cost_price FROM products WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL;`,
    [productId, userId]
  );
  if (!p) throw new Error('Product not found.');

  const oldQty = Math.max(0, Math.floor(Number(p.stock || 0)));
  const oldCost =
    p.cost_price == null || Number.isNaN(Number(p.cost_price)) ? 0 : Number(p.cost_price);
  const newQty = Math.max(0, oldQty + d);
  const newCost = oldCost;
  const oldTotal = roundMoney(oldQty * oldCost);
  const newTotal = roundMoney(newQty * newCost);
  const difference = roundMoney(newTotal - oldTotal);

  if (difference > 0) {
    await ensureCapitalForInventoryValueIncrease(userId, difference);
  }

  await db.withTransactionAsync(async () => {
    await recordStockEventInTransaction(db, {
      userId,
      productId,
      eventType: 'adjustment',
      quantityDelta: d,
      unitCost: oldCost,
      referenceType: 'manual_adjustment',
      notes: `Adjustment (${d > 0 ? '+' : ''}${d})`,
    });
    if (Math.abs(difference) > 1e-9) {
      const { description, notes } = buildHumanStockValueLedgerCopy({
        productName: p.name,
        oldQty,
        oldCost,
        newQty,
        newCost,
        oldTotal,
        newTotal,
        difference,
        reason: 'Manual stock adjustment',
        source: 'manual_adjustment',
      });
      if (difference > 0) {
        await addStockMovementEntryInTransaction(db, {
          userId,
          type: 'stock_purchase',
          amount: difference,
          occurredOn: todayYmd(),
          description,
          notes,
          productId,
          productName: p.name,
          quantity: newQty,
        });
      } else {
        await addStockMovementEntryInTransaction(db, {
          userId,
          type: 'stock_reversal',
          amount: Math.abs(difference),
          occurredOn: todayYmd(),
          description,
          notes,
          productId,
          productName: p.name,
          quantity: newQty,
        });
      }
    }
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
    const remainingQty = Math.max(0, Number(p.stock || 0));
    const unitCost = Math.max(0, Number(p.cost_price || 0));
    const reversalAmount = roundMoney(remainingQty * unitCost);
    const oldTotal = reversalAmount;
    const newTotal = 0;
    const difference = roundMoney(newTotal - oldTotal);
    const { description, notes } = buildHumanStockValueLedgerCopy({
      productName: p.name,
      oldQty: remainingQty,
      oldCost: unitCost,
      newQty: 0,
      newCost: 0,
      oldTotal,
      newTotal,
      difference,
      reason: null,
      source: 'delete_product',
    });
    await addStockMovementEntryInTransaction(db, {
      userId,
      type: 'stock_reversal',
      amount: reversalAmount,
      occurredOn: todayYmd(),
      description,
      notes,
      productId: p.id,
      productName: p.name,
      quantity: remainingQty,
    });
    await db.runAsync(`DELETE FROM products WHERE id = ? AND owner_user_id = ?;`, [productId, userId]);
  });
  enqueueProductSync(userId, productId).catch(() => {});
  return name;
}
