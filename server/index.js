const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

// Import the pricing routes
const pricingRoutes = require('./api/pricing');

const app = express();

// Middleware
app.use(morgan('dev'));
app.use(cors());
app.use(bodyParser.json());

// Special case for Stripe webhook to handle raw body
app.use('/api/pricing/webhook', express.raw({ type: 'application/json' }));

// API routes
app.use('/api/pricing', pricingRoutes);

// Other existing routes
// ...

// Static files
app.use(express.static(path.join(__dirname, '../client/dist')));

// Catch-all route for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 