const express = require('express');
const productController = require('../controllers/productController');
const router = express.Router();

// GET /api/products - Get all products for testing
router.get('/', productController.getAllProducts);

// GET /api/products/:id/verify - Verify product relationships as an AI agent
router.get('/:id/verify', productController.validateProductRelationship);

// For backwards compatibility - can remove later
router.post('/:id/verify', productController.validateProductRelationship);

module.exports = router;
