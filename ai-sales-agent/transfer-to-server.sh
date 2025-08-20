#!/bin/bash

# Transfer AI Sales Agent to Your Ubuntu Server
# Usage: ./transfer-to-server.sh username@your-server-ip

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

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

# Check if server address provided
if [ $# -eq 0 ]; then
    print_error "Please provide server address"
    echo "Usage: $0 username@your-server-ip"
    echo "Example: $0 root@192.168.1.100"
    exit 1
fi

SERVER=$1
LOCAL_DIR=$(pwd)
REMOTE_DIR="/opt/ai-sales-agent"

echo "=========================================="
echo "📡 Transferring AI Sales Agent to Server"
echo "=========================================="
echo ""

print_status "Source: $LOCAL_DIR"
print_status "Target: $SERVER:$REMOTE_DIR"
echo ""

# Test SSH connection
print_status "Testing SSH connection to $SERVER..."
if ssh -o ConnectTimeout=10 -o BatchMode=yes $SERVER exit 2>/dev/null; then
    print_success "SSH connection successful"
else
    print_error "Cannot connect to $SERVER via SSH"
    echo "Please ensure:"
    echo "1. SSH key is set up or password authentication works"
    echo "2. Server is accessible from this machine"
    echo "3. Username and IP address are correct"
    exit 1
fi

# Create remote directory
print_status "Creating remote directory..."
ssh $SERVER "sudo mkdir -p $REMOTE_DIR && sudo chown \$USER:\$USER $REMOTE_DIR"

# Transfer files
print_status "Transferring files..."
rsync -avz --progress \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.git' \
    --exclude='logs/*' \
    --exclude='data/customers.db' \
    $LOCAL_DIR/ $SERVER:$REMOTE_DIR/

print_success "Files transferred successfully!"

# Make scripts executable
print_status "Setting permissions..."
ssh $SERVER "cd $REMOTE_DIR && chmod +x deploy-to-server.sh && chmod +x run_sales_agent.py"

echo ""
echo "=========================================="
print_success "🎉 Transfer Complete!"
echo "=========================================="
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. SSH to your server:"
echo "   ssh $SERVER"
echo ""
echo "2. Navigate to the project directory:"
echo "   cd $REMOTE_DIR"
echo ""
echo "3. Run the deployment script:"
echo "   ./deploy-to-server.sh"
echo ""
echo "4. Update configuration with your API keys:"
echo "   nano .env"
echo ""
echo "5. Restart services:"
echo "   docker-compose restart"
echo ""
echo "6. Access your AI Sales Agent:"
echo "   http://your-server-ip:8000"
echo ""

# Provide the exact SSH command
print_status "Quick start command:"
echo "ssh $SERVER 'cd $REMOTE_DIR && ./deploy-to-server.sh'"
echo ""

print_success "AI Sales Agent is ready for deployment on your server! 🚀"