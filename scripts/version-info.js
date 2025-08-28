#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read package.json
const packagePath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

// Get Git info if available
let gitInfo = {};
try {
    const { execSync } = require('child_process');
    gitInfo = {
        branch: execSync('git branch --show-current', { encoding: 'utf8' }).trim(),
        commit: execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(),
        tag: execSync('git describe --tags --abbrev=0 2>/dev/null || echo "none"', { encoding: 'utf8' }).trim()
    };
} catch (error) {
    gitInfo = {
        branch: 'unknown',
        commit: 'unknown', 
        tag: 'none'
    };
}

// Version info
const versionInfo = {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    buildDate: new Date().toISOString(),
    nodeVersion: process.version,
    git: gitInfo
};

console.log('📊 AI Sales System - Version Information');
console.log('═══════════════════════════════════════════════════════');
console.log(`📦 Name: ${versionInfo.name}`);
console.log(`🔢 Version: ${versionInfo.version}`);
console.log(`📝 Description: ${versionInfo.description}`);
console.log(`📅 Build Date: ${versionInfo.buildDate}`);
console.log(`🟢 Node.js: ${versionInfo.nodeVersion}`);
console.log('');
console.log('🔀 Git Information:');
console.log(`  Branch: ${versionInfo.git.branch}`);
console.log(`  Commit: ${versionInfo.git.commit}`);
console.log(`  Latest Tag: ${versionInfo.git.tag}`);
console.log('');

// Feature list based on current version
const features = [
    '✅ JWT Authentication System',
    '✅ PostgreSQL Database Integration', 
    '✅ AI Agent Management',
    '✅ Knowledge Base System',
    '✅ OpenAI Realtime Voice Conversations',
    '✅ Telnyx Phone Integration',
    '✅ LiveKit Audio Streaming',
    '✅ Real-time Voice Testing',
    '✅ Customer Management',
    '✅ Call Logging & Analytics',
    '✅ Dashboard Interface'
];

console.log('🚀 Current Features:');
features.forEach(feature => console.log(`  ${feature}`));
console.log('');

// Save version info to file
const versionFilePath = path.join(__dirname, '..', 'version.json');
fs.writeFileSync(versionFilePath, JSON.stringify(versionInfo, null, 2));
console.log(`💾 Version info saved to: ${versionFilePath}`);