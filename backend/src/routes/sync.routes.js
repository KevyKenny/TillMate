const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const { processBatch } = require('../controllers/syncController');

const router = express.Router();

router.post('/batch', authenticateUser, processBatch);

module.exports = router;
