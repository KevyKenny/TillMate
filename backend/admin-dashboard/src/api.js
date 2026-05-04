const TOKEN_KEY = 'tillmate_admin_jwt';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function loginPath() {
  const b = import.meta.env.BASE_URL.replace(/\/$/, '') || '';
  return `${b}/login`;
}

export async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (!headers['Content-Type'] && options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && token) {
    clearToken();
    if (!String(url).includes('/api/auth/login') && typeof window !== 'undefined') {
      window.location.assign(loginPath());
    }
  }

  if (!res.ok) {
    const err = new Error(data.error || res.statusText || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

export function formatMoney(value) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
}

export function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return String(iso);
  }
}
