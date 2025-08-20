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
- **AI Integration**: LiveKit + Telnyx SIP (pending implementation)
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
- Docker Compose setup for Redis and LiveKit
- Comprehensive error handling and logging

## Features Pending ⏳
- LiveKit + Telnyx SIP integration for AI calling
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
4. **Call Management**: Log and track customer calls (AI integration pending)
5. **Product Management**: Manage receipt roll inventory
6. **Orders**: Track sales and order fulfillment

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
docker-compose up -d

# 8. Start the application
npm start
# or for development:
npm run dev

# 9. Access the application
# Open browser to http://your-server-ip:3000
# Login with: admin / admin123
```

### Update from GitHub

```bash
# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Run any new migrations
npm run db:migrate

# Restart the application
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

## Next Development Priorities
1. Complete LiveKit + Telnyx integration for AI calling
2. Implement Shopify product synchronization
3. Set up Brevo WhatsApp/email automation
4. Deploy N8N workflow automation
5. Add advanced analytics and reporting
6. Production deployment with SSL certificates