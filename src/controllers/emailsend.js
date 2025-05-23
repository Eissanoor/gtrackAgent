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
      return null;
    }
    
    const memberProductsMap = new Map();
    
    // Extract gcpGLNID values and product details
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
          const productInfo = {
            productDetails: {
              id: product.id,
              productnameenglish: product.productnameenglish,
              productnamearabic: product.productnamearabic,
              BrandName: product.BrandName,
              gpc: product.gpc,
              unit: product.unit,
              barcode: product.barcode,
              PackagingType: product.PackagingType,
              size: product.size
            },
            verificationIssues: product.verification.issues,
            aiSuggestions: product.verification.aiSuggestions,
            verificationScore: product.verification.verificationScore,
            confidenceLevel: product.verification.confidenceLevel
          };
          
          // Group products by member email
          const memberKey = `${member.email}_${gcpGLNID}`;
          if (!memberProductsMap.has(memberKey)) {
            memberProductsMap.set(memberKey, {
              memberEmail: member.email,
              gcpGLNID: gcpGLNID,
              products: []
            });
          }
          
          memberProductsMap.get(memberKey).products.push(productInfo);
          
          console.log(`Found member email for gcpGLNID ${gcpGLNID}: ${member.email}`);
          console.log(`Product: ${product.productnameenglish} (${product.productnamearabic})`);
          console.log(`Brand: ${product.BrandName}`);
          console.log(`GPC: ${product.gpc}`);
          console.log(`Unit: ${product.unit}`);
          console.log(`Issues Count: ${product.verification.issues.length}`);
          console.log(`AI Suggestions Count: ${product.verification.aiSuggestions.length}`);
          console.log('---');
        }
      }
    }
    
    if (memberProductsMap.size === 0) {
      console.log('No matching members found for unverified products');
      return null;
    }
    
    // Convert map to array
    const results = Array.from(memberProductsMap.values());
    return results;
    
  } catch (error) {
    console.error('Error fetching products or member data:', error.message);
    throw error;
  }
}

module.exports = {
  fetchUnverifiedProductsAndMembers
};
