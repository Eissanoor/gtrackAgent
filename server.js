const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const cors = require('cors');
const compression = require('compression');
// Load environment variables
dotenv.config();

// Import routes
const productRoutes = require('./src/routes/productRoutes');
const testRoutes = require('./src/routes/testRoutes');
const emailsendRoutes = require('./src/routes/emailsendRoute');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
const corsOptions = {
  origin: ['*','https://gtrack.online', "http://localhost:3072","http://localhost:5073", 'https://printpack.gtrack.online'], // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400 // 24 hours
};

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));
app.use(compression());
// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));
app.use(expressLayouts);
app.set('layout', false); // We're manually including the layout in each view
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/products', productRoutes);
app.use('/api/test', testRoutes);
app.use('/api/emailsend', emailsendRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'GTrack Agent' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  // Don't crash the server
  // process.exit(1);
});

module.exports = app;
