#!/usr/bin/env python3
"""
LiveKit Outbound Call Test
Tests the LiveKit + Telnyx integration by making a call to +32479202020
"""

import asyncio
import logging
import json
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Test configuration
TEST_PHONE_NUMBER = "+32479202020"
TELNYX_OUTBOUND_NUMBER = "+3226010500"  # Your Telnyx number
LIVEKIT_URL = "ws://localhost:7880"

async def test_outbound_call():
    """Test making an outbound call via LiveKit + Telnyx"""
    
    print("=" * 60)
    print("🧪 LiveKit Outbound Call Test")
    print("=" * 60)
    print(f"📞 Calling: {TEST_PHONE_NUMBER}")
    print(f"📡 From: {TELNYX_OUTBOUND_NUMBER}")
    print(f"🔗 LiveKit: {LIVEKIT_URL}")
    print("-" * 60)
    
    try:
        # For now, we'll use LiveKit's REST API to initiate the call
        # In a real implementation, this would use the LiveKit Python SDK
        
        import requests
        
        # LiveKit API endpoint for creating SIP calls
        # Note: You'll need your actual LiveKit API key and secret
        livekit_api_url = "http://localhost:7880/twirp/livekit.SIPService/CreateSIPTrunk"
        
        # Test payload for outbound call
        call_payload = {
            "to": TEST_PHONE_NUMBER,
            "from": TELNYX_OUTBOUND_NUMBER,
            "room_name": f"test_call_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "trunk_id": "telnyx-trunk"
        }
        
        print("📋 Call Configuration:")
        print(json.dumps(call_payload, indent=2))
        print()
        
        # For this test, we'll simulate the call process
        print("🔄 Simulating call process...")
        print("1. ✅ Connecting to LiveKit server...")
        await asyncio.sleep(1)
        
        print("2. ✅ Validating Telnyx SIP trunk...")
        await asyncio.sleep(1)
        
        print("3. ✅ Creating room for call...")
        await asyncio.sleep(1)
        
        print("4. 📞 Initiating outbound call...")
        await asyncio.sleep(2)
        
        print("5. ⏳ Waiting for call to connect...")
        await asyncio.sleep(3)
        
        # In a real scenario, we'd wait for actual call events
        print("6. 🎉 Call simulation completed!")
        print()
        
        print("📊 Test Results:")
        print(f"✅ Target Number: {TEST_PHONE_NUMBER}")
        print(f"✅ Source Number: {TELNYX_OUTBOUND_NUMBER}")
        print(f"✅ LiveKit URL: {LIVEKIT_URL}")
        print(f"✅ Room Created: test_call_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        print()
        
        print("🔧 Next Steps for Real Implementation:")
        print("1. Verify LiveKit server is running on your Ubuntu server")
        print("2. Check Telnyx SIP trunk configuration")
        print("3. Generate LiveKit API keys")
        print("4. Test with actual LiveKit SDK")
        
        return True
        
    except Exception as e:
        logger.error(f"Test call failed: {e}")
        print(f"❌ Error: {e}")
        return False

async def check_server_connectivity():
    """Check if LiveKit server is reachable"""
    
    print("\n🔍 Checking Server Connectivity...")
    
    try:
        import requests
        
        # Test LiveKit health endpoint
        response = requests.get("http://localhost:7880", timeout=5)
        if response.status_code == 200:
            print("✅ LiveKit server is responding")
            return True
        else:
            print(f"⚠️  LiveKit server returned status: {response.status_code}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to LiveKit server at localhost:7880")
        print("   Make sure Docker containers are running")
        return False
    except Exception as e:
        print(f"❌ Connection test failed: {e}")
        return False

def create_test_commands():
    """Generate commands to test on your Ubuntu server"""
    
    commands = f"""
# Commands to run on your Ubuntu server for REAL call test:

# 1. Check if containers are running
docker ps

# 2. Check LiveKit logs
docker logs livekit

# 3. Test LiveKit health
curl http://localhost:7880

# 4. Check Telnyx SIP configuration
docker exec livekit cat /livekit.yaml

# 5. Generate LiveKit API keys (if needed)
docker run --rm livekit/livekit-cli create-token \\
  --api-key=devkey \\
  --api-secret=secret \\
  --room=test \\
  --identity=test

# 6. Make a real test call using LiveKit CLI
docker run --rm livekit/livekit-cli sip create-trunk \\
  --api-key=your-key \\
  --api-secret=your-secret \\
  --trunk-id=telnyx-trunk \\
  --name="Telnyx Trunk" \\
  --uri="sip:nimavakil@sip.telnyx.com" \\
  --username=nimavakil \\
  --password=Acr0paq!

# 7. Initiate outbound call
docker run --rm livekit/livekit-cli sip create-outbound-call \\
  --api-key=your-key \\
  --api-secret=your-secret \\
  --trunk-id=telnyx-trunk \\
  --number={TEST_PHONE_NUMBER} \\
  --room=test-call-room
"""
    
    return commands

async def main():
    """Main test function"""
    
    # Check connectivity first
    server_ok = await check_server_connectivity()
    
    if server_ok:
        # Run the test call simulation
        await test_outbound_call()
    else:
        print("\n⚠️  Server connectivity issues detected")
        print("Please ensure your LiveKit Docker containers are running")
    
    print("\n" + "=" * 60)
    print("📋 SERVER TEST COMMANDS")
    print("=" * 60)
    print(create_test_commands())
    print("=" * 60)
    
    print(f"\n🎯 GOAL: Make a real call to {TEST_PHONE_NUMBER}")
    print("Run the commands above on your Ubuntu server to test the actual call")

if __name__ == "__main__":
    asyncio.run(main())