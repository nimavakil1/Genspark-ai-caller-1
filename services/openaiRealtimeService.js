const OpenAI = require('openai');
const WebSocket = require('ws');
const EventEmitter = require('events');

class OpenAIRealtimeService extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            apiKey: options.apiKey || process.env.OPENAI_API_KEY,
            model: options.model || 'gpt-4o-realtime-preview-2024-10-01',
            baseURL: 'wss://api.openai.com/v1/realtime'
        };
        
        this.openai = new OpenAI({ apiKey: this.config.apiKey });
        this.activeConnections = new Map(); // Track WebSocket connections by call ID
        this.agentSessions = new Map(); // Track agent data by call ID
        
        console.log('🧠 OpenAI Realtime Service initialized');
    }
    
    /**
     * Create OpenAI Realtime session for agent
     */
    async createRealtimeSession(callControlId, agentData, customerData = {}) {
        try {
            console.log(`🤖 Creating OpenAI Realtime session for agent: ${agentData.name}`);
            
            // Create WebSocket connection to OpenAI Realtime API
            const wsUrl = `${this.config.baseURL}?model=${this.config.model}`;
            const headers = {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'OpenAI-Beta': 'realtime=v1'
            };
            
            const ws = new WebSocket(wsUrl, { headers });
            
            // Store connection and agent data
            this.activeConnections.set(callControlId, ws);
            this.agentSessions.set(callControlId, {
                agentData,
                customerData,
                startTime: new Date(),
                conversationHistory: [],
                status: 'connecting'
            });
            
            // Set up WebSocket event handlers
            this.setupWebSocketHandlers(ws, callControlId, agentData, customerData);
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('OpenAI Realtime connection timeout'));
                }, 10000);
                
                ws.on('open', () => {
                    clearTimeout(timeout);
                    console.log(`✅ OpenAI Realtime session established for call: ${callControlId}`);
                    
                    // Configure session with agent parameters
                    this.configureSession(ws, agentData, customerData);
                    
                    resolve({
                        callControlId,
                        agentName: agentData.name,
                        status: 'connected',
                        model: this.config.model
                    });
                });
                
                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    console.error(`❌ OpenAI Realtime connection error for call ${callControlId}:`, error);
                    reject(error);
                });
            });
            
        } catch (error) {
            console.error('❌ Error creating OpenAI Realtime session:', error);
            throw error;
        }
    }
    
    /**
     * Set up WebSocket event handlers
     */
    setupWebSocketHandlers(ws, callControlId, agentData, customerData) {
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleOpenAIMessage(message, callControlId, agentData);
            } catch (error) {
                console.error('❌ Error parsing OpenAI message:', error);
            }
        });
        
        ws.on('close', (code, reason) => {
            console.log(`🔌 OpenAI Realtime session closed for call ${callControlId}:`, code, reason);
            this.cleanup(callControlId);
        });
        
        ws.on('error', (error) => {
            console.error(`❌ OpenAI WebSocket error for call ${callControlId}:`, error);
            this.emit('error', { callControlId, error });
        });
    }
    
    /**
     * Configure OpenAI session with agent parameters
     */
    configureSession(ws, agentData, customerData) {
        try {
            // Build system instructions from agent data
            const systemInstructions = this.buildSystemInstructions(agentData, customerData);
            
            // Configure session parameters
            const sessionConfig = {
                type: 'session.update',
                session: {
                    modalities: ['text', 'audio'],
                    instructions: systemInstructions,
                    voice: this.mapAgentVoiceToOpenAI(agentData.voice_settings?.voice || 'alloy'),
                    input_audio_format: 'pcm16',
                    output_audio_format: 'pcm16',
                    input_audio_transcription: {
                        model: 'whisper-1'
                    },
                    turn_detection: {
                        type: 'server_vad',
                        threshold: 0.5,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 500
                    },
                    tools: [],
                    tool_choice: 'auto',
                    temperature: 0.7,
                    max_response_output_tokens: 4096
                }
            };
            
            console.log(`🔧 Configuring OpenAI session for agent: ${agentData.name}`);
            ws.send(JSON.stringify(sessionConfig));
            
            // Update session status
            const session = this.agentSessions.get(agentData.callControlId);
            if (session) {
                session.status = 'configured';
            }
            
        } catch (error) {
            console.error('❌ Error configuring OpenAI session:', error);
        }
    }
    
    /**
     * Build system instructions from agent data
     */
    buildSystemInstructions(agentData, customerData) {
        let instructions = agentData.system_prompt || 'You are a helpful AI assistant for a receipt roll company.';
        
        // Add customer context
        if (customerData.customer_name) {
            instructions += `\n\nYou are speaking with ${customerData.customer_name}.`;
        }
        
        // Add knowledge base information
        if (agentData.knowledge && agentData.knowledge.length > 0) {
            instructions += '\n\nKNOWLEDGE BASE:\n';
            agentData.knowledge.forEach((knowledge, index) => {
                instructions += `\n${index + 1}. ${knowledge.title}:\n${knowledge.content}\n`;
            });
            instructions += '\nUse this knowledge to answer customer questions accurately.';
        }
        
        // Add conversation guidelines
        instructions += `
        
CONVERSATION GUIDELINES:
- Be natural and conversational
- Listen actively to the customer's needs
- Provide helpful and accurate information
- Ask clarifying questions when needed
- Be professional but friendly
- Keep responses concise but informative
- End with clear next steps when appropriate
        
VOICE SETTINGS:
- Speak naturally with appropriate pacing
- Use the voice characteristics configured for this agent
- Match the customer's energy level appropriately`;

        console.log(`📋 Built system instructions for ${agentData.name}: ${instructions.length} characters`);
        return instructions;
    }
    
    /**
     * Map agent voice to OpenAI voice models
     */
    mapAgentVoiceToOpenAI(agentVoice) {
        const voiceMap = {
            'alloy': 'alloy',
            'echo': 'echo', 
            'fable': 'fable',
            'onyx': 'onyx',
            'nova': 'nova',
            'shimmer': 'shimmer'
        };
        
        return voiceMap[agentVoice] || 'alloy';
    }
    
    /**
     * Handle messages from OpenAI
     */
    handleOpenAIMessage(message, callControlId, agentData) {
        const session = this.agentSessions.get(callControlId);
        if (!session) return;
        
        console.log(`🧠 OpenAI message for ${callControlId}:`, message.type);
        
        switch (message.type) {
            case 'session.created':
                console.log(`✅ OpenAI session created for agent: ${agentData.name}`);
                session.status = 'active';
                this.emit('sessionCreated', { callControlId, agentData, sessionId: message.session.id });
                break;
                
            case 'session.updated':
                console.log(`🔄 OpenAI session updated for agent: ${agentData.name}`);
                this.emit('sessionUpdated', { callControlId, agentData });
                break;
                
            case 'conversation.item.created':
                session.conversationHistory.push(message.item);
                this.emit('conversationItem', { callControlId, item: message.item });
                break;
                
            case 'response.audio.delta':
                // Stream audio response
                this.emit('audioResponse', { 
                    callControlId, 
                    audioData: message.delta, 
                    agentData 
                });
                break;
                
            case 'response.audio.done':
                console.log(`🎵 Audio response completed for call: ${callControlId}`);
                this.emit('audioResponseComplete', { callControlId, agentData });
                break;
                
            case 'response.text.delta':
                this.emit('textResponse', { 
                    callControlId, 
                    textDelta: message.delta, 
                    agentData 
                });
                break;
                
            case 'response.text.done':
                console.log(`📝 Text response completed for call: ${callControlId}`);
                session.conversationHistory.push({
                    type: 'assistant_response',
                    content: message.text,
                    timestamp: new Date()
                });
                break;
                
            case 'input_audio_buffer.speech_started':
                console.log(`🎤 Customer speech detected for call: ${callControlId}`);
                this.emit('customerSpeechStarted', { callControlId, agentData });
                break;
                
            case 'input_audio_buffer.speech_stopped':
                console.log(`🔇 Customer speech stopped for call: ${callControlId}`);
                this.emit('customerSpeechStopped', { callControlId, agentData });
                break;
                
            case 'conversation.item.input_audio_transcription.completed':
                const transcript = message.transcript;
                console.log(`📝 Customer transcript for ${callControlId}: "${transcript}"`);
                session.conversationHistory.push({
                    type: 'customer_message',
                    content: transcript,
                    timestamp: new Date()
                });
                this.emit('customerTranscript', { callControlId, transcript, agentData });
                break;
                
            case 'error':
                console.error(`❌ OpenAI error for call ${callControlId}:`, message.error);
                this.emit('error', { callControlId, error: message.error, agentData });
                break;
                
            case 'response.audio_transcript.delta':
                // Handle audio transcript deltas (text version of spoken response)
                if (message.delta) {
                    session.assistantTranscriptBuffer = (session.assistantTranscriptBuffer || '') + message.delta;
                }
                break;
                
            case 'response.audio_transcript.done':
                // Complete audio transcript is ready
                if (session.assistantTranscriptBuffer) {
                    console.log(`🤖 Assistant transcript: "${session.assistantTranscriptBuffer}"`);
                    session.conversationHistory.push({
                        type: 'assistant_response',
                        content: session.assistantTranscriptBuffer,
                        timestamp: new Date()
                    });
                    this.emit('textResponse', { 
                        callControlId, 
                        textDelta: session.assistantTranscriptBuffer, 
                        agentData 
                    });
                    delete session.assistantTranscriptBuffer;
                }
                break;
                
            case 'input_audio_buffer.committed':
                // Audio buffer committed, ready for processing
                break;
                
            case 'conversation.item.created':
                // Conversation item created
                break;
                
            case 'response.created':
                // Response generation started
                break;
                
            case 'response.done':
                // Response generation completed
                break;
                
            case 'response.output_item.added':
                // Output item added to response
                break;
                
            case 'response.content_part.added':
                // Content part added to response
                break;
                
            case 'response.content_part.done':
                // Content part completed
                break;
                
            case 'response.output_item.done':
                // Output item completed
                break;
                
            case 'conversation.item.input_audio_transcription.delta':
                // Partial transcription (we can ignore these)
                break;
                
            case 'rate_limits.updated':
                // Rate limits updated (we can ignore these)
                break;
                
            default:
                // Log unknown message types for debugging
                console.log(`🔍 Unknown OpenAI message type: ${message.type}`);
        }
    }
    
    /**
     * Send audio input to OpenAI
     */
    sendAudioInput(callControlId, audioBuffer) {
        const ws = this.activeConnections.get(callControlId);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.warn(`⚠️ No active OpenAI connection for call: ${callControlId}`);
            return false;
        }
        
        try {
            // Send audio as base64
            const audioBase64 = audioBuffer.toString('base64');
            const message = {
                type: 'input_audio_buffer.append',
                audio: audioBase64
            };
            
            ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error(`❌ Error sending audio to OpenAI for call ${callControlId}:`, error);
            return false;
        }
    }
    
    /**
     * Trigger response generation
     */
    generateResponse(callControlId) {
        const ws = this.activeConnections.get(callControlId);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.warn(`⚠️ No active OpenAI connection for call: ${callControlId}`);
            return false;
        }
        
        try {
            const message = {
                type: 'response.create',
                response: {
                    modalities: ['text', 'audio'],
                    instructions: 'Please respond to the customer appropriately based on your knowledge and the conversation context.'
                }
            };
            
            ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error(`❌ Error generating response for call ${callControlId}:`, error);
            return false;
        }
    }
    
    /**
     * Send text message to conversation
     */
    sendTextMessage(callControlId, text) {
        const ws = this.activeConnections.get(callControlId);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.warn(`⚠️ No active OpenAI connection for call: ${callControlId}`);
            return false;
        }
        
        try {
            const message = {
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: text
                        }
                    ]
                }
            };
            
            ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error(`❌ Error sending text message for call ${callControlId}:`, error);
            return false;
        }
    }
    
    /**
     * Update agent instructions during conversation
     */
    updateInstructions(callControlId, newInstructions) {
        const ws = this.activeConnections.get(callControlId);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.warn(`⚠️ No active OpenAI connection for call: ${callControlId}`);
            return false;
        }
        
        try {
            const message = {
                type: 'session.update',
                session: {
                    instructions: newInstructions
                }
            };
            
            ws.send(JSON.stringify(message));
            console.log(`🔄 Updated instructions for call: ${callControlId}`);
            return true;
        } catch (error) {
            console.error(`❌ Error updating instructions for call ${callControlId}:`, error);
            return false;
        }
    }
    
    /**
     * Get session information
     */
    getSession(callControlId) {
        return this.agentSessions.get(callControlId);
    }
    
    /**
     * Get conversation history
     */
    getConversationHistory(callControlId) {
        const session = this.agentSessions.get(callControlId);
        return session ? session.conversationHistory : [];
    }
    
    /**
     * End OpenAI session and cleanup
     */
    async endSession(callControlId) {
        try {
            console.log(`🏁 Ending OpenAI Realtime session for call: ${callControlId}`);
            
            const ws = this.activeConnections.get(callControlId);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.close(1000, 'Session ended');
            }
            
            this.cleanup(callControlId);
            
            console.log(`✅ OpenAI session ended for call: ${callControlId}`);
            
        } catch (error) {
            console.error('❌ Error ending OpenAI session:', error);
            throw error;
        }
    }
    
    /**
     * Cleanup resources
     */
    cleanup(callControlId) {
        this.activeConnections.delete(callControlId);
        this.agentSessions.delete(callControlId);
        
        this.emit('sessionEnded', { callControlId });
    }
    
    /**
     * Get all active sessions
     */
    getActiveSessions() {
        return Array.from(this.agentSessions.entries()).map(([callId, session]) => ({
            callControlId: callId,
            agentName: session.agentData?.name,
            customerName: session.customerData?.customer_name,
            status: session.status,
            startTime: session.startTime,
            conversationLength: session.conversationHistory.length
        }));
    }
    
    /**
     * Get session info by session ID (for API compatibility)
     */
    async getSessionInfo(sessionId) {
        // sessionId is actually callControlId in our implementation
        const session = this.agentSessions.get(sessionId);
        
        if (!session) {
            return null;
        }
        
        return {
            sessionId: sessionId,
            status: session.status,
            agentName: session.agentData?.name,
            customerName: session.customerData?.customer_name,
            startTime: session.startTime,
            conversationLength: session.conversationHistory.length,
            lastActivity: session.lastActivity || session.startTime
        };
    }
    
    /**
     * Send message to OpenAI session
     */
    async sendMessage(sessionId, role, content) {
        try {
            const ws = this.activeConnections.get(sessionId);
            const session = this.agentSessions.get(sessionId);
            
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                console.warn(`⚠️ No active WebSocket connection for session: ${sessionId}`);
                return null;
            }
            
            if (!session) {
                console.warn(`⚠️ No session data found for: ${sessionId}`);
                return null;
            }
            
            console.log(`📤 Sending message to OpenAI session ${sessionId}: ${content}`);
            
            // Create conversation item for user message
            const conversationItem = {
                type: 'conversation.item.create',
                item: {
                    id: `msg_${Date.now()}`,
                    type: 'message',
                    role: role,
                    content: [
                        {
                            type: 'input_text',
                            text: content
                        }
                    ]
                }
            };
            
            // Send the conversation item
            ws.send(JSON.stringify(conversationItem));
            
            // Request a response from the assistant
            const responseRequest = {
                type: 'response.create',
                response: {
                    modalities: ['text'],
                    instructions: 'Please respond to the user message.'
                }
            };
            
            ws.send(JSON.stringify(responseRequest));
            
            // Add to conversation history
            session.conversationHistory.push({
                role: role,
                content: content,
                timestamp: new Date()
            });
            
            session.lastActivity = new Date();
            
            // Return a promise that resolves when we get the response
            return new Promise((resolve) => {
                // Set up a temporary listener for the response
                const responseHandler = (data) => {
                    if (data.type === 'response.done') {
                        // Extract text content from the response
                        const responseText = this.extractResponseText(data);
                        
                        if (responseText) {
                            session.conversationHistory.push({
                                role: 'assistant',
                                content: responseText,
                                timestamp: new Date()
                            });
                            
                            resolve({
                                content: responseText,
                                timestamp: new Date()
                            });
                        } else {
                            resolve(null);
                        }
                        
                        // Remove the temporary listener
                        ws.removeListener('message', responseHandler);
                    }
                };
                
                ws.on('message', responseHandler);
                
                // Timeout after 30 seconds
                setTimeout(() => {
                    ws.removeListener('message', responseHandler);
                    resolve(null);
                }, 30000);
            });
            
        } catch (error) {
            console.error(`❌ Error sending message to session ${sessionId}:`, error);
            return null;
        }
    }
    
    /**
     * Extract text content from OpenAI response
     */
    extractResponseText(responseData) {
        try {
            if (responseData.response && responseData.response.output) {
                const outputs = responseData.response.output;
                
                for (const output of outputs) {
                    if (output.type === 'message' && output.content) {
                        for (const content of output.content) {
                            if (content.type === 'text') {
                                return content.text;
                            }
                        }
                    }
                }
            }
            
            return null;
        } catch (error) {
            console.error('❌ Error extracting response text:', error);
            return null;
        }
    }
}

module.exports = OpenAIRealtimeService;