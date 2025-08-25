const express = require('express');
const { query, transaction } = require('../src/database');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const TelnyxCallControlService = require('../services/telnyxCallControlService');

const router = express.Router();

// Create Call Control service instance
const callControlService = new TelnyxCallControlService();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Telnyx Call Control Integration',
    timestamp: new Date().toISOString(),
    configuration: {
      api_key_configured: !!process.env.TELNYX_API_KEY,
      phone_number: process.env.TELNYX_PHONE_NUMBER || '+3226010500',
      connection_id: '2729194733782959144',
      webhook_url: `${process.env.SERVER_BASE_URL || 'http://51.195.41.57:3000'}/api/call-control/webhooks`
    }
  });
});

// Test call endpoint (no auth required for testing)
router.post('/test-call', asyncHandler(async (req, res) => {
  const { to, customer_name, agent_id } = req.body;

  if (!to) {
    return res.status(400).json({
      success: false,
      error: 'Phone number (to) is required'
    });
  }

  try {
    // Find or create customer for test call
    let customerId = null;
    const testCustomerName = customer_name || 'Test Customer';
    
    const existingCustomer = await query(
      'SELECT id FROM customers WHERE phone = $1',
      [to]
    );
    
    if (existingCustomer.rows.length > 0) {
      customerId = existingCustomer.rows[0].id;
    } else {
      const customerResult = await query(
        'INSERT INTO customers (company_name, phone) VALUES ($1, $2) RETURNING id',
        [testCustomerName, to]
      );
      customerId = customerResult.rows[0].id;
    }

    const customerData = {
      customer_id: customerId,
      customer_name: testCustomerName
    };

    // Load agent data if agent_id is provided
    let agentData = null;
    if (agent_id) {
      const agentResult = await query(`
        SELECT a.*, 
        JSON_AGG(
          CASE WHEN ak.id IS NOT NULL 
          THEN JSON_BUILD_OBJECT(
            'id', ak.id,
            'title', ak.title,
            'content', ak.content,
            'file_url', ak.file_url,
            'file_type', ak.file_type
          ) END
        ) as knowledge
        FROM agents a
        LEFT JOIN agent_knowledge ak ON a.id = ak.agent_id AND ak.is_active = true
        WHERE a.id = $1 AND a.is_active = true
        GROUP BY a.id
      `, [agent_id]);

      if (agentResult.rows.length > 0) {
        agentData = agentResult.rows[0];
        // Filter out null knowledge entries
        agentData.knowledge = agentData.knowledge.filter(k => k !== null);
        console.log(`🤖 Using agent: ${agentData.name} for test call`);
      }
    }

    const call = await callControlService.makeOutboundCall(to, null, customerData, agentData);
    
    res.json({
      success: true,
      message: 'Test outbound call initiated successfully',
      call_control_id: call.call_control_id,
      to: to,
      from: process.env.TELNYX_PHONE_NUMBER,
      customer_id: customerId,
      agent: agentData ? {
        id: agentData.id,
        name: agentData.name,
        voice_settings: agentData.voice_settings
      } : null,
      note: agentData ? 
        `Call will use AI Agent: ${agentData.name} with custom voice and conversation flow` :
        'Call will be answered automatically and AI conversation will begin'
    });

  } catch (error) {
    console.error('Error making test call:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to make test call',
      details: error.response?.data || error.message
    });
  }
}));

// Make outbound call using Call Control API
router.post('/outbound-call', authenticateToken, asyncHandler(async (req, res) => {
  const { customer_id, phone_number, from_number, customer_name, agent_id } = req.body;

  if (!phone_number) {
    return res.status(400).json({
      success: false,
      error: 'Phone number is required'
    });
  }

  try {
    let customerData = {};
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

      customerData = {
        customer_id,
        customer_name: customer_name || customerResult.rows[0].company_name
      };
    }

    // Load agent data if agent_id is provided
    let agentData = null;
    if (agent_id) {
      const agentResult = await query(`
        SELECT a.*, 
        JSON_AGG(
          CASE WHEN ak.id IS NOT NULL 
          THEN JSON_BUILD_OBJECT(
            'id', ak.id,
            'title', ak.title,
            'content', ak.content,
            'file_url', ak.file_url,
            'file_type', ak.file_type
          ) END
        ) as knowledge
        FROM agents a
        LEFT JOIN agent_knowledge ak ON a.id = ak.agent_id AND ak.is_active = true
        WHERE a.id = $1 AND a.is_active = true
        GROUP BY a.id
      `, [agent_id]);

      if (agentResult.rows.length > 0) {
        agentData = agentResult.rows[0];
        // Filter out null knowledge entries
        agentData.knowledge = agentData.knowledge.filter(k => k !== null);
        console.log(`🤖 Using agent: ${agentData.name} for outbound call`);
      }
    }

    const call = await callControlService.makeOutboundCall(phone_number, from_number, customerData, agentData);

    res.json({
      success: true,
      message: 'Outbound call initiated successfully',
      call: {
        call_control_id: call.call_control_id,
        phone_number: phone_number,
        status: 'initiated',
        direction: 'outbound'
      },
      agent: agentData ? {
        id: agentData.id,
        name: agentData.name,
        voice_settings: agentData.voice_settings
      } : null
    });

  } catch (error) {
    console.error('Error making outbound call:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate outbound call',
      details: error.response?.data || error.message
    });
  }
}));

// Webhook endpoint for Call Control events
router.post('/webhooks', asyncHandler(async (req, res) => {
  // Telnyx sends webhook data in req.body.data format
  const webhookData = req.body.data || req.body;
  const { event_type, call_control_id, from, to, direction, payload } = webhookData;

  console.log('📞 Call Control Webhook received:', {
    event_type, call_control_id, from, to, direction,
    raw_body: JSON.stringify(req.body, null, 2)
  });

  try {
    // Find or create customer based on phone number
    let customerId = null;
    const customerName = payload?.customer_name;
    
    if (customerName && to) {
      const existingCustomer = await query(
        'SELECT id FROM customers WHERE phone = $1',
        [to]
      );
      
      if (existingCustomer.rows.length > 0) {
        customerId = existingCustomer.rows[0].id;
      } else {
        const customerResult = await query(
          'INSERT INTO customers (company_name, phone) VALUES ($1, $2) RETURNING id',
          [customerName, to]
        );
        customerId = customerResult.rows[0].id;
      }
    }

    // Get agent information from active call
    let agentId = null;
    const callInfo = callControlService.getCallInfo(call_control_id);
    if (callInfo?.agentData) {
      agentId = callInfo.agentData.id;
      console.log(`🤖 Call using agent: ${callInfo.agentData.name} (ID: ${agentId})`);
    }

    switch (event_type) {
      case 'call.initiated':
        console.log(`📞 Outbound call initiated: ${call_control_id}`);
        
        // Insert call log for initiated call
        await query(
          'INSERT INTO call_logs (customer_id, agent_id, phone_number, direction, status, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
          [customerId, agentId, to, 'outbound', 'initiated']
        );
        break;

      case 'call.answered':
        console.log(`✅ Outbound call answered: ${call_control_id}`);
        
        await query(
          'UPDATE call_logs SET status = $1 WHERE phone_number = $2 AND status = $3 AND created_at >= NOW() - INTERVAL \'1 hour\'',
          ['answered', to, 'initiated']
        );
        
        const callInfo = callControlService.getCallInfo(call_control_id);
        await callControlService.startAIConversation(call_control_id, callInfo?.customerData);
        break;

      case 'call.hangup':
        console.log(`📴 Call ended: ${call_control_id}`);
        
        await query(
          'UPDATE call_logs SET status = $1 WHERE phone_number = $2 AND status IN ($3, $4) AND created_at >= NOW() - INTERVAL \'1 hour\'',
          ['completed', to, 'initiated', 'answered']
        );
        break;

      case 'call.gather.ended':
        console.log(`🔢 Gather ended: ${call_control_id}, digits: ${payload?.digits}`);
        await handleGatherResult(call_control_id, payload?.digits);
        break;

      default:
        console.log(`ℹ️ Unhandled Call Control event: ${event_type}`);
    }

    res.json({ received: true });

  } catch (error) {
    console.error('Error processing Call Control webhook:', error);
    res.status(500).json({
      error: 'Webhook processing failed',
      details: error.message
    });
  }
}));

async function handleGatherResult(callControlId, digits) {
  try {
    console.log(`Processing gather result: ${digits} for call: ${callControlId}`);
    
    switch (digits) {
      case '1':
        await callControlService.speakText(
          callControlId,
          'Perfect! We offer high-quality thermal receipt rolls in various sizes. Our most popular product is the 80mm by 80mm thermal roll, perfect for most POS systems. The price is just 2 dollars and 50 cents per roll.'
        );
        
        setTimeout(async () => {
          await callControlService.gatherDTMF(callControlId, {
            prompt: 'How many rolls would you like to order? Enter a number from 1 to 99 followed by the pound key.',
            maxDigits: 2,
            timeout: 15000,
            terminatingDigit: '#'
          });
        }, 8000);
        break;

      case '2':
        await callControlService.speakText(
          callControlId,
          'No problem! We will call you back at a more convenient time. Thank you and have a great day!'
        );
        
        setTimeout(() => {
          callControlService.hangupCall(callControlId);
        }, 3000);
        break;

      case '9':
        await callControlService.speakText(
          callControlId,
          'Understood. You have been removed from our calling list. Thank you and goodbye!'
        );
        
        await query(
          'UPDATE customers SET opt_out = true WHERE id = (SELECT customer_id FROM call_logs WHERE phone_number = (SELECT phone_number FROM call_logs WHERE id = $1 LIMIT 1))',
          [callControlId]
        );
        
        setTimeout(() => {
          callControlService.hangupCall(callControlId);
        }, 3000);
        break;

      default:
        const digitValue = parseInt(digits);
        if (digitValue >= 1 && digitValue <= 99) {
          const totalPrice = (digitValue * 2.50).toFixed(2);
          
          await callControlService.speakText(
            callControlId,
            `Perfect! You would like to order ${digitValue} receipt rolls at 2 dollars and 50 cents each, for a total of ${totalPrice} dollars. Press 1 to confirm your order or 9 to cancel.`
          );
          
          setTimeout(async () => {
            await callControlService.gatherDTMF(callControlId, {
              prompt: 'Press 1 to confirm, or 9 to cancel.',
              maxDigits: 1,
              timeout: 15000
            });
          }, 6000);
        } else {
          await callControlService.gatherDTMF(callControlId, {
            prompt: 'Sorry, I did not understand. Press 1 if now is a good time, press 2 to be called later, or press 9 to opt out.',
            maxDigits: 1,
            timeout: 10000
          });
        }
    }
    
  } catch (error) {
    console.error('Error handling gather result:', error);
  }
}

module.exports = router;
