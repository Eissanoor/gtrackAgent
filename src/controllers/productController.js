const prisma = require('../models');

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
    
    // Process each product and add verification results
    const verifiedProducts = products.map(product => {
      // Look up the corresponding brand, unit, and GPC data
      const brandData = product.BrandName ? brandLookup[product.BrandName] : null;
      const unitData = product.unit ? unitLookup[product.unit] : null;
      
      // Get the actual GPC data from our lookup
      const gpcData = product.gpc ? gpcLookup[product.gpc] : null;
      
      // Skip verification if relationships are missing
      if (!brandData || !unitData || !product.gpc) {
        return {
          ...product,
          brandData,  // Add the actual brand data
          unitData,   // Add the actual unit data
          gpcData,    // Add the GPC data
          verification: {
            isValid: false,
            issues: [{
              rule: 'Missing Relationships',
              message: 'Product is missing brand, unit, or GPC relationship'
            }],
            missing: {
              brand: !brandData,
              unit: !unitData,
              gpc: !product.gpc
            }
          }
        };
      }
      
      // Verification logic for product relationships
      let validationResults = {
        isValid: true,
        issues: []
      };
      
      // RULE 1: If we have brand categories and GPC classes with categories, they should match
      // Get the category from the appropriate field based on your data structure
      const brandCategory = brandData && brandData.category;
      const gpcCategory = gpcData && (gpcData.category || gpcData.class_title);
      
      if (brandCategory && gpcCategory && 
          !brandCategory.toLowerCase().includes(gpcCategory.toLowerCase()) && 
          !gpcCategory.toLowerCase().includes(brandCategory.toLowerCase())) {
        validationResults.isValid = false;
        validationResults.issues.push({
          rule: 'Category Match',
          message: `Brand category "${brandCategory}" does not match GPC category "${gpcCategory}"`
        });
      }
      
      // RULE 2: Check if unit type is appropriate for the product category
      const liquidCategories = ['oil', 'beverage', 'liquid', 'chemical'];
      const weightCategories = ['food', 'grain', 'powder', 'solid'];
      const quantityCategories = ['electronics', 'appliance', 'item', 'discrete'];
      
      // Get unit type - we'll need to infer this from unit_code or unit_name
      // since there's no explicit type field in your unit table
      const unitType = inferUnitType(unitData);
      // Get brand category for use in unit compatibility check
      const brandCategoryLower = brandData && brandData.category ? brandData.category.toLowerCase() : '';
      
      // Category-based unit validation
      if (brandCategoryLower && unitType) {
        if (liquidCategories.includes(brandCategoryLower)) {
          // Liquid products should use volume units
          if (unitType !== 'volume') {
            validationResults.isValid = false;
            validationResults.issues.push({
              rule: 'Unit Compatibility',
              message: `${brandCategoryLower} products should use volume units (like liter), but got ${unitType} unit (${unitData.unit_name})`
            });
          }
        } else if (weightCategories.includes(brandCategoryLower)) {
          // Weight products should use weight units
          if (unitType !== 'weight') {
            validationResults.isValid = false;
            validationResults.issues.push({
              rule: 'Unit Compatibility',
              message: `${brandCategoryLower} products should use weight units (like kg), but got ${unitType} unit (${unitData.unit_name})`
            });
          }
        } else if (quantityCategories.includes(brandCategoryLower)) {
          // Discrete products should use quantity units
          if (unitType !== 'quantity') {
            validationResults.isValid = false;
            validationResults.issues.push({
              rule: 'Unit Compatibility',
              message: `${brandCategoryLower} products should use quantity units (like piece), but got ${unitType} unit (${unitData.unit_name})`
            });
          }
        }
      }
      
      return {
        ...product,
        brandData,       // Include the brand data
        unitData,        // Include the unit data
        gpcData,         // Include the GPC data
        verification: validationResults
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
