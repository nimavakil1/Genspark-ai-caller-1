const express = require('express');
const { query } = require('../src/database');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Apply authentication to all dashboard routes


// Get dashboard statistics
router.get('/stats', asyncHandler(async (req, res) => {
  try {
    // Get total customers
    const totalCustomersResult = await query('SELECT COUNT(*) as count FROM customers WHERE status = $1', ['active']);
    const totalCustomers = parseInt(totalCustomersResult.rows[0].count);

    // Get customers using receipt rolls
    const receiptRollCustomersResult = await query('SELECT COUNT(*) as count FROM customers WHERE uses_receipt_rolls = true AND status = $1', ['active']);
    const receiptRollCustomers = parseInt(receiptRollCustomersResult.rows[0].count);

    // Get total calls (last 30 days)
    const totalCallsResult = await query(
      'SELECT COUNT(*) as count FROM call_logs WHERE created_at >= CURRENT_DATE - INTERVAL \'30 days\'',
      []
    );
    const totalCalls = parseInt(totalCallsResult.rows[0].count);

    // Get successful calls (last 30 days)
    const successfulCallsResult = await query(
      'SELECT COUNT(*) as count FROM call_logs WHERE status = $1 AND created_at >= CURRENT_DATE - INTERVAL \'30 days\'',
      ['completed']
    );
    const successfulCalls = parseInt(successfulCallsResult.rows[0].count);

    // Get total orders (last 30 days)
    const totalOrdersResult = await query(
      'SELECT COUNT(*) as count FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL \'30 days\'',
      []
    );
    const totalOrders = parseInt(totalOrdersResult.rows[0].count);

    // Get pending orders
    const pendingOrdersResult = await query('SELECT COUNT(*) as count FROM orders WHERE status = $1', ['pending']);
    const pendingOrders = parseInt(pendingOrdersResult.rows[0].count);

    // Get total revenue (last 30 days)
    const revenueResult = await query(
      'SELECT COALESCE(SUM(total_amount), 0) as revenue FROM orders WHERE status = $1 AND created_at >= CURRENT_DATE - INTERVAL \'30 days\'',
      ['completed']
    );
    const totalRevenue = parseFloat(revenueResult.rows[0].revenue);

    // Get active products
    const activeProductsResult = await query('SELECT COUNT(*) as count FROM products WHERE is_active = true');
    const activeProducts = parseInt(activeProductsResult.rows[0].count);

    // Calculate call success rate
    const callSuccessRate = totalCalls > 0 ? ((successfulCalls / totalCalls) * 100).toFixed(1) : 0;

    // Get recent activities (last 10)
    const recentActivitiesResult = await query(`
      SELECT 
        'call' as type,
        cl.id,
        c.company_name as title,
        cl.status as status,
        cl.created_at
      FROM call_logs cl
      LEFT JOIN customers c ON cl.customer_id = c.id
      
      UNION ALL
      
      SELECT 
        'order' as type,
        o.id,
        c.company_name as title,
        o.status as status,
        o.created_at
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      
      ORDER BY created_at DESC
      LIMIT 10
    `);

    const recentActivities = recentActivitiesResult.rows;

    res.json({
      success: true,
      data: {
        overview: {
          totalCustomers,
          receiptRollCustomers,
          totalCalls,
          successfulCalls,
          totalOrders,
          pendingOrders,
          totalRevenue,
          activeProducts,
          callSuccessRate: parseFloat(callSuccessRate)
        },
        recentActivities
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics'
    });
  }
}));

// Get call analytics
router.get('/analytics/calls', asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;

  // Daily call volume
  const dailyCallsResult = await query(`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as total_calls,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_calls,
      COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound_calls,
      COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound_calls
    FROM call_logs 
    WHERE created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `);

  // Call status distribution
  const statusDistributionResult = await query(`
    SELECT 
      status,
      COUNT(*) as count
    FROM call_logs 
    WHERE created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
    GROUP BY status
  `);

  // Average call duration by status
  const avgDurationResult = await query(`
    SELECT 
      status,
      AVG(duration) as avg_duration
    FROM call_logs 
    WHERE created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
      AND duration IS NOT NULL
    GROUP BY status
  `);

  // Top customers by call frequency
  const topCustomersResult = await query(`
    SELECT 
      c.company_name,
      COUNT(cl.id) as call_count,
      COUNT(CASE WHEN cl.status = 'completed' THEN 1 END) as successful_calls
    FROM call_logs cl
    JOIN customers c ON cl.customer_id = c.id
    WHERE cl.created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
    GROUP BY c.id, c.company_name
    ORDER BY call_count DESC
    LIMIT 10
  `);

  res.json({
    success: true,
    data: {
      dailyCalls: dailyCallsResult.rows,
      statusDistribution: statusDistributionResult.rows,
      avgDurationByStatus: avgDurationResult.rows,
      topCustomers: topCustomersResult.rows
    }
  });
}));

// Get sales analytics
router.get('/analytics/sales', asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;

  // Daily sales volume
  const dailySalesResult = await query(`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as total_orders,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN total_amount END), 0) as revenue
    FROM orders 
    WHERE created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `);

  // Order status distribution
  const orderStatusResult = await query(`
    SELECT 
      status,
      COUNT(*) as count,
      COALESCE(SUM(total_amount), 0) as total_value
    FROM orders 
    WHERE created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
    GROUP BY status
  `);

  // Top products by sales
  const topProductsResult = await query(`
    SELECT 
      p.name as product_name,
      SUM(oi.quantity) as total_quantity,
      COALESCE(SUM(oi.total_price), 0) as total_revenue
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    JOIN orders o ON oi.order_id = o.id
    WHERE o.created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
      AND o.status = 'completed'
    GROUP BY p.id, p.name
    ORDER BY total_revenue DESC
    LIMIT 10
  `);

  // Customer revenue ranking
  const topRevenueCustomersResult = await query(`
    SELECT 
      c.company_name,
      COUNT(o.id) as order_count,
      COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total_amount END), 0) as total_revenue
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    WHERE o.created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
    GROUP BY c.id, c.company_name
    HAVING SUM(CASE WHEN o.status = 'completed' THEN o.total_amount END) > 0
    ORDER BY total_revenue DESC
    LIMIT 10
  `);

  res.json({
    success: true,
    data: {
      dailySales: dailySalesResult.rows,
      orderStatus: orderStatusResult.rows,
      topProducts: topProductsResult.rows,
      topRevenueCustomers: topRevenueCustomersResult.rows
    }
  });
}));

// Get customer analytics
router.get('/analytics/customers', asyncHandler(async (req, res) => {
  // Customer growth over time
  const customerGrowthResult = await query(`
    SELECT 
      DATE_TRUNC('month', created_at) as month,
      COUNT(*) as new_customers
    FROM customers 
    WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY month ASC
  `);

  // Customer segmentation
  const customerSegmentationResult = await query(`
    SELECT 
      CASE 
        WHEN uses_receipt_rolls = true THEN 'Receipt Roll Users'
        ELSE 'Other Customers'
      END as segment,
      COUNT(*) as count
    FROM customers 
    WHERE status = 'active'
    GROUP BY uses_receipt_rolls
  `);

  // Geographic distribution (by city)
  const geographicResult = await query(`
    SELECT 
      invoice_address_city as city,
      COUNT(*) as customer_count
    FROM customers 
    WHERE status = 'active' 
      AND invoice_address_city IS NOT NULL
    GROUP BY invoice_address_city
    ORDER BY customer_count DESC
    LIMIT 10
  `);

  // Customer activity levels (based on orders)
  const activityLevelsResult = await query(`
    SELECT 
      CASE 
        WHEN order_count = 0 THEN 'No Orders'
        WHEN order_count BETWEEN 1 AND 5 THEN 'Low Activity'
        WHEN order_count BETWEEN 6 AND 15 THEN 'Medium Activity'
        ELSE 'High Activity'
      END as activity_level,
      COUNT(*) as customer_count
    FROM (
      SELECT 
        c.id,
        COUNT(o.id) as order_count
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      WHERE c.status = 'active'
      GROUP BY c.id
    ) customer_orders
    GROUP BY 
      CASE 
        WHEN order_count = 0 THEN 'No Orders'
        WHEN order_count BETWEEN 1 AND 5 THEN 'Low Activity'
        WHEN order_count BETWEEN 6 AND 15 THEN 'Medium Activity'
        ELSE 'High Activity'
      END
  `);

  res.json({
    success: true,
    data: {
      customerGrowth: customerGrowthResult.rows,
      segmentation: customerSegmentationResult.rows,
      geographic: geographicResult.rows,
      activityLevels: activityLevelsResult.rows
    }
  });
}));

module.exports = router;