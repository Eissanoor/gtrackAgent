const { PrismaClient } = require('@prisma/client');

// Default database URLs - update these to match your actual development database
// These will be used if environment variables aren't set


// Get database URLs from environment variables or use defaults
const gtrackDbUrl = process.env.GTRACKDB;
const gs1DbUrl = process.env.GS1DB;

// Create Prisma client for GTRACKDB with error handling
let gtrackDB;
try {
  gtrackDB = new PrismaClient({
    datasources: {
      db: {
        url: gtrackDbUrl
      }
    },
    log: ['error', 'warn']
  });
  console.log('✅ GTRACKDB connection initiated successfully');
} catch (error) {
  console.error('❌ Failed to connect to GTRACKDB:', error.message);
  // Create a mock client for graceful fallback
  gtrackDB = createMockClient();
}

// Create Prisma client for GS1DB with error handling
let gs1DB;
try {
  gs1DB = new PrismaClient({
    datasources: {
      db: {
        url: gs1DbUrl
      }
    },
    log: ['error', 'warn']
  });
  console.log('✅ GS1DB connection initiated successfully');
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
    Product: {
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
