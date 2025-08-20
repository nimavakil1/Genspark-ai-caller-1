const { query } = require('../src/database');
const { hashPassword } = require('../middleware/auth');

async function seedDatabase() {
  console.log('🌱 Starting database seeding...');
  
  try {
    // Create default admin user
    const adminPassword = await hashPassword('admin123');
    
    await query(`
      INSERT INTO admin_users (username, email, password_hash, first_name, last_name, role)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (username) DO NOTHING
    `, ['admin', 'admin@example.com', adminPassword, 'System', 'Administrator', 'admin']);

    // Create sample customers
    const sampleCustomers = [
      {
        company_name: 'Restaurant De Gouden Lepel BVBA',
        contact_person: 'Jan Janssen',
        email: 'jan@goudenlepel.be',
        phone: '+32 2 123 45 67',
        mobile: '+32 476 12 34 56',
        vat_number: 'BE0123456789',
        uses_receipt_rolls: true,
        invoice_address_street: 'Kerkstraat',
        invoice_address_number: '123',
        invoice_address_city: 'Brussel',
        invoice_address_postal_code: '1000',
        invoice_address_country: 'Belgium',
        delivery_same_as_invoice: true,
        notes: 'Regular customer, orders monthly'
      },
      {
        company_name: 'Bakery Fresh & Co NV',
        contact_person: 'Marie Dupont',
        email: 'marie@fresh-co.be',
        phone: '+32 3 987 65 43',
        mobile: '+32 498 76 54 32',
        vat_number: 'BE0987654321',
        uses_receipt_rolls: true,
        invoice_address_street: 'Marktplein',
        invoice_address_number: '45',
        invoice_address_city: 'Antwerpen',
        invoice_address_postal_code: '2000',
        invoice_address_country: 'Belgium',
        delivery_same_as_invoice: false,
        notes: 'Prefers morning deliveries'
      },
      {
        company_name: 'Tech Solutions SPRL',
        contact_person: 'Pierre Martin',
        email: 'p.martin@techsolutions.be',
        phone: '+32 4 555 12 34',
        mobile: '+32 465 11 22 33',
        vat_number: 'BE0555123456',
        uses_receipt_rolls: false,
        invoice_address_street: 'Innovation Avenue',
        invoice_address_number: '78',
        invoice_address_city: 'Liège',
        invoice_address_postal_code: '4000',
        invoice_address_country: 'Belgium',
        delivery_same_as_invoice: true,
        notes: 'Technology company, potential for digital solutions'
      }
    ];

    for (const customer of sampleCustomers) {
      await query(`
        INSERT INTO customers (
          company_name, contact_person, email, phone, mobile, vat_number,
          uses_receipt_rolls, invoice_address_street, invoice_address_number,
          invoice_address_city, invoice_address_postal_code, invoice_address_country,
          delivery_same_as_invoice, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (email) DO NOTHING
      `, [
        customer.company_name, customer.contact_person, customer.email,
        customer.phone, customer.mobile, customer.vat_number,
        customer.uses_receipt_rolls, customer.invoice_address_street,
        customer.invoice_address_number, customer.invoice_address_city,
        customer.invoice_address_postal_code, customer.invoice_address_country,
        customer.delivery_same_as_invoice, customer.notes
      ]);
    }

    // Create sample products
    const sampleProducts = [
      {
        name: 'Thermal Receipt Roll 80x80mm',
        description: 'High quality thermal paper roll, 80mm width, 80m length',
        category: 'Receipt Rolls',
        price: 2.50,
        width_mm: 80,
        diameter_mm: 80,
        core_diameter_mm: 12,
        thermal: true,
        color: 'White',
        stock_quantity: 500,
        min_stock_level: 50
      },
      {
        name: 'Thermal Receipt Roll 57x40mm',
        description: 'Compact thermal paper roll for small POS systems',
        category: 'Receipt Rolls',
        price: 1.80,
        width_mm: 57,
        diameter_mm: 40,
        core_diameter_mm: 12,
        thermal: true,
        color: 'White',
        stock_quantity: 300,
        min_stock_level: 30
      },
      {
        name: 'Standard Paper Roll 76x70mm',
        description: 'Non-thermal paper roll for impact printers',
        category: 'Receipt Rolls',
        price: 1.20,
        width_mm: 76,
        diameter_mm: 70,
        core_diameter_mm: 12,
        thermal: false,
        color: 'White',
        stock_quantity: 200,
        min_stock_level: 25
      }
    ];

    for (const product of sampleProducts) {
      await query(`
        INSERT INTO products (
          name, description, category, price, currency, width_mm, diameter_mm,
          core_diameter_mm, thermal, color, stock_quantity, min_stock_level
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (name) DO NOTHING
      `, [
        product.name, product.description, product.category, product.price, 'EUR',
        product.width_mm, product.diameter_mm, product.core_diameter_mm,
        product.thermal, product.color, product.stock_quantity, product.min_stock_level
      ]);
    }

    console.log('✅ Database seeding completed successfully');
    console.log('🔑 Default admin user created:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('   Email: admin@example.com');
    console.log('');
    console.log('📊 Sample data created:');
    console.log('   - 3 sample customers');
    console.log('   - 3 sample products');
    console.log('');
    console.log('⚠️  Remember to change the admin password in production!');
    
    process.exit(0);
  } catch (error) {
    console.error('💥 Database seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();