const prisma = require('../models');

/**
 * Helper function to validate barcode format
 * @param {string} barcode - The barcode to validate
 * @returns {Object} - Validation result with valid flag, message and suggestion
 */
function validateBarcode(barcode) {
  if (!barcode) {
    return {
      valid: false,
      message: 'Barcode is missing',
      suggestion: 'Add a valid barcode following GS1 standards.'
    };
  }
  
  // Check if it's a numeric barcode
  if (!/^\d+$/.test(barcode)) {
    return {
      valid: false,
      message: 'Barcode contains non-numeric characters',
      suggestion: 'Ensure barcode contains only digits.'
    };
  }
  
  // Check length for common barcode standards
  if (barcode.length === 8) {
    // UPC-E format
    return { valid: true, message: 'Valid UPC-E barcode' };
  } else if (barcode.length === 12) {
    // UPC-A format
    return { valid: true, message: 'Valid UPC-A barcode' };
  } else if (barcode.length === 13) {
    // EAN-13 format
    return { valid: true, message: 'Valid EAN-13 barcode' };
  } else if (barcode.length === 14) {
    // GTIN-14 format
    return { valid: true, message: 'Valid GTIN-14 barcode' };
  } else {
    return {
      valid: false,
      message: `Invalid barcode length (${barcode.length})`,
      suggestion: 'Use standard barcode formats: EAN-13 (13 digits), UPC-A (12 digits), or GTIN-14 (14 digits).'
    };
  }
}

/**
 * Function to find related terms between two categories
 * This simulates semantic relationship analysis that an AI would perform
 */
function getRelatedTerms(category1, category2) {
  // Define common semantic relationships between product categories
  const relatedTerms = {
    'food': ['edible', 'consumable', 'nutrition', 'grocery', 'meal', 'snack'],
    'beverage': ['drink', 'liquid', 'water', 'juice', 'fluid'],
    'electronics': ['device', 'gadget', 'tech', 'digital', 'electronic', 'appliance'],
    'clothing': ['apparel', 'garment', 'wear', 'fashion', 'textile'],
    'chemical': ['cleaner', 'solution', 'compound', 'mixture', 'solvent'],
    'household': ['home', 'domestic', 'kitchen', 'bathroom', 'living'],
    'beauty': ['cosmetic', 'makeup', 'skincare', 'personal care'],
    'health': ['medical', 'wellness', 'medicine', 'healthcare', 'pharmacy'],
    'toy': ['game', 'play', 'entertainment', 'children']
  };
  
  // Check if either category has related terms that include the other
  let matches = [];
  
  for (const [key, terms] of Object.entries(relatedTerms)) {
    if (category1.includes(key) || terms.some(term => category1.includes(term))) {
      if (category2.includes(key) || terms.some(term => category2.includes(term))) {
        matches.push(key);
      }
    }
  }
  
  return matches;
}

/**
 * Helper function to infer unit type from unit data
 * This is necessary since the Unit model doesn't have a 'type' field
 */
function inferUnitType(unitData) {
  if (!unitData) return null;
  
  const unitName = (unitData.unit_name || '').toLowerCase();
  const unitCode = (unitData.unit_code || '').toLowerCase();
  
  // Volume units
  if (['l', 'ml', 'liter', 'litre', 'gallon', 'oz', 'fluid'].some(term => 
      unitName.includes(term) || unitCode.includes(term))) {
    return 'volume';
  }
  
  // Weight units
  if (['kg', 'g', 'mg', 'lb', 'pound', 'ton', 'gram', 'kilo'].some(term => 
      unitName.includes(term) || unitCode.includes(term))) {
    return 'weight';
  }
  
  // Quantity units
  if (['pc', 'piece', 'unit', 'each', 'item', 'count', 'ea'].some(term => 
      unitName.includes(term) || unitCode.includes(term))) {
    return 'quantity';
  }
  
  // Default to quantity if unknown
  return 'unknown';
}

/**
 * Validate product relationship between brand, unit, and GCP.
 * This function acts as an AI agent to verify if the combinations make sense.
 * The function automatically fetches product data and analyzes if the relationships are valid.
 * For example: 
 * - If brand is oil-related, GCP should also be in the oil category
 * - If product is oil-based, unit should be liquid-based (like liters)
 */
exports.getAllProducts = async (req, res) => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const skip = (page - 1) * pageSize;
    
    // Get total count for pagination
    const totalCount = await prisma.Product.count();
    
    // Fetch paginated products
    const products = await prisma.Product.findMany({
      skip,
      take: pageSize
    });
    
    // Fetch related data separately
    const brandNames = products.map(p => p.BrandName).filter(Boolean);
    const unitCodes = products.map(p => p.unit).filter(Boolean);
    const gpcCodes = products.map(p => p.gpc).filter(Boolean);
    
    // Fetch brands
    const brands = await prisma.Brand.findMany({
      where: {
        name: {
          in: brandNames
        }
      }
    });
    
    // Fetch units
    const units = await prisma.Unit.findMany({
      where: {
        unit_code: {
          in: unitCodes
        }
      }
    });
    
    // Fetch GPC classes if the table exists
    let gpcClasses = [];
    try {
      // Try to find GPC classes using the code from products
      gpcClasses = await prisma.$queryRaw`
        SELECT * FROM gpc_classes 
        WHERE class_code IN (${gpcCodes.join(',')}) OR id IN (${gpcCodes.join(',')})
      `;
    } catch (error) {
      console.log('GPC classes query error:', error.message);
      // If error occurs, it might be that the table doesn't exist or has a different structure
    }
    
    // Create lookup tables for brands, units and GPCs
    const brandLookup = {};
    brands.forEach(brand => {
      brandLookup[brand.name] = brand;
    });
    
    const unitLookup = {};
    units.forEach(unit => {
      unitLookup[unit.unit_code] = unit;
    });
    
    const gpcLookup = {};
    gpcClasses.forEach(gpc => {
      gpcLookup[gpc.class_code || gpc.id] = gpc;
    });
    
    // Process each product and add verification results using AI-based logic
    const verifiedProducts = products.map(product => {
      // Look up the corresponding brand, unit, and GPC data
      const brandData = product.BrandName ? brandLookup[product.BrandName] : null;
      const unitData = product.unit ? unitLookup[product.unit] : null;
      
      // Get the actual GPC data from our lookup
      const gpcData = product.gpc ? gpcLookup[product.gpc] : null;
      
      // Initialize verification object with AI analysis data
      const verification = {
        isValid: true,         // Default to valid until proven otherwise
        verificationScore: 0,  // Score-based verification (0-100)
        confidenceLevel: 0,    // AI confidence in its assessment (0-100)
        verificationStatus: 'unverified',  // 'verified', 'unverified', or 'needs_review'
        issues: [],           // List of identified issues
        missingRelations: [],  // List of missing relationships
        aiSuggestions: []      // AI suggestions for improvement
      };
      
      // Check for missing relationships (Stage 1 validation)
      const missingRelations = [];
      if (!brandData) {
        missingRelations.push('brand');
        verification.issues.push({
          rule: 'Required Brand',
          severity: 'critical',
          message: 'Product must have a valid brand relationship'
        });
      }
      
      if (!unitData) {
        missingRelations.push('unit');
        verification.issues.push({
          rule: 'Required Unit',
          severity: 'critical',
          message: 'Product must have a valid unit of measurement'
        });
      }
      
      if (!product.gpc) {
        missingRelations.push('gpc');
        verification.issues.push({
          rule: 'Required GPC',
          severity: 'critical',
          message: 'Product must have a Global Product Classification (GPC)'
        });
      }
      
      // If any critical relations are missing, product can't pass validation
      if (missingRelations.length > 0) {
        verification.isValid = false;
        verification.verificationStatus = 'unverified';
        verification.confidenceLevel = 95; // High confidence that this is invalid
        verification.verificationScore = Math.max(0, 40 - (missingRelations.length * 15));
        verification.missingRelations = missingRelations;
        
        // AI suggestion for missing relations
        verification.aiSuggestions.push({
          type: 'missing_relations',
          message: `Please add the missing ${missingRelations.join(', ')} information to validate this product.`
        });
        
        return {
          ...product,
          brandData,    // Add the actual brand data
          unitData,     // Add the actual unit data
          gpcData,      // Add the GPC data
          verification  // Add the AI verification results
        };
      }
      
      // Stage 2: Semantic relationship validation (AI-driven)
      let relationshipScore = 100; // Start with a perfect score and deduct points
      
      // RULE 1: Brand categories and GPC classes with categories should match semantically
      const brandCategory = brandData && brandData.category;
      const gpcCategory = gpcData && (gpcData.category || gpcData.class_title);
      
      if (brandCategory && gpcCategory) {
        // Check for semantic relationship between brand category and GPC class
        const categoryBrandLower = brandCategory.toLowerCase();
        const categoryGpcLower = gpcCategory.toLowerCase();
        
        // Calculate similarity score between the categories (simplified version)
        let categoryMatchScore = 100;
        
        // Direct match or substring match gets highest score
        if (categoryBrandLower === categoryGpcLower) {
          categoryMatchScore = 100; // Perfect match
        } else if (categoryBrandLower.includes(categoryGpcLower) || 
                   categoryGpcLower.includes(categoryBrandLower)) {
          categoryMatchScore = 80; // Partial match
        } else {
          // Check for related terms
          const relatedTerms = getRelatedTerms(categoryBrandLower, categoryGpcLower);
          if (relatedTerms.length > 0) {
            categoryMatchScore = 60; // Related match
          } else {
            categoryMatchScore = 0; // No match
          }
        }
        
        // If match score is too low, add as an issue
        if (categoryMatchScore < 50) {
          relationshipScore -= 20;
          verification.issues.push({
            rule: 'Category Match',
            severity: 'high',
            score: categoryMatchScore,
            message: `Brand category "${brandCategory}" does not appear to match GPC category "${gpcCategory}"`
          });
          
          // AI suggestion for category mismatch
          verification.aiSuggestions.push({
            type: 'category_mismatch',
            message: `Consider using a brand with category more aligned with the GPC "${gpcCategory}", or select a more appropriate GPC class.`
          });
        }
      }
      
      // RULE 2: Check if unit type is appropriate for the product category
      const liquidCategories = ['oil', 'beverage', 'liquid', 'chemical', 'water', 'drink', 'juice', 'fluid'];
      const weightCategories = ['food', 'grain', 'powder', 'solid', 'bulk', 'mass', 'heavy'];
      const quantityCategories = ['electronics', 'appliance', 'item', 'discrete', 'piece', 'device', 'unit'];
      
      // Get unit type - we'll need to infer this from unit_code or unit_name
      const unitType = inferUnitType(unitData);
      // Get brand category for use in unit compatibility check
      const productCategoryLower = brandData && brandData.category ? brandData.category.toLowerCase() : '';
      const productNameLower = product.productnameenglish ? product.productnameenglish.toLowerCase() : '';
      
      // Determine likely product nature based on product name, brand category, and GPC
      const likelyLiquid = liquidCategories.some(cat => 
        productCategoryLower.includes(cat) || 
        productNameLower.includes(cat) || 
        (gpcCategory && gpcCategory.toLowerCase().includes(cat)));
        
      const likelyWeight = weightCategories.some(cat => 
        productCategoryLower.includes(cat) || 
        productNameLower.includes(cat) || 
        (gpcCategory && gpcCategory.toLowerCase().includes(cat)));
        
      const likelyQuantity = quantityCategories.some(cat => 
        productCategoryLower.includes(cat) || 
        productNameLower.includes(cat) || 
        (gpcCategory && gpcCategory.toLowerCase().includes(cat)));
      
      // Unit compatibility score
      let unitCompatibilityScore = 100;
      
      // Category-based unit validation (more sophisticated)
      if (unitType) {
        if (likelyLiquid && unitType !== 'volume') {
          relationshipScore -= 25;
          unitCompatibilityScore = 25;
          verification.issues.push({
            rule: 'Unit Compatibility',
            severity: 'high',
            score: unitCompatibilityScore,
            message: `Products in the liquid category should use volume units (like liter), but got ${unitType} unit (${unitData.unit_name})`
          });
          
          verification.aiSuggestions.push({
            type: 'unit_mismatch',
            message: `For liquid products like this, consider using volume units such as liters (L), milliliters (mL), or fluid ounces (fl oz).`
          });
        } else if (likelyWeight && unitType !== 'weight') {
          relationshipScore -= 25;
          unitCompatibilityScore = 25;
          verification.issues.push({
            rule: 'Unit Compatibility',
            severity: 'high',
            score: unitCompatibilityScore,
            message: `Products in the weight category should use weight units (like kg), but got ${unitType} unit (${unitData.unit_name})`
          });
          
          verification.aiSuggestions.push({
            type: 'unit_mismatch',
            message: `For weight-based products like this, consider using weight units such as kilograms (kg), grams (g), or pounds (lb).`
          });
        } else if (likelyQuantity && unitType !== 'quantity') {
          relationshipScore -= 25;
          unitCompatibilityScore = 25;
          verification.issues.push({
            rule: 'Unit Compatibility',
            severity: 'high',
            score: unitCompatibilityScore,
            message: `Products in the quantity category should use quantity units (like piece), but got ${unitType} unit (${unitData.unit_name})`
          });
          
          verification.aiSuggestions.push({
            type: 'unit_mismatch',
            message: `For quantity-based products like this, consider using units such as piece, each, or count.`
          });
        }
      }
      
      // RULE 3: Barcode validation
      if (product.barcode) {
        const isValidBarcode = validateBarcode(product.barcode);
        if (!isValidBarcode.valid) {
          relationshipScore -= 15;
          verification.issues.push({
            rule: 'Barcode Validation',
            severity: 'medium',
            message: isValidBarcode.message
          });
          
          verification.aiSuggestions.push({
            type: 'barcode_error',
            message: `Please check and correct the barcode format: ${isValidBarcode.suggestion}`
          });
        }
      }
      
      // Calculate final verification score
      verification.verificationScore = Math.max(0, relationshipScore);
      
      // Set verification status based on score
      if (verification.verificationScore >= 80) {
        verification.verificationStatus = 'verified';
        verification.confidenceLevel = Math.min(95, verification.verificationScore);
      } else if (verification.verificationScore >= 50) {
        verification.verificationStatus = 'needs_review';
        verification.confidenceLevel = 70;
      } else {
        verification.verificationStatus = 'unverified';
        verification.confidenceLevel = 85;
      }
      
      // Set overall validity
      verification.isValid = verification.verificationStatus === 'verified';
      
      // Return the product with all the verification data
      return {
        ...product,
        brandData,       // Include the brand data
        unitData,        // Include the unit data
        gpcData,         // Include the GPC data
        verification     // Include the AI verification results
      };
    });
    
    res.json({
      success: true,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        hasNext: page < Math.ceil(totalCount / pageSize),
        hasPrevious: page > 1
      },
      data: verifiedProducts
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, message: error.message, error: 'Server error' });
  }
};
