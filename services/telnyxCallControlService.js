const axios = require('axios');
const EventEmitter = require('events');
const LiveKitAgentService = require('./livekitAgentService');

class TelnyxCallControlService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.config = {
            apiKey: options.apiKey || process.env.TELNYX_API_KEY,
            baseURL: 'https://api.telnyx.com/v2',
            phoneNumber: options.phoneNumber || process.env.TELNYX_PHONE_NUMBER || '+3226010500',
            connectionId: options.connectionId || '2729194733782959144' // Call Control App ID
        };
        
        this.activeCalls = new Map();
        this.livekitService = new LiveKitAgentService();
        this.setupAxios();
    }
    
    setupAxios() {
        this.client = axios.create({
            baseURL: this.config.baseURL,
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('🔗 Telnyx Call Control API client configured');
    }
    
    /**
     * Make outbound call using Call Control API
     */
    async makeOutboundCall(to, from = null, customerData = {}, agentData = null) {
        try {
            from = from || this.config.phoneNumber;
            
            console.log(`📞 Making Call Control outbound call from ${from} to ${to}`);
            if (agentData) {
                console.log(`🤖 Using AI Agent: ${agentData.name} (ID: ${agentData.id})`);
            }
            
            const callData = {
                to: to,
                from: from,
                connection_id: this.config.connectionId,
                webhook_url: `${process.env.SERVER_BASE_URL || 'http://51.195.41.57:3000'}/api/call-control/webhooks`,
                webhook_url_method: 'POST'
            };
            
            const response = await this.client.post('/calls', callData);
            const call = response.data.data;
            
            this.activeCalls.set(call.call_control_id, {
                ...call,
                customerData,
                agentData,
                startTime: new Date()
            });
            
            console.log('✅ Call Control outbound call initiated:', call.call_control_id);
            this.emit('callInitiated', call);
            
            return call;
            
        } catch (error) {
            console.error('❌ Error making Call Control outbound call:', error.response?.data || error.message);
            throw error;
        }
    }
    
    /**
     * Answer incoming call
     */
    async answerCall(callControlId) {
        try {
            console.log(`📞 Answering call: ${callControlId}`);
            
            const response = await this.client.post(`/calls/${callControlId}/actions/answer`);
            
            console.log('✅ Call answered successfully');
            return response.data;
            
        } catch (error) {
            console.error('❌ Error answering call:', error.response?.data || error.message);
            throw error;
        }
    }
    
    /**
     * Speak text to caller using TTS
     */
    async speakText(callControlId, text, voice = 'alice', language = 'en') {
        try {
            console.log(`🗣️ Speaking to call ${callControlId}: "${text.substring(0, 50)}..."`);
            
            const response = await this.client.post(`/calls/${callControlId}/actions/speak`, {
                payload: text,
                voice: voice,
                language: language
            });
            
            console.log('✅ Text-to-speech initiated');
            return response.data;
            
        } catch (error) {
            console.error('❌ Error speaking text:', error.response?.data || error.message);
            throw error;
        }
    }
    
    /**
     * Gather DTMF input from caller
     */
    async gatherDTMF(callControlId, options = {}) {
        try {
            console.log(`🔢 Gathering DTMF from call: ${callControlId}`);
            
            const gatherData = {
                minimum_digits: options.minDigits || 1,
                maximum_digits: options.maxDigits || 1,
                timeout_millis: options.timeout || 10000,
                terminating_digit: options.terminatingDigit || '#',
                valid_digits: options.validDigits || '0123456789*#'
            };
            
            const response = await this.client.post(`/calls/${callControlId}/actions/gather_using_speak`, {
                payload: options.prompt || 'Please enter your selection followed by the pound key.',
                voice: options.voice || 'alice',
                language: options.language || 'en',
                ...gatherData
            });
            
            console.log('✅ DTMF gathering initiated');
            return response.data;
            
        } catch (error) {
            console.error('❌ Error gathering DTMF:', error.response?.data || error.message);
            throw error;
        }
    }
    
    /**
     * Hangup call and cleanup LiveKit session
     */
    async hangupCall(callControlId) {
        try {
            console.log(`📴 Hanging up call: ${callControlId}`);
            
            // Get call data before cleanup
            const callData = this.activeCalls.get(callControlId);
            
            const response = await this.client.post(`/calls/${callControlId}/actions/hangup`);
            
            // Cleanup LiveKit session if it exists
            if (callData?.livekitSession) {
                try {
                    await this.livekitService.endAgentConversation(callControlId);
                    console.log(`🎯 LiveKit session cleaned up for call: ${callControlId}`);
                } catch (livekitError) {
                    console.warn('⚠️ Error cleaning up LiveKit session:', livekitError.message);
                }
            }
            
            // Remove from active calls
            this.activeCalls.delete(callControlId);
            
            console.log('✅ Call ended successfully');
            return response.data;
            
        } catch (error) {
            console.error('❌ Error hanging up call:', error.response?.data || error.message);
            throw error;
        }
    }
    
    /**
     * Get call information
     */
    getCallInfo(callControlId) {
        return this.activeCalls.get(callControlId);
    }
    
    /**
     * Start AI conversation flow with agent configuration and LiveKit integration
     */
    async startAIConversation(callControlId, customerData = {}) {
        try {
            console.log(`🤖 Starting AI conversation for call: ${callControlId}`);
            
            const callInfo = this.getCallInfo(callControlId);
            const agentData = callInfo?.agentData;
            
            let welcomeText = `Hello! Thank you for answering. This is an AI assistant from the receipt roll company. I'm calling to tell you about our high-quality thermal receipt rolls. Is now a good time to talk?`;
            let voice = 'alice';
            let language = 'en';
            
            // Use agent configuration if available
            if (agentData) {
                console.log(`🤖 Using agent configuration: ${agentData.name}`);
                
                // Use agent voice settings
                const voiceSettings = agentData.voice_settings || {};
                voice = this.mapAgentVoiceToTelnyx(voiceSettings.voice || 'alloy');
                language = voiceSettings.language || 'en';
                
                // Generate welcome message from agent prompt and knowledge
                welcomeText = await this.generateAgentWelcomeMessage(agentData, customerData);
                
                // Start LiveKit agent conversation for real-time interaction
                try {
                    const livekitSession = await this.livekitService.startAgentConversation(
                        callControlId, 
                        agentData, 
                        customerData
                    );
                    
                    console.log(`🎯 LiveKit agent session started: ${livekitSession.roomName}`);
                    
                    // Store LiveKit session info in call data
                    const callData = this.activeCalls.get(callControlId);
                    if (callData) {
                        callData.livekitSession = livekitSession;
                    }
                    
                    // For now, still use TTS for initial message, but LiveKit is ready for real-time conversation
                    await this.speakText(callControlId, welcomeText + ' I can now have a natural conversation with you using advanced AI technology.', voice, language);
                    
                    // Skip DTMF gathering - agent can handle natural conversation
                    console.log(`🗣️ Agent conversation mode: Natural speech enabled for ${agentData.name}`);
                    
                    return { 
                        success: true, 
                        message: 'AI conversation started with agent configuration and LiveKit integration',
                        livekit: {
                            roomName: livekitSession.roomName,
                            agentActive: true
                        }
                    };
                    
                } catch (livekitError) {
                    console.warn('⚠️ LiveKit integration failed, falling back to basic TTS:', livekitError.message);
                    
                    // Fallback to basic TTS + DTMF flow
                    await this.speakText(callControlId, welcomeText, voice, language);
                    
                    await this.gatherDTMF(callControlId, {
                        prompt: 'Press 1 if now is a good time, press 2 if you prefer to be called later, or press 9 to opt out of future calls.',
                        maxDigits: 1,
                        timeout: 15000,
                        validDigits: '129',
                        voice: voice,
                        language: language
                    });
                }
                
            } else {
                // No agent configured - use basic flow
                await this.speakText(callControlId, welcomeText, voice, language);
                
                await this.gatherDTMF(callControlId, {
                    prompt: 'Press 1 if now is a good time, press 2 if you prefer to be called later, or press 9 to opt out of future calls.',
                    maxDigits: 1,
                    timeout: 15000,
                    validDigits: '129',
                    voice: voice,
                    language: language
                });
            }
            
            return { success: true, message: 'AI conversation started with agent configuration' };
            
        } catch (error) {
            console.error('❌ Error starting AI conversation:', error);
            throw error;
        }
    }
    
    /**
     * Map agent voice models to Telnyx TTS voices
     */
    mapAgentVoiceToTelnyx(agentVoice) {
        const voiceMap = {
            'alloy': 'alice',
            'echo': 'alice', 
            'fable': 'alice',
            'onyx': 'alice',
            'nova': 'alice',
            'shimmer': 'alice'
        };
        
        return voiceMap[agentVoice] || 'alice';
    }
    
    /**
     * Generate welcome message using agent prompt and knowledge
     */
    async generateAgentWelcomeMessage(agentData, customerData = {}) {
        try {
            // For now, create a simple welcome message based on agent description
            // TODO: Integrate with OpenAI to generate dynamic messages from system prompt
            
            const agentName = agentData.name || 'AI Assistant';
            const description = agentData.description || 'helping with your business needs';
            
            let welcomeText = `Hello! This is ${agentName} from the receipt roll company. I'm an AI assistant specialized in ${description}. `;
            
            // Add knowledge-based context if available
            if (agentData.knowledge && agentData.knowledge.length > 0) {
                const productInfo = agentData.knowledge.find(k => 
                    k.title.toLowerCase().includes('product') || 
                    k.title.toLowerCase().includes('catalog')
                );
                
                if (productInfo) {
                    welcomeText += `I have information about our thermal receipt rolls and can help you with pricing and orders. `;
                }
            }
            
            welcomeText += `Is now a good time to discuss your receipt roll needs?`;
            
            console.log(`🤖 Generated welcome message for agent ${agentName}: ${welcomeText.substring(0, 100)}...`);
            
            return welcomeText;
            
        } catch (error) {
            console.error('❌ Error generating agent welcome message:', error);
            // Fallback to default message
            return `Hello! Thank you for answering. This is an AI assistant from the receipt roll company. I'm calling to tell you about our high-quality thermal receipt rolls. Is now a good time to talk?`;
        }
    }
}

module.exports = TelnyxCallControlService;