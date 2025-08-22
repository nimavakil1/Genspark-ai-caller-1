#!/bin/bash

# Telnyx + LiveKit SIP Integration Setup Script
# Based on official Telnyx documentation: 
# https://developers.telnyx.com/docs/voice/sip-trunking/livekit-configuration-guide

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
LIVEKIT_URL="http://localhost:7880"
LIVEKIT_WS_URL="ws://localhost:7880"
TELNYX_PHONE_NUMBER="+3226010500"
TEST_TARGET_PHONE="+32479202020"

print_header() {
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}🔗 Telnyx + LiveKit SIP Integration Setup${NC}"
    echo -e "${BLUE}============================================================${NC}"
}

print_step() {
    echo -e "${BLUE}[STEP $1]${NC} $2"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

check_prerequisites() {
    print_step "1" "Checking Prerequisites"
    
    # Check if LiveKit is running
    if curl -s -f "$LIVEKIT_URL" > /dev/null; then
        print_success "LiveKit server is running on $LIVEKIT_URL"
    else
        print_error "LiveKit server is not accessible at $LIVEKIT_URL"
        print_info "Please ensure LiveKit is running with: docker-compose up -d"
        return 1
    fi
    
    # Check if LiveKit CLI is available
    if command -v lk &> /dev/null; then
        print_success "LiveKit CLI (lk) is available"
        lk version
    else
        print_error "LiveKit CLI (lk) is not installed"
        print_info "Install it with: https://docs.livekit.io/cli/"
        return 1
    fi
    
    # Check environment variables
    if [ -z "$LIVEKIT_API_KEY" ] || [ -z "$LIVEKIT_API_SECRET" ]; then
        print_warning "LiveKit API credentials not set in environment"
        print_info "Make sure to set LIVEKIT_API_KEY and LIVEKIT_API_SECRET"
        print_info "You can generate them in LiveKit Cloud or your self-hosted instance"
    else
        print_success "LiveKit API credentials are configured"
    fi
}

setup_livekit_environment() {
    print_step "2" "Setting up LiveKit CLI Environment"
    
    # Set environment variables for LiveKit CLI
    export LIVEKIT_URL="$LIVEKIT_URL"
    
    if [ -n "$LIVEKIT_API_KEY" ] && [ -n "$LIVEKIT_API_SECRET" ]; then
        export LK_API_KEY="$LIVEKIT_API_KEY"
        export LK_API_SECRET="$LIVEKIT_API_SECRET"
        print_success "LiveKit CLI environment configured"
    else
        print_warning "API credentials not available - some commands may fail"
    fi
}

create_inbound_trunk() {
    print_step "3" "Creating LiveKit Inbound SIP Trunk"
    
    print_info "Configuration file: sip-config/inboundTrunk.json"
    cat sip-config/inboundTrunk.json
    
    if [ -n "$LIVEKIT_API_KEY" ]; then
        print_info "Creating inbound trunk..."
        if lk sip inbound create sip-config/inboundTrunk.json > trunk_response.txt 2>&1; then
            print_success "Inbound trunk created successfully"
            INBOUND_TRUNK_ID=$(grep -o '"trunk_id":"[^"]*"' trunk_response.txt | cut -d'"' -f4)
            echo "Inbound Trunk ID: $INBOUND_TRUNK_ID"
            echo "$INBOUND_TRUNK_ID" > inbound_trunk_id.txt
        else
            print_error "Failed to create inbound trunk"
            cat trunk_response.txt
        fi
    else
        print_warning "Skipping trunk creation - API credentials required"
        print_info "Run this command manually with proper credentials:"
        print_info "lk sip inbound create sip-config/inboundTrunk.json"
    fi
}

create_dispatch_rule() {
    print_step "4" "Creating LiveKit Dispatch Rule"
    
    if [ -f "inbound_trunk_id.txt" ]; then
        TRUNK_ID=$(cat inbound_trunk_id.txt)
        # Update dispatch rule with actual trunk ID
        sed "s/<REPLACE_WITH_TRUNK_ID>/$TRUNK_ID/" sip-config/dispatchRule.json > sip-config/dispatchRule_updated.json
        
        print_info "Configuration file: sip-config/dispatchRule_updated.json"
        cat sip-config/dispatchRule_updated.json
        
        if [ -n "$LIVEKIT_API_KEY" ]; then
            print_info "Creating dispatch rule..."
            if lk sip dispatch create sip-config/dispatchRule_updated.json; then
                print_success "Dispatch rule created successfully"
            else
                print_error "Failed to create dispatch rule"
            fi
        else
            print_warning "Skipping dispatch rule creation - API credentials required"
        fi
    else
        print_warning "Inbound trunk ID not found - skipping dispatch rule"
    fi
}

create_outbound_trunk() {
    print_step "5" "Creating LiveKit Outbound SIP Trunk"
    
    print_info "Configuration file: sip-config/outboundTrunk.json"
    cat sip-config/outboundTrunk.json
    
    if [ -n "$LIVEKIT_API_KEY" ]; then
        print_info "Creating outbound trunk..."
        if lk sip outbound create sip-config/outboundTrunk.json > outbound_response.txt 2>&1; then
            print_success "Outbound trunk created successfully"
            OUTBOUND_TRUNK_ID=$(grep -o '"trunk_id":"[^"]*"' outbound_response.txt | cut -d'"' -f4)
            echo "Outbound Trunk ID: $OUTBOUND_TRUNK_ID"
            echo "$OUTBOUND_TRUNK_ID" > outbound_trunk_id.txt
        else
            print_error "Failed to create outbound trunk"
            cat outbound_response.txt
        fi
    else
        print_warning "Skipping outbound trunk creation - API credentials required"
        print_info "Run this command manually with proper credentials:"
        print_info "lk sip outbound create sip-config/outboundTrunk.json"
    fi
}

prepare_test_call() {
    print_step "6" "Preparing Test Call Configuration"
    
    if [ -f "outbound_trunk_id.txt" ]; then
        TRUNK_ID=$(cat outbound_trunk_id.txt)
        # Update test call config with actual trunk ID
        sed "s/<REPLACE_WITH_OUTBOUND_TRUNK_ID>/$TRUNK_ID/" sip-config/sipParticipant.json > sip-config/sipParticipant_updated.json
        
        print_info "Test call configuration: sip-config/sipParticipant_updated.json"
        cat sip-config/sipParticipant_updated.json
        
        print_success "Test call configuration prepared"
    else
        print_warning "Outbound trunk ID not found - test call config incomplete"
    fi
}

print_manual_setup_instructions() {
    print_step "7" "Manual Telnyx Portal Setup Instructions"
    
    echo ""
    print_info "⚠️  IMPORTANT: Complete these steps in Telnyx Mission Control Portal:"
    echo ""
    
    echo "1. 🔗 CREATE SIP CONNECTION:"
    echo "   - Go to: Real-Time Communications → Voice → SIP Trunking"
    echo "   - Click 'Add SIP Connection'"
    echo "   - Name: 'LiveKit AI Sales System'"
    echo "   - Connection Type: FQDN"
    echo "   - SIP URI: <YOUR_LIVEKIT_SIP_URI>"
    echo "   - Authentication: Credentials"
    echo "   - Username: nimavakil"
    echo "   - Password: Acr0paq!"
    echo ""
    
    echo "2. 📞 CREATE PROGRAMMABLE VOICE APP:"
    echo "   - Go to: Real-Time Communications → Voice → Programmable Voice"
    echo "   - Create new application: 'AI Sales Voice App'"
    echo "   - Webhook URL: http://your-server.com:3001/api/webhooks/telnyx"
    echo "   - Subdomain: ai-sales-system"
    echo ""
    
    echo "3. 📋 CONFIGURE OUTBOUND VOICE PROFILE:"
    echo "   - Go to: Real-Time Communications → Voice → Outbound Voice Profile"
    echo "   - Name: 'AI Sales Outbound Profile'"
    echo "   - Allowed destinations: Include your target countries"
    echo ""
    
    echo "4. 📱 ASSIGN PHONE NUMBERS:"
    echo "   - Go to: Real-Time Communications → Voice → My Numbers"
    echo "   - Assign $TELNYX_PHONE_NUMBER to your LiveKit SIP Connection"
    echo ""
}

print_test_instructions() {
    print_step "8" "Testing Instructions"
    
    echo ""
    print_info "🧪 To test the integration:"
    echo ""
    
    if [ -f "sip-config/sipParticipant_updated.json" ]; then
        echo "1. Make a test outbound call:"
        echo "   lk sip participant create sip-config/sipParticipant_updated.json"
        echo ""
    fi
    
    echo "2. Check call status and logs:"
    echo "   - Telnyx: Reporting → Debugging → SIP Call Flow Tool"
    echo "   - LiveKit: Check server logs for SIP activity"
    echo ""
    
    echo "3. Use the debugging tools:"
    echo "   - Monitor call flows in Telnyx debugging interface"
    echo "   - Check authentication and routing issues"
    echo ""
}

main() {
    print_header
    
    # Change to project directory
    cd "$(dirname "$0")"
    
    # Run setup steps
    if check_prerequisites; then
        setup_livekit_environment
        create_inbound_trunk
        create_dispatch_rule
        create_outbound_trunk
        prepare_test_call
        print_manual_setup_instructions
        print_test_instructions
        
        print_success "Setup script completed!"
        print_info "Next: Complete the manual Telnyx portal configuration above"
    else
        print_error "Prerequisites not met - please fix the issues above"
        exit 1
    fi
}

# Run main function
main "$@"