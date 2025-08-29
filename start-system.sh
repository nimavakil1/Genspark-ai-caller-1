#!/bin/bash

# AI Sales System - Stable Architecture Startup Script
# This script starts all services in the correct order with health monitoring

echo "🚀 Starting AI Sales System with Stable Architecture..."

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

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    print_error "PM2 is not installed. Please install with: npm install -g pm2"
    exit 1
fi

# Check if .env file exists
if [[ ! -f ".env" ]]; then
    print_error ".env file not found. Please create it with your configuration."
    exit 1
fi

# Load environment variables
source .env

# Create logs directory if it doesn't exist
mkdir -p logs

print_status "Starting system services..."

# Stop any existing processes first
print_status "Stopping any existing processes..."
pm2 delete all 2>/dev/null || true

# Wait a moment for cleanup
sleep 2

# Start all services using PM2 ecosystem file
print_status "Starting services with PM2..."
pm2 start ecosystem.config.js

# Wait for services to initialize
print_status "Waiting for services to initialize..."
sleep 5

# Check service status
print_status "Checking service status..."
pm2 status

# Health check
print_status "Performing health checks..."

# Check if main app is responding
if curl -f -s http://localhost:3001/health > /dev/null 2>&1; then
    print_success "Main app (port 3001) is healthy"
else
    print_warning "Main app health check failed - may still be starting..."
fi

# Check if livekit server is responding  
if curl -f -s http://localhost:7880 > /dev/null 2>&1; then
    print_success "LiveKit server (port 7880) is healthy"
else
    print_warning "LiveKit server health check failed - may still be starting..."
fi

# Check if livekit service is responding
if curl -f -s http://localhost:3004/health > /dev/null 2>&1; then
    print_success "LiveKit service (port 3004) is healthy"
else
    print_warning "LiveKit service health check failed - may still be starting..."
fi

print_success "AI Sales System startup completed!"
print_status "System Status:"
echo -e "  📱 Main Application: ${GREEN}http://localhost:3001${NC}"
echo -e "  🎙️  LiveKit Server: ${GREEN}ws://localhost:7880${NC}"
echo -e "  🔧 LiveKit Service: ${GREEN}http://localhost:3004${NC}"

print_status "Useful commands:"
echo -e "  📊 Monitor services: ${YELLOW}pm2 monit${NC}"
echo -e "  📋 View logs: ${YELLOW}pm2 logs${NC}"
echo -e "  🔄 Restart services: ${YELLOW}pm2 restart all${NC}"
echo -e "  🛑 Stop system: ${YELLOW}./stop-system.sh${NC}"
echo -e "  🏥 Health check: ${YELLOW}./health-check.sh${NC}"

print_success "System is ready! 🎉"