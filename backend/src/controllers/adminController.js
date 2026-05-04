const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');

async function listUsers(req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find({ role: 'user' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('phone email fullName city shopName clientUserId createdAt')
      .lean(),
    User.countDocuments({ role: 'user' }),
  ]);

  res.json({ page, limit, total, users });
}

async function getUser(req, res) {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: 'Invalid user id' });
  const user = await User.findById(userId).select('-passwordHash').lean();
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
}

async function listUserProducts(req, res) {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: 'Invalid user id' });

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  const uid = new mongoose.Types.ObjectId(userId);
  const [products, total] = await Promise.all([
    Product.find({ userId: uid }).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments({ userId: uid }),
  ]);

  res.json({ page, limit, total, products });
}

async function listUserSales(req, res) {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: 'Invalid user id' });

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  const uid = new mongoose.Types.ObjectId(userId);
  const [sales, total] = await Promise.all([
    Sale.find({ userId: uid }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Sale.countDocuments({ userId: uid }),
  ]);

  res.json({ page, limit, total, sales });
}

async function listSaleItems(req, res) {
  const { userId, clientSaleId } = req.params;
  if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: 'Invalid user id' });
  const cid = Number(clientSaleId);
  if (Number.isNaN(cid)) return res.status(400).json({ error: 'Invalid clientSaleId' });

  const uid = new mongoose.Types.ObjectId(userId);
  const sale = await Sale.findOne({ userId: uid, clientSaleId: cid }).lean();
  if (!sale) return res.status(404).json({ error: 'Sale not found' });

  const items = await SaleItem.find({ saleId: sale._id }).sort({ clientItemIndex: 1 }).lean();
  res.json({ sale, items });
}

async function dashboardSummary(req, res) {
  const [userCount, productCount, saleCount] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    Product.countDocuments(),
    Sale.countDocuments(),
  ]);
  res.json({ userCount, productCount, saleCount });
}

async function getUserStats(req, res) {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: 'Invalid user id' });
  const uid = new mongoose.Types.ObjectId(userId);

  const user = await User.findById(userId).select('role').lean();
  if (!user || user.role !== 'user') return res.status(404).json({ error: 'User not found' });

  const [agg, productCount] = await Promise.all([
    Sale.aggregate([
      { $match: { userId: uid } },
      { $group: { _id: null, totalRevenue: { $sum: '$total' }, saleCount: { $sum: 1 } } },
    ]),
    Product.countDocuments({ userId: uid }),
  ]);

  const row = agg[0] || { totalRevenue: 0, saleCount: 0 };
  res.json({
    totalRevenue: Number(row.totalRevenue) || 0,
    saleCount: Number(row.saleCount) || 0,
    productCount,
  });
}

module.exports = {
  listUsers,
  getUser,
  getUserStats,
  listUserProducts,
  listUserSales,
  listSaleItems,
  dashboardSummary,
};
