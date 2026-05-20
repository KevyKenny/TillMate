import { getDb } from '../database/db';
import { enqueueFinanceSync, enqueueProductSync, enqueueStockEventSync } from './syncService';
import { recordStockEventInTransaction } from './stockService';

function assertUserId(userId) {
  if (!userId) throw new Error('User session is required.');
}

function todayLocalYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Allowed breakage reasons (UI + `recordBreakage` validation). */
export const BREAKAGE_REASON_OPTIONS = ['Damaged', 'Expired', 'Lost'];

/**
 * Inserts a profit ledger row for a completed sale. Call inside an active transaction.
 * Gross profit = sum of (unit_price - cost_price) * qty when cost is set.
 * @param {*} db open SQLite database (transaction)
 */
export async function recordProfitFromSaleInTransaction(db, userId, saleId, saleDateYmd, lines) {
  let grossProfit = 0;
  for (const line of lines) {
    const p = await db.getFirstAsync(
      `SELECT cost_price FROM products WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL;`,
      [line.productId, userId]
    );
    if (p?.cost_price != null) {
      grossProfit += (Number(line.unitPrice) - Number(p.cost_price)) * Number(line.quantity);
    }
  }
  const desc = `Sale #${String(saleId).padStart(6, '0')}`;
  const ins = await db.runAsync(
    `INSERT INTO finance_transactions (owner_user_id, type, amount, occurred_on, description, sale_id)
     VALUES (?, 'profit', ?, ?, ?, ?);`,
    [userId, grossProfit, saleDateYmd, desc, saleId]
  );
  return Number(ins.lastInsertRowId);
}

/** @returns {Promise<{
 * totalRevenue: number;
 * totalGrossProfitFromSales: number;
 * totalExpenses: number;
 * totalWithdrawals: number;
 * totalBreakages: number;
 * totalCapital: number;
 * netProfit: number;
 * availableCapital: number;
 * }>}
 * Breakage is logged on the ledger and reduces stock only; it does not change net profit or available capital.
 */
export async function getAllTimeSummary(userId) {
  assertUserId(userId);
  const db = await getDb();

  const revRow = await db.getFirstAsync(
    `SELECT COALESCE(SUM(total), 0) AS t FROM sales WHERE owner_user_id = ?;`,
    [userId]
  );
  const totalRevenue = Number(revRow?.t || 0);

  const sumType = async (type) => {
    const r = await db.getFirstAsync(
      `SELECT COALESCE(SUM(amount), 0) AS t
       FROM finance_transactions
       WHERE owner_user_id = ? AND type = ?;`,
      [userId, type]
    );
    return Number(r?.t || 0);
  };

  const totalGrossProfitFromSales =
    (await sumType('profit')) - (await sumType('profit_reversal'));
  const totalExpenses = await sumType('expense');
  const totalWithdrawals = await sumType('withdrawal');
  const totalBreakages = Math.max(
    0,
    (await sumType('breakage')) - (await sumType('breakage_reversal'))
  );
  const totalCapital = await sumType('capital');
  const adjRow = await db.getFirstAsync(
    `SELECT COALESCE(SUM(
      CASE
        WHEN type = 'capital_adjustment' AND (
          capital_source = 'subtract'
          OR (capital_source IS NULL AND notes LIKE '[subtract]%')
        )
          THEN -amount
        WHEN type = 'capital_adjustment'
          THEN amount
        ELSE 0
      END
    ), 0) AS t
    FROM finance_transactions
    WHERE owner_user_id = ?;`,
    [userId]
  );
  const totalCapitalAdjustments = Number(adjRow?.t || 0);
  const totalStockPurchases = await sumType('stock_purchase');
  const totalStockAdjustments = await sumType('stock_adjustment');
  const totalStockReversals = await sumType('stock_reversal');

  const netProfit = totalGrossProfitFromSales - totalExpenses - totalWithdrawals;
  const availableCapital =
    totalCapital +
    totalCapitalAdjustments +
    totalRevenue -
    totalExpenses -
    totalWithdrawals -
    totalStockPurchases -
    totalStockAdjustments +
    totalStockReversals;

  return {
    totalRevenue,
    totalGrossProfitFromSales,
    totalExpenses,
    totalWithdrawals,
    totalBreakages,
    totalCapital,
    totalCapitalAdjustments,
    totalStockPurchases,
    totalStockAdjustments,
    totalStockReversals,
    netProfit,
    availableCapital,
  };
}

/**
 * Returns both current (non-time-based) and date-filtered finance metrics.
 * Time-based metrics respect start/end when provided.
 */
export async function getFinanceSummary(userId, startYmd = null, endYmd = null) {
  assertUserId(userId);
  const db = await getDb();
  const hasRange = Boolean(startYmd && endYmd);

  const salesParams = hasRange ? [userId, startYmd, endYmd] : [userId];
  const salesRangeSql = hasRange ? `AND s.sale_date >= ? AND s.sale_date <= ?` : ``;

  const salesAgg = await db.getFirstAsync(
    `
      SELECT
        COALESCE(SUM(si.unit_price * (si.quantity - COALESCE(si.reversed_quantity, 0))), 0) AS revenue,
        COALESCE(SUM(COALESCE(p.cost_price, 0) * (si.quantity - COALESCE(si.reversed_quantity, 0))), 0) AS cos,
        COALESCE(SUM(si.quantity - COALESCE(si.reversed_quantity, 0)), 0) AS units_sold,
        COALESCE(COUNT(DISTINCT s.id), 0) AS tx_count
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN products p ON p.id = si.product_id AND p.owner_user_id = s.owner_user_id
      WHERE s.owner_user_id = ?
        AND s.total > 0
        ${salesRangeSql};
    `,
    salesParams
  );

  const sumFinanceType = async (type) => {
    const q = hasRange
      ? `SELECT COALESCE(SUM(amount), 0) AS t
         FROM finance_transactions
         WHERE owner_user_id = ? AND type = ? AND occurred_on >= ? AND occurred_on <= ?;`
      : `SELECT COALESCE(SUM(amount), 0) AS t
         FROM finance_transactions
         WHERE owner_user_id = ? AND type = ?;`;
    const params = hasRange ? [userId, type, startYmd, endYmd] : [userId, type];
    const r = await db.getFirstAsync(q, params);
    return Number(r?.t || 0);
  };

  const totalRevenue = Number(salesAgg?.revenue || 0);
  const costOfGoodsSold = Number(salesAgg?.cos || 0);
  const totalTransactions = Number(salesAgg?.tx_count || 0);
  const totalGoodsSold = Math.max(0, Math.round(Number(salesAgg?.units_sold || 0)));
  const grossProfit = totalRevenue - costOfGoodsSold;

  const totalExpenses = await sumFinanceType('expense');
  const totalWithdrawals = await sumFinanceType('withdrawal');
  const breakageLoss = Math.max(
    0,
    (await sumFinanceType('breakage')) - (await sumFinanceType('breakage_reversal'))
  );
  const stockPurchase = await sumFinanceType('stock_purchase');
  const stockAdjustment = await sumFinanceType('stock_adjustment');
  const netProfit = grossProfit - totalExpenses - totalWithdrawals;

  const allTime = await getAllTimeSummary(userId);
  const stockRow = await db.getFirstAsync(
    `SELECT
       COALESCE(SUM(COALESCE(cost_price, price, 0) * stock), 0) AS stock_value,
       COALESCE(SUM(COALESCE(price, 0) * stock), 0) AS stock_potential_value,
       COALESCE(SUM(
         CASE
           WHEN stock > 0 AND cost_price IS NOT NULL
             THEN (COALESCE(price, 0) - COALESCE(cost_price, 0)) * stock
           ELSE 0
         END
       ), 0) AS stock_expected_net_profit
     FROM products
     WHERE owner_user_id = ? AND deleted_at IS NULL;`,
    [userId]
  );

  // All-time: ledger gross profit from sales − expenses − withdrawals; plus unrealized (price−cost)×stock.
  const realizedNetProfit = Number(allTime.netProfit || 0);
  const stockExpectedNetProfit = Number(stockRow?.stock_expected_net_profit || 0);
  const expectedNetProfit = realizedNetProfit + stockExpectedNetProfit;

  return {
    current: {
      availableCapital: Number(allTime.availableCapital || 0),
      stockValue: Number(stockRow?.stock_value || 0),
      potentialValue: Number(stockRow?.stock_potential_value || 0),
      expectedNetProfit,
    },
    period: {
      totalRevenue,
      totalExpenses,
      totalWithdrawals,
      breakageLoss,
      totalTransactions,
      totalGoodsSold,
      netProfit,
      grossProfit,
      costOfGoodsSold,
      stockPurchase,
      stockAdjustment,
    },
  };
}

/**
 * @param {string | null} startYmd
 * @param {string | null} endYmd
 */
export async function getLedger(userId, startYmd, endYmd) {
  assertUserId(userId);
  const db = await getDb();
  if (startYmd && endYmd) {
    return db.getAllAsync(
      `SELECT *
       FROM finance_transactions
       WHERE owner_user_id = ?
        AND hidden_at IS NULL
         AND occurred_on >= ?
         AND occurred_on <= ?
       ORDER BY datetime(created_at) DESC, id DESC;`,
      [userId, startYmd, endYmd]
    );
  }
  return db.getAllAsync(
    `SELECT *
     FROM finance_transactions
     WHERE owner_user_id = ?
       AND hidden_at IS NULL
     ORDER BY datetime(created_at) DESC, id DESC;`,
    [userId]
  );
}

export async function updateLedgerEntry(userId, entryId, { amount, occurredOn, description, notes }) {
  assertUserId(userId);
  const db = await getDb();
  const a = Number(amount);
  if (Number.isNaN(a) || a < 0) throw new Error('Amount must be a valid non-negative number.');
  const exists = await db.getFirstAsync(
    `SELECT id FROM finance_transactions WHERE id = ? AND owner_user_id = ?;`,
    [entryId, userId]
  );
  if (!exists) throw new Error('Ledger entry not found.');
  await db.runAsync(
    `UPDATE finance_transactions
     SET amount = ?, occurred_on = ?, description = ?, notes = ?
     WHERE id = ? AND owner_user_id = ?;`,
    [
      a,
      String(occurredOn || '').trim(),
      String(description || '').trim() || 'Entry',
      String(notes || '').trim() || null,
      entryId,
      userId,
    ]
  );
  enqueueFinanceSync(userId, entryId).catch(() => {});
}

export async function deleteLedgerEntry(userId, entryId) {
  assertUserId(userId);
  const db = await getDb();
  await db.runAsync(
    `UPDATE finance_transactions
     SET hidden_at = datetime('now')
     WHERE id = ? AND owner_user_id = ?;`,
    [entryId, userId]
  );
  enqueueFinanceSync(userId, entryId).catch(() => {});
}

/**
 * @param {object} input
 * @param {string} input.userId
 * @param {number} input.amount
 * @param {string} input.purpose
 * @param {string} input.occurredOn
 * @param {string} [input.notes]
 */
export async function addExpense({ userId, amount, purpose, occurredOn, notes }) {
  assertUserId(userId);
  const db = await getDb();
  const a = Number(amount);
  if (Number.isNaN(a) || a < 0) throw new Error('Amount must be a valid non-negative number.');
  const desc = String(purpose || '').trim() || 'Expense';
  const ins = await db.runAsync(
    `INSERT INTO finance_transactions (owner_user_id, type, amount, occurred_on, description, notes)
     VALUES (?, 'expense', ?, ?, ?, ?);`,
    [userId, a, occurredOn, desc, notes?.trim() || null]
  );
  enqueueFinanceSync(userId, Number(ins.lastInsertRowId)).catch(() => {});
}

export async function addWithdrawal({ userId, amount, reason, occurredOn, withdrawnBy, notes }) {
  assertUserId(userId);
  const db = await getDb();
  const a = Number(amount);
  if (Number.isNaN(a) || a < 0) throw new Error('Amount must be a valid non-negative number.');
  const desc = String(reason || '').trim() || 'Withdrawal';
  const ins = await db.runAsync(
    `INSERT INTO finance_transactions (owner_user_id, type, amount, occurred_on, description, notes, withdrawn_by)
     VALUES (?, 'withdrawal', ?, ?, ?, ?, ?);`,
    [userId, a, occurredOn, desc, notes?.trim() || null, withdrawnBy?.trim() || null]
  );
  enqueueFinanceSync(userId, Number(ins.lastInsertRowId)).catch(() => {});
}

export async function addCapital({ userId, amount, source, occurredOn, notes }) {
  assertUserId(userId);
  const db = await getDb();
  const a = Number(amount);
  if (Number.isNaN(a) || a < 0) throw new Error('Amount must be a valid non-negative number.');
  const src = String(source || '').trim() || 'Capital';
  const ins = await db.runAsync(
    `INSERT INTO finance_transactions (owner_user_id, type, amount, occurred_on, description, notes, capital_source)
     VALUES (?, 'capital', ?, ?, ?, ?, ?);`,
    [userId, a, occurredOn, `Capital: ${src}`, notes?.trim() || null, src]
  );
  enqueueFinanceSync(userId, Number(ins.lastInsertRowId)).catch(() => {});
}

export async function addCapitalAdjustment({ userId, amount, mode, reason, occurredOn, notes }) {
  assertUserId(userId);
  const db = await getDb();
  const a = Number(amount);
  if (Number.isNaN(a) || a <= 0) throw new Error('Amount must be a valid positive number.');
  const normalizedMode = mode === 'subtract' ? 'subtract' : 'add';
  if (normalizedMode === 'subtract') {
    const summary = await getAllTimeSummary(userId);
    if (a > Number(summary.availableCapital || 0)) {
      throw new Error('Insufficient capital. You cannot reduce capital below zero.');
    }
  }
  const reasonTrim = String(reason || '').trim();
  const notesTrim = String(notes || '').trim();
  const amtLabel = `$${a.toFixed(2)}`;
  const description =
    normalizedMode === 'add'
      ? `Capital added · Available Capital card · ${amtLabel}`
      : `Capital subtracted · Available Capital card · ${amtLabel}`;
  const body = [
    'You opened the Finance tab, tapped Available Capital, and saved this manual adjustment.',
    `Action: ${normalizedMode === 'add' ? 'Add to' : 'Subtract from'} available capital.`,
    `Amount: ${amtLabel}.`,
    reasonTrim ? `Reason: ${reasonTrim}.` : null,
    notesTrim ? `Extra note: ${notesTrim}.` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const notesOut = body.trim() ? body : null;
  const ins = await db.runAsync(
    `INSERT INTO finance_transactions (owner_user_id, type, amount, occurred_on, description, notes, capital_source)
     VALUES (?, 'capital_adjustment', ?, ?, ?, ?, ?);`,
    [userId, a, occurredOn, description, notesOut, normalizedMode]
  );
  enqueueFinanceSync(userId, Number(ins.lastInsertRowId)).catch(() => {});
}

export async function addStockMovementEntryInTransaction(db, {
  userId,
  type,
  amount,
  occurredOn,
  description,
  notes,
  productId,
  productName,
  quantity,
}) {
  assertUserId(userId);
  if (!['stock_purchase', 'stock_adjustment', 'stock_reversal'].includes(type)) {
    throw new Error('Invalid stock movement transaction type.');
  }
  const a = Number(amount);
  if (Number.isNaN(a) || a < 0) throw new Error('Amount must be a valid non-negative number.');
  const ins = await db.runAsync(
    `INSERT INTO finance_transactions (
       owner_user_id, type, amount, occurred_on, description, notes, product_id, product_name, quantity
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      userId,
      type,
      a,
      occurredOn,
      String(description || '').trim() || 'Stock movement',
      notes?.trim() || null,
      productId ?? null,
      productName ?? null,
      quantity ?? null,
    ]
  );
  return Number(ins.lastInsertRowId);
}

export async function addStockMovementEntry(input) {
  const db = await getDb();
  const id = await addStockMovementEntryInTransaction(db, input);
  if (id) enqueueFinanceSync(input.userId, id).catch(() => {});
  return id;
}

/**
 * Reverses previously booked gross profit for returned sale quantities (inside a transaction).
 * @param {Array<{ productId: number; unitPrice: number; quantity: number }>} reverseLines
 */
export async function recordProfitReversalForSaleInTransaction(db, userId, saleId, occurredOnYmd, reverseLines) {
  assertUserId(userId);
  let grossReversal = 0;
  for (const line of reverseLines) {
    const qty = Math.max(0, Math.floor(Number(line.quantity) || 0));
    if (qty <= 0) continue;
    const p = await db.getFirstAsync(
      `SELECT cost_price FROM products WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL;`,
      [line.productId, userId]
    );
    if (p?.cost_price != null) {
      grossReversal += (Number(line.unitPrice) - Number(p.cost_price)) * qty;
    }
  }
  if (grossReversal <= 0) return null;
  const desc = `Profit reversal: Sale #${String(saleId).padStart(6, '0')}`;
  const ins = await db.runAsync(
    `INSERT INTO finance_transactions (owner_user_id, type, amount, occurred_on, description, sale_id)
     VALUES (?, 'profit_reversal', ?, ?, ?, ?);`,
    [userId, grossReversal, occurredOnYmd, desc, saleId]
  );
  return Number(ins.lastInsertRowId);
}

/**
 * Deducts stock and records a breakage ledger row (audit). Does not affect net profit or available capital.
 */
export async function recordBreakageInTransaction(
  db,
  { userId, productId, quantity, reason, occurredOn, notes, referenceType = 'finance_breakage', referenceId = null }
) {
  assertUserId(userId);
  const q = Math.max(1, Math.floor(Number(quantity)));
  const p = await db.getFirstAsync(
    `SELECT name, cost_price, stock
     FROM products
     WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL;`,
    [productId, userId]
  );
  if (!p) throw new Error('Product not found.');
  if (p.stock < q) throw new Error('Not enough stock to record this breakage.');
  const unitValue = p.cost_price != null ? Number(p.cost_price) : 0;
  const loss = unitValue * q;
  const stockEventId = await recordStockEventInTransaction(db, {
    userId,
    productId,
    eventType: 'breakage',
    quantityDelta: -q,
    unitCost: unitValue,
    referenceType,
    referenceId,
    notes: String(reason || '').trim() || 'Breakage',
  });
  const finIns = await db.runAsync(
    `INSERT INTO finance_transactions (
       owner_user_id, type, amount, occurred_on, description, notes, product_id, product_name, quantity, recovers_finance_id
     ) VALUES (?, 'breakage', ?, ?, ?, ?, ?, ?, ?, NULL);`,
    [
      userId,
      loss,
      occurredOn,
      String(reason || '').trim() || 'Breakage',
      notes?.trim() || null,
      productId,
      p.name,
      q,
    ]
  );
  return { stockEventId, financeId: Number(finIns.lastInsertRowId) };
}

/**
 * Deducts stock and records breakage at cost × qty on the ledger. Stock-only for P&L: net profit and available capital ignore breakage.
 */
export async function recordBreakage({ userId, productId, quantity, reason, occurredOn, notes }) {
  assertUserId(userId);
  const r = String(reason || '').trim();
  if (!BREAKAGE_REASON_OPTIONS.includes(r)) {
    throw new Error('Breakage reason must be Damaged, Expired, or Lost.');
  }
  const q = Math.max(1, Math.floor(Number(quantity)));
  const db = await getDb();

  let syncPair = null;
  await db.withTransactionAsync(async () => {
    syncPair = await recordBreakageInTransaction(db, {
      userId,
      productId,
      quantity: q,
      reason: r,
      occurredOn,
      notes,
      referenceType: 'finance_breakage',
      referenceId: null,
    });
  });
  enqueueProductSync(userId, productId).catch(() => {});
  if (syncPair?.stockEventId) enqueueStockEventSync(userId, syncPair.stockEventId).catch(() => {});
  if (syncPair?.financeId) enqueueFinanceSync(userId, syncPair.financeId).catch(() => {});
}

/**
 * Finance row IDs that already have a non-hidden `breakage_reversal` linked via `recovers_finance_id`.
 * @param {string} userId
 * @returns {Promise<number[]>}
 */
export async function getRecoveredBreakageFinanceIds(userId) {
  assertUserId(userId);
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT recovers_finance_id AS fid
     FROM finance_transactions
     WHERE owner_user_id = ?
       AND type = 'breakage_reversal'
       AND hidden_at IS NULL
       AND recovers_finance_id IS NOT NULL;`,
    [userId]
  );
  const out = [];
  for (const r of rows || []) {
    const n = Math.floor(Number(r?.fid));
    if (n > 0) out.push(n);
  }
  return out;
}

/**
 * Restores stock for a miscounted breakage row and adds a matching `breakage_reversal` ledger line (same cost amount).
 * @param {string} userId
 * @param {number} breakageFinanceId `finance_transactions.id` of the original `breakage` row
 */
export async function recoverBreakageFromLedger(userId, breakageFinanceId) {
  assertUserId(userId);
  const fid = Math.floor(Number(breakageFinanceId));
  if (!fid) throw new Error('Invalid ledger entry.');

  let productIdForSync = null;
  let stockEventId = null;
  let reversalFinanceId = null;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync(
      `SELECT * FROM finance_transactions
       WHERE id = ? AND owner_user_id = ? AND type = 'breakage' AND hidden_at IS NULL;`,
      [fid, userId]
    );
    if (!row) throw new Error('Breakage entry not found or was removed.');
    const productId = row.product_id != null ? Number(row.product_id) : null;
    const qty = Math.max(0, Math.floor(Number(row.quantity) || 0));
    if (!productId || qty <= 0) {
      throw new Error('This breakage entry cannot be recovered (missing product or quantity).');
    }

    const dup = await db.getFirstAsync(
      `SELECT id FROM finance_transactions
       WHERE owner_user_id = ? AND type = 'breakage_reversal' AND recovers_finance_id = ? AND hidden_at IS NULL
       LIMIT 1;`,
      [userId, fid]
    );
    if (dup) throw new Error('This breakage was already marked as recovered.');

    const p = await db.getFirstAsync(
      `SELECT name, cost_price FROM products WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL;`,
      [productId, userId]
    );
    if (!p) throw new Error('Product no longer exists. Cannot restore stock.');

    const loss = Number(row.amount) || 0;
    const unitValue = p.cost_price != null ? Number(p.cost_price) : 0;

    stockEventId = await recordStockEventInTransaction(db, {
      userId,
      productId,
      eventType: 'adjustment',
      quantityDelta: qty,
      unitCost: unitValue,
      referenceType: 'breakage_recovery',
      referenceId: fid,
      notes: 'Breakage recovery (miscount)',
    });

    const prodName = String(p.name || row.product_name || 'Product').trim() || 'Product';
    const desc = `Breakage recovered · ${prodName}`;
    const finIns = await db.runAsync(
      `INSERT INTO finance_transactions (
         owner_user_id, type, amount, occurred_on, description, notes, product_id, product_name, quantity, recovers_finance_id
       ) VALUES (?, 'breakage_reversal', ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        userId,
        loss,
        todayLocalYmd(),
        desc,
        'Stock restored after confirming the item was not actually lost or damaged.',
        productId,
        prodName,
        qty,
        fid,
      ]
    );
    reversalFinanceId = Number(finIns.lastInsertRowId);
    productIdForSync = productId;
  });

  if (productIdForSync != null) {
    enqueueProductSync(userId, productIdForSync).catch(() => {});
  }
  if (stockEventId) enqueueStockEventSync(userId, stockEventId).catch(() => {});
  if (reversalFinanceId) enqueueFinanceSync(userId, reversalFinanceId).catch(() => {});
}

export function typeLabel(type) {
  const m = {
    expense: 'Expense',
    withdrawal: 'Withdrawal',
    breakage: 'Breakage',
    breakage_reversal: 'Breakage recovered',
    capital: 'Capital',
    profit: 'Gross profit (sale)',
    stock_purchase: 'Stock purchase',
    stock_adjustment: 'Stock adjustment',
    capital_adjustment: 'Available capital (card)',
    stock_reversal: 'Stock reversal',
    sale_reversal: 'Sale reversal',
    profit_reversal: 'Profit reversal (sale return)',
  };
  return m[type] || type;
}
