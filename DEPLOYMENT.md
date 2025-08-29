# 🚀 AI Sales System - Stable Architecture Deployment Guide

## 📋 **Prerequisites**

Before deploying, ensure you have:
- Node.js 18+ installed
- Python 3.13+ with virtual environment
- PM2 process manager: `npm install -g pm2`
- LiveKit server binary (download from [LiveKit releases](https://github.com/livekit/livekit/releases))

## ⚡ **Quick Deployment**

### **1. Pull Latest Code**
```bash
ssh ubuntu@51.195.41.57
cd ~/Genspark-ai-caller-1
git pull origin main
```

### **2. Install Dependencies**
```bash
# Install Node.js dependencies
npm install

# Install PM2 globally if not already installed
npm install -g pm2

# Activate Python virtual environment
source livekit-env/bin/activate

# Install Python dependencies (if needed)
pip install -r requirements.txt
```

### **3. Configure Environment**
```bash
# Edit .env file with your actual API keys
nano .env

# Update these values:
OPENAI_API_KEY=sk-proj-your-actual-openai-key-here
LIVEKIT_API_KEY=stable_key_2024
LIVEKIT_API_SECRET=stable_secret_that_is_long_enough_for_livekit_requirements_32chars
```

### **4. Start System**
```bash
# One command starts everything!
./start-system.sh
```

## 🏗️ **Architecture Overview**

### **Unified Configuration**
- **Single `.env` file** controls all services
- **Consistent API keys** across all components
- **No authentication mismatches**

### **Service Management with PM2**
```
┌─ livekit-server     (Port 7880)
├─ main-app           (Port 3001) 
└─ livekit-agent      (Python process)
```

### **Auto-Recovery Features**
- **Automatic restarts** on failure
- **Health monitoring** every 10 seconds
- **Dependency management** - services start in correct order
- **Centralized logging** in `./logs/` directory

## 🛠️ **System Management Commands**

### **Start/Stop System**
```bash
./start-system.sh      # Start all services
./stop-system.sh       # Stop all services gracefully
./health-check.sh      # Check system health
```

### **PM2 Management**
```bash
pm2 status             # View service status
pm2 logs               # View all logs
pm2 logs main-app      # View specific service logs
pm2 restart all        # Restart all services
pm2 reload all         # Zero-downtime reload
pm2 monit              # Real-time monitoring
```

### **Individual Service Control**
```bash
pm2 restart livekit-server
pm2 stop livekit-agent
pm2 start main-app
```

## 🔍 **Troubleshooting**

### **Check System Health**
```bash
./health-check.sh
```

### **View Service Logs**
```bash
pm2 logs                    # All services
pm2 logs --lines 100        # Last 100 lines
tail -f logs/main-app-error.log    # Specific error logs
```

### **Common Issues & Solutions**

**❌ Service won't start:**
```bash
pm2 delete all
pm2 start ecosystem.config.js
```

**❌ Authentication errors:**
```bash
# Check if all services use same API keys
grep -r "LIVEKIT_API_KEY" .env livekit.yaml ecosystem.config.js
```

**❌ Port conflicts:**
```bash
sudo lsof -i :3001   # Check what's using port 3001
sudo lsof -i :7880   # Check what's using port 7880
```

## 🌐 **Access Your Application**

Once deployed:
- **Main Application**: http://51.195.41.57:3001
- **System Health**: Run `./health-check.sh`

## 📊 **Monitoring & Logs**

### **Log Files Location**
```
logs/
├── main-app-combined.log
├── livekit-server-combined.log
├── livekit-agent-combined.log
├── main-app-error.log
├── livekit-server-error.log
└── livekit-agent-error.log
```

### **Real-time Monitoring**
```bash
pm2 monit               # PM2 built-in monitoring
watch ./health-check.sh # Auto-refresh health check
```

## 🔧 **Configuration Files**

- **`.env`** - Environment variables for all services
- **`livekit.yaml`** - LiveKit server configuration
- **`ecosystem.config.js`** - PM2 process configuration

## ✅ **Production Checklist**

- [ ] All services start successfully
- [ ] Health check passes
- [ ] Voice functionality works in browser
- [ ] Logs are being written correctly
- [ ] Auto-restart works (test with `pm2 stop main-app`)
- [ ] System survives server reboot

## 🆘 **Emergency Recovery**

If system is completely down:
```bash
./stop-system.sh        # Clean shutdown
./start-system.sh       # Fresh start
./health-check.sh       # Verify recovery
```

This stable architecture ensures your AI Sales System runs reliably with automatic recovery from failures!