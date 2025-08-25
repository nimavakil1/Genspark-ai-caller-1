const { RoomServiceClient, AccessToken, Room, Participant } = require('livekit-server-sdk');
const EventEmitter = require('events');

class LiveKitAgentService extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            apiKey: options.apiKey || process.env.LIVEKIT_API_KEY || 'devkey',
            apiSecret: options.apiSecret || process.env.LIVEKIT_API_SECRET || 'secret', 
            serverUrl: options.serverUrl || process.env.LIVEKIT_URL || 'ws://localhost:7880'
        };
        
        this.roomService = new RoomServiceClient(
            this.config.serverUrl,
            this.config.apiKey,
            this.config.apiSecret
        );
        
        this.activeAgentSessions = new Map(); // Track active agent sessions
        
        console.log('🎯 LiveKit Agent Service initialized');
    }
    
    /**
     * Create a LiveKit room for agent conversation
     */
    async createAgentRoom(callControlId, agentData, customerData = {}) {
        try {
            const roomName = `agent-call-${callControlId}`;
            
            console.log(`🏠 Creating LiveKit room: ${roomName} for agent: ${agentData?.name || 'Unknown'}`);
            
            // Create room with agent configuration
            const room = await this.roomService.createRoom({
                name: roomName,
                emptyTimeout: 10 * 60, // 10 minutes
                maxParticipants: 10,
                metadata: JSON.stringify({
                    agent: {
                        id: agentData?.id,
                        name: agentData?.name,
                        voice_settings: agentData?.voice_settings,
                        system_prompt: agentData?.system_prompt,
                        knowledge: agentData?.knowledge || []
                    },
                    customer: customerData,
                    call_control_id: callControlId,
                    created_at: new Date().toISOString()
                })
            });
            
            // Store session info
            this.activeAgentSessions.set(callControlId, {
                roomName,
                agentData,
                customerData,
                room,
                startTime: new Date()
            });
            
            console.log(`✅ LiveKit room created: ${roomName}`);
            return room;
            
        } catch (error) {
            console.error('❌ Error creating LiveKit room:', error);
            throw error;
        }
    }
    
    /**
     * Generate access token for agent or participant
     */
    generateAccessToken(roomName, participantName, participantType = 'agent') {
        try {
            const token = new AccessToken(this.config.apiKey, this.config.apiSecret, {
                identity: participantName,
                name: participantName,
            });
            
            // Set permissions based on participant type
            if (participantType === 'agent') {
                token.addGrant({
                    roomJoin: true,
                    room: roomName,
                    canPublish: true,
                    canSubscribe: true,
                    canPublishData: true,
                    canUpdateOwnMetadata: true
                });
            } else {
                // Customer/participant permissions
                token.addGrant({
                    roomJoin: true,
                    room: roomName,
                    canPublish: true,
                    canSubscribe: true
                });
            }
            
            const accessToken = token.toJwt();
            console.log(`🔑 Generated access token for ${participantType}: ${participantName}`);
            
            return accessToken;
            
        } catch (error) {
            console.error('❌ Error generating access token:', error);
            throw error;
        }
    }
    
    /**
     * Start agent conversation in LiveKit room
     */
    async startAgentConversation(callControlId, agentData, customerData = {}) {
        try {
            console.log(`🤖 Starting LiveKit agent conversation for call: ${callControlId}`);
            
            // Create room for the conversation
            const room = await this.createAgentRoom(callControlId, agentData, customerData);
            const roomName = room.name;
            
            // Generate tokens for agent and customer
            const agentToken = this.generateAccessToken(roomName, `agent-${agentData?.name || 'ai'}`, 'agent');
            const customerToken = this.generateAccessToken(roomName, `customer-${callControlId}`, 'participant');
            
            // Store session details
            const session = this.activeAgentSessions.get(callControlId);
            if (session) {
                session.agentToken = agentToken;
                session.customerToken = customerToken;
                session.status = 'active';
            }
            
            // Emit event for agent connection
            this.emit('agentConversationStarted', {
                callControlId,
                roomName,
                agentToken,
                customerToken,
                agentData,
                customerData
            });
            
            console.log(`✅ LiveKit agent conversation started in room: ${roomName}`);
            
            return {
                roomName,
                agentToken,
                customerToken,
                serverUrl: this.config.serverUrl,
                agentData
            };
            
        } catch (error) {
            console.error('❌ Error starting LiveKit agent conversation:', error);
            throw error;
        }
    }
    
    /**
     * End agent conversation and cleanup room
     */
    async endAgentConversation(callControlId) {
        try {
            console.log(`🏁 Ending LiveKit agent conversation for call: ${callControlId}`);
            
            const session = this.activeAgentSessions.get(callControlId);
            if (!session) {
                console.warn(`⚠️ No active session found for call: ${callControlId}`);
                return;
            }
            
            // Delete the room
            await this.roomService.deleteRoom(session.roomName);
            
            // Remove session
            this.activeAgentSessions.delete(callControlId);
            
            // Emit event
            this.emit('agentConversationEnded', {
                callControlId,
                roomName: session.roomName,
                duration: Date.now() - session.startTime.getTime()
            });
            
            console.log(`✅ LiveKit room deleted: ${session.roomName}`);
            
        } catch (error) {
            console.error('❌ Error ending LiveKit agent conversation:', error);
            throw error;
        }
    }
    
    /**
     * Get active session info
     */
    getAgentSession(callControlId) {
        return this.activeAgentSessions.get(callControlId);
    }
    
    /**
     * List all active sessions
     */
    getActiveSessions() {
        return Array.from(this.activeAgentSessions.entries()).map(([callId, session]) => ({
            callControlId: callId,
            roomName: session.roomName,
            agentName: session.agentData?.name,
            startTime: session.startTime,
            status: session.status || 'unknown'
        }));
    }
    
    /**
     * Send message to agent in room (for AI instructions)
     */
    async sendAgentInstruction(callControlId, instruction) {
        try {
            const session = this.activeAgentSessions.get(callControlId);
            if (!session) {
                throw new Error(`No active session for call: ${callControlId}`);
            }
            
            // Send data message to room
            await this.roomService.sendData(
                session.roomName,
                JSON.stringify({
                    type: 'agent_instruction',
                    instruction,
                    timestamp: new Date().toISOString()
                }),
                null, // Send to all participants
                { reliable: true }
            );
            
            console.log(`📤 Sent instruction to agent in room ${session.roomName}: ${instruction}`);
            
        } catch (error) {
            console.error('❌ Error sending agent instruction:', error);
            throw error;
        }
    }
    
    /**
     * Update agent knowledge during conversation
     */
    async updateAgentKnowledge(callControlId, knowledgeUpdate) {
        try {
            const session = this.activeAgentSessions.get(callControlId);
            if (!session) {
                throw new Error(`No active session for call: ${callControlId}`);
            }
            
            // Update session knowledge
            if (session.agentData && session.agentData.knowledge) {
                session.agentData.knowledge.push(knowledgeUpdate);
            }
            
            // Send knowledge update to agent
            await this.roomService.sendData(
                session.roomName,
                JSON.stringify({
                    type: 'knowledge_update',
                    knowledge: knowledgeUpdate,
                    timestamp: new Date().toISOString()
                }),
                null,
                { reliable: true }
            );
            
            console.log(`🧠 Updated agent knowledge in room ${session.roomName}`);
            
        } catch (error) {
            console.error('❌ Error updating agent knowledge:', error);
            throw error;
        }
    }
    
    /**
     * Get room statistics and participant info
     */
    async getRoomStats(callControlId) {
        try {
            const session = this.activeAgentSessions.get(callControlId);
            if (!session) {
                throw new Error(`No active session for call: ${callControlId}`);
            }
            
            const participants = await this.roomService.listParticipants(session.roomName);
            
            return {
                roomName: session.roomName,
                participants: participants.length,
                agentName: session.agentData?.name,
                duration: Date.now() - session.startTime.getTime(),
                participantDetails: participants.map(p => ({
                    identity: p.identity,
                    name: p.name,
                    joinedAt: p.joinedAt
                }))
            };
            
        } catch (error) {
            console.error('❌ Error getting room stats:', error);
            throw error;
        }
    }
}

module.exports = LiveKitAgentService;