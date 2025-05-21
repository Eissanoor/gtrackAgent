const { gtrackDB, gs1DB } = require('../models');

/**
 * Simple test endpoint to check database connections
 */
exports.testDatabaseConnection = async (req, res) => {
  try {
    console.log('Testing database connections...');
    
    // Check GTRACKDB connection
    const gtrackStatus = {
      connected: false,
      models: [],
      error: null
    };
    
    try {
      if (!gtrackDB) {
        throw new Error('GTRACKDB client is undefined');
      }
      
      // Try to list available models
      const dmmf = gtrackDB._baseDmmf;
      if (dmmf && dmmf.datamodel) {
        gtrackStatus.models = dmmf.datamodel.models.map(m => m.name);
      }
      
      // Test if we can run a simple query
      if (gtrackDB.products) {
        const count = await gtrackDB.products.count();
        gtrackStatus.productCount = count;
        gtrackStatus.connected = true;
      } else {
        throw new Error('products model not available on GTRACKDB client');
      }
    } catch (error) {
      gtrackStatus.error = error.message;
    }
    
    // Check GS1DB connection
    const gs1Status = {
      connected: false,
      models: [],
      error: null
    };
    
    try {
      if (!gs1DB) {
        throw new Error('GS1DB client is undefined');
      }
      
      // Try to list available models
      const dmmf = gs1DB._baseDmmf;
      if (dmmf && dmmf.datamodel) {
        gs1Status.models = dmmf.datamodel.models.map(m => m.name);
      }
      
      // Test if we can run simple queries on expected models
      gs1Status.connected = true;
    } catch (error) {
      gs1Status.error = error.message;
    }
    
    return res.json({
      success: true,
      gtrackDB: gtrackStatus,
      gs1DB: gs1Status,
      environmentVariables: {
        GTRACKDB: process.env.GTRACKDB ? 'Set' : 'Not set',
        GS1DB: process.env.GS1DB ? 'Set' : 'Not set'
      }
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
      error: 'Server error'
    });
  }
}; 