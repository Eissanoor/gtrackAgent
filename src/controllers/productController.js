const prisma = require('../models');

/**
 * Get all products with their relationships, including verification results
 * This endpoint is paginated and includes AI verification for each product
 */
exports.getAllProducts = async (req, res) => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const skip = (page - 1) * pageSize;
    
    // Get total count for pagination
    const totalCount = await prisma.product.count();
    
    // Fetch paginated products with their relationships
    const products = await prisma.product.findMany({
      skip,
      take: pageSize,
      include: {
        brand: true,
        unit: true,
        gcp: true
      }
    });
    
    // Process each product and add verification results
    const verifiedProducts = products.map(product => {
      // Skip verification if relationships are missing
      if (!product.brand || !product.unit || !product.gcp) {
        return {
          ...product,
          verification: {
            isValid: false,
            issues: [{
              rule: 'Missing Relationships',
              message: 'Product is missing brand, unit, or GCP relationship'
            }],
            missing: {
              brand: !product.brand,
              unit: !product.unit,
              gcp: !product.gcp
            }
          }
        };
      }
      
      // Verification logic - same as validateProductRelationship function
      let validationResults = {
        isValid: true,
        issues: []
      };
      
      // RULE 1: Brand category should match GCP category
      if (product.brand.category !== product.gcp.category) {
        validationResults.isValid = false;
        validationResults.issues.push({
          rule: 'Category Match',
          message: `Brand category "${product.brand.category}" does not match GCP category "${product.gcp.category}"`
        });
      }
      
      // RULE 2: Check if unit type is appropriate for the product category
      const liquidCategories = ['oil', 'beverage', 'liquid', 'chemical'];
      const weightCategories = ['food', 'grain', 'powder', 'solid'];
      const quantityCategories = ['electronics', 'appliance', 'item', 'discrete'];
      
      // Category-based unit validation
      if (liquidCategories.includes(product.brand.category.toLowerCase())) {
        // Liquid products should use volume units
        if (product.unit.type !== 'volume') {
          validationResults.isValid = false;
          validationResults.issues.push({
            rule: 'Unit Compatibility',
            message: `${product.brand.category} products should use volume units (like liter), but got ${product.unit.type} unit (${product.unit.name})`
          });
        }
      } else if (weightCategories.includes(product.brand.category.toLowerCase())) {
        // Weight products should use weight units
        if (product.unit.type !== 'weight') {
          validationResults.isValid = false;
          validationResults.issues.push({
            rule: 'Unit Compatibility',
            message: `${product.brand.category} products should use weight units (like kg), but got ${product.unit.type} unit (${product.unit.name})`
          });
        }
      } else if (quantityCategories.includes(product.brand.category.toLowerCase())) {
        // Discrete products should use quantity units
        if (product.unit.type !== 'quantity') {
          validationResults.isValid = false;
          validationResults.issues.push({
            rule: 'Unit Compatibility',
            message: `${product.brand.category} products should use quantity units (like piece), but got ${product.unit.type} unit (${product.unit.name})`
          });
        }
      }
      
      return {
        ...product,
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
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * Validate product relationship between brand, unit, and GCP.
 * This function acts as an AI agent to verify if the combinations make sense.
 * The function automatically fetches product data and analyzes if the relationships are valid.
 * For example: 
 * - If brand is oil-related, GCP should also be in the oil category
 * - If product is oil-based, unit should be liquid-based (like liters)
 */
exports.validateProductRelationship = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing product ID', 
        message: 'Please provide a product ID' 
      });
    }

    // Fetch the product with its relationships
    const product = await prisma.product.findUnique({
      where: { id: Number(id) },
      include: {
        brand: true,
        unit: true,
        gcp: true
      }
    });
    
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    // Check if product has all required relationships
    if (!product.brand || !product.unit || !product.gcp) {
      return res.status(400).json({ 
        success: false, 
        error: 'Incomplete product data', 
        message: 'Product must have brand, unit, and GCP associations',
        missing: {
          brand: !product.brand,
          unit: !product.unit,
          gcp: !product.gcp
        }
      });
    }
    
    const brand = product.brand;
    const unit = product.unit;
    const gcp = product.gcp;
    
    // Validation results container
    let validationResults = {
      isValid: true,
      issues: []
    };
    
    // RULE 1: Brand category should match GCP category
    if (brand.category !== gcp.category) {
      validationResults.isValid = false;
      validationResults.issues.push({
        rule: 'Category Match',
        message: `Brand category "${brand.category}" does not match GCP category "${gcp.category}"`
      });
    }
    
    // RULE 2: Check if unit type is appropriate for the product category
    const liquidCategories = ['oil', 'beverage', 'liquid', 'chemical'];
    const weightCategories = ['food', 'grain', 'powder', 'solid'];
    const quantityCategories = ['electronics', 'appliance', 'item', 'discrete'];
    
    // Category-based unit validation
    if (liquidCategories.includes(brand.category.toLowerCase())) {
      // Liquid products should use volume units
      if (unit.type !== 'volume') {
        validationResults.isValid = false;
        validationResults.issues.push({
          rule: 'Unit Compatibility',
          message: `${brand.category} products should use volume units (like liter), but got ${unit.type} unit (${unit.name})`
        });
      }
    } else if (weightCategories.includes(brand.category.toLowerCase())) {
      // Weight products should use weight units
      if (unit.type !== 'weight') {
        validationResults.isValid = false;
        validationResults.issues.push({
          rule: 'Unit Compatibility',
          message: `${brand.category} products should use weight units (like kg), but got ${unit.type} unit (${unit.name})`
        });
      }
    } else if (quantityCategories.includes(brand.category.toLowerCase())) {
      // Discrete products should use quantity units
      if (unit.type !== 'quantity') {
        validationResults.isValid = false;
        validationResults.issues.push({
          rule: 'Unit Compatibility',
          message: `${brand.category} products should use quantity units (like piece), but got ${unit.type} unit (${unit.name})`
        });
      }
    }
    
    // Return validation result
    if (validationResults.isValid) {
      return res.json({
        success: true,
        message: 'Product relationship is valid',
        data: {
          brand,
          unit,
          gcp
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Product relationship is invalid',
        issues: validationResults.issues,
        data: {
          brand,
          unit,
          gcp
        }
      });
    }
  } catch (error) {
    console.error('Error validating product relationship:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
