import { getApiBaseUrl } from '../config/api';

const FETCH_TIMEOUT_MS = 15000;

/**
 * @param {string} url
 * @param {RequestInit} [init]
 */
async function fetchWithTimeout(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

/**
 * @param {Record<string, unknown>} body
 */
export async function cloudRegister(body) {
  const base = getApiBaseUrl();
  const res = await fetchWithTimeout(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    const err = new Error(data.error || data.message || `Register failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * @param {{ phone?: string; email?: string; password: string }} body
 */
export async function cloudLogin(body) {
  const base = getApiBaseUrl();
  const res = await fetchWithTimeout(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    const err = new Error(data.error || data.message || `Login failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * @param {string} token
 * @param {{ operations: Array<{ type: string; payload: unknown }> }} body
 */
export async function cloudSyncBatch(token, body) {
  const base = getApiBaseUrl();
  const res = await fetchWithTimeout(`${base}/api/sync/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await parseJsonResponse(res);
  if (Array.isArray(data.results)) {
    return data;
  }
  if (!res.ok) {
    const err = new Error(data.error || data.message || `Sync failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function cloudHealthCheck() {
  const base = getApiBaseUrl();
  const res = await fetchWithTimeout(`${base}/health`, { method: 'GET' });
  return res.ok;
}
