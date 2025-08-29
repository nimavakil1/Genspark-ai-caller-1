#!/bin/bash

# AI Sales System - Stable Architecture Shutdown Script
# This script gracefully stops all services

echo "🛑 Stopping AI Sales System..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
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

# Check if PM2 is running
if ! command -v pm2 &> /dev/null; then
    print_warning "PM2 is not installed or not in PATH"
    exit 1
fi

print_status "Gracefully stopping all PM2 processes..."

# Show current status
print_status "Current PM2 processes:"
pm2 status

# Stop all processes gracefully
pm2 stop all

# Wait for graceful shutdown
print_status "Waiting for processes to stop gracefully..."
sleep 3

# Delete all processes from PM2
pm2 delete all

print_status "Checking for any remaining processes..."

# Check for any remaining processes on our ports
MAIN_APP_PID=$(lsof -ti:3001 2>/dev/null)
LIVEKIT_SERVER_PID=$(lsof -ti:7880 2>/dev/null)
LIVEKIT_SERVICE_PID=$(lsof -ti:3004 2>/dev/null)

if [[ -n "$MAIN_APP_PID" ]]; then
    print_warning "Main app still running on port 3001 (PID: $MAIN_APP_PID)"
    print_status "Killing main app process..."
    kill -TERM $MAIN_APP_PID 2>/dev/null || kill -KILL $MAIN_APP_PID 2>/dev/null
fi

if [[ -n "$LIVEKIT_SERVER_PID" ]]; then
    print_warning "LiveKit server still running on port 7880 (PID: $LIVEKIT_SERVER_PID)"
    print_status "Killing LiveKit server process..."
    kill -TERM $LIVEKIT_SERVER_PID 2>/dev/null || kill -KILL $LIVEKIT_SERVER_PID 2>/dev/null
fi

if [[ -n "$LIVEKIT_SERVICE_PID" ]]; then
    print_warning "LiveKit service still running on port 3004 (PID: $LIVEKIT_SERVICE_PID)"
    print_status "Killing LiveKit service process..."
    kill -TERM $LIVEKIT_SERVICE_PID 2>/dev/null || kill -KILL $LIVEKIT_SERVICE_PID 2>/dev/null
fi

# Also check for any Python processes that might be our LiveKit agent
PYTHON_PIDS=$(pgrep -f "livekit_agent.py" 2>/dev/null)
if [[ -n "$PYTHON_PIDS" ]]; then
    print_warning "Found LiveKit agent Python processes: $PYTHON_PIDS"
    print_status "Killing LiveKit agent processes..."
    pkill -f "livekit_agent.py" 2>/dev/null
fi

# Final verification
sleep 2

print_status "Final verification - checking ports..."
REMAINING_3001=$(lsof -ti:3001 2>/dev/null)
REMAINING_7880=$(lsof -ti:7880 2>/dev/null)
REMAINING_3004=$(lsof -ti:3004 2>/dev/null)

if [[ -z "$REMAINING_3001" && -z "$REMAINING_7880" && -z "$REMAINING_3004" ]]; then
    print_success "All services stopped successfully!"
    print_success "System shutdown complete! 🎉"
else
    print_error "Some processes may still be running:"
    [[ -n "$REMAINING_3001" ]] && echo "  - Port 3001: PID $REMAINING_3001"
    [[ -n "$REMAINING_7880" ]] && echo "  - Port 7880: PID $REMAINING_7880"  
    [[ -n "$REMAINING_3004" ]] && echo "  - Port 3004: PID $REMAINING_3004"
    print_warning "You may need to manually kill these processes or restart the server"
fi

print_status "PM2 status after shutdown:"
pm2 status