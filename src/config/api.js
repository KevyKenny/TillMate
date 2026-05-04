import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * If `EXPO_PUBLIC_API_URL` is `http://host` with no port, assume API on :4000 (TillMate default).
 * Leaves `https://...` unchanged (port 443 implied).
 * @param {string} base
 */
function ensureHttpDevPort(base) {
  const s = String(base).trim().replace(/\/$/, '');
  if (!s || !/^http:\/\//i.test(s)) return s;
  if (/^http:\/\/[^/]+:\d+/i.test(s)) return s;
  return s.replace(/^http:\/\/([^/]+)/i, 'http://$1:4000');
}

/**
 * Hostname of the machine running Metro (same machine as your API in dev).
 * Physical devices must use this LAN IP — not `10.0.2.2` (emulator-only) or `localhost`.
 */
function inferDevMachineHostname() {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri && typeof hostUri === 'string') {
    const host = hostUri.split(':')[0].trim();
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return host;
    }
  }
  const dbg = Constants.expoGoConfig?.debuggerHost;
  if (dbg && typeof dbg === 'string') {
    const host = dbg.split(':')[0].trim();
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return host;
    }
  }
  return null;
}

/**
 * Base URL for TillMate API (Express backend). Resolution order:
 * 1. `EXPO_PUBLIC_API_URL` in a root `.env` (recommended for phone hotspot or production).
 * 2. `expo.extra.apiUrl` in app.json / app.config.
 * 3. Dev: hostname from `expoConfig.hostUri` (Metro host) + `:4000`.
 * 4. Fallback: Android emulator `10.0.2.2`, iOS simulator `localhost`.
 *
 * Hotspot (laptop connected to the phone): set `.env` to your laptop’s IPv4 on that
 * network (see `.env.example`). When you host the API, set the same variable to your HTTPS URL.
 */
export function getApiBaseUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && String(fromEnv).trim()) {
    return ensureHttpDevPort(String(fromEnv).trim().replace(/\/$/, ''));
  }
  const extra = Constants.expoConfig?.extra?.apiUrl;
  if (extra && String(extra).trim()) {
    return ensureHttpDevPort(String(extra).trim().replace(/\/$/, ''));
  }
  const devHost = inferDevMachineHostname();
  if (devHost) {
    return `http://${devHost}:4000`;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:4000';
  }
  return 'http://localhost:4000';
}
