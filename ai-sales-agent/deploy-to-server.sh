#!/bin/bash

# AI Sales Agent Deployment Script for Ubuntu Server
# Run this script on your Ubuntu server to deploy the complete system

set -e  # Exit on any error

echo "=========================================="
echo "🚀 AI Sales Agent Deployment"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/opt/ai-sales-agent"
BACKUP_DIR="/opt/backups/ai-sales-agent-$(date +%Y%m%d-%H%M%S)"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
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

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root. Please run as a regular user with sudo privileges."
   exit 1
fi

# Create project directory
print_status "Creating project directory..."
sudo mkdir -p $PROJECT_DIR
sudo chown $USER:$USER $PROJECT_DIR

# Copy files to project directory
print_status "Copying application files..."
cp -r . $PROJECT_DIR/
cd $PROJECT_DIR

# Set up environment file
print_status "Setting up environment configuration..."
if [ ! -f .env ]; then
    cp .env.production .env
    print_warning "Created .env file from template. Please update with your actual API keys!"
    print_warning "Edit: $PROJECT_DIR/.env"
else
    print_success "Environment file already exists"
fi

# Create necessary directories
print_status "Creating application directories..."
mkdir -p data logs config

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first:"
    echo "curl -fsSL https://get.docker.com -o get-docker.sh"
    echo "sudo sh get-docker.sh"
    echo "sudo usermod -aG docker $USER"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first:"
    echo "sudo curl -L \"https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-\$(uname -s)-\$(uname -m)\" -o /usr/local/bin/docker-compose"
    echo "sudo chmod +x /usr/local/bin/docker-compose"
    exit 1
fi

# Stop any existing containers
print_status "Stopping existing containers..."
docker-compose down 2>/dev/null || true

# Build and start services
print_status "Building AI Sales Agent..."
docker-compose build

print_status "Starting services..."
docker-compose up -d

# Wait for services to be healthy
print_status "Waiting for services to start..."
sleep 30

# Check service health
print_status "Checking service health..."

# Check Redis
if docker-compose exec redis redis-cli ping | grep -q PONG; then
    print_success "Redis is healthy"
else
    print_error "Redis is not responding"
fi

# Check LiveKit
if curl -f http://localhost:7880 >/dev/null 2>&1; then
    print_success "LiveKit is healthy"
else
    print_error "LiveKit is not responding"
fi

# Check AI Sales Agent
if curl -f http://localhost:8000/api/stats >/dev/null 2>&1; then
    print_success "AI Sales Agent is healthy"
else
    print_error "AI Sales Agent is not responding"
fi

# Display service status
print_status "Service Status:"
docker-compose ps

# Display URLs
echo ""
echo "=========================================="
print_success "🎉 Deployment Complete!"
echo "=========================================="
echo ""
echo "📊 AI Sales Agent Dashboard: http://$(hostname -I | awk '{print $1}'):8000"
echo "🎧 LiveKit Server: http://$(hostname -I | awk '{print $1}'):7880"
echo "📡 Redis: localhost:6379"
echo ""
echo "📋 Next Steps:"
echo "1. Update API keys in: $PROJECT_DIR/.env"
echo "2. Restart services: cd $PROJECT_DIR && docker-compose restart"
echo "3. Access dashboard and start your first campaign!"
echo ""
echo "📝 Logs:"
echo "- View all logs: docker-compose logs -f"
echo "- AI Agent logs: docker-compose logs -f ai-sales-agent"
echo "- LiveKit logs: docker-compose logs -f livekit"
echo ""
echo "🔧 Management Commands:"
echo "- Stop services: docker-compose down"
echo "- Start services: docker-compose up -d"
echo "- Restart services: docker-compose restart"
echo "- Update and rebuild: docker-compose up -d --build"
echo ""

# Generate LiveKit API keys if needed
if grep -q "your-livekit-api-key" .env; then
    print_warning "⚠️  IMPORTANT: You need to generate LiveKit API keys"
    echo ""
    echo "Run these commands to generate LiveKit keys:"
    echo "docker run --rm livekit/livekit-cli create-token --api-key=your-key --api-secret=your-secret --room=test --identity=test"
    echo ""
    echo "Then update the LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env file"
fi

print_success "AI Sales Agent is now deployed and ready for receipt roll sales! 📞💰"