import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { apiFetch, getToken, setToken } from '../api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [devHint, setDevHint] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/dev-admin-credentials');
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 404) {
          setDevHint({ mode: 'prod' });
          return;
        }
        if (data.enabled && data.email) {
          setDevHint({ mode: 'ok', email: data.email, password: data.password || '' });
          setEmail(String(data.email).trim().toLowerCase());
          if (data.password) setPassword(String(data.password));
        } else {
          setDevHint({ mode: 'missing', message: data.message || 'Configure backend/.env' });
        }
      } catch {
        if (!cancelled) setDevHint({ mode: 'offline' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (getToken()) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      if (data.user?.role !== 'admin') {
        setError('This account is not an admin. Use ADMIN_EMAIL from your server .env.');
        setLoading(false);
        return;
      }
      setToken(data.token);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>TillMate Admin</h2>
        <p className="sub">Sign in with the admin account from your backend environment.</p>
        {devHint?.mode === 'ok' ? (
          <div className="dev-cred-hint">
            <div className="title">Dev — admin sign-in (from backend/.env)</div>
            <div className="row">
              <strong>Email</strong>
              <code>{devHint.email}</code>
            </div>
            <div className="row">
              <strong>Password</strong>
              <code>{devHint.password || '(empty)'}</code>
            </div>
            <div className="fine">
              Fields below are pre-filled for you. This panel only appears when the API is not in
              NODE_ENV=production — never expose production secrets on a public server.
            </div>
          </div>
        ) : null}
        {devHint?.mode === 'missing' ? (
          <div className="dev-cred-hint">
            <div className="title">Could not load admin credentials</div>
            <div className="fine">{devHint.message}</div>
          </div>
        ) : null}
        {devHint?.mode === 'offline' ? (
          <div className="error-banner">
            API not reachable (MongoDB must connect so the server can start). Open{' '}
            <code style={{ color: 'inherit' }}>backend/.env</code> and use ADMIN_EMAIL / ADMIN_PASSWORD
            here, or fix Atlas then refresh.
          </div>
        ) : null}
        {devHint?.mode === 'prod' ? (
          <div className="fine" style={{ marginBottom: 16, color: 'var(--muted)' }}>
            Production API: use the credentials your administrator gave you (not shown here).
          </div>
        ) : null}
        {error ? <div className="error-banner">{error}</div> : null}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
