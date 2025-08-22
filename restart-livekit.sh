#!/bin/bash

# LiveKit Container Restart Script
# Run this after pulling the latest configuration fix

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}🔄 LiveKit Container Restart with Configuration Fix${NC}"
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

restart_livekit() {
    print_info "Stopping and removing existing LiveKit container..."
    
    # Stop and remove the problematic container
    if docker container inspect ai-sales-livekit >/dev/null 2>&1; then
        print_info "Stopping ai-sales-livekit container..."
        sudo docker stop ai-sales-livekit || true
        
        print_info "Removing ai-sales-livekit container..."
        sudo docker rm ai-sales-livekit || true
        
        print_success "Existing container removed"
    else
        print_info "No existing LiveKit container found"
    fi
    
    # Start fresh containers
    print_info "Starting Redis and LiveKit containers with fixed configuration..."
    if sudo docker compose up -d redis livekit; then
        print_success "Containers started successfully"
    else
        print_error "Failed to start containers"
        return 1
    fi
    
    # Wait for containers to initialize
    print_info "Waiting 10 seconds for containers to initialize..."
    sleep 10
}

check_container_status() {
    print_info "Checking container status..."
    
    # Check if containers are running
    if sudo docker compose ps --services --filter "status=running" | grep -q "livekit"; then
        print_success "LiveKit container is running"
    else
        print_error "LiveKit container is not running"
        sudo docker compose ps
        return 1
    fi
    
    if sudo docker compose ps --services --filter "status=running" | grep -q "redis"; then
        print_success "Redis container is running"
    else
        print_warning "Redis container is not running"
    fi
}

check_livekit_logs() {
    print_info "Checking LiveKit container logs..."
    
    echo "Recent LiveKit logs:"
    if sudo docker logs ai-sales-livekit --tail 10 2>/dev/null; then
        print_success "LiveKit logs retrieved"
    else
        print_error "Could not retrieve LiveKit logs"
        return 1
    fi
}

test_livekit_connectivity() {
    print_info "Testing LiveKit connectivity..."
    
    # Wait a bit more for LiveKit to fully start
    sleep 5
    
    # Test HTTP connectivity
    if curl -s -f http://localhost:7880 >/dev/null 2>&1; then
        print_success "LiveKit is responding on port 7880"
        
        # Try to get some basic info
        print_info "Testing LiveKit endpoints..."
        
        if curl -s http://localhost:7880/validate >/dev/null 2>&1; then
            print_success "LiveKit /validate endpoint is accessible"
        else
            print_warning "LiveKit /validate endpoint not accessible (this may be normal)"
        fi
        
    else
        print_warning "LiveKit is not yet responding on port 7880"
        print_info "This may be normal if the container is still starting up"
        
        # Check if port is listening
        if ss -tlnp | grep -q ":7880"; then
            print_info "Port 7880 is listening"
        else
            print_warning "Port 7880 is not listening yet"
        fi
    fi
}

show_next_steps() {
    echo ""
    print_info "🚀 Next Steps:"
    echo ""
    echo "1. Verify LiveKit is accessible:"
    echo "   curl http://localhost:7880"
    echo ""
    echo "2. Run the setup script:"
    echo "   ./setup-telnyx-livekit.sh"
    echo ""
    echo "3. If LiveKit is still not responding, check logs:"
    echo "   sudo docker logs ai-sales-livekit -f"
    echo ""
    echo "4. Check container status:"
    echo "   sudo docker compose ps"
    echo ""
}

main() {
    print_header
    
    # Change to project directory
    cd "$(dirname "$0")"
    
    # Run restart sequence
    if restart_livekit; then
        if check_container_status; then
            check_livekit_logs
            test_livekit_connectivity
            show_next_steps
            print_success "LiveKit restart completed successfully!"
        else
            print_error "Container status check failed"
            exit 1
        fi
    else
        print_error "Container restart failed"
        exit 1
    fi
}

# Run main function
main "$@"