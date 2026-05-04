const path = require('path');
const fs = require('fs');
const cors = require('cors');
const express = require('express');

const authRoutes = require('./routes/auth.routes');
const syncRoutes = require('./routes/sync.routes');
const adminRoutes = require('./routes/admin.routes');

function attachAdminDashboard(app) {
  const adminDist = path.join(__dirname, '../admin-dashboard/dist');
  const indexHtml = path.join(adminDist, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    return;
  }
  app.use('/admin', express.static(adminDist));
  app.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !req.path.startsWith('/admin')) {
      return next();
    }
    if (path.extname(req.path)) {
      return next();
    }
    return res.sendFile(indexHtml);
  });
  console.log('[admin] Dashboard at /admin (rebuild: npm run build --prefix admin-dashboard)');
}

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'tillmate-api' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/sync', syncRoutes);
  app.use('/api/admin', adminRoutes);

  attachAdminDashboard(app);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error' });
  });

  return app;
}

module.exports = { createApp };
