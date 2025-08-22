const express = require('express');
const { query, transaction } = require('../src/database');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const TelnyxVoiceIntegration = require('../telnyxVoiceIntegration');

const router = express.Router();

// Create integration instance
const telnyxIntegration = new TelnyxVoiceIntegration();

/**
 * Telnyx Voice API Integration Routes
 * Server-side approach using Telnyx Voice API instead of WebRTC
 */

// Make outbound call using Telnyx Voice API
router.post('/outbound-call', authenticateToken, asyncHandler(async (req, res) => {
  const {
    customer_id,
    phone_number,
    from_number
  } = req.body;

  // Validation
  if (!phone_number) {
    return res.status(400).json({
      success: false,
      error: 'Phone number is required'
    });
  }

  // Check if customer exists and is not opted out
  if (customer_id) {
    const customerResult = await query(
      'SELECT company_name, opt_out FROM customers WHERE id = $1',
      [customer_id]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    if (customerResult.rows[0].opt_out) {
      return res.status(400).json({
        success: false,
        error: 'Customer has opted out of calls'
      });
    }
  }

  try {
    // Make outbound call using Telnyx Voice API
    const call = await telnyxIntegration.makeOutboundCall(
      phone_number,
      from_number || process.env.TELNYX_PHONE_NUMBER
    );

    // Log call initiation to database
    const callLogResult = await query(
      `INSERT INTO call_logs (customer_id, customer_phone, direction, start_time, status, call_control_id)
       VALUES ($1, $2, $3, NOW(), $4, $5)
       RETURNING id`,
      [customer_id, phone_number, 'outbound', 'initiated', call.call_control_id]
    );

    res.json({
      success: true,
      message: 'Outbound call initiated successfully',
      call_id: call.call_control_id,
      log_id: callLogResult.rows[0].id,
      to: phone_number,
      from: call.from,
      status: 'initiated'
    });

  } catch (error) {
    console.error('❌ Error making outbound call:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate outbound call',
      details: error.message
    });
  }
}));

// Webhook endpoint for Telnyx call events
router.post('/webhooks/call-events', asyncHandler(async (req, res) => {
  console.log('📨 Telnyx webhook received:', req.body?.event_type);
  
  try {
    // Handle the webhook using the integration
    telnyxIntegration.handleWebhook(req, res);
    
    // Additional database logging for specific events
    const event = req.body;
    const payload = event.payload;
    
    switch (event.event_type) {
      case 'call.initiated':
        await handleCallInitiatedWebhook(payload);
        break;
        
      case 'call.answered':
        await handleCallAnsweredWebhook(payload);
        break;
        
      case 'call.hangup':
        await handleCallHangupWebhook(payload);
        break;
        
      case 'call.recording.saved':
        await handleRecordingSavedWebhook(payload);
        break;
    }
    
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}));

// Get call status
router.get('/call-status/:callControlId', authenticateToken, asyncHandler(async (req, res) => {
  const { callControlId } = req.params;
  
  try {
    const callResult = await query(
      'SELECT * FROM call_logs WHERE call_control_id = $1 ORDER BY start_time DESC LIMIT 1',
      [callControlId]
    );
    
    if (callResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }
    
    const call = callResult.rows[0];
    
    res.json({
      success: true,
      call: {
        id: call.id,
        call_control_id: call.call_control_id,
        customer_id: call.customer_id,
        customer_phone: call.customer_phone,
        direction: call.direction,
        status: call.status,
        start_time: call.start_time,
        end_time: call.end_time,
        duration: call.duration,
        notes: call.notes,
        recording_url: call.recording_url
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching call status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch call status'
    });
  }
}));

// Get all calls (paginated)
router.get('/calls', authenticateToken, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  
  try {
    const callsResult = await query(
      `SELECT cl.*, c.company_name, c.contact_name
       FROM call_logs cl
       LEFT JOIN customers c ON cl.customer_id = c.id
       ORDER BY cl.start_time DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    const countResult = await query('SELECT COUNT(*) FROM call_logs');
    const totalCalls = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCalls / limit);
    
    res.json({
      success: true,
      calls: callsResult.rows,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_calls: totalCalls,
        limit: limit
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching calls:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch calls'
    });
  }
}));

// Test webhook endpoint (for development)
router.post('/test-webhook', asyncHandler(async (req, res) => {
  console.log('🧪 Test webhook called');
  
  const testEvent = {
    event_type: 'call.initiated',
    id: 'test-event-' + Date.now(),
    occurred_at: new Date().toISOString(),
    payload: {
      call_control_id: 'test-call-' + Date.now(),
      from: '+32479202020',
      to: process.env.TELNYX_PHONE_NUMBER || '+3226010500',
      direction: 'inbound',
      state: 'ringing'
    }
  };
  
  try {
    // Simulate webhook processing
    req.body = testEvent;
    telnyxIntegration.handleWebhook(req, res);
    
  } catch (error) {
    console.error('❌ Test webhook error:', error);
    res.status(500).json({ error: 'Test webhook failed' });
  }
}));

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Telnyx Voice API Integration',
    timestamp: new Date().toISOString(),
    configuration: {
      api_key_configured: !!process.env.TELNYX_API_KEY,
      phone_number: process.env.TELNYX_PHONE_NUMBER || 'not configured',
      webhook_url: `${process.env.SERVER_BASE_URL || 'http://localhost:3000'}/api/telnyx/webhooks/call-events`
    }
  });
});

// Helper functions for webhook processing
async function handleCallInitiatedWebhook(payload) {
  try {
    // Update or create call log entry
    await query(
      `INSERT INTO call_logs (call_control_id, customer_phone, direction, start_time, status)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (call_control_id) 
       DO UPDATE SET status = $4, start_time = NOW()`,
      [payload.call_control_id, payload.from, payload.direction, 'ringing']
    );
    
    console.log('📊 Call initiated logged to database');
    
  } catch (error) {
    console.error('❌ Error logging call initiation:', error);
  }
}

async function handleCallAnsweredWebhook(payload) {
  try {
    await query(
      `UPDATE call_logs 
       SET status = $1, answered_time = NOW()
       WHERE call_control_id = $2`,
      ['answered', payload.call_control_id]
    );
    
    console.log('📊 Call answered logged to database');
    
  } catch (error) {
    console.error('❌ Error logging call answer:', error);
  }
}

async function handleCallHangupWebhook(payload) {
  try {
    await query(
      `UPDATE call_logs 
       SET status = $1, end_time = NOW(), 
           duration = EXTRACT(EPOCH FROM (NOW() - start_time))
       WHERE call_control_id = $2`,
      ['completed', payload.call_control_id]
    );
    
    console.log('📊 Call hangup logged to database');
    
  } catch (error) {
    console.error('❌ Error logging call hangup:', error);
  }
}

async function handleRecordingSavedWebhook(payload) {
  try {
    await query(
      `UPDATE call_logs 
       SET recording_url = $1
       WHERE call_control_id = $2`,
      [payload.recording_url, payload.call_control_id]
    );
    
    console.log('📊 Recording URL saved to database');
    
  } catch (error) {
    console.error('❌ Error saving recording URL:', error);
  }
}

module.exports = router;