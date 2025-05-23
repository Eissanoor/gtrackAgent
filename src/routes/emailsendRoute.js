const express = require('express');
const router = express.Router();
const { fetchUnverifiedProductsAndMembers } = require('../controllers/emailsend');

/**
 * GET /api/emailsend/unverified-products
 * Fetches unverified products and returns matching member email
 */
router.get('/unverified-products', async (req, res) => {
  try {
    const memberEmail = await fetchUnverifiedProductsAndMembers();
    
    if (memberEmail) {
      res.json({
        success: true,
        message: 'Member email found for unverified products',
        email: memberEmail
      });
    } else {
      res.json({
        success: false,
        message: 'No member email found for unverified products',
        email: null
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
