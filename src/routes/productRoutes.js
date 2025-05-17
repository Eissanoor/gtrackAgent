const express = require('express');
const productController = require('../controllers/productController');
const router = express.Router();

// GET /api/products - Get all products for testing
router.get('/', productController.getAllProducts);

module.exports = router;
