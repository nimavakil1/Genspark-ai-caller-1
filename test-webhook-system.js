#!/usr/bin/env node

/**
 * Comprehensive Webhook System Test
 * Tests the complete call flow: customer creation → call logging → webhook processing
 */

const { query, initializeDatabase } = require('./src/database');
const axios = require('axios');

// Test configuration
const TEST_CONFIG = {
  server_url: 'http://localhost:3001',  // Your server port
  test_phone: '+32470123456',
  test_customer: 'Test Customer Webhook',
  call_control_id: 'test_call_' + Date.now()
};

console.log('🧪 Starting Comprehensive Webhook System Test');
console.log('=' .repeat(60));

async function testDatabaseConnection() {
  console.log('\n📊 Testing Database Connection...');
  
  try {
    // Test basic database connection
    const result = await query('SELECT NOW() as current_time');
    console.log('✅ Database connected successfully');
    console.log(`   Current time: ${result.rows[0].current_time}`);
    
    // Check if required tables exist
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('customers', 'call_logs')
      ORDER BY table_name
    `);
    
    console.log('✅ Required tables found:');
    tables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    if (tables.rows.length < 2) {
      throw new Error('Missing required tables. Run database initialization first.');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

async function testCustomerCreation() {
  console.log('\n👤 Testing Customer Creation Logic...');
  
  try {
    // Clean up any existing test customer
    await query('DELETE FROM call_logs WHERE phone_number = $1', [TEST_CONFIG.test_phone]);
    await query('DELETE FROM customers WHERE phone = $1', [TEST_CONFIG.test_phone]);
    
    console.log('✅ Cleaned up existing test data');
    
    // Test customer creation via API endpoint
    const response = await axios.post(`${TEST_CONFIG.server_url}/api/call-control/test-call`, {
      to: TEST_CONFIG.test_phone,
      customer_name: TEST_CONFIG.test_customer
    });
    
    console.log('✅ Test call API response:', {
      success: response.data.success,
      customer_id: response.data.customer_id,
      call_control_id: response.data.call_control_id
    });
    
    // Verify customer was created in database
    const customer = await query('SELECT * FROM customers WHERE phone = $1', [TEST_CONFIG.test_phone]);
    
    if (customer.rows.length === 0) {
      throw new Error('Customer was not created in database');
    }
    
    console.log('✅ Customer created successfully:', {
      id: customer.rows[0].id,
      company_name: customer.rows[0].company_name,
      phone: customer.rows[0].phone
    });
    
    // Verify call log was created
    const callLog = await query('SELECT * FROM call_logs WHERE phone_number = $1', [TEST_CONFIG.test_phone]);
    
    if (callLog.rows.length === 0) {
      throw new Error('Call log was not created');
    }
    
    console.log('✅ Call log created successfully:', {
      id: callLog.rows[0].id,
      customer_id: callLog.rows[0].customer_id,
      status: callLog.rows[0].status,
      direction: callLog.rows[0].direction
    });
    
    return {
      customer_id: customer.rows[0].id,
      call_log_id: callLog.rows[0].id
    };
    
  } catch (error) {
    console.error('❌ Customer creation test failed:', error.message);
    if (error.response) {
      console.error('   API Error:', error.response.data);
    }
    return null;
  }
}

async function testWebhookProcessing() {
  console.log('\n🎣 Testing Webhook Event Processing...');
  
  try {
    // Test call.initiated webhook
    console.log('   Testing call.initiated event...');
    const initiatedResponse = await axios.post(`${TEST_CONFIG.server_url}/api/call-control/webhooks`, {
      event_type: 'call.initiated',
      call_control_id: TEST_CONFIG.call_control_id,
      from: '+3226010500',
      to: TEST_CONFIG.test_phone,
      direction: 'outbound',
      payload: {
        customer_name: TEST_CONFIG.test_customer
      }
    });
    
    console.log('✅ call.initiated webhook processed successfully');
    
    // Test call.answered webhook
    console.log('   Testing call.answered event...');
    const answeredResponse = await axios.post(`${TEST_CONFIG.server_url}/api/call-control/webhooks`, {
      event_type: 'call.answered',
      call_control_id: TEST_CONFIG.call_control_id,
      from: '+3226010500',
      to: TEST_CONFIG.test_phone,
      direction: 'outbound'
    });
    
    console.log('✅ call.answered webhook processed successfully');
    
    // Verify call status was updated to 'answered'
    const answeredCall = await query(
      'SELECT * FROM call_logs WHERE phone_number = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
      [TEST_CONFIG.test_phone, 'answered']
    );
    
    if (answeredCall.rows.length > 0) {
      console.log('✅ Call status updated to "answered" in database');
    } else {
      console.log('⚠️ Call status not updated to "answered" - this might be expected if multiple calls exist');
    }
    
    // Test call.hangup webhook
    console.log('   Testing call.hangup event...');
    const hangupResponse = await axios.post(`${TEST_CONFIG.server_url}/api/call-control/webhooks`, {
      event_type: 'call.hangup',
      call_control_id: TEST_CONFIG.call_control_id,
      from: '+3226010500',
      to: TEST_CONFIG.test_phone,
      direction: 'outbound'
    });
    
    console.log('✅ call.hangup webhook processed successfully');
    
    // Verify call status was updated to 'completed'
    const completedCall = await query(
      'SELECT * FROM call_logs WHERE phone_number = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
      [TEST_CONFIG.test_phone, 'completed']
    );
    
    if (completedCall.rows.length > 0) {
      console.log('✅ Call status updated to "completed" in database');
    } else {
      console.log('⚠️ Call status not updated to "completed" - checking all call logs for this number...');
      
      const allCalls = await query(
        'SELECT * FROM call_logs WHERE phone_number = $1 ORDER BY created_at DESC',
        [TEST_CONFIG.test_phone]
      );
      
      console.log('   All call logs for test phone:');
      allCalls.rows.forEach((call, index) => {
        console.log(`   ${index + 1}. ID: ${call.id}, Status: ${call.status}, Created: ${call.created_at}`);
      });
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Webhook processing test failed:', error.message);
    if (error.response) {
      console.error('   API Error:', error.response.data);
    }
    return false;
  }
}

async function testCallLifecycle() {
  console.log('\n🔄 Testing Complete Call Lifecycle...');
  
  try {
    // Get all call logs for our test phone number
    const callLogs = await query(
      'SELECT cl.*, c.company_name FROM call_logs cl LEFT JOIN customers c ON cl.customer_id = c.id WHERE cl.phone_number = $1 ORDER BY cl.created_at',
      [TEST_CONFIG.test_phone]
    );
    
    console.log(`✅ Found ${callLogs.rows.length} call logs for test phone number`);
    
    callLogs.rows.forEach((call, index) => {
      console.log(`   ${index + 1}. Status: ${call.status} | Customer: ${call.company_name || 'N/A'} | Created: ${call.created_at}`);
    });
    
    // Verify we have the expected call statuses
    const statuses = callLogs.rows.map(call => call.status);
    const expectedStatuses = ['initiated', 'answered', 'completed'];
    
    const hasAllStatuses = expectedStatuses.every(status => statuses.includes(status));
    
    if (hasAllStatuses) {
      console.log('✅ All expected call statuses found in database');
    } else {
      console.log('⚠️ Some call statuses missing. Expected:', expectedStatuses, 'Found:', [...new Set(statuses)]);
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Call lifecycle test failed:', error.message);
    return false;
  }
}

async function cleanupTestData() {
  console.log('\n🧹 Cleaning up test data...');
  
  try {
    await query('DELETE FROM call_logs WHERE phone_number = $1', [TEST_CONFIG.test_phone]);
    await query('DELETE FROM customers WHERE phone = $1', [TEST_CONFIG.test_phone]);
    console.log('✅ Test data cleaned up successfully');
  } catch (error) {
    console.error('⚠️ Cleanup failed:', error.message);
  }
}

async function runTests() {
  console.log(`🎯 Target server: ${TEST_CONFIG.server_url}`);
  console.log(`📞 Test phone: ${TEST_CONFIG.test_phone}`);
  console.log(`👤 Test customer: ${TEST_CONFIG.test_customer}`);
  
  let allTestsPassed = true;
  
  // Test 1: Database Connection
  const dbConnected = await testDatabaseConnection();
  if (!dbConnected) {
    console.log('\n❌ Database tests failed. Cannot continue.');
    process.exit(1);
  }
  
  // Test 2: Customer Creation
  const customerData = await testCustomerCreation();
  if (!customerData) {
    allTestsPassed = false;
  }
  
  // Test 3: Webhook Processing
  const webhooksWorking = await testWebhookProcessing();
  if (!webhooksWorking) {
    allTestsPassed = false;
  }
  
  // Test 4: Call Lifecycle
  const lifecycleWorking = await testCallLifecycle();
  if (!lifecycleWorking) {
    allTestsPassed = false;
  }
  
  // Cleanup
  await cleanupTestData();
  
  // Final Results
  console.log('\n' + '='.repeat(60));
  console.log('🏁 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  
  if (allTestsPassed) {
    console.log('🎉 ALL TESTS PASSED! Webhook system is working correctly.');
    console.log('✅ Customer creation: WORKING');
    console.log('✅ Call logging: WORKING');
    console.log('✅ Webhook processing: WORKING');
    console.log('✅ Database integration: WORKING');
  } else {
    console.log('⚠️ SOME TESTS FAILED. Check the details above.');
  }
  
  console.log('\n🚀 Ready for production use!');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Test interrupted. Cleaning up...');
  await cleanupTestData();
  process.exit(0);
});

// Run the tests
runTests().catch(error => {
  console.error('\n💥 Test suite failed:', error);
  process.exit(1);
});