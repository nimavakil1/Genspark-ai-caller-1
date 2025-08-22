#!/bin/bash

# SIP Service Diagnostic Script
# Comprehensive diagnosis of LiveKit SIP service issues

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}================================================================${NC}"
    echo -e "${BLUE}🔍 LiveKit SIP Service Comprehensive Diagnosis${NC}"
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

check_livekit_full_logs() {
    print_info "Checking complete LiveKit container logs..."
    echo ""
    echo "=== COMPLETE LIVEKIT LOGS ==="
    sudo docker logs ai-sales-livekit 2>&1 | tail -50
    echo "=== END LIVEKIT LOGS ==="
    echo ""
}

check_sip_specific_config() {
    print_info "Analyzing SIP configuration in detail..."
    
    echo "Current LiveKit configuration:"
    cat livekit-simple.yaml
    echo ""
    
    # Check if SIP configuration is properly formatted
    python3 -c "
import yaml
import sys

try:
    with open('livekit-simple.yaml', 'r') as f:
        config = yaml.safe_load(f)
    
    print('Configuration Analysis:')
    print(f'  - Port: {config.get(\"port\", \"NOT SET\")}')
    print(f'  - Redis: {config.get(\"redis\", \"NOT SET\")}')
    print(f'  - SIP config: {config.get(\"sip\", \"NOT SET\")}')
    print(f'  - Keys: {config.get(\"keys\", \"NOT SET\")}')
    
    if 'sip' in config:
        sip_config = config['sip']
        print(f'  - SIP enabled: {sip_config.get(\"enabled\", \"NOT SET\")}')
        print(f'  - SIP port: {sip_config.get(\"port\", \"NOT SET\")}')
    else:
        print('  - SIP configuration missing!')
        
except Exception as e:
    print(f'Error parsing config: {e}')
"
}

check_livekit_api_status() {
    print_info "Testing LiveKit API endpoints..."
    
    # Test various endpoints to understand what's working
    endpoints=("/" "/validate" "/rtc" "/api")
    
    for endpoint in "${endpoints[@]}"; do
        if curl -s -f "http://localhost:7880${endpoint}" >/dev/null 2>&1; then
            print_success "Endpoint ${endpoint} is accessible"
        else
            print_warning "Endpoint ${endpoint} is not accessible"
        fi
    done
}

check_redis_connectivity() {
    print_info "Testing Redis connectivity from LiveKit container..."
    
    # Test if LiveKit can connect to Redis
    if sudo docker exec ai-sales-livekit sh -c "nc -z redis 6379" 2>/dev/null; then
        print_success "LiveKit container can reach Redis"
    else
        print_error "LiveKit container cannot reach Redis"
    fi
    
    # Check Redis logs
    print_info "Redis container logs:"
    sudo docker logs ai-sales-redis --tail 10 2>/dev/null || true
}

check_livekit_version_and_sip_support() {
    print_info "Checking LiveKit version and SIP support..."
    
    # Check LiveKit version
    echo "LiveKit container info:"
    sudo docker inspect ai-sales-livekit | grep -E '"Image":|"Created":' || true
    
    # Check if SIP is mentioned in help or version info
    if sudo docker exec ai-sales-livekit /livekit-server --help 2>&1 | grep -i sip >/dev/null; then
        print_success "SIP support appears to be available in this LiveKit version"
    else
        print_warning "SIP support may not be available in this LiveKit version"
    fi
}

test_manual_sip_commands() {
    print_info "Testing LiveKit CLI commands manually..."
    
    # Set environment
    export LIVEKIT_URL="http://localhost:7880"
    export LK_API_KEY="devkey"
    export LK_API_SECRET="secret"
    
    echo "Environment variables:"
    echo "  LIVEKIT_URL: $LIVEKIT_URL"
    echo "  LK_API_KEY: $LK_API_KEY"
    echo "  LK_API_SECRET: $LK_API_SECRET"
    echo ""
    
    # Test basic LiveKit CLI connectivity
    print_info "Testing 'lk room list' (basic connectivity)..."
    if lk room list >/dev/null 2>&1; then
        print_success "Basic LiveKit CLI connectivity works"
    else
        print_error "Basic LiveKit CLI connectivity failed"
        echo "Error:"
        lk room list 2>&1 | head -3
    fi
    
    # Test SIP-specific commands
    print_info "Testing 'lk sip' command availability..."
    if lk sip --help >/dev/null 2>&1; then
        print_success "LiveKit CLI has SIP commands available"
        echo "Available SIP commands:"
        lk sip --help 2>&1 | grep -E "COMMANDS|inbound|outbound" | head -10
    else
        print_error "LiveKit CLI does not have SIP commands available"
        echo "Error:"
        lk sip --help 2>&1 | head -3
    fi
}

check_port_bindings() {
    print_info "Checking port bindings and network connectivity..."
    
    echo "Port listening status:"
    ss -tuln | grep -E ':(7880|7881|5060|6379)' || print_warning "Some expected ports not found"
    
    echo ""
    echo "Docker port mappings:"
    sudo docker port ai-sales-livekit || print_error "Could not get LiveKit port mappings"
    
    echo ""
    echo "Container network info:"
    sudo docker inspect ai-sales-livekit | grep -A 10 '"NetworkSettings"' | head -15
}

suggest_solutions() {
    print_info "🛠️  Potential Solutions Based on Diagnosis:"
    echo ""
    
    echo "1. 🔄 Try using LiveKit Cloud or Enterprise version:"
    echo "   - SIP functionality may require LiveKit Cloud or Enterprise"
    echo "   - Community version might have limited SIP support"
    echo ""
    
    echo "2. 🔧 Alternative SIP configuration approach:"
    echo "   - Try removing the SIP section from config entirely"
    echo "   - Some LiveKit versions auto-enable SIP when Redis is present"
    echo ""
    
    echo "3. 🐳 Try different LiveKit image:"
    echo "   - livekit/livekit-server:v1.8.0 (older stable version)"
    echo "   - livekit/livekit-server:v1.9.0 (current version)"
    echo ""
    
    echo "4. 📋 Check LiveKit documentation:"
    echo "   - Verify SIP requirements: https://docs.livekit.io/realtime/server/sip/"
    echo "   - Check if additional configuration is needed"
    echo ""
    
    echo "5. 🔑 Try different API credentials:"
    echo "   - Generate proper API key/secret instead of 'devkey/secret'"
    echo "   - Use longer secret (current warning: secret too short)"
    echo ""
}

main() {
    print_header
    
    # Change to project directory
    cd "$(dirname "$0")"
    
    check_livekit_full_logs
    check_sip_specific_config
    check_livekit_api_status
    check_redis_connectivity
    check_livekit_version_and_sip_support
    test_manual_sip_commands
    check_port_bindings
    suggest_solutions
    
    print_info "Diagnosis complete. Review the output above to identify the root cause."
}

# Run main function
main "$@"