const mongoose = require('mongoose');

/**
 * Tenant root: one user owns products/sales. Mobile SQLite `owner_user_id` maps here via `clientUserId`.
 */
const userSchema = new mongoose.Schema(
  {
    clientUserId: { type: Number, index: true, sparse: true },
    email: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
    phone: { type: String, trim: true, required: true, unique: true },
    passwordHash: { type: String },
    fullName: { type: String, required: true, trim: true },
    streetAddress: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    shopName: { type: String, trim: true },
    shopNumber: { type: String, trim: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
