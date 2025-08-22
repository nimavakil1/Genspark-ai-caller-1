#!/usr/bin/env node

const TelnyxVoiceAPIService = require('./services/telnyxVoiceAPI');
const AICallHandler = require('./services/aiCallHandlerVoiceAPI');

// Load environment variables
require('dotenv').config();

class TelnyxVoiceIntegration {
    constructor() {
        this.telnyxService = new TelnyxVoiceAPIService({
            apiKey: process.env.TELNYX_API_KEY,
            phoneNumber: process.env.TELNYX_PHONE_NUMBER || '+3226010500'
        });
        
        this.aiHandler = new AICallHandler(this.telnyxService);
        this.setupEventHandlers();
    }
    
    setupEventHandlers() {
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down Telnyx Voice Integration...');
            this.shutdown();
        });
        
        process.on('SIGTERM', () => {
            console.log('\n🛑 Shutting down Telnyx Voice Integration...');
            this.shutdown();
        });
        
        // Handle any unhandled errors
        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
        });
        
        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught Exception:', error);
            this.shutdown();
        });
    }
    
    async start() {
        try {
            console.log('🚀 Starting Telnyx Voice Integration...');
            console.log('📋 Configuration:');
            console.log(`   API Key: ${this.telnyxService.config.apiKey ? '✅ Configured' : '❌ Missing'}`);
            console.log(`   Phone Number: ${this.telnyxService.config.phoneNumber}`);
            console.log(`   Base URL: ${this.telnyxService.config.baseURL}`);
            console.log('');
            
            if (!this.telnyxService.config.apiKey) {
                throw new Error('TELNYX_API_KEY environment variable is required');
            }
            
            console.log('✅ Telnyx Voice Integration is ready!');
            console.log('📞 Ready to handle incoming calls via webhooks');
            console.log('🔗 Make sure your webhook URL is configured in Telnyx Portal:');
            console.log(`   ${process.env.SERVER_BASE_URL || 'http://your-server.com'}/api/telnyx/webhooks/call-events`);
            console.log('');
            console.log('🧪 Test outbound calling with: node -e "require(\'./telnyxVoiceIntegration\').testCall()"');
            console.log('');
            
            // The service is now ready to handle webhook events
            // Incoming calls will be handled through the webhook endpoint
            
        } catch (error) {
            console.error('❌ Failed to start integration:', error.message);
            process.exit(1);
        }
    }
    
    shutdown() {
        console.log('✅ Telnyx Voice Integration stopped');
        process.exit(0);
    }
    
    // Method to make outbound calls
    async makeOutboundCall(to, from = null) {
        try {
            const call = await this.telnyxService.makeOutboundCall(to, from);
            console.log(`📞 Outbound call initiated to ${to}`);
            return call;
        } catch (error) {
            console.error('❌ Failed to make outbound call:', error.message);
            throw error;
        }
    }
    
    // Handle webhook events from Telnyx
    handleWebhook(req, res) {
        try {
            const event = req.body;
            
            // Verify webhook (in production, verify the signature)
            if (!event || !event.event_type) {
                return res.status(400).json({ error: 'Invalid webhook payload' });
            }
            
            console.log('📨 Received webhook:', event.event_type);
            
            // Handle the event
            this.telnyxService.handleWebhook(event);
            
            // Respond to Telnyx
            res.status(200).json({ received: true });
            
        } catch (error) {
            console.error('❌ Error handling webhook:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
    
    // Test method for outbound calling
    static async testCall() {
        const integration = new TelnyxVoiceIntegration();
        
        try {
            console.log('🧪 Testing outbound call...');
            const testNumber = process.env.TEST_PHONE_NUMBER || '+32479202020';
            await integration.makeOutboundCall(testNumber);
            console.log('✅ Test call initiated successfully');
        } catch (error) {
            console.error('❌ Test call failed:', error.message);
        }
    }
}

// Start the integration if run directly
if (require.main === module) {
    const integration = new TelnyxVoiceIntegration();
    integration.start();
}

module.exports = TelnyxVoiceIntegration;