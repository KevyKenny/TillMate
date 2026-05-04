const express = require('express');
const { authenticateAdmin } = require('../middleware/auth');
const {
  listUsers,
  getUser,
  getUserStats,
  listUserProducts,
  listUserSales,
  listSaleItems,
  dashboardSummary,
} = require('../controllers/adminController');

const router = express.Router();

router.get('/summary', authenticateAdmin, dashboardSummary);
router.get('/users', authenticateAdmin, listUsers);
router.get('/users/:userId/stats', authenticateAdmin, getUserStats);
router.get('/users/:userId', authenticateAdmin, getUser);
router.get('/users/:userId/products', authenticateAdmin, listUserProducts);
router.get('/users/:userId/sales', authenticateAdmin, listUserSales);
router.get('/users/:userId/sales/:clientSaleId/items', authenticateAdmin, listSaleItems);

module.exports = router;
