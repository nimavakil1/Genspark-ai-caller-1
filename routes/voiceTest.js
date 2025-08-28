const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const OpenAIRealtimeService = require('../services/openaiRealtimeService');
const { query } = require('../src/database');

const router = express.Router();

// Create a global OpenAI service instance
const openaiService = new OpenAIRealtimeService();

// Storage for active test sessions
const activeTestSessions = new Map();

// Start voice test session
router.post('/start', authenticateToken, asyncHandler(async (req, res) => {
    console.log('🔍 Request body received:', JSON.stringify(req.body));
    const { agent_id, customer_name = 'Test User', test_mode = true } = req.body;
    
    console.log('🎯 Extracted agent_id:', agent_id, 'Type:', typeof agent_id);
    
    if (!agent_id) {
        return res.status(400).json({
            success: false,
            error: 'Agent ID is required'
        });
    }
    
    try {
        console.log(`🚀 Starting voice test session for agent ${agent_id}`);
        
        // Get agent data with knowledge
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
        
        if (agentResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Agent not found'
            });
        }
        
        const agent = agentResult.rows[0];
        // Filter out null knowledge entries
        agent.knowledge = agent.knowledge.filter(k => k !== null);
        
        // Generate unique session ID
        const sessionId = `test_${Date.now()}_${agent_id}`;
        const callControlId = `call_${sessionId}`;
        
        // Prepare agent data for OpenAI
        const agentData = {
            id: agent.id,
            name: agent.name,
            description: agent.description,
            system_prompt: agent.system_prompt,
            voice_settings: typeof agent.voice_settings === 'string' 
                ? JSON.parse(agent.voice_settings) 
                : agent.voice_settings,
            knowledge: agent.knowledge,
            callControlId: callControlId
        };
        
        const customerData = {
            customer_name: customer_name
        };
        
        // Create OpenAI Realtime session
        console.log('📡 Creating OpenAI Realtime session...');
        const openaiSession = await openaiService.createRealtimeSession(
            callControlId, 
            agentData, 
            customerData
        );
        
        console.log('✅ OpenAI session created:', openaiSession);
        
        // Store session info
        activeTestSessions.set(sessionId, {
            sessionId: sessionId,
            callControlId: callControlId,
            agentData: agentData,
            customerData: customerData,
            startTime: new Date(),
            status: 'active',
            conversationHistory: []
        });
        
        // Set up event listeners for OpenAI responses
        setupOpenAIEventListeners(sessionId);
        
        res.json({
            success: true,
            session_id: sessionId,
            call_control_id: callControlId,
            agent: {
                id: agent.id,
                name: agent.name,
                voice_settings: agentData.voice_settings
            },
            message: 'Voice test session created successfully'
        });
        
    } catch (error) {
        console.error('❌ Error starting voice test session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start voice test session',
            details: error.message
        });
    }
}));

// Send audio data to OpenAI
router.post('/audio', authenticateToken, asyncHandler(async (req, res) => {
    const { session_id, audio_data } = req.body;
    
    if (!session_id || !audio_data) {
        return res.status(400).json({
            success: false,
            error: 'Session ID and audio data are required'
        });
    }
    
    const session = activeTestSessions.get(session_id);
    if (!session) {
        return res.status(404).json({
            success: false,
            error: 'Voice test session not found'
        });
    }
    
    try {
        // Decode base64 audio data
        const audioBuffer = Buffer.from(audio_data, 'base64');
        
        // Send audio to OpenAI
        const success = openaiService.sendAudioInput(session.callControlId, audioBuffer);
        
        if (success) {
            res.json({
                success: true,
                message: 'Audio sent to OpenAI successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to send audio to OpenAI'
            });
        }
        
    } catch (error) {
        console.error('❌ Error processing audio data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process audio data',
            details: error.message
        });
    }
}));

// Get session status and conversation history
router.get('/session/:session_id', authenticateToken, asyncHandler(async (req, res) => {
    const { session_id } = req.params;
    
    const session = activeTestSessions.get(session_id);
    if (!session) {
        return res.status(404).json({
            success: false,
            error: 'Session not found'
        });
    }
    
    // Get conversation history from OpenAI service
    const conversationHistory = openaiService.getConversationHistory(session.callControlId);
    
    res.json({
        success: true,
        session: {
            session_id: session.sessionId,
            call_control_id: session.callControlId,
            agent_name: session.agentData.name,
            customer_name: session.customerData.customer_name,
            status: session.status,
            start_time: session.startTime,
            conversation_history: conversationHistory
        }
    });
}));

// End voice test session
router.post('/end/:session_id', authenticateToken, asyncHandler(async (req, res) => {
    const { session_id } = req.params;
    
    const session = activeTestSessions.get(session_id);
    if (!session) {
        return res.status(404).json({
            success: false,
            error: 'Session not found'
        });
    }
    
    try {
        console.log(`🏁 Ending voice test session: ${session_id}`);
        
        // End OpenAI session
        await openaiService.endSession(session.callControlId);
        
        // Remove from active sessions
        activeTestSessions.delete(session_id);
        
        res.json({
            success: true,
            message: 'Voice test session ended successfully'
        });
        
    } catch (error) {
        console.error('❌ Error ending voice test session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to end voice test session',
            details: error.message
        });
    }
}));

// Set up OpenAI event listeners for a session
function setupOpenAIEventListeners(sessionId) {
    const session = activeTestSessions.get(sessionId);
    if (!session) return;
    
    // Listen for customer transcripts
    openaiService.on('customerTranscript', (data) => {
        if (data.callControlId === session.callControlId) {
            console.log(`📝 Customer said: "${data.transcript}"`);
            session.conversationHistory.push({
                type: 'customer',
                content: data.transcript,
                timestamp: new Date()
            });
        }
    });
    
    // Listen for assistant text responses
    openaiService.on('textResponse', (data) => {
        if (data.callControlId === session.callControlId) {
            console.log(`🤖 Assistant responded: "${data.textDelta}"`);
            session.conversationHistory.push({
                type: 'assistant',
                content: data.textDelta,
                timestamp: new Date()
            });
        }
    });
    
    // Listen for speech detection
    openaiService.on('customerSpeechStarted', (data) => {
        if (data.callControlId === session.callControlId) {
            console.log(`🎤 Customer started speaking in session: ${sessionId}`);
        }
    });
    
    openaiService.on('customerSpeechStopped', (data) => {
        if (data.callControlId === session.callControlId) {
            console.log(`🔇 Customer stopped speaking in session: ${sessionId}`);
        }
    });
    
    // Listen for errors
    openaiService.on('error', (data) => {
        if (data.callControlId === session.callControlId) {
            console.error(`❌ OpenAI error in session ${sessionId}:`, data.error);
            session.status = 'error';
        }
    });
}

// Get all active test sessions (for debugging)
router.get('/sessions', authenticateToken, asyncHandler(async (req, res) => {
    const sessions = Array.from(activeTestSessions.values()).map(session => ({
        session_id: session.sessionId,
        agent_name: session.agentData.name,
        customer_name: session.customerData.customer_name,
        status: session.status,
        start_time: session.startTime,
        conversation_length: session.conversationHistory.length
    }));
    
    res.json({
        success: true,
        active_sessions: sessions,
        count: sessions.length
    });
}));

module.exports = router;