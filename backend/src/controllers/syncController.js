const mongoose = require('mongoose');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const User = require('../models/User');
const FinanceTransaction = require('../models/FinanceTransaction');
const StockEvent = require('../models/StockEvent');

const FINANCE_TYPE_SET = new Set(FinanceTransaction.FINANCE_TYPES || []);
const STOCK_EVENT_TYPE_SET = new Set(StockEvent.STOCK_EVENT_TYPES || []);

/**
 * POST /batch body: { operations: [{ type, payload }] }
 * types: user.register | product.upsert | sale.upsert | finance.upsert | stock_event.upsert
 *
 * GET /bootstrap — full tenant snapshot for SQLite restore (version 2 adds finance + stock_events).
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
          reversedTotal: s.reversedTotal != null ? Number(s.reversedTotal) : 0,
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
            reversedQuantity: it.reversedQuantity != null ? Math.max(0, Math.floor(Number(it.reversedQuantity))) : 0,
            clientSaleItemId: it.clientSaleItemId != null ? Number(it.clientSaleItemId) : null,
          }));
          await SaleItem.insertMany(rows);
        }

        results.push({ index, ok: true, type: op.type, serverSaleId: String(sale._id) });
        continue;
      }

      if (op.type === 'finance.upsert') {
        const f = op.payload || {};
        if (f.clientFinanceId == null) throw new Error('clientFinanceId required');
        const t = String(f.type || '');
        if (!FINANCE_TYPE_SET.has(t)) throw new Error(`Invalid finance type: ${t}`);

        const doc = {
          userId,
          clientFinanceId: Number(f.clientFinanceId),
          type: t,
          amount: Number(f.amount) || 0,
          occurredOn: String(f.occurredOn || '').trim() || '1970-01-01',
          description: String(f.description || '').trim() || '',
          notes: f.notes != null && f.notes !== '' ? String(f.notes) : null,
          productId: f.productId != null ? Number(f.productId) : null,
          productName: f.productName != null ? String(f.productName) : null,
          quantity: f.quantity != null ? Number(f.quantity) : null,
          withdrawnBy: f.withdrawnBy != null ? String(f.withdrawnBy) : null,
          capitalSource: f.capitalSource != null ? String(f.capitalSource) : null,
          saleId: f.saleId != null ? Number(f.saleId) : null,
          hiddenAt: f.hiddenAt != null && f.hiddenAt !== '' ? String(f.hiddenAt) : null,
          clientCreatedAt: f.clientCreatedAt || undefined,
          recoversFinanceId: f.recoversFinanceId != null ? Number(f.recoversFinanceId) : null,
        };

        const saved = await FinanceTransaction.findOneAndUpdate(
          { userId, clientFinanceId: doc.clientFinanceId },
          { $set: doc },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        results.push({ index, ok: true, type: op.type, serverFinanceId: String(saved._id) });
        continue;
      }

      if (op.type === 'stock_event.upsert') {
        const e = op.payload || {};
        if (e.clientStockEventId == null) throw new Error('clientStockEventId required');
        const et = String(e.eventType || '');
        if (!STOCK_EVENT_TYPE_SET.has(et)) throw new Error(`Invalid stock event type: ${et}`);

        const doc = {
          userId,
          clientStockEventId: Number(e.clientStockEventId),
          productId: Number(e.productId),
          eventType: et,
          quantityDelta: Math.trunc(Number(e.quantityDelta) || 0),
          unitCost: e.unitCost == null || e.unitCost === '' ? null : Number(e.unitCost),
          referenceType: e.referenceType != null ? String(e.referenceType) : null,
          referenceId: e.referenceId != null ? Number(e.referenceId) : null,
          notes: e.notes != null ? String(e.notes) : null,
          clientCreatedAt: e.clientCreatedAt || undefined,
        };

        const saved = await StockEvent.findOneAndUpdate(
          { userId, clientStockEventId: doc.clientStockEventId },
          { $set: doc },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        results.push({ index, ok: true, type: op.type, serverStockEventId: String(saved._id) });
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

async function getBootstrap(req, res) {
  const userId = new mongoose.Types.ObjectId(req.userId);
  const user = await User.findById(userId).select('-passwordHash').lean();
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const [products, sales, financeRows, stockRows] = await Promise.all([
    Product.find({ userId }).sort({ clientProductId: 1 }).lean(),
    Sale.find({ userId }).sort({ clientSaleId: 1 }).lean(),
    FinanceTransaction.find({ userId }).sort({ clientFinanceId: 1 }).lean(),
    StockEvent.find({ userId }).sort({ clientStockEventId: 1 }).lean(),
  ]);

  const saleIds = sales.map((s) => s._id);
  const allItems =
    saleIds.length > 0
      ? await SaleItem.find({ saleId: { $in: saleIds } })
          .sort({ clientSaleId: 1, clientItemIndex: 1 })
          .lean()
      : [];

  const itemsBySaleId = new Map();
  for (const it of allItems) {
    const key = String(it.saleId);
    if (!itemsBySaleId.has(key)) itemsBySaleId.set(key, []);
    itemsBySaleId.get(key).push({
      clientItemIndex: it.clientItemIndex,
      clientSaleItemId: it.clientSaleItemId != null ? Number(it.clientSaleItemId) : null,
      productId: it.productId,
      productName: it.productName || '',
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      reversedQuantity: it.reversedQuantity != null ? Number(it.reversedQuantity) : 0,
    });
  }

  const productsOut = products.map((p) => ({
    clientProductId: p.clientProductId,
    name: p.name,
    price: p.price,
    stock: p.stock,
    category: p.category,
    costPrice: p.costPrice,
    deletedAt: p.deletedAt ? new Date(p.deletedAt).toISOString() : null,
    clientCreatedAt: p.clientCreatedAt,
    clientUpdatedAt: p.clientUpdatedAt,
    createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
    updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : undefined,
  }));

  const salesOut = sales.map((s) => ({
    clientSaleId: s.clientSaleId,
    total: s.total,
    saleDate: s.saleDate,
    paidAmount: s.paidAmount,
    changeAmount: s.changeAmount,
    paymentMethod: s.paymentMethod,
    clientCreatedAt: s.clientCreatedAt,
    reversedTotal: s.reversedTotal != null ? Number(s.reversedTotal) : 0,
    createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : undefined,
    items: itemsBySaleId.get(String(s._id)) || [],
  }));

  const financeOut = financeRows.map((f) => ({
    clientFinanceId: f.clientFinanceId,
    type: f.type,
    amount: f.amount,
    occurredOn: f.occurredOn,
    description: f.description,
    notes: f.notes,
    productId: f.productId,
    productName: f.productName,
    quantity: f.quantity,
    withdrawnBy: f.withdrawnBy,
    capitalSource: f.capitalSource,
    saleId: f.saleId,
    hiddenAt: f.hiddenAt,
    clientCreatedAt: f.clientCreatedAt,
    recoversFinanceId: f.recoversFinanceId,
    createdAt: f.createdAt ? new Date(f.createdAt).toISOString() : undefined,
  }));

  const stockOut = stockRows.map((e) => ({
    clientStockEventId: e.clientStockEventId,
    productId: e.productId,
    eventType: e.eventType,
    quantityDelta: e.quantityDelta,
    unitCost: e.unitCost,
    referenceType: e.referenceType,
    referenceId: e.referenceId,
    notes: e.notes,
    clientCreatedAt: e.clientCreatedAt,
    createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : undefined,
  }));

  return res.json({
    version: 2,
    user: {
      id: String(user._id),
      clientUserId: user.clientUserId,
      phone: user.phone,
      email: user.email,
      fullName: user.fullName,
      streetAddress: user.streetAddress,
      city: user.city,
      shopName: user.shopName,
      shopNumber: user.shopNumber,
    },
    products: productsOut,
    sales: salesOut,
    financeTransactions: financeOut,
    stockEvents: stockOut,
    meta: {
      productCount: productsOut.length,
      saleCount: salesOut.length,
      financeCount: financeOut.length,
      stockEventCount: stockOut.length,
    },
  });
}

module.exports = { processBatch, getBootstrap };
