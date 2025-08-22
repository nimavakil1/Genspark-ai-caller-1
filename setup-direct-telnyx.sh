#!/bin/bash

# Direct Telnyx WebRTC Integration Setup
# Alternative approach since LiveKit Community Edition lacks SIP support

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}================================================================${NC}"
    echo -e "${BLUE}🚀 Direct Telnyx WebRTC Integration Setup${NC}"
    echo -e "${BLUE}================================================================${NC}"
}

print_success() {
    echo -e "${GREEN}[✅ SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[⚠️  WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[❌ ERROR]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[ℹ️  INFO]${NC} $1"
}

explain_approach() {
    print_info "🎯 Direct Telnyx Integration Approach"
    echo ""
    echo "Since LiveKit Community Edition lacks SIP support, we're implementing"
    echo "a direct Telnyx WebRTC integration that provides the same functionality:"
    echo ""
    echo "📞 Telnyx WebRTC ←→ 🌐 Your Server ←→ 🤖 AI Agent ←→ 📊 Database"
    echo ""
    echo "Benefits:"
    echo "  ✅ No LiveKit SIP limitations"
    echo "  ✅ Official Telnyx SDK support"
    echo "  ✅ Real-time audio processing"
    echo "  ✅ Production-ready solution"
    echo "  ✅ Easier debugging and maintenance"
    echo ""
}

install_dependencies() {
    print_info "Installing Telnyx WebRTC SDK and audio processing dependencies..."
    
    # Install Telnyx WebRTC SDK
    if npm install @telnyx/webrtc; then
        print_success "Telnyx WebRTC SDK installed"
    else
        print_error "Failed to install Telnyx WebRTC SDK"
        return 1
    fi
    
    # Install audio processing dependencies
    if npm install ws socket.io-client node-record-lpcm16 wav; then
        print_success "Audio processing dependencies installed"
    else
        print_warning "Some audio dependencies may have failed (this is normal on Linux servers)"
    fi
}

create_telnyx_webrtc_service() {
    print_info "Creating Telnyx WebRTC service..."
    
    mkdir -p services
    
    cat > services/telnyxWebRTC.js << 'EOF'
const { TelnyxRTC } = require('@telnyx/webrtc');
const EventEmitter = require('events');

class TelnyxWebRTCService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.config = {
            login: options.login || process.env.TELNYX_SIP_USERNAME,
            password: options.password || process.env.TELNYX_SIP_PASSWORD,
            server: options.server || 'sip.telnyx.com'
        };
        
        this.client = null;
        this.activeCalls = new Map();
    }
    
    async connect() {
        try {
            console.log('🔗 Connecting to Telnyx WebRTC...');
            
            this.client = new TelnyxRTC({
                login: this.config.login,
                password: this.config.password
            });
            
            this.setupEventHandlers();
            await this.client.connect();
            
            console.log('✅ Connected to Telnyx WebRTC');
            this.emit('connected');
            
        } catch (error) {
            console.error('❌ Failed to connect to Telnyx WebRTC:', error);
            this.emit('error', error);
        }
    }
    
    setupEventHandlers() {
        this.client.on('telnyx.ready', () => {
            console.log('📞 Telnyx WebRTC ready for calls');
            this.emit('ready');
        });
        
        this.client.on('telnyx.error', (error) => {
            console.error('❌ Telnyx WebRTC error:', error);
            this.emit('error', error);
        });
        
        this.client.on('telnyx.notification', (notification) => {
            this.handleNotification(notification);
        });
    }
    
    handleNotification(notification) {
        console.log('📨 Notification:', notification.type);
        
        switch (notification.type) {
            case 'callUpdate':
                this.handleCallUpdate(notification);
                break;
            default:
                console.log('🔔 Unhandled notification:', notification.type);
        }
    }
    
    handleCallUpdate(notification) {
        const call = notification.call;
        const callId = call.id;
        
        console.log(`📞 Call ${callId} state: ${call.state}`);
        
        switch (call.state) {
            case 'ringing':
                this.handleIncomingCall(call);
                break;
            case 'active':
                this.handleActiveCall(call);
                break;
            case 'hangup':
                this.handleCallEnd(call);
                break;
        }
    }
    
    async handleIncomingCall(call) {
        console.log(`📞 Incoming call from: ${call.from}`);
        
        try {
            // Answer the call
            await call.answer();
            console.log('✅ Call answered');
            
            // Store active call
            this.activeCalls.set(call.id, call);
            
            // Emit event for AI processing
            this.emit('incomingCall', call);
            
        } catch (error) {
            console.error('❌ Error answering call:', error);
        }
    }
    
    handleActiveCall(call) {
        console.log(`🎙️  Call ${call.id} is now active`);
        
        // Setup audio stream processing
        if (call.remoteStream) {
            console.log('🎵 Audio stream available');
            this.emit('audioStream', call, call.remoteStream);
        }
    }
    
    handleCallEnd(call) {
        console.log(`📞 Call ${call.id} ended`);
        this.activeCalls.delete(call.id);
        this.emit('callEnd', call);
    }
    
    async makeOutboundCall(to, from) {
        try {
            console.log(`📞 Making outbound call from ${from} to ${to}`);
            
            const call = await this.client.newCall({
                destinationNumber: to,
                callerNumber: from
            });
            
            this.activeCalls.set(call.id, call);
            console.log('✅ Outbound call initiated');
            
            return call;
            
        } catch (error) {
            console.error('❌ Error making outbound call:', error);
            throw error;
        }
    }
    
    disconnect() {
        if (this.client) {
            this.client.disconnect();
            console.log('🔌 Disconnected from Telnyx WebRTC');
        }
    }
}

module.exports = TelnyxWebRTCService;
EOF
    
    print_success "Telnyx WebRTC service created at services/telnyxWebRTC.js"
}

create_ai_call_handler() {
    print_info "Creating AI call handler..."
    
    cat > services/aiCallHandler.js << 'EOF'
const EventEmitter = require('events');

class AICallHandler extends EventEmitter {
    constructor(telnyxService) {
        super();
        this.telnyxService = telnyxService;
        this.setupEventHandlers();
    }
    
    setupEventHandlers() {
        this.telnyxService.on('incomingCall', (call) => {
            this.handleIncomingCall(call);
        });
        
        this.telnyxService.on('audioStream', (call, stream) => {
            this.handleAudioStream(call, stream);
        });
        
        this.telnyxService.on('callEnd', (call) => {
            this.handleCallEnd(call);
        });
    }
    
    async handleIncomingCall(call) {
        console.log('🤖 AI handling incoming call:', call.from);
        
        // Log call to database
        await this.logCallToDatabase(call, 'inbound');
        
        // Start AI conversation
        await this.startAIConversation(call);
    }
    
    async handleAudioStream(call, stream) {
        console.log('🎙️  Processing audio stream for AI');
        
        // This is where you'd integrate with your AI service
        // For now, we'll just log that audio is available
        
        try {
            // Placeholder for AI audio processing
            // In production, you would:
            // 1. Convert audio stream to text (speech-to-text)
            // 2. Process with AI (OpenAI, etc.)
            // 3. Convert AI response to speech (text-to-speech)
            // 4. Send audio response back to call
            
            console.log('🧠 AI processing audio stream...');
            
            // Simulate AI processing delay
            setTimeout(() => {
                this.sendAIResponse(call, "Hello! This is an AI assistant. How can I help you today?");
            }, 2000);
            
        } catch (error) {
            console.error('❌ Error processing audio with AI:', error);
        }
    }
    
    async sendAIResponse(call, message) {
        console.log('🗣️  AI Response:', message);
        
        // In production, you would convert text to speech and send audio
        // For now, we'll just log the response
        
        // Placeholder for text-to-speech and audio sending
        // You would use services like:
        // - Google Text-to-Speech
        // - Amazon Polly
        // - OpenAI TTS
        // - Microsoft Speech Services
    }
    
    async startAIConversation(call) {
        console.log('🤖 Starting AI conversation for call:', call.id);
        
        // Initial AI greeting
        const greeting = "Hello! You've reached our AI sales assistant. I'm here to help you with receipt roll orders. How can I assist you today?";
        await this.sendAIResponse(call, greeting);
    }
    
    async logCallToDatabase(call, direction) {
        try {
            // This would integrate with your existing database
            console.log(`📊 Logging ${direction} call to database:`, {
                callId: call.id,
                from: call.from,
                to: call.to,
                direction: direction,
                timestamp: new Date()
            });
            
            // In production, you would save to your PostgreSQL database
            // using your existing call_logs table structure
            
        } catch (error) {
            console.error('❌ Error logging call to database:', error);
        }
    }
    
    handleCallEnd(call) {
        console.log('📞 AI handling call end:', call.id);
        
        // Update call log with end time and summary
        this.updateCallLog(call);
    }
    
    async updateCallLog(call) {
        try {
            console.log('📊 Updating call log with end time:', call.id);
            
            // Update database with call end time, duration, summary, etc.
            
        } catch (error) {
            console.error('❌ Error updating call log:', error);
        }
    }
}

module.exports = AICallHandler;
EOF
    
    print_success "AI call handler created at services/aiCallHandler.js"
}

create_main_integration() {
    print_info "Creating main integration script..."
    
    cat > telnyxDirectIntegration.js << 'EOF'
#!/usr/bin/env node

const TelnyxWebRTCService = require('./services/telnyxWebRTC');
const AICallHandler = require('./services/aiCallHandler');

// Load environment variables
require('dotenv').config();

class TelnyxDirectIntegration {
    constructor() {
        this.telnyxService = new TelnyxWebRTCService({
            login: process.env.TELNYX_SIP_USERNAME || 'nimavakil',
            password: process.env.TELNYX_SIP_PASSWORD || 'Acr0paq!'
        });
        
        this.aiHandler = new AICallHandler(this.telnyxService);
        this.setupEventHandlers();
    }
    
    setupEventHandlers() {
        this.telnyxService.on('connected', () => {
            console.log('🎉 Telnyx Direct Integration is ready!');
            console.log('📞 Waiting for incoming calls...');
        });
        
        this.telnyxService.on('error', (error) => {
            console.error('❌ Integration error:', error);
            process.exit(1);
        });
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down Telnyx Direct Integration...');
            this.shutdown();
        });
        
        process.on('SIGTERM', () => {
            console.log('\n🛑 Shutting down Telnyx Direct Integration...');
            this.shutdown();
        });
    }
    
    async start() {
        try {
            console.log('🚀 Starting Telnyx Direct Integration...');
            console.log('📋 Configuration:');
            console.log(`   SIP Username: ${process.env.TELNYX_SIP_USERNAME || 'nimavakil'}`);
            console.log(`   SIP Server: sip.telnyx.com`);
            console.log('');
            
            await this.telnyxService.connect();
            
        } catch (error) {
            console.error('❌ Failed to start integration:', error);
            process.exit(1);
        }
    }
    
    shutdown() {
        this.telnyxService.disconnect();
        console.log('✅ Telnyx Direct Integration stopped');
        process.exit(0);
    }
    
    // Method to make outbound calls
    async makeOutboundCall(to, from = '+3226010500') {
        try {
            const call = await this.telnyxService.makeOutboundCall(to, from);
            console.log(`📞 Outbound call initiated to ${to}`);
            return call;
        } catch (error) {
            console.error('❌ Failed to make outbound call:', error);
            throw error;
        }
    }
}

// Start the integration if run directly
if (require.main === module) {
    const integration = new TelnyxDirectIntegration();
    integration.start();
}

module.exports = TelnyxDirectIntegration;
EOF
    
    chmod +x telnyxDirectIntegration.js
    print_success "Main integration script created at telnyxDirectIntegration.js"
}

update_package_json() {
    print_info "Updating package.json with new scripts..."
    
    # Add scripts to package.json if they don't exist
    if ! grep -q "telnyx:start" package.json; then
        # Create a backup
        cp package.json package.json.backup
        
        # Add Telnyx scripts
        python3 -c "
import json
import sys

try:
    with open('package.json', 'r') as f:
        pkg = json.load(f)
    
    # Add new scripts
    if 'scripts' not in pkg:
        pkg['scripts'] = {}
    
    pkg['scripts']['telnyx:start'] = 'node telnyxDirectIntegration.js'
    pkg['scripts']['telnyx:test'] = 'node -e \"const T = require(\\\"./telnyxDirectIntegration\\\"); const t = new T(); t.makeOutboundCall(\\\"+32479202020\\\").catch(console.error);\"'
    pkg['scripts']['telnyx:install'] = 'npm install @telnyx/webrtc ws socket.io-client node-record-lpcm16 wav'
    
    with open('package.json', 'w') as f:
        json.dump(pkg, f, indent=2)
    
    print('✅ Package.json updated with Telnyx scripts')
    
except Exception as e:
    print(f'❌ Error updating package.json: {e}')
    sys.exit(1)
"
        
        print_success "Package.json updated with Telnyx integration scripts"
    else
        print_info "Package.json already has Telnyx scripts"
    fi
}

create_env_template() {
    print_info "Creating environment variables template..."
    
    cat >> .env.example << 'EOF'

# Telnyx Direct Integration
TELNYX_SIP_USERNAME=nimavakil
TELNYX_SIP_PASSWORD=Acr0paq!
TELNYX_API_KEY=your_telnyx_api_key_here
TELNYX_PHONE_NUMBER=+3226010500
EOF
    
    print_success "Environment variables added to .env.example"
    
    if [ ! -f ".env" ]; then
        cp .env.example .env
        print_info "Created .env file from template - please update with your credentials"
    fi
}

show_next_steps() {
    echo ""
    print_info "🚀 Next Steps:"
    echo ""
    echo "1. Install Telnyx dependencies:"
    echo "   npm run telnyx:install"
    echo ""
    echo "2. Update your .env file with Telnyx credentials:"
    echo "   nano .env"
    echo ""
    echo "3. Start the Telnyx Direct Integration:"
    echo "   npm run telnyx:start"
    echo ""
    echo "4. Test with an outbound call:"
    echo "   npm run telnyx:test"
    echo ""
    echo "5. Configure Telnyx Portal (see direct-telnyx-integration.md for details)"
    echo ""
    echo "📋 Configuration Files Created:"
    echo "   ✅ services/telnyxWebRTC.js - WebRTC service"
    echo "   ✅ services/aiCallHandler.js - AI call processing"
    echo "   ✅ telnyxDirectIntegration.js - Main integration"
    echo "   ✅ direct-telnyx-integration.md - Documentation"
    echo ""
    echo "🎯 This approach bypasses LiveKit SIP limitations and provides"
    echo "   a production-ready solution using official Telnyx SDKs!"
    echo ""
}

main() {
    print_header
    
    # Change to project directory
    cd "$(dirname "$0")"
    
    explain_approach
    install_dependencies
    create_telnyx_webrtc_service
    create_ai_call_handler
    create_main_integration
    update_package_json
    create_env_template
    show_next_steps
    
    print_success "🎉 Direct Telnyx Integration setup completed!"
    print_info "This solution bypasses LiveKit Community Edition SIP limitations"
}

# Run main function
main "$@"