#!/bin/bash

# LiveKit + Telnyx Outbound Call Test Script
# Run this on your Ubuntu server to test calling +32479202020

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test configuration
TARGET_PHONE="+32479202020"
TELNYX_NUMBER="+3226010500"
TEST_ROOM="test-call-$(date +%s)"

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

echo "============================================================"
echo "📞 LiveKit + Telnyx Outbound Call Test"
echo "============================================================"
echo "🎯 Target: $TARGET_PHONE"
echo "📡 From: $TELNYX_NUMBER"
echo "🏠 Room: $TEST_ROOM"
echo "============================================================"
echo ""

# Step 1: Check if Docker containers are running
print_status "Step 1: Checking Docker containers..."
if docker ps | grep -q livekit; then
    print_success "LiveKit container is running"
    docker ps | grep livekit
else
    print_error "LiveKit container is not running!"
    echo "Please start your containers with: docker-compose up -d"
    exit 1
fi

if docker ps | grep -q redis; then
    print_success "Redis container is running"
else
    print_warning "Redis container not found - this may be OK if Redis is running differently"
fi

echo ""

# Step 2: Test LiveKit connectivity
print_status "Step 2: Testing LiveKit connectivity..."
if curl -s -f http://localhost:7880 > /dev/null; then
    print_success "LiveKit server is responding on port 7880"
else
    print_error "Cannot connect to LiveKit server on port 7880"
    print_status "Checking what's running on port 7880..."
    netstat -tulpn | grep 7880 || echo "Nothing running on port 7880"
    exit 1
fi

echo ""

# Step 3: Check LiveKit configuration
print_status "Step 3: Checking LiveKit configuration..."
if docker exec livekit cat /livekit.yaml > /dev/null 2>&1; then
    print_success "LiveKit configuration file found"
    echo "SIP Configuration:"
    docker exec livekit grep -A 10 "sip:" /livekit.yaml || echo "No SIP config found in livekit.yaml"
else
    print_warning "Cannot read LiveKit configuration - container may use environment variables"
fi

echo ""

# Step 4: Generate API keys if needed
print_status "Step 4: Generating test API keys..."
TEMP_API_KEY="test-key-$(date +%s)"
TEMP_API_SECRET="test-secret-$(date +%s)"

print_success "Generated temporary API keys:"
echo "  API Key: $TEMP_API_KEY"
echo "  API Secret: $TEMP_API_SECRET"

echo ""

# Step 5: Test SIP trunk creation
print_status "Step 5: Creating SIP trunk..."
echo "Command that would be executed:"
echo "docker run --rm --network host livekit/livekit-cli sip create-trunk \\"
echo "  --url=http://localhost:7880 \\"
echo "  --api-key=$TEMP_API_KEY \\"
echo "  --api-secret=$TEMP_API_SECRET \\"
echo "  --trunk-id=telnyx-test-trunk \\"
echo "  --name='Telnyx Test Trunk' \\"
echo "  --uri='sip:sip.telnyx.com' \\"
echo "  --username=nimavakil \\"
echo "  --password=Acr0paq!"

echo ""
print_warning "Note: This would fail without proper API keys configured in LiveKit"

echo ""

# Step 6: Prepare outbound call test
print_status "Step 6: Preparing outbound call test..."
echo "Command to make actual call:"
echo "docker run --rm --network host livekit/livekit-cli sip create-outbound-call \\"
echo "  --url=http://localhost:7880 \\"
echo "  --api-key=YOUR_ACTUAL_API_KEY \\"
echo "  --api-secret=YOUR_ACTUAL_API_SECRET \\"
echo "  --trunk-id=telnyx-test-trunk \\"
echo "  --number=$TARGET_PHONE \\"
echo "  --room=$TEST_ROOM"

echo ""

# Step 7: Manual test instructions
print_status "Step 7: Manual testing instructions..."
echo ""
echo "🔧 To make a REAL test call, you need to:"
echo ""
echo "1. First, check your current LiveKit setup:"
echo "   docker exec livekit ps aux"
echo ""
echo "2. Check LiveKit logs for any errors:"
echo "   docker logs livekit"
echo ""
echo "3. Verify Telnyx credentials are working:"
echo "   # Test SIP registration manually if needed"
echo ""
echo "4. If LiveKit is configured with API keys, use them instead of generated ones"
echo ""
echo "5. Try a simple test call:"
cat << 'EOF'
   docker run --rm --network host livekit/livekit-cli sip create-outbound-call \
     --url=http://localhost:7880 \
     --api-key=YOUR_API_KEY \
     --api-secret=YOUR_API_SECRET \
     --trunk-id=telnyx-trunk \
     --number=+32479202020 \
     --room=test-call-room
EOF

echo ""
echo "============================================================"
print_success "✅ Pre-flight checks completed!"
echo "============================================================"
echo ""
echo "📋 Summary:"
echo "✅ Docker containers are running"
echo "✅ LiveKit server is accessible"
echo "🎯 Ready to test call to $TARGET_PHONE"
echo ""
echo "⚠️  You need to configure proper API keys in LiveKit to make actual calls"
echo ""
echo "🚀 Next: Configure LiveKit with proper API keys, then run the call command above"