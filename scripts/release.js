#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read package.json
const packagePath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

console.log('🚀 AI Sales System - Release Process');
console.log('═════════════════════════════════════════════════════');
console.log(`📦 Current Version: ${packageJson.version}`);
console.log('');

// Check if we're in a git repository
let isGitRepo = true;
try {
    execSync('git status', { stdio: 'pipe' });
} catch (error) {
    isGitRepo = false;
    console.log('⚠️  Not in a Git repository. Git operations will be skipped.');
}

// Generate changelog entry
const changelogEntry = {
    version: packageJson.version,
    date: new Date().toISOString().split('T')[0],
    changes: [
        '🎤 Added OpenAI Realtime Voice Conversation System',
        '🧠 Integrated AI Agent Brain with Knowledge Base',
        '📞 Real-time Audio Processing and Speech-to-Text',
        '🔊 Voice Activity Detection and Response Generation',
        '⚡ Improved Frontend JavaScript with Cache Busting',
        '🛡️ Enhanced Authentication and Session Management',
        '📊 Added Voice Test Session Management API',
        '🔧 Fixed Rate Limiting and Error Handling'
    ]
};

// Update or create CHANGELOG.md
const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
let changelogContent = '';

if (fs.existsSync(changelogPath)) {
    changelogContent = fs.readFileSync(changelogPath, 'utf8');
}

const newEntry = `
## [${changelogEntry.version}] - ${changelogEntry.date}

${changelogEntry.changes.map(change => `- ${change}`).join('\n')}
`;

// Add new entry to top of changelog
if (changelogContent.includes('# Changelog')) {
    changelogContent = changelogContent.replace('# Changelog\n', `# Changelog\n${newEntry}`);
} else {
    changelogContent = `# Changelog\n${newEntry}\n${changelogContent}`;
}

fs.writeFileSync(changelogPath, changelogContent);
console.log('📝 Updated CHANGELOG.md');

// Generate version.json
execSync('npm run version:info', { stdio: 'inherit' });

// Git operations (if in a git repo)
if (isGitRepo) {
    console.log('\n🔀 Git Operations:');
    
    try {
        // Add files to git
        execSync('git add .', { stdio: 'pipe' });
        console.log('✅ Added files to git');
        
        // Create commit
        const commitMessage = `chore: release v${packageJson.version}

${changelogEntry.changes.map(change => `- ${change.replace(/^[🎤🧠📞🔊⚡🛡️📊🔧]\s*/, '')}`).join('\n')}`;
        
        execSync(`git commit -m "${commitMessage}"`, { stdio: 'pipe' });
        console.log('✅ Created release commit');
        
        // Create tag
        execSync(`git tag -a v${packageJson.version} -m "Release v${packageJson.version}"`, { stdio: 'pipe' });
        console.log(`✅ Created tag v${packageJson.version}`);
        
        console.log('\n📋 Next Steps:');
        console.log('  1. Review the changes with: git log --oneline -5');
        console.log('  2. Push to remote with: git push origin main');
        console.log('  3. Push tags with: git push origin --tags');
        
    } catch (error) {
        console.log('⚠️  Git operations failed:', error.message);
        console.log('   You may need to commit manually');
    }
} else {
    console.log('\n📋 Manual Steps (No Git Repository):');
    console.log('  1. Initialize git: git init');
    console.log('  2. Add remote: git remote add origin <your-repo-url>');
    console.log('  3. Commit changes: git add . && git commit -m "Initial release"');
    console.log('  4. Push to remote: git push -u origin main');
}

console.log('\n🎉 Release process completed!');
console.log(`📦 Version ${packageJson.version} is ready for deployment`);