const { Pool } = require('pg');
require('dotenv').config();

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'ai_sales_db',
  user: process.env.DB_USER || 'ai_sales_user',
  password: process.env.DB_PASSWORD || 'secure_password_2024',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
  console.log('🔗 Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('💥 Unexpected error on idle client', err);
  process.exit(-1);
});

// Helper function to execute queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('📊 Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('💥 Database query error:', error);
    throw error;
  }
};

// Helper function for transactions
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Database initialization
const initializeDatabase = async () => {
  try {
    console.log('🔧 Initializing database schema...');
    
    // Create admin_users table
    await query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        role VARCHAR(20) DEFAULT 'admin',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create customers table
    await query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(100),
        email VARCHAR(100),
        phone VARCHAR(20),
        mobile VARCHAR(20),
        vat_number VARCHAR(50),
        uses_receipt_rolls BOOLEAN DEFAULT false,
        opt_out BOOLEAN DEFAULT false,
        invoice_address_street VARCHAR(255),
        invoice_address_number VARCHAR(20),
        invoice_address_city VARCHAR(100),
        invoice_address_postal_code VARCHAR(20),
        invoice_address_country VARCHAR(100) DEFAULT 'Belgium',
        delivery_same_as_invoice BOOLEAN DEFAULT true,
        notes TEXT,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create delivery_addresses table (for customers with different delivery addresses)
    await query(`
      CREATE TABLE IF NOT EXISTS delivery_addresses (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        street VARCHAR(255),
        number VARCHAR(20),
        city VARCHAR(100),
        postal_code VARCHAR(20),
        country VARCHAR(100) DEFAULT 'Belgium',
        is_primary BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create products table
    await query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        price DECIMAL(10,2),
        currency VARCHAR(3) DEFAULT 'EUR',
        width_mm INTEGER,
        diameter_mm INTEGER,
        core_diameter_mm INTEGER,
        thermal BOOLEAN DEFAULT false,
        color VARCHAR(50),
        stock_quantity INTEGER DEFAULT 0,
        min_stock_level INTEGER DEFAULT 10,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create call_logs table
    await query(`
      CREATE TABLE IF NOT EXISTS call_logs (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        phone_number VARCHAR(20),
        direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
        duration INTEGER,
        status VARCHAR(20),
        recording_url VARCHAR(500),
        ai_summary TEXT,
        sentiment VARCHAR(20),
        follow_up_required BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create orders table
    await query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        order_number VARCHAR(50) UNIQUE,
        status VARCHAR(20) DEFAULT 'pending',
        total_amount DECIMAL(10,2),
        currency VARCHAR(3) DEFAULT 'EUR',
        delivery_address_id INTEGER REFERENCES delivery_addresses(id),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create order_items table
    await query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(10,2),
        total_price DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create sync_logs table (for Shopify integration)
    await query(`
      CREATE TABLE IF NOT EXISTS sync_logs (
        id SERIAL PRIMARY KEY,
        entity_type VARCHAR(50),
        entity_id INTEGER,
        action VARCHAR(20),
        status VARCHAR(20),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create whatsapp_messages table (for Brevo integration)
    await query(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        phone_number VARCHAR(20),
        direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
        message_text TEXT,
        media_url VARCHAR(500),
        status VARCHAR(20),
        external_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create app_users table (for mobile app users)
    await query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        email VARCHAR(100) UNIQUE,
        password_hash VARCHAR(255),
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        phone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await query('CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)');
    await query('CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_name)');
    await query('CREATE INDEX IF NOT EXISTS idx_call_logs_customer ON call_logs(customer_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_call_logs_date ON call_logs(created_at)');
    await query('CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at)');
    await query('CREATE INDEX IF NOT EXISTS idx_delivery_addresses_customer ON delivery_addresses(customer_id)');

    console.log('✅ Database schema initialized successfully');
  } catch (error) {
    console.error('💥 Database initialization error:', error);
    throw error;
  }
};

module.exports = {
  query,
  transaction,
  pool,
  initializeDatabase
};