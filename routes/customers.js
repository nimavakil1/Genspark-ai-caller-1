const express = require('express');
const multer = require('multer');
const csv = require('csv-parse');
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
        delivery_same_as_invoice, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        company_name, contact_person, email, phone, mobile, vat_number,
        uses_receipt_rolls, opt_out, invoice_address_street, invoice_address_number,
        invoice_address_city, invoice_address_postal_code, invoice_address_country,
        delivery_same_as_invoice, notes, status
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
        delivery_same_as_invoice = COALESCE($14, delivery_same_as_invoice),
        notes = COALESCE($15, notes),
        status = COALESCE($16, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $17
      RETURNING *`,
      [
        company_name, contact_person, email, phone, mobile, vat_number,
        uses_receipt_rolls, opt_out, invoice_address_street, invoice_address_number,
        invoice_address_city, invoice_address_postal_code, invoice_address_country,
        delivery_same_as_invoice, notes, status, id
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
    const parser = csv({
      delimiter: ';',
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    parser.on('readable', function() {
      let record;
      while (record = parser.read()) {
        records.push(record);
      }
    });

    parser.on('error', function(err) {
      errors.push(err.message);
    });

    parser.on('end', async function() {
      let successCount = 0;
      let errorCount = 0;

      for (const record of records) {
        try {
          // Convert string booleans to actual booleans
          const uses_receipt_rolls = record.uses_receipt_rolls === 'true';
          const delivery_same_as_invoice = record.delivery_same_as_invoice !== 'false';

          await query(
            `INSERT INTO customers (
              company_name, contact_person, email, phone, mobile, vat_number,
              uses_receipt_rolls, invoice_address_street, invoice_address_number,
              invoice_address_city, invoice_address_postal_code, invoice_address_country,
              delivery_same_as_invoice, notes, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
            [
              record.company_name, record.contact_person, record.email, 
              record.phone, record.mobile, record.vat_number,
              uses_receipt_rolls, record.invoice_address_street, record.invoice_address_number,
              record.invoice_address_city, record.invoice_address_postal_code, 
              record.invoice_address_country || 'Belgium',
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
    });

    parser.write(fileContent);
    parser.end();

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
      delivery_same_as_invoice, notes, status
    FROM customers
    ORDER BY company_name ASC`
  );

  const csvData = [
    [
      'company_name', 'contact_person', 'email', 'phone', 'mobile', 'vat_number',
      'uses_receipt_rolls', 'invoice_address_street', 'invoice_address_number',
      'invoice_address_city', 'invoice_address_postal_code', 'invoice_address_country',
      'delivery_same_as_invoice', 'notes', 'status'
    ],
    ...result.rows.map(row => [
      row.company_name, row.contact_person, row.email, row.phone, row.mobile, row.vat_number,
      row.uses_receipt_rolls, row.invoice_address_street, row.invoice_address_number,
      row.invoice_address_city, row.invoice_address_postal_code, row.invoice_address_country,
      row.delivery_same_as_invoice, row.notes, row.status
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

module.exports = router;// Ensure PUT route is available for customer updates
