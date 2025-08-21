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

module.exports = router;
