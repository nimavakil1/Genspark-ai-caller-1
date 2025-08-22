#!/bin/bash

# Quick Validation Script for Telnyx + LiveKit Setup
# Run this after pulling the latest changes to verify everything is ready

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}🔍 Telnyx + LiveKit Setup Validation${NC}"
    echo -e "${BLUE}============================================================${NC}"
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

validate_docker_compose() {
    print_info "Validating Docker Compose configuration..."
    
    if [ -f "docker-compose.yml" ]; then
        print_success "docker-compose.yml exists"
        
        # Check YAML syntax
        if python3 -c "
import yaml
import sys
try:
    with open('docker-compose.yml', 'r') as f:
        config = yaml.safe_load(f)
    print('YAML syntax is valid')
    
    # Check for the fixed environment variable
    env_vars = config['services']['livekit']['environment']
    for env_var in env_vars:
        if 'LIVEKIT_KEYS=devkey: secret' in env_var:
            print('Environment variable formatting is correct')
            break
    else:
        print('WARNING: LIVEKIT_KEYS format may be incorrect')
        
except Exception as e:
    print(f'ERROR: {e}')
    sys.exit(1)
" 2>/dev/null; then
            print_success "Docker Compose YAML syntax is valid"
        else
            print_error "Docker Compose YAML syntax validation failed"
            return 1
        fi
    else
        print_error "docker-compose.yml not found"
        return 1
    fi
}

validate_livekit_config() {
    print_info "Validating LiveKit configuration..."
    
    if [ -f "livekit-simple.yaml" ]; then
        print_success "livekit-simple.yaml exists"
        
        # Check for Redis configuration
        if grep -q "redis:" livekit-simple.yaml; then
            print_success "Redis integration configured"
        else
            print_warning "Redis configuration not found in LiveKit config"
        fi
    else
        print_error "livekit-simple.yaml not found"
        return 1
    fi
}

validate_sip_configs() {
    print_info "Validating SIP configuration files..."
    
    local configs=("inboundTrunk.json" "outboundTrunk.json" "dispatchRule.json" "sipParticipant.json")
    
    if [ -d "sip-config" ]; then
        print_success "sip-config directory exists"
        
        for config in "${configs[@]}"; do
            if [ -f "sip-config/$config" ]; then
                print_success "$config found"
                
                # Validate JSON syntax
                if python3 -c "
import json
import sys
try:
    with open('sip-config/$config', 'r') as f:
        json.load(f)
    print('JSON syntax valid')
except Exception as e:
    print(f'JSON syntax error in $config: {e}')
    sys.exit(1)
" 2>/dev/null; then
                    print_success "$config JSON syntax is valid"
                else
                    print_error "$config has invalid JSON syntax"
                fi
            else
                print_error "$config not found"
            fi
        done
    else
        print_error "sip-config directory not found"
        return 1
    fi
}

validate_setup_script() {
    print_info "Validating setup script..."
    
    if [ -f "setup-telnyx-livekit.sh" ]; then
        print_success "setup-telnyx-livekit.sh exists"
        
        if [ -x "setup-telnyx-livekit.sh" ]; then
            print_success "Setup script is executable"
        else
            print_warning "Setup script is not executable - run: chmod +x setup-telnyx-livekit.sh"
        fi
    else
        print_error "setup-telnyx-livekit.sh not found"
        return 1
    fi
}

validate_telnyx_routes() {
    print_info "Validating Telnyx API routes..."
    
    if [ -f "routes/telnyx.js" ]; then
        print_success "routes/telnyx.js exists"
        
        # Check for key endpoints
        if grep -q "/outbound-call" routes/telnyx.js; then
            print_success "Outbound call endpoint found"
        else
            print_warning "Outbound call endpoint not found"
        fi
        
        if grep -q "/webhooks/call-events" routes/telnyx.js; then
            print_success "Webhook endpoint found"
        else
            print_warning "Webhook endpoint not found"
        fi
    else
        print_error "routes/telnyx.js not found"
        return 1
    fi
}

check_docker_availability() {
    print_info "Checking Docker availability..."
    
    if command -v docker &> /dev/null; then
        print_success "Docker is installed"
        
        if docker compose version &> /dev/null; then
            print_success "Docker Compose is available"
        else
            print_warning "Docker Compose command may not be available"
        fi
    else
        print_error "Docker is not installed or not in PATH"
        return 1
    fi
}

print_next_steps() {
    echo ""
    print_info "🚀 Next Steps:"
    echo ""
    echo "1. Start Docker services:"
    echo "   sudo docker compose up -d redis livekit"
    echo ""
    echo "2. Verify services are running:"
    echo "   sudo docker compose ps"
    echo ""
    echo "3. Run the setup script:"
    echo "   ./setup-telnyx-livekit.sh"
    echo ""
    echo "4. Complete Telnyx Portal configuration (script will provide instructions)"
    echo ""
    echo "5. Test the integration"
    echo ""
}

main() {
    print_header
    
    # Change to script directory
    cd "$(dirname "$0")"
    
    local validation_failed=false
    
    # Run all validations
    validate_docker_compose || validation_failed=true
    validate_livekit_config || validation_failed=true
    validate_sip_configs || validation_failed=true
    validate_setup_script || validation_failed=true
    validate_telnyx_routes || validation_failed=true
    check_docker_availability || validation_failed=true
    
    echo ""
    if [ "$validation_failed" = true ]; then
        print_error "Some validations failed. Please fix the issues above before proceeding."
        exit 1
    else
        print_success "All validations passed! Setup is ready for deployment."
        print_next_steps
        exit 0
    fi
}

# Run main function
main "$@"