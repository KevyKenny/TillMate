import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { getApiBaseUrl } from '../config/api';
import { getDb } from '../database/db';
import * as cloudAuthService from './cloudAuthService';

const CLOUD_JWT_KEY = '@tillmate_cloud_jwt_v1';
const INITIAL_SYNC_PREFIX = '@tillmate_initial_cloud_sync_v1_';

const OUTBOX_LIMIT = 200;

/**
 * @param {{ type: string; payload: unknown }} operation
 */
export async function enqueueSyncOperation(operation) {
  const db = await getDb();
  await db.runAsync(`INSERT INTO sync_outbox (payload) VALUES (?);`, [JSON.stringify(operation)]);
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
  const online = await cloudAuthService.cloudHealthCheck().catch(() => false);
  if (!online) {
    if (__DEV__) {
      console.warn(
        `[TillMate sync] API not reachable at ${getApiBaseUrl()}. Cloud backup will not run until the device can reach your backend (same Wi‑Fi, firewall allows port 4000, or set EXPO_PUBLIC_API_URL).`
      );
    }
    return { skipped: true, reason: 'offline' };
  }

  const token = await getStoredCloudToken();
  if (!token) {
    if (__DEV__) {
      console.warn(
        '[TillMate sync] No cloud JWT — log in while the API is reachable so the app can register with the server and upload data.'
      );
    }
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
 * @param {number} saleId local sales.id
 */
export async function enqueueSaleSync(userId, saleId) {
  const db = await getDb();
  const sale = await db.getFirstAsync(
    `SELECT id, total, sale_date, paid_amount, change_amount, payment_method, created_at
     FROM sales WHERE id = ? AND owner_user_id = ?;`,
    [saleId, userId]
  );
  if (!sale) return;
  const items = await db.getAllAsync(
    `SELECT product_id, product_name, quantity, unit_price, id
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
      items: items.map((it, idx) => ({
        clientItemIndex: idx,
        productId: Number(it.product_id),
        productName: it.product_name || '',
        quantity: Number(it.quantity),
        unitPrice: Number(it.unit_price),
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
  for (let round = 0; round < 40; round += 1) {
    const token = await getStoredCloudToken();
    if (!token) {
      if (__DEV__) {
        console.warn(
          '[TillMate sync] No cloud JWT — the app could not reach your API or register/login failed. Set EXPO_PUBLIC_API_URL to http://YOUR_PC_IP:4000, restart Expo, ensure backend is running, then log in again.'
        );
      }
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
    if (r.skipped && r.reason === 'sync_error') {
      await new Promise((res) => setTimeout(res, 2500));
      continue;
    }

    await new Promise((res) => setTimeout(res, 500));
  }

  if (__DEV__) {
    console.warn('[TillMate sync] Still have queued items after many upload rounds; they will retry when you open the app again.');
  }
}

/**
 * After local login: obtain cloud JWT, enqueue first-time snapshot, then upload until outbox is clear.
 * @param {object} dbUser SQLite user row (snake_case)
 * @param {string} password
 */
export async function runPostLoginCloudSync(dbUser, password) {
  await ensureCloudSession(dbUser, password).catch(() => {});
  await maybeEnqueueInitialFullSync(Number(dbUser.id)).catch(() => {});
  await drainOutboxUntilEmpty();
}

let appStateSub = null;

export function startBackgroundSync() {
  if (appStateSub) return;
  appStateSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      flushOutboxBestEffort().catch(() => {});
    }
  });
  flushOutboxBestEffort().catch(() => {});
}

export function getApiUrlForDebug() {
  return getApiBaseUrl();
}
