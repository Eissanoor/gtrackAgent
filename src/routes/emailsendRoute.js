const express = require('express');
const router = express.Router();
const { fetchUnverifiedProductsAndMembers } = require('../controllers/emailsend');

/**
 * GET /api/emailsend/unverified-products
 * Fetches unverified products and returns matching member details with product information
 */
router.get('/unverified-products', async (req, res) => {
  try {
    const results = await fetchUnverifiedProductsAndMembers();
    
    if (results && results.length > 0) {
      const totalProducts = results.reduce((sum, member) => sum + member.products.length, 0);
      res.json({
        success: true,
        message: `Found ${results.length} member(s) with ${totalProducts} unverified product(s)`,
        memberCount: results.length,
        totalProducts: totalProducts,
        data: results
      });
    } else {
      res.json({
        success: false,
        message: 'No unverified products found with matching member details',
        memberCount: 0,
        totalProducts: 0,
        data: []
      });
    }
  } catch (error) {
    console.error('Error in unverified-products endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

module.exports = router;
