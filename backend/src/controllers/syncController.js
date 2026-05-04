const mongoose = require('mongoose');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const User = require('../models/User');

/**
 * POST body: { operations: [{ type, payload }] }
 * types: user.register | product.upsert | sale.upsert
 *
 * user.register — links JWT user to mobile clientUserId / profile (optional first sync)
 * product.upsert — idempotent on (userId, clientProductId)
 * sale.upsert — replaces sale + items for (userId, clientSaleId)
 */
async function processBatch(req, res) {
  const userId = new mongoose.Types.ObjectId(req.userId);
  const { operations } = req.body;

  if (!Array.isArray(operations) || operations.length === 0) {
    return res.status(400).json({ error: 'operations must be a non-empty array' });
  }

  if (operations.length > 500) {
    return res.status(400).json({ error: 'Batch too large (max 500 operations)' });
  }

  const results = [];

  for (let i = 0; i < operations.length; i += 1) {
    const op = operations[i];
    const index = i;
    try {
      if (!op || typeof op.type !== 'string') {
        results.push({ index, ok: false, error: 'Missing type' });
        continue;
      }

      if (op.type === 'user.register') {
        const { clientUserId, email, fullName, streetAddress, city, shopName, shopNumber, phone } = op.payload || {};
        const update = {};
        if (clientUserId != null) update.clientUserId = Number(clientUserId);
        if (email) update.email = String(email).trim().toLowerCase();
        if (fullName) update.fullName = String(fullName).trim();
        if (streetAddress) update.streetAddress = String(streetAddress).trim();
        if (city) update.city = String(city).trim();
        if (shopName != null) update.shopName = String(shopName).trim();
        if (shopNumber != null) update.shopNumber = String(shopNumber).trim();
        if (phone) update.phone = String(phone).trim();

        const user = await User.findByIdAndUpdate(userId, { $set: update }, { new: true });
        if (!user) {
          results.push({ index, ok: false, error: 'User not found' });
          continue;
        }
        results.push({ index, ok: true, type: op.type, userId: String(user._id) });
        continue;
      }

      if (op.type === 'product.upsert') {
        const p = op.payload || {};
        if (p.clientProductId == null) throw new Error('clientProductId required');

        const doc = {
          userId,
          clientProductId: Number(p.clientProductId),
          name: String(p.name || '').trim() || 'Unnamed',
          price: Number(p.price) || 0,
          stock: Math.max(0, Math.floor(Number(p.stock) || 0)),
          category: String(p.category || 'General').trim() || 'General',
          costPrice: p.costPrice == null || p.costPrice === '' ? null : Number(p.costPrice),
          deletedAt: p.deletedAt ? new Date(p.deletedAt) : null,
          clientCreatedAt: p.clientCreatedAt || undefined,
          clientUpdatedAt: p.clientUpdatedAt || undefined,
        };

        const saved = await Product.findOneAndUpdate(
          { userId, clientProductId: doc.clientProductId },
          { $set: doc },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        results.push({ index, ok: true, type: op.type, serverProductId: String(saved._id) });
        continue;
      }

      if (op.type === 'sale.upsert') {
        const s = op.payload || {};
        if (s.clientSaleId == null) throw new Error('clientSaleId required');

        const saleDoc = {
          userId,
          clientSaleId: Number(s.clientSaleId),
          total: Number(s.total) || 0,
          saleDate: s.saleDate ? String(s.saleDate) : undefined,
          paidAmount: s.paidAmount != null ? Number(s.paidAmount) : undefined,
          changeAmount: s.changeAmount != null ? Number(s.changeAmount) : undefined,
          paymentMethod: String(s.paymentMethod || 'Cash'),
          clientCreatedAt: s.clientCreatedAt || undefined,
        };

        const sale = await Sale.findOneAndUpdate(
          { userId, clientSaleId: saleDoc.clientSaleId },
          { $set: saleDoc },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        await SaleItem.deleteMany({ saleId: sale._id });

        const items = Array.isArray(s.items) ? s.items : [];
        if (items.length) {
          const rows = items.map((it, idx) => ({
            userId,
            saleId: sale._id,
            clientSaleId: saleDoc.clientSaleId,
            clientItemIndex: it.clientItemIndex != null ? Number(it.clientItemIndex) : idx,
            productId: Number(it.productId),
            productName: it.productName != null ? String(it.productName) : '',
            quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
            unitPrice: Number(it.unitPrice) || 0,
          }));
          await SaleItem.insertMany(rows);
        }

        results.push({ index, ok: true, type: op.type, serverSaleId: String(sale._id) });
        continue;
      }

      results.push({ index, ok: false, error: `Unknown operation type: ${op.type}` });
    } catch (err) {
      results.push({ index, ok: false, error: err.message || 'Operation failed' });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  const okCount = operations.length - failed;
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(`[sync] MongoDB: ${okCount}/${operations.length} operations applied`);
  }
  return res.status(failed === operations.length ? 400 : 200).json({
    accepted: operations.length,
    failed,
    results,
  });
}

module.exports = { processBatch };
