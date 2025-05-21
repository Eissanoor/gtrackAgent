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
 * Advanced function to classify product type based on name, brand and GPC
 * Uses NLP-inspired techniques to identify product categories
 */
function classifyProductType(productName, brandName, gpcString) {
  // Convert to lowercase for consistent processing
  const productNameLower = (productName || '').toLowerCase();
  const brandNameLower = (brandName || '').toLowerCase();
  const gpcLower = (gpcString || '').toLowerCase();
  
  // Combined text for analysis
  const combinedText = `${productNameLower} ${brandNameLower} ${gpcLower}`;
  
  // Define category patterns with keywords and weights
  const categoryPatterns = [
    {
      category: 'cleaning_product',
      keywords: ['detergent', 'washing powder', 'cleaner', 'soap', 'laundry', 'bleach', 'softener', 'stain remover', 'dishwasher'],
      weight: 1.0
    },
    {
      category: 'food_product',
      keywords: ['food', 'edible', 'snack', 'meal', 'nutrition', 'dietary', 'eat', 'cook', 'bake', 'breakfast', 'dinner', 'lunch', 'vegetable', 'fruit', 'meat'],
      weight: 1.0
    },
    {
      category: 'beverage_product',
      keywords: ['drink', 'beverage', 'water', 'juice', 'soda', 'milk', 'coffee', 'tea', 'alcohol', 'wine', 'beer', 'liquor', 'cocktail'],
      weight: 1.0
    },
    {
      category: 'oil_product',
      keywords: ['oil', 'lubricant', 'petroleum', 'engine oil', 'motor oil', 'fuel', 'gas', 'diesel', 'kerosene', 'petroleum'],
      weight: 1.0
    },
    {
      category: 'personal_care',
      keywords: ['shampoo', 'conditioner', 'lotion', 'cream', 'deodorant', 'perfume', 'cologne', 'toothpaste', 'mouthwash', 'makeup', 'cosmetic'],
      weight: 1.0
    },
    {
      category: 'electronic_product',
      keywords: ['electronic', 'device', 'computer', 'laptop', 'phone', 'smartphone', 'tablet', 'tv', 'television', 'appliance', 'gadget'],
      weight: 1.0
    },
    {
      category: 'clothing_product',
      keywords: ['clothing', 'apparel', 'wear', 'dress', 'shirt', 'pant', 'jean', 'sock', 'underwear', 'jacket', 'coat', 'shoe'],
      weight: 1.0
    },
    {
      category: 'household_product',
      keywords: ['household', 'furniture', 'decor', 'kitchen', 'bathroom', 'bedroom', 'living room', 'table', 'chair', 'bed', 'sofa'],
      weight: 1.0
    }
  ];
  
  // Scoring for each category
  const scores = {};
  for (const pattern of categoryPatterns) {
    let score = 0;
    // Count keyword occurrences
    for (const keyword of pattern.keywords) {
      if (combinedText.includes(keyword)) {
        score += pattern.weight;
        // Add bonus for exact matches
        if (productNameLower.includes(keyword)) {
          score += 0.5; // Higher weight for product name matches
        }
      }
    }
    if (score > 0) {
      scores[pattern.category] = score;
    }
  }
  
  // Special case rules
  // Washing powder detection
  if (productNameLower.includes('wash') && 
      (productNameLower.includes('powder') || 
       productNameLower.includes('detergent') || 
       productNameLower.includes('soap'))) {
    scores['cleaning_product'] = (scores['cleaning_product'] || 0) + 2;
  }
  
  // Return the category with the highest score, or null if no match
  let highestCategory = null;
  let highestScore = 0;
  
  for (const [category, score] of Object.entries(scores)) {
    if (score > highestScore) {
      highestCategory = category;
      highestScore = score;
    }
  }
  
  return {
    category: highestCategory,
    confidence: highestScore > 0 ? Math.min(highestScore / 3 * 100, 100) : 0,
    scores
  };
}

/**
 * Get recommended unit types based on product category
 */
function getRecommendedUnits(productCategory) {
  const unitRecommendations = {
    'cleaning_product': {
      primaryType: 'weight',
      units: ['KG', 'G', 'MG', 'LB', 'OZ'],
      alternateType: 'volume',
      alternateUnits: ['L', 'ML', 'GAL', 'FL OZ'],
      explanation: 'Cleaning products like washing powders should use weight units (kg, g) for powders and volume units (L, ml) for liquids'
    },
    'food_product': {
      primaryType: 'weight',
      units: ['KG', 'G', 'MG', 'LB', 'OZ'],
      alternateType: 'volume',
      alternateUnits: ['L', 'ML'],
      explanation: 'Food products typically use weight units (kg, g) or volume units (L, ml) depending on their form'
    },
    'beverage_product': {
      primaryType: 'volume',
      units: ['L', 'ML', 'GAL', 'FL OZ'],
      explanation: 'Beverages should use volume units (L, ml, fl oz)'
    },
    'oil_product': {
      primaryType: 'volume',
      units: ['L', 'ML', 'GAL', 'FL OZ'],
      explanation: 'Oil products should use volume units (L, ml, fl oz)'
    },
    'personal_care': {
      primaryType: 'weight',
      units: ['G', 'MG', 'OZ'],
      alternateType: 'volume',
      alternateUnits: ['ML', 'FL OZ'],
      explanation: 'Personal care products use weight units (g, oz) for solids and volume units (ml, fl oz) for liquids'
    },
    'electronic_product': {
      primaryType: 'quantity',
      units: ['PC', 'EA', 'UNIT', 'SET'],
      explanation: 'Electronic products typically use quantity units (piece, each, unit)'
    },
    'clothing_product': {
      primaryType: 'quantity',
      units: ['PC', 'EA', 'UNIT', 'SET'],
      explanation: 'Clothing items typically use quantity units (piece, each, unit)'
    },
    'household_product': {
      primaryType: 'quantity',
      units: ['PC', 'EA', 'UNIT', 'SET'],
      explanation: 'Household items typically use quantity units (piece, each, unit)'
    }
  };
  
  return unitRecommendations[productCategory] || {
    primaryType: 'unknown',
    units: ['PC', 'KG', 'L'],
    explanation: 'Unable to determine appropriate unit type for this product category'
  };
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
    // Check if specific product ID is requested
    const productId = req.query.id;
    const user_id = req.query.user_id;
    let products = [];
    let totalCount = 0;
    
    if (productId || user_id) {
      // Build where conditions with AND logic
      const whereConditions = {
        deleted_at: null,
        AND: []
      };
      
      // Add conditions based on which parameters are provided
      if (productId) {
        whereConditions.AND.push({ id: productId });
      }
      
      if (user_id) {
        whereConditions.AND.push({ user_id: user_id });
      }
      
      // Fetch products matching either productId OR user_id
      products = await prisma.Product.findMany({
        where: whereConditions
      });
      
      totalCount = products.length;
      
      if (products.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: `No products found with the provided criteria`
        });
      }
    } else {
      // Regular pagination handling
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 10;
      const skip = (page - 1) * pageSize;
      
      // Get total count for pagination
      totalCount = await prisma.Product.count({
        where: {
          deleted_at: null
        }
      });
      
      // Fetch paginated products
      //here also sort into descending order of created_at
      products = await prisma.Product.findMany({
        where: {
          deleted_at: null
        },
        skip,
        take: pageSize,
        orderBy: {
          created_at: 'desc'
        }
      });
    }
    
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
        verificationScore: 100,  // Score-based verification (0-100)
        confidenceLevel: 95,    // AI confidence in its assessment (0-100)
        verificationStatus: 'verified',  // 'verified' or 'unverified'
        issues: [],           // List of identified issues
        missingFields: [],    // List of missing fields
        aiSuggestions: []      // AI suggestions for improvement
      };
      
      // RULE 1: Check for required fields (front_image, BrandName, gpc, unit)
      // If front_image is null, product is unverified
      if (!product.front_image) {
        verification.isValid = false;
        verification.verificationStatus = 'unverified';
        verification.missingFields.push('front_image');
        verification.issues.push({
          rule: 'Required Image',
          severity: 'critical',
          message: 'Product must have a front image'
        });
        
        verification.aiSuggestions.push({
          field: 'front_image',
          suggestion: 'Upload a high-quality front image of the product showing the packaging and product details clearly. This is essential for product verification and customer recognition.',
          importance: 'Critical'
        });
      }
      
      // If BrandName is null, product is unverified
      if (!product.BrandName) {
        verification.isValid = false;
        verification.verificationStatus = 'unverified';
        verification.missingFields.push('BrandName');
        verification.issues.push({
          rule: 'Required Brand',
          severity: 'critical',
          message: 'Product must have a brand name'
        });
        
        verification.aiSuggestions.push({
          field: 'BrandName',
          suggestion: 'Add the product\'s official brand name. If this is a private label product, enter your company name as the brand. Ensure the brand name matches what appears on the product packaging.',
          importance: 'Critical'
        });
      }
      
      // If gpc is null, product is unverified
      if (!product.gpc) {
        verification.isValid = false;
        verification.verificationStatus = 'unverified';
        verification.missingFields.push('gpc');
        verification.issues.push({
          rule: 'Required GPC',
          severity: 'critical',
          message: 'Product must have a Global Product Classification (GPC)'
        });
        
        verification.aiSuggestions.push({
          field: 'gpc',
          suggestion: 'Select an appropriate Global Product Classification (GPC) that accurately describes your product category. This classification helps in proper categorization and searchability of your product.',
          importance: 'Critical'
        });
      }
      
      // If unit is null, product is unverified
      if (!product.unit) {
        verification.isValid = false;
        verification.verificationStatus = 'unverified';
        verification.missingFields.push('unit');
        verification.issues.push({
          rule: 'Required Unit',
          severity: 'critical',
          message: 'Product must have a unit of measurement'
        });
        
        verification.aiSuggestions.push({
          field: 'unit',
          suggestion: 'Specify the appropriate unit of measurement for your product (e.g., kg, liter, piece). The unit should match the physical characteristics of your product.',
          importance: 'Critical'
        });
      }
      
      // RULE 2: Check semantic relationship between BrandName and GPC
      if (product.BrandName && product.gpc) {
        // Extract category info from product name and GPC
        const productNameLower = product.productnameenglish ? product.productnameenglish.toLowerCase() : '';
        const brandNameLower = product.BrandName.toLowerCase();
        const gpcLower = product.gpc.toLowerCase();
        
        // Use advanced product classification
        const productClassification = classifyProductType(
          product.productnameenglish,
          product.BrandName,
          product.gpc
        );
        
        // Store the classification for later use
        const detectedCategory = productClassification.category;
        const classificationConfidence = productClassification.confidence;
        
        // If no category detected or low confidence, use the existing category detection
        if (!detectedCategory || classificationConfidence < 50) {
          // Keywords from product name and brand
          const productKeywords = [...productNameLower.split(' '), ...brandNameLower.split(' ')];
          
          // Define common categories for semantic analysis
          const categories = {
            'oil': ['oil', 'lubricant', 'petroleum', 'liquid', 'fluid', 'engine'],
            'food': ['food', 'edible', 'consumable', 'nutrition', 'grocery', 'meal', 'snack'],
            'beverage': ['drink', 'water', 'juice', 'soda', 'beverage', 'liquid'],
            'electronics': ['device', 'gadget', 'tech', 'digital', 'electronic', 'appliance'],
            'clothing': ['apparel', 'garment', 'wear', 'fashion', 'textile', 'cloth'],
            'chemical': ['cleaner', 'solution', 'compound', 'mixture', 'solvent', 'chemical', 'washing powder', 'detergent'],
            'industrial': ['industrial', 'business', 'machinery', 'equipment', 'tool'],
            'automotive': ['car', 'auto', 'vehicle', 'engine', 'motor']
          };
          
          // Detect product category from product name and brand name
          let detectedProductCategories = [];
          for (const [category, keywords] of Object.entries(categories)) {
            if (keywords.some(keyword => 
              productNameLower.includes(keyword) || 
              brandNameLower.includes(keyword))) {
              detectedProductCategories.push(category);
            }
          }
          
          // Detect GPC category
          let detectedGpcCategories = [];
          for (const [category, keywords] of Object.entries(categories)) {
            if (keywords.some(keyword => gpcLower.includes(keyword))) {
              detectedGpcCategories.push(category);
            }
          }
          
          // Check for mismatches
          const hasMatchingCategory = detectedProductCategories.some(cat => 
            detectedGpcCategories.includes(cat) || getRelatedTerms(cat, detectedGpcCategories.join(' ')).length > 0);
          
          // Special case for oil products
          const isOilProduct = brandNameLower.includes('oil') || productNameLower.includes('oil');
          const isOilGpc = gpcLower.includes('oil') || gpcLower.includes('engine') || gpcLower.includes('lubricant');
          
          if (detectedProductCategories.length > 0 && detectedGpcCategories.length > 0 && !hasMatchingCategory) {
            // If oil product special case, do additional check
            if (!(isOilProduct && isOilGpc)) {
              verification.isValid = false;
              verification.verificationStatus = 'unverified';
              verification.issues.push({
                rule: 'Category Match',
                severity: 'high',
                message: `Product category (${detectedProductCategories.join(', ')}) does not match GPC category (${detectedGpcCategories.join(', ')})`
              });
              
              // Add professional AI suggestion for category mismatch
              let recommendedGpc = '';
              if (detectedProductCategories.includes('oil')) {
                recommendedGpc = 'lubricants or engine oils';
              } else if (detectedProductCategories.includes('food')) {
                recommendedGpc = 'food items or consumables';
              } else if (detectedProductCategories.includes('beverage')) {
                recommendedGpc = 'beverages or drinks';
              } else if (detectedProductCategories.includes('electronics')) {
                recommendedGpc = 'electronic appliances or devices';
              } else if (detectedProductCategories.includes('chemical')) {
                recommendedGpc = 'cleaning products or detergents';
              }
              
              verification.aiSuggestions.push({
                field: 'gpc',
                suggestion: `There appears to be a mismatch between your product category and GPC classification. Based on your product "${product.productnameenglish}" and brand "${product.BrandName}", we suggest using a GPC related to ${recommendedGpc}. This ensures accurate product categorization and improves searchability.`,
                importance: 'High'
              });
            }
          }
        } else {
          // Use the AI classification result to check GPC consistency
          const gpcConsistent = gpcLower.includes(detectedCategory.replace('_product', '')) ||
                               gpcLower.includes(detectedCategory.replace('_', ' '));
          
          if (!gpcConsistent && classificationConfidence > 70) {
            verification.isValid = false;
            verification.verificationStatus = 'unverified';
            verification.issues.push({
              rule: 'Category Match',
              severity: 'high',
              message: `Product appears to be a ${detectedCategory.replace('_', ' ')} but GPC doesn't reflect this category`
            });
            
            // Get recommended GPC description based on product type
            let recommendedGpcDesc = '';
            if (detectedCategory === 'cleaning_product') {
              recommendedGpcDesc = 'cleaning products, detergents, or washing agents';
            } else if (detectedCategory === 'food_product') {
              recommendedGpcDesc = 'food items or consumables';
            } else if (detectedCategory === 'beverage_product') {
              recommendedGpcDesc = 'beverages or drinks';
            } else if (detectedCategory === 'oil_product') {
              recommendedGpcDesc = 'lubricants or engine oils';
            } else {
              recommendedGpcDesc = detectedCategory.replace('_', ' ') + 's';
            }
            
            verification.aiSuggestions.push({
              field: 'gpc',
              suggestion: `Our AI has identified your product "${product.productnameenglish}" as a ${detectedCategory.replace('_', ' ')}. Please select a GPC classification related to ${recommendedGpcDesc} for more accurate categorization. This will improve product discovery and ensure proper classification.`,
              importance: 'High',
              confidence: classificationConfidence.toFixed(0) + '%'
            });
          }
        }
      }
      
      // RULE 3: Check if unit makes sense for the product
      if (product.BrandName && product.unit && unitData) {
        const unitCode = product.unit.toLowerCase();
        const unitName = unitData.unit_name ? unitData.unit_name.toLowerCase() : '';
        const productNameLower = product.productnameenglish ? product.productnameenglish.toLowerCase() : '';
        const brandNameLower = product.BrandName.toLowerCase();
        
        // Use advanced product classification
        const productClassification = classifyProductType(
          product.productnameenglish,
          product.BrandName,
          product.gpc
        );
        
        // Get unit type
        const unitType = inferUnitType(unitData);
        
        // If we have a confident classification, use it for unit validation
        if (productClassification.category && productClassification.confidence >= 60) {
          const unitRecommendations = getRecommendedUnits(productClassification.category);
          
          // Check if current unit matches recommended primary or alternate type
          const matchesPrimaryType = unitType === unitRecommendations.primaryType;
          const matchesAlternateType = unitRecommendations.alternateType && unitType === unitRecommendations.alternateType;
          
          // If unit doesn't match either type
          if (!matchesPrimaryType && !matchesAlternateType) {
            verification.isValid = false;
            verification.verificationStatus = 'unverified';
            verification.issues.push({
              rule: 'Unit Compatibility',
              severity: 'high',
              message: `${productClassification.category.replace('_', ' ')} should use ${unitRecommendations.primaryType} units, but uses ${unitType} units`
            });
            
            verification.aiSuggestions.push({
              field: 'unit',
              suggestion: `Our AI has identified your product "${product.productnameenglish}" as a ${productClassification.category.replace('_', ' ')}. ${unitRecommendations.explanation}. Please update your unit from "${unitData.unit_name}" to an appropriate ${unitRecommendations.primaryType} unit.`,
              importance: 'High',
              recommended_units: unitRecommendations.units,
              confidence: productClassification.confidence.toFixed(0) + '%'
            });
          }
          
          // Special case for washing powder - must use weight units
          if (productNameLower.includes('washing') && 
              productNameLower.includes('powder') && 
              unitType !== 'weight') {
            verification.isValid = false;
            verification.verificationStatus = 'unverified';
            verification.issues.push({
              rule: 'Unit Compatibility',
              severity: 'high',
              message: `Washing powder products should use weight units (like kg, g), but uses ${unitType} units`
            });
            
            verification.aiSuggestions.push({
              field: 'unit',
              suggestion: `Your product "${product.productnameenglish}" is a washing powder which should be measured in weight units. Please use kilograms (KG) or grams (G) for accurate measurement. Using the correct unit is critical for consumer understanding and industry standards compliance.`,
              importance: 'High',
              recommended_units: ['KG', 'G']
            });
          }
        } else {
          // Fallback to the simpler detection logic if classification isn't confident
          // Determine the product type based on name/brand
          const isLiquidProduct = ['oil', 'water', 'juice', 'fluid', 'liquid', 'drink', 'beverage'].some(term => 
            productNameLower.includes(term) || brandNameLower.includes(term));
          
          const isWeightProduct = ['food', 'grain', 'powder', 'solid', 'bulk', 'washing powder', 'detergent powder'].some(term => 
            productNameLower.includes(term) || brandNameLower.includes(term));
          
          const isCountProduct = ['piece', 'count', 'item', 'electronic', 'device', 'gadget'].some(term => 
            productNameLower.includes(term) || brandNameLower.includes(term));
          
          // Check for mismatches - similar logic to existing code but simplified
          if (isLiquidProduct && unitType !== 'volume') {
            verification.isValid = false;
            verification.verificationStatus = 'unverified';
            verification.issues.push({
              rule: 'Unit Compatibility',
              severity: 'high',
              message: `A liquid product should use volume units (like liter), but uses ${unitType} unit (${unitName})`
            });
            
            verification.aiSuggestions.push({
              field: 'unit',
              suggestion: `Your product "${product.productnameenglish}" appears to be a liquid product but is using ${unitType} units. For liquid products, we recommend using volume units such as liters (L), milliliters (mL), fluid ounces (fl oz), or gallons. This ensures accurate quantity representation and improves consumer understanding.`,
              importance: 'High',
              recommended_units: ['L', 'ML', 'FL OZ']
            });
          } else if (isWeightProduct && unitType !== 'weight') {
            verification.isValid = false;
            verification.verificationStatus = 'unverified';
            verification.issues.push({
              rule: 'Unit Compatibility',
              severity: 'high',
              message: `A weight-based product should use weight units (like kg), but uses ${unitType} unit (${unitName})`
            });
            
            verification.aiSuggestions.push({
              field: 'unit',
              suggestion: `Your product "${product.productnameenglish}" appears to be a weight-based product but is using ${unitType} units. For such products, we recommend using weight units such as kilograms (kg), grams (g), pounds (lb), or ounces (oz). This ensures accurate measurement representation and improves consumer understanding.`,
              importance: 'High',
              recommended_units: ['KG', 'G', 'LB', 'OZ']
            });
          } else if (isCountProduct && unitType !== 'quantity') {
            verification.isValid = false;
            verification.verificationStatus = 'unverified';
            verification.issues.push({
              rule: 'Unit Compatibility',
              severity: 'high',
              message: `A quantity-based product should use quantity units (like piece), but uses ${unitType} unit (${unitName})`
            });
            
            verification.aiSuggestions.push({
              field: 'unit',
              suggestion: `Your product "${product.productnameenglish}" appears to be a quantity-based item but is using ${unitType} units. For such products, we recommend using quantity units such as piece, each, count, or unit. This ensures accurate quantity representation and improves consumer understanding.`,
              importance: 'High',
              recommended_units: ['PC', 'EA', 'CT', 'UNIT']
            });
          }
          
          // Special case for oil products from the example
          const isOilProduct = brandNameLower.includes('oil') || productNameLower.includes('oil');
          if (isOilProduct && !['l', 'ltr', 'litre', 'liter'].includes(unitCode)) {
            verification.isValid = false;
            verification.verificationStatus = 'unverified';
            verification.issues.push({
              rule: 'Unit Compatibility',
              severity: 'high',
              message: `Oil products should use volume units (like liter), but uses ${unitCode} unit`
            });
            
            verification.aiSuggestions.push({
              field: 'unit',
              suggestion: `Your product "${product.productnameenglish}" is an oil product which should be measured in volume units. Please use liters (L) or milliliters (ML) for engine oils and lubricants. Using the correct unit is critical for industry standards compliance and accurate quantity representation.`,
              importance: 'High',
              recommended_units: ['L', 'LTR', 'ML']
            });
          }
          
          // Special case for washing powder
          if ((productNameLower.includes('washing') && productNameLower.includes('powder')) || 
              (productNameLower.includes('detergent') && productNameLower.includes('powder'))) {
            if (unitType !== 'weight') {
              verification.isValid = false;
              verification.verificationStatus = 'unverified';
              verification.issues.push({
                rule: 'Unit Compatibility',
                severity: 'high',
                message: `Washing powder products should use weight units (like kg, g), but uses ${unitType} units`
              });
              
              verification.aiSuggestions.push({
                field: 'unit',
                suggestion: `Your product "${product.productnameenglish}" is a washing powder which should be measured in weight units. Please use kilograms (KG) or grams (G) for accurate measurement. Using the correct unit is critical for consumer understanding and industry standards compliance.`,
                importance: 'High',
                recommended_units: ['KG', 'G']
              });
            }
          }
        }
      }
      
      // Add general suggestions when product is unverified
      if (verification.verificationStatus === 'unverified' && verification.aiSuggestions.length === 0) {
        verification.aiSuggestions.push({
          field: 'general',
          suggestion: 'Please review all product information for accuracy and completeness. Ensure all required fields are filled and product details are consistent across all fields.',
          importance: 'Medium'
        });
      }
      
      // Add industry-specific suggestions based on product type
      if (product.productnameenglish) {
        const productNameLower = product.productnameenglish.toLowerCase();
        
        // For oil products
        if (productNameLower.includes('oil') && verification.isValid) {
          verification.aiSuggestions.push({
            field: 'enhancementTip',
            suggestion: 'Consider adding technical specifications such as viscosity grade and API certification in the product description to provide more valuable information to potential customers.',
            importance: 'Low'
          });
        }
        
        // For food products
        if (productNameLower.includes('food') && verification.isValid) {
          verification.aiSuggestions.push({
            field: 'enhancementTip',
            suggestion: 'Consider adding nutritional information and allergen details in the product description to enhance consumer trust and meet regulatory requirements.',
            importance: 'Low'
          });
        }
      }
      
      // Return the product with all the verification data
      return {
        ...product,
        brandData,       // Include the brand data
        unitData,        // Include the unit data
        gpcData,         // Include the GPC data
        verification     // Include the AI verification results
      };
    });
    
    // Customize response based on request type (single product or paginated)
    if (productId) {
      // For single product request, return simplified response
      res.json({
        success: true,
        data: verifiedProducts[0]
      });
    } else {
      // For paginated request, include pagination info
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 10;
      
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
    }
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, message: error.message, error: 'Server error' });
  }
};

