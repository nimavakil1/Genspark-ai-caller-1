#!/usr/bin/env node

// Simple test script for Telnyx Voice Integration

const TelnyxVoiceIntegration = require('./telnyxVoiceIntegration');

async function testTelnyx() {
    console.log('🧪 Testing Telnyx Voice Integration...');
    
    try {
        const integration = new TelnyxVoiceIntegration();
        
        console.log('📋 Configuration check:');
        console.log(`   API Key: ${process.env.TELNYX_API_KEY ? '✅ Set' : '❌ Missing'}`);
        console.log(`   Connection ID: ${process.env.TELNYX_CONNECTION_ID ? '✅ Set' : '❌ Missing'}`);
        console.log(`   Phone Number: ${process.env.TELNYX_PHONE_NUMBER || '+3226010500'}`);
        console.log(`   Test Number: ${process.env.TEST_PHONE_NUMBER || '+32479202020'}`);
        
        if (!process.env.TELNYX_API_KEY) {
            console.log('❌ TELNYX_API_KEY not set in environment');
            console.log('💡 Set it in your .env file: TELNYX_API_KEY=your_actual_api_key');
            process.exit(1);
        }
        
        console.log('\n📞 Attempting test outbound call...');
        const testNumber = process.env.TEST_PHONE_NUMBER || '+32479202020';
        
        const call = await integration.makeOutboundCall(testNumber);
        
        console.log('✅ Test call initiated successfully!');
        console.log(`📞 Call ID: ${call.call_control_id}`);
        console.log(`📱 From: ${call.from}`);
        console.log(`📱 To: ${call.to}`);
        
    } catch (error) {
        console.log('❌ Test call failed:');
        console.log(`   Error: ${error.message}`);
        
        if (error.response && error.response.data) {
            console.log('   Details:', JSON.stringify(error.response.data, null, 2));
        }
        
        // Common error scenarios
        if (error.message.includes('401')) {
            console.log('💡 This is likely an API key authentication issue');
        } else if (error.message.includes('403')) {
            console.log('💡 This might be a permissions or connection ID issue');
        } else if (error.message.includes('Connection')) {
            console.log('💡 Check your TELNYX_CONNECTION_ID in .env file');
        }
    }
}

// Run the test
testTelnyx();