# LiveKit AI Agent System

## Overview
Complete LiveKit + SIP + Redis system for AI-powered calling with Shopify integration, deployed on Ubuntu server.

## 🚀 Quick Deploy to Ubuntu Server

### Method 1: Direct GitHub Clone (Recommended)
```bash
# On your Ubuntu server, run these commands:

# 1. Clone this repository
git clone https://github.com/nimavakil1/Genspark-ai-caller-1.git
cd Genspark-ai-caller-1

# 2. Run the automated deployment script
./deploy.sh
```

That's it! The script will handle everything automatically.

### Method 2: Manual Installation
```bash
# 1. Install Docker (if not installed)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Logout and login again

# 2. Install Docker Compose
sudo apt update
sudo apt install docker-compose-plugin

# 3. Clone and deploy
git clone https://github.com/nimavakil1/Genspark-ai-caller-1.git
cd Genspark-ai-caller-1
sudo mkdir -p /opt/livekit
sudo chown $USER:$USER /opt/livekit
cp -r . /opt/livekit/
cd /opt/livekit
docker compose up -d --build
```

## Components
- **LiveKit Server**: WebRTC platform for real-time communication  
- **AI Agent**: FastAPI service with OpenAI integration for conversations
- **Redis**: Session and state management
- **SIP Integration**: Telnyx trunk configuration for phone calls

## Configuration
Your OpenAI API key is already configured in the `.env` file.
Telnyx credentials are already set up:
- **Username**: nimavakil
- **Password**: Acr0paq!
- **Server**: sip.telnyx.com

## Service Endpoints (After Deployment)
- **LiveKit Server**: http://localhost:7880
- **AI Agent API**: http://localhost:8080  
- **Redis**: localhost:6379

## AI Agent Endpoints
- `GET /health` - Health check
- `GET /` - Service info  
- `POST /webhook/livekit` - LiveKit webhook handler
- `POST /test/openai` - Test OpenAI integration

## Testing After Deployment
```bash
# Test AI agent health
curl http://localhost:8080/health

# Test OpenAI integration
curl -X POST http://localhost:8080/test/openai \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello! Test message."}'
```

## Next Steps
1. Configure your Telnyx phone number in `livekit.yaml`
2. Set up webhook URLs in Telnyx dashboard  
3. Test phone call flow
4. Add Shopify integration
5. Set up n8n for workflow automation

## Troubleshooting
```bash
# View logs
docker compose logs -f

# Restart specific service  
docker compose restart ai-agent

# Check service status
docker compose ps
```

---
**Status**: ✅ Tested and Working  
**Last Updated**: Ready for production deployment