const axios = require('axios');
const EventEmitter = require('events');

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
    async makeOutboundCall(to, from = null, customerData = {}) {
        try {
            from = from || this.config.phoneNumber;
            
            console.log(`📞 Making Call Control outbound call from ${from} to ${to}`);
            
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
     * Hangup call
     */
    async hangupCall(callControlId) {
        try {
            console.log(`📴 Hanging up call: ${callControlId}`);
            
            const response = await this.client.post(`/calls/${callControlId}/actions/hangup`);
            
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
     * Start AI conversation flow
     */
    async startAIConversation(callControlId, customerData = {}) {
        try {
            console.log(`🤖 Starting AI conversation for call: ${callControlId}`);
            
            // Speak welcome message
            const welcomeText = `Hello! Thank you for answering. This is an AI assistant from the receipt roll company. I'm calling to tell you about our high-quality thermal receipt rolls. Is now a good time to talk?`;
            
            await this.speakText(callControlId, welcomeText);
            
            // Gather response (1 for yes, 2 for no, 9 to end)
            await this.gatherDTMF(callControlId, {
                prompt: 'Press 1 if now is a good time, press 2 if you prefer to be called later, or press 9 to opt out of future calls.',
                maxDigits: 1,
                timeout: 15000,
                validDigits: '129'
            });
            
            return { success: true, message: 'AI conversation started' };
            
        } catch (error) {
            console.error('❌ Error starting AI conversation:', error);
            throw error;
        }
    }
}

module.exports = TelnyxCallControlService;