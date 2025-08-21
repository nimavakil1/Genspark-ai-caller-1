const express = require('express');
const { query, transaction } = require('../src/database');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Apply authentication to all product routes
router.use(authenticateToken);

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
    whereClause += ` AND (name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1} OR category ILIKE $${params.length + 1})`;
    params.push(`%${search}%`);
  }

  // Category filter
  if (category !== 'all') {
    whereClause += ` AND category = $${params.length + 1}`;
    params.push(category);
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
    category,
    price,
    currency = 'EUR',
    width_mm,
    diameter_mm,
    core_diameter_mm,
    thermal = false,
    color,
    stock_quantity = 0,
    min_stock_level = 10,
    is_active = true
  } = req.body;

  // Validation
  if (!name) {
    return res.status(400).json({
      success: false,
      error: 'Product name is required'
    });
  }

  if (price !== null && price !== undefined && price < 0) {
    return res.status(400).json({
      success: false,
      error: 'Price cannot be negative'
    });
  }

  const result = await query(
    `INSERT INTO products (
      name, description, category, price, currency,
      width_mm, diameter_mm, core_diameter_mm, thermal, color,
      stock_quantity, min_stock_level, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      name, description, category, price, currency,
      width_mm, diameter_mm, core_diameter_mm, thermal, color,
      stock_quantity, min_stock_level, is_active
    ]
  );

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    data: result.rows[0]
  });
}));

// Update product
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    category,
    price,
    currency,
    width_mm,
    diameter_mm,
    core_diameter_mm,
    thermal,
    color,
    stock_quantity,
    min_stock_level,
    is_active
  } = req.body;

  // Validation
  if (price !== null && price !== undefined && price < 0) {
    return res.status(400).json({
      success: false,
      error: 'Price cannot be negative'
    });
  }

  const result = await query(
    `UPDATE products SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      category = COALESCE($3, category),
      price = COALESCE($4, price),
      currency = COALESCE($5, currency),
      width_mm = COALESCE($6, width_mm),
      diameter_mm = COALESCE($7, diameter_mm),
      core_diameter_mm = COALESCE($8, core_diameter_mm),
      thermal = COALESCE($9, thermal),
      color = COALESCE($10, color),
      stock_quantity = COALESCE($11, stock_quantity),
      min_stock_level = COALESCE($12, min_stock_level),
      is_active = COALESCE($13, is_active),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $14
    RETURNING *`,
    [
      name, description, category, price, currency,
      width_mm, diameter_mm, core_diameter_mm, thermal, color,
      stock_quantity, min_stock_level, is_active, id
    ]
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

// Get product categories
router.get('/meta/categories', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT DISTINCT category 
    FROM products 
    WHERE category IS NOT NULL AND category != ''
    ORDER BY category`
  );

  res.json({
    success: true,
    data: result.rows.map(row => row.category)
  });
}));

// Get low stock products
router.get('/stock/low', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT * FROM products 
    WHERE stock_quantity <= min_stock_level AND is_active = true
    ORDER BY stock_quantity ASC`
  );

  res.json({
    success: true,
    data: result.rows
  });
}));

// Update stock quantity
router.patch('/:id/stock', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity, operation = 'set' } = req.body; // operation: 'set', 'add', 'subtract'

  if (quantity === undefined || quantity === null) {
    return res.status(400).json({
      success: false,
      error: 'Quantity is required'
    });
  }

  let updateQuery;
  let params;

  switch (operation) {
    case 'add':
      updateQuery = `UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`;
      params = [quantity, id];
      break;
    case 'subtract':
      updateQuery = `UPDATE products SET stock_quantity = GREATEST(stock_quantity - $1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`;
      params = [quantity, id];
      break;
    case 'set':
    default:
      updateQuery = `UPDATE products SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`;
      params = [quantity, id];
      break;
  }

  const result = await query(updateQuery, params);

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Product not found'
    });
  }

  res.json({
    success: true,
    message: 'Stock updated successfully',
    data: result.rows[0]
  });
}));

// Get product statistics
router.get('/stats/summary', asyncHandler(async (req, res) => {
  const stats = await query(`
    SELECT 
      COUNT(*) as total_products,
      COUNT(CASE WHEN is_active = true THEN 1 END) as active_products,
      COUNT(CASE WHEN stock_quantity <= min_stock_level THEN 1 END) as low_stock_products,
      SUM(stock_quantity) as total_stock,
      AVG(price) as avg_price,
      MAX(price) as max_price,
      MIN(price) as min_price
    FROM products
  `);

  const categories = await query(`
    SELECT 
      category,
      COUNT(*) as product_count
    FROM products
    WHERE category IS NOT NULL AND category != ''
    GROUP BY category
    ORDER BY product_count DESC
  `);

  res.json({
    success: true,
    data: {
      summary: stats.rows[0],
      categories: categories.rows
    }
  });
}));

module.exports = router;