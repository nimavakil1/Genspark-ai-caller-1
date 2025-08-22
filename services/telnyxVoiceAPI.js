const axios = require('axios');
const EventEmitter = require('events');

class TelnyxVoiceAPIService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.config = {
            apiKey: options.apiKey || process.env.TELNYX_API_KEY,
            baseURL: 'https://api.telnyx.com/v2',
            phoneNumber: options.phoneNumber || process.env.TELNYX_PHONE_NUMBER || '+3226010500'
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
        
        console.log('🔗 Telnyx Voice API client configured');
    }
    
    async makeOutboundCall(to, from = null) {
        try {
            from = from || this.config.phoneNumber;
            
            console.log(`📞 Making outbound call from ${from} to ${to}`);
            
            const callData = {
                to: to,
                from: from,
                connection_id: process.env.TELNYX_CONNECTION_ID, // We'll need this
                webhook_url: `${process.env.SERVER_BASE_URL || 'http://localhost:3000'}/api/telnyx/webhooks/call-events`,
                webhook_url_method: 'POST',
                media_encryption: 'disabled',
                record: 'record-from-start', // Enable call recording
                record_channels: 'dual',
                record_format: 'wav'
            };
            
            const response = await this.client.post('/calls', callData);
            const call = response.data.data;
            
            this.activeCalls.set(call.call_control_id, call);
            
            console.log('✅ Outbound call initiated:', call.call_control_id);
            this.emit('callInitiated', call);
            
            return call;
            
        } catch (error) {
            console.error('❌ Error making outbound call:', error.response?.data || error.message);
            throw error;
        }
    }
    
    async answerCall(callControlId) {
        try {
            console.log(`📞 Answering call: ${callControlId}`);
            
            const response = await this.client.post(`/calls/${callControlId}/actions/answer`, {
                webhook_url: `${process.env.SERVER_BASE_URL || 'http://localhost:3000'}/api/telnyx/webhooks/call-events`
            });
            
            console.log('✅ Call answered');
            this.emit('callAnswered', callControlId);
            
            return response.data;
            
        } catch (error) {
            console.error('❌ Error answering call:', error.response?.data || error.message);
            throw error;
        }
    }
    
    async hangupCall(callControlId) {
        try {
            console.log(`📞 Hanging up call: ${callControlId}`);
            
            const response = await this.client.post(`/calls/${callControlId}/actions/hangup`);
            
            this.activeCalls.delete(callControlId);
            console.log('✅ Call hung up');
            this.emit('callHangup', callControlId);
            
            return response.data;
            
        } catch (error) {
            console.error('❌ Error hanging up call:', error.response?.data || error.message);
            throw error;
        }
    }
    
    async speakText(callControlId, text, voice = 'female', language = 'en') {
        try {
            console.log(`🗣️  Speaking text on call ${callControlId}: "${text}"`);
            
            const response = await this.client.post(`/calls/${callControlId}/actions/speak`, {
                payload: text,
                voice: voice,
                language: language
            });
            
            console.log('✅ Text-to-speech initiated');
            this.emit('speechStarted', callControlId, text);
            
            return response.data;
            
        } catch (error) {
            console.error('❌ Error speaking text:', error.response?.data || error.message);
            throw error;
        }
    }
    
    async gatherInput(callControlId, prompt, options = {}) {
        try {
            console.log(`🎤 Gathering input on call ${callControlId}: "${prompt}"`);
            
            const gatherData = {
                speak: {
                    payload: prompt,
                    voice: options.voice || 'female',
                    language: options.language || 'en'
                },
                minimum_digits: options.minimumDigits || 1,
                maximum_digits: options.maximumDigits || 10,
                timeout_millis: options.timeoutMs || 5000,
                terminating_digit: options.terminatingDigit || '#',
                valid_digits: options.validDigits || '0123456789*#'
            };
            
            const response = await this.client.post(`/calls/${callControlId}/actions/gather_using_speak`, gatherData);
            
            console.log('✅ Gather input initiated');
            this.emit('gatherStarted', callControlId, prompt);
            
            return response.data;
            
        } catch (error) {
            console.error('❌ Error gathering input:', error.response?.data || error.message);
            throw error;
        }
    }
    
    async startRecording(callControlId) {
        try {
            console.log(`📹 Starting recording for call: ${callControlId}`);
            
            const response = await this.client.post(`/calls/${callControlId}/actions/record_start`, {
                format: 'wav',
                channels: 'dual'
            });
            
            console.log('✅ Recording started');
            this.emit('recordingStarted', callControlId);
            
            return response.data;
            
        } catch (error) {
            console.error('❌ Error starting recording:', error.response?.data || error.message);
            throw error;
        }
    }
    
    async stopRecording(callControlId) {
        try {
            console.log(`⏹️  Stopping recording for call: ${callControlId}`);
            
            const response = await this.client.post(`/calls/${callControlId}/actions/record_stop`);
            
            console.log('✅ Recording stopped');
            this.emit('recordingStopped', callControlId);
            
            return response.data;
            
        } catch (error) {
            console.error('❌ Error stopping recording:', error.response?.data || error.message);
            throw error;
        }
    }
    
    // Handle webhook events from Telnyx
    handleWebhook(event) {
        console.log('📨 Telnyx webhook event:', event.event_type);
        
        const callControlId = event.payload?.call_control_id;
        
        switch (event.event_type) {
            case 'call.initiated':
                this.handleCallInitiated(event.payload);
                break;
                
            case 'call.answered':
                this.handleCallAnswered(event.payload);
                break;
                
            case 'call.hangup':
                this.handleCallHangup(event.payload);
                break;
                
            case 'call.speak.ended':
                this.handleSpeechEnded(event.payload);
                break;
                
            case 'call.gather.ended':
                this.handleGatherEnded(event.payload);
                break;
                
            case 'call.recording.saved':
                this.handleRecordingSaved(event.payload);
                break;
                
            default:
                console.log('🔔 Unhandled webhook event:', event.event_type);
        }
        
        this.emit('webhook', event);
    }
    
    handleCallInitiated(payload) {
        console.log(`📞 Call initiated: ${payload.call_control_id}`);
        this.activeCalls.set(payload.call_control_id, payload);
        this.emit('callInitiated', payload);
    }
    
    handleCallAnswered(payload) {
        console.log(`📞 Call answered: ${payload.call_control_id}`);
        this.emit('callAnswered', payload);
    }
    
    handleCallHangup(payload) {
        console.log(`📞 Call ended: ${payload.call_control_id}`);
        this.activeCalls.delete(payload.call_control_id);
        this.emit('callHangup', payload);
    }
    
    handleSpeechEnded(payload) {
        console.log(`🗣️  Speech ended: ${payload.call_control_id}`);
        this.emit('speechEnded', payload);
    }
    
    handleGatherEnded(payload) {
        console.log(`🎤 Gather ended: ${payload.call_control_id}, digits: ${payload.digits}`);
        this.emit('gatherEnded', payload);
    }
    
    handleRecordingSaved(payload) {
        console.log(`📹 Recording saved: ${payload.recording_url}`);
        this.emit('recordingSaved', payload);
    }
    
    getActiveCall(callControlId) {
        return this.activeCalls.get(callControlId);
    }
    
    getAllActiveCalls() {
        return Array.from(this.activeCalls.values());
    }
}

module.exports = TelnyxVoiceAPIService;