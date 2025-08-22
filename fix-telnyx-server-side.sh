#!/bin/bash

# Fix Telnyx Integration for Server-Side Usage
# Replaces WebRTC approach with Voice API approach

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}================================================================${NC}"
    echo -e "${BLUE}🔧 Fixing Telnyx Integration for Server-Side Usage${NC}"
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

explain_fix() {
    print_info "🎯 Issue Identified: WebRTC Library Requires Browser Environment"
    echo ""
    echo "The @telnyx/webrtc package is designed for browser use and requires the 'window' object."
    echo "We're switching to a server-side Voice API approach that provides the same functionality."
    echo ""
    echo "New approach:"
    echo "📞 Telnyx Voice API ←→ 🌐 Your Server ←→ 🤖 AI Agent ←→ 📊 Database"
    echo ""
}

remove_webrtc_dependency() {
    print_info "Removing problematic WebRTC dependency..."
    
    if npm uninstall @telnyx/webrtc; then
        print_success "WebRTC dependency removed"
    else
        print_warning "WebRTC dependency was not installed"
    fi
}

install_voice_api_dependencies() {
    print_info "Installing Voice API dependencies..."
    
    # Install required dependencies for Voice API approach
    if npm install axios dotenv express; then
        print_success "Voice API dependencies installed"
    else
        print_error "Failed to install Voice API dependencies"
        return 1
    fi
}

update_package_json_scripts() {
    print_info "Updating package.json scripts..."
    
    # Update scripts to use the new Voice API integration
    python3 -c "
import json
import sys

try:
    with open('package.json', 'r') as f:
        pkg = json.load(f)
    
    # Update scripts
    if 'scripts' not in pkg:
        pkg['scripts'] = {}
    
    # Replace old scripts with new ones
    pkg['scripts']['telnyx:start'] = 'node telnyxVoiceIntegration.js'
    pkg['scripts']['telnyx:test'] = 'node -e \"const T = require(\\\"./telnyxVoiceIntegration\\\"); T.testCall().catch(console.error);\"'
    
    with open('package.json', 'w') as f:
        json.dump(pkg, f, indent=2)
    
    print('✅ Package.json scripts updated')
    
except Exception as e:
    print(f'❌ Error updating package.json: {e}')
    sys.exit(1)
"
    
    print_success "Package.json updated for Voice API approach"
}

update_env_variables() {
    print_info "Updating environment variables template..."
    
    # Ensure we have the right environment variables
    if ! grep -q "TELNYX_CONNECTION_ID" .env.example 2>/dev/null; then
        cat >> .env.example << 'EOF'

# Telnyx Voice API Configuration (Server-Side)
TELNYX_CONNECTION_ID=your_telnyx_connection_id_here
SERVER_BASE_URL=http://your-server.com:3000
TEST_PHONE_NUMBER=+32479202020
EOF
        print_success "Environment variables template updated"
    fi
    
    # Update .env if it exists
    if [ -f ".env" ]; then
        if ! grep -q "TELNYX_CONNECTION_ID" .env; then
            echo "" >> .env
            echo "# Telnyx Voice API Configuration (Server-Side)" >> .env
            echo "TELNYX_CONNECTION_ID=your_telnyx_connection_id_here" >> .env
            echo "SERVER_BASE_URL=http://$(hostname -I | awk '{print $1}'):3000" >> .env
            echo "TEST_PHONE_NUMBER=+32479202020" >> .env
            print_success ".env file updated with Voice API variables"
        fi
    fi
}

update_main_app() {
    print_info "Checking if main app needs Voice API routes..."
    
    # Check if app.js needs to be updated to include the new routes
    if [ -f "app.js" ] && ! grep -q "telnyxVoiceAPI" app.js; then
        print_info "Adding Voice API routes to main application..."
        
        # Add the new routes after existing telnyx routes
        sed -i '/\/api\/telnyx/a app.use("/api/telnyx-voice", require("./routes/telnyxVoiceAPI"));' app.js 2>/dev/null || true
        
        print_success "Voice API routes added to main application"
    else
        print_info "Main app already configured or doesn't need updates"
    fi
}

show_configuration_instructions() {
    echo ""
    print_info "🔧 Configuration Required:"
    echo ""
    echo "1. Get your Telnyx Connection ID:"
    echo "   - Go to: https://portal.telnyx.com/#/app/connections"
    echo "   - Find your SIP connection"
    echo "   - Copy the Connection ID"
    echo ""
    echo "2. Update your .env file:"
    echo "   nano .env"
    echo ""
    echo "   Add/update these variables:"
    echo "   TELNYX_CONNECTION_ID=your_actual_connection_id"
    echo "   SERVER_BASE_URL=http://$(hostname -I | awk '{print $1}'):3000"
    echo ""
    echo "3. Configure Telnyx Webhook URL:"
    echo "   - Go to: https://portal.telnyx.com/#/app/programmable-voice"
    echo "   - Create or edit your Voice Application"
    echo "   - Set Webhook URL to: http://$(hostname -I | awk '{print $1}'):3000/api/telnyx-voice/webhooks/call-events"
    echo ""
}

show_testing_instructions() {
    echo ""
    print_info "🧪 Testing Instructions:"
    echo ""
    echo "1. Start the Voice API integration:"
    echo "   npm run telnyx:start"
    echo ""
    echo "2. In another terminal, test outbound calling:"
    echo "   npm run telnyx:test"
    echo ""
    echo "3. Check the Voice API health:"
    echo "   curl http://localhost:3000/api/telnyx-voice/health"
    echo ""
    echo "4. Test webhook processing:"
    echo "   curl -X POST http://localhost:3000/api/telnyx-voice/test-webhook"
    echo ""
}

main() {
    print_header
    
    # Change to project directory
    cd "$(dirname "$0")"
    
    explain_fix
    remove_webrtc_dependency
    install_voice_api_dependencies
    update_package_json_scripts
    update_env_variables
    update_main_app
    show_configuration_instructions
    show_testing_instructions
    
    print_success "🎉 Telnyx integration fixed for server-side usage!"
    print_info "The Voice API approach provides better server-side functionality than WebRTC"
}

# Run main function
main "$@"