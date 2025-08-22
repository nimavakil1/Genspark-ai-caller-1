#!/bin/bash

# Try Alternative LiveKit Configurations for SIP
# This script tests different configuration approaches

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}================================================================${NC}"
    echo -e "${BLUE}🧪 Testing Alternative LiveKit SIP Configurations${NC}"
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

test_configuration() {
    local config_file=$1
    local description=$2
    
    print_info "Testing configuration: $description"
    print_info "Config file: $config_file"
    
    # Backup current config and use test config
    cp livekit-simple.yaml livekit-simple.yaml.backup
    cp "$config_file" livekit-simple.yaml
    
    # Restart container with new config
    print_info "Restarting LiveKit with new configuration..."
    sudo docker stop ai-sales-livekit >/dev/null 2>&1 || true
    sudo docker rm ai-sales-livekit >/dev/null 2>&1 || true
    
    if sudo docker compose up -d livekit >/dev/null 2>&1; then
        print_success "Container started with new config"
        
        # Wait for initialization
        sleep 10
        
        # Test basic connectivity
        if curl -s -f http://localhost:7880 >/dev/null 2>&1; then
            print_success "LiveKit HTTP responding"
            
            # Test SIP functionality
            export LIVEKIT_URL="http://localhost:7880"
            export LK_API_KEY="devkey"
            export LK_API_SECRET="very_long_secret_key_for_development_use_only_change_in_production_32_chars_minimum"
            
            if lk sip inbound create sip-config/inboundTrunk.json >/dev/null 2>&1; then
                print_success "🎉 SIP TRUNK CREATION WORKS! This configuration is successful!"
                print_info "Successful configuration: $description"
                return 0
            else
                print_warning "SIP trunk creation still fails with this config"
                echo "Error:"
                lk sip inbound create sip-config/inboundTrunk.json 2>&1 | head -2
            fi
        else
            print_error "LiveKit not responding with this config"
        fi
    else
        print_error "Failed to start container with this config"
    fi
    
    # Check logs for this configuration
    print_info "LiveKit logs with this configuration:"
    sudo docker logs ai-sales-livekit --tail 5 2>&1 | grep -E "(ERROR|WARN|sip|SIP)" || print_info "No SIP-related logs"
    
    echo ""
    return 1
}

restore_original_config() {
    print_info "Restoring original configuration..."
    if [ -f "livekit-simple.yaml.backup" ]; then
        mv livekit-simple.yaml.backup livekit-simple.yaml
        print_success "Original configuration restored"
    fi
}

main() {
    print_header
    
    # Change to project directory
    cd "$(dirname "$0")"
    
    # Test 1: Configuration without explicit SIP section (auto-detection)
    print_info "=== TEST 1: Configuration without explicit SIP section ==="
    cat > test-config-1.yaml << 'EOF'
port: 7880

rtc:
  udp_port: 7882
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true

redis:
  address: redis:6379

keys:
  devkey: "very_long_secret_key_for_development_use_only_change_in_production_32_chars_minimum"

logging:
  level: debug
  json: false
EOF
    
    if test_configuration "test-config-1.yaml" "Auto-detection approach (no explicit SIP section)"; then
        print_success "Found working configuration!"
        cleanup_and_exit 0
    fi
    
    # Test 2: Alternative SIP configuration format
    print_info "=== TEST 2: Alternative SIP configuration format ==="
    cat > test-config-2.yaml << 'EOF'
port: 7880

rtc:
  udp_port: 7882
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true

redis:
  address: redis:6379

sip:
  enabled: true
  listen_port: 5060
  external_ip: ""

keys:
  devkey: "very_long_secret_key_for_development_use_only_change_in_production_32_chars_minimum"

logging:
  level: debug
  json: false
EOF
    
    if test_configuration "test-config-2.yaml" "Alternative SIP format (listen_port)"; then
        print_success "Found working configuration!"
        cleanup_and_exit 0
    fi
    
    # Test 3: Minimal configuration
    print_info "=== TEST 3: Minimal configuration ==="
    cat > test-config-3.yaml << 'EOF'
port: 7880

redis:
  address: redis:6379

keys:
  devkey: "very_long_secret_key_for_development_use_only_change_in_production_32_chars_minimum"

logging:
  level: debug
  json: false
EOF
    
    if test_configuration "test-config-3.yaml" "Minimal configuration"; then
        print_success "Found working configuration!"
        cleanup_and_exit 0
    fi
    
    print_error "None of the alternative configurations worked"
    print_info "This suggests a deeper issue with SIP support in this LiveKit version"
    
    cleanup_and_exit 1
}

cleanup_and_exit() {
    local exit_code=$1
    restore_original_config
    
    # Clean up test files
    rm -f test-config-*.yaml
    
    # Restart with original configuration
    sudo docker stop ai-sales-livekit >/dev/null 2>&1 || true
    sudo docker rm ai-sales-livekit >/dev/null 2>&1 || true
    sudo docker compose up -d livekit >/dev/null 2>&1 || true
    
    exit $exit_code
}

# Run main function
main "$@"