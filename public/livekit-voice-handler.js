// LiveKit Voice Handler for AI Sales System
// This module handles LiveKit integration for voice conversations

class LiveKitVoiceHandler {
    constructor() {
        this.room = null;
        this.localAudioTrack = null;
        this.remoteAudioTrack = null;
        this.isConnected = false;
        this.sessionId = null;
        this.roomName = null;
        this.token = null;
        this.livekitUrl = null;
        this.conversationHistory = [];
        this.livekitClient = null;
    }

    async startVoiceTest(agentId, scenario = 'general_inquiry') {
        try {
            console.log('🚀 Starting LiveKit voice test for agent:', agentId);
            
            // Start voice test session
            const response = await fetch('/api/voice-test/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders()
                },
                body: JSON.stringify({
                    agent_id: agentId,
                    customer_name: 'Test User',
                    test_mode: true
                })
            });

            if (!response.ok) {
                throw new Error('Failed to start voice test session');
            }

            const data = await response.json();
            console.log('✅ Voice test session created:', data);

            // Store session details
            this.sessionId = data.session_id;
            this.roomName = data.room_name;
            this.token = data.customer_token;
            this.livekitUrl = data.livekit_url;

            // Connect to LiveKit room
            await this.connectToRoom();

            return data;

        } catch (error) {
            console.error('❌ Error starting voice test:', error);
            throw error;
        }
    }

    async connectToRoom() {
        try {
            console.log('🔗 Connecting to LiveKit room:', this.roomName);

            // Import LiveKit client (assuming it's loaded via CDN)
            if (!window.LivekitClient) {
                throw new Error('LiveKit client not loaded');
            }

            this.livekitClient = window.LivekitClient;
            const { Room, RoomEvent, Track, RemoteTrack, createLocalAudioTrack } = this.livekitClient;

            // Create room instance
            this.room = new Room({
                adaptiveStream: true,
                dynacast: true,
            });

            // Set up event listeners
            this.setupRoomEventListeners();

            // Connect to room
            await this.room.connect(this.livekitUrl, this.token);
            console.log('✅ Connected to LiveKit room');

            // Enable local microphone with explicit constraints
            console.log('🎤 Creating local audio track with microphone access...');
            try {
                this.localAudioTrack = await createLocalAudioTrack({
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                });
                
                console.log('🎤 Local audio track created:', this.localAudioTrack);
                if (this.localAudioTrack && this.localAudioTrack.mediaStreamTrack) {
                    console.log('🎤 Audio track enabled:', this.localAudioTrack.mediaStreamTrack.enabled);
                    console.log('🎤 Audio track readyState:', this.localAudioTrack.mediaStreamTrack.readyState);
                }
                
                await this.room.localParticipant.publishTrack(this.localAudioTrack);
                console.log('✅ Local audio track published');
            } catch (micError) {
                console.error('❌ Error creating audio track:', micError);
                // Continue without microphone - agent can still respond
                console.warn('⚠️ Continuing without microphone access');
            }

            this.isConnected = true;

        } catch (error) {
            console.error('❌ Error connecting to room:', error);
            throw error;
        }
    }

    setupRoomEventListeners() {
        if (!this.livekitClient) {
            console.error('❌ LiveKit client not available for event listeners');
            return;
        }
        const { RoomEvent, Track, RemoteTrack } = this.livekitClient;

        // Participant connected
        this.room.on(RoomEvent.ParticipantConnected, (participant) => {
            console.log('👤 Participant connected:', participant.identity);
        });

        // Track subscribed
        this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
            console.log('📡 Track subscribed:', track.kind, 'from', participant.identity);
            
            if (track.kind === Track.Kind.Audio) {
                const audioElement = document.createElement('audio');
                audioElement.autoplay = true;
                audioElement.controls = false;
                track.attach(audioElement);
                document.body.appendChild(audioElement);
                this.remoteAudioTrack = track;
                console.log('🔊 Remote audio track attached');
            }
        });

        // Track unsubscribed
        this.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            console.log('📡 Track unsubscribed:', track.kind, 'from', participant.identity);
            track.detach();
        });

        // Data received (for conversation transcripts)
        this.room.on(RoomEvent.DataReceived, (payload, participant) => {
            try {
                const data = JSON.parse(new TextDecoder().decode(payload));
                console.log('📨 Data received:', data);
                
                if (data.type === 'transcript') {
                    this.handleTranscript(data);
                }
            } catch (error) {
                console.error('❌ Error parsing received data:', error);
            }
        });

        // Room disconnected
        this.room.on(RoomEvent.Disconnected, () => {
            console.log('🔌 Room disconnected');
            this.isConnected = false;
        });

        // Connection quality changed
        this.room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
            console.log('📶 Connection quality:', quality, 'for', participant?.identity || 'local');
        });
    }

    handleTranscript(data) {
        const message = {
            type: data.speaker === 'customer' ? 'customer' : 'assistant',
            content: data.text,
            timestamp: new Date(data.timestamp)
        };

        this.conversationHistory.push(message);
        
        // Trigger UI update
        if (window.addConversationMessage) {
            const speaker = data.speaker === 'customer' ? 'You' : 'Agent';
            window.addConversationMessage(speaker, data.text, data.speaker !== 'customer');
        }

        console.log('💬 Transcript added:', message);
    }

    async endVoiceTest() {
        try {
            console.log('🏁 Ending voice test session');

            // Disconnect from room
            if (this.room && this.isConnected) {
                await this.room.disconnect();
                console.log('✅ Disconnected from LiveKit room');
            }

            // End server session
            if (this.sessionId) {
                const response = await fetch(`/api/voice-test/end/${this.sessionId}`, {
                    method: 'POST',
                    headers: this.getAuthHeaders()
                });

                if (response.ok) {
                    console.log('✅ Server session ended');
                } else {
                    console.warn('⚠️ Failed to end server session');
                }
            }

            // Clean up
            this.cleanup();

        } catch (error) {
            console.error('❌ Error ending voice test:', error);
            throw error;
        }
    }

    cleanup() {
        this.room = null;
        this.localAudioTrack = null;
        this.remoteAudioTrack = null;
        this.isConnected = false;
        this.sessionId = null;
        this.roomName = null;
        this.token = null;
        this.livekitUrl = null;
        this.conversationHistory = [];
        this.livekitClient = null;
    }

    getAuthHeaders() {
        const token = localStorage.getItem('auth_token');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    getConversationHistory() {
        return this.conversationHistory;
    }

    isConnectedToRoom() {
        return this.isConnected;
    }
}

// Export for use in dashboard
window.LiveKitVoiceHandler = LiveKitVoiceHandler;