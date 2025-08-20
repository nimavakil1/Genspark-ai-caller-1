#!/bin/bash

# Test script for your existing LiveKit setup
# Container name: genspark-ai-caller-1-livekit-1

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Your configuration
TARGET_PHONE="+32479202020"
TELNYX_NUMBER="+3226010500"
LIVEKIT_CONTAINER="genspark-ai-caller-1-livekit-1"
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
echo "🐳 Container: $LIVEKIT_CONTAINER"
echo "🏠 Room: $TEST_ROOM"
echo "============================================================"
echo ""

# Step 1: Check LiveKit container
print_status "Step 1: Checking LiveKit container..."
if docker ps | grep -q "$LIVEKIT_CONTAINER"; then
    print_success "LiveKit container is running"
    docker ps | grep livekit
else
    print_error "LiveKit container not found!"
    exit 1
fi

echo ""

# Step 2: Test LiveKit connectivity
print_status "Step 2: Testing LiveKit connectivity..."
if curl -s -f http://localhost:7880 > /dev/null; then
    print_success "LiveKit server is responding on port 7880"
else
    print_error "Cannot connect to LiveKit server on port 7880"
    exit 1
fi

echo ""

# Step 3: Check LiveKit logs
print_status "Step 3: Checking recent LiveKit logs..."
echo "Recent LiveKit logs:"
docker logs $LIVEKIT_CONTAINER --tail 10

echo ""

# Step 4: Check LiveKit configuration
print_status "Step 4: Checking LiveKit configuration..."
echo "Checking for SIP configuration..."
if docker exec $LIVEKIT_CONTAINER cat /livekit.yaml 2>/dev/null | grep -A 5 "sip:"; then
    print_success "SIP configuration found"
else
    print_warning "No SIP configuration found in livekit.yaml"
    echo "Checking environment variables..."
    docker exec $LIVEKIT_CONTAINER env | grep -i sip || echo "No SIP environment variables found"
fi

echo ""

# Step 5: Try to make the test call
print_status "Step 5: Attempting test call..."

print_warning "This will attempt to call $TARGET_PHONE using LiveKit CLI"
echo ""
echo "Command to execute:"
echo "docker run --rm --network container:$LIVEKIT_CONTAINER livekit/livekit-cli sip create-outbound-call \\"
echo "  --url=http://localhost:7880 \\"
echo "  --api-key=devkey \\"
echo "  --api-secret=secret \\"
echo "  --trunk-id=telnyx-trunk \\"
echo "  --number=$TARGET_PHONE \\"
echo "  --room=$TEST_ROOM"

echo ""
read -p "Do you want to attempt the call now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Making test call..."
    
    # Try the actual call
    docker run --rm --network container:$LIVEKIT_CONTAINER livekit/livekit-cli sip create-outbound-call \
      --url=http://localhost:7880 \
      --api-key=devkey \
      --api-secret=secret \
      --trunk-id=telnyx-trunk \
      --number=$TARGET_PHONE \
      --room=$TEST_ROOM || {
        print_error "Call failed - this is expected if API keys aren't configured"
        echo ""
        echo "To fix this, you need to:"
        echo "1. Generate proper LiveKit API keys"
        echo "2. Configure SIP trunk with Telnyx credentials"
        echo "3. Restart LiveKit with proper configuration"
    }
else
    print_status "Call skipped by user"
fi

echo ""

# Step 6: Instructions for manual testing
print_status "Step 6: Manual testing instructions"
echo ""
echo "🔧 To make this work properly:"
echo ""
echo "1. Check your current LiveKit configuration:"
echo "   docker exec $LIVEKIT_CONTAINER cat /livekit.yaml"
echo ""
echo "2. Generate LiveKit API keys:"
echo "   docker run --rm livekit/livekit-cli create-token \\"
echo "     --api-key=YOUR_KEY --api-secret=YOUR_SECRET \\"
echo "     --room=test --identity=test"
echo ""
echo "3. Configure SIP trunk in livekit.yaml:"
cat << 'EOF'
   sip:
     inbound_numbers:
       - number: "+3226010500"
         username: "nimavakil"
         password: "Acr0paq!"
     outbound_numbers:
       - number: "+3226010500"
         username: "nimavakil"
         password: "Acr0paq!"
EOF

echo ""
echo "4. Restart LiveKit container:"
echo "   docker-compose restart livekit"
echo ""
echo "5. Try the call again with proper API keys"

echo ""
echo "============================================================"
print_success "✅ Test completed!"
echo "============================================================"
echo ""
echo "📱 Your phone: $TARGET_PHONE"
echo "📞 Should ring from: $TELNYX_NUMBER"
echo ""
if docker logs $LIVEKIT_CONTAINER --tail 5 | grep -q "ERROR\|error"; then
    print_warning "⚠️  Check LiveKit logs for errors:"
    echo "   docker logs $LIVEKIT_CONTAINER"
else
    print_success "✅ No obvious errors in recent logs"
fi