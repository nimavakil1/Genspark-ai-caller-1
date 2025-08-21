const express = require('express');
const { query } = require('../src/database');
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
    is_active = 'all',
    low_stock = 'false'
  } = req.query;

  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = [];

  // Search filter
  if (search) {
    whereClause += ` AND (name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1})`;
    params.push(`%${search}%`);
  }

  // Category filter
  if (category !== 'all') {
    whereClause += ` AND category = $${params.length + 1}`;
    params.push(category);
  }

  // Active status filter
  if (is_active !== 'all') {
    whereClause += ` AND is_active = $${params.length + 1}`;
    params.push(is_active === 'true');
  }

  // Low stock filter
  if (low_stock === 'true') {
    whereClause += ` AND stock_quantity <= min_stock_level`;
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

  if (price && price < 0) {
    return res.status(400).json({
      success: false,
      error: 'Price cannot be negative'
    });
  }

  const result = await query(
    `INSERT INTO products (
      name, description, category, price, currency, width_mm, diameter_mm,
      core_diameter_mm, thermal, color, stock_quantity, min_stock_level, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      name, description, category, price, currency, width_mm, diameter_mm,
      core_diameter_mm, thermal, color, stock_quantity, min_stock_level, is_active
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
  if (price && price < 0) {
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
      name, description, category, price, currency, width_mm, diameter_mm,
      core_diameter_mm, thermal, color, stock_quantity, min_stock_level,
      is_active, id
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

  // Check if product is used in any orders
  const ordersResult = await query(
    'SELECT COUNT(*) as count FROM order_items WHERE product_id = $1',
    [id]
  );

  if (parseInt(ordersResult.rows[0].count) > 0) {
    return res.status(400).json({
      success: false,
      error: 'Cannot delete product that is referenced in orders. Set it as inactive instead.'
    });
  }

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
router.get('/categories/list', asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category ASC',
    []
  );

  const categories = result.rows.map(row => row.category);

  res.json({
    success: true,
    data: categories
  });
}));

// Get low stock products
router.get('/stock/low', asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT * FROM products WHERE stock_quantity <= min_stock_level AND is_active = true ORDER BY stock_quantity ASC',
    []
  );

  res.json({
    success: true,
    data: result.rows
  });
}));

// Update stock quantity
router.put('/:id/stock', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity, operation = 'set' } = req.body;

  if (typeof quantity !== 'number') {
    return res.status(400).json({
      success: false,
      error: 'Quantity must be a number'
    });
  }

  let updateQuery = '';
  let params = [];

  switch (operation) {
    case 'set':
      updateQuery = 'UPDATE products SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
      params = [quantity, id];
      break;
    case 'add':
      updateQuery = 'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
      params = [quantity, id];
      break;
    case 'subtract':
      updateQuery = 'UPDATE products SET stock_quantity = GREATEST(stock_quantity - $1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
      params = [quantity, id];
      break;
    default:
      return res.status(400).json({
        success: false,
        error: 'Invalid operation. Use "set", "add", or "subtract"'
      });
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
    message: `Stock ${operation === 'set' ? 'updated' : operation === 'add' ? 'increased' : 'decreased'} successfully`,
    data: result.rows[0]
  });
}));

// Get product statistics
router.get('/stats/overview', asyncHandler(async (req, res) => {
  // Total products
  const totalProductsResult = await query('SELECT COUNT(*) as count FROM products');
  const totalProducts = parseInt(totalProductsResult.rows[0].count);

  // Active products
  const activeProductsResult = await query('SELECT COUNT(*) as count FROM products WHERE is_active = true');
  const activeProducts = parseInt(activeProductsResult.rows[0].count);

  // Low stock products
  const lowStockResult = await query('SELECT COUNT(*) as count FROM products WHERE stock_quantity <= min_stock_level');
  const lowStockProducts = parseInt(lowStockResult.rows[0].count);

  // Products by category
  const categoriesResult = await query(
    `SELECT 
      category,
      COUNT(*) as count
    FROM products 
    WHERE category IS NOT NULL
    GROUP BY category
    ORDER BY count DESC`
  );

  // Average price by category
  const avgPriceResult = await query(
    `SELECT 
      category,
      AVG(price) as avg_price,
      MIN(price) as min_price,
      MAX(price) as max_price
    FROM products 
    WHERE category IS NOT NULL AND price IS NOT NULL
    GROUP BY category
    ORDER BY avg_price DESC`
  );

  // Total inventory value
  const inventoryValueResult = await query(
    'SELECT SUM(stock_quantity * COALESCE(price, 0)) as total_value FROM products WHERE is_active = true'
  );
  const totalInventoryValue = parseFloat(inventoryValueResult.rows[0].total_value) || 0;

  res.json({
    success: true,
    data: {
      totalProducts,
      activeProducts,
      lowStockProducts,
      totalInventoryValue,
      categoriesStats: categoriesResult.rows,
      avgPriceByCategory: avgPriceResult.rows
    }
  });
}));

module.exports = router;