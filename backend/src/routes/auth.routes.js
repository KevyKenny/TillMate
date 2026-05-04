const express = require('express');
const { register, login, devAdminCredentials } = require('../controllers/authController');

const router = express.Router();

router.get('/dev-admin-credentials', devAdminCredentials);
router.post('/register', register);
router.post('/login', login);

module.exports = router;
