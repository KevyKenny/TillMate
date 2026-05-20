const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const { processBatch, getBootstrap } = require('../controllers/syncController');

const router = express.Router();

router.get('/bootstrap', authenticateUser, getBootstrap);
router.post('/batch', authenticateUser, processBatch);

module.exports = router;
