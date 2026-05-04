require('dotenv').config();

const { connectDatabase } = require('./config/database');
const { createApp } = require('./app');
const { ensureAdminUser } = require('./bootstrap/ensureAdmin');

const PORT = Number(process.env.PORT) || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tillmate';

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set');
  process.exit(1);
}

async function main() {
  try {
    await connectDatabase(MONGODB_URI);
  } catch (err) {
    const msg = String(err?.message || err);
    console.error('\n[TillMate] MongoDB connection failed.\n');
    if (/whitelist|IP|not allowed|ECONNREFUSED|ETIMEDOUT|ReplicaSetNoPrimary/i.test(msg)) {
      console.error('Atlas usually blocks unknown IPs. Fix it:');
      console.error('  1. Open MongoDB Atlas → Network Access → Add IP Address');
      console.error('  2. Run from this folder:  npm run atlas-ip');
      console.error('     (paste that IP into Atlas), or for local dev only: 0.0.0.0/0\n');
    }
    console.error(msg);
    process.exit(1);
  }
  console.log('[db] connected to MongoDB');

  await ensureAdminUser();

  const app = createApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] listening on http://0.0.0.0:${PORT} (reachable on your LAN for mobile dev)`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
