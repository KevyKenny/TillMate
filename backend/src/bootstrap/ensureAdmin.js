const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { signUserToken } = require('../utils/jwt');

/**
 * Creates or updates admin user from env (for dashboard login).
 */
async function ensureAdminUser() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('[bootstrap] ADMIN_EMAIL / ADMIN_PASSWORD not set — skip admin seed');
    return;
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const normalizedEmail = String(email).trim().toLowerCase();
  const syntheticPhone = `admin:${normalizedEmail}`;
  const admin = await User.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        email: normalizedEmail,
        phone: syntheticPhone,
        passwordHash,
        fullName: 'TillMate Admin',
        streetAddress: '—',
        city: '—',
        role: 'admin',
      },
    },
    { upsert: true, new: true }
  );

  const token = signUserToken(admin);
  console.log('[bootstrap] Admin ready:', admin.email);
  console.log('[bootstrap] Admin JWT (dev only, rotate in prod):', token);
}

module.exports = { ensureAdminUser };
