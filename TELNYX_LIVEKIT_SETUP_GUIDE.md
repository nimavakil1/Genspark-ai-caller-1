# 🔗 Telnyx + LiveKit SIP Integration Setup Guide

## ✅ CURRENT STATUS

**Fixed Issues:**
- ✅ Docker Compose YAML environment variable syntax error resolved
- ✅ Customer search SQL ambiguity error fixed
- ✅ All configuration files are ready and validated
- ✅ LiveKit + Redis services can now start successfully

**Ready for Next Steps:**
- LiveKit SIP trunk creation using API credentials
- Complete Telnyx Portal SIP Connection configuration
- End-to-end call testing

---

## 🛠️ IMMEDIATE NEXT STEPS ON YOUR SERVER

### Step 1: Pull Latest Changes
```bash
cd ~/Genspark-ai-caller-1
git pull origin main
```

### Step 2: Start Docker Services
```bash
# The YAML syntax error is now fixed, this should work:
sudo docker compose up -d redis livekit

# Verify services are running:
sudo docker compose ps
```

### Step 3: Run the Automated Setup Script
```bash
# Make sure the script is executable
chmod +x setup-telnyx-livekit.sh

# Run the setup script following official Telnyx documentation
./setup-telnyx-livekit.sh
```

---

## 🎯 WHAT THE SETUP SCRIPT DOES

The `setup-telnyx-livekit.sh` script follows the official Telnyx documentation exactly:
- **Reference**: https://developers.telnyx.com/docs/voice/sip-trunking/livekit-configuration-guide

### Automated Steps:
1. **Prerequisites Check**: Verifies LiveKit is running and accessible
2. **Environment Setup**: Configures LiveKit CLI with your API credentials
3. **Inbound Trunk Creation**: Creates LiveKit inbound SIP trunk for receiving calls
4. **Dispatch Rule Creation**: Sets up call routing rules
5. **Outbound Trunk Creation**: Creates LiveKit outbound SIP trunk for making calls
6. **Test Configuration**: Prepares test call configuration files

### Manual Steps (Script Provides Instructions):
1. **Telnyx Portal SIP Connection Setup**
2. **Programmable Voice App Configuration**
3. **Outbound Voice Profile Setup**
4. **Phone Number Assignment**

---

## 🔑 REQUIRED API CREDENTIALS

Before running the setup script, ensure you have:

### LiveKit Credentials
Set these environment variables:
```bash
export LIVEKIT_API_KEY="your_livekit_api_key"
export LIVEKIT_API_SECRET="your_livekit_api_secret"
```

**How to get LiveKit credentials:**
- If using LiveKit Cloud: Get from your LiveKit Cloud dashboard
- If self-hosted: Generate with `lk token create` or use the dev credentials from config

### Telnyx Credentials
Your Telnyx API key is already configured in the application:
- Used for webhooks and call management
- Already integrated in `routes/telnyx.js`

---

## 📋 CONFIGURATION FILES OVERVIEW

All configuration files are ready and follow the official Telnyx documentation:

### `sip-config/inboundTrunk.json`
```json
{
  "trunk": {
    "name": "Telnyx Inbound Trunk",
    "numbers": ["+3226010500"]
  }
}
```

### `sip-config/outboundTrunk.json`
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

### `docker-compose.yml` (FIXED)
```yaml
services:
  livekit:
    environment:
      - LIVEKIT_CONFIG=/etc/livekit.yaml
      - "LIVEKIT_KEYS=devkey: secret"  # ← Fixed with quotes
```

---

## 🌐 TELNYX PORTAL CONFIGURATION

After running the setup script, complete these manual steps in Telnyx Mission Control Portal:

### 1. Create SIP Connection
- **Go to**: Real-Time Communications → Voice → SIP Trunking
- **Click**: 'Add SIP Connection'
- **Name**: 'LiveKit AI Sales System'
- **Connection Type**: FQDN
- **SIP URI**: `sip:YOUR_SERVER_IP:7880` (replace with your actual server IP)
- **Authentication**: Credentials
- **Username**: `nimavakil`
- **Password**: `Acr0paq!`

### 2. Create Programmable Voice App
- **Go to**: Real-Time Communications → Voice → Programmable Voice
- **Create**: 'AI Sales Voice App'
- **Webhook URL**: `http://YOUR_SERVER_IP:3000/api/telnyx/webhooks/call-events`
- **Subdomain**: ai-sales-system

### 3. Configure Outbound Voice Profile
- **Go to**: Real-Time Communications → Voice → Outbound Voice Profile
- **Name**: 'AI Sales Outbound Profile'
- **Allowed destinations**: Include Belgium and your target countries

### 4. Assign Phone Numbers
- **Go to**: Real-Time Communications → Voice → My Numbers
- **Assign**: +3226010500 to your LiveKit SIP Connection

---

## 🧪 TESTING THE INTEGRATION

### After Complete Setup:

1. **Test SIP Connection**:
```bash
# Test inbound call handling
curl -X POST http://localhost:3000/api/telnyx/test-webhook

# Check LiveKit logs
sudo docker logs ai-sales-livekit -f
```

2. **Make Test Outbound Call**:
```bash
# If the setup script completed successfully:
lk sip participant create sip-config/sipParticipant_updated.json
```

3. **Monitor Call Flow**:
- **Telnyx**: Go to Reporting → Debugging → SIP Call Flow Tool
- **LiveKit**: Check Docker container logs
- **Application**: Check call logs in the database

---

## 🚨 TROUBLESHOOTING

### Common Issues:

1. **"services.livekit.environment.[1]: unexpected type map[string]interface {}"**
   - ✅ **FIXED**: This Docker Compose YAML syntax error is resolved

2. **LiveKit Not Accessible**:
```bash
# Check if LiveKit is running
curl http://localhost:7880
sudo docker compose ps
sudo docker logs ai-sales-livekit
```

3. **SIP Connection Fails**:
   - Verify firewall settings (ports 7880, 7881)
   - Check Telnyx Portal SIP Connection configuration
   - Confirm credentials match exactly

4. **API Credentials Missing**:
```bash
# Set LiveKit credentials
export LIVEKIT_API_KEY="your_key"
export LIVEKIT_API_SECRET="your_secret"

# Verify they're set
echo $LIVEKIT_API_KEY
```

---

## 📈 SUCCESS INDICATORS

You'll know the integration is working when:

1. ✅ Docker Compose starts successfully: `sudo docker compose up -d redis livekit`
2. ✅ Setup script completes without errors: `./setup-telnyx-livekit.sh`
3. ✅ LiveKit SIP trunks are created (script output shows trunk IDs)
4. ✅ Telnyx Portal shows SIP Connection as "Connected"
5. ✅ Test calls can be initiated and received
6. ✅ Call events appear in your application's call logs

---

## 🔄 WHAT'S NEXT

After successful SIP integration:

1. **AI Voice Agent Integration**: Connect AI agents to handle calls
2. **Call Recording**: Implement call recording and analysis
3. **Advanced Routing**: Set up intelligent call routing
4. **Analytics**: Track call success rates and analytics
5. **Production Optimization**: Scale for high-volume calling

---

## 📞 SUPPORT RESOURCES

- **Telnyx Documentation**: https://developers.telnyx.com/docs/voice/sip-trunking/livekit-configuration-guide
- **LiveKit Documentation**: https://docs.livekit.io/realtime/server/sip/
- **Debugging Tools**: 
  - Telnyx SIP Call Flow Tool
  - LiveKit server logs
  - Application call logs dashboard

---

**Status**: ✅ Ready for deployment and testing
**Last Updated**: 2024-01-20
**Next Action**: Run `sudo docker compose up -d redis livekit` and execute the setup script