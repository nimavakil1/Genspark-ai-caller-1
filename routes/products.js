const express = require('express');
const { query, transaction } = require('../src/database');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Apply authentication to all product routes


// Get all products with pagination and search
router.get('/', asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    search = '', 
    category = 'all',
    active_only = 'false'
  } = req.query;

  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = [];

  // Search filter
  if (search) {
    whereClause += ` AND (name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1} OR sku ILIKE $${params.length + 1})`;
    params.push(`%${search}%`);
  }

  // Active filter
  if (active_only === 'true') {
    whereClause += ` AND is_active = true`;
  }

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) FROM products ${whereClause}`,
    params
  );
  const totalProducts = parseInt(countResult.rows[0].count);

  // Get products
  const result = await query(
    `SELECT * FROM products
    ${whereClause}
    ORDER BY name ASC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  res.json({
    success: true,
    data: {
      products: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalProducts / limit),
        totalProducts,
        hasNext: offset + limit < totalProducts,
        hasPrev: page > 1
      }
    }
  });
}));

// Get single product by ID
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await query(
    'SELECT * FROM products WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Product not found'
    });
  }

  res.json({
    success: true,
    data: result.rows[0]
  });
}));

// Create new product
router.post('/', asyncHandler(async (req, res) => {
  const {
    name,
    description,
    sku,
    is_active = true
  } = req.body;

  // Validation
  if (!name) {
    return res.status(400).json({
      success: false,
      error: 'Product name is required'
    });
  }

  if (!sku) {
    return res.status(400).json({
      success: false,
      error: 'SKU is required'
    });
  }

  const result = await query(
    `INSERT INTO products (
      name, description, sku, is_active
    ) VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [name, description, sku, is_active]
  );

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    data: result.rows[0]
  });
}));

// Update product (only editable fields)
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    sku,
    is_active
  } = req.body;

  const result = await query(
    `UPDATE products SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      sku = COALESCE($3, sku),
      is_active = COALESCE($4, is_active),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING *`,
    [name, description, sku, is_active, id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Product not found'
    });
  }

  res.json({
    success: true,
    message: 'Product updated successfully',
    data: result.rows[0]
  });
}));

// Delete product
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await query(
    'DELETE FROM products WHERE id = $1 RETURNING *',
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Product not found'
    });
  }

  res.json({
    success: true,
    message: 'Product deleted successfully'
  });
}));

// Get low stock products (simplified without min_stock_level)
router.get('/stock/low', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT * FROM products 
    WHERE stock_quantity <= 10 AND is_active = true
    ORDER BY stock_quantity ASC`
  );

  res.json({
    success: true,
    data: result.rows
  });
}));

// Update stock quantity from Shopify (for internal sync only)
router.patch('/:id/sync-shopify', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { price, stock_quantity, shopify_product_id } = req.body;

  const result = await query(
    `UPDATE products SET
      price = COALESCE($1, price),
      stock_quantity = COALESCE($2, stock_quantity),
      shopify_product_id = COALESCE($3, shopify_product_id),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *`,
    [price, stock_quantity, shopify_product_id, id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Product not found'
    });
  }

  res.json({
    success: true,
    message: 'Product synced with Shopify successfully',
    data: result.rows[0]
  });
}));

// Get product statistics
router.get('/stats/summary', asyncHandler(async (req, res) => {
  const stats = await query(`
    SELECT 
      COUNT(*) as total_products,
      COUNT(CASE WHEN is_active = true THEN 1 END) as active_products,
      COUNT(CASE WHEN stock_quantity <= 10 THEN 1 END) as low_stock_products,
      SUM(stock_quantity) as total_stock,
      AVG(price) as avg_price,
      MAX(price) as max_price,
      MIN(price) as min_price
    FROM products
  `);

  res.json({
    success: true,
    data: {
      summary: stats.rows[0]
    }
  });
}));

module.exports = router;