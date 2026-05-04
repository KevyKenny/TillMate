import { getDb } from '../database/db';
import { validateZimbabwePhoneInput } from '../utils/phone';

function normalizeEmail(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  return value || null;
}

function assertPassword(password, confirmPassword) {
  const p = String(password ?? '');
  if (p.length < 4) {
    throw new Error('Password must be at least 4 characters.');
  }
  if (confirmPassword !== undefined && p !== String(confirmPassword ?? '')) {
    throw new Error('Password and confirm password do not match.');
  }
}

/**
 * @param {{
 * fullName: string;
 * email?: string;
 * phone: string;
 * password: string;
 * confirmPassword: string;
 * streetAddress: string;
 * city: string;
 * shopName?: string;
 * shopNumber?: string;
 * }} input
 */
export async function signUp(input) {
  const db = await getDb();
  const fullName = String(input.fullName ?? '').trim();
  if (!fullName) throw new Error('Full name is required.');
  const streetAddress = String(input.streetAddress ?? '').trim();
  const city = String(input.city ?? '').trim();
  if (!streetAddress || !city) {
    throw new Error('Street address and city are required.');
  }
  const phone = validateZimbabwePhoneInput(input.phone);
  const email = normalizeEmail(input.email);
  assertPassword(input.password, input.confirmPassword);

  const shopName = String(input.shopName ?? '').trim() || null;
  const shopNumber = String(input.shopNumber ?? '').trim() || null;
  const result = await db.runAsync(
    `INSERT INTO users (full_name, email, phone, password, street_address, city, shop_name, shop_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [fullName, email, phone, String(input.password), streetAddress, city, shopName, shopNumber]
  );
  const userId = Number(result.lastInsertRowId);
  return getUserById(userId);
}

/**
 * @param {{ identifier: string; password: string }} input
 */
export async function login(input) {
  const db = await getDb();
  const password = String(input.password ?? '');
  if (!password) throw new Error('Password is required.');
  const identifierRaw = String(input.identifier ?? '').trim();
  if (!identifierRaw) throw new Error('Email or phone is required.');

  const email = normalizeEmail(identifierRaw);
  const phone = validatePhoneMaybe(identifierRaw);
  const row = await db.getFirstAsync(
    `SELECT id, full_name, email, phone, street_address, city, shop_name, shop_number
     FROM users
     WHERE (email = ? OR phone = ?) AND password = ?
     LIMIT 1;`,
    [email, phone, password]
  );
  if (!row) throw new Error('Invalid credentials.');
  return row;
}

function validatePhoneMaybe(identifierRaw) {
  try {
    return validateZimbabwePhoneInput(identifierRaw);
  } catch {
    return '__INVALID_PHONE__';
  }
}

export async function getUserById(userId) {
  const db = await getDb();
  return db.getFirstAsync(
    `SELECT id, full_name, email, phone, street_address, city, shop_name, shop_number
     FROM users
     WHERE id = ?;`,
    [userId]
  );
}

/**
 * @param {{
 * userId: number;
 * fullName: string;
 * email?: string;
 * phone: string;
 * streetAddress: string;
 * city: string;
 * shopName?: string;
 * shopNumber?: string;
 * }} input
 */
export async function updateUserProfile(input) {
  const db = await getDb();
  const userId = Number(input.userId);
  if (!userId) throw new Error('User session is required.');

  const fullName = String(input.fullName ?? '').trim();
  const streetAddress = String(input.streetAddress ?? '').trim();
  const city = String(input.city ?? '').trim();
  if (!fullName || !streetAddress || !city) {
    throw new Error('Full name, street address, and city are required.');
  }

  const phone = validateZimbabwePhoneInput(input.phone);
  const email = normalizeEmail(input.email);
  const shopName = String(input.shopName ?? '').trim() || null;
  const shopNumber = String(input.shopNumber ?? '').trim() || null;

  try {
    await db.runAsync(
      `UPDATE users
       SET full_name = ?, email = ?, phone = ?, street_address = ?, city = ?, shop_name = ?, shop_number = ?
       WHERE id = ?;`,
      [fullName, email, phone, streetAddress, city, shopName, shopNumber, userId]
    );
  } catch (e) {
    if (String(e?.message || '').toLowerCase().includes('unique')) {
      throw new Error('Phone or email already exists.');
    }
    throw e;
  }
  return getUserById(userId);
}

/**
 * @param {{ userId: number; currentPassword: string; newPassword: string; confirmPassword: string }} input
 */
export async function changePassword(input) {
  const db = await getDb();
  const userId = Number(input.userId);
  if (!userId) throw new Error('User session is required.');
  const currentPassword = String(input.currentPassword ?? '');
  if (!currentPassword) throw new Error('Current password is required.');
  assertPassword(input.newPassword, input.confirmPassword);
  const newPassword = String(input.newPassword ?? '');

  const row = await db.getFirstAsync(`SELECT password FROM users WHERE id = ? LIMIT 1;`, [userId]);
  if (!row) throw new Error('User not found.');
  if (String(row.password) !== currentPassword) throw new Error('Current password is incorrect.');
  await db.runAsync(`UPDATE users SET password = ? WHERE id = ?;`, [newPassword, userId]);
  return true;
}

export async function verifyPasswordResetIdentity({ phone, fullName }) {
  const db = await getDb();
  const normalizedPhone = validateZimbabwePhoneInput(phone);
  const normalizedName = String(fullName ?? '').trim().toLowerCase();
  if (!normalizedName) throw new Error('Full name is required.');
  const row = await db.getFirstAsync(
    `SELECT id, full_name
     FROM users
     WHERE phone = ? AND lower(trim(full_name)) = ?
     LIMIT 1;`,
    [normalizedPhone, normalizedName]
  );
  if (!row) {
    throw new Error('Could not verify these details. Check phone number and full name.');
  }
  return { userId: Number(row.id), fullName: row.full_name, phone: normalizedPhone };
}

export async function resetPasswordWithRecovery({ phone, fullName, newPassword, confirmPassword }) {
  const verified = await verifyPasswordResetIdentity({ phone, fullName });
  assertPassword(newPassword, confirmPassword);
  const db = await getDb();
  await db.runAsync(`UPDATE users SET password = ? WHERE id = ?;`, [String(newPassword), verified.userId]);
  return true;
}

export async function deleteAccountWithVerification({ userId, phone, password }) {
  const db = await getDb();
  const uid = Number(userId);
  if (!uid) throw new Error('User session is required.');
  const normalizedPhone = validateZimbabwePhoneInput(phone);
  const pwd = String(password ?? '');
  if (!pwd) throw new Error('Password is required.');

  const row = await db.getFirstAsync(
    `SELECT id FROM users WHERE id = ? AND phone = ? AND password = ? LIMIT 1;`,
    [uid, normalizedPhone, pwd]
  );
  if (!row) throw new Error('Verification failed. Phone or password is incorrect.');

  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM finance_transactions WHERE owner_user_id = ?;`, [uid]);
    await db.runAsync(`DELETE FROM stock_events WHERE owner_user_id = ?;`, [uid]);
    await db.runAsync(`DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE owner_user_id = ?);`, [uid]);
    await db.runAsync(`DELETE FROM sales WHERE owner_user_id = ?;`, [uid]);
    await db.runAsync(`DELETE FROM products WHERE owner_user_id = ?;`, [uid]);
    await db.runAsync(`DELETE FROM users WHERE id = ?;`, [uid]);
  });
  return true;
}

/** Assign old rows (without owner) to first authenticating user. */
export async function claimUnownedData(userId) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`UPDATE products SET owner_user_id = ? WHERE owner_user_id IS NULL;`, [userId]);
    await db.runAsync(`UPDATE sales SET owner_user_id = ? WHERE owner_user_id IS NULL;`, [userId]);
  });
}
