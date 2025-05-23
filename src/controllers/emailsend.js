const axios = require('axios');
const { gtrackDB } = require('../models');

/**
 * Fetches unverified products and matches member details based on gcpGLNID
 */
async function fetchUnverifiedProductsAndMembers() {
  try {
    // Fetch products from API
    const response = await axios.get('http://localhost:3000/api/products');
    const products = response.data.data;
    
    // Filter for unverified products
    const unverifiedProducts = products.filter(product => 
      product.verification && 
      product.verification.verificationStatus === "unverified"
    );
    
    if (unverifiedProducts.length === 0) {
      console.log('No unverified products found');
      return;
    }
    
    // Extract gcpGLNID values
    for (const product of unverifiedProducts) {
      const gcpGLNID = product.gcpGLNID;
      
      if (gcpGLNID) {
        // Find matching member in database using gtrackDB
        const member = await gtrackDB.Member.findFirst({
          where: {
            gs1CompanyPrefix: gcpGLNID
          }
        });
        
        if (member) {
          console.log(`Found member email for gcpGLNID ${gcpGLNID}: ${member.email}`);
          return member.email; // Return the first matching email
        }
      }
    }
    
    console.log('No matching members found for unverified products');
    return null;
    
  } catch (error) {
    console.error('Error fetching products or member data:', error.message);
    throw error;
  }
}

module.exports = {
  fetchUnverifiedProductsAndMembers
};
