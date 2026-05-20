import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { getApiBaseUrl } from '../config/api';
import { getDb } from '../database/db';
import * as cloudAuthService from './cloudAuthService';

const CLOUD_JWT_KEY = '@tillmate_cloud_jwt_v1';
const INITIAL_SYNC_PREFIX = '@tillmate_initial_cloud_sync_v1_';

const OUTBOX_LIMIT = 200;

/** Throttle noisy dev logs when the API is down (background sync runs often). */
let lastOfflineDevLogAt = 0;
const OFFLINE_LOG_THROTTLE_MS = 120_000;

/**
 * Queue a cloud operation locally. Never throws — sales/inventory/finance must keep working if sync is down.
 * @param {{ type: string; payload: unknown }} operation
 */
export async function enqueueSyncOperation(operation) {
  try {
    const db = await getDb();
    await db.runAsync(`INSERT INTO sync_outbox (payload) VALUES (?);`, [JSON.stringify(operation)]);
  } catch (e) {
    if (__DEV__) {
      console.warn('[TillMate sync] Could not queue operation (local DB).', e?.message || e);
    }
  }
}

export async function getStoredCloudToken() {
  return AsyncStorage.getItem(CLOUD_JWT_KEY);
}

export async function saveCloudToken(token) {
  if (token) await AsyncStorage.setItem(CLOUD_JWT_KEY, token);
}

export async function clearCloudToken() {
  await AsyncStorage.removeItem(CLOUD_JWT_KEY);
}

export async function clearInitialSyncFlag(localUserId) {
  await AsyncStorage.removeItem(`${INITIAL_SYNC_PREFIX}${localUserId}`);
}

/**
 * @param {object} localRow SQLite users row (snake_case)
 * @param {string} password
 */
export async function ensureCloudSession(localRow, password) {
  const email = localRow.email ? String(localRow.email).trim().toLowerCase() : '';
  const phone = String(localRow.phone || '').trim();

  const registerPayload = {
    phone,
    email: email || undefined,
    password,
    fullName: String(localRow.full_name || '').trim(),
    streetAddress: String(localRow.street_address || '').trim(),
    city: String(localRow.city || '').trim(),
    shopName: localRow.shop_name ? String(localRow.shop_name).trim() : undefined,
    shopNumber: localRow.shop_number ? String(localRow.shop_number).trim() : undefined,
    clientUserId: Number(localRow.id),
  };

  try {
    const loginBody = email ? { email, password } : { phone, password };
    const logged = await cloudAuthService.cloudLogin(loginBody);
    if (logged?.token) {
      await saveCloudToken(logged.token);
      return logged.token;
    }
  } catch {
    /* try register */
  }

  try {
    const registered = await cloudAuthService.cloudRegister(registerPayload);
    if (registered?.token) {
      await saveCloudToken(registered.token);
      return registered.token;
    }
  } catch (e) {
    if (e.status === 409) {
      const loginBody = email ? { email, password } : { phone, password };
      const logged = await cloudAuthService.cloudLogin(loginBody);
      if (logged?.token) {
        await saveCloudToken(logged.token);
        return logged.token;
      }
    }
  }
  throw new Error('Cloud session could not be established.');
}

/**
 * After signup payload (camelCase) before local-only flow — same shape as register API.
 * @param {object} payload SignUp payload with password
 * @param {number} localUserId
 */
export async function ensureCloudSessionAfterSignup(payload, localUserId) {
  const body = {
    phone: String(payload.phone || '').trim(),
    email: payload.email ? String(payload.email).trim().toLowerCase() : undefined,
    password: String(payload.password || ''),
    fullName: String(payload.fullName || '').trim(),
    streetAddress: String(payload.streetAddress || '').trim(),
    city: String(payload.city || '').trim(),
    shopName: payload.shopName ? String(payload.shopName).trim() : undefined,
    shopNumber: payload.shopNumber ? String(payload.shopNumber).trim() : undefined,
    clientUserId: Number(localUserId),
  };
  try {
    const registered = await cloudAuthService.cloudRegister(body);
    if (registered?.token) {
      await saveCloudToken(registered.token);
      return registered.token;
    }
  } catch (e) {
    if (e.status === 409) {
      const loginBody = body.email ? { email: body.email, password: body.password } : { phone: body.phone, password: body.password };
      const logged = await cloudAuthService.cloudLogin(loginBody);
      if (logged?.token) {
        await saveCloudToken(logged.token);
        return logged.token;
      }
    }
    throw e;
  }
  throw new Error('Cloud registration failed.');
}

export async function flushOutboxBestEffort() {
  try {
    const online = await cloudAuthService.cloudHealthCheck().catch(() => false);
    if (!online) {
      if (__DEV__) {
        const now = Date.now();
        if (now - lastOfflineDevLogAt >= OFFLINE_LOG_THROTTLE_MS) {
          lastOfflineDevLogAt = now;
          console.warn(
            `[TillMate sync] API not reachable at ${getApiBaseUrl()}. Cloud backup will retry when the device can reach your backend (set EXPO_PUBLIC_API_URL if needed).`
          );
        }
      }
      return { skipped: true, reason: 'offline' };
    }

    const token = await getStoredCloudToken();
    // Tenant uploads require a JWT — the API cannot safely accept anonymous writes to MongoDB.
    if (!token) {
      return { skipped: true, reason: 'no_token' };
    }

    const db = await getDb();
    const rows = await db.getAllAsync(
      `SELECT id, payload FROM sync_outbox
       WHERE (status = 'pending' OR (status = 'failed' AND attempts < 15))
       ORDER BY id ASC LIMIT ?;`,
      [OUTBOX_LIMIT]
    );
    if (!rows.length) return { pushed: 0 };

    const operations = rows.map((r) => JSON.parse(r.payload));
    let data;
    try {
      data = await cloudAuthService.cloudSyncBatch(token, { operations });
    } catch (e) {
      if (e.status === 401 || String(e.message || '').includes('401')) {
        await clearCloudToken();
      }
      return { skipped: true, reason: 'sync_error', error: e.message };
    }

    const results = Array.isArray(data.results) ? data.results : [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const r = results.find((x) => x.index === i) || results[i];
      const ok = r && r.ok;
      if (ok) {
        await db.runAsync(`DELETE FROM sync_outbox WHERE id = ?;`, [row.id]);
      } else {
        const msg = (r && r.error) || data.error || 'unknown';
        await db.runAsync(
          `UPDATE sync_outbox SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE id = ?;`,
          [String(msg).slice(0, 500), row.id]
        );
      }
    }
    return { pushed: rows.length, failed: data.failed };
  } catch (e) {
    if (__DEV__) {
      console.warn('[TillMate sync] flushOutboxBestEffort failed (ignored).', e?.message || e);
    }
    return { skipped: true, reason: 'error', error: e?.message };
  }
}

/**
 * @param {number} userId local owner_user_id
 */
export async function enqueueUserRegisterOperation(userId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT id, full_name, email, phone, street_address, city, shop_name, shop_number FROM users WHERE id = ?;`,
    [userId]
  );
  if (!row) return;
  await enqueueSyncOperation({
    type: 'user.register',
    payload: {
      clientUserId: Number(row.id),
      fullName: row.full_name,
      email: row.email || undefined,
      phone: row.phone,
      streetAddress: row.street_address,
      city: row.city,
      shopName: row.shop_name || undefined,
      shopNumber: row.shop_number || undefined,
    },
  });
}

/**
 * @param {number} userId
 * @param {number} productId
 */
export async function enqueueProductSync(userId, productId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT id, name, price, stock, category, cost_price, deleted_at, updated_at
     FROM products WHERE id = ? AND owner_user_id = ?;`,
    [productId, userId]
  );
  if (!row) return;
  await enqueueSyncOperation({
    type: 'product.upsert',
    payload: {
      clientProductId: Number(row.id),
      name: row.name,
      price: Number(row.price),
      stock: Number(row.stock),
      category: row.category || 'General',
      costPrice: row.cost_price == null ? null : Number(row.cost_price),
      deletedAt: row.deleted_at || null,
      clientUpdatedAt: row.updated_at || undefined,
    },
  });
}

/**
 * @param {number} userId
 * @param {number} financeId local finance_transactions.id
 */
export async function enqueueFinanceSync(userId, financeId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT id, owner_user_id, type, amount, occurred_on, description, notes, product_id, product_name, quantity,
            withdrawn_by, capital_source, sale_id, hidden_at, created_at, recovers_finance_id
     FROM finance_transactions WHERE id = ? AND owner_user_id = ?;`,
    [financeId, userId]
  );
  if (!row) return;
  await enqueueSyncOperation({
    type: 'finance.upsert',
    payload: {
      clientFinanceId: Number(row.id),
      type: row.type,
      amount: Number(row.amount),
      occurredOn: row.occurred_on,
      description: row.description,
      notes: row.notes,
      productId: row.product_id != null ? Number(row.product_id) : null,
      productName: row.product_name,
      quantity: row.quantity != null ? Number(row.quantity) : null,
      withdrawnBy: row.withdrawn_by,
      capitalSource: row.capital_source,
      saleId: row.sale_id != null ? Number(row.sale_id) : null,
      hiddenAt: row.hidden_at,
      clientCreatedAt: row.created_at || undefined,
      recoversFinanceId: row.recovers_finance_id != null ? Number(row.recovers_finance_id) : null,
    },
  });
}

/**
 * @param {number} userId
 * @param {number} stockEventId local stock_events.id
 */
export async function enqueueStockEventSync(userId, stockEventId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT id, owner_user_id, product_id, event_type, quantity_delta, unit_cost, reference_type, reference_id, notes, created_at
     FROM stock_events WHERE id = ? AND owner_user_id = ?;`,
    [stockEventId, userId]
  );
  if (!row) return;
  await enqueueSyncOperation({
    type: 'stock_event.upsert',
    payload: {
      clientStockEventId: Number(row.id),
      productId: Number(row.product_id),
      eventType: row.event_type,
      quantityDelta: Number(row.quantity_delta),
      unitCost: row.unit_cost == null ? null : Number(row.unit_cost),
      referenceType: row.reference_type,
      referenceId: row.reference_id != null ? Number(row.reference_id) : null,
      notes: row.notes,
      clientCreatedAt: row.created_at || undefined,
    },
  });
}

/**
 * @param {number} userId
 * @param {number} saleId local sales.id
 */
export async function enqueueSaleSync(userId, saleId) {
  const db = await getDb();
  const sale = await db.getFirstAsync(
    `SELECT id, total, sale_date, paid_amount, change_amount, payment_method, created_at, reversed_total
     FROM sales WHERE id = ? AND owner_user_id = ?;`,
    [saleId, userId]
  );
  if (!sale) return;
  const items = await db.getAllAsync(
    `SELECT product_id, product_name, quantity, unit_price, id, reversed_quantity
     FROM sale_items WHERE sale_id = ? ORDER BY id ASC;`,
    [saleId]
  );
  await enqueueSyncOperation({
    type: 'sale.upsert',
    payload: {
      clientSaleId: Number(sale.id),
      total: Number(sale.total),
      saleDate: sale.sale_date || undefined,
      paidAmount: sale.paid_amount != null ? Number(sale.paid_amount) : undefined,
      changeAmount: sale.change_amount != null ? Number(sale.change_amount) : undefined,
      paymentMethod: sale.payment_method || 'Cash',
      clientCreatedAt: sale.created_at || undefined,
      reversedTotal: sale.reversed_total != null ? Number(sale.reversed_total) : 0,
      items: items.map((it, idx) => ({
        clientItemIndex: idx,
        clientSaleItemId: Number(it.id),
        productId: Number(it.product_id),
        productName: it.product_name || '',
        quantity: Number(it.quantity),
        unitPrice: Number(it.unit_price),
        reversedQuantity: Number(it.reversed_quantity || 0),
      })),
    },
  });
}

/**
 * Enqueue all local products and sales for backup (runs once per user until flag set).
 * @param {number} userId
 */
export async function enqueueFullLocalSnapshot(userId) {
  const db = await getDb();
  const products = await db.getAllAsync(
    `SELECT id, name, price, stock, category, cost_price, deleted_at, updated_at
     FROM products WHERE owner_user_id = ?;`,
    [userId]
  );
  for (const row of products) {
    await enqueueSyncOperation({
      type: 'product.upsert',
      payload: {
        clientProductId: Number(row.id),
        name: row.name,
        price: Number(row.price),
        stock: Number(row.stock),
        category: row.category || 'General',
        costPrice: row.cost_price == null ? null : Number(row.cost_price),
        deletedAt: row.deleted_at || null,
        clientUpdatedAt: row.updated_at || undefined,
      },
    });
  }

  const sales = await db.getAllAsync(`SELECT id FROM sales WHERE owner_user_id = ? ORDER BY id ASC;`, [userId]);
  for (const s of sales) {
    await enqueueSaleSync(userId, Number(s.id));
  }

  const financeRows = await db.getAllAsync(
    `SELECT id FROM finance_transactions WHERE owner_user_id = ? ORDER BY id ASC;`,
    [userId]
  );
  for (const f of financeRows) {
    await enqueueFinanceSync(userId, Number(f.id));
  }

  const stockRows = await db.getAllAsync(
    `SELECT id FROM stock_events WHERE owner_user_id = ? ORDER BY id ASC;`,
    [userId]
  );
  for (const e of stockRows) {
    await enqueueStockEventSync(userId, Number(e.id));
  }
}

/**
 * After cloud token is available: one-time full snapshot per local user.
 */
export async function maybeEnqueueInitialFullSync(localUserId) {
  const token = await getStoredCloudToken();
  if (!token) return;
  const flag = `${INITIAL_SYNC_PREFIX}${localUserId}`;
  const done = await AsyncStorage.getItem(flag);
  if (done) return;
  await enqueueUserRegisterOperation(localUserId);
  await enqueueFullLocalSnapshot(localUserId);
  await AsyncStorage.setItem(flag, '1');
}

async function getOutboxEligibleCount() {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) AS c FROM sync_outbox WHERE status = 'pending' OR (status = 'failed' AND attempts < 15);`
  );
  return Number(row?.c ?? 0);
}

/** Flush outbox in a loop until empty (large first-sync batches exceed one POST). */
export async function drainOutboxUntilEmpty() {
  try {
    for (let round = 0; round < 40; round += 1) {
      const token = await getStoredCloudToken();
      if (!token) {
        return;
      }

      const pending = await getOutboxEligibleCount();
      if (pending === 0) {
        if (__DEV__) {
          console.log('[TillMate sync] Outbox empty — queued changes were sent to your API (MongoDB Atlas should show updates).');
        }
        return;
      }

      const r = await flushOutboxBestEffort();
      if (__DEV__) {
        console.log(`[TillMate sync] upload round ${round + 1}`, r);
      }

      if (r.skipped && r.reason === 'offline') {
        await new Promise((res) => setTimeout(res, 2500));
        continue;
      }
    if (r.skipped && r.reason === 'no_token') return;
    if (r.skipped && (r.reason === 'sync_error' || r.reason === 'error')) {
      await new Promise((res) => setTimeout(res, 2500));
      continue;
    }

      await new Promise((res) => setTimeout(res, 500));
    }

    if (__DEV__) {
      console.warn('[TillMate sync] Still have queued items after many upload rounds; they will retry when you open the app again.');
    }
  } catch (e) {
    if (__DEV__) {
      console.warn('[TillMate sync] drainOutboxUntilEmpty stopped (ignored).', e?.message || e);
    }
  }
}

/**
 * Upserts cloud snapshot into local SQLite (stable client ids). Skips when server has no rows.
 * @param {number} localUserId SQLite users.id
 * @param {object} data bootstrap JSON
 */
export async function applyCloudBootstrap(localUserId, data) {
  if (!data || data.version == null) {
    return { applied: false, appliedRemoteRows: false };
  }
  const financeList = data.financeTransactions || [];
  const stockList = data.stockEvents || [];
  const remoteCount =
    (data.products || []).length + (data.sales || []).length + financeList.length + stockList.length;
  if (remoteCount === 0) {
    return { applied: false, appliedRemoteRows: false };
  }

  const u = data.user || {};
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE users SET full_name = ?, email = ?, phone = ?, street_address = ?, city = ?, shop_name = ?, shop_number = ?
       WHERE id = ?;`,
      [
        String(u.fullName || '').trim() || 'User',
        u.email != null && String(u.email).trim() !== '' ? String(u.email).trim().toLowerCase() : null,
        String(u.phone || '').trim(),
        String(u.streetAddress || '').trim() || '',
        String(u.city || '').trim() || '',
        u.shopName != null ? String(u.shopName).trim() : null,
        u.shopNumber != null ? String(u.shopNumber).trim() : null,
        localUserId,
      ]
    );

    for (const p of data.products || []) {
      const id = Number(p.clientProductId);
      const createdAt = p.createdAt || p.clientCreatedAt || new Date().toISOString();
      const updatedAt = p.updatedAt || p.clientUpdatedAt || createdAt;
      await db.runAsync(
        `INSERT OR REPLACE INTO products (
          id, owner_user_id, name, price, stock, category, cost_price, deleted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          id,
          localUserId,
          String(p.name || 'Unnamed'),
          Number(p.price) || 0,
          Math.max(0, Math.floor(Number(p.stock) || 0)),
          String(p.category || 'General'),
          p.costPrice == null || p.costPrice === '' ? null : Number(p.costPrice),
          p.deletedAt || null,
          createdAt,
          updatedAt,
        ]
      );
    }

    for (const s of data.sales || []) {
      const sid = Number(s.clientSaleId);
      await db.runAsync(
        `INSERT OR REPLACE INTO sales (
          id, owner_user_id, total, created_at, sale_date, paid_amount, change_amount, payment_method, reversed_total
        ) VALUES (?, ?, ?, COALESCE(?, datetime('now')), ?, ?, ?, ?, COALESCE(?, 0));`,
        [
          sid,
          localUserId,
          Number(s.total) || 0,
          s.createdAt || s.clientCreatedAt || null,
          s.saleDate || null,
          s.paidAmount != null ? Number(s.paidAmount) : null,
          s.changeAmount != null ? Number(s.changeAmount) : null,
          s.paymentMethod || 'Cash',
          s.reversedTotal != null ? Number(s.reversedTotal) : 0,
        ]
      );
      await db.runAsync(`DELETE FROM sale_items WHERE sale_id = ?;`, [sid]);
      for (const it of s.items || []) {
        const rq = it.reversedQuantity != null ? Math.max(0, Math.floor(Number(it.reversedQuantity))) : 0;
        if (it.clientSaleItemId != null && Number(it.clientSaleItemId) > 0) {
          await db.runAsync(
            `INSERT OR REPLACE INTO sale_items (id, sale_id, product_id, quantity, unit_price, product_name, reversed_quantity)
             VALUES (?, ?, ?, ?, ?, ?, ?);`,
            [
              Number(it.clientSaleItemId),
              sid,
              Number(it.productId),
              Math.max(1, Math.floor(Number(it.quantity) || 1)),
              Number(it.unitPrice) || 0,
              String(it.productName || ''),
              rq,
            ]
          );
        } else {
          await db.runAsync(
            `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, product_name, reversed_quantity)
             VALUES (?, ?, ?, ?, ?, ?);`,
            [
              sid,
              Number(it.productId),
              Math.max(1, Math.floor(Number(it.quantity) || 1)),
              Number(it.unitPrice) || 0,
              String(it.productName || ''),
              rq,
            ]
          );
        }
      }
    }

    for (const f of financeList) {
      const fid = Number(f.clientFinanceId);
      await db.runAsync(
        `INSERT OR REPLACE INTO finance_transactions (
          id, owner_user_id, type, amount, occurred_on, description, notes,
          product_id, product_name, quantity, withdrawn_by, capital_source, sale_id, hidden_at, created_at, recovers_finance_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?);`,
        [
          fid,
          localUserId,
          String(f.type),
          Number(f.amount) || 0,
          String(f.occurredOn || ''),
          String(f.description || ''),
          f.notes != null ? String(f.notes) : null,
          f.productId != null ? Number(f.productId) : null,
          f.productName != null ? String(f.productName) : null,
          f.quantity != null ? Number(f.quantity) : null,
          f.withdrawnBy != null ? String(f.withdrawnBy) : null,
          f.capitalSource != null ? String(f.capitalSource) : null,
          f.saleId != null ? Number(f.saleId) : null,
          f.hiddenAt != null ? String(f.hiddenAt) : null,
          f.createdAt || f.clientCreatedAt || null,
          f.recoversFinanceId != null ? Number(f.recoversFinanceId) : null,
        ]
      );
    }

    for (const e of stockList) {
      const eid = Number(e.clientStockEventId);
      await db.runAsync(
        `INSERT OR REPLACE INTO stock_events (
          id, owner_user_id, product_id, event_type, quantity_delta, unit_cost, reference_type, reference_id, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')));`,
        [
          eid,
          localUserId,
          Number(e.productId),
          String(e.eventType),
          Math.trunc(Number(e.quantityDelta) || 0),
          e.unitCost == null || e.unitCost === '' ? null : Number(e.unitCost),
          e.referenceType != null ? String(e.referenceType) : null,
          e.referenceId != null ? Number(e.referenceId) : null,
          e.notes != null ? String(e.notes) : null,
          e.createdAt || e.clientCreatedAt || null,
        ]
      );
    }
  });

  return { applied: true, appliedRemoteRows: true };
}

/**
 * Fetches bootstrap and merges into SQLite. Sets initial-sync flag when remote had data (skips redundant full upload).
 */
export async function tryPullCloudBootstrapIntoDb(localUserId) {
  const token = await getStoredCloudToken();
  if (!token) return false;
  try {
    const boot = await cloudAuthService.cloudFetchBootstrap(token);
    if (boot?.version == null) return false;
    const r = await applyCloudBootstrap(localUserId, boot);
    if (r.appliedRemoteRows) {
      await AsyncStorage.setItem(`${INITIAL_SYNC_PREFIX}${localUserId}`, '1');
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * After local login: obtain cloud JWT, pull server snapshot or enqueue first-time upload, then drain outbox.
 * @param {object} dbUser SQLite user row (snake_case)
 * @param {string} password
 */
export async function runPostLoginCloudSync(dbUser, password) {
  try {
    await ensureCloudSession(dbUser, password).catch(() => {});
    const uid = Number(dbUser.id);
    const token = await getStoredCloudToken();
    if (!token) return;

    const merged = await tryPullCloudBootstrapIntoDb(uid).catch(() => false);
    if (!merged) {
      await maybeEnqueueInitialFullSync(uid).catch(() => {});
    } else {
      await enqueueUserRegisterOperation(uid).catch(() => {});
    }
    await drainOutboxUntilEmpty().catch(() => {});
  } catch {
    /* never affect UI — user is already logged in locally */
  }
}

let appStateSub = null;

export function startBackgroundSync() {
  if (appStateSub) return;
  appStateSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      Promise.resolve().then(() => {
        flushOutboxBestEffort().catch(() => {});
      });
    }
  });
  Promise.resolve().then(() => {
    flushOutboxBestEffort().catch(() => {});
  });
}

export function getApiUrlForDebug() {
  return getApiBaseUrl();
}
