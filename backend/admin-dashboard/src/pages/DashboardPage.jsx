import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, clearToken, formatDate, formatMoney } from '../api';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const [detail, setDetail] = useState(null);
  const [stats, setStats] = useState(null);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const data = await apiFetch('/api/admin/users?limit=100');
      setUsers(data.users || []);
    } catch (e) {
      setUsersError(e.message || 'Could not load users');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const loadUserDetail = useCallback(async (userId) => {
    if (!userId) return;
    setDetailLoading(true);
    setDetailError('');
    setDetail(null);
    setStats(null);
    setProducts([]);
    setSales([]);
    try {
      const [userRes, statsRes, prodRes, saleRes] = await Promise.all([
        apiFetch(`/api/admin/users/${userId}`),
        apiFetch(`/api/admin/users/${userId}/stats`),
        apiFetch(`/api/admin/users/${userId}/products?limit=200`),
        apiFetch(`/api/admin/users/${userId}/sales?limit=200`),
      ]);
      setDetail(userRes.user);
      setStats(statsRes);
      setProducts(prodRes.products || []);
      setSales(saleRes.sales || []);
    } catch (e) {
      setDetailError(e.message || 'Could not load user');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadUserDetail(selectedId);
  }, [selectedId, loadUserDetail]);

  function logout() {
    clearToken();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>TillMate Admin</h1>
        <button type="button" className="btn-ghost" onClick={logout}>
          Log out
        </button>
      </header>
      <div className="app-main">
        <aside className="sidebar">
          <div className="sidebar-header">Registered users</div>
          <div className="user-list">
            {usersLoading ? <div className="muted" style={{ padding: '12px 14px' }}>Loading…</div> : null}
            {usersError ? <div className="error-banner" style={{ margin: '8px' }}>{usersError}</div> : null}
            {!usersLoading &&
              users.map((u) => {
                const id = u._id;
                const active = id === selectedId;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`user-row${active ? ' active' : ''}`}
                    onClick={() => setSelectedId(id)}
                  >
                    <div className="name">{u.fullName || '—'}</div>
                    <div className="meta">
                      {u.phone} {u.email ? `· ${u.email}` : ''}
                    </div>
                  </button>
                );
              })}
            {!usersLoading && !users.length && !usersError ? (
              <div className="muted" style={{ padding: '12px 14px' }}>
                No merchant users yet. Sync from the mobile app first.
              </div>
            ) : null}
          </div>
        </aside>
        <main className="detail">
          {!selectedId ? (
            <div className="detail-empty">Select a user to view products, sales, and revenue.</div>
          ) : detailLoading ? (
            <div className="detail-empty">Loading user…</div>
          ) : detailError ? (
            <div className="error-banner">{detailError}</div>
          ) : detail ? (
            <>
              <h2 style={{ margin: '0 0 8px', fontSize: '1.35rem' }}>{detail.fullName}</h2>
              <div style={{ marginBottom: '20px', color: 'var(--muted)', fontSize: '0.9rem' }}>
                {detail.phone}
                {detail.email ? ` · ${detail.email}` : ''}
                {detail.city ? ` · ${detail.city}` : ''}
              </div>
              <div style={{ marginBottom: '24px', fontSize: '0.9rem' }}>
                <div className="profile-line">
                  <strong>Shop</strong> {detail.shopName || '—'}
                  {detail.shopNumber ? ` (${detail.shopNumber})` : ''}
                </div>
                <div className="profile-line">
                  <strong>Client user id</strong> {detail.clientUserId != null ? detail.clientUserId : '—'}
                </div>
                <div className="profile-line">
                  <strong>Joined</strong> {formatDate(detail.createdAt)}
                </div>
              </div>

              {stats ? (
                <div className="stat-grid">
                  <div className="stat-card">
                    <div className="label">Total revenue</div>
                    <div className="value">{formatMoney(stats.totalRevenue)}</div>
                  </div>
                  <div className="stat-card">
                    <div className="label">Sales count</div>
                    <div className="value">{stats.saleCount}</div>
                  </div>
                  <div className="stat-card">
                    <div className="label">Products</div>
                    <div className="value">{stats.productCount}</div>
                  </div>
                </div>
              ) : null}

              <div className="panel">
                <div className="panel-header">Products</div>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Price</th>
                        <th>Stock</th>
                        <th>Category</th>
                        <th>Local id</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="muted" style={{ padding: '20px' }}>
                            No products.
                          </td>
                        </tr>
                      ) : (
                        products.map((p) => (
                          <tr key={p._id}>
                            <td>{p.name}</td>
                            <td>{formatMoney(p.price)}</td>
                            <td>{p.stock}</td>
                            <td>{p.category || '—'}</td>
                            <td className="muted">{p.clientProductId}</td>
                            <td>
                              {p.deletedAt ? <span className="badge warn">Deleted</span> : <span className="badge">Active</span>}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">Sales</div>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Total</th>
                        <th>Paid</th>
                        <th>Change</th>
                        <th>Method</th>
                        <th>Local sale id</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="muted" style={{ padding: '20px' }}>
                            No sales.
                          </td>
                        </tr>
                      ) : (
                        sales.map((s) => (
                          <tr key={s._id}>
                            <td>{s.saleDate || formatDate(s.createdAt)}</td>
                            <td>{formatMoney(s.total)}</td>
                            <td>{s.paidAmount != null ? formatMoney(s.paidAmount) : '—'}</td>
                            <td>{s.changeAmount != null ? formatMoney(s.changeAmount) : '—'}</td>
                            <td>{s.paymentMethod || '—'}</td>
                            <td className="muted">{s.clientSaleId}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
