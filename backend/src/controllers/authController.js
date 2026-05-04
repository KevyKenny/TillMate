const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { signUserToken } = require('../utils/jwt');

async function register(req, res) {
  try {
    const {
      phone,
      email,
      password,
      fullName,
      streetAddress,
      city,
      shopName,
      shopNumber,
      clientUserId,
    } = req.body;

    if (!phone || !password || !fullName || !streetAddress || !city) {
      return res.status(400).json({ error: 'phone, password, fullName, streetAddress, city are required' });
    }

    const exists = await User.findOne({ phone: String(phone).trim() });
    if (exists) return res.status(409).json({ error: 'Phone already registered' });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create({
      phone: String(phone).trim(),
      email: email ? String(email).trim().toLowerCase() : undefined,
      passwordHash,
      fullName: String(fullName).trim(),
      streetAddress: String(streetAddress).trim(),
      city: String(city).trim(),
      shopName: shopName ? String(shopName).trim() : undefined,
      shopNumber: shopNumber ? String(shopNumber).trim() : undefined,
      clientUserId: clientUserId != null ? Number(clientUserId) : undefined,
      role: 'user',
    });

    const token = signUserToken(user);
    return res.status(201).json({
      token,
      user: {
        id: user._id,
        phone: user.phone,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        clientUserId: user.clientUserId,
      },
    });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Duplicate email or phone' });
    return res.status(500).json({ error: e.message || 'Registration failed' });
  }
}

async function login(req, res) {
  try {
    const { phone, email, password } = req.body;
    if (!password || (!phone && !email)) {
      return res.status(400).json({ error: 'password and (phone or email) required' });
    }

    const query = phone ? { phone: String(phone).trim() } : { email: String(email).trim().toLowerCase() };
    const user = await User.findOne(query);
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signUserToken(user);
    return res.json({
      token,
      user: {
        id: user._id,
        phone: user.phone,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        clientUserId: user.clientUserId,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Login failed' });
  }
}

/**
 * Dev-only: exposes ADMIN_EMAIL / ADMIN_PASSWORD for the admin UI login screen.
 * Disabled when NODE_ENV=production (set that in real deployments).
 */
function devAdminCredentials(req, res) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  const email = process.env.ADMIN_EMAIL ? String(process.env.ADMIN_EMAIL).trim() : '';
  const password = process.env.ADMIN_PASSWORD ? String(process.env.ADMIN_PASSWORD) : '';
  if (!email || !password) {
    return res.json({
      enabled: false,
      message: 'Set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env, then restart the API.',
    });
  }
  return res.json({ enabled: true, email, password });
}

module.exports = { register, login, devAdminCredentials };
