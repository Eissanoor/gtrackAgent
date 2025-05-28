const express = require('express');
const productController = require('../controllers/productControllerV4');
const productControllerV5 = require('../controllers/productControllerV5');
const router = express.Router();

// GET /api/products - Get all products for testing
router.get('/', productController.getAllProducts);
router.get('/v5', productControllerV5.getAllProducts);
module.exports = router;
