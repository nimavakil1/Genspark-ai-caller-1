#!/bin/bash

# AI Sales System - Safe Deployment Script
# This script safely deploys the latest version from GitHub with full verification

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/nimavakil1/Genspark-ai-caller-1.git"
APP_NAME="ai-sales-system"
DB_NAME="ai_sales_db"
DB_USER="ai_sales_user"
DEFAULT_DB_PASSWORD="secure_password_2024"
APP_PORT="3000"

# Functions
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

check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version 18+ required. Current version: $(node --version)"
        exit 1
    fi
    print_success "Node.js $(node --version) found"
    
    # Check if PostgreSQL is installed
    if ! command -v psql &> /dev/null; then
        print_error "PostgreSQL is not installed. Please install PostgreSQL first."
        exit 1
    fi
    print_success "PostgreSQL found"
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_warning "Docker not found. You'll need to install Redis manually."
    else
        print_success "Docker found"
    fi
    
    # Check if git is installed
    if ! command -v git &> /dev/null; then
        print_error "Git is not installed. Please install Git first."
        exit 1
    fi
    print_success "Git found"
}

create_backup() {
    print_status "Creating backup..."
    
    BACKUP_DIR="$HOME/ai-sales-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Backup existing project if it exists
    if [ -d "/var/www/$APP_NAME" ]; then
        print_status "Backing up existing project..."
        cp -r "/var/www/$APP_NAME" "$BACKUP_DIR/"
        print_success "Project backed up to $BACKUP_DIR"
    fi
    
    # Backup database
    print_status "Backing up database..."
    if pg_dump -h localhost -U "$DB_USER" "$DB_NAME" > "$BACKUP_DIR/database_backup.sql" 2>/dev/null; then
        print_success "Database backed up"
    else
        print_warning "Database backup failed (database might not exist yet)"
    fi
    
    echo "$BACKUP_DIR" > /tmp/ai-sales-backup-location
    print_success "Backup completed: $BACKUP_DIR"
}

setup_database() {
    print_status "Setting up PostgreSQL database..."
    
    # Check if database exists
    if ! sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        print_status "Creating database $DB_NAME..."
        sudo -u postgres createdb "$DB_NAME"
        print_success "Database $DB_NAME created"
    else
        print_success "Database $DB_NAME already exists"
    fi
    
    # Check if user exists
    if ! sudo -u postgres psql -t -c "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
        print_status "Creating database user $DB_USER..."
        sudo -u postgres createuser "$DB_USER"
        print_success "Database user $DB_USER created"
    else
        print_success "Database user $DB_USER already exists"
    fi
    
    # Set password and permissions
    print_status "Setting up database permissions..."
    sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DEFAULT_DB_PASSWORD';"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
    print_success "Database permissions configured"
}

clone_repository() {
    print_status "Cloning latest code from GitHub..."
    
    TEMP_DIR="$HOME/ai-sales-temp-$(date +%Y%m%d-%H%M%S)"
    
    if git clone "$REPO_URL" "$TEMP_DIR"; then
        print_success "Repository cloned to $TEMP_DIR"
        echo "$TEMP_DIR" > /tmp/ai-sales-temp-location
    else
        print_error "Failed to clone repository"
        exit 1
    fi
}

setup_environment() {
    TEMP_DIR=$(cat /tmp/ai-sales-temp-location)
    cd "$TEMP_DIR"
    
    print_status "Setting up environment configuration..."
    
    # Check if .env exists in backup
    BACKUP_DIR=$(cat /tmp/ai-sales-backup-location)
    if [ -f "$BACKUP_DIR/$APP_NAME/.env" ]; then
        print_status "Restoring existing .env configuration..."
        cp "$BACKUP_DIR/$APP_NAME/.env" .env
        print_success "Existing .env restored"
    else
        print_status "Creating new .env configuration..."
        cat > .env << EOF
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DEFAULT_DB_PASSWORD

# Server Configuration
PORT=$APP_PORT
NODE_ENV=production

# JWT Configuration
JWT_SECRET=ai_sales_jwt_secret_$(openssl rand -hex 32)
JWT_EXPIRES_IN=24h

# LiveKit Configuration (add your keys when ready)
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_WS_URL=wss://your-domain.livekit.cloud

# Telnyx Configuration (add your keys when ready)
TELNYX_API_KEY=your_telnyx_api_key
TELNYX_PUBLIC_KEY=your_telnyx_public_key

# Shopify Configuration (add your keys when ready)
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_STORE_URL=your-store.myshopify.com

# Brevo Configuration (add your keys when ready)
BREVO_API_KEY=your_brevo_api_key

# N8N Configuration
N8N_WEBHOOK_URL=http://localhost:5678/webhook

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads

# Logging
LOG_LEVEL=info
EOF
        print_success "New .env created with secure random JWT secret"
        print_warning "IMPORTANT: Edit .env file to add your API keys when ready"
    fi
}

install_dependencies() {
    TEMP_DIR=$(cat /tmp/ai-sales-temp-location)
    cd "$TEMP_DIR"
    
    print_status "Installing Node.js dependencies..."
    
    if npm install --production; then
        print_success "Dependencies installed successfully"
    else
        print_error "Failed to install dependencies"
        exit 1
    fi
}

test_database_connection() {
    TEMP_DIR=$(cat /tmp/ai-sales-temp-location)
    cd "$TEMP_DIR"
    
    print_status "Testing database connection..."
    
    # Test database connection
    if node -e "
        const { Pool } = require('pg');
        require('dotenv').config();
        
        const pool = new Pool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
        });
        
        pool.connect((err, client, release) => {
            if (err) {
                console.error('Connection failed:', err.message);
                process.exit(1);
            } else {
                console.log('Database connection successful');
                release();
                pool.end();
                process.exit(0);
            }
        });
    " 2>/dev/null; then
        print_success "Database connection successful"
    else
        print_error "Database connection failed"
        print_error "Please check your database configuration in .env"
        exit 1
    fi
}

run_database_migration() {
    TEMP_DIR=$(cat /tmp/ai-sales-temp-location)
    cd "$TEMP_DIR"
    
    print_status "Running database migrations..."
    
    if npm run db:migrate; then
        print_success "Database migration completed"
    else
        print_error "Database migration failed"
        exit 1
    fi
}

seed_database() {
    TEMP_DIR=$(cat /tmp/ai-sales-temp-location)
    cd "$TEMP_DIR"
    
    print_status "Would you like to seed the database with sample data?"
    print_warning "This includes creating an admin user (admin/admin123) and sample customers."
    
    read -p "Seed database? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Seeding database..."
        if npm run db:seed; then
            print_success "Database seeded successfully"
            print_warning "Default admin credentials: admin / admin123"
            print_warning "CHANGE THE ADMIN PASSWORD AFTER FIRST LOGIN!"
        else
            print_error "Database seeding failed"
            exit 1
        fi
    else
        print_status "Skipping database seeding"
    fi
}

start_docker_services() {
    TEMP_DIR=$(cat /tmp/ai-sales-temp-location)
    cd "$TEMP_DIR"
    
    if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
        print_status "Starting Docker services (Redis, LiveKit)..."
        if docker-compose up -d; then
            print_success "Docker services started"
        else
            print_warning "Docker services failed to start (you may need to install Redis manually)"
        fi
    else
        print_warning "Docker not available - you'll need to set up Redis manually"
    fi
}

test_application() {
    TEMP_DIR=$(cat /tmp/ai-sales-temp-location)
    cd "$TEMP_DIR"
    
    print_status "Testing application startup..."
    
    # Kill any existing process on the port
    pkill -f "node.*server.js" 2>/dev/null || true
    sleep 2
    
    # Start application in background
    timeout 30s npm start > /tmp/ai-sales-test.log 2>&1 &
    APP_PID=$!
    
    # Wait for startup
    sleep 10
    
    # Test health endpoint
    if curl -f "http://localhost:$APP_PORT/health" > /dev/null 2>&1; then
        print_success "Application is responding on port $APP_PORT"
        kill $APP_PID 2>/dev/null || true
    else
        print_error "Application is not responding"
        print_error "Check logs: tail /tmp/ai-sales-test.log"
        kill $APP_PID 2>/dev/null || true
        exit 1
    fi
    
    # Test login page
    if curl -f "http://localhost:$APP_PORT/login" > /dev/null 2>&1; then
        print_success "Login page is accessible"
    else
        print_error "Login page is not accessible"
        exit 1
    fi
}

deploy_to_production() {
    TEMP_DIR=$(cat /tmp/ai-sales-temp-location)
    
    print_status "Deploying to production..."
    
    # Stop existing application
    print_status "Stopping existing application..."
    pkill -f "node.*server.js" 2>/dev/null || true
    if command -v pm2 &> /dev/null; then
        pm2 delete all 2>/dev/null || true
    fi
    
    # Create production directory
    sudo mkdir -p /var/www
    
    # Move old version to backup (if exists)
    if [ -d "/var/www/$APP_NAME" ]; then
        sudo mv "/var/www/$APP_NAME" "/var/www/$APP_NAME-backup-$(date +%Y%m%d-%H%M%S)"
        print_success "Old version backed up"
    fi
    
    # Move new version to production
    sudo mv "$TEMP_DIR" "/var/www/$APP_NAME"
    sudo chown -R $USER:$USER "/var/www/$APP_NAME"
    
    print_success "Application deployed to /var/www/$APP_NAME"
}

start_production_app() {
    print_status "Starting production application..."
    
    cd "/var/www/$APP_NAME"
    
    # Create uploads directory
    mkdir -p uploads
    
    if command -v pm2 &> /dev/null; then
        print_status "Starting with PM2..."
        pm2 start src/server.js --name "$APP_NAME"
        pm2 save
        print_success "Application started with PM2"
    else
        print_status "Starting with npm..."
        nohup npm start > /var/log/$APP_NAME.log 2>&1 &
        sleep 3
        print_success "Application started in background"
        print_status "Logs: tail -f /var/log/$APP_NAME.log"
    fi
}

final_verification() {
    print_status "Performing final verification..."
    
    sleep 5
    
    # Test application
    if curl -f "http://localhost:$APP_PORT/health" > /dev/null 2>&1; then
        print_success "✅ Application is running successfully!"
    else
        print_error "❌ Application is not responding after deployment"
        exit 1
    fi
    
    # Test login page
    if curl -f "http://localhost:$APP_PORT/login" > /dev/null 2>&1; then
        print_success "✅ Login page is accessible"
    else
        print_error "❌ Login page is not accessible"
        exit 1
    fi
}

cleanup() {
    print_status "Cleaning up temporary files..."
    
    if [ -f /tmp/ai-sales-temp-location ]; then
        TEMP_DIR=$(cat /tmp/ai-sales-temp-location)
        if [ -d "$TEMP_DIR" ]; then
            rm -rf "$TEMP_DIR"
        fi
        rm -f /tmp/ai-sales-temp-location
    fi
    
    rm -f /tmp/ai-sales-test.log
    rm -f /tmp/ai-sales-backup-location
    
    print_success "Cleanup completed"
}

show_completion_info() {
    print_success "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!"
    echo
    print_status "📋 Application Information:"
    echo "   • URL: http://$(hostname -I | awk '{print $1}'):$APP_PORT"
    echo "   • Login URL: http://$(hostname -I | awk '{print $1}'):$APP_PORT/login"
    echo "   • Health Check: http://$(hostname -I | awk '{print $1}'):$APP_PORT/health"
    echo
    print_status "🔑 Default Admin Credentials:"
    echo "   • Username: admin"
    echo "   • Password: admin123"
    echo "   • ⚠️  CHANGE PASSWORD AFTER FIRST LOGIN!"
    echo
    print_status "📁 Application Location: /var/www/$APP_NAME"
    print_status "🔧 Configuration File: /var/www/$APP_NAME/.env"
    echo
    print_status "📊 Next Steps:"
    echo "   1. Access the application and change admin password"
    echo "   2. Configure API keys in .env file for integrations"
    echo "   3. Set up LiveKit + Telnyx for AI calling"
    echo "   4. Configure Shopify integration"
    echo "   5. Set up Brevo for WhatsApp/email"
}

# Main execution
main() {
    echo "🚀 AI Sales System - Safe Deployment Script"
    echo "=============================================="
    echo
    
    # Trap cleanup on exit
    trap cleanup EXIT
    
    check_prerequisites
    create_backup
    setup_database
    clone_repository
    setup_environment
    install_dependencies
    test_database_connection
    run_database_migration
    seed_database
    start_docker_services
    test_application
    deploy_to_production
    start_production_app
    final_verification
    show_completion_info
    
    print_success "✅ All steps completed successfully!"
}

# Run main function
main "$@"