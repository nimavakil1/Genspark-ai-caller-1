const express = require('express');
const { query } = require('../src/database');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Apply authentication to all call routes


// Get all call logs with pagination and filtering
router.get('/', asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    direction = 'all',
    status = 'all',
    customer_id = null,
    date_from = null,
    date_to = null
  } = req.query;

  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = [];

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

  // Customer filter
  if (customer_id) {
    whereClause += ` AND cl.customer_id = $${params.length + 1}`;
    params.push(customer_id);
  }

  // Date range filter
  if (date_from) {
    whereClause += ` AND cl.created_at >= $${params.length + 1}`;
    params.push(date_from);
  }

  if (date_to) {
    whereClause += ` AND cl.created_at <= $${params.length + 1}`;
    params.push(date_to + ' 23:59:59');
  }

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) FROM call_logs cl ${whereClause}`,
    params
  );
  const totalCalls = parseInt(countResult.rows[0].count);

  // Get call logs with customer information
  const result = await query(
    `SELECT 
      cl.*,
      c.company_name,
      c.contact_person
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

// Get single call log by ID
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await query(
    `SELECT 
      cl.*,
      c.company_name,
      c.contact_person,
      c.email,
      c.phone,
      c.mobile
    FROM call_logs cl
    LEFT JOIN customers c ON cl.customer_id = c.id
    WHERE cl.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Call log not found'
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
    duration,
    status,
    recording_url,
    ai_summary,
    sentiment,
    follow_up_required = false
  } = req.body;

  // Validation
  if (!phone_number || !direction || !status) {
    return res.status(400).json({
      success: false,
      error: 'Phone number, direction, and status are required'
    });
  }

  if (!['inbound', 'outbound'].includes(direction)) {
    return res.status(400).json({
      success: false,
      error: 'Direction must be either "inbound" or "outbound"'
    });
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
      error: 'Call log not found'
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
      error: 'Call log not found'
    });
  }

  res.json({
    success: true,
    message: 'Call log deleted successfully'
  });
}));

// Get call statistics
router.get('/stats/overview', asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;

  // Total calls
  const totalCallsResult = await query(
    'SELECT COUNT(*) as count FROM call_logs WHERE created_at >= CURRENT_DATE - INTERVAL $1',
    [`${days} days`]
  );

  // Calls by direction
  const directionStatsResult = await query(
    `SELECT 
      direction,
      COUNT(*) as count,
      AVG(duration) as avg_duration
    FROM call_logs 
    WHERE created_at >= CURRENT_DATE - INTERVAL $1
    GROUP BY direction`,
    [`${days} days`]
  );

  // Calls by status
  const statusStatsResult = await query(
    `SELECT 
      status,
      COUNT(*) as count
    FROM call_logs 
    WHERE created_at >= CURRENT_DATE - INTERVAL $1
    GROUP BY status`,
    [`${days} days`]
  );

  // Sentiment analysis
  const sentimentStatsResult = await query(
    `SELECT 
      sentiment,
      COUNT(*) as count
    FROM call_logs 
    WHERE created_at >= CURRENT_DATE - INTERVAL $1
      AND sentiment IS NOT NULL
    GROUP BY sentiment`,
    [`${days} days`]
  );

  // Follow-up required
  const followUpResult = await query(
    `SELECT 
      COUNT(CASE WHEN follow_up_required = true THEN 1 END) as follow_up_count,
      COUNT(*) as total_count
    FROM call_logs 
    WHERE created_at >= CURRENT_DATE - INTERVAL $1`,
    [`${days} days`]
  );

  res.json({
    success: true,
    data: {
      totalCalls: parseInt(totalCallsResult.rows[0].count),
      directionStats: directionStatsResult.rows,
      statusStats: statusStatsResult.rows,
      sentimentStats: sentimentStatsResult.rows,
      followUpStats: followUpResult.rows[0]
    }
  });
}));

// Get calls requiring follow-up
router.get('/follow-up/pending', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT 
      cl.*,
      c.company_name,
      c.contact_person,
      c.email,
      c.phone,
      c.mobile
    FROM call_logs cl
    LEFT JOIN customers c ON cl.customer_id = c.id
    WHERE cl.follow_up_required = true
    ORDER BY cl.created_at DESC`,
    []
  );

  res.json({
    success: true,
    data: result.rows
  });
}));

// Mark follow-up as completed
router.put('/:id/follow-up/complete', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await query(
    'UPDATE call_logs SET follow_up_required = false WHERE id = $1 RETURNING *',
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Call log not found'
    });
  }

  res.json({
    success: true,
    message: 'Follow-up marked as completed',
    data: result.rows[0]
  });
}));

module.exports = router;