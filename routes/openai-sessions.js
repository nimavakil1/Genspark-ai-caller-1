const express = require('express');
const router = express.Router();

// Import services
const OpenAIRealtimeService = require('../services/openaiRealtimeService');
const TelnyxCallControlService = require('../services/telnyxCallControlService');

// Initialize services
const openaiService = new OpenAIRealtimeService();
const telnyxService = new TelnyxCallControlService();

/**
 * GET /api/openai-sessions/:callControlId
 * Get OpenAI session info for a specific call
 */
router.get('/:callControlId', async (req, res) => {
    try {
        const { callControlId } = req.params;
        
        console.log(`🔍 Getting OpenAI session info for call: ${callControlId}`);
        
        const sessionInfo = telnyxService.getOpenAISession(callControlId);
        
        if (!sessionInfo) {
            return res.status(404).json({
                error: 'No OpenAI session found for this call'
            });
        }
        
        // Get additional session details from OpenAI service
        const sessionDetails = await openaiService.getSessionInfo(sessionInfo.sessionId);
        
        res.json({
            success: true,
            session: {
                ...sessionInfo,
                ...sessionDetails
            }
        });
        
    } catch (error) {
        console.error('❌ Error getting OpenAI session info:', error);
        res.status(500).json({
            error: 'Failed to get OpenAI session info',
            details: error.message
        });
    }
});

/**
 * GET /api/openai-sessions/:callControlId/conversation
 * Get conversation history for a specific call
 */
router.get('/:callControlId/conversation', async (req, res) => {
    try {
        const { callControlId } = req.params;
        
        console.log(`💬 Getting conversation history for call: ${callControlId}`);
        
        const history = await telnyxService.getConversationHistory(callControlId);
        
        res.json({
            success: true,
            conversation: history
        });
        
    } catch (error) {
        console.error('❌ Error getting conversation history:', error);
        res.status(500).json({
            error: 'Failed to get conversation history',
            details: error.message
        });
    }
});

/**
 * POST /api/openai-sessions/:callControlId/message
 * Send a message to the OpenAI session (for testing or admin intervention)
 */
router.post('/:callControlId/message', async (req, res) => {
    try {
        const { callControlId } = req.params;
        const { message, role = 'user' } = req.body;
        
        if (!message) {
            return res.status(400).json({
                error: 'Message is required'
            });
        }
        
        console.log(`📤 Sending message to OpenAI session for call: ${callControlId}`);
        
        const response = await telnyxService.handleConversationMessage(
            callControlId,
            message,
            'admin'
        );
        
        if (!response) {
            return res.status(404).json({
                error: 'No active OpenAI session found for this call'
            });
        }
        
        res.json({
            success: true,
            response: response
        });
        
    } catch (error) {
        console.error('❌ Error sending message to OpenAI session:', error);
        res.status(500).json({
            error: 'Failed to send message',
            details: error.message
        });
    }
});

/**
 * GET /api/openai-sessions
 * Get all active OpenAI sessions
 */
router.get('/', async (req, res) => {
    try {
        console.log('📋 Getting all active OpenAI sessions');
        
        const activeSessions = await openaiService.getActiveSessions();
        
        res.json({
            success: true,
            sessions: activeSessions,
            count: activeSessions.length
        });
        
    } catch (error) {
        console.error('❌ Error getting active OpenAI sessions:', error);
        res.status(500).json({
            error: 'Failed to get active sessions',
            details: error.message
        });
    }
});

/**
 * DELETE /api/openai-sessions/:sessionId
 * End a specific OpenAI session
 */
router.delete('/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        console.log(`🛑 Ending OpenAI session: ${sessionId}`);
        
        await openaiService.endSession(sessionId);
        
        res.json({
            success: true,
            message: 'OpenAI session ended successfully'
        });
        
    } catch (error) {
        console.error('❌ Error ending OpenAI session:', error);
        res.status(500).json({
            error: 'Failed to end session',
            details: error.message
        });
    }
});

/**
 * POST /api/openai-sessions/voice-test
 * Create OpenAI session for browser voice testing
 */
router.post('/voice-test', async (req, res) => {
    try {
        const { agentId, scenario = 'standard', customerData = {} } = req.body;
        
        if (!agentId) {
            return res.status(400).json({
                error: 'Agent ID is required for voice testing'
            });
        }
        
        console.log(`🎤 Starting voice test with agent: ${agentId}, scenario: ${scenario}`);
        
        // Get agent data
        const { pool } = require('../src/database');
        const agentResult = await pool.query(`
            SELECT a.*, 
                   array_agg(
                       json_build_object(
                           'id', ak.id,
                           'title', ak.title,
                           'content', ak.content
                       )
                   ) FILTER (WHERE ak.id IS NOT NULL) as knowledge
            FROM agents a
            LEFT JOIN agent_knowledge ak ON a.id = ak.agent_id
            WHERE a.id = $1
            GROUP BY a.id
        `, [agentId]);
        
        if (agentResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Agent not found'
            });
        }
        
        const agentData = agentResult.rows[0];
        const voiceTestCallId = `voice-test-${Date.now()}`;
        
        // Create OpenAI session for voice testing
        const session = await openaiService.createRealtimeSession(
            voiceTestCallId,
            agentData,
            {
                customer_name: customerData.customer_name || 'Voice Test Customer',
                phone: 'voice-test',
                scenario: scenario
            }
        );
        
        res.json({
            success: true,
            sessionId: session.sessionId,
            agentName: agentData.name,
            scenario: scenario,
            instructions: session.instructions?.substring(0, 200) + '...'
        });
        
    } catch (error) {
        console.error('❌ Error creating voice test session:', error);
        res.status(500).json({
            error: 'Failed to create voice test session',
            details: error.message
        });
    }
});

/**
 * POST /api/openai-sessions/test
 * Test OpenAI session creation and conversation
 */
router.post('/test', async (req, res) => {
    try {
        const { agentId, testMessage = 'Hello, this is a test message.' } = req.body;
        
        if (!agentId) {
            return res.status(400).json({
                error: 'Agent ID is required for testing'
            });
        }
        
        console.log(`🧪 Testing OpenAI session with agent: ${agentId}`);
        
        // Get agent data
        const { pool } = require('../src/database');
        const agentResult = await pool.query(`
            SELECT a.*, 
                   array_agg(
                       json_build_object(
                           'id', ak.id,
                           'title', ak.title,
                           'content', ak.content
                       )
                   ) FILTER (WHERE ak.id IS NOT NULL) as knowledge
            FROM agents a
            LEFT JOIN agent_knowledge ak ON a.id = ak.agent_id
            WHERE a.id = $1
            GROUP BY a.id
        `, [agentId]);
        
        if (agentResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Agent not found'
            });
        }
        
        const agentData = agentResult.rows[0];
        const testCallId = `test-${Date.now()}`;
        const testCustomer = {
            customer_name: 'Test Customer',
            phone: '+1234567890'
        };
        
        // Create test OpenAI session
        const session = await openaiService.createRealtimeSession(
            testCallId,
            agentData,
            testCustomer
        );
        
        // Send test message
        const response = await openaiService.sendMessage(
            session.sessionId,
            'user',
            testMessage
        );
        
        // Clean up test session after a delay
        setTimeout(async () => {
            try {
                await openaiService.endSession(session.sessionId);
                console.log(`🧹 Test session cleaned up: ${session.sessionId}`);
            } catch (cleanupError) {
                console.warn('⚠️ Error cleaning up test session:', cleanupError.message);
            }
        }, 30000); // Clean up after 30 seconds
        
        res.json({
            success: true,
            test: {
                sessionId: session.sessionId,
                agentName: agentData.name,
                testMessage: testMessage,
                aiResponse: response?.content || 'No response received',
                instructions: session.instructions?.substring(0, 200) + '...'
            }
        });
        
    } catch (error) {
        console.error('❌ Error testing OpenAI session:', error);
        res.status(500).json({
            error: 'Failed to test OpenAI session',
            details: error.message
        });
    }
});

module.exports = router;