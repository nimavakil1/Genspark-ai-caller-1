#!/bin/bash

# Debug script for LiveKit container connectivity issues

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}🔍 LiveKit Container Debug Information${NC}"
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

check_docker_containers() {
    print_info "Checking Docker container status..."
    echo ""
    
    print_info "All containers:"
    sudo docker ps -a
    echo ""
    
    print_info "LiveKit container specific info:"
    if sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -i livekit; then
        print_success "LiveKit container found and status shown above"
    else
        print_error "LiveKit container not found in running containers"
    fi
    echo ""
}

check_livekit_logs() {
    print_info "Checking LiveKit container logs..."
    echo ""
    
    if sudo docker logs ai-sales-livekit --tail 20 2>/dev/null; then
        print_success "LiveKit logs retrieved (last 20 lines shown above)"
    else
        print_error "Could not retrieve LiveKit logs"
    fi
    echo ""
}

check_port_accessibility() {
    print_info "Checking port accessibility..."
    echo ""
    
    # Check if port 7880 is listening
    print_info "Checking if port 7880 is listening..."
    if netstat -tlnp | grep :7880; then
        print_success "Port 7880 is listening"
    else
        print_warning "Port 7880 is not listening"
    fi
    echo ""
    
    # Try to connect to LiveKit
    print_info "Testing HTTP connection to LiveKit..."
    if curl -s --connect-timeout 5 http://localhost:7880 >/dev/null 2>&1; then
        print_success "HTTP connection to localhost:7880 successful"
    else
        print_warning "HTTP connection to localhost:7880 failed"
        
        # Try with container IP
        print_info "Trying to get container IP..."
        CONTAINER_IP=$(sudo docker inspect ai-sales-livekit --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null || echo "")
        
        if [ -n "$CONTAINER_IP" ]; then
            print_info "Container IP: $CONTAINER_IP"
            print_info "Testing HTTP connection to container IP..."
            if curl -s --connect-timeout 5 "http://$CONTAINER_IP:7880" >/dev/null 2>&1; then
                print_success "HTTP connection to container IP successful"
                print_warning "LiveKit is accessible via container IP but not localhost"
            else
                print_error "HTTP connection to container IP also failed"
            fi
        else
            print_error "Could not get container IP"
        fi
    fi
    echo ""
}

check_livekit_config() {
    print_info "Checking LiveKit configuration..."
    echo ""
    
    print_info "LiveKit config file contents:"
    cat livekit-simple.yaml
    echo ""
    
    print_info "Docker Compose LiveKit service config:"
    grep -A 15 "livekit:" docker-compose.yml
    echo ""
}

test_livekit_endpoints() {
    print_info "Testing LiveKit endpoints..."
    echo ""
    
    # Test various LiveKit endpoints
    local endpoints=("/" "/health" "/rtc" "/api")
    
    for endpoint in "${endpoints[@]}"; do
        print_info "Testing endpoint: $endpoint"
        if curl -s --connect-timeout 5 -w "HTTP Status: %{http_code}\n" "http://localhost:7880$endpoint" 2>/dev/null; then
            print_success "Endpoint $endpoint responded"
        else
            print_warning "Endpoint $endpoint did not respond"
        fi
    done
    echo ""
}

suggest_fixes() {
    print_info "🛠️  Suggested troubleshooting steps:"
    echo ""
    echo "1. Check if LiveKit container is healthy:"
    echo "   sudo docker logs ai-sales-livekit"
    echo ""
    echo "2. Restart LiveKit container:"
    echo "   sudo docker compose restart livekit"
    echo ""
    echo "3. Check if port binding is correct:"
    echo "   sudo docker port ai-sales-livekit"
    echo ""
    echo "4. Check firewall rules (if any):"
    echo "   sudo ufw status"
    echo ""
    echo "5. Try accessing LiveKit with curl with verbose output:"
    echo "   curl -v http://localhost:7880"
    echo ""
    echo "6. If port binding issues, try rebuilding:"
    echo "   sudo docker compose down"
    echo "   sudo docker compose up -d redis livekit"
    echo ""
}

main() {
    print_header
    
    # Change to script directory
    cd "$(dirname "$0")"
    
    # Run all checks
    check_docker_containers
    check_livekit_logs
    check_port_accessibility
    check_livekit_config
    test_livekit_endpoints
    suggest_fixes
    
    print_success "Debug information collected. Review the output above to identify issues."
}

# Run main function
main "$@"