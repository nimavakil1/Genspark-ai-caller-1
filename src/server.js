const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// Import middleware
const errorHandler = require('../middleware/errorHandler');
const auth = require('../middleware/auth');

// Import database initialization
const { initializeDatabase } = require('./database');

// Import routes
const authRoutes = require('../routes/auth');
const customerRoutes = require('../routes/customers');
const dashboardRoutes = require('../routes/dashboard');
const callRoutes = require('../routes/calls');
const productRoutes = require('../routes/products');
const orderRoutes = require('../routes/orders');
const telnyxRoutes = require('../routes/telnyx');
const telnyxVoiceRoutes = require('../routes/telnyxVoiceAPI');
const callControlRoutes = require('../routes/callControlAPI');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ["http://localhost:3000"],
    methods: ["GET", "POST"]
  }
});

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.'
});


// Trust proxy (fix for Nginx reverse proxy)
app.set('trust proxy', 1);

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true
}));

// Rate limiting
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Static files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Public CSV template routes (no authentication)
const { stringify } = require('csv-stringify');

app.get('/api/customers/download/template', (req, res) => {
  const csvData = [
    [
      'company_name', 'contact_person', 'email', 'phone', 'mobile', 'vat_number',
      'uses_receipt_rolls', 'invoice_address_street', 'invoice_address_number',
      'invoice_address_city', 'invoice_address_postal_code', 'invoice_address_country',
      'invoice_language_code', 'invoice_language_confirmed', 'delivery_same_as_invoice', 'notes', 'status'
    ],
    [
      'Example Company BVBA', 'Jan Janssen', 'jan@example.be', '+32 2 123 45 67', 
      '+32 476 12 34 56', 'BE0123456789', 'true', 'Kerkstraat', '123',
      'Brussel', '1000', 'Belgium', 'NL', 'true', 'false', 'Important customer', 'active'
    ]
  ];

  stringify(csvData, {
    delimiter: ';', // European CSV format
    header: false
  }, (err, output) => {
    if (err) throw err;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="customers_template.csv"');
    res.send(output);
  });
});

app.get('/api/customers/delivery-addresses/template/csv', (req, res) => {
  const templateData = [
    [
      'customer_company_name', 'address_name', 'street', 'number', 'city', 'postal_code', 'country',
      'language_code', 'language_confirmed', 'is_primary', 'can_place_orders', 'contact_person', 'contact_phone', 'contact_email', 'notes'
    ],
    [
      'Example Company Ltd', 'Main Warehouse', 'Industrial Street', '123', 'Brussels', '1000', 'Belgium',
      'FR', 'true', 'true', 'false', 'John Doe', '+32123456789', 'john@example.com', 'Main delivery location - French confirmed'
    ],
    [
      'Example Company Ltd', 'Store Branch 1', 'Commercial Ave', '456', 'Antwerp', '2000', 'Belgium',
      'NL', 'false', 'false', 'true', 'Jane Smith', '+32987654321', 'jane@example.com', 'Can place orders independently - Dutch not confirmed'
    ]
  ];

  stringify(templateData, {
    delimiter: ';', // European CSV format
    header: false
  }, (err, output) => {
    if (err) throw err;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="delivery_addresses_template.csv"');
    res.send(output);
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/telnyx', telnyxRoutes);
app.use('/api/telnyx-voice', telnyxVoiceRoutes);
app.use('/api/call-control', callControlRoutes);

// Main dashboard route (protected)
app.get('/', (req, res) => {
  res.render('dashboard', { 
    user: { first_name: 'Admin', username: 'admin' },
    title: 'AI Sales Dashboard'
  });
});


// Login page
app.get('/login', (req, res) => {
  res.render('login', { title: 'Login - AI Sales System' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  socket.on('call-update', (data) => {
    socket.to(data.roomId).emit('call-update', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Error handling middleware (must be last)
app.use(errorHandler.errorHandler);

// Initialize database and start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Initialize database schema and run migrations
    await initializeDatabase();
    
    // Start the server
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Dashboard: http://localhost:${PORT}`);
      console.log(`🔐 Login: http://localhost:${PORT}/login`);
      console.log(`🏥 Health check: http://localhost:${PORT}/health`);
    });
    
  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = { app, server, io };
