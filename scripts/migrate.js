const { initializeDatabase } = require('../src/database');

async function runMigrations() {
  console.log('🔧 Starting database migration...');
  
  try {
    await initializeDatabase();
    console.log('✅ Database migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('💥 Database migration failed:', error);
    process.exit(1);
  }
}

runMigrations();