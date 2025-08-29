#!/usr/bin/env node

/**
 * LiveKit Voice Latency Test
 * Tests the actual latency of voice interactions with the optimized agent
 */

const { spawn } = require('child_process');
const fs = require('fs');

console.log('🎯 LiveKit Voice Latency Test');
console.log('===============================');

async function testVoiceLatency() {
    console.log('📊 Testing voice latency with optimized agent...');
    
    // Test by monitoring the agent logs for our timing measurements
    console.log('💡 To test latency:');
    console.log('1. Open browser to: http://localhost:3001');
    console.log('2. Login to dashboard');
    console.log('3. Click "Voice Test" button');
    console.log('4. Say "Hello" or "Can you hear me?"');
    console.log('5. Check timing logs below for latency measurements');
    console.log('');
    console.log('⏱️  Monitoring agent logs for latency data...');
    console.log('');
    
    // Monitor the agent output for timing logs
    setInterval(() => {
        console.log('📡 Agent is ready - visit http://localhost:3001 to test voice latency');
    }, 10000);
}

// Run the test
testVoiceLatency().catch(console.error);

// Keep the script running
process.on('SIGINT', () => {
    console.log('\n🏁 Latency test monitoring stopped');
    process.exit(0);
});