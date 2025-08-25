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

// Database migrations function
const runMigrations = async () => {
  console.log('🔄 Running database migrations...');
  
  try {
    // Migration 1: Add new columns to delivery_addresses table (if they don't exist)
    const columnsToAdd = [
      { name: 'address_name', type: 'VARCHAR(100)', default: "'Address'" },
      { name: 'can_place_orders', type: 'BOOLEAN', default: 'false' },
      { name: 'contact_person', type: 'VARCHAR(100)', default: null },
      { name: 'contact_phone', type: 'VARCHAR(20)', default: null },
      { name: 'contact_email', type: 'VARCHAR(100)', default: null },
      { name: 'notes', type: 'TEXT', default: null },
      { name: 'is_active', type: 'BOOLEAN', default: 'true' },
      { name: 'updated_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' }
    ];

    for (const column of columnsToAdd) {
      try {
        // Check if column exists
        const columnCheck = await query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'delivery_addresses' 
          AND column_name = $1
        `, [column.name]);

        if (columnCheck.rows.length === 0) {
          // Column doesn't exist, add it
          const defaultClause = column.default ? ` DEFAULT ${column.default}` : '';
          await query(`
            ALTER TABLE delivery_addresses 
            ADD COLUMN ${column.name} ${column.type}${defaultClause}
          `);
          console.log(`✅ Added column: ${column.name}`);
        }
      } catch (error) {
        console.log(`⚠️ Column ${column.name} migration issue:`, error.message);
      }
    }

    // Migration 2: Ensure address_name is NOT NULL for existing records
    try {
      await query(`
        UPDATE delivery_addresses 
        SET address_name = COALESCE(address_name, 'Address ' || id) 
        WHERE address_name IS NULL OR address_name = ''
      `);

      // Now make the column NOT NULL
      await query(`
        ALTER TABLE delivery_addresses 
        ALTER COLUMN address_name SET NOT NULL
      `);
      console.log('✅ Updated address_name column to NOT NULL');
    } catch (error) {
      console.log('⚠️ Address name NOT NULL migration issue:', error.message);
    }

    // Migration 3: Add language fields to customers table
    const customerLanguageColumns = [
      { name: 'invoice_language_code', type: 'VARCHAR(5)', default: "'FR'" },
      { name: 'invoice_language_confirmed', type: 'BOOLEAN', default: 'false' }
    ];

    for (const column of customerLanguageColumns) {
      try {
        // Check if column exists in customers table
        const columnCheck = await query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'customers' 
          AND column_name = $1
        `, [column.name]);

        if (columnCheck.rows.length === 0) {
          // Column doesn't exist, add it
          const defaultClause = column.default ? ` DEFAULT ${column.default}` : '';
          await query(`
            ALTER TABLE customers 
            ADD COLUMN ${column.name} ${column.type}${defaultClause}
          `);
          console.log(`✅ Added column to customers: ${column.name}`);
        }
      } catch (error) {
        console.log(`⚠️ Customer table column ${column.name} migration issue:`, error.message);
      }
    }

    // Migration 4: Add language fields to delivery_addresses table
    const deliveryLanguageColumns = [
      { name: 'language_code', type: 'VARCHAR(5)', default: "'FR'" },
      { name: 'language_confirmed', type: 'BOOLEAN', default: 'false' }
    ];

    for (const column of deliveryLanguageColumns) {
      try {
        // Check if column exists in delivery_addresses table
        const columnCheck = await query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'delivery_addresses' 
          AND column_name = $1
        `, [column.name]);

        if (columnCheck.rows.length === 0) {
          // Column doesn't exist, add it
          const defaultClause = column.default ? ` DEFAULT ${column.default}` : '';
          await query(`
            ALTER TABLE delivery_addresses 
            ADD COLUMN ${column.name} ${column.type}${defaultClause}
          `);
          console.log(`✅ Added column to delivery_addresses: ${column.name}`);
        }
      } catch (error) {
        console.log(`⚠️ Delivery addresses table column ${column.name} migration issue:`, error.message);
      }
    }

    // Migration 5: Add agent_id to call_logs table
    try {
      const columnCheck = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'call_logs' 
        AND column_name = 'agent_id'
      `);

      if (columnCheck.rows.length === 0) {
        await query(`
          ALTER TABLE call_logs 
          ADD COLUMN agent_id INTEGER REFERENCES agents(id)
        `);
        console.log('✅ Added agent_id column to call_logs table');
      }
    } catch (error) {
      console.log('⚠️ Call logs agent_id column migration issue:', error.message);
    }

    console.log('✅ Database migrations completed successfully');
    
  } catch (error) {
    console.error('💥 Migration error:', error);
    throw error;
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
        address_name VARCHAR(100) NOT NULL,
        street VARCHAR(255),
        number VARCHAR(20),
        city VARCHAR(100),
        postal_code VARCHAR(20),
        country VARCHAR(100) DEFAULT 'Belgium',
        is_primary BOOLEAN DEFAULT true,
        can_place_orders BOOLEAN DEFAULT false,
        contact_person VARCHAR(100),
        contact_phone VARCHAR(20),
        contact_email VARCHAR(100),
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create products table
    await query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        sku VARCHAR(100) UNIQUE NOT NULL,
        price DECIMAL(10,2),
        currency VARCHAR(3) DEFAULT 'EUR',
        stock_quantity INTEGER DEFAULT 0,
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
        agent_id INTEGER REFERENCES agents(id),
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

    // Create agents table (for AI agent management)
    await query(`
      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        system_prompt TEXT,
        voice_settings JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create agent_knowledge table (for agent knowledge base)
    await query(`
      CREATE TABLE IF NOT EXISTS agent_knowledge (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        file_url VARCHAR(500),
        file_type VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    await query('CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name)');
    await query('CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(is_active)');
    await query('CREATE INDEX IF NOT EXISTS idx_agent_knowledge_agent ON agent_knowledge(agent_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_agent_knowledge_active ON agent_knowledge(is_active)');

    // Run database migrations
    await runMigrations();

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