const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');
const fs = require('fs').promises;
const path = require('path');
const { query, transaction } = require('../src/database');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Configure multer for CSV uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Apply authentication to all customer routes
router.use(authenticateToken);

// Get all customers with pagination and search
router.get('/', asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    search = '', 
    status = 'all',
    uses_receipt_rolls = 'all'
  } = req.query;

  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = [];

  // Search filter
  if (search) {
    whereClause += ` AND (company_name ILIKE $${params.length + 1} OR contact_person ILIKE $${params.length + 1} OR email ILIKE $${params.length + 1})`;
    params.push(`%${search}%`);
  }

  // Status filter
  if (status !== 'all') {
    whereClause += ` AND status = $${params.length + 1}`;
    params.push(status);
  }

  // Receipt rolls filter
  if (uses_receipt_rolls !== 'all') {
    whereClause += ` AND uses_receipt_rolls = $${params.length + 1}`;
    params.push(uses_receipt_rolls === 'true');
  }

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) FROM customers ${whereClause}`,
    params
  );
  const totalCustomers = parseInt(countResult.rows[0].count);

  // Get customers with delivery addresses
  const result = await query(
    `SELECT 
      c.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', da.id,
            'street', da.street,
            'number', da.number,
            'city', da.city,
            'postal_code', da.postal_code,
            'country', da.country,
            'is_primary', da.is_primary
          )
        ) FILTER (WHERE da.id IS NOT NULL), 
        '[]'
      ) as delivery_addresses
    FROM customers c
    LEFT JOIN delivery_addresses da ON c.id = da.customer_id
    ${whereClause}
    GROUP BY c.id
    ORDER BY c.company_name ASC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  res.json({
    success: true,
    data: {
      customers: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCustomers / limit),
        totalCustomers,
        hasNext: offset + limit < totalCustomers,
        hasPrev: page > 1
      }
    }
  });
}));

// Get single customer by ID
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await query(
    `SELECT 
      c.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', da.id,
            'street', da.street,
            'number', da.number,
            'city', da.city,
            'postal_code', da.postal_code,
            'country', da.country,
            'is_primary', da.is_primary
          )
        ) FILTER (WHERE da.id IS NOT NULL), 
        '[]'
      ) as delivery_addresses
    FROM customers c
    LEFT JOIN delivery_addresses da ON c.id = da.customer_id
    WHERE c.id = $1
    GROUP BY c.id`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Customer not found'
    });
  }

  res.json({
    success: true,
    data: result.rows[0]
  });
}));

// Create new customer
router.post('/', asyncHandler(async (req, res) => {
  const {
    company_name,
    contact_person,
    email,
    phone,
    mobile,
    vat_number,
    uses_receipt_rolls = false,
    opt_out = false,
    invoice_address_street,
    invoice_address_number,
    invoice_address_city,
    invoice_address_postal_code,
    invoice_address_country = 'Belgium',
    invoice_language_code = 'FR',
    invoice_language_confirmed = false,
    delivery_same_as_invoice = true,
    delivery_addresses = [],
    notes,
    status = 'active'
  } = req.body;

  // Validation
  if (!company_name) {
    return res.status(400).json({
      success: false,
      error: 'Company name is required'
    });
  }

  const result = await transaction(async (client) => {
    // Insert customer
    const customerResult = await client.query(
      `INSERT INTO customers (
        company_name, contact_person, email, phone, mobile, vat_number,
        uses_receipt_rolls, opt_out, invoice_address_street, invoice_address_number,
        invoice_address_city, invoice_address_postal_code, invoice_address_country,
        invoice_language_code, invoice_language_confirmed, delivery_same_as_invoice, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        company_name, contact_person, email, phone, mobile, vat_number,
        uses_receipt_rolls, opt_out, invoice_address_street, invoice_address_number,
        invoice_address_city, invoice_address_postal_code, invoice_address_country,
        invoice_language_code, invoice_language_confirmed, delivery_same_as_invoice, notes, status
      ]
    );

    const customer = customerResult.rows[0];

    // Insert delivery addresses if provided and different from invoice
    if (!delivery_same_as_invoice && delivery_addresses.length > 0) {
      for (let i = 0; i < delivery_addresses.length; i++) {
        const addr = delivery_addresses[i];
        await client.query(
          `INSERT INTO delivery_addresses (
            customer_id, street, number, city, postal_code, country, is_primary
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            customer.id, addr.street, addr.number, addr.city,
            addr.postal_code, addr.country || 'Belgium', i === 0
          ]
        );
      }
    }

    return customer;
  });

  res.status(201).json({
    success: true,
    message: 'Customer created successfully',
    data: result
  });
}));

// Update customer
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    company_name,
    contact_person,
    email,
    phone,
    mobile,
    vat_number,
    uses_receipt_rolls,
    opt_out,
    invoice_address_street,
    invoice_address_number,
    invoice_address_city,
    invoice_address_postal_code,
    invoice_address_country,
    invoice_language_code,
    invoice_language_confirmed,
    delivery_same_as_invoice,
    delivery_addresses = [],
    notes,
    status
  } = req.body;

  const result = await transaction(async (client) => {
    // Update customer
    const customerResult = await client.query(
      `UPDATE customers SET
        company_name = COALESCE($1, company_name),
        contact_person = COALESCE($2, contact_person),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        mobile = COALESCE($5, mobile),
        vat_number = COALESCE($6, vat_number),
        uses_receipt_rolls = COALESCE($7, uses_receipt_rolls),
        opt_out = COALESCE($8, opt_out),
        invoice_address_street = COALESCE($9, invoice_address_street),
        invoice_address_number = COALESCE($10, invoice_address_number),
        invoice_address_city = COALESCE($11, invoice_address_city),
        invoice_address_postal_code = COALESCE($12, invoice_address_postal_code),
        invoice_address_country = COALESCE($13, invoice_address_country),
        invoice_language_code = COALESCE($14, invoice_language_code),
        invoice_language_confirmed = COALESCE($15, invoice_language_confirmed),
        delivery_same_as_invoice = COALESCE($16, delivery_same_as_invoice),
        notes = COALESCE($17, notes),
        status = COALESCE($18, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $19
      RETURNING *`,
      [
        company_name, contact_person, email, phone, mobile, vat_number,
        uses_receipt_rolls, opt_out, invoice_address_street, invoice_address_number,
        invoice_address_city, invoice_address_postal_code, invoice_address_country,
        invoice_language_code, invoice_language_confirmed, delivery_same_as_invoice, notes, status, id
      ]
    );

    if (customerResult.rows.length === 0) {
      throw new Error('Customer not found');
    }

    // Update delivery addresses
    if (delivery_same_as_invoice !== undefined) {
      // Delete existing delivery addresses
      await client.query('DELETE FROM delivery_addresses WHERE customer_id = $1', [id]);

      // Insert new delivery addresses if different from invoice
      if (!delivery_same_as_invoice && delivery_addresses.length > 0) {
        for (let i = 0; i < delivery_addresses.length; i++) {
          const addr = delivery_addresses[i];
          await client.query(
            `INSERT INTO delivery_addresses (
              customer_id, street, number, city, postal_code, country, is_primary
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              id, addr.street, addr.number, addr.city,
              addr.postal_code, addr.country || 'Belgium', i === 0
            ]
          );
        }
      }
    }

    return customerResult.rows[0];
  });

  res.json({
    success: true,
    message: 'Customer updated successfully',
    data: result
  });
}));

// Delete customer
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await query(
    'DELETE FROM customers WHERE id = $1 RETURNING *',
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Customer not found'
    });
  }

  res.json({
    success: true,
    message: 'Customer deleted successfully'
  });
}));

// Download CSV template
router.get('/download/template', (req, res) => {
  const csvData = [
    [
      'company_name', 'contact_person', 'email', 'phone', 'mobile', 'vat_number',
      'uses_receipt_rolls', 'invoice_address_street', 'invoice_address_number',
      'invoice_address_city', 'invoice_address_postal_code', 'invoice_address_country',
      'delivery_same_as_invoice', 'notes', 'status'
    ],
    [
      'Example Company BVBA', 'Jan Janssen', 'jan@example.be', '+32 2 123 45 67', 
      '+32 476 12 34 56', 'BE0123456789', 'true', 'Kerkstraat', '123',
      'Brussel', '1000', 'Belgium', 'false', 'Important customer', 'active'
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

// Upload CSV file
router.post('/upload/csv', upload.single('csvFile'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'CSV file is required'
    });
  }

  try {
    const fileContent = await fs.readFile(req.file.path, 'utf-8');
    const records = [];
    const errors = [];

    // Parse CSV with semicolon delimiter (European format)
    const parsedRecords = await new Promise((resolve, reject) => {
      parse(fileContent, {
        delimiter: ';',
        columns: true,
        skip_empty_lines: true,
        trim: true
      }, (err, records) => {
        if (err) {
          reject(err);
        } else {
          resolve(records);
        }
      });
    });

    let successCount = 0;
    let errorCount = 0;

    for (const record of parsedRecords) {
      try {
        // Convert string booleans to actual booleans
        const uses_receipt_rolls = record.uses_receipt_rolls === 'true';
        const delivery_same_as_invoice = record.delivery_same_as_invoice !== 'false';
        const invoice_language_confirmed = record.invoice_language_confirmed === 'true';

        await query(
          `INSERT INTO customers (
            company_name, contact_person, email, phone, mobile, vat_number,
            uses_receipt_rolls, invoice_address_street, invoice_address_number,
            invoice_address_city, invoice_address_postal_code, invoice_address_country,
            invoice_language_code, invoice_language_confirmed, delivery_same_as_invoice, notes, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            record.company_name, record.contact_person, record.email, 
            record.phone, record.mobile, record.vat_number,
            uses_receipt_rolls, record.invoice_address_street, record.invoice_address_number,
            record.invoice_address_city, record.invoice_address_postal_code, 
            record.invoice_address_country || 'Belgium',
            record.invoice_language_code || 'FR', invoice_language_confirmed,
            delivery_same_as_invoice, record.notes, record.status || 'active'
          ]
        );
        successCount++;
      } catch (error) {
        console.error('Error importing customer:', record.company_name, error.message);
        errors.push(`${record.company_name}: ${error.message}`);
        errorCount++;
      }
    }

    // Clean up uploaded file
    await fs.unlink(req.file.path);

    res.json({
      success: true,
      message: `Import completed. ${successCount} customers imported successfully.`,
      data: {
        successCount,
        errorCount,
        errors: errors.slice(0, 10) // Limit errors shown
      }
    });

  } catch (error) {
    // Clean up uploaded file
    if (req.file) {
      await fs.unlink(req.file.path);
    }
    throw error;
  }
}));

// Export customers to CSV
router.get('/export/csv', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT 
      company_name, contact_person, email, phone, mobile, vat_number,
      uses_receipt_rolls, invoice_address_street, invoice_address_number,
      invoice_address_city, invoice_address_postal_code, invoice_address_country,
      invoice_language_code, invoice_language_confirmed, delivery_same_as_invoice, notes, status
    FROM customers
    ORDER BY company_name ASC`
  );

  const csvData = [
    [
      'company_name', 'contact_person', 'email', 'phone', 'mobile', 'vat_number',
      'uses_receipt_rolls', 'invoice_address_street', 'invoice_address_number',
      'invoice_address_city', 'invoice_address_postal_code', 'invoice_address_country',
      'invoice_language_code', 'invoice_language_confirmed', 'delivery_same_as_invoice', 'notes', 'status'
    ],
    ...result.rows.map(row => [
      row.company_name, row.contact_person, row.email, row.phone, row.mobile, row.vat_number,
      row.uses_receipt_rolls, row.invoice_address_street, row.invoice_address_number,
      row.invoice_address_city, row.invoice_address_postal_code, row.invoice_address_country,
      row.invoice_language_code, row.invoice_language_confirmed, row.delivery_same_as_invoice, row.notes, row.status
    ])
  ];

  stringify(csvData, {
    delimiter: ';', // European CSV format
    header: false
  }, (err, output) => {
    if (err) throw err;
    
    const timestamp = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="customers_export_${timestamp}.csv"`);
    res.send(output);
  });
}));

// Import delivery addresses from CSV
router.post('/delivery-addresses/import/csv', upload.single('csvFile'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded'
    });
  }

  try {
    const fileContent = await fs.readFile(req.file.path, 'utf-8');
    const errors = [];

    // Parse CSV with semicolon delimiter (European format)
    const parsedRecords = await new Promise((resolve, reject) => {
      parse(fileContent, {
        delimiter: ';', // European CSV format
        columns: true,
        skip_empty_lines: true,
        trim: true
      }, (err, records) => {
        if (err) {
          reject(err);
        } else {
          resolve(records);
        }
      });
    });

    let successCount = 0;
    let errorCount = 0;

    for (const record of parsedRecords) {
      try {
        // Validate required fields
        if (!record.customer_company_name && !record.customer_id) {
          errors.push(`Row: Missing customer identification (company_name or customer_id)`);
          errorCount++;
          continue;
        }

        if (!record.address_name) {
          errors.push(`Row: Missing address_name for customer ${record.customer_company_name || record.customer_id}`);
          errorCount++;
          continue;
        }

        // Find customer by company name or ID
        let customerId = record.customer_id;
        if (!customerId && record.customer_company_name) {
          const customerResult = await query(
            'SELECT id FROM customers WHERE company_name ILIKE $1',
            [record.customer_company_name]
          );
          
          if (customerResult.rows.length === 0) {
            errors.push(`Customer not found: ${record.customer_company_name}`);
            errorCount++;
            continue;
          }
          customerId = customerResult.rows[0].id;
        }

        // Convert string booleans to actual booleans
        const is_primary = record.is_primary === 'true' || record.is_primary === '1';
        const can_place_orders = record.can_place_orders === 'true' || record.can_place_orders === '1';
        const language_confirmed = record.language_confirmed === 'true' || record.language_confirmed === '1';

        // If setting as primary, remove primary flag from other addresses
        if (is_primary) {
          await query(
            'UPDATE delivery_addresses SET is_primary = false WHERE customer_id = $1',
            [customerId]
          );
        }

        await query(
          `INSERT INTO delivery_addresses (
            customer_id, address_name, street, number, city, postal_code, country,
            language_code, language_confirmed, is_primary, can_place_orders, contact_person, contact_phone, contact_email, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            customerId,
            record.address_name,
            record.street || null,
            record.number || null,
            record.city || null,
            record.postal_code || null,
            record.country || 'Belgium',
            record.language_code || 'FR',
            language_confirmed,
            is_primary,
            can_place_orders,
            record.contact_person || null,
            record.contact_phone || null,
            record.contact_email || null,
            record.notes || null
          ]
        );
        successCount++;
      } catch (error) {
        console.error('Error importing delivery address:', record.address_name, error.message);
        errors.push(`${record.address_name}: ${error.message}`);
        errorCount++;
      }
    }

    // Clean up uploaded file
    await fs.unlink(req.file.path);

    res.json({
      success: true,
      message: `Import completed. ${successCount} delivery addresses imported successfully.`,
      data: {
        successCount,
        errorCount,
        errors: errors.slice(0, 10) // Limit errors shown
      }
    });

  } catch (error) {
    // Clean up uploaded file
    if (req.file) {
      await fs.unlink(req.file.path);
    }
    throw error;
  }
}));

// Export delivery addresses to CSV
router.get('/delivery-addresses/export/csv', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT 
      c.company_name as customer_company_name,
      da.address_name, da.street, da.number, da.city, da.postal_code, da.country,
      da.language_code, da.language_confirmed, da.is_primary, da.can_place_orders, da.contact_person, da.contact_phone, 
      da.contact_email, da.notes, da.is_active
    FROM delivery_addresses da
    LEFT JOIN customers c ON da.customer_id = c.id
    WHERE da.is_active = true
    ORDER BY c.company_name, da.address_name ASC`
  );

  const csvData = [
    [
      'customer_company_name', 'address_name', 'street', 'number', 'city', 'postal_code', 'country',
      'language_code', 'language_confirmed', 'is_primary', 'can_place_orders', 'contact_person', 'contact_phone', 'contact_email', 'notes'
    ],
    ...result.rows.map(row => [
      row.customer_company_name, row.address_name, row.street, row.number, row.city, row.postal_code, row.country,
      row.language_code, row.language_confirmed, row.is_primary, row.can_place_orders, row.contact_person, row.contact_phone, row.contact_email, row.notes
    ])
  ];

  stringify(csvData, {
    delimiter: ';', // European CSV format
    header: false
  }, (err, output) => {
    if (err) throw err;
    
    const timestamp = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="delivery_addresses_export_${timestamp}.csv"`);
    res.send(output);
  });
}));

// Download delivery addresses CSV template
router.get('/delivery-addresses/template/csv', (req, res) => {
  const templateData = [
    [
      'customer_company_name', 'address_name', 'street', 'number', 'city', 'postal_code', 'country',
      'is_primary', 'can_place_orders', 'contact_person', 'contact_phone', 'contact_email', 'notes'
    ],
    [
      'Example Company Ltd', 'Main Warehouse', 'Industrial Street', '123', 'Brussels', '1000', 'Belgium',
      'true', 'false', 'John Doe', '+32123456789', 'john@example.com', 'Main delivery location'
    ],
    [
      'Example Company Ltd', 'Store Branch 1', 'Commercial Ave', '456', 'Antwerp', '2000', 'Belgium',
      'false', 'true', 'Jane Smith', '+32987654321', 'jane@example.com', 'Can place orders independently'
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

// ==================== DELIVERY ADDRESS MANAGEMENT ====================

// Get all delivery addresses for a customer
router.get('/:customerId/delivery-addresses', asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  const result = await query(
    `SELECT da.*, c.company_name
    FROM delivery_addresses da
    LEFT JOIN customers c ON da.customer_id = c.id
    WHERE da.customer_id = $1 AND da.is_active = true
    ORDER BY da.is_primary DESC, da.address_name ASC`,
    [customerId]
  );

  res.json({
    success: true,
    data: result.rows
  });
}));

// Add new delivery address for a customer
router.post('/:customerId/delivery-addresses', asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const {
    address_name,
    street,
    number,
    city,
    postal_code,
    country = 'Belgium',
    language_code = 'FR',
    language_confirmed = false,
    is_primary = false,
    can_place_orders = false,
    contact_person,
    contact_phone,
    contact_email,
    notes
  } = req.body;

  // Validation
  if (!address_name) {
    return res.status(400).json({
      success: false,
      error: 'Address name is required'
    });
  }

  // If setting as primary, remove primary flag from other addresses
  if (is_primary) {
    await query(
      'UPDATE delivery_addresses SET is_primary = false WHERE customer_id = $1',
      [customerId]
    );
  }

  const result = await query(
    `INSERT INTO delivery_addresses (
      customer_id, address_name, street, number, city, postal_code, country,
      language_code, language_confirmed, is_primary, can_place_orders, contact_person, contact_phone, contact_email, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *`,
    [
      customerId, address_name, street, number, city, postal_code, country,
      language_code, language_confirmed, is_primary, can_place_orders, contact_person, contact_phone, contact_email, notes
    ]
  );

  res.status(201).json({
    success: true,
    message: 'Delivery address created successfully',
    data: result.rows[0]
  });
}));

// Update delivery address
router.put('/delivery-addresses/:addressId', asyncHandler(async (req, res) => {
  const { addressId } = req.params;
  const {
    address_name,
    street,
    number,
    city,
    postal_code,
    country,
    language_code,
    language_confirmed,
    is_primary,
    can_place_orders,
    contact_person,
    contact_phone,
    contact_email,
    notes,
    is_active
  } = req.body;

  // If setting as primary, remove primary flag from other addresses for the same customer
  if (is_primary) {
    await query(
      `UPDATE delivery_addresses SET is_primary = false 
       WHERE customer_id = (SELECT customer_id FROM delivery_addresses WHERE id = $1)`,
      [addressId]
    );
  }

  const result = await query(
    `UPDATE delivery_addresses SET
      address_name = COALESCE($1, address_name),
      street = COALESCE($2, street),
      number = COALESCE($3, number),
      city = COALESCE($4, city),
      postal_code = COALESCE($5, postal_code),
      country = COALESCE($6, country),
      language_code = COALESCE($7, language_code),
      language_confirmed = COALESCE($8, language_confirmed),
      is_primary = COALESCE($9, is_primary),
      can_place_orders = COALESCE($10, can_place_orders),
      contact_person = COALESCE($11, contact_person),
      contact_phone = COALESCE($12, contact_phone),
      contact_email = COALESCE($13, contact_email),
      notes = COALESCE($14, notes),
      is_active = COALESCE($15, is_active),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $16
    RETURNING *`,
    [
      address_name, street, number, city, postal_code, country,
      language_code, language_confirmed, is_primary, can_place_orders, contact_person, contact_phone, contact_email, notes, is_active,
      addressId
    ]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Delivery address not found'
    });
  }

  res.json({
    success: true,
    message: 'Delivery address updated successfully',
    data: result.rows[0]
  });
}));

// Delete delivery address (soft delete)
router.delete('/delivery-addresses/:addressId', asyncHandler(async (req, res) => {
  const { addressId } = req.params;

  // Check if this is the primary address
  const addressResult = await query(
    'SELECT is_primary, customer_id FROM delivery_addresses WHERE id = $1',
    [addressId]
  );

  if (addressResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Delivery address not found'
    });
  }

  const address = addressResult.rows[0];

  // Soft delete the address
  await query(
    'UPDATE delivery_addresses SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [addressId]
  );

  // If this was the primary address, set another address as primary
  if (address.is_primary) {
    await query(
      `UPDATE delivery_addresses SET is_primary = true 
       WHERE customer_id = $1 AND is_active = true AND id != $2
       ORDER BY created_at ASC LIMIT 1`,
      [address.customer_id, addressId]
    );
  }

  res.json({
    success: true,
    message: 'Delivery address deleted successfully'
  });
}));

module.exports = router;
