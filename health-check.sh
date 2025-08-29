#!/bin/bash

# AI Sales System - Health Check Script
# This script monitors all system components and reports their status

echo "🏥 AI Sales System Health Check"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
print_header() {
    echo -e "${CYAN}📊 $1${NC}"
    echo "----------------------------------------"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Track overall system health
OVERALL_HEALTH=0

print_header "PM2 Process Status"

# Check if PM2 is installed and running
if ! command -v pm2 &> /dev/null; then
    print_error "PM2 is not installed"
    ((OVERALL_HEALTH++))
else
    print_success "PM2 is installed"
    
    # Show PM2 status
    PM2_STATUS=$(pm2 jlist 2>/dev/null)
    if [[ $? -eq 0 ]]; then
        echo ""
        pm2 status
        echo ""
        
        # Check individual processes
        MAIN_APP_STATUS=$(echo "$PM2_STATUS" | jq -r '.[] | select(.name=="main-app") | .pm2_env.status' 2>/dev/null)
        LIVEKIT_AGENT_STATUS=$(echo "$PM2_STATUS" | jq -r '.[] | select(.name=="livekit-agent") | .pm2_env.status' 2>/dev/null)
        
        if [[ "$MAIN_APP_STATUS" == "online" ]]; then
            print_success "Main app is running"
        else
            print_error "Main app is not running (Status: $MAIN_APP_STATUS)"
            ((OVERALL_HEALTH++))
        fi
        
        if [[ "$LIVEKIT_AGENT_STATUS" == "online" ]]; then
            print_success "LiveKit agent is running"
        else
            print_error "LiveKit agent is not running (Status: $LIVEKIT_AGENT_STATUS)"
            ((OVERALL_HEALTH++))
        fi
    else
        print_warning "Unable to get PM2 status"
        ((OVERALL_HEALTH++))
    fi
fi

print_header "Port Availability Check"

# Check if ports are in use
PORT_3001=$(lsof -ti:3001 2>/dev/null)
PORT_7880=$(lsof -ti:7880 2>/dev/null)  
PORT_3004=$(lsof -ti:3004 2>/dev/null)

if [[ -n "$PORT_3001" ]]; then
    print_success "Port 3001 (Main App) is in use by PID $PORT_3001"
else
    print_error "Port 3001 (Main App) is not in use"
    ((OVERALL_HEALTH++))
fi

if [[ -n "$PORT_7880" ]]; then
    print_success "Port 7880 (LiveKit Server) is in use by PID $PORT_7880"
else
    print_error "Port 7880 (LiveKit Server) is not in use"
    ((OVERALL_HEALTH++))
fi

if [[ -n "$PORT_3004" ]]; then
    print_success "Port 3004 (LiveKit Service) is in use by PID $PORT_3004"
else
    print_warning "Port 3004 (LiveKit Service) is not in use (may be managed by PM2)"
fi

print_header "HTTP Health Checks"

# Test HTTP endpoints
print_info "Testing Main App (http://localhost:3001/health)..."
if curl -f -s --max-time 5 http://localhost:3001/health > /dev/null 2>&1; then
    print_success "Main App HTTP endpoint is healthy"
else
    print_error "Main App HTTP endpoint is not responding"
    ((OVERALL_HEALTH++))
fi

print_info "Testing LiveKit Service (http://localhost:3004/health)..."
if curl -f -s --max-time 5 http://localhost:3004/health > /dev/null 2>&1; then
    print_success "LiveKit Service HTTP endpoint is healthy"
else
    print_error "LiveKit Service HTTP endpoint is not responding"
    ((OVERALL_HEALTH++))
fi

print_info "Testing LiveKit Server (http://localhost:7880)..."
if curl -f -s --max-time 5 http://localhost:7880 > /dev/null 2>&1; then
    print_success "LiveKit Server HTTP endpoint is responding"
else
    print_warning "LiveKit Server HTTP endpoint check failed (may be WebSocket only)"
fi

print_header "Configuration Files"

# Check for essential files
if [[ -f ".env" ]]; then
    print_success ".env file exists"
else
    print_error ".env file is missing"
    ((OVERALL_HEALTH++))
fi

if [[ -f "ecosystem.config.js" ]]; then
    print_success "ecosystem.config.js exists"
else
    print_error "ecosystem.config.js is missing"
    ((OVERALL_HEALTH++))
fi

if [[ -f "livekit.yaml" ]]; then
    print_success "livekit.yaml exists"
else
    print_warning "livekit.yaml is missing"
fi

print_header "System Resources"

# Check disk space
DISK_USAGE=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
if [[ $DISK_USAGE -lt 90 ]]; then
    print_success "Disk usage is healthy (${DISK_USAGE}%)"
else
    print_warning "Disk usage is high (${DISK_USAGE}%)"
fi

# Check memory usage
MEMORY_USAGE=$(free | awk 'NR==2{printf "%.1f", $3/$2*100}')
if [[ $(echo "$MEMORY_USAGE < 90" | bc -l) -eq 1 ]]; then
    print_success "Memory usage is healthy (${MEMORY_USAGE}%)"
else
    print_warning "Memory usage is high (${MEMORY_USAGE}%)"
fi

print_header "Log Files"

# Check for log directory and files
if [[ -d "logs" ]]; then
    print_success "Logs directory exists"
    
    # Check log files
    LOG_FILES=("main-app-combined.log" "livekit-agent-combined.log")
    for log_file in "${LOG_FILES[@]}"; do
        if [[ -f "logs/$log_file" ]]; then
            LOG_SIZE=$(stat -f%z "logs/$log_file" 2>/dev/null || stat -c%s "logs/$log_file" 2>/dev/null)
            if [[ $LOG_SIZE -gt 0 ]]; then
                print_success "$log_file exists and has content"
            else
                print_warning "$log_file exists but is empty"
            fi
        else
            print_warning "$log_file does not exist"
        fi
    done
else
    print_warning "Logs directory does not exist"
fi

print_header "Overall System Health"

if [[ $OVERALL_HEALTH -eq 0 ]]; then
    print_success "🎉 System is healthy! All critical components are running properly."
    echo ""
    print_info "System Access Points:"
    echo -e "  📱 Main Application: ${GREEN}http://localhost:3001${NC}"
    echo -e "  🎙️  LiveKit Server: ${GREEN}ws://localhost:7880${NC}"
    echo -e "  🔧 LiveKit Service: ${GREEN}http://localhost:3004${NC}"
    exit 0
elif [[ $OVERALL_HEALTH -le 2 ]]; then
    print_warning "⚠️  System has minor issues ($OVERALL_HEALTH issues found)"
    print_info "Most components are working, but some attention may be needed."
    exit 1
else
    print_error "🚨 System has significant health issues ($OVERALL_HEALTH issues found)"
    print_info "Please check the errors above and restart the system if needed:"
    echo -e "  🛑 Stop system: ${YELLOW}./stop-system.sh${NC}"
    echo -e "  🚀 Start system: ${YELLOW}./start-system.sh${NC}"
    exit 2
fi