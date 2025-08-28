const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { query } = require('../src/database');
const axios = require('axios');

const router = express.Router();

// LiveKit service configuration
const LIVEKIT_SERVICE_URL = process.env.LIVEKIT_SERVICE_URL || 'http://localhost:3002';

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
        
        // Create LiveKit session
        console.log('📡 Creating LiveKit voice session...');
        const livekitResponse = await axios.post(`${LIVEKIT_SERVICE_URL}/create-session`, {
            agent_id: agent_id,
            agent_config: agentData
        });
        
        if (!livekitResponse.data.success) {
            throw new Error('Failed to create LiveKit session');
        }
        
        const sessionData = livekitResponse.data.session_data;
        console.log('✅ LiveKit session created:', sessionData);
        
        // Store session info
        activeTestSessions.set(sessionId, {
            sessionId: sessionId,
            callControlId: callControlId,
            roomName: sessionData.room_name,
            customerToken: sessionData.customer_token,
            livekitUrl: sessionData.livekit_url,
            agentData: agentData,
            customerData: customerData,
            startTime: new Date(),
            status: 'active',
            conversationHistory: []
        });
        
        res.json({
            success: true,
            session_id: sessionId,
            room_name: sessionData.room_name,
            customer_token: sessionData.customer_token,
            livekit_url: sessionData.livekit_url,
            agent: {
                id: agent.id,
                name: agent.name,
                voice_settings: agentData.voice_settings
            },
            message: 'LiveKit voice session created successfully'
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

// Get session connection info (audio handled directly by LiveKit)
router.get('/connection/:session_id', authenticateToken, asyncHandler(async (req, res) => {
    const { session_id } = req.params;
    
    const session = activeTestSessions.get(session_id);
    if (!session) {
        return res.status(404).json({
            success: false,
            error: 'Voice test session not found'
        });
    }
    
    res.json({
        success: true,
        connection: {
            room_name: session.roomName,
            customer_token: session.customerToken,
            livekit_url: session.livekitUrl
        }
    });
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
    
    // For now, return stored conversation history
    // In production, this would come from LiveKit room events
    const conversationHistory = session.conversationHistory;
    
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
        
        // End LiveKit room
        await axios.post(`${LIVEKIT_SERVICE_URL}/end-session`, {
            room_name: session.roomName
        });
        
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

// Add conversation message to session history
router.post('/conversation/:session_id', authenticateToken, asyncHandler(async (req, res) => {
    const { session_id } = req.params;
    const { type, content } = req.body;
    
    const session = activeTestSessions.get(session_id);
    if (!session) {
        return res.status(404).json({
            success: false,
            error: 'Session not found'
        });
    }
    
    // Add message to conversation history
    session.conversationHistory.push({
        type: type,
        content: content,
        timestamp: new Date()
    });
    
    res.json({
        success: true,
        message: 'Message added to conversation'
    });
}));

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