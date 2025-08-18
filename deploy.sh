#!/bin/bash

# LiveKit AI Agent System Deployment Script
# Run this script on your Ubuntu server

set -e  # Exit on any error

echo "🚀 LiveKit AI Agent System Deployment"
echo "======================================"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "❌ Please don't run this script as root. Run as your regular user."
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first:"
    echo "   curl -fsSL https://get.docker.com -o get-docker.sh"
    echo "   sudo sh get-docker.sh"
    echo "   sudo usermod -aG docker $USER"
    echo "   # Then logout and login again"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install it first:"
    echo "   sudo apt update"
    echo "   sudo apt install docker-compose-plugin"
    exit 1
fi

# Create deployment directory
DEPLOY_DIR="/opt/livekit"
echo "📁 Creating deployment directory: $DEPLOY_DIR"

if [ ! -d "$DEPLOY_DIR" ]; then
    sudo mkdir -p "$DEPLOY_DIR"
    sudo chown $USER:$USER "$DEPLOY_DIR"
    echo "✅ Created $DEPLOY_DIR"
else
    echo "✅ Directory $DEPLOY_DIR already exists"
fi

# Check if we're in the right directory (has docker-compose.yml)
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ docker-compose.yml not found in current directory"
    echo "   Please run this script from the directory containing your LiveKit files"
    exit 1
fi

# Copy files to deployment directory
echo "📋 Copying files to $DEPLOY_DIR..."
cp -r . "$DEPLOY_DIR/"
cd "$DEPLOY_DIR"
echo "✅ Files copied successfully"

# Check if .env file exists and has OpenAI key
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    exit 1
fi

if ! grep -q "sk-proj-" ".env"; then
    echo "⚠️  Warning: OpenAI API key might not be configured properly in .env"
    echo "   Please check your .env file"
fi

# Start the services
echo "🐳 Starting Docker services..."
docker compose down || true  # Stop any existing services
docker compose up -d --build

echo "⏳ Waiting for services to start..."
sleep 10

# Check service status
echo "🔍 Checking service status..."
docker compose ps

# Test AI agent health
echo "🏥 Testing AI agent health..."
for i in {1..5}; do
    if curl -s http://localhost:8080/health > /dev/null; then
        echo "✅ AI agent is healthy!"
        curl -s http://localhost:8080/health | jq '.' || curl -s http://localhost:8080/health
        break
    else
        echo "⏳ Waiting for AI agent... (attempt $i/5)"
        sleep 5
    fi
    
    if [ $i -eq 5 ]; then
        echo "❌ AI agent health check failed"
        echo "📋 Checking logs..."
        docker compose logs ai-agent
        exit 1
    fi
done

# Test OpenAI integration
echo "🤖 Testing OpenAI integration..."
AI_TEST=$(curl -s -X POST http://localhost:8080/test/openai \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello! This is a deployment test."}')

if echo "$AI_TEST" | grep -q "success"; then
    echo "✅ OpenAI integration working!"
    echo "$AI_TEST" | jq '.' || echo "$AI_TEST"
else
    echo "❌ OpenAI integration failed:"
    echo "$AI_TEST"
fi

echo ""
echo "🎉 Deployment Complete!"
echo "======================"
echo "Services running on:"
echo "  - LiveKit Server: http://localhost:7880"
echo "  - AI Agent API:   http://localhost:8080"
echo "  - Redis:          localhost:6379"
echo ""
echo "Next steps:"
echo "1. Configure your Telnyx phone number in livekit.yaml"
echo "2. Set up webhook URLs in your Telnyx dashboard"
echo "3. Test phone call flow"
echo ""
echo "Useful commands:"
echo "  - View logs:     docker compose logs -f"
echo "  - Restart:       docker compose restart"
echo "  - Stop:          docker compose down"
echo "  - Status:        docker compose ps"