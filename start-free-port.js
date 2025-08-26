const net = require('net');

/**
 * Smart Port Detection Script
 * Automatically finds a free port and starts the AI Sales Server
 */

function findFreePort(startPort = 3001) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    
    server.on('error', () => {
      // Port is busy, try next one
      findFreePort(startPort + 1).then(resolve);
    });
  });
}

async function startServer() {
  try {
    console.log('🔍 Scanning for available port...');
    
    const freePort = await findFreePort(3001);
    
    console.log(`✅ Found free port: ${freePort}`);
    console.log(`🚀 Starting AI Sales Server on port ${freePort}`);
    console.log(`📊 Dashboard will be available at: http://localhost:${freePort}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Set the port environment variable
    process.env.PORT = freePort;
    
    // Start the server
    require('./src/server.js');
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Gracefully shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Gracefully shutting down server...');
  process.exit(0);
});

// Start the server with auto port detection
startServer();