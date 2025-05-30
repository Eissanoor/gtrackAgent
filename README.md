# GTrack Agent

A Node.js MVC application for inventory management with Prisma ORM, focused on tracking products with brands, units, and GCP (Global Category Product) classifications.

## Features

- MVC Architecture
- REST API endpoints
- Prisma ORM for database operations
- EJS templating engine for views
- Express.js for server-side routing
- Product relationship validation system

## Project Structure

```
project-root/
├── src/
│   ├── controllers/ - Business logic
│   ├── models/ - Prisma client setup
│   ├── views/ - EJS templates
│   ├── routes/ - API routes
│   ├── middleware/ - Custom middleware
│   └── config/ - Configuration files
├── prisma/ - Prisma schema and migrations
│   └── schema.prisma
├── public/ - Static assets
├── .env - Environment variables
└── server.js - Main application entry point
```

## Database Models

- **Brand**: Product brands (e.g., oil brands)
- **Unit**: Measurement units (e.g., liter, kg)
- **GCP**: Global Category Product for classification
- **Product**: Main product model that references others

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- PostgreSQL database

### Installation

1. Clone the repository
```
git clone <repository-url>
cd gtrack-agent
```

2. Install dependencies
```
npm install
```

3. Configure environment
Edit the `.env` file to set your database connection:
```
DATABASE_URL="postgresql://username:password@localhost:5432/gtrack_db?schema=public"
PORT=3000
```

4. Generate Prisma client
```
npm run prisma:generate
```

5. Run migrations
```
npm run prisma:migrate
```

6. Start the application
```
npm run dev
```

7. Access the application at http://localhost:3000

### Scripts

- `npm start` - Start in production mode
- `npm run dev` - Start with nodemon for development
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Launch Prisma Studio GUI

## API Endpoints

### Brands
- `GET /api/brands` - Get all brands
- `GET /api/brands/:id` - Get a brand by ID
- `POST /api/brands` - Create a new brand
- `PUT /api/brands/:id` - Update a brand
- `DELETE /api/brands/:id` - Delete a brand

### Units
- `GET /api/units` - Get all units
- `GET /api/units/:id` - Get a unit by ID
- `POST /api/units` - Create a new unit
- `PUT /api/units/:id` - Update a unit
- `DELETE /api/units/:id` - Delete a unit

### GCP Categories
- `GET /api/gcps` - Get all GCPs
- `GET /api/gcps/:id` - Get a GCP by ID
- `POST /api/gcps` - Create a new GCP
- `PUT /api/gcps/:id` - Update a GCP
- `DELETE /api/gcps/:id` - Delete a GCP

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get a product by ID
- `POST /api/products` - Create a new product
- `PUT /api/products/:id` - Update a product
- `DELETE /api/products/:id` - Delete a product
- `POST /api/products/validate` - Validate product relationships

## Image Verification with Clarifai

The system now uses Clarifai's image recognition technology to verify product images against product metadata. This ensures that product images match their descriptions, improving data quality and user experience.

### Setup Instructions

1. Sign up for a free Clarifai account at https://portal.clarifai.com/signup
2. Get your API key from the Clarifai dashboard
3. Add your Clarifai API key to your environment variables:
   ```
   CLARIFAI_API_KEY=your_clarifai_api_key
   ```

### How it Works

The image verification system:
1. Extracts expected concepts from product metadata (name, GPC, unit)
2. Sends the product image to Clarifai's general recognition model
3. Compares detected concepts with expected concepts
4. Validates if the image matches the product description

Example: If a product is named "Motor Oil", the system expects the image to contain concepts like "oil", "bottle", "container", "automotive", etc.

### Customization

You can adjust the matching logic and thresholds in the `verifyClarifaiImage` function in `src/controllers/productControllerV3.js`.
