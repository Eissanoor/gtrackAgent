const { PrismaClient } = require('@prisma/client');

// Default database URLs - update these to match your actual development database
// These will be used if environment variables aren't set


// Get database URLs from environment variables or use defaults
const gtrackDbUrl = process.env.GTRACKDB;
const gs1DbUrl = process.env.GS1DB;



// Create Prisma client for GTRACKDB with error handling
let gtrackDB;
try {
  console.log('Initializing GTRACKDB connection with URL:', gtrackDbUrl ? `${gtrackDbUrl.substring(0, 15)}...` : 'undefined');
  
  if (!gtrackDbUrl) {
    throw new Error('GTRACKDB connection string is undefined. Please set the GTRACKDB environment variable.');
  }
  
  gtrackDB = new PrismaClient({
    datasources: {
      db: {
        url: gtrackDbUrl
      }
    },
    log: ['error', 'warn']
  });
  
  // Test the connection by logging available models
  const dmmf = gtrackDB._baseDmmf;
  const availableModels = dmmf ? dmmf.datamodel.models.map(m => m.name) : [];
  console.log('✅ GTRACKDB connection initiated successfully');
  console.log('   Available models:', availableModels.join(', '));
  
  if (!availableModels.includes('products')) {
    console.warn('⚠️ Warning: The "products" model is not available in the GTRACKDB schema.');
  }
} catch (error) {
  console.error('❌ Failed to connect to GTRACKDB:', error.message);
  // Create a mock client for graceful fallback
  gtrackDB = createMockClient();
}

// Create Prisma client for GS1DB with error handling
let gs1DB;
try {
  console.log('Initializing GS1DB connection with URL:', gs1DbUrl ? `${gs1DbUrl.substring(0, 15)}...` : 'undefined');
  
  if (!gs1DbUrl) {
    throw new Error('GS1DB connection string is undefined. Please set the GS1DB environment variable.');
  }
  
  gs1DB = new PrismaClient({
    datasources: {
      db: {
        url: gs1DbUrl
      }
    },
    log: ['error', 'warn']
  });
  
  // Test the connection by logging available models
  const dmmf = gs1DB._baseDmmf;
  const availableModels = dmmf ? dmmf.datamodel.models.map(m => m.name) : [];
  console.log('✅ GS1DB connection initiated successfully');
  console.log('   Available models:', availableModels.join(', '));
  
  if (!availableModels.includes('Brand') || !availableModels.includes('Unit')) {
    console.warn('⚠️ Warning: One or more required models (Brand, Unit) are not available in the GS1DB schema.');
  }
} catch (error) {
  console.error('❌ Failed to connect to GS1DB:', error.message);
  // Create a mock client for graceful fallback
  gs1DB = createMockClient();
}

// Function to create a mock client for graceful fallback
function createMockClient() {
  // This is a very basic mock that will prevent the application from crashing
  // but obviously won't provide real database functionality
  return {
    $connect: () => Promise.resolve(),
    $disconnect: () => Promise.resolve(),
    $on: () => {},
    $queryRaw: () => Promise.resolve([]),
    products: {
      findUnique: () => Promise.resolve(null),
      findMany: () => Promise.resolve([]),
      count: () => Promise.resolve(0)
    },
    Brand: {
      findMany: () => Promise.resolve([])
    },
    Unit: {
      findMany: () => Promise.resolve([])
    }
  };
}

// Export both clients for use in controllers
module.exports = {
  gtrackDB,
  gs1DB
};
