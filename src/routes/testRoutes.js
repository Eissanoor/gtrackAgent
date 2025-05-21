const express = require('express');
const router = express.Router();
const testController = require('../controllers/testController');

// Test database connection
router.get('/db-status', testController.testDatabaseConnection);

module.exports = router; 