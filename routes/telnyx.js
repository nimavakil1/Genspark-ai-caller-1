const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { query, transaction } = require('../src/database');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * Telnyx + LiveKit Integration Routes
 * Based on official Telnyx documentation:
 * https://developers.telnyx.com/docs/voice/sip-trunking/livekit-configuration-guide
 */

// Make outbound call using LiveKit CLI
router.post('/outbound-call', authenticateToken, asyncHandler(async (req, res) => {
  const {
    customer_id,
    phone_number,
    room_name = 'ai-sales-call',
    participant_identity = 'ai-sales-agent',
    participant_name = 'AI Sales Agent'
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
        error: 'Cannot call customers who have opted out'
      });
    }
  }

  try {
    // Read outbound trunk ID
    const trunkIdPath = path.join(__dirname, '../outbound_trunk_id.txt');
    let outboundTrunkId;
    
    try {
      outboundTrunkId = (await fs.readFile(trunkIdPath, 'utf-8')).trim();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Outbound trunk not configured. Please run setup-telnyx-livekit.sh first.'
      });
    }

    // Create sipParticipant configuration
    const sipConfig = {
      sip_trunk_id: outboundTrunkId,
      sip_call_to: phone_number,
      room_name: room_name,
      participant_identity: participant_identity,
      participant_name: participant_name
    };

    // Write temporary config file
    const configPath = path.join(__dirname, '../temp_sip_config.json');
    await fs.writeFile(configPath, JSON.stringify(sipConfig, null, 2));

    // Execute LiveKit CLI command
    const lkProcess = spawn('lk', ['sip', 'participant', 'create', configPath], {
      env: {
        ...process.env,
        LIVEKIT_URL: process.env.LIVEKIT_WS_URL || 'ws://localhost:7880',
        LK_API_KEY: process.env.LIVEKIT_API_KEY,
        LK_API_SECRET: process.env.LIVEKIT_API_SECRET
      }
    });

    let output = '';
    let errorOutput = '';

    lkProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    lkProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    lkProcess.on('close', async (code) => {
      // Clean up temp file
      try {
        await fs.unlink(configPath);
      } catch (error) {
        console.error('Failed to clean up temp config file:', error);
      }

      if (code === 0) {
        // Parse response to get call details
        let callData;
        try {
          callData = JSON.parse(output);
        } catch (error) {
          callData = { output, raw: true };
        }

        // Log the call in database
        try {
          const callLog = await query(
            `INSERT INTO call_logs (
              customer_id, phone_number, direction, status, 
              ai_summary, created_at
            ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            RETURNING *`,
            [
              customer_id || null,
              phone_number,
              'outbound',
              'initiated',
              `Outbound call initiated via LiveKit. Room: ${room_name}`
            ]
          );

          res.json({
            success: true,
            message: 'Outbound call initiated successfully',
            data: {
              call_log_id: callLog.rows[0].id,
              phone_number,
              room_name,
              participant_identity,
              livekit_response: callData
            }
          });
        } catch (dbError) {
          console.error('Database error logging call:', dbError);
          res.json({
            success: true,
            message: 'Outbound call initiated successfully (logging failed)',
            data: {
              phone_number,
              room_name,
              participant_identity,
              livekit_response: callData
            }
          });
        }
      } else {
        console.error('LiveKit CLI error:', errorOutput);
        res.status(500).json({
          success: false,
          error: 'Failed to initiate outbound call',
          details: errorOutput || 'LiveKit CLI command failed'
        });
      }
    });

  } catch (error) {
    console.error('Outbound call error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}));

// Webhook handler for Telnyx call events
router.post('/webhooks/call-events', asyncHandler(async (req, res) => {
  const { data, event_type } = req.body;

  console.log('Telnyx webhook received:', { event_type, data });

  try {
    // Extract call information
    const {
      call_control_id,
      from,
      to,
      direction,
      state,
      start_time,
      end_time,
      duration_secs
    } = data || {};

    // Find customer by phone number
    let customerId = null;
    if (from || to) {
      const phoneToSearch = direction === 'incoming' ? from : to;
      const customerResult = await query(
        'SELECT id FROM customers WHERE phone = $1 OR mobile = $1',
        [phoneToSearch]
      );
      
      if (customerResult.rows.length > 0) {
        customerId = customerResult.rows[0].id;
      }
    }

    // Update or create call log based on event type
    switch (event_type) {
      case 'call.initiated':
        await query(
          `INSERT INTO call_logs (
            customer_id, phone_number, direction, status, 
            ai_summary, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT DO NOTHING`,
          [
            customerId,
            direction === 'incoming' ? from : to,
            direction === 'incoming' ? 'inbound' : 'outbound',
            'initiated',
            `Call ${event_type}: ${state}`,
            start_time ? new Date(start_time) : new Date()
          ]
        );
        break;

      case 'call.answered':
        await query(
          `UPDATE call_logs SET 
            status = 'answered',
            ai_summary = COALESCE(ai_summary, '') || $1
          WHERE phone_number = $2 AND created_at >= NOW() - INTERVAL '1 hour'`,
          [
            ` | Call answered at ${new Date().toISOString()}`,
            direction === 'incoming' ? from : to
          ]
        );
        break;

      case 'call.hangup':
        await query(
          `UPDATE call_logs SET 
            status = 'completed',
            duration = $1,
            ai_summary = COALESCE(ai_summary, '') || $2
          WHERE phone_number = $3 AND created_at >= NOW() - INTERVAL '1 hour'`,
          [
            duration_secs || 0,
            ` | Call ended at ${new Date().toISOString()}. Duration: ${duration_secs}s`,
            direction === 'incoming' ? from : to
          ]
        );
        break;

      case 'call.machine.detection.ended':
        const { result } = data;
        await query(
          `UPDATE call_logs SET 
            ai_summary = COALESCE(ai_summary, '') || $1
          WHERE phone_number = $2 AND created_at >= NOW() - INTERVAL '1 hour'`,
          [
            ` | Machine detection: ${result}`,
            direction === 'incoming' ? from : to
          ]
        );
        break;

      default:
        console.log('Unhandled Telnyx event type:', event_type);
    }

    // Respond to Telnyx webhook
    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook'
    });
  }
}));

// Get LiveKit room information
router.get('/room/:roomName', authenticateToken, asyncHandler(async (req, res) => {
  const { roomName } = req.params;

  try {
    // Execute LiveKit CLI to get room info
    const lkProcess = spawn('lk', ['room', 'info', roomName], {
      env: {
        ...process.env,
        LIVEKIT_URL: process.env.LIVEKIT_WS_URL || 'ws://localhost:7880',
        LK_API_KEY: process.env.LIVEKIT_API_KEY,
        LK_API_SECRET: process.env.LIVEKIT_API_SECRET
      }
    });

    let output = '';
    let errorOutput = '';

    lkProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    lkProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    lkProcess.on('close', (code) => {
      if (code === 0) {
        try {
          const roomInfo = JSON.parse(output);
          res.json({
            success: true,
            data: roomInfo
          });
        } catch (error) {
          res.json({
            success: true,
            data: { output, raw: true }
          });
        }
      } else {
        res.status(404).json({
          success: false,
          error: 'Room not found or command failed',
          details: errorOutput
        });
      }
    });

  } catch (error) {
    console.error('Room info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get room information'
    });
  }
}));

// List active SIP trunks
router.get('/sip/trunks', authenticateToken, asyncHandler(async (req, res) => {
  try {
    // Get inbound trunks
    const inboundProcess = spawn('lk', ['sip', 'inbound', 'list'], {
      env: {
        ...process.env,
        LIVEKIT_URL: process.env.LIVEKIT_WS_URL || 'ws://localhost:7880',
        LK_API_KEY: process.env.LIVEKIT_API_KEY,
        LK_API_SECRET: process.env.LIVEKIT_API_SECRET
      }
    });

    let inboundOutput = '';
    inboundProcess.stdout.on('data', (data) => {
      inboundOutput += data.toString();
    });

    inboundProcess.on('close', (code) => {
      if (code === 0) {
        // Get outbound trunks
        const outboundProcess = spawn('lk', ['sip', 'outbound', 'list'], {
          env: {
            ...process.env,
            LIVEKIT_URL: process.env.LIVEKIT_WS_URL || 'ws://localhost:7880',
            LK_API_KEY: process.env.LIVEKIT_API_KEY,
            LK_API_SECRET: process.env.LIVEKIT_API_SECRET
          }
        });

        let outboundOutput = '';
        outboundProcess.stdout.on('data', (data) => {
          outboundOutput += data.toString();
        });

        outboundProcess.on('close', (outboundCode) => {
          try {
            const response = {
              success: true,
              data: {
                inbound: code === 0 ? JSON.parse(inboundOutput) : null,
                outbound: outboundCode === 0 ? JSON.parse(outboundOutput) : null
              }
            };
            res.json(response);
          } catch (error) {
            res.json({
              success: true,
              data: {
                inbound: inboundOutput,
                outbound: outboundOutput,
                raw: true
              }
            });
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to list SIP trunks'
        });
      }
    });

  } catch (error) {
    console.error('SIP trunks list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list SIP trunks'
    });
  }
}));

// Health check for Telnyx integration
router.get('/health', asyncHandler(async (req, res) => {
  const health = {
    telnyx_integration: 'active',
    livekit_url: process.env.LIVEKIT_WS_URL || 'ws://localhost:7880',
    telnyx_api_configured: !!process.env.TELNYX_API_KEY,
    livekit_api_configured: !!(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET)
  };

  // Check if trunk IDs are available
  try {
    const inboundTrunkPath = path.join(__dirname, '../inbound_trunk_id.txt');
    const outboundTrunkPath = path.join(__dirname, '../outbound_trunk_id.txt');

    health.inbound_trunk_configured = await fs.access(inboundTrunkPath).then(() => true).catch(() => false);
    health.outbound_trunk_configured = await fs.access(outboundTrunkPath).then(() => true).catch(() => false);
  } catch (error) {
    health.trunk_configuration_error = error.message;
  }

  res.json({
    success: true,
    data: health
  });
}));

module.exports = router;