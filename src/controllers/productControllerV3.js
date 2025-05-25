const { gtrackDB, gs1DB } = require('../models');
const Clarifai = require('clarifai');

// Initialize Clarifai client
const clarifaiApp = new Clarifai.App({
  apiKey: process.env.CLARIFAI_API_KEY || 'aea6fc5c9cc84320877e410f64b232c5' // Use environment variable or add your key
});

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
  
  // Extract unit name and code with safety checks
  const unitName = unitData.unit_name ? unitData.unit_name.toLowerCase() : '';
  const unitCode = unitData.unit_code ? unitData.unit_code.toLowerCase() : '';
  
  // If no data is available, return unknown
  if (!unitName && !unitCode) return 'unknown';
  
  // Define unit type patterns
  const unitTypePatterns = {
    // Rate/Speed/Time-based units
    rate: ['per', 'perhour', 'persecond', 'perminute', 'ph', 'ps', 'pm', 'hz', 'rpm', 'sps', 'mps', 'fps', 'm60'],
    
    // Volume units
    volume: ['l', 'ml', 'liter', 'litre', 'gallon', 'oz', 'fluid', 'ltr', 'fl', 'cl', 'dl', 'pt', 'qt', 'gal'],
    
    // Weight units
    weight: ['kg', 'g', 'mg', 'lb', 'pound', 'ton', 'gram', 'kilo', 'oz', 'ounce', 't'],
    
    // Quantity units
    quantity: ['pc', 'piece', 'unit', 'each', 'item', 'count', 'ea', 'pcs', 'pair', 'set', 'pack', 'pkg'],
    
    // Length units
    length: ['m', 'cm', 'mm', 'ft', 'inch', 'yard', 'metre', 'meter', 'in', 'yd', 'km', 'mi', 'mile'],
    
    // Area units
    area: ['m2', 'sqm', 'sq m', 'square meter', 'ha', 'acre', 'sqft', 'sq ft', 'square foot']
  };
  
  // Check unit name and code against patterns
  for (const [type, patterns] of Object.entries(unitTypePatterns)) {
    // Check for matches in both unit name and code
    // Also handle special case to avoid false matches of length units in rate units
    if (patterns.some(pattern => 
        (unitName.includes(pattern) || unitCode.includes(pattern)) && 
        !(type === 'length' && 
          unitTypePatterns.rate.some(ratePattern => 
            unitName.includes(ratePattern) || unitCode.includes(ratePattern)
          ))
      )) {
      return type;
    }
  }
  
  // Handle specific cases based on unit code only
  const unitCodeMap = {
    'kg': 'weight',
    'g': 'weight',
    'mg': 'weight',
    'lb': 'weight',
    'oz': 'weight',
    'l': 'volume',
    'ml': 'volume',
    'ltr': 'volume',
    'pc': 'quantity',
    'ea': 'quantity',
    'm': 'length',
    'cm': 'length',
    'mm': 'length',
    'ft': 'length',
    'in': 'length',
    'm2': 'area',
    'ha': 'area'
  };
  
  if (unitCodeMap[unitCode]) {
    return unitCodeMap[unitCode];
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
 * Parse brick string into separate code and description components
 * @param {string} brickString - Raw brick string (e.g., "20002871-Type of Engine Oil Target")
 * @returns {Object} - Object with code and description
 */
function parseBrick(brickString) {
  if (!brickString) return { code: null, description: null };
  
  // Check if the brick contains a hyphen separator
  if (brickString.includes('-')) {
    const [code, ...descParts] = brickString.split('-');
    const description = descParts.join('-').trim();
    return { 
      code: code.trim(), 
      description 
    };
  } 
  // If there's no hyphen but it starts with digits, assume those are the code
  else if (/^\d+/.test(brickString)) {
    const codeMatch = brickString.match(/^(\d+)/);
    if (codeMatch) {
      const code = codeMatch[1];
      const description = brickString.substring(code.length).trim();
      return { 
        code, 
        description: description || null 
      };
    }
  }
  
  // If we can't extract a code, return the whole thing as description
  return { 
    code: null, 
    description: brickString 
  };
}

/**
 * Parse unit string into better components
 * @param {string} unitString - Raw unit string 
 * @param {Object} unitData - Unit data from database
 * @returns {Object} - Enhanced unit info
 */
function parseUnit(unitString, unitData) {
  if (!unitString) return { code: null, name: null, type: null, id: null };
  
  const unitCode = unitString.trim().toUpperCase();
  
  // Define comprehensive unit name mapping
  const unitNameMap = {
    // Weight units
    'KG': 'Kilogram',
    'G': 'Gram',
    'MG': 'Milligram',
    'LB': 'Pound',
    'OZ': 'Ounce',
    'TON': 'Ton',
    
    // Volume units
    'L': 'Liter',
    'LTR': 'Liter',
    'ML': 'Milliliter',
    'CL': 'Centiliter',
    'GAL': 'Gallon',
    'FLOZ': 'Fluid Ounce',
    'FL OZ': 'Fluid Ounce',
    
    // Quantity units
    'PC': 'Piece',
    'PCS': 'Pieces',
    'EA': 'Each',
    'UNIT': 'Unit',
    'SET': 'Set',
    'PAIR': 'Pair',
    'EACH': 'Each',
    
    // Length units
    'M': 'Meter',
    'CM': 'Centimeter',
    'MM': 'Millimeter',
    'FT': 'Foot',
    'IN': 'Inch',
    'YD': 'Yard',
    
    // Area units
    'M2': 'Square Meter',
    'SQM': 'Square Meter',
    'SQFT': 'Square Foot',
    'ACRE': 'Acre',
    'HA': 'Hectare',
    
    // Default
    'DEFAULT': 'Unit'
  };
  
  // Get unit name from database if available
  let unitName = unitData && unitData.unit_name ? unitData.unit_name : null;
  
  // If unit_name is not available from database, use our mapping
  if (!unitName) {
    unitName = unitNameMap[unitCode] || unitNameMap['DEFAULT'];
  }
  
  // Infer unit type
  let unitType = null;
  if (unitData) {
    unitType = inferUnitType(unitData);
  } else {
    // Infer type based on unit code
    if (['KG', 'G', 'MG', 'LB', 'OZ', 'TON'].includes(unitCode)) {
      unitType = 'weight';
    } else if (['L', 'LTR', 'ML', 'CL', 'GAL', 'FLOZ', 'FL OZ'].includes(unitCode)) {
      unitType = 'volume';
    } else if (['PC', 'PCS', 'EA', 'UNIT', 'SET', 'PAIR', 'EACH'].includes(unitCode)) {
      unitType = 'quantity';
    } else if (['M', 'CM', 'MM', 'FT', 'IN', 'YD'].includes(unitCode)) {
      unitType = 'length';
    } else if (['M2', 'SQM', 'SQFT', 'ACRE', 'HA'].includes(unitCode)) {
      unitType = 'area';
    } else {
      unitType = 'unknown';
    }
  }
  
  // Return all unit fields from the database plus the inferred type
  return {
    id: unitData ? unitData.id : null,
    code: unitCode,
    name: unitName,
    type: unitType,
    status: unitData ? unitData.status : 'active'
  };
}

/**
 * Checks if the Brick and unit are compatible with each other
 * @param {string} brickString - The Brick string or code
 * @param {string} unitCode - The unit code
 * @param {string} unitType - The type of unit (weight, volume, quantity)
 * @returns {Object} - Compatibility result with status and reason
 */
function checkBrickUnitCompatibility(brickString, unitCode, unitType) {
  if (!brickString || !unitCode) {
    return { compatible: true, reason: null }; // Not enough info to determine incompatibility
  }
  
  // Use default unitType if not provided
  unitType = unitType || 'unknown';
  
  const brickLower = brickString.toLowerCase();
  const unitLower = unitCode.toLowerCase();
  
  // Extract Brick code and description if available
  let brickCode = null;
  let brickDescription = '';
  
  if (brickLower.includes('-')) {
    const parts = brickLower.split('-');
    brickCode = parts[0].trim();
    brickDescription = parts.slice(1).join('-').trim();
  } else {
    brickDescription = brickLower;
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
  
  // Calculate semantic similarity between Brick description and unit domain
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
  
  // Get avg vector for Brick description
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
  
  // Get vector for Brick description
  const brickVector = getAverageVector(brickDescription);
  
  // Determine most likely product category from vector
  let highestSimilarity = -1;
  let mostLikelyDomain = null;
  
  for (const [domain, vector] of Object.entries(unitDomainVectors)) {
    const similarity = calculateCosineSimilarity(brickVector, vector);
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
        brickDescription.includes(keyword)
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
    if (pattern.pattern.test(brickDescription)) {
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
        reason: `Brick indicates a ${detectedCategory} product (${brickDescription}) but unit is ${unitType} (${unitCode}). ${detectedCategory.charAt(0).toUpperCase() + detectedCategory.slice(1)} products should use ${expectedType} units like ${categoryData.recommendedUnits.slice(0, 3).join(', ')}.`,
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
      condition: (brick) => /\b(engine|motor|automotive|car|vehicle)\b.*\b(oil|lubricant|fluid)\b/i.test(brick) ||
                         /\b(api\s+[a-z]{1,2})\b/i.test(brick) || 
                         /\b\d+w\d+\b/i.test(brick),
      unitType: 'volume',
      message: 'Automotive oil products must use volume units',
      recommendedUnits: ['L', 'ML', 'LTR']
    },
    // Explicit rule to prohibit rate units for oil products
    {
      condition: (brick) => /\b(engine|motor|oil|lubricant|fluid)\b/i.test(brick) || 
                         /\b\d+w\d+\b/i.test(brick) ||
                         /\bapi\s+s[a-z]\b/i.test(brick),
      prohibitedUnitTypes: ['rate', 'length', 'area'],
      message: 'Engine oil products cannot use rate/speed or length units - they must use volume units',
      recommendedUnits: ['L', 'ML', 'LTR', 'LITER']
    },
    // Rule for washing powders
    {
      condition: (brick) => /\b(washing|laundry|detergent)\b.*\b(powder|granule)\b/i.test(brick),
      unitType: 'weight',
      message: 'Washing/detergent powder products must use weight units',
      recommendedUnits: ['KG', 'G']
    },
    // Rule for beverages
    {
      condition: (brick) => /\b(drink|beverage|water|juice|soda|milk|coffee|tea)\b/i.test(brick),
      unitType: 'volume',
      message: 'Beverage products must use volume units',
      recommendedUnits: ['L', 'ML', 'FL OZ']
    },
    // Rule for electronics
    {
      condition: (brick) => /\b(electronics|device|gadget|phone|computer|laptop|tablet)\b/i.test(brick),
      unitType: 'quantity',
      message: 'Electronic products must use quantity units',
      recommendedUnits: ['PC', 'EA', 'UNIT']
    },
    // Rule for clothing
    {
      condition: (brick) => /\b(clothing|garment|apparel|wear|fashion|dress|shirt|pant)\b/i.test(brick),
      unitType: 'quantity',
      message: 'Clothing products must use quantity units',
      recommendedUnits: ['PC', 'EA', 'PAIR']
    }
  ];
  
  // Check industry-specific rules
  for (const rule of industrySpecificRules) {
    if (rule.condition(brickDescription)) {
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
 * Clarifai-based image verification for product images
 * Verifies if the product image matches the product description and classification
 * @param {string} imageUrl - URL of the product image
 * @param {string} productName - Product name in English
 * @param {string} gpc - Global Product Classification
 * @param {string} unit - Unit of measurement
 * @returns {Promise<Object>} - Verification result with valid flag, matches, and confidence
 */
async function verifyClarifaiImage(imageUrl, productName, gpc, unit) {
  try {
    if (!imageUrl) {
      return {
        valid: false,
        message: 'Image URL is missing',
        matches: [],
        confidence: 0
      };
    }

    // Format the image URL - prepend domain if it's a relative path
    let formattedImageUrl = imageUrl;
    
    // Check if the URL is relative (doesn't start with http)
    if (!imageUrl.startsWith('http')) {
      // Replace backslashes with forward slashes for web URLs
      const normalizedPath = imageUrl.replace(/\\/g, '/');
      
      // Remove leading slash if present
      const cleanPath = normalizedPath.startsWith('/') ? normalizedPath.substring(1) : normalizedPath;
      
      // Prepend the base URL
      formattedImageUrl = `https://backend.gtrack.online/${cleanPath}`;
      
      console.log(`Converted relative image path to full URL: ${formattedImageUrl}`);
    }

    // Define expected concepts based on product metadata
    const expectedConcepts = generateExpectedConcepts(productName, gpc, unit);
    
    // Predict concepts in the image using Clarifai's general model
    const response = await clarifaiApp.models.predict(Clarifai.GENERAL_MODEL, formattedImageUrl);
    
    // Extract detected concepts from Clarifai response
    const detectedConcepts = response.outputs[0].data.concepts
      .filter(concept => concept.value > 0.6) // Only include concepts with confidence > 60%
      .map(concept => ({
        name: concept.name,
        confidence: concept.value
      }));
    
    // Find matching concepts between expected and detected
    const matches = findConceptMatches(expectedConcepts, detectedConcepts);
    
    // Calculate overall verification score
    const verificationScore = calculateVerificationScore(matches, expectedConcepts);
    
    // Determine if image is valid based on verification score
    const isValid = verificationScore.score >= 0.65; // 65% threshold for validity
    
    return {
      valid: isValid,
      message: isValid ? 
        'Image content matches product description' : 
        'Image content does not sufficiently match product description',
      matches: matches,
      score: verificationScore.score,
      confidence: verificationScore.confidence,
      detectedConcepts: detectedConcepts.slice(0, 10), // Return top 10 concepts
      expectedConcepts: expectedConcepts,
      imageUrl: formattedImageUrl // Include the processed URL for debugging
    };
  } catch (error) {
    console.error('Clarifai image verification error:', error);
    return {
      valid: false,
      message: `Failed to verify image: ${error.message}`,
      error: error.message,
      matches: [],
      confidence: 0,
      imageUrl: imageUrl // Include the original URL for debugging
    };
  }
}

/**
 * Generate expected image concepts based on product metadata
 * @param {string} productName - Product name in English
 * @param {string} gpc - Global Product Classification
 * @param {string} unit - Unit of measurement
 * @returns {Array} - Array of expected concepts
 */
function generateExpectedConcepts(productName, gpc, unit) {
  const concepts = [];
  
  // Product-specific concepts based on name
  if (productName) {
    const productNameLower = productName.toLowerCase();
    
    // Add product name keywords to concepts
    const keywords = productNameLower.split(' ')
      .filter(word => word.length > 3) // Only include meaningful words
      .filter(word => !['with', 'from', 'this', 'that', 'and', 'for', 'the'].includes(word)); // Filter common words
    
    concepts.push(...keywords);
    
    // Oil-related concepts - enhanced with more specificity
    if (productNameLower.includes('oil') || productNameLower.includes('lubricant')) {
      concepts.push('oil', 'bottle', 'container', 'liquid', 'lubricant');
      
      if (productNameLower.includes('engine') || productNameLower.includes('motor')) {
        concepts.push('engine', 'motor', 'automotive', 'car', 'vehicle', 'mechanical');
        // Add specific oil container types
        concepts.push('plastic container', 'oil container', 'automotive fluid');
      }
      
      if (productNameLower.includes('cooking')) {
        concepts.push('cooking', 'food', 'kitchen', 'cooking oil', 'vegetable oil');
        // Add specific cooking oil container types
        concepts.push('glass bottle', 'cooking oil bottle', 'food oil');
      }
      
      // Differentiate synthetic oil
      if (productNameLower.includes('synthetic')) {
        concepts.push('synthetic', 'synthetic oil');
      }
    }
    
    // Water/beverage related concepts - enhanced
    if (productNameLower.includes('water') || productNameLower.includes('drink') || 
        productNameLower.includes('beverage') || productNameLower.includes('juice') ||
        productNameLower.includes('soda') || productNameLower.includes('coffee')) {
      concepts.push('bottle', 'drink', 'liquid', 'beverage', 'container');
      
      // Softwater specific
      if (productNameLower.includes('soft') && productNameLower.includes('water')) {
        concepts.push('soft drink', 'soda', 'carbonated', 'refreshment');
        concepts.push('soft water bottle', 'plastic bottle', 'drink container');
      }
      
      // Specific beverage types
      if (productNameLower.includes('juice')) {
        concepts.push('juice', 'fruit', 'fruit juice', 'juice bottle');
      }
      
      if (productNameLower.includes('coffee')) {
        concepts.push('coffee', 'coffee bean', 'coffee package', 'caffeine');
      }
      
      if (productNameLower.includes('tea')) {
        concepts.push('tea', 'tea bag', 'tea box', 'tea package');
      }
      
      if (productNameLower.includes('milk')) {
        concepts.push('milk', 'dairy', 'milk bottle', 'milk carton');
      }
    }
    
    // Cleaning product concepts - enhanced
    if (productNameLower.includes('detergent') || productNameLower.includes('cleaner') || 
        productNameLower.includes('soap') || productNameLower.includes('washing')) {
      concepts.push('cleaning', 'detergent', 'soap', 'bottle', 'container', 'household');
      
      // Differentiate powder vs liquid
      if (productNameLower.includes('powder')) {
        concepts.push('powder', 'box', 'package', 'detergent powder', 'washing powder');
      } else {
        concepts.push('liquid', 'liquid detergent', 'cleaning liquid');
      }
      
      // Specific cleaning types
      if (productNameLower.includes('dish')) {
        concepts.push('dish', 'dishwashing', 'kitchen', 'dish soap');
      }
      
      if (productNameLower.includes('laundry')) {
        concepts.push('laundry', 'clothes', 'washing machine', 'laundry detergent');
      }
      
      if (productNameLower.includes('floor') || productNameLower.includes('surface')) {
        concepts.push('floor', 'surface', 'floor cleaner', 'mop');
      }
    }
    
    // Food product concepts - enhanced
    if (productNameLower.includes('food') || productNameLower.includes('snack') || 
        productNameLower.includes('meal') || productNameLower.includes('grocery') ||
        productNameLower.includes('cereal') || productNameLower.includes('pasta')) {
      concepts.push('food', 'package', 'container', 'grocery', 'edible');
      
      // Specific food types
      if (productNameLower.includes('snack')) {
        concepts.push('snack', 'chips', 'crackers', 'snack bag', 'snack package');
      }
      
      if (productNameLower.includes('cereal')) {
        concepts.push('cereal', 'breakfast', 'cereal box', 'grain');
      }
      
      if (productNameLower.includes('pasta') || productNameLower.includes('noodle')) {
        concepts.push('pasta', 'noodle', 'pasta package', 'pasta box');
      }
      
      if (productNameLower.includes('canned') || productNameLower.includes('can')) {
        concepts.push('can', 'canned food', 'tin', 'metal container');
      }
    }
    
    // Electronic product concepts - enhanced
    if (productNameLower.includes('electronic') || productNameLower.includes('device') || 
        productNameLower.includes('gadget') || productNameLower.includes('appliance') ||
        productNameLower.includes('phone') || productNameLower.includes('computer')) {
      concepts.push('electronic', 'device', 'technology', 'gadget', 'box', 'product packaging');
      
      // Specific electronic types
      if (productNameLower.includes('phone') || productNameLower.includes('mobile')) {
        concepts.push('phone', 'mobile', 'smartphone', 'cell phone', 'screen');
      }
      
      if (productNameLower.includes('computer') || productNameLower.includes('laptop')) {
        concepts.push('computer', 'laptop', 'keyboard', 'screen', 'monitor');
      }
      
      if (productNameLower.includes('camera')) {
        concepts.push('camera', 'lens', 'digital camera', 'photography');
      }
      
      if (productNameLower.includes('tv') || productNameLower.includes('television')) {
        concepts.push('tv', 'television', 'screen', 'display');
      }
    }
    
    // Clothing product concepts - enhanced
    if (productNameLower.includes('clothing') || productNameLower.includes('apparel') || 
        productNameLower.includes('wear') || productNameLower.includes('garment') ||
        productNameLower.includes('shirt') || productNameLower.includes('pants') ||
        productNameLower.includes('shoe')) {
      concepts.push('clothing', 'fashion', 'apparel', 'garment', 'clothes');
      
      // Specific clothing types
      if (productNameLower.includes('shirt') || productNameLower.includes('tshirt')) {
        concepts.push('shirt', 't-shirt', 'top', 'clothing item');
      }
      
      if (productNameLower.includes('pant') || productNameLower.includes('trouser') || 
          productNameLower.includes('jean')) {
        concepts.push('pants', 'trousers', 'jeans', 'bottom', 'clothing item');
      }
      
      if (productNameLower.includes('shoe') || productNameLower.includes('footwear')) {
        concepts.push('shoe', 'footwear', 'sneaker', 'boot', 'pair');
      }
      
      if (productNameLower.includes('jacket') || productNameLower.includes('coat')) {
        concepts.push('jacket', 'coat', 'outerwear', 'winter clothing');
      }
    }
  }
  
  // Enhanced GPC-based concepts
  if (gpc) {
    const gpcLower = gpc.toLowerCase();
    
    // Extract meaningful words from GPC
    if (gpcLower.includes('-')) {
      const gpcDescription = gpcLower.split('-')[1];
      if (gpcDescription) {
        const gpcKeywords = gpcDescription.split(' ')
          .filter(word => word.length > 3)
          .filter(word => !['with', 'from', 'this', 'that', 'and', 'for', 'the'].includes(word));
        
        concepts.push(...gpcKeywords);
      }
    }
    
    // Specific GPC category-based concepts
    if (gpcLower.includes('oil') || gpcLower.includes('lubricant')) {
      concepts.push('oil', 'lubricant', 'automotive', 'fluid', 'bottle');
    }
    
    if (gpcLower.includes('beverage') || gpcLower.includes('drink')) {
      concepts.push('beverage', 'drink', 'liquid', 'refreshment', 'bottle');
    }
    
    if (gpcLower.includes('food') || gpcLower.includes('edible')) {
      concepts.push('food', 'edible', 'consumable', 'package', 'nutrition');
    }
    
    if (gpcLower.includes('clean') || gpcLower.includes('detergent')) {
      concepts.push('cleaner', 'cleaning', 'detergent', 'soap', 'household');
    }
  }
  
  // Enhanced packaging concepts based on unit
  if (unit) {
    const unitLower = unit.toLowerCase();
    
    // Volume units suggest liquid products in bottles/containers
    if (['l', 'ml', 'liter', 'litre', 'fl', 'oz', 'gallon'].some(u => unitLower.includes(u))) {
      concepts.push('bottle', 'container', 'liquid', 'fluid', 'packaging');
      
      // Size-specific container concepts
      if (['l', 'liter', 'litre', 'gallon'].some(u => unitLower.includes(u))) {
        concepts.push('large bottle', 'large container', 'gallon', 'jug');
      } else {
        concepts.push('small bottle', 'flask', 'small container');
      }
    }
    
    // Weight units could suggest solid products in boxes/bags
    else if (['kg', 'g', 'gram', 'lb', 'pound', 'oz', 'ounce'].some(u => unitLower.includes(u))) {
      concepts.push('box', 'package', 'container', 'solid', 'packaging');
      
      // Size-specific package concepts
      if (['kg', 'lb', 'pound'].some(u => unitLower.includes(u))) {
        concepts.push('large package', 'large box', 'bag', 'sack');
      } else {
        concepts.push('small package', 'small box', 'packet');
      }
    }
    
    // Quantity units suggest discrete items
    else if (['pc', 'piece', 'unit', 'each', 'ea', 'set'].some(u => unitLower.includes(u))) {
      concepts.push('item', 'product', 'package', 'individual', 'unit');
      
      if (unitLower.includes('set')) {
        concepts.push('set', 'collection', 'kit', 'multiple items');
      }
    }
  }
  
  // Remove duplicates and return unique concepts
  return [...new Set(concepts)];
}

/**
 * Find matches between expected and detected concepts
 * @param {Array} expectedConcepts - List of expected concepts
 * @param {Array} detectedConcepts - List of detected concepts from Clarifai
 * @returns {Array} - Matching concepts with confidence scores
 */
function findConceptMatches(expectedConcepts, detectedConcepts) {
  const matches = [];
  
  // Check for exact and partial matches
  expectedConcepts.forEach(expected => {
    // Convert to lowercase for case-insensitive matching
    const expectedLower = expected.toLowerCase();
    
    // Find exact matches
    const exactMatch = detectedConcepts.find(
      detected => detected.name.toLowerCase() === expectedLower
    );
    
    if (exactMatch) {
      matches.push({
        expected: expected,
        detected: exactMatch.name,
        confidence: exactMatch.confidence,
        matchType: 'exact'
      });
      return;
    }
    
    // Find partial matches (concept is contained within detected concept)
    const partialMatches = detectedConcepts.filter(
      detected => detected.name.toLowerCase().includes(expectedLower) || 
                  expectedLower.includes(detected.name.toLowerCase())
    );
    
    if (partialMatches.length > 0) {
      // Use the partial match with highest confidence
      const bestPartialMatch = partialMatches.reduce(
        (best, current) => current.confidence > best.confidence ? current : best,
        partialMatches[0]
      );
      
      // Calculate match quality based on string similarity
      const matchQuality = calculateStringSimilarity(expectedLower, bestPartialMatch.name.toLowerCase());
      const adjustedConfidence = bestPartialMatch.confidence * matchQuality;
      
      matches.push({
        expected: expected,
        detected: bestPartialMatch.name,
        confidence: adjustedConfidence,
        matchType: 'partial',
        matchQuality: matchQuality
      });
    }
  });
  
  // Look for semantic matches (conceptually related but not textually similar)
  const semanticMatches = findSemanticMatches(expectedConcepts, detectedConcepts, matches);
  matches.push(...semanticMatches);
  
  return matches;
}

/**
 * Calculate string similarity between two strings (simple Levenshtein-inspired measure)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity score between 0 and 1
 */
function calculateStringSimilarity(str1, str2) {
  // If either string contains the other completely, high similarity
  if (str1.includes(str2) || str2.includes(str1)) {
    return 0.9;
  }
  
  // Split into words and check for word-level matches
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  
  // Count matching words
  let matchingWords = 0;
  words1.forEach(word => {
    if (words2.some(w => w === word || w.includes(word) || word.includes(w))) {
      matchingWords++;
    }
  });
  
  // Word-level similarity
  const wordSimilarity = words1.length > 0 ? matchingWords / words1.length : 0;
  
  // Character-level similarity (simplified)
  let commonChars = 0;
  for (let i = 0; i < str1.length; i++) {
    if (str2.includes(str1[i])) {
      commonChars++;
    }
  }
  const charSimilarity = str1.length > 0 ? commonChars / str1.length : 0;
  
  // Combined similarity score with more weight on word-level matches
  return wordSimilarity * 0.7 + charSimilarity * 0.3;
}

/**
 * Find semantic matches between expected and detected concepts
 * @param {Array} expectedConcepts - List of expected concepts
 * @param {Array} detectedConcepts - List of detected concepts
 * @param {Array} existingMatches - Already found matches to avoid duplicates
 * @returns {Array} - Semantic matches found
 */
function findSemanticMatches(expectedConcepts, detectedConcepts, existingMatches) {
  const semanticMatches = [];
  
  // Define semantic relationships between concepts
  const semanticRelationships = {
    // Container-related
    'bottle': ['container', 'packaging', 'plastic', 'glass', 'jar', 'flask'],
    'container': ['bottle', 'packaging', 'box', 'jar', 'can', 'plastic'],
    'package': ['box', 'packaging', 'container', 'carton', 'wrapper'],
    'box': ['package', 'container', 'carton', 'packaging', 'cardboard'],
    
    // Liquid-related
    'liquid': ['fluid', 'water', 'oil', 'beverage', 'drink', 'bottle'],
    'oil': ['lubricant', 'fluid', 'liquid', 'petroleum', 'bottle'],
    'water': ['liquid', 'drink', 'beverage', 'bottle', 'fluid'],
    'beverage': ['drink', 'liquid', 'bottle', 'can', 'water'],
    
    // Product categories
    'food': ['edible', 'grocery', 'snack', 'meal', 'nutrition'],
    'cleaning': ['detergent', 'soap', 'cleaner', 'household'],
    'electronic': ['device', 'gadget', 'technology', 'appliance', 'digital'],
    'clothing': ['apparel', 'garment', 'fashion', 'wear', 'outfit'],
    
    // Other common relationships
    'vehicle': ['car', 'automobile', 'transportation', 'automotive'],
    'plastic': ['synthetic', 'polymer', 'container', 'bottle'],
    'soft drink': ['soda', 'beverage', 'carbonated', 'bottle'],
    'detergent': ['soap', 'cleaner', 'washing', 'laundry']
  };
  
  // Check if any expected concepts have semantic relationships with detected concepts
  expectedConcepts.forEach(expected => {
    // Skip if already matched
    if (existingMatches.some(m => m.expected === expected)) {
      return;
    }
    
    const expectedLower = expected.toLowerCase();
    
    // Check if this concept has defined semantic relationships
    if (semanticRelationships[expectedLower]) {
      const relatedConcepts = semanticRelationships[expectedLower];
      
      // Find detected concepts that are semantically related
      const semanticMatchesForConcept = detectedConcepts.filter(detected => 
        relatedConcepts.includes(detected.name.toLowerCase())
      );
      
      if (semanticMatchesForConcept.length > 0) {
        // Use the semantic match with highest confidence
        const bestMatch = semanticMatchesForConcept.reduce(
          (best, current) => current.confidence > best.confidence ? current : best,
          semanticMatchesForConcept[0]
        );
        
        semanticMatches.push({
          expected: expected,
          detected: bestMatch.name,
          confidence: bestMatch.confidence * 0.7, // Penalty for semantic match
          matchType: 'semantic',
          relationshipType: 'defined'
        });
      }
    }
    
    // Check reverse relationships (detected concept in semanticRelationships)
    detectedConcepts.forEach(detected => {
      const detectedLower = detected.name.toLowerCase();
      
      if (semanticRelationships[detectedLower] && 
          semanticRelationships[detectedLower].includes(expectedLower)) {
        
        semanticMatches.push({
          expected: expected,
          detected: detected.name,
          confidence: detected.confidence * 0.7, // Penalty for semantic match
          matchType: 'semantic',
          relationshipType: 'reverse'
        });
      }
    });
  });
  
  // Remove duplicates (same expected+detected pairs)
  const uniqueMatches = [];
  semanticMatches.forEach(match => {
    if (!uniqueMatches.some(m => 
      m.expected === match.expected && m.detected === match.detected
    )) {
      uniqueMatches.push(match);
    }
  });
  
  return uniqueMatches;
}

/**
 * Calculate verification score based on concept matches
 * @param {Array} matches - List of matching concepts
 * @param {Array} expectedConcepts - List of expected concepts
 * @returns {Object} - Verification score and confidence
 */
function calculateVerificationScore(matches, expectedConcepts) {
  if (expectedConcepts.length === 0) {
    return { score: 0, confidence: 0 };
  }
  
  // Calculate match ratio (percentage of expected concepts that were matched)
  const matchRatio = matches.length / expectedConcepts.length;
  
  // Calculate average confidence of matches with weighting by match type
  let weightedConfidenceSum = 0;
  matches.forEach(match => {
    // Apply weights based on match type
    const weight = match.matchType === 'exact' ? 1.0 : 
                   match.matchType === 'partial' ? 0.8 : 
                   match.matchType === 'semantic' ? 0.6 : 0.5;
    
    weightedConfidenceSum += match.confidence * weight;
  });
  
  const avgConfidence = matches.length > 0 ? weightedConfidenceSum / matches.length : 0;
  
  // Enhanced scoring that rewards having at least some good matches
  // This makes the verification more lenient for partial matches
  let score = 0;
  
  // Basic score from match ratio and confidence
  const basicScore = matchRatio * 0.6 + avgConfidence * 0.4;
  
  // Bonus for having high-quality matches (exact matches with high confidence)
  const exactMatchCount = matches.filter(m => 
    m.matchType === 'exact' && m.confidence > 0.8
  ).length;
  
  const exactMatchBonus = Math.min(0.2, exactMatchCount * 0.1);
  
  // Apply thresholds for minimum validation
  if (matches.length >= 2 && avgConfidence > 0.7) {
    // At least 2 good matches is enough for validation
    score = Math.max(0.65, basicScore);
  } else if (exactMatchCount >= 1) {
    // Even one very good exact match provides minimum validation
    score = Math.max(0.65, basicScore);
  } else {
    score = basicScore;
  }
  
  // Apply exact match bonus
  score = Math.min(1.0, score + exactMatchBonus);
  
  return {
    score: score,
    confidence: avgConfidence,
    matchRatio: matchRatio,
    exactMatchCount: exactMatchCount,
    partialMatchCount: matches.filter(m => m.matchType === 'partial').length,
    semanticMatchCount: matches.filter(m => m.matchType === 'semantic').length
  };
}

/**
 * Advanced image analysis function to detect product characteristics and inconsistencies
 * Uses NLP-inspired techniques to validate image content against product metadata
 * @param {string} imageUrl - URL of the product image
 * @param {string} brick - Brick classification string
 * @param {string} unit - Unit of measurement code
 * @param {string} productName - Optional product name for additional context
 * @returns {Object} - Detailed analysis results with confidence scores and suggestions
 */
function analyzeProductImage(imageUrl, brick, unit, productName = '') {
  
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

  // Analyze Brick and unit compatibility with image
  const brickLower = (brick || '').toLowerCase();
  const unitLower = (unit || '').toLowerCase();
  const productNameLower = (productName || '').toLowerCase();
  
  // Advanced NLP-inspired pattern detection
  // 1. Detect product category from Brick and product name
  let detectedCategoryFromMetadata = null;
  let highestMatchScore = 0;
  
  // Calculate match score using weighted matching
  for (const [category, patterns] of Object.entries(imageValidationPatterns)) {
    // 1.5x weight for Brick matches, 1.0x for product name matches
    const brickMatchScore = patterns.keywords.reduce((score, keyword) => 
      score + (brickLower.includes(keyword) ? 1.5 : 0), 0);
    
    const nameMatchScore = patterns.keywords.reduce((score, keyword) => 
      score + (productNameLower.includes(keyword) ? 1.0 : 0), 0);
    
    const totalScore = brickMatchScore + nameMatchScore;
    
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
        brickProvided: brick ? 'yes' : 'no',
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
      suggestion: `Ensure Brick classification accurately describes your product and image clearly shows the product`,
      analysis: {
        imageComponents: imageComponents.filter(comp => comp.length > 2),
        brickProvided: brick ? 'yes' : 'no',
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
    
    // Pre-fetch Brick data for common product categories
    const prefetchedGpcClasses = await prefetchGpcClasses();
    const prefetchedBricks = await prefetchBricks();
    
    // Debug Bricks table to help diagnose issues
    const bricksDebugInfo = await debugBricksTable();
    console.log('Bricks data debug info available:', bricksDebugInfo ? 'yes' : 'no');
    
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
    
    // Fetch Bricks data from GS1DB
    let bricks = [];
    if (gs1DB && gs1DB.bricks) {
      bricks = await safeDbQuery(() => gs1DB.bricks.findMany({
        where: {
          OR: [
            { bricks_code: { in: gpcCodes.filter(Boolean) } },
            { id: { in: gpcCodes.filter(Boolean).map(code => parseFloat(code)).filter(num => !isNaN(num)) } }
          ]
        }
      }));
    } else if (gs1DB && gs1DB.$queryRaw) {
      try {
        // Fallback to raw query if Prisma model is not available
        bricks = await gs1DB.$queryRaw`
          SELECT * FROM bricks 
          WHERE bricks_code IN (${gpcCodes.join(',')}) OR id IN (${gpcCodes.join(',')})
        `;
      } catch (error) {
        console.log('Bricks table query error:', error.message);
        // If error occurs, it might be that the table doesn't exist or has a different structure
      }
    }
    
    // Create lookup tables for brands, units and bricks
    const brandLookup = {};
    brands.forEach(brand => {
      brandLookup[brand.name] = brand;
    });
    
    const unitLookup = {};
    units.forEach(unit => {
      // Ensure we're using the unit_code from the database record
      if (unit && unit.unit_code) {
        unitLookup[unit.unit_code.trim().toUpperCase()] = unit;
        // Also add lowercase version for flexible matching
        unitLookup[unit.unit_code.trim().toLowerCase()] = unit;
      }
    });
    
    const brickLookup = {};
    bricks.forEach(brick => {
      brickLookup[brick.bricks_code || brick.id] = brick;
    });
    
    // Process each product and add verification results using AI-based logic
    const verifiedProducts = await Promise.all(products.map(async product => {
      // Look up the corresponding brand, unit, and brick data
      const brandData = product.BrandName ? brandLookup[product.BrandName] : null;
      
      // Get unit data with more flexible matching
      let unitData = null;
      if (product.unit) {
        const unitCode = product.unit.trim();
        // Try to find unit data with various case formats
        unitData = unitLookup[unitCode] || 
                   unitLookup[unitCode.toUpperCase()] || 
                   unitLookup[unitCode.toLowerCase()];
      }
      
      // Get the actual brick data from our lookup
      const brickData = product.gpc ? brickLookup[product.gpc] : null;
      
      // Parse brick and unit data
      const parsedBrick = parseBrick(product.gpc);
      const parsedUnit = parseUnit(product.unit, unitData);
      
      // Enhanced product with parsed data
      const enhancedProduct = {
        ...product,
        parsedData: {
          brick: parsedBrick,
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
        const compatibilityResult = checkBrickUnitCompatibility(
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
        
        // Get the parsed Brick description - use this for more accurate categorization
        const brickDescription = parsedBrick.description ? parsedBrick.description.toLowerCase() : '';
        
        // Use advanced product classification with enhanced Brick data
        const productClassification = classifyProductType(
          product.productnameenglish,
          product.BrandName,
          brickDescription || product.gpc // Prefer the parsed description
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
              } else if (expectedUnit === 'length') {
                recommendedUnits = ['M', 'CM', 'MM'];
                unitExplanation = 'length units such as meters or centimeters';
              } else if (expectedUnit === 'area') {
                recommendedUnits = ['M2', 'SQM', 'SQFT'];
                unitExplanation = 'area units such as square meters or square feet';
              }
              
              verification.aiSuggestions.push({
                field: 'unit',
                suggestion: `Based on our advanced analysis, your product "${product.productnameenglish}" (${detectedCategory.replace('_', ' ')}) should use ${unitExplanation} instead of ${unitType} units. Using the proper unit type ensures accurate representation and compliance with industry standards.`,
                importance: 'High',
                recommended_units: recommendedUnits,
                confidence: classificationConfidence.toFixed(0) + '%',
                unit_mapping: {
                  // Add unit mapping to help client with unit selection
                  volume: ['L', 'ML', 'CL', 'FL OZ', 'GAL'],
                  weight: ['KG', 'G', 'MG', 'LB', 'OZ'],
                  quantity: ['PC', 'EA', 'UNIT', 'SET', 'PAIR'],
                  length: ['M', 'CM', 'MM', 'FT', 'IN'],
                  area: ['M2', 'SQM', 'SQFT', 'ACRE', 'HA']
                },
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
      
      // If product has image, verify it with Clarifai
      if (product.front_image) {
        try {
          // Perform Clarifai-based image verification
          const clarifaiVerification = await verifyClarifaiImage(
            product.front_image,
            product.productnameenglish,
            product.gpc,
            product.unit
          );
          
          // Add Clarifai verification results to the verification object
          verification.clarifaiVerification = clarifaiVerification;
          
          // If Clarifai verification fails, add issue
          if (!clarifaiVerification.valid) {
            verification.isValid = false;
            verification.verificationStatus = 'unverified';
            verification.issues.push({
              rule: 'Image Content Verification',
              severity: 'high',
              message: clarifaiVerification.message || 'Image content does not match product description',
              processedImageUrl: clarifaiVerification.imageUrl // Include the processed URL for reference
            });
            
            // Add AI suggestion for image mismatch
            verification.aiSuggestions.push({
              field: 'front_image',
              suggestion: `The product image doesn't clearly show a ${product.productnameenglish}. Please upload an image that clearly shows the product matching its description. We expected to see ${clarifaiVerification.expectedConcepts.slice(0, 5).join(', ')} but detected ${clarifaiVerification.detectedConcepts.slice(0, 3).map(c => c.name).join(', ')}.`,
              importance: 'High'
            });
          } else {
            // If verification passes, add a positive note
            verification.positivePoints = verification.positivePoints || [];
            verification.positivePoints.push({
              rule: 'Image Content Verification',
              message: 'Product image correctly matches the product description',
              score: Math.round(clarifaiVerification.score * 100)
            });
          }
        } catch (clarifaiError) {
          console.error('Clarifai verification error:', clarifaiError);
          // Don't fail verification on Clarifai errors, just log them
        }
      }
      
      // Return the product with all the verification data
      return {
        ...enhancedProduct,
        brandData,       // Include the brand data
        unitData,        // Include the unit data
        brickData,       // Include the Brick data
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
  if (!gs1DB || !gs1DB.bricks) {
    // Return fallback suggestions if database is not available
    return getFallbackBrickSuggestions(category);
  }
  
  try {
    // Convert category to search terms
    const searchTerms = getCategorySearchTerms(category);
    
    // Build OR conditions for each search term
    const orConditions = searchTerms.map(term => ({
      OR: [
        { bricks_title: { contains: term } },
        { bricks_definition_includes: { contains: term } }
      ]
    }));
    
    // Fetch matching GPC classes
    const matchingClasses = await gs1DB.bricks.findMany({
      where: {
        OR: orConditions
      },
      select: {
        bricks_code: true,
        bricks_title: true
      },
      take: 5 // Limit to 5 most relevant results
    });
    
    // Return just the class titles
    const classTitles = matchingClasses.map(cls => cls.bricks_title).filter(Boolean);
    
    // If no matches, return fallback suggestions
    if (classTitles.length === 0) {
      return getFallbackBrickSuggestions(category);
    }
    
    return classTitles;
  } catch (error) {
    console.error('Error fetching Bricks data:', error);
    return getFallbackBrickSuggestions(category);
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
  if (!gs1DB || !gs1DB.bricks) {
    console.log('GS1DB or bricks model not available');
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
      console.log(`Fetching Bricks data for ${category} with terms: ${terms.join(', ')}`);
      
      try {
        // Try using raw SQL query which might be more reliable with text search
        const rawQuery = `
          SELECT bricks_code, bricks_title 
          FROM bricks 
          WHERE ${terms.map(term => `bricks_title LIKE '%${term}%'`).join(' OR ')}
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
              { bricks_title: { contains: term } }
            ]
          }));
          
          matchingClasses = await gs1DB.bricks.findMany({
            where: {
              OR: orConditions
            },
            select: {
              bricks_code: true,
              bricks_title: true
            },
            take: 5
          });
          
          console.log(`Prisma query found ${matchingClasses.length} matches for ${category}`);
        }
        
        // Store results
        results[category] = matchingClasses.map(cls => cls.bricks_title).filter(Boolean);
        
        console.log(`Brick titles for ${category}:`, results[category]);
        
        // If no results, use fallback
        if (!results[category] || results[category].length === 0) {
          console.log(`No Brick titles found for ${category}, using fallback`);
          results[category] = getFallbackBrickSuggestions(category);
        }
      } catch (categoryError) {
        console.error(`Error fetching Brick data for ${category}:`, categoryError);
        results[category] = getFallbackBrickSuggestions(category);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error pre-fetching Brick data:', error);
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
    if (gs1DB && gs1DB.bricks) {
      console.log(`No pre-fetched classes, attempting direct synchronous query`);
      
      // For direct sync access, use fallback values but log the issue
      console.log(`Cannot perform async DB query during verification, using fallback GPC suggestions`);
    }
    
    // Use fallback suggestions as a last resort
    return getFallbackBrickSuggestions(detectedCategory);
  } catch (error) {
    console.error('Error getting GPC suggestions:', error);
    return getFallbackBrickSuggestions(detectedCategory);
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
    
    console.log('=== Bricks Table Debug ===');
    
    // Check if bricks table exists and has expected structure
    try {
      // Try to get the first few records to check table structure
      const sample = await gs1DB.$queryRaw`SELECT TOP 5 * FROM bricks`;
      console.log('Sample Bricks data:', sample);
      
      // If that works, count total records
      const count = await gs1DB.$queryRaw`SELECT COUNT(*) as total FROM bricks`;
      console.log('Total Bricks records:', count);
      
      // Check if there are records with "oil" in the title (for our test case)
      const oilSample = await gs1DB.$queryRaw`SELECT TOP 5 * FROM bricks WHERE bricks_title LIKE '%oil%'`;
      console.log('Sample oil-related Bricks data:', oilSample);
      
      return {
        tableExists: true,
        sampleData: sample,
        totalCount: count,
        oilSample: oilSample
      };
    } catch (error) {
      console.error('Error querying bricks table:', error.message);
      
      // Try alternate query syntax for different SQL dialects
      try {
        const sample = await gs1DB.$queryRaw`SELECT * FROM bricks LIMIT 5`;
        console.log('Sample Bricks data (alternate syntax):', sample);
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
    console.error('Bricks table debug error:', error);
    return {
      error: error.message
    };
  }
}

/**
 * Helper function to fetch relevant Brick data from the database based on keywords
 * @param {string} category - The detected product category
 * @returns {Promise<Array>} - Array of matching Brick titles
 */
async function fetchRelevantBricks(category) {
  if (!gs1DB || !gs1DB.bricks) {
    // Return fallback suggestions if database is not available
    return getFallbackBrickSuggestions(category);
  }
  
  try {
    // Convert category to search terms
    const searchTerms = getCategorySearchTerms(category);
    
    // Build OR conditions for each search term
    const orConditions = searchTerms.map(term => ({
      OR: [
        { bricks_title: { contains: term } },
        { bricks_definition_includes: { contains: term } }
      ]
    }));
    
    // Fetch matching Brick data
    const matchingBricks = await gs1DB.bricks.findMany({
      where: {
        OR: orConditions
      },
      select: {
        bricks_code: true,
        bricks_title: true
      },
      take: 5 // Limit to 5 most relevant results
    });
    
    // Return just the brick titles
    const brickTitles = matchingBricks.map(brick => brick.bricks_title).filter(Boolean);
    
    // If no matches, return fallback suggestions
    if (brickTitles.length === 0) {
      return getFallbackBrickSuggestions(category);
    }
    
    return brickTitles;
  } catch (error) {
    console.error('Error fetching Bricks data:', error);
    return getFallbackBrickSuggestions(category);
  }
}

/**
 * Pre-fetch common Brick data for different product categories 
 * to avoid async issues in the main processing loop
 */
async function prefetchBricks() {
  if (!gs1DB || !gs1DB.bricks) {
    console.log('GS1DB or bricks model not available');
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
      console.log(`Fetching Bricks data for ${category} with terms: ${terms.join(', ')}`);
      
      try {
        // Try using raw SQL query which might be more reliable with text search
        const rawQuery = `
          SELECT bricks_code, bricks_title 
          FROM bricks 
          WHERE ${terms.map(term => `bricks_title LIKE '%${term}%'`).join(' OR ')}
          LIMIT 5
        `;
        
        let matchingBricks = [];
        
        try {
          matchingBricks = await gs1DB.$queryRaw(rawQuery);
          console.log(`Raw query found ${matchingBricks.length} matches for ${category}`);
        } catch (sqlError) {
          console.error('Raw SQL query failed:', sqlError.message);
          
          // Fall back to Prisma query
          const orConditions = terms.map(term => ({
            OR: [
              { bricks_title: { contains: term } }
            ]
          }));
          
          matchingBricks = await gs1DB.bricks.findMany({
            where: {
              OR: orConditions
            },
            select: {
              bricks_code: true,
              bricks_title: true
            },
            take: 5
          });
          
          console.log(`Prisma query found ${matchingBricks.length} matches for ${category}`);
        }
        
        // Store results
        results[category] = matchingBricks.map(brick => brick.bricks_title).filter(Boolean);
        
        console.log(`Brick titles for ${category}:`, results[category]);
        
        // If no results, use fallback
        if (!results[category] || results[category].length === 0) {
          console.log(`No Brick titles found for ${category}, using fallback`);
          results[category] = getFallbackBrickSuggestions(category);
        }
      } catch (categoryError) {
        console.error(`Error fetching Brick data for ${category}:`, categoryError);
        results[category] = getFallbackBrickSuggestions(category);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error pre-fetching Brick data:', error);
    return {};
  }
}

/**
 * Debug function to verify Bricks table structure and sample data
 * This helps identify issues with the database connection or table schema
 */
async function debugBricksTable() {
  try {
    if (!gs1DB) {
      console.error('GS1DB connection not available for debugging');
      return null;
    }
    
    console.log('=== Bricks Table Debug ===');
    
    // Check if bricks table exists and has expected structure
    try {
      // Try to get the first few records to check table structure
      const sample = await gs1DB.$queryRaw`SELECT TOP 5 * FROM bricks`;
      console.log('Sample Bricks data:', sample);
      
      // If that works, count total records
      const count = await gs1DB.$queryRaw`SELECT COUNT(*) as total FROM bricks`;
      console.log('Total Bricks records:', count);
      
      // Check if there are records with "oil" in the title (for our test case)
      const oilSample = await gs1DB.$queryRaw`SELECT TOP 5 * FROM bricks WHERE bricks_title LIKE '%oil%'`;
      console.log('Sample oil-related Bricks data:', oilSample);
      
      return {
        tableExists: true,
        sampleData: sample,
        totalCount: count,
        oilSample: oilSample
      };
    } catch (error) {
      console.error('Error querying bricks table:', error.message);
      
      // Try alternate query syntax for different SQL dialects
      try {
        const sample = await gs1DB.$queryRaw`SELECT * FROM bricks LIMIT 5`;
        console.log('Sample Bricks data (alternate syntax):', sample);
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
    console.error('Bricks table debug error:', error);
    return {
      error: error.message
    };
  }
}

/**
 * Get fallback Brick title suggestions when database lookup fails
 */
function getFallbackBrickSuggestions(category) {
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
 * Direct Brick lookup for product verification
 * This should be called during product verification for more accurate suggestions
 * @param {object} bricks - The prefetched Brick data
 * @param {string} detectedCategory - The detected product category
 * @param {string} productName - The product name for additional context
 * @returns {Array} - Array of matching Brick titles
 */
function getDirectBrickSuggestions(bricks, detectedCategory, productName) {
  try {
    console.log(`Getting direct Brick suggestions for ${detectedCategory} and product "${productName}"`);
    
    // First check if we have pre-fetched Brick data for this category
    if (bricks && bricks[detectedCategory] && bricks[detectedCategory].length > 0) {
      console.log(`Found ${bricks[detectedCategory].length} pre-fetched Brick records for ${detectedCategory}`);
      return bricks[detectedCategory];
    }
    
    // If we don't have pre-fetched data, try to query directly if we have gs1DB available
    if (gs1DB && gs1DB.bricks) {
      console.log(`No pre-fetched data, attempting direct synchronous query`);
      
      // For direct sync access, use fallback values but log the issue
      console.log(`Cannot perform async DB query during verification, using fallback Brick suggestions`);
    }
    
    // Use fallback suggestions as a last resort
    return getFallbackBrickSuggestions(detectedCategory);
  } catch (error) {
    console.error('Error getting Brick suggestions:', error);
    return getFallbackBrickSuggestions(detectedCategory);
  }
}

