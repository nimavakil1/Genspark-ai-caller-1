#!/bin/bash

# LiveKit Container Restart Script with SIP Configuration
# Run this after updating SIP configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}================================================================${NC}"
    echo -e "${BLUE}🔄 LiveKit Container Restart with SIP Configuration${NC}"
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

show_configuration_changes() {
    print_info "Configuration changes made:"
    echo ""
    echo "📝 LiveKit Configuration (livekit-simple.yaml):"
    echo "   ✅ Added SIP configuration section"
    echo "   ✅ Enabled SIP functionality"
    echo "   ✅ SIP port: 5060"
    echo "   ✅ Redis integration maintained"
    echo ""
    echo "🐳 Docker Compose (docker-compose.yml):"
    echo "   ✅ Added SIP port mappings (5060:5060/udp and 5060:5060/tcp)"
    echo "   ✅ Maintained existing ports (7880, 7881)"
    echo ""
}

restart_containers() {
    print_info "Stopping and removing existing containers..."
    
    # Stop and remove containers
    if docker container inspect ai-sales-livekit >/dev/null 2>&1; then
        sudo docker stop ai-sales-livekit || true
        sudo docker rm ai-sales-livekit || true
    fi
    
    if docker container inspect ai-sales-redis >/dev/null 2>&1; then
        sudo docker stop ai-sales-redis || true
        sudo docker rm ai-sales-redis || true
    fi
    
    print_success "Existing containers removed"
    
    # Start containers with new configuration
    print_info "Starting containers with SIP configuration..."
    if sudo docker compose up -d redis livekit; then
        print_success "Containers started successfully"
    else
        print_error "Failed to start containers"
        return 1
    fi
    
    # Wait for initialization
    print_info "Waiting 15 seconds for containers to initialize with SIP..."
    sleep 15
}

check_sip_functionality() {
    print_info "Checking SIP functionality..."
    
    # Check if SIP port is listening
    if ss -tuln | grep -q ":5060"; then
        print_success "SIP port 5060 is listening"
    else
        print_warning "SIP port 5060 may not be listening yet"
    fi
    
    # Check LiveKit logs for SIP initialization
    print_info "Checking LiveKit logs for SIP initialization..."
    if sudo docker logs ai-sales-livekit --tail 20 | grep -i sip >/dev/null 2>&1; then
        print_success "SIP-related logs found in LiveKit container"
        echo "SIP logs:"
        sudo docker logs ai-sales-livekit --tail 20 | grep -i sip || true
    else
        print_warning "No SIP-related logs found yet (may still be initializing)"
    fi
}

test_livekit_connectivity() {
    print_info "Testing LiveKit connectivity..."
    
    # Test main LiveKit port
    if curl -s -f http://localhost:7880 >/dev/null 2>&1; then
        print_success "LiveKit HTTP is responding on port 7880"
    else
        print_error "LiveKit HTTP not responding on port 7880"
        return 1
    fi
    
    # Test validation endpoint
    if curl -s http://localhost:7880/validate >/dev/null 2>&1; then
        print_success "LiveKit /validate endpoint accessible"
    else
        print_warning "LiveKit /validate endpoint not accessible"
    fi
    
    print_info "Container status:"
    sudo docker compose ps
}

test_sip_trunk_creation() {
    print_info "Testing SIP trunk creation (this was failing before)..."
    
    # Set environment variables for LiveKit CLI
    export LIVEKIT_URL="http://localhost:7880"
    export LK_API_KEY="devkey"
    export LK_API_SECRET="secret"
    
    print_info "Attempting to create a test inbound SIP trunk..."
    
    # Try to create inbound trunk again
    if lk sip inbound create sip-config/inboundTrunk.json >/dev/null 2>&1; then
        print_success "SIP trunk creation now works! SIP service is properly configured."
        return 0
    else
        print_warning "SIP trunk creation still failing - checking error..."
        echo "Error output:"
        lk sip inbound create sip-config/inboundTrunk.json 2>&1 | head -5
        return 1
    fi
}

show_next_steps() {
    echo ""
    print_info "🚀 Next Steps:"
    echo ""
    echo "1. If SIP trunk creation now works, run the full setup:"
    echo "   ./setup-telnyx-livekit.sh"
    echo ""
    echo "2. If still having issues, check the logs:"
    echo "   sudo docker logs ai-sales-livekit -f"
    echo ""
    echo "3. Verify all ports are accessible:"
    echo "   ss -tuln | grep -E ':(7880|7881|5060)'"
    echo ""
    echo "4. Test SIP functionality manually:"
    echo "   export LIVEKIT_URL=http://localhost:7880"
    echo "   export LK_API_KEY=devkey"
    echo "   export LK_API_SECRET=secret"
    echo "   lk sip inbound create sip-config/inboundTrunk.json"
    echo ""
}

main() {
    print_header
    
    # Change to project directory
    cd "$(dirname "$0")"
    
    show_configuration_changes
    
    if restart_containers; then
        if check_sip_functionality; then
            if test_livekit_connectivity; then
                if test_sip_trunk_creation; then
                    print_success "🎉 SIP configuration successful! LiveKit is ready for Telnyx integration."
                else
                    print_warning "SIP configuration updated but trunk creation still needs troubleshooting"
                fi
                show_next_steps
            else
                print_error "LiveKit connectivity test failed"
                exit 1
            fi
        else
            print_warning "SIP functionality check had issues but continuing..."
        fi
    else
        print_error "Container restart failed"
        exit 1
    fi
}

# Run main function
main "$@"