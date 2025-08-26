# AI Sales System

## Project Overview
- **Name**: AI Sales System for Receipt Rolls
- **Goal**: Complete AI-powered sales management system with phone integration for selling receipt rolls to Belgian businesses
- **Features**: Customer management, AI call handling, sales analytics, Shopify integration, European CSV support

## URLs
- **Production**: Will be deployed on your server
- **GitHub**: https://github.com/nimavakil1/Genspark-ai-caller-1

## Technology Stack
- **Backend**: Node.js + Express.js + PostgreSQL 17
- **Frontend**: EJS templating + Bootstrap 5 + FontAwesome
- **Real-time**: Socket.IO for live updates
- **Authentication**: JWT with bcryptjs
- **File Upload**: Multer with CSV parsing
- **AI Integration**: LiveKit + Telnyx SIP + OpenAI Realtime API
- **European Standards**: Semicolon-separated CSV, comma decimal separator

## Data Architecture
- **Database**: PostgreSQL 17 with comprehensive schema
- **Main Tables**: 
  - `customers` (with separate invoice/delivery addresses)
  - `call_logs` (AI call management)
  - `products` (receipt roll inventory)
  - `orders` & `order_items` (sales management)
  - `admin_users` (system authentication)
  - `delivery_addresses` (multi-address support)
  - `whatsapp_messages` (Brevo integration ready)
  - `sync_logs` (Shopify integration ready)
  - `agents` (AI agent management with custom prompts)
  - `agent_knowledge` (Knowledge base for AI agents)

## Features Completed ✅
- Complete PostgreSQL database schema with European business requirements
- JWT authentication system with secure password hashing
- Customer management with invoice/delivery address separation
- European CSV format support (semicolon-separated)
- Customer import/export functionality
- Dashboard with real-time statistics
- Responsive Bootstrap 5 interface
- Call logging system (ready for AI integration)
- Product management system
- Order management foundation
- Docker Compose setup for Redis and LiveKit (YAML syntax fixed)
- Telnyx API integration routes for outbound calling
- LiveKit SIP configuration files for inbound/outbound trunks
- Automated setup script following official Telnyx documentation
- Comprehensive error handling and logging
- **AI Agent Management System** with custom prompts and knowledge bases
- **OpenAI Realtime API Integration** for intelligent voice conversations
- **LiveKit + OpenAI Integration** for real-time audio processing and AI responses
- Real-time agent session monitoring in dashboard
- WebSocket-based OpenAI conversation handling
- **Language Verification System** - Automatic language detection and agent switching
- **Automatic Turn-Taking** - Voice activity detection for natural conversations
- **Multi-Language Support** - 6 languages (EN, FR, NL, DE, ES, IT)
- **Smart Port Detection** - Automatic free port selection for deployment

## Features Pending ⏳
- LiveKit SIP trunk creation and testing (Docker Compose ready)
- Complete Telnyx Portal configuration (SIP Connection setup)
- Production OpenAI API key configuration for live conversations
- Shopify API integration for product sync
- Brevo integration for WhatsApp/email automation
- N8N workflow automation setup
- Call recording and AI analysis
- Advanced analytics and reporting
- Production deployment with Nginx + SSL

## User Guide
1. **Login**: Access the system at `/login` with admin credentials
2. **Dashboard**: View overview statistics and recent activities
3. **Customer Management**: 
   - Add customers manually or via CSV upload
   - Support for separate invoice and delivery addresses
   - European format CSV import/export
   - Filter by receipt roll usage
4. **Call Management**: Log and track customer calls with AI integration
5. **AI Agents**: Create and manage AI agents with custom prompts and knowledge bases
6. **Intelligent Calling**: Test AI agents with real-time conversation monitoring
7. **Product Management**: Manage receipt roll inventory
8. **Orders**: Track sales and order fulfillment

## Installation & Deployment

### Prerequisites
- Node.js 18+
- PostgreSQL 17
- Redis (via Docker)
- Git

### Server Deployment Commands

```bash
# 1. Clone the repository
git clone https://github.com/nimavakil1/Genspark-ai-caller-1.git
cd Genspark-ai-caller-1

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env
# Edit .env with your database credentials and API keys

# 4. Setup PostgreSQL database
sudo -u postgres createdb ai_sales_db
sudo -u postgres createuser ai_sales_user
sudo -u postgres psql -c "ALTER USER ai_sales_user WITH PASSWORD 'secure_password_2024';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ai_sales_db TO ai_sales_user;"

# 5. Run database migrations
npm run db:migrate

# 6. Seed database with sample data
npm run db:seed

# 7. Start Redis and LiveKit services
docker-compose up -d redis livekit

# 8. Start the application
npm start
# or with automatic port detection (recommended):
npm run start:auto
# or for development:
npm run dev

# 9. Access the application
# Open browser to http://your-server-ip:3000
# Login with: admin / admin123

## Telnyx + LiveKit SIP Integration Setup

**CURRENT STATUS**: ✅ Docker Compose YAML fixed, ready for SIP trunk creation

### Quick Start for SIP Integration

```bash
# 1. Ensure Docker services are running
sudo docker compose up -d redis livekit

# 2. Run the automated setup script
chmod +x setup-telnyx-livekit.sh
./setup-telnyx-livekit.sh

# 3. Complete manual Telnyx Portal configuration (see script output)
# 4. Test the integration
```

### Configuration Files Ready:
- ✅ `docker-compose.yml` - LiveKit + Redis orchestration (syntax fixed)
- ✅ `livekit-simple.yaml` - LiveKit configuration with Redis
- ✅ `sip-config/inboundTrunk.json` - Inbound SIP trunk config
- ✅ `sip-config/outboundTrunk.json` - Outbound SIP trunk config
- ✅ `sip-config/dispatchRule.json` - Call routing configuration
- ✅ `sip-config/sipParticipant.json` - Test call configuration
- ✅ `routes/telnyx.js` - Complete API integration routes
- ✅ `setup-telnyx-livekit.sh` - Automated setup following official docs
```

### Smart Port Detection & Startup

**NEW**: The system now includes automatic port detection to avoid conflicts!

```bash
# Recommended startup method (finds free port automatically)
npm run start:auto

# Traditional startup (uses specified PORT or 3001)
npm start
```

**Benefits of `start:auto`:**
- ✅ Automatically finds next available port starting from 3001
- ✅ No more "port already in use" errors
- ✅ Shows exactly which port was chosen
- ✅ Perfect for development and production deployment

### Update from GitHub

```bash
# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Run any new migrations (automatic on restart)
npm run db:migrate

# Restart with smart port detection
npm run start:auto

# Or restart with PM2
pm2 restart all
# or if using systemd:
sudo systemctl restart ai-sales-system
```

## Default Credentials
- **Username**: admin
- **Password**: admin123
- **Email**: admin@example.com

⚠️ **IMPORTANT**: Change the default admin password immediately after first login!

## Environment Variables
Key environment variables to configure in `.env`:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_sales_db
DB_USER=ai_sales_user
DB_PASSWORD=secure_password_2024

# Server
PORT=3000
NODE_ENV=production

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production

# LiveKit (for AI calling)
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret

# Telnyx (for SIP integration)
TELNYX_API_KEY=your_telnyx_api_key

# OpenAI (for AI conversations)
OPENAI_API_KEY=your_openai_api_key

# Shopify (for future integration)
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret

# Brevo (for WhatsApp/Email)
BREVO_API_KEY=your_brevo_api_key
```

## Development
- **Start Development**: `npm run dev` (uses nodemon)
- **Database Migration**: `npm run db:migrate`
- **Database Seeding**: `npm run db:seed`
- **Logs**: Check console output or PM2 logs

## Support
- All customer data supports European business practices
- Belgian VAT number format support
- Semicolon-separated CSV files (European standard)
- Multi-address customer support (invoice vs delivery)
- Receipt roll targeting for Belgian businesses

## Deployment Status
- **Platform**: Self-hosted server
- **Status**: ✅ Ready for deployment
- **Tech Stack**: Node.js + PostgreSQL + Docker + Nginx (production)
- **Last Updated**: 2024-01-20

## OpenAI Realtime API Integration 🧠

**STATUS**: ✅ Fully Integrated - Ready for production with valid API key

### Features
- **Real-time AI Conversations**: WebSocket-based connection to OpenAI Realtime API
- **Agent Management**: Create AI agents with custom system prompts and knowledge bases
- **Dynamic Instructions**: Build conversation context from agent prompts and customer data
- **Session Monitoring**: Real-time dashboard monitoring of AI conversations
- **Conversation History**: Track and store conversation messages and responses
- **Error Handling**: Robust error handling for WebSocket connections and API responses

### AI Agent System
- **Custom Prompts**: Define system instructions for each AI agent
- **Knowledge Base**: Attach product information and company knowledge to agents
- **Voice Settings**: Configure voice characteristics for different agents
- **Test Conversations**: Test agent responses with simulated conversations

### API Endpoints
- `GET /api/openai-sessions` - List all active OpenAI sessions
- `GET /api/openai-sessions/:callControlId` - Get specific session details
- `GET /api/openai-sessions/:callControlId/conversation` - Get conversation history
- `POST /api/openai-sessions/:callControlId/message` - Send message to AI session
- `POST /api/openai-sessions/test` - Test AI agent conversation
- `DELETE /api/openai-sessions/:sessionId` - End AI session

### Integration Flow
1. **Agent Test Call**: Dashboard initiates test call with selected agent
2. **OpenAI Session Creation**: Creates real-time WebSocket connection to OpenAI
3. **System Instructions**: Builds context from agent prompt + knowledge base + customer data
4. **Live Monitoring**: Dashboard shows both LiveKit and OpenAI session status
5. **Conversation Tracking**: All messages and responses stored and monitored
6. **Session Cleanup**: Automatic cleanup of resources when call ends

### Dashboard Features
- **Dual Session Monitoring**: Track both LiveKit (audio) and OpenAI (AI) sessions
- **Real-time Status Updates**: Live updates of session status and message counts
- **Agent Configuration**: Create and manage AI agents with custom settings
- **Knowledge Management**: Attach and manage knowledge base content for agents
- **Test Interface**: Test AI agents with simulated conversations

## Language Verification System 🌍

**STATUS**: ✅ Fully Implemented - Multi-language AI agent support with automatic switching

### Features
- **Automatic Language Detection**: Detects customer language from speech patterns
- **Smart Agent Switching**: Seamlessly switches to agents that speak detected language
- **6 Language Support**: English, French, Dutch, German, Spanish, Italian
- **Automatic Turn-Taking**: Voice activity detection eliminates manual microphone controls
- **30-Second Timeout**: Conversations auto-end after inactivity
- **Multi-Agent Rooms**: Multiple agents in same LiveKit room for seamless handover

### How It Works
1. **Customer Speaks** → System detects language automatically
2. **Language Mismatch** → UI suggests switching to appropriate language agent  
3. **User Confirms** → Seamlessly switches agents without losing conversation context
4. **Conversation Continues** → In correct language with natural turn-taking
5. **Auto-End** → After 30 seconds of silence or manual end

### Voice Testing Interface
- **No Manual Buttons**: Automatic voice activity detection
- **Real-time Indicators**: Animated voice activity indicators
- **Language Verification**: Live language detection and switching UI
- **Localized Welcomes**: Welcome messages in customer's detected language

### API Endpoints
- `POST /api/language/detect` - Detect language from speech text
- `GET /api/language/agents?language=en` - Get agents by language
- `POST /api/language/verify-customer` - Verify customer language settings
- `POST /api/language/confirm-customer` - Confirm customer language
- `GET /api/language/best-agent/:customerId` - Get optimal agent for customer

### Agent Management
- **Language Selection**: Each agent has a supported language (EN, FR, NL, DE, ES, IT)
- **Voice Configuration**: Separate voice language and conversation language
- **Agent Switching**: Runtime switching between agents based on customer needs
- **Knowledge Base**: Language-specific knowledge and responses

## Next Development Priorities
1. Complete LiveKit + Telnyx integration for AI calling
2. Configure production OpenAI API key for live conversations  
3. Implement local TTS/STT for reduced latency (Whisper, Coqui TTS)
4. Implement Shopify product synchronization
5. Set up Brevo WhatsApp/email automation
6. Deploy N8N workflow automation
7. Add advanced analytics and reporting
8. Production deployment with SSL certificates