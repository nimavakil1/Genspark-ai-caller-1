const express = require('express');
const { query, transaction } = require('../src/database');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Apply authentication to all order routes
router.use(authenticateToken);

// Generate order number
function generateOrderNumber() {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `ORD${year}${month}${day}-${random}`;
}

// Get all orders with pagination and filtering
router.get('/', asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    customer_id,
    status = 'all',
    start_date,
    end_date
  } = req.query;

  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = [];

  // Customer filter
  if (customer_id) {
    whereClause += ` AND o.customer_id = $${params.length + 1}`;
    params.push(customer_id);
  }

  // Status filter
  if (status !== 'all') {
    whereClause += ` AND o.status = $${params.length + 1}`;
    params.push(status);
  }

  // Date range filter
  if (start_date) {
    whereClause += ` AND o.created_at >= $${params.length + 1}`;
    params.push(start_date);
  }

  if (end_date) {
    whereClause += ` AND o.created_at <= $${params.length + 1}`;
    params.push(end_date);
  }

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) FROM orders o ${whereClause}`,
    params
  );
  const totalOrders = parseInt(countResult.rows[0].count);

  // Get orders with customer and delivery information
  const result = await query(
    `SELECT 
      o.*,
      c.company_name,
      c.contact_person,
      c.opt_out,
      da.street as delivery_street,
      da.number as delivery_number,
      da.city as delivery_city,
      da.postal_code as delivery_postal_code,
      da.country as delivery_country,
      COUNT(oi.id) as item_count
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN delivery_addresses da ON o.delivery_address_id = da.id
    LEFT JOIN order_items oi ON o.id = oi.order_id
    ${whereClause}
    GROUP BY o.id, c.company_name, c.contact_person, c.opt_out,
             da.street, da.number, da.city, da.postal_code, da.country
    ORDER BY o.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  res.json({
    success: true,
    data: {
      orders: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
        hasNext: offset + limit < totalOrders,
        hasPrev: page > 1
      }
    }
  });
}));

// Get single order by ID with full details
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const orderResult = await query(
    `SELECT 
      o.*,
      c.company_name,
      c.contact_person,
      c.email,
      c.phone,
      c.mobile,
      c.opt_out,
      da.street as delivery_street,
      da.number as delivery_number,
      da.city as delivery_city,
      da.postal_code as delivery_postal_code,
      da.country as delivery_country
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN delivery_addresses da ON o.delivery_address_id = da.id
    WHERE o.id = $1`,
    [id]
  );

  if (orderResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Order not found'
    });
  }

  // Get order items
  const itemsResult = await query(
    `SELECT 
      oi.*,
      p.name as product_name,
      p.description as product_description,
      p.width_mm,
      p.diameter_mm,
      p.thermal,
      p.color
    FROM order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = $1
    ORDER BY oi.id`,
    [id]
  );

  const order = orderResult.rows[0];
  order.items = itemsResult.rows;

  res.json({
    success: true,
    data: order
  });
}));

// Create new order
router.post('/', asyncHandler(async (req, res) => {
  const {
    customer_id,
    delivery_address_id,
    items = [], // Array of { product_id, quantity, unit_price }
    notes,
    status = 'pending'
  } = req.body;

  // Validation
  if (!customer_id) {
    return res.status(400).json({
      success: false,
      error: 'Customer ID is required'
    });
  }

  if (!items || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Order must contain at least one item'
    });
  }

  // Check if customer exists and is not opted out
  const customerResult = await query(
    'SELECT opt_out FROM customers WHERE id = $1',
    [customer_id]
  );

  if (customerResult.rows.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Customer not found'
    });
  }

  if (customerResult.rows[0].opt_out) {
    return res.status(400).json({
      success: false,
      error: 'Cannot create orders for customers who have opted out'
    });
  }

  const result = await transaction(async (client) => {
    // Calculate total amount
    let totalAmount = 0;
    for (const item of items) {
      totalAmount += parseFloat(item.unit_price || 0) * parseInt(item.quantity || 0);
    }

    // Generate unique order number
    let orderNumber;
    let attempts = 0;
    do {
      orderNumber = generateOrderNumber();
      attempts++;
      if (attempts > 10) throw new Error('Failed to generate unique order number');
      
      const existingOrder = await client.query(
        'SELECT id FROM orders WHERE order_number = $1',
        [orderNumber]
      );
      if (existingOrder.rows.length === 0) break;
    } while (true);

    // Create order
    const orderResult = await client.query(
      `INSERT INTO orders (
        customer_id, order_number, status, total_amount, currency,
        delivery_address_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        customer_id, orderNumber, status, totalAmount, 'EUR',
        delivery_address_id, notes
      ]
    );

    const order = orderResult.rows[0];

    // Create order items and update stock
    for (const item of items) {
      const unitPrice = parseFloat(item.unit_price || 0);
      const quantity = parseInt(item.quantity || 0);
      const totalPrice = unitPrice * quantity;

      // Insert order item
      await client.query(
        `INSERT INTO order_items (
          order_id, product_id, quantity, unit_price, total_price
        ) VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.product_id, quantity, unitPrice, totalPrice]
      );

      // Update product stock (subtract quantity)
      await client.query(
        `UPDATE products 
        SET stock_quantity = GREATEST(stock_quantity - $1, 0),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
        [quantity, item.product_id]
      );
    }

    return order;
  });

  res.status(201).json({
    success: true,
    message: 'Order created successfully',
    data: result
  });
}));

// Update order status
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Valid statuses: ${validStatuses.join(', ')}`
    });
  }

  const result = await query(
    `UPDATE orders SET
      status = $1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING *`,
    [status, id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Order not found'
    });
  }

  res.json({
    success: true,
    message: 'Order status updated successfully',
    data: result.rows[0]
  });
}));

// Update order
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    delivery_address_id,
    notes,
    status
  } = req.body;

  const result = await query(
    `UPDATE orders SET
      delivery_address_id = COALESCE($1, delivery_address_id),
      notes = COALESCE($2, notes),
      status = COALESCE($3, status),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *`,
    [delivery_address_id, notes, status, id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Order not found'
    });
  }

  res.json({
    success: true,
    message: 'Order updated successfully',
    data: result.rows[0]
  });
}));

// Cancel order (restores stock)
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await transaction(async (client) => {
    // Get order details
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      throw new Error('Order not found');
    }

    const order = orderResult.rows[0];

    // Get order items to restore stock
    const itemsResult = await client.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [id]
    );

    // Restore stock for each item
    for (const item of itemsResult.rows) {
      await client.query(
        `UPDATE products 
        SET stock_quantity = stock_quantity + $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
        [item.quantity, item.product_id]
      );
    }

    // Delete order (cascade will delete order_items)
    await client.query('DELETE FROM orders WHERE id = $1', [id]);

    return order;
  });

  res.json({
    success: true,
    message: 'Order cancelled successfully and stock restored'
  });
}));

// Get order statistics
router.get('/stats/summary', asyncHandler(async (req, res) => {
  const { start_date, end_date, customer_id } = req.query;

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (start_date) {
    whereClause += ` AND created_at >= $${params.length + 1}`;
    params.push(start_date);
  }

  if (end_date) {
    whereClause += ` AND created_at <= $${params.length + 1}`;
    params.push(end_date);
  }

  if (customer_id) {
    whereClause += ` AND customer_id = $${params.length + 1}`;
    params.push(customer_id);
  }

  const stats = await query(`
    SELECT 
      COUNT(*) as total_orders,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
      COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_orders,
      COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_orders,
      COUNT(CASE WHEN status = 'shipped' THEN 1 END) as shipped_orders,
      COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
      SUM(total_amount) as total_revenue,
      AVG(total_amount) as avg_order_value,
      MAX(total_amount) as max_order_value,
      MIN(total_amount) as min_order_value
    FROM orders
    ${whereClause}
  `, params);

  const statusStats = await query(`
    SELECT 
      status,
      COUNT(*) as count,
      SUM(total_amount) as revenue
    FROM orders
    ${whereClause}
    GROUP BY status
    ORDER BY count DESC
  `, params);

  res.json({
    success: true,
    data: {
      summary: stats.rows[0],
      status_breakdown: statusStats.rows
    }
  });
}));

module.exports = router;