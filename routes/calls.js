const express = require('express');
const { query, transaction } = require('../src/database');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Apply authentication to all call routes


// Get all calls with pagination and filtering
router.get('/', asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    customer_id,
    direction = 'all',
    status = 'all',
    start_date,
    end_date
  } = req.query;

  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = [];

  // Customer filter
  if (customer_id) {
    whereClause += ` AND cl.customer_id = $${params.length + 1}`;
    params.push(customer_id);
  }

  // Direction filter
  if (direction !== 'all') {
    whereClause += ` AND cl.direction = $${params.length + 1}`;
    params.push(direction);
  }

  // Status filter
  if (status !== 'all') {
    whereClause += ` AND cl.status = $${params.length + 1}`;
    params.push(status);
  }

  // Date range filter
  if (start_date) {
    whereClause += ` AND cl.created_at >= $${params.length + 1}`;
    params.push(start_date);
  }

  if (end_date) {
    whereClause += ` AND cl.created_at <= $${params.length + 1}`;
    params.push(end_date);
  }

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) FROM call_logs cl ${whereClause}`,
    params
  );
  const totalCalls = parseInt(countResult.rows[0].count);

  // Get calls with customer information
  const result = await query(
    `SELECT 
      cl.*,
      c.company_name,
      c.contact_person,
      c.opt_out
    FROM call_logs cl
    LEFT JOIN customers c ON cl.customer_id = c.id
    ${whereClause}
    ORDER BY cl.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  res.json({
    success: true,
    data: {
      calls: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCalls / limit),
        totalCalls,
        hasNext: offset + limit < totalCalls,
        hasPrev: page > 1
      }
    }
  });
}));

// Get single call by ID
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await query(
    `SELECT 
      cl.*,
      c.company_name,
      c.contact_person,
      c.email,
      c.phone,
      c.mobile,
      c.opt_out
    FROM call_logs cl
    LEFT JOIN customers c ON cl.customer_id = c.id
    WHERE cl.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Call not found'
    });
  }

  res.json({
    success: true,
    data: result.rows[0]
  });
}));

// Create new call log
router.post('/', asyncHandler(async (req, res) => {
  const {
    customer_id,
    phone_number,
    direction,
    duration = 0,
    status,
    recording_url,
    ai_summary,
    sentiment,
    follow_up_required = false
  } = req.body;

  // Validation
  if (!phone_number || !direction) {
    return res.status(400).json({
      success: false,
      error: 'Phone number and direction are required'
    });
  }

  if (!['inbound', 'outbound'].includes(direction)) {
    return res.status(400).json({
      success: false,
      error: 'Direction must be either "inbound" or "outbound"'
    });
  }

  // Check if customer exists and is not opted out for outbound calls
  if (customer_id && direction === 'outbound') {
    const customerResult = await query(
      'SELECT opt_out FROM customers WHERE id = $1',
      [customer_id]
    );

    if (customerResult.rows.length > 0 && customerResult.rows[0].opt_out) {
      return res.status(400).json({
        success: false,
        error: 'Cannot make outbound calls to customers who have opted out'
      });
    }
  }

  const result = await query(
    `INSERT INTO call_logs (
      customer_id, phone_number, direction, duration, status,
      recording_url, ai_summary, sentiment, follow_up_required
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      customer_id, phone_number, direction, duration, status,
      recording_url, ai_summary, sentiment, follow_up_required
    ]
  );

  res.status(201).json({
    success: true,
    message: 'Call log created successfully',
    data: result.rows[0]
  });
}));

// Update call log
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    customer_id,
    phone_number,
    direction,
    duration,
    status,
    recording_url,
    ai_summary,
    sentiment,
    follow_up_required
  } = req.body;

  const result = await query(
    `UPDATE call_logs SET
      customer_id = COALESCE($1, customer_id),
      phone_number = COALESCE($2, phone_number),
      direction = COALESCE($3, direction),
      duration = COALESCE($4, duration),
      status = COALESCE($5, status),
      recording_url = COALESCE($6, recording_url),
      ai_summary = COALESCE($7, ai_summary),
      sentiment = COALESCE($8, sentiment),
      follow_up_required = COALESCE($9, follow_up_required)
    WHERE id = $10
    RETURNING *`,
    [
      customer_id, phone_number, direction, duration, status,
      recording_url, ai_summary, sentiment, follow_up_required, id
    ]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Call not found'
    });
  }

  res.json({
    success: true,
    message: 'Call log updated successfully',
    data: result.rows[0]
  });
}));

// Delete call log
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await query(
    'DELETE FROM call_logs WHERE id = $1 RETURNING *',
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Call not found'
    });
  }

  res.json({
    success: true,
    message: 'Call log deleted successfully'
  });
}));

// Get call statistics
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
      COUNT(*) as total_calls,
      COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound_calls,
      COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound_calls,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_calls,
      COUNT(CASE WHEN status = 'missed' THEN 1 END) as missed_calls,
      COUNT(CASE WHEN follow_up_required = true THEN 1 END) as follow_up_required,
      AVG(duration) as avg_duration,
      MAX(duration) as max_duration,
      MIN(duration) as min_duration
    FROM call_logs
    ${whereClause}
  `, params);

  const sentimentStats = await query(`
    SELECT 
      sentiment,
      COUNT(*) as count
    FROM call_logs
    ${whereClause} AND sentiment IS NOT NULL
    GROUP BY sentiment
    ORDER BY count DESC
  `, params);

  res.json({
    success: true,
    data: {
      summary: stats.rows[0],
      sentiment: sentimentStats.rows
    }
  });
}));

module.exports = router;