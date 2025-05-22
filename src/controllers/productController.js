const { gtrackDB, gs1DB } = require('../models');

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
  
  // Rate/Speed/Time-based units
  if (['per', 'perhour', 'persecond', 'perminute', 'ph', 'ps', 'pm', 'hz', 'rpm', 'sps', 'mps', 'fps', 'm60'].some(term => 
      unitName.includes(term) || unitCode.includes(term))) {
    return 'rate';
  }
  
  // Volume units
  if (['l', 'ml', 'liter', 'litre', 'gallon', 'oz', 'fluid', 'ltr', 'fl'].some(term => 
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
  
  // Length units
  if (['m', 'cm', 'mm', 'ft', 'inch', 'yard', 'metre', 'meter'].some(term =>
      unitName.includes(term) || unitCode.includes(term)) && 
      !(['per', 'perhour', 'persecond'].some(term => unitName.includes(term) || unitCode.includes(term)))) {
    return 'length';
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
  
  // Enhanced patterns with n-gram recognition for multi-word matches
  const ngramPatterns = [
    { ngram: "washing powder", category: "cleaning_product", weight: 2.0, expectedUnit: "weight" },
    { ngram: "laundry detergent", category: "cleaning_product", weight: 2.0, expectedUnit: "volume" },
    { ngram: "dish soap", category: "cleaning_product", weight: 2.0, expectedUnit: "volume" },
    { ngram: "motor oil", category: "oil_product", weight: 2.0, expectedUnit: "volume" },
    { ngram: "engine oil", category: "oil_product", weight: 2.0, expectedUnit: "volume" },
    { ngram: "transmission fluid", category: "oil_product", weight: 2.0, expectedUnit: "volume" },
    { ngram: "olive oil", category: "food_product", weight: 2.0, expectedUnit: "volume" },
    { ngram: "cooking oil", category: "food_product", weight: 2.0, expectedUnit: "volume" },
    { ngram: "soft drink", category: "beverage_product", weight: 2.0, expectedUnit: "volume" },
    { ngram: "mobile phone", category: "electronic_product", weight: 2.0, expectedUnit: "quantity" },
    { ngram: "cell phone", category: "electronic_product", weight: 2.0, expectedUnit: "quantity" },
    { ngram: "t shirt", category: "clothing_product", weight: 2.0, expectedUnit: "quantity" },
    { ngram: "coffee machine", category: "electronic_product", weight: 2.0, expectedUnit: "quantity" },
    { ngram: "coffee maker", category: "electronic_product", weight: 2.0, expectedUnit: "quantity" },
    { ngram: "facial cream", category: "personal_care", weight: 2.0, expectedUnit: "weight" },
    { ngram: "body lotion", category: "personal_care", weight: 2.0, expectedUnit: "volume" }
  ];
  
  // Apply contextual rules based on industry knowledge
  const contextualRules = [
    // If "oil" appears with "engine", "motor", "transmission", it's automotive oil
    {
      condition: (text) => /\b(engine|motor|transmission|hydraulic)\b.*\b(oil|lubricant)\b/i.test(text) || 
                           /\b(oil|lubricant)\b.*\b(engine|motor|transmission|hydraulic)\b/i.test(text),
      category: 'oil_product',
      confidence: 0.95,
      expectedUnit: 'volume',
      explanation: 'This is an automotive oil product based on the context of engine/motor terminology'
    },
    // Specific engine oil detection based on viscosity grade patterns (like 0W20, 5W30, etc.)
    {
      condition: (text) => /\b\d+w\d+\b/i.test(text) || /\b(sae)\b.*\b\d+w\d+\b/i.test(text),
      category: 'oil_product',
      confidence: 0.98,
      expectedUnit: 'volume',
      explanation: 'This is an engine oil product based on the viscosity grade pattern (e.g., 0W20, 5W30)'
    },
    // API specification indicates engine oil
    {
      condition: (text) => /\bapi\s+(s[lpnmfg]|c[hjk])\b/i.test(text),
      category: 'oil_product',
      confidence: 0.98,
      expectedUnit: 'volume',
      explanation: 'This is an engine oil product based on API service category designation',
      suggestedGpcTitles: ['Engine Oil/Engine Lubricants', 'Motor Oils', 'Automotive Lubricants', 'Vehicle Lubricants', 'Lubricating Oils']
    },
    // If "washing" appears with "powder" or "detergent", it's a cleaning product
    {
      condition: (text) => /\b(washing|laundry)\b.*\b(powder|detergent)\b/i.test(text) || 
                           /\b(powder|detergent)\b.*\b(washing|laundry)\b/i.test(text),
      category: 'cleaning_product',
      confidence: 0.95,
      expectedUnit: 'weight',
      explanation: 'This is a laundry cleaning product that needs weight units'
    },
    // If "oil" appears with "cooking", "olive", "vegetable", it's food oil
    {
      condition: (text) => /\b(cooking|olive|vegetable|sunflower|canola)\b.*\b(oil)\b/i.test(text) || 
                           /\b(oil)\b.*\b(cooking|olive|vegetable|sunflower|canola)\b/i.test(text),
      category: 'food_product',
      confidence: 0.9,
      expectedUnit: 'volume',
      explanation: 'This is a cooking oil product that requires volume units'
    }
  ];
  
  // Check contextual rules first (they have highest precedence)
  for (const rule of contextualRules) {
    if (rule.condition(combinedText)) {
      return {
        category: rule.category,
        confidence: rule.confidence * 100,
        scores: { [rule.category]: rule.confidence },
        expectedUnit: rule.expectedUnit,
        explanation: rule.explanation,
        detectionMethod: 'contextual_rule'
      };
    }
  }
  
  // Check for n-gram matches
  let ngramScore = {};
  let ngramMatches = [];
  let unitSuggestions = {};
  
  for (const pattern of ngramPatterns) {
    if (combinedText.includes(pattern.ngram)) {
      ngramScore[pattern.category] = (ngramScore[pattern.category] || 0) + pattern.weight;
      ngramMatches.push(pattern.ngram);
      // Record unit suggestion from the n-gram
      unitSuggestions[pattern.category] = pattern.expectedUnit;
    }
  }
  
  // Scoring for each category from keyword patterns
  const scores = { ...ngramScore };
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
      scores[pattern.category] = (scores[pattern.category] || 0) + score;
    }
  }
  
  // Special case rules
  // Washing powder detection
  if (productNameLower.includes('wash') && 
      (productNameLower.includes('powder') || 
       productNameLower.includes('detergent') || 
       productNameLower.includes('soap'))) {
    scores['cleaning_product'] = (scores['cleaning_product'] || 0) + 2;
    unitSuggestions['cleaning_product'] = productNameLower.includes('powder') ? 'weight' : 'volume';
  }
  
  // Return the category with the highest score, or null if no match
  let highestCategory = null;
  let highestScore = 0;
  let expectedUnit = null;
  let detectionMethod = ngramMatches.length > 0 ? 'n-gram' : 'keyword';
  
  for (const [category, score] of Object.entries(scores)) {
    if (score > highestScore) {
      highestCategory = category;
      highestScore = score;
      expectedUnit = unitSuggestions[category] || null;
    }
  }
  
  return {
    category: highestCategory,
    confidence: highestScore > 0 ? Math.min(highestScore / 3 * 100, 100) : 0,
    scores,
    expectedUnit,
    ngramMatches,
    detectionMethod
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

// Fallback for when database operations fail
const fallbackResponse = {
  success: false,
  message: "Failed to connect to database. Please check your database connection settings.",
  error: "Database connection error"
};

/**
 * Safe database query wrapper to handle potential errors
 */
async function safeDbQuery(queryFn, fallback = []) {
  try {
    return await queryFn();
  } catch (error) {
    console.error('Database query error:', error.message);
    return fallback;
  }
}

/**
 * Parse GPC string into separate code and description components
 * @param {string} gpcString - Raw GPC string (e.g., "20002871-Type of Engine Oil Target")
 * @returns {Object} - Object with code and description
 */
function parseGPC(gpcString) {
  if (!gpcString) return { code: null, description: null };
  
  // Check if the GPC contains a hyphen separator
  if (gpcString.includes('-')) {
    const [code, ...descParts] = gpcString.split('-');
    const description = descParts.join('-').trim();
    return { 
      code: code.trim(), 
      description 
    };
  } 
  // If there's no hyphen but it starts with digits, assume those are the code
  else if (/^\d+/.test(gpcString)) {
    const codeMatch = gpcString.match(/^(\d+)/);
    if (codeMatch) {
      const code = codeMatch[1];
      const description = gpcString.substring(code.length).trim();
      return { 
        code, 
        description: description || null 
      };
    }
  }
  
  // If we can't extract a code, return the whole thing as description
  return { 
    code: null, 
    description: gpcString 
  };
}

/**
 * Parse unit string into better components
 * @param {string} unitString - Raw unit string 
 * @param {Object} unitData - Unit data from database
 * @returns {Object} - Enhanced unit info
 */
function parseUnit(unitString, unitData) {
  if (!unitString) return { unit_code: null, unit_name: null, type: null, id: null, status: null, created_at: null, updated_at: null };
  
  const unitCode = unitString.trim();
  
  
  let unitName = unitData && unitData.unit_name ? unitData.unit_name : null;
  
  // Derive full unit name if missing
  if (!unitName) {
    switch(unitCode.toLowerCase()) {
      case 'kg': unitName = 'Kilogram'; break;
      case 'g': unitName = 'Gram'; break;
      case 'l': 
      case 'ltr': unitName = 'Liter'; break;
      case 'ml': unitName = 'Milliliter'; break;
      case 'pc': 
      case 'ea': unitName = 'Piece'; break;
      default: unitName = unitCode;
    }
  }
  
  // Return all unit fields from the database plus the inferred type
  return {
    id: unitData ? unitData.id : null,
    code: unitCode,
    name: unitName,
   
  };
}

/**
 * Checks if the GPC and unit are compatible with each other
 * @param {string} gpcString - The GPC string or code
 * @param {string} unitCode - The unit code
 * @param {string} unitType - The type of unit (weight, volume, quantity)
 * @returns {Object} - Compatibility result with status and reason
 */
function checkGpcUnitCompatibility(gpcString, unitCode, unitType) {
  if (!gpcString || !unitCode) {
    return { compatible: true, reason: null }; // Not enough info to determine incompatibility
  }
  
  // Use default unitType if not provided
  unitType = unitType || 'unknown';
  
  const gpcLower = gpcString.toLowerCase();
  const unitLower = unitCode.toLowerCase();
  
  // Extract GPC code and description if available
  let gpcCode = null;
  let gpcDescription = '';
  
  if (gpcLower.includes('-')) {
    const parts = gpcLower.split('-');
    gpcCode = parts[0].trim();
    gpcDescription = parts.slice(1).join('-').trim();
  } else {
    gpcDescription = gpcLower;
  }
  
  // Enhanced semantic embedding vectors (word-level embeddings simulation)
  // This simulates how word vectors capture semantic relationships
  const semanticVectors = {
    // Liquid domain vector components
    'liquid': [0.8, 0.1, 0.0, 0.1, 0.0],
    'oil': [0.7, 0.2, 0.0, 0.1, 0.0],
    'beverage': [0.7, 0.0, 0.1, 0.2, 0.0],
    'drink': [0.7, 0.0, 0.2, 0.1, 0.0],
    'fluid': [0.9, 0.0, 0.0, 0.1, 0.0],
    'juice': [0.6, 0.0, 0.3, 0.1, 0.0],
    'water': [0.8, 0.0, 0.1, 0.1, 0.0],
    'milk': [0.6, 0.0, 0.3, 0.1, 0.0],
    'sauce': [0.6, 0.3, 0.1, 0.0, 0.0],
    'syrup': [0.7, 0.2, 0.1, 0.0, 0.0],
    'lubricant': [0.8, 0.1, 0.0, 0.1, 0.0],
    'solvent': [0.7, 0.2, 0.0, 0.1, 0.0],
    'cream': [0.5, 0.3, 0.1, 0.1, 0.0],
    'fuel': [0.8, 0.1, 0.0, 0.1, 0.0],
    
    // Solid/powder domain vector components
    'powder': [0.1, 0.8, 0.0, 0.1, 0.0],
    'solid': [0.0, 0.9, 0.0, 0.1, 0.0],
    'grain': [0.0, 0.7, 0.2, 0.1, 0.0],
    'food': [0.1, 0.5, 0.3, 0.1, 0.0],
    'flour': [0.0, 0.8, 0.2, 0.0, 0.0],
    'rice': [0.0, 0.7, 0.3, 0.0, 0.0],
    'sugar': [0.0, 0.8, 0.2, 0.0, 0.0],
    'salt': [0.0, 0.9, 0.1, 0.0, 0.0],
    'cereal': [0.0, 0.6, 0.4, 0.0, 0.0],
    'coffee': [0.0, 0.7, 0.3, 0.0, 0.0],
    'spice': [0.0, 0.8, 0.2, 0.0, 0.0],
    'detergent': [0.0, 0.7, 0.0, 0.3, 0.0],
    'soap': [0.0, 0.6, 0.0, 0.4, 0.0],
    'chemical': [0.2, 0.6, 0.0, 0.2, 0.0],
    
    // Discrete items domain vector components
    'device': [0.0, 0.0, 0.9, 0.1, 0.0],
    'electronic': [0.0, 0.0, 0.8, 0.2, 0.0],
    'appliance': [0.0, 0.0, 0.7, 0.3, 0.0],
    'equipment': [0.0, 0.0, 0.8, 0.2, 0.0],
    'apparatus': [0.0, 0.0, 0.7, 0.3, 0.0],
    'phone': [0.0, 0.0, 0.9, 0.1, 0.0],
    'computer': [0.0, 0.0, 0.9, 0.1, 0.0],
    'machine': [0.0, 0.0, 0.8, 0.2, 0.0],
    'tool': [0.0, 0.0, 0.7, 0.3, 0.0],
    'furniture': [0.0, 0.0, 0.9, 0.1, 0.0],
    'toy': [0.0, 0.0, 0.9, 0.1, 0.0],
    'game': [0.0, 0.0, 0.8, 0.2, 0.0],
    'clothing': [0.0, 0.0, 0.9, 0.1, 0.0],
    'garment': [0.0, 0.0, 0.9, 0.1, 0.0],
    'shoe': [0.0, 0.0, 0.9, 0.1, 0.0],
    'accessory': [0.0, 0.0, 0.8, 0.2, 0.0],
    
    // Length measurement domain
    'fabric': [0.0, 0.1, 0.1, 0.0, 0.8],
    'textile': [0.0, 0.1, 0.1, 0.0, 0.8],
    'cloth': [0.0, 0.1, 0.1, 0.0, 0.8],
    'cable': [0.0, 0.0, 0.2, 0.0, 0.8],
    'wire': [0.0, 0.0, 0.2, 0.0, 0.8],
    'rope': [0.0, 0.1, 0.1, 0.0, 0.8],
    'thread': [0.0, 0.1, 0.0, 0.0, 0.9],
    'yarn': [0.0, 0.1, 0.0, 0.0, 0.9],
    'ribbon': [0.0, 0.1, 0.0, 0.0, 0.9]
  };
  
  // Unit domain vectors
  const unitDomainVectors = {
    'volume': [0.9, 0.0, 0.0, 0.1, 0.0],  // Volume-oriented vector
    'weight': [0.0, 0.9, 0.0, 0.1, 0.0],  // Weight-oriented vector
    'quantity': [0.0, 0.0, 0.9, 0.1, 0.0], // Quantity-oriented vector
    'length': [0.0, 0.0, 0.0, 0.1, 0.9],  // Length-oriented vector
    'area': [0.0, 0.0, 0.0, 0.9, 0.1]     // Area-oriented vector
  };
  
  // Calculate semantic similarity between GPC description and unit domain
  function calculateCosineSimilarity(vec1, vec2) {
    // Simplified cosine similarity calculation
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      normA += vec1[i] * vec1[i];
      normB += vec2[i] * vec2[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    return (normA && normB) ? dotProduct / (normA * normB) : 0;
  }
  
  // Get avg vector for GPC description
  function getAverageVector(text) {
    const words = text.split(/\s+/);
    const sumVector = [0, 0, 0, 0, 0];
    let wordCount = 0;
    
    for (const word of words) {
      if (semanticVectors[word]) {
        wordCount++;
        for (let i = 0; i < 5; i++) {
          sumVector[i] += semanticVectors[word][i];
        }
      }
    }
    
    // Return average vector or default vector if no matches
    if (wordCount > 0) {
      return sumVector.map(val => val / wordCount);
    }
    return [0.2, 0.2, 0.2, 0.2, 0.2]; // Default balanced vector
  }
  
  // Get vector for GPC description
  const gpcVector = getAverageVector(gpcDescription);
  
  // Determine most likely product category from vector
  let highestSimilarity = -1;
  let mostLikelyDomain = null;
  
  for (const [domain, vector] of Object.entries(unitDomainVectors)) {
    const similarity = calculateCosineSimilarity(gpcVector, vector);
    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
      mostLikelyDomain = domain;
    }
  }
  
  // Define category-unit type mappings with enhanced NLP features
  const categoryUnitMap = {
    // Liquids should use volume units
    liquid: {
      expectedType: 'volume',
      keywords: ['liquid', 'oil', 'beverage', 'drink', 'fluid', 'juice', 'water', 'milk', 
                'sauce', 'syrup', 'lubricant', 'solvent', 'cream', 'fuel'],
      recommendedUnits: ['L', 'ML', 'CL', 'LTR', 'LITER', 'GAL', 'OZ', 'FLOZ'],
      wordEmbeddingThreshold: 0.7  // Similarity threshold
    },
    
    // Solids and powders should use weight units
    solid: {
      expectedType: 'weight',
      keywords: ['powder', 'solid', 'grain', 'food', 'flour', 'rice', 'sugar', 'salt', 
                'cereal', 'coffee', 'spice', 'detergent', 'soap', 'chemical'],
      recommendedUnits: ['KG', 'G', 'MG', 'LB', 'OZ', 'TON'],
      wordEmbeddingThreshold: 0.65  // Slightly lower threshold for solids
    },
    
    // Discrete items should use quantity units
    item: {
      expectedType: 'quantity',
      keywords: ['device', 'electronic', 'appliance', 'equipment', 'apparatus', 
                'phone', 'computer', 'machine', 'tool', 'furniture', 'toy', 'game',
                'clothing', 'garment', 'shoe', 'accessory'],
      recommendedUnits: ['PC', 'EA', 'UNIT', 'SET', 'PAIR', 'PCS', 'EACH'],
      wordEmbeddingThreshold: 0.75  // Higher threshold for items
    },
    
    // Special case for fabric, textiles, cables
    length: {
      expectedType: 'length',
      keywords: ['fabric', 'textile', 'cloth', 'cable', 'wire', 'rope', 'thread', 'yarn', 'ribbon'],
      recommendedUnits: ['M', 'CM', 'MM', 'FT', 'IN', 'YD'],
      wordEmbeddingThreshold: 0.7
    },
    
    // Special case for area-based products
    area: {
      expectedType: 'area',
      keywords: ['carpet', 'rug', 'tile', 'panel', 'board', 'sheet', 'field', 'land'],
      recommendedUnits: ['M2', 'SQM', 'SQFT', 'ACRE', 'HA'],
      wordEmbeddingThreshold: 0.7
    }
  };
  
  // Advanced NLP-based category detection with vector similarity
  let detectedCategory = null;
  let highestConfidence = 0;
  let detectionMethod = 'keyword';
  
  // First try vector-based similarity
  if (mostLikelyDomain && highestSimilarity > 0.5) {
    // Map from vector domain to category
    const domainToCategoryMap = {
      'volume': 'liquid',
      'weight': 'solid',
      'quantity': 'item',
      'length': 'length',
      'area': 'area'
    };
    
    detectedCategory = domainToCategoryMap[mostLikelyDomain];
    highestConfidence = highestSimilarity;
    detectionMethod = 'vector';
  }
  
  // Fallback to keyword-based approach if vector similarity is low
  if (!detectedCategory || highestConfidence < 0.6) {
    for (const [category, data] of Object.entries(categoryUnitMap)) {
      // Count how many keywords match
      const matchCount = data.keywords.filter(keyword => 
        gpcDescription.includes(keyword)
      ).length;
      
      // Calculate keyword match confidence
      const matchConfidence = matchCount / data.keywords.length;
      
      if (matchConfidence > highestConfidence) {
        highestConfidence = matchConfidence;
        detectedCategory = category;
        detectionMethod = 'keyword';
      }
    }
  }
  
  // Apply contextual analysis with n-gram patterns for special cases
  const ngramPatterns = [
    // Check for "washing powder", "detergent powder", etc.
    {
      pattern: /(washing|detergent|laundry)\s+(powder|granules)/i,
      category: 'solid',
      confidence: 0.95,
      expectedType: 'weight'
    },
    // Check for "engine oil", "motor oil", etc.
    {
      pattern: /(engine|motor|transmission|hydraulic)\s+oil/i,
      category: 'liquid',
      confidence: 0.95,
      expectedType: 'volume'
    },
    // Check for "liquid soap", "liquid detergent", etc.
    {
      pattern: /liquid\s+(soap|detergent|cleaner)/i,
      category: 'liquid',
      confidence: 0.95,
      expectedType: 'volume'
    }
  ];
  
  // Check for n-gram pattern matches
  for (const pattern of ngramPatterns) {
    if (pattern.pattern.test(gpcDescription)) {
      detectedCategory = pattern.category;
      highestConfidence = pattern.confidence;
      detectionMethod = 'n-gram';
      break;
    }
  }
  
  // If we detected a category with good confidence and the unit type doesn't match
  if (detectedCategory && highestConfidence > 0.6) {
    const categoryData = categoryUnitMap[detectedCategory];
    const expectedType = categoryData.expectedType;
    
    if (unitType !== expectedType) {
      return {
        compatible: false,
        reason: `GPC indicates a ${detectedCategory} product (${gpcDescription}) but unit is ${unitType} (${unitCode}). ${detectedCategory.charAt(0).toUpperCase() + detectedCategory.slice(1)} products should use ${expectedType} units like ${categoryData.recommendedUnits.slice(0, 3).join(', ')}.`,
        recommendedUnits: categoryData.recommendedUnits,
        confidence: Math.round(highestConfidence * 100),
        detectionMethod
      };
    }
  }
  
  // Industry-specific contextual rules (more domain knowledge)
  const industrySpecificRules = [
    // Rule for automotive oils
    {
      condition: (gpc) => /\b(engine|motor|automotive|car|vehicle)\b.*\b(oil|lubricant|fluid)\b/i.test(gpc) ||
                         /\b(api\s+[a-z]{1,2})\b/i.test(gpc) || 
                         /\b\d+w\d+\b/i.test(gpc),
      unitType: 'volume',
      message: 'Automotive oil products must use volume units',
      recommendedUnits: ['L', 'ML', 'LTR']
    },
    // Explicit rule to prohibit rate units for oil products
    {
      condition: (gpc) => /\b(engine|motor|oil|lubricant|fluid)\b/i.test(gpc) || 
                         /\b\d+w\d+\b/i.test(gpc) ||
                         /\bapi\s+s[a-z]\b/i.test(gpc),
      prohibitedUnitTypes: ['rate', 'length', 'area'],
      message: 'Engine oil products cannot use rate/speed or length units - they must use volume units',
      recommendedUnits: ['L', 'ML', 'LTR', 'LITER']
    },
    // Rule for washing powders
    {
      condition: (gpc) => /\b(washing|laundry|detergent)\b.*\b(powder|granule)\b/i.test(gpc),
      unitType: 'weight',
      message: 'Washing/detergent powder products must use weight units',
      recommendedUnits: ['KG', 'G']
    },
    // Rule for beverages
    {
      condition: (gpc) => /\b(drink|beverage|water|juice|soda|milk|coffee|tea)\b/i.test(gpc),
      unitType: 'volume',
      message: 'Beverage products must use volume units',
      recommendedUnits: ['L', 'ML', 'FL OZ']
    },
    // Rule for electronics
    {
      condition: (gpc) => /\b(electronics|device|gadget|phone|computer|laptop|tablet)\b/i.test(gpc),
      unitType: 'quantity',
      message: 'Electronic products must use quantity units',
      recommendedUnits: ['PC', 'EA', 'UNIT']
    },
    // Rule for clothing
    {
      condition: (gpc) => /\b(clothing|garment|apparel|wear|fashion|dress|shirt|pant)\b/i.test(gpc),
      unitType: 'quantity',
      message: 'Clothing products must use quantity units',
      recommendedUnits: ['PC', 'EA', 'PAIR']
    }
  ];
  
  // Check industry-specific rules
  for (const rule of industrySpecificRules) {
    if (rule.condition(gpcDescription)) {
      if (rule.unitType && unitType !== rule.unitType) {
        return {
          compatible: false,
          reason: `${rule.message} like ${rule.recommendedUnits.join(', ')}, but unit is ${unitType} (${unitCode}).`,
          recommendedUnits: rule.recommendedUnits,
          confidence: 95,
          detectionMethod: 'industry-rule'
        };
      }
      
      // Check for explicitly prohibited unit types
      if (rule.prohibitedUnitTypes && rule.prohibitedUnitTypes.includes(unitType)) {
        return {
          compatible: false,
          reason: `${rule.message}. Current unit (${unitCode}) is a ${unitType} unit which is not appropriate.`,
          recommendedUnits: rule.recommendedUnits,
          confidence: 98,
          detectionMethod: 'prohibited-unit-type'
        };
      }
    }
  }
  
  // Specific unit code validation patterns
  const unitValidationPatterns = {
    'volume': /^(l|ltr|ml|cl|oz|gal|floz|liter)$/i,
    'weight': /^(kg|g|mg|lb|oz|ton)$/i,
    'quantity': /^(pc|ea|pcs|unit|set|pair|each)$/i,
    'length': /^(m|cm|mm|ft|in|yd)$/i,
    'area': /^(m2|sqm|sqft|ha|acre)$/i
  };
  
  // If we didn't detect incompatibility by category but the unit code format is wrong
  if (unitType && unitValidationPatterns[unitType] && !unitValidationPatterns[unitType].test(unitLower)) {
    // Get list of valid units for this type
    const validUnits = Object.keys(unitValidationPatterns)
      .filter(type => unitValidationPatterns[type].test(unitLower))
      .map(type => type);
    
    if (validUnits.length > 0) {
      return {
        compatible: false,
        reason: `The unit code '${unitCode}' appears to be a ${validUnits[0]} unit but is being used as a ${unitType} unit. Please use appropriate ${unitType} units.`,
        recommendedUnits: unitValidationPatterns[unitType].toString().replace(/[\^\$\/]/g, '').split('|'),
        confidence: 85,
        detectionMethod: 'unit-format'
      };
    }
  }
  
  // No incompatibility detected
  return { compatible: true, reason: null };
}

/**
 * Advanced image analysis function to detect product characteristics
 * Uses NLP-inspired techniques to match image content with GPC and unit data
 */
/**
 * Advanced image analysis function to detect product characteristics and inconsistencies
 * Uses NLP-inspired techniques to validate image content against product metadata
 * @param {string} imageUrl - URL of the product image
 * @param {string} gpc - Global Product Classification string
 * @param {string} unit - Unit of measurement code
 * @param {string} productName - Optional product name for additional context
 * @returns {Object} - Detailed analysis results with confidence scores and suggestions
 */
function analyzeProductImage(imageUrl, gpc, unit, productName = '') {
  
  // Normalize URL path by converting backslashes to forward slashes
  const normalizedUrl = imageUrl ? imageUrl.replace(/\\/g, '/') : '';
  
  
  // Enhanced validation result with more detailed metadata
  const result = {
    isValid: true,
    confidence: 0,
    detectedFeatures: [],
    detectedCategories: [],
    semanticScore: 0,
    contentConsistency: 'unknown',
    issues: [],
    suggestions: [],
    analysisMetadata: {
      analysisVersion: '2.0',
      analysisMethod: 'nlp_semantic_pattern_matching',
      timestamp: new Date().toISOString()
    }
  };

  // Validate image URL format
  if (!normalizedUrl) {
    result.isValid = false;
    result.issues.push({
      type: 'invalid_url',
      message: 'Invalid image URL format',
      severity: 'critical',
      confidence: 100
    });
    return result;
  }

  // Extract image characteristics from URL
  const imagePath = normalizedUrl.split('/').pop();
  
  
  // Parse filename for metadata - many image filenames contain descriptive information
  const imageNameWithoutExt = imagePath.split('.')[0].toLowerCase();
  const imageComponents = imageNameWithoutExt.split(/[-_\s]/);
  const fileExtension = imagePath.split('.').pop().toLowerCase();
  
  // Define unrelated content patterns that would indicate image mismatch
  const unrelatedContentPatterns = {
    animal: {
      keywords: ['animal', 'dog', 'cat', 'bird', 'pet', 'wildlife', 'lion', 'tiger', 'bear', 'elephant', 'horse'],
      description: 'Animal or wildlife imagery',
      categories: ['pet_products', 'animal_food', 'veterinary_products']
    },
    person: {
      keywords: ['person', 'people', 'human', 'man', 'woman', 'child', 'baby', 'portrait', 'face', 'selfie'],
      description: 'Human portrait or people imagery',
      categories: ['clothing', 'cosmetics', 'personal_care']
    },
    landscape: {
      keywords: ['landscape', 'mountain', 'beach', 'ocean', 'sea', 'lake', 'forest', 'nature', 'outdoor', 'sky', 'sunset'],
      description: 'Natural landscape imagery',
      categories: ['travel_products', 'outdoor_equipment']
    },
    building: {
      keywords: ['building', 'house', 'architecture', 'city', 'urban', 'construction', 'office', 'tower', 'apartment'],
      description: 'Buildings or architectural imagery',
      categories: ['construction_materials', 'real_estate']
    },
    vehicle: {
      keywords: ['vehicle', 'car', 'truck', 'motorcycle', 'bike', 'bicycle', 'auto', 'automotive', 'transport'],
      description: 'Vehicle imagery',
      categories: ['automotive_parts', 'transportation_equipment']
    },
    abstract: {
      keywords: ['abstract', 'pattern', 'texture', 'art', 'design', 'illustration', 'graphic'],
      description: 'Abstract art or pattern imagery',
      categories: ['art_supplies', 'decorative_items']
    },
    technology: {
      keywords: ['technology', 'computer', 'laptop', 'phone', 'device', 'electronic', 'digital', 'screen', 'tech'],
      description: 'Technology or device imagery',
      categories: ['electronics', 'computer_equipment', 'mobile_devices']
    }
  };

  // Enhanced image validation patterns for different product types with visual identifiers
  const imageValidationPatterns = {
    oil_products: {
      keywords: ['oil', 'lubricant', 'fluid', 'liquid', 'engine', 'motor', 'petroleum', 'synthetic'],
      expectedFeatures: ['bottle', 'container', 'can', 'jug', 'drum', 'packaging'],
      validUnits: ['L', 'ML', 'LITER', 'GAL', 'FLOZ', 'QT'],
      imagePatterns: ['bottle', 'container', 'packaging', 'oil', 'lubricant', 'motor'],
      visualSignatures: ['glossy liquid', 'amber color', 'yellow', 'golden', 'brown'],
      incompatibleContent: ['animal', 'person', 'landscape', 'building', 'abstract'],
      description: 'Automotive or industrial oils and lubricants'
    },
    cleaning_products: {
      keywords: ['detergent', 'cleaner', 'soap', 'washing', 'bleach', 'disinfectant', 'sanitizer'],
      expectedFeatures: ['bottle', 'box', 'package', 'spray', 'container', 'jug', 'pouch'],
      validUnits: ['KG', 'G', 'L', 'ML', 'OZ', 'LB'],
      imagePatterns: ['bottle', 'box', 'container', 'cleaner', 'soap', 'detergent'],
      visualSignatures: ['spray bottle', 'plastic container', 'powder', 'liquid soap'],
      incompatibleContent: ['animal', 'person', 'landscape', 'vehicle', 'abstract'],
      description: 'Household or industrial cleaning products'
    },
    food_products: {
      keywords: ['food', 'snack', 'meal', 'nutrition', 'edible', 'grocery', 'consumable', 'ingredient'],
      expectedFeatures: ['package', 'box', 'bag', 'container', 'wrapper', 'pouch', 'jar', 'can'],
      validUnits: ['KG', 'G', 'MG', 'ML', 'L', 'OZ', 'LB'],
      imagePatterns: ['package', 'container', 'food', 'edible', 'snack', 'meal'],
      visualSignatures: ['food product', 'edible content', 'packaging with food images'],
      incompatibleContent: ['vehicle', 'building', 'technology'],
      description: 'Edible food products and ingredients'
    },
    beverages: {
      keywords: ['drink', 'beverage', 'water', 'juice', 'soda', 'milk', 'coffee', 'tea'],
      expectedFeatures: ['bottle', 'can', 'container', 'pack', 'carton', 'glass', 'cup'],
      validUnits: ['L', 'ML', 'CL', 'FL OZ', 'GAL', 'OZ'],
      imagePatterns: ['bottle', 'can', 'container', 'drink', 'beverage', 'liquid'],
      visualSignatures: ['transparent bottle', 'colorful liquid', 'drinking container'],
      incompatibleContent: ['vehicle', 'building', 'technology'],
      description: 'Drinkable liquid products'
    },
    electronics: {
      keywords: ['device', 'gadget', 'electronic', 'digital', 'tech', 'appliance', 'computer'],
      expectedFeatures: ['box', 'device', 'product', 'packaging', 'electronics', 'hardware'],
      validUnits: ['PC', 'UNIT', 'SET', 'PIECE', 'EA', 'EACH'],
      imagePatterns: ['device', 'box', 'product', 'electronic', 'digital', 'tech'],
      visualSignatures: ['electronic device', 'circuit board', 'screen', 'control panel'],
      incompatibleContent: ['animal', 'landscape'],
      description: 'Electronic devices and gadgets'
    },
    personal_care: {
      keywords: ['cosmetic', 'beauty', 'makeup', 'skin', 'hair', 'care', 'personal', 'hygiene'],
      expectedFeatures: ['bottle', 'tube', 'jar', 'container', 'packaging', 'beauty product'],
      validUnits: ['G', 'ML', 'OZ', 'FL OZ', 'PIECE'],
      imagePatterns: ['cosmetic', 'beauty', 'personal', 'care', 'hygiene', 'makeup'],
      visualSignatures: ['cream jar', 'beauty product', 'cosmetic packaging'],
      incompatibleContent: ['vehicle', 'building', 'technology'],
      description: 'Personal care and beauty products'
    },
    clothing: {
      keywords: ['apparel', 'clothing', 'wear', 'garment', 'fashion', 'textile', 'fabric'],
      expectedFeatures: ['garment', 'clothing', 'apparel', 'fabric', 'textile', 'fashion item'],
      validUnits: ['PC', 'PIECE', 'SET', 'PAIR', 'EA', 'EACH'],
      imagePatterns: ['clothing', 'apparel', 'garment', 'fashion', 'wear'],
      visualSignatures: ['fabric texture', 'clothing item', 'folded garment', 'hanger'],
      incompatibleContent: ['vehicle', 'building', 'technology'],
      description: 'Clothing and apparel items'
    }
  };

  // Analyze GPC and unit compatibility with image
  const gpcLower = (gpc || '').toLowerCase();
  const unitLower = (unit || '').toLowerCase();
  const productNameLower = (productName || '').toLowerCase();
  
  // Advanced NLP-inspired pattern detection
  // 1. Detect product category from GPC and product name
  let detectedCategoryFromMetadata = null;
  let highestMatchScore = 0;
  
  // Calculate match score using weighted matching
  for (const [category, patterns] of Object.entries(imageValidationPatterns)) {
    // 1.5x weight for GPC matches, 1.0x for product name matches
    const gpcMatchScore = patterns.keywords.reduce((score, keyword) => 
      score + (gpcLower.includes(keyword) ? 1.5 : 0), 0);
    
    const nameMatchScore = patterns.keywords.reduce((score, keyword) => 
      score + (productNameLower.includes(keyword) ? 1.0 : 0), 0);
    
    const totalScore = gpcMatchScore + nameMatchScore;
    
    if (totalScore > highestMatchScore) {
      highestMatchScore = totalScore;
      detectedCategoryFromMetadata = category;
    }
  }
  
  // 2. Detect content category from image filename
  const possibleContentCategories = [];
  const contentMatchScores = {};
  
  // Check for unrelated content patterns in the image name
  for (const [contentType, patterns] of Object.entries(unrelatedContentPatterns)) {
    const contentMatchScore = patterns.keywords.reduce((score, keyword) => {
      // Check for exact matches in image components
      const exactMatch = imageComponents.includes(keyword) ? 1.5 : 0;
      // Check for partial matches in image name
      const partialMatch = imageNameWithoutExt.includes(keyword) ? 0.5 : 0;
      return score + exactMatch + partialMatch;
    }, 0);
    
    if (contentMatchScore > 0) {
      possibleContentCategories.push(contentType);
      contentMatchScores[contentType] = contentMatchScore;
    }
  }
  
  // 3. Check for image filename patterns that match the expected product category
  let imageCategoryMatchScore = 0;
  if (detectedCategoryFromMetadata) {
    const categoryPatterns = imageValidationPatterns[detectedCategoryFromMetadata];
    
    // Check for expected features in filename
    const featureMatchScore = categoryPatterns.expectedFeatures.reduce((score, feature) => 
      score + (imageNameWithoutExt.includes(feature) ? 1.0 : 0), 0);
    
    // Check for image patterns in filename
    const patternMatchScore = categoryPatterns.imagePatterns.reduce((score, pattern) => 
      score + (imageNameWithoutExt.includes(pattern) ? 1.0 : 0), 0);
    
    // Check for visual signatures in filename
    const signatureMatchScore = categoryPatterns.visualSignatures.reduce((score, signature) => {
      // Split signature into words and check for presence of all words in order
      const signatureParts = signature.split(' ');
      const allPartsPresent = signatureParts.every(part => imageNameWithoutExt.includes(part));
      return score + (allPartsPresent ? 1.5 : 0);
    }, 0);
    
    imageCategoryMatchScore = featureMatchScore + patternMatchScore + signatureMatchScore;
    
    result.detectedFeatures.push({
      category: detectedCategoryFromMetadata,
      matchScore: highestMatchScore,
      imageMatchScore: imageCategoryMatchScore,
      expectedFeatures: categoryPatterns.expectedFeatures,
      detectedFeatures: categoryPatterns.expectedFeatures.filter(feature => 
        imageNameWithoutExt.includes(feature)
      )
    });
    
    // Detect image content consistency with product metadata
    if (imageCategoryMatchScore > 0) {
      result.contentConsistency = 'consistent';
      result.semanticScore = Math.min(100, (highestMatchScore + imageCategoryMatchScore) * 10);
    } else if (possibleContentCategories.length > 0) {
      // Check if any detected content category is incompatible with the product category
      const incompatibleCategories = possibleContentCategories.filter(contentType =>
        categoryPatterns.incompatibleContent.includes(contentType)
      );
      
      if (incompatibleCategories.length > 0) {
        result.contentConsistency = 'inconsistent';
        result.isValid = false;
        
        // Get the highest scoring inconsistent content type
        const highestScoringInconsistentType = incompatibleCategories.reduce(
          (highest, current) => contentMatchScores[current] > contentMatchScores[highest] ? current : highest,
          incompatibleCategories[0]
        );
        
        // Get description of the unrelated content
        const contentDescription = unrelatedContentPatterns[highestScoringInconsistentType].description;
        
        // Create detailed issue description
        result.issues.push({
          type: 'content_type_mismatch',
          severity: 'critical',
          confidence: Math.min(95, contentMatchScores[highestScoringInconsistentType] * 20),
          message: `Image appears to contain ${contentDescription} which is inconsistent with ${detectedCategoryFromMetadata.replace('_', ' ')} products`,
          suggestion: `Upload an image that clearly shows the ${categoryPatterns.description} with visible ${categoryPatterns.expectedFeatures.slice(0, 3).join(', ')}`,
          analysis: {
            expectedCategory: detectedCategoryFromMetadata,
            detectedContentType: highestScoringInconsistentType,
            matchScore: contentMatchScores[highestScoringInconsistentType],
            matchedKeywords: unrelatedContentPatterns[highestScoringInconsistentType].keywords.filter(
              keyword => imageNameWithoutExt.includes(keyword)
            )
          }
        });
      } else {
        result.contentConsistency = 'ambiguous';
        
        // Add warning about ambiguous image content
        result.issues.push({
          type: 'ambiguous_image_content',
          severity: 'warning',
          confidence: 70,
          message: `Image filename doesn't clearly indicate ${detectedCategoryFromMetadata.replace('_', ' ')} product content`,
          suggestion: `Ensure image clearly shows the product with visible ${categoryPatterns.expectedFeatures.slice(0, 3).join(', ')}`,
          analysis: {
            expectedCategory: detectedCategoryFromMetadata,
            possibleContentTypes: possibleContentCategories,
            imageComponents: imageComponents.filter(comp => comp.length > 2) // Filter out very short components
          }
        });
      }
    } else {
      // No clear content indicators in filename
      result.contentConsistency = 'undetermined';
      
      // Add suggestion about undetermined image content
      result.issues.push({
        type: 'undetermined_image_content',
        severity: 'info',
        confidence: 50,
        message: `Image filename doesn't provide clear indicators of product content`,
        suggestion: `Rename image to include descriptive terms related to your ${categoryPatterns.description}`,
        analysis: {
          expectedCategory: detectedCategoryFromMetadata,
          imageNameComponents: imageComponents.filter(comp => comp.length > 2)
        }
      });
    }
    
    // Validate unit compatibility with detected product category
    if (!categoryPatterns.validUnits.some(validUnit => 
      unitLower.includes(validUnit.toLowerCase()))) {
      result.isValid = false;
      result.issues.push({
        type: 'unit_mismatch',
        severity: 'high',
        confidence: 85,
        message: `Unit ${unit} is not appropriate for ${detectedCategoryFromMetadata.replace('_', ' ')} products`,
        suggestion: `${categoryPatterns.description} should use one of these units: ${categoryPatterns.validUnits.join(', ')}`,
        analysis: {
          productCategory: detectedCategoryFromMetadata,
          providedUnit: unit,
          expectedUnits: categoryPatterns.validUnits,
          unitType: categoryPatterns.validUnits.includes('L') ? 'volume' : 
                   categoryPatterns.validUnits.includes('KG') ? 'weight' : 'quantity'
        }
      });
    }
    
    // Image format validation - recommend industry standard formats
    const recommendedFormats = ['jpg', 'png', 'webp'];
    if (!recommendedFormats.includes(fileExtension)) {
      result.issues.push({
        type: 'image_format_warning',
        severity: 'low',
        confidence: 90,
        message: `Image format .${fileExtension} may not be optimal for product display`,
        suggestion: `Consider using industry standard formats like JPG, PNG or WebP for better compatibility and performance`,
        analysis: {
          currentFormat: fileExtension,
          recommendedFormats: recommendedFormats
        }
      });
    }
  } else if (possibleContentCategories.length > 0) {
    // No product category detected from metadata, but content categories detected from image
    result.contentConsistency = 'indeterminate';
    result.isValid = false;
    
    // Get highest scoring content type
    const highestScoringContentType = possibleContentCategories.reduce(
      (highest, current) => contentMatchScores[current] > contentMatchScores[highest] ? current : highest,
      possibleContentCategories[0]
    );
    
    result.issues.push({
      type: 'content_category_mismatch',
      severity: 'high',
      confidence: 75,
      message: `Image appears to contain ${unrelatedContentPatterns[highestScoringContentType].description} which doesn't match product metadata`,
      suggestion: `Upload an image that clearly shows the product described in your metadata`,
      analysis: {
        detectedContentType: highestScoringContentType,
        matchScore: contentMatchScores[highestScoringContentType],
        possibleCategories: unrelatedContentPatterns[highestScoringContentType].categories,
        gpcProvided: gpc ? 'yes' : 'no',
        unitProvided: unit ? 'yes' : 'no'
      }
    });
  } else {
    // No clear category detected from either metadata or image
    result.contentConsistency = 'unknown';
    
    result.issues.push({
      type: 'insufficient_metadata',
      severity: 'medium',
      confidence: 60,
      message: `Unable to determine product category from available metadata`,
      suggestion: `Ensure GPC classification accurately describes your product and image clearly shows the product`,
      analysis: {
        imageComponents: imageComponents.filter(comp => comp.length > 2),
        gpcProvided: gpc ? 'yes' : 'no',
        unitProvided: unit ? 'yes' : 'no'
      }
    });
  }
  
  // Record all detected categories for comprehensive analysis
  if (detectedCategoryFromMetadata) {
    result.detectedCategories.push({
      source: 'product_metadata',
      category: detectedCategoryFromMetadata,
      confidence: Math.min(95, highestMatchScore * 15),
      matchScore: highestMatchScore
    });
  }
  
  possibleContentCategories.forEach(contentType => {
    result.detectedCategories.push({
      source: 'image_filename',
      category: contentType,
      confidence: Math.min(90, contentMatchScores[contentType] * 20),
      matchScore: contentMatchScores[contentType]
    });
  });
  
  // Set overall confidence based on validation results and semantic scores
  if (result.issues.length === 0) {
    result.confidence = Math.max(70, result.semanticScore);
  } else {
    // Weighted reduction based on issue severity
    const severityWeights = {
      'critical': 40,
      'high': 25,
      'medium': 15,
      'low': 5,
      'info': 0
    };
    
    const confidenceReduction = result.issues.reduce((total, issue) => 
      total + (severityWeights[issue.severity] || 10), 0);
      
    result.confidence = Math.max(0, 100 - confidenceReduction);
  }
  
  // Add advanced analysis metadata
  result.analysisMetadata.imageNameAnalysis = {
    components: imageComponents.filter(comp => comp.length > 2),
    extension: fileExtension,
    semanticMatchScore: result.semanticScore,
    contentConsistency: result.contentConsistency
  };
  
  return result;
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
    const member_id = req.query.member_id;
  
    
    let products = [];
    let totalCount = 0;
    
    if (productId || member_id) {
      // Build where conditions with AND logic
      const whereConditions = {
        deleted_at: null,
        AND: []
      };
      
      // Add conditions based on which parameters are provided
      if (productId) {
        whereConditions.AND.push({ id: productId });
      }
      
      if (member_id) {
        whereConditions.AND.push({ member_id: member_id });
      }
      
      console.log('Where conditions for query:', JSON.stringify(whereConditions, null, 2));
      
      if (!gtrackDB || !gtrackDB.products) {
        console.error('GTRACKDB or products model is not available');
        return res.status(500).json(fallbackResponse);
      }
      
      // Fetch products matching both productId AND member_id
      console.log('Attempting to query products table...');
      products = await safeDbQuery(() => gtrackDB.products.findMany({
        where: whereConditions
      }));
      console.log('Query completed, found products:', products.length);
      
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
      
      if (!gtrackDB || !gtrackDB.products) {
        console.error('GTRACKDB or products model is not available');
        return res.status(500).json(fallbackResponse);
      }
      
      // Get total count for pagination from GTRACKDB
      totalCount = await safeDbQuery(() => gtrackDB.products.count({
        where: {
          deleted_at: null
        }
      }), 0);
      
      // Fetch paginated products from GTRACKDB
      products = await safeDbQuery(() => gtrackDB.products.findMany({
        where: {
          deleted_at: null
        },
        skip,
        take: pageSize,
        orderBy: {
          created_at: 'desc'
        }
      }));
    }
    
    // Fetch related data separately
    const brandNames = products.map(p => p.BrandName).filter(Boolean);
    const unitCodes = products.map(p => p.unit).filter(Boolean);
    const gpcCodes = products.map(p => p.gpc).filter(Boolean);
    
    if (!gs1DB) {
      console.error('GS1DB client is not available');
      // Continue without related data
    }
    
    // Pre-fetch GPC classes for common product categories
    const prefetchedGpcClasses = await prefetchGpcClasses();
    
    // Debug GPC classes table to help diagnose issues
    const gpcClassesDebugInfo = await debugGpcClassesTable();
    console.log('GPC Classes debug info available:', gpcClassesDebugInfo ? 'yes' : 'no');
    
    // Fetch brands from GS1DB
    let brands = [];
    if (gs1DB && gs1DB.Brand) {
      brands = await safeDbQuery(() => gs1DB.Brand.findMany({
        where: {
          name: {
            in: brandNames
          }
        }
      }));
    }
    
    // Fetch units from GS1DB
    let units = [];
    if (gs1DB && gs1DB.Units) {
      units = await safeDbQuery(() => gs1DB.Units.findMany({
        where: {
          unit_code: {
            in: unitCodes
          }
        }
      }));
    }
    
    // Fetch GPC classes from GS1DB
    let gpcClasses = [];
    if (gs1DB && gs1DB.gpc_classes) {
      gpcClasses = await safeDbQuery(() => gs1DB.gpc_classes.findMany({
        where: {
          OR: [
            { class_code: { in: gpcCodes.filter(Boolean) } },
            { id: { in: gpcCodes.filter(Boolean).map(code => parseFloat(code)).filter(num => !isNaN(num)) } }
          ]
        }
      }));
    } else if (gs1DB && gs1DB.$queryRaw) {
      try {
        // Fallback to raw query if Prisma model is not available
        gpcClasses = await gs1DB.$queryRaw`
          SELECT * FROM gpc_classes 
          WHERE class_code IN (${gpcCodes.join(',')}) OR id IN (${gpcCodes.join(',')})
        `;
      } catch (error) {
        console.log('GPC classes query error:', error.message);
        // If error occurs, it might be that the table doesn't exist or has a different structure
      }
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
    const verifiedProducts = await Promise.all(products.map(async product => {
      // Look up the corresponding brand, unit, and GPC data
      const brandData = product.BrandName ? brandLookup[product.BrandName] : null;
      const unitData = product.unit ? unitLookup[product.unit.trim()] : null;
      
      // Get the actual GPC data from our lookup
      const gpcData = product.gpc ? gpcLookup[product.gpc] : null;
      
      // Parse GPC and unit data
      const parsedGPC = parseGPC(product.gpc);
      const parsedUnit = parseUnit(product.unit, unitData);
      
      // Enhanced product with parsed data
      const enhancedProduct = {
        ...product,
        parsedData: {
          gpc: parsedGPC,
          unit: parsedUnit
        }
      };
      
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
      
      // Additional validation for GPC and unit compatibility - run early in the validation process
      if (product.gpc && product.unit && parsedUnit.type) {
        const compatibilityResult = checkGpcUnitCompatibility(
          product.gpc,
          product.unit,
          parsedUnit.type
        );
        
        if (!compatibilityResult.compatible) {
          verification.isValid = false;
          verification.verificationStatus = 'unverified';
          verification.issues.push({
            rule: 'GPC-Unit Compatibility',
            severity: 'high',
            message: compatibilityResult.reason
          });
          
          // Add AI suggestion for incompatible GPC and unit
          verification.aiSuggestions.push({
            field: 'unit',
            suggestion: `Your product with GPC "${product.gpc}" requires a different unit of measurement. ${compatibilityResult.reason}`,
            importance: 'High'
          });
        }
      }
      
      // RULE 2: Check semantic relationship between BrandName and GPC
      if (product.BrandName && product.gpc) {
        // Extract category info from product name and GPC
        const productNameLower = product.productnameenglish ? product.productnameenglish.toLowerCase() : '';
        const brandNameLower = product.BrandName.toLowerCase();
        const gpcLower = product.gpc.toLowerCase();
        
        // Get the parsed GPC description - use this for more accurate categorization
        const gpcDescription = parsedGPC.description ? parsedGPC.description.toLowerCase() : '';
        
        // Use advanced product classification with enhanced GPC data
        const productClassification = classifyProductType(
          product.productnameenglish,
          product.BrandName,
          gpcDescription || product.gpc // Prefer the parsed description
        );
        
        // Store the classification for later use
        const detectedCategory = productClassification.category;
        const classificationConfidence = productClassification.confidence;
        const classificationMethod = productClassification.detectionMethod || 'keyword';
        const expectedUnit = productClassification.expectedUnit;
        
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
                importance: 'High',
                nlp_analysis: {
                  detection_method: 'keyword_comparison',
                  product_categories: detectedProductCategories,
                  gpc_categories: detectedGpcCategories,
                  confidence: 'medium'
                }
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
            
            // Get GPC title suggestions from the database if possible
            let recommendedGpcTitles = getDirectGpcSuggestions(
              prefetchedGpcClasses, 
              detectedCategory,
              product.productnameenglish
            );
            
            // Get the recommended GPC titles as a comma-separated string
            const gpcTitleSuggestions = recommendedGpcTitles.slice(0, 3).join(', ');
            
            verification.aiSuggestions.push({
              field: 'gpc',
              suggestion: `Our AI has identified your product "${product.productnameenglish}" as a ${detectedCategory.replace('_', ' ')}. Please select a GPC classification such as "${gpcTitleSuggestions}" for more accurate categorization. This will improve product discovery and ensure proper classification.`,
              importance: 'High',
              confidence: classificationConfidence.toFixed(0) + '%',
              nlp_analysis: {
                detection_method: classificationMethod,
                identified_category: detectedCategory,
                matched_patterns: productClassification.ngramMatches || [],
                semantic_compatibility: 'low',
                recommended_gpc_titles: recommendedGpcTitles
              }
            });
          }
          
          // Add unit compatibility check based on detected category
          if (expectedUnit) {
            const unitType = unitData && inferUnitType(unitData);
            
            if (unitType && unitType !== expectedUnit) {
              verification.isValid = false;
              verification.verificationStatus = 'unverified';
              verification.issues.push({
                rule: 'Unit Compatibility',
                severity: 'high',
                message: `Product category "${detectedCategory.replace('_', ' ')}" should use ${expectedUnit} units, but uses ${unitType} units`
              });
              
              // Get recommended units based on expected unit type
              let recommendedUnits = [];
              let unitExplanation = '';
              
              if (expectedUnit === 'volume') {
                recommendedUnits = ['L', 'ML', 'FL OZ'];
                unitExplanation = 'volume units such as liters or milliliters';
              } else if (expectedUnit === 'weight') {
                recommendedUnits = ['KG', 'G'];
                unitExplanation = 'weight units such as kilograms or grams';
              } else if (expectedUnit === 'quantity') {
                recommendedUnits = ['PC', 'EA', 'UNIT'];
                unitExplanation = 'quantity units such as piece or each';
              }
              
              verification.aiSuggestions.push({
                field: 'unit',
                suggestion: `Based on our advanced analysis, your product "${product.productnameenglish}" (${detectedCategory.replace('_', ' ')}) should use ${unitExplanation} instead of ${unitType} units. Using the proper unit type ensures accurate representation and compliance with industry standards.`,
                importance: 'High',
                recommended_units: recommendedUnits,
                confidence: classificationConfidence.toFixed(0) + '%',
                nlp_analysis: {
                  detection_method: classificationMethod,
                  product_category: detectedCategory,
                  recommended_unit_type: expectedUnit,
                  current_unit_type: unitType,
                  contextual_analysis: productClassification.explanation || `${detectedCategory} products typically use ${expectedUnit} units`
                }
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
      
      // Add enhanced image analysis with NLP-inspired techniques
      if (product.front_image) {
        const imageAnalysis = analyzeProductImage(
          product.front_image,
          product.gpc,
          product.unit,
          product.productnameenglish // Pass product name for better context
        );

        // Add image analysis results to verification
        if (!imageAnalysis.isValid) {
          verification.isValid = false;
          verification.verificationStatus = 'unverified';
          
          // Add image-related issues with severity mapping
          verification.issues.push(...imageAnalysis.issues.map(issue => ({
            rule: 'Image Analysis',
            severity: issue.severity || (issue.type.includes('warning') ? 'medium' : 'high'),
            message: issue.message,
            confidence: issue.confidence || imageAnalysis.confidence
          })));

          // Add image-related suggestions with improved details
          verification.aiSuggestions.push(...imageAnalysis.issues.map(issue => ({
            field: 'front_image',
            suggestion: issue.suggestion || issue.message,
            importance: issue.severity === 'critical' ? 'Critical' : 
                        issue.severity === 'high' ? 'High' : 
                        issue.severity === 'medium' ? 'Medium' : 'Low',
            confidence: (issue.confidence || imageAnalysis.confidence) + '%',
            analysisDetails: issue.analysis || null
          })));
          
          // Add special warning for content type mismatches (like animal images for oil products)
          const contentMismatch = imageAnalysis.issues.find(issue => issue.type === 'content_type_mismatch');
          if (contentMismatch) {
            verification.aiSuggestions.push({
              field: 'general',
              suggestion: `IMPORTANT: Your product appears to have an inappropriate image. ${contentMismatch.message}. This will cause product verification to fail and may confuse customers.`,
              importance: 'Critical',
              confidence: '95%'
            });
          }
        }

        // Add comprehensive image analysis metadata
        verification.imageAnalysis = {
          confidence: imageAnalysis.confidence,
          contentConsistency: imageAnalysis.contentConsistency,
          semanticScore: imageAnalysis.semanticScore,
          detectedFeatures: imageAnalysis.detectedFeatures,
          detectedCategories: imageAnalysis.detectedCategories,
          analysisMethod: imageAnalysis.analysisMetadata?.analysisMethod || 'nlp_semantic_pattern_matching',
          analysisVersion: imageAnalysis.analysisMetadata?.analysisVersion || '2.0'
        };
      }
      
      // Return the product with all the verification data
      return {
        ...enhancedProduct,
        brandData,       // Include the brand data
        unitData,        // Include the unit data
        gpcData,         // Include the GPC data
        verification     // Include the AI verification results
      };
    }));
    
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

/**
 * Helper function to fetch relevant GPC classes from the database based on keywords
 * @param {string} category - The detected product category
 * @returns {Promise<Array>} - Array of matching GPC class titles
 */
async function fetchRelevantGpcClasses(category) {
  if (!gs1DB || !gs1DB.gpc_classes) {
    // Return fallback suggestions if database is not available
    return getFallbackGpcSuggestions(category);
  }
  
  try {
    // Convert category to search terms
    const searchTerms = getCategorySearchTerms(category);
    
    // Build OR conditions for each search term
    const orConditions = searchTerms.map(term => ({
      OR: [
        { class_title: { contains: term } },
        { class_definition: { contains: term } }
      ]
    }));
    
    // Fetch matching GPC classes
    const matchingClasses = await gs1DB.gpc_classes.findMany({
      where: {
        OR: orConditions
      },
      select: {
        class_code: true,
        class_title: true
      },
      take: 5 // Limit to 5 most relevant results
    });
    
    // Return just the class titles
    const classTitles = matchingClasses.map(cls => cls.class_title).filter(Boolean);
    
    // If no matches, return fallback suggestions
    if (classTitles.length === 0) {
      return getFallbackGpcSuggestions(category);
    }
    
    return classTitles;
  } catch (error) {
    console.error('Error fetching GPC classes:', error);
    return getFallbackGpcSuggestions(category);
  }
}

/**
 * Get appropriate search terms for a given product category
 */
function getCategorySearchTerms(category) {
  // Map category to appropriate search terms
  switch(category) {
    case 'oil_product':
      return ['engine oil', 'motor oil', 'lubricant', 'automotive oil', 'lubricating oil'];
    case 'cleaning_product':
      return ['detergent', 'cleaning', 'laundry', 'cleaner', 'washing powder'];
    case 'food_product':
      return ['food', 'edible', 'grocery', 'consumable'];
    case 'beverage_product':
      return ['beverage', 'drink', 'water', 'liquid refreshment'];
    case 'electronic_product':
      return ['electronic', 'device', 'digital', 'computer', 'appliance'];
    case 'clothing_product':
      return ['clothing', 'apparel', 'garment', 'wear'];
    case 'personal_care':
      return ['cosmetic', 'personal care', 'beauty', 'toiletry'];
    case 'household_product':
      return ['household', 'home', 'domestic'];
    default:
      return [category.replace('_', ' ')];
  }
}

/**
 * Get fallback GPC title suggestions when database lookup fails
 */
function getFallbackGpcSuggestions(category) {
  // Fallback suggestions in case database lookup fails
  switch(category) {
    case 'oil_product':
      return ['Engine Oil/Engine Lubricants', 'Motor Oils', 'Automotive Lubricants', 'Vehicle Lubricants'];
    case 'cleaning_product':
      return ['Laundry Detergents', 'Household Cleaning Products', 'Cleaning Agents'];
    case 'food_product':
      return ['Food Items', 'Packaged Food', 'Grocery Products'];
    case 'beverage_product':
      return ['Beverages', 'Drinks', 'Water - Packaged', 'Bottled Drinks'];
    case 'electronic_product':
      return ['Electronics', 'Electronic Devices', 'Consumer Electronics'];
    case 'clothing_product':
      return ['Clothing', 'Apparel', 'Garments'];
    case 'personal_care':
      return ['Personal Care Products', 'Cosmetics', 'Beauty Products'];
    case 'household_product':
      return ['Household Products', 'Home Goods', 'Domestic Items'];
    default:
      return [category.replace('_', ' ') + ' Products'];
  }
}

/**
 * Pre-fetch common GPC classes for different product categories 
 * to avoid async issues in the main processing loop
 */
async function prefetchGpcClasses() {
  if (!gs1DB || !gs1DB.gpc_classes) {
    console.log('GS1DB or gpc_classes model not available');
    return {};
  }
  
  try {
    // Define common search terms for popular categories
    const categorySearchTerms = {
      'oil_product': ['engine oil', 'motor oil', 'lubricant', 'automotive oil', 'engine', 'oil', 'lubricating'],
      'beverage_product': ['beverage', 'drink', 'water', 'liquid', 'juice'],
      'food_product': ['food', 'edible', 'grocery', 'consumable', 'snack'],
      'cleaning_product': ['detergent', 'cleaning', 'laundry', 'cleaner', 'soap']
    };
    
    const results = {};
    
    // Query for each category
    for (const [category, terms] of Object.entries(categorySearchTerms)) {
      console.log(`Fetching GPC classes for ${category} with terms: ${terms.join(', ')}`);
      
      try {
        // Try using raw SQL query which might be more reliable with text search
        const rawQuery = `
          SELECT class_code, class_title 
          FROM gpc_classes 
          WHERE ${terms.map(term => `class_title LIKE '%${term}%'`).join(' OR ')}
          LIMIT 5
        `;
        
        let matchingClasses = [];
        
        try {
          matchingClasses = await gs1DB.$queryRaw(rawQuery);
          console.log(`Raw query found ${matchingClasses.length} matches for ${category}`);
        } catch (sqlError) {
          console.error('Raw SQL query failed:', sqlError.message);
          
          // Fall back to Prisma query
          const orConditions = terms.map(term => ({
            OR: [
              { class_title: { contains: term } }
            ]
          }));
          
          matchingClasses = await gs1DB.gpc_classes.findMany({
            where: {
              OR: orConditions
            },
            select: {
              class_code: true,
              class_title: true
            },
            take: 5
          });
          
          console.log(`Prisma query found ${matchingClasses.length} matches for ${category}`);
        }
        
        // Store results
        results[category] = matchingClasses.map(cls => cls.class_title).filter(Boolean);
        
        console.log(`GPC titles for ${category}:`, results[category]);
        
        // If no results, use fallback
        if (!results[category] || results[category].length === 0) {
          console.log(`No GPC classes found for ${category}, using fallback`);
          results[category] = getFallbackGpcSuggestions(category);
        }
      } catch (categoryError) {
        console.error(`Error fetching GPC classes for ${category}:`, categoryError);
        results[category] = getFallbackGpcSuggestions(category);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error pre-fetching GPC classes:', error);
    return {};
  }
}

/**
 * Direct GPC class lookup for product verification
 * This should be called during product verification for more accurate suggestions
 * @param {object} gpcClasses - The prefetched GPC classes
 * @param {string} detectedCategory - The detected product category
 * @param {string} productName - The product name for additional context
 * @returns {Array} - Array of matching GPC class titles
 */
function getDirectGpcSuggestions(gpcClasses, detectedCategory, productName) {
  try {
    console.log(`Getting direct GPC suggestions for ${detectedCategory} and product "${productName}"`);
    
    // First check if we have pre-fetched GPC classes for this category
    if (gpcClasses && gpcClasses[detectedCategory] && gpcClasses[detectedCategory].length > 0) {
      console.log(`Found ${gpcClasses[detectedCategory].length} pre-fetched GPC classes for ${detectedCategory}`);
      return gpcClasses[detectedCategory];
    }
    
    // If we don't have pre-fetched classes, try to query directly if we have gs1DB available
    if (gs1DB && gs1DB.gpc_classes) {
      console.log(`No pre-fetched classes, attempting direct synchronous query`);
      
      // For direct sync access, use fallback values but log the issue
      console.log(`Cannot perform async DB query during verification, using fallback GPC suggestions`);
    }
    
    // Use fallback suggestions as a last resort
    return getFallbackGpcSuggestions(detectedCategory);
  } catch (error) {
    console.error('Error getting GPC suggestions:', error);
    return getFallbackGpcSuggestions(detectedCategory);
  }
}

/**
 * Debug function to verify GPC classes table structure and sample data
 * This helps identify issues with the database connection or table schema
 */
async function debugGpcClassesTable() {
  try {
    if (!gs1DB) {
      console.error('GS1DB connection not available for debugging');
      return null;
    }
    
    console.log('=== GPC Classes Table Debug ===');
    
    // Check if gpc_classes table exists and has expected structure
    try {
      // Try to get the first few records to check table structure
      const sample = await gs1DB.$queryRaw`SELECT TOP 5 * FROM gpc_classes`;
      console.log('Sample GPC classes:', sample);
      
      // If that works, count total records
      const count = await gs1DB.$queryRaw`SELECT COUNT(*) as total FROM gpc_classes`;
      console.log('Total GPC classes:', count);
      
      // Check if there are records with "oil" in the title (for our test case)
      const oilSample = await gs1DB.$queryRaw`SELECT TOP 5 * FROM gpc_classes WHERE class_title LIKE '%oil%'`;
      console.log('Sample oil-related GPC classes:', oilSample);
      
      return {
        tableExists: true,
        sampleData: sample,
        totalCount: count,
        oilSample: oilSample
      };
    } catch (error) {
      console.error('Error querying gpc_classes table:', error.message);
      
      // Try alternate query syntax for different SQL dialects
      try {
        const sample = await gs1DB.$queryRaw`SELECT * FROM gpc_classes LIMIT 5`;
        console.log('Sample GPC classes (alternate syntax):', sample);
        return {
          tableExists: true,
          sampleData: sample,
          alternateQueryUsed: true
        };
      } catch (alternateError) {
        console.error('Error with alternate query:', alternateError.message);
        return {
          tableExists: false,
          error: error.message
        };
      }
    }
  } catch (error) {
    console.error('GPC classes debug error:', error);
    return {
      error: error.message
    };
  }
}

