#!/bin/bash

# Setup SSL for LiveKit with ai.acropaq.com
echo "🔐 Setting up SSL for LiveKit with ai.acropaq.com..."

# Install nginx if not present
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# Get SSL certificate for ai.acropaq.com
echo "📜 Obtaining SSL certificate..."
sudo certbot certonly --nginx -d ai.acropaq.com

# Copy nginx configuration
echo "🔧 Setting up nginx configuration..."
sudo cp nginx-livekit.conf /etc/nginx/sites-available/livekit-ssl

# Update the nginx config with correct SSL paths
sudo sed -i 's|/etc/ssl/certs/ai.acropaq.com.crt|/etc/letsencrypt/live/ai.acropaq.com/fullchain.pem|g' /etc/nginx/sites-available/livekit-ssl
sudo sed -i 's|/etc/ssl/private/ai.acropaq.com.key|/etc/letsencrypt/live/ai.acropaq.com/privkey.pem|g' /etc/nginx/sites-available/livekit-ssl

# Enable the site
sudo ln -sf /etc/nginx/sites-available/livekit-ssl /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
sudo systemctl enable nginx

echo "✅ SSL setup complete!"
echo "🌐 Your app should now be accessible at: https://ai.acropaq.com"
echo "🔒 LiveKit WebSocket will use WSS through nginx proxy"