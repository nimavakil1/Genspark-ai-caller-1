# Telnyx + LiveKit Integration Guide

## Overview

This document provides a complete guide to integrate Telnyx SIP services with LiveKit for AI-powered voice calling in the AI Sales System.

**Based on official Telnyx documentation**: https://developers.telnyx.com/docs/voice/sip-trunking/livekit-configuration-guide

## Architecture

```
Customer Phone <-> Telnyx Network <-> LiveKit Server <-> AI Sales System
                                            ↓
                                      Node.js API
                                            ↓
                                    PostgreSQL Database
```

## Prerequisites

### 1. Telnyx Account Setup
- ✅ Telnyx account created
- ✅ Level 2 (L2) verification completed
- ✅ Phone number purchased: `+3226010500`
- ✅ Credentials: Username: `nimavakil`, Password: `Acr0paq!`

### 2. LiveKit Server
- ✅ LiveKit server running (Docker container)
- ✅ LiveKit CLI installed
- ⚠️ **REQUIRED**: LiveKit API credentials (API Key & Secret)
- ⚠️ **REQUIRED**: LiveKit SIP URI from project settings

### 3. Environment Variables
```bash
# LiveKit Configuration
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_WS_URL=wss://your-domain.livekit.cloud

# Telnyx Configuration
TELNYX_API_KEY=your_telnyx_api_key
TELNYX_PUBLIC_KEY=your_telnyx_public_key
```

## Setup Process

### Step 1: Telnyx Mission Control Portal Configuration

#### A. Create SIP Connection
1. Navigate to: **Real-Time Communications → Voice → SIP Trunking**
2. Click **Add SIP Connection**
3. Configure:
   - **Name**: `LiveKit AI Sales System`
   - **Connection Type**: `FQDN`
   - **SIP URI**: `<YOUR_LIVEKIT_SIP_URI>` (get from LiveKit project settings)
   - **Authentication**: `Credentials`
   - **Username**: `nimavakil`
   - **Password**: `Acr0paq!`

#### B. Create Programmable Voice Application
1. Navigate to: **Real-Time Communications → Voice → Programmable Voice**
2. Create new application:
   - **Name**: `AI Sales Voice App`
   - **Webhook URL**: `http://your-server.com:3001/api/telnyx/webhooks/call-events`
   - **Subdomain**: `ai-sales-system`

#### C. Configure Outbound Voice Profile
1. Navigate to: **Real-Time Communications → Voice → Outbound Voice Profile**
2. Create profile:
   - **Name**: `AI Sales Outbound Profile`
   - **Allowed Destinations**: Include Belgium, EU countries as needed

#### D. Assign Phone Numbers
1. Navigate to: **Real-Time Communications → Voice → My Numbers**
2. Assign `+3226010500` to your LiveKit SIP Connection

### Step 2: LiveKit Configuration

Run the automated setup script:

```bash
cd /home/user/webapp
./setup-telnyx-livekit.sh
```

This script will:
1. ✅ Create inbound SIP trunk (`sip-config/inboundTrunk.json`)
2. ✅ Create dispatch rule (`sip-config/dispatchRule.json`)
3. ✅ Create outbound SIP trunk (`sip-config/outboundTrunk.json`)
4. ✅ Prepare test call configuration (`sip-config/sipParticipant.json`)

#### Manual LiveKit CLI Commands (if needed):

```bash
# Set environment
export LIVEKIT_URL="http://localhost:7880"
export LK_API_KEY="your_api_key"
export LK_API_SECRET="your_api_secret"

# Create inbound trunk
lk sip inbound create sip-config/inboundTrunk.json

# Create dispatch rule (update trunk_id first)
lk sip dispatch create sip-config/dispatchRule.json

# Create outbound trunk
lk sip outbound create sip-config/outboundTrunk.json
```

## Configuration Files

### Inbound Trunk (`sip-config/inboundTrunk.json`)
```json
{
  "trunk": {
    "name": "Telnyx Inbound Trunk",
    "numbers": ["+3226010500"]
  }
}
```

### Dispatch Rule (`sip-config/dispatchRule.json`)
```json
{
  "name": "AI Sales Dispatch Rule",
  "trunk_ids": ["<TRUNK_ID_FROM_INBOUND_CREATION>"],
  "rule": {
    "dispatchRuleDirect": {
      "roomName": "ai-sales-call",
      "pin": ""
    }
  }
}
```

### Outbound Trunk (`sip-config/outboundTrunk.json`)
```json
{
  "trunk": {
    "name": "Telnyx Outbound Trunk",
    "address": "sip.telnyx.com",
    "numbers": ["+3226010500"],
    "auth_username": "nimavakil",
    "auth_password": "Acr0paq!"
  }
}
```

## API Endpoints

### Make Outbound Call
```bash
POST /api/telnyx/outbound-call

{
  "customer_id": 123,
  "phone_number": "+32479202020",
  "room_name": "ai-sales-call",
  "participant_identity": "ai-sales-agent",
  "participant_name": "AI Sales Agent"
}
```

### Webhook Handler (Telnyx → System)
```bash
POST /api/telnyx/webhooks/call-events
# Handles: call.initiated, call.answered, call.hangup, etc.
```

### Get Room Information
```bash
GET /api/telnyx/room/:roomName
```

### List SIP Trunks
```bash
GET /api/telnyx/sip/trunks
```

### Health Check
```bash
GET /api/telnyx/health
```

## Testing

### 1. Test Outbound Call via API
```bash
curl -X POST http://localhost:3001/api/telnyx/outbound-call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "phone_number": "+32479202020",
    "room_name": "test-call"
  }'
```

### 2. Test with LiveKit CLI
```bash
lk sip participant create sip-config/sipParticipant.json
```

### 3. Monitor Call Logs
- **Database**: Check `call_logs` table
- **Telnyx**: Mission Control → Reporting → Debugging → SIP Call Flow Tool
- **LiveKit**: Check server logs

## Troubleshooting

### Common Issues

1. **SIP Registration Failed**
   - ✅ Verify Telnyx credentials: `nimavakil` / `Acr0paq!`
   - ✅ Check SIP URI in Telnyx SIP Connection matches LiveKit
   - ✅ Ensure FQDN connection type is selected

2. **Authentication Errors**
   - ✅ Verify LiveKit API credentials
   - ✅ Check environment variables are loaded
   - ✅ Ensure API keys have SIP permissions

3. **Call Not Connecting**
   - ✅ Check outbound voice profile allows destination country
   - ✅ Verify phone number format (E.164: +32479202020)
   - ✅ Check trunk IDs match in configuration

4. **Webhooks Not Working**
   - ✅ Verify webhook URL is accessible from internet
   - ✅ Check Telnyx voice app configuration
   - ✅ Monitor webhook endpoint logs

### Debugging Tools

1. **Telnyx Portal**
   - Mission Control → Reporting → Debugging → SIP Call Flow Tool
   - Export PCAP files for detailed analysis

2. **LiveKit Server Logs**
   ```bash
   docker logs livekit
   ```

3. **Application Logs**
   ```bash
   pm2 logs webapp --nostream
   ```

4. **Database Monitoring**
   ```sql
   SELECT * FROM call_logs ORDER BY created_at DESC LIMIT 10;
   ```

## Integration Flow

### Outbound Call Process
1. **API Request** → `POST /api/telnyx/outbound-call`
2. **Create Config** → Generate `sipParticipant.json`
3. **LiveKit CLI** → Execute `lk sip participant create`
4. **SIP Connection** → LiveKit → Telnyx → Customer Phone
5. **Database Log** → Record call in `call_logs` table
6. **Webhooks** → Receive status updates from Telnyx
7. **AI Processing** → Handle call in LiveKit room

### Inbound Call Process
1. **Customer Calls** → `+3226010500`
2. **Telnyx Network** → Routes to LiveKit SIP trunk
3. **Dispatch Rule** → Creates LiveKit room `ai-sales-call`
4. **AI Agent Joins** → Handles conversation
5. **Call Events** → Webhooks update database
6. **Call Completion** → Final status and summary stored

## Security Considerations

1. **Credentials Protection**
   - Store Telnyx credentials in environment variables
   - Use secure webhook endpoints with validation
   - Implement proper JWT authentication for API calls

2. **Customer Privacy**
   - Log only necessary call metadata
   - Implement opt-out functionality
   - Secure recording storage (if implemented)

3. **Rate Limiting**
   - Implement call rate limits to prevent abuse
   - Monitor suspicious calling patterns
   - Set maximum call duration limits

## Next Steps

1. **Complete Telnyx Portal Setup** (Manual steps above)
2. **Configure LiveKit API Credentials**
3. **Test Integration** with setup script
4. **Deploy to Production** with proper domain/SSL
5. **Monitor and Optimize** call quality and success rates

## Support Resources

- **Telnyx Documentation**: https://developers.telnyx.com/docs/voice/sip-trunking/livekit-configuration-guide
- **LiveKit SIP Docs**: https://docs.livekit.io/sip/
- **Support Ticket**: Telnyx #2327963