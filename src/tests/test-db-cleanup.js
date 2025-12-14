/**
 * Direct Database Cleanup Script
 * Use this to clean up test database directly when API cleanup fails
 */

const pool = require('../db/pool');

const cleanupTestDatabase = async () => {
  console.log('🗑️  Cleaning up test database...\n');

  try {
    // Delete test users (those with test emails)
    const deleteUsers = await pool.query(`
      DELETE FROM users 
      WHERE email LIKE 'test%@example.com'
      OR phone LIKE '+234%'
      RETURNING id, email, phone
    `);

    console.log(`✓ Deleted ${deleteUsers.rowCount} test users`);
    
    if (deleteUsers.rows.length > 0) {
      console.log('  Users deleted:');
      deleteUsers.rows.forEach(user => {
        console.log(`    - ${user.email || user.phone} (${user.id})`);
      });
    }

    // Delete orphaned profiles
    const deleteProfiles = await pool.query(`
      DELETE FROM profiles 
      WHERE user_id NOT IN (SELECT id FROM users)
      RETURNING id
    `);

    if (deleteProfiles.rowCount > 0) {
      console.log(`✓ Deleted ${deleteProfiles.rowCount} orphaned profiles`);
    }

    // Delete orphaned addresses
    const deleteAddresses = await pool.query(`
      DELETE FROM user_addresses 
      WHERE user_id NOT IN (SELECT id FROM users)
      RETURNING id
    `);

    if (deleteAddresses.rowCount > 0) {
      console.log(`✓ Deleted ${deleteAddresses.rowCount} orphaned addresses`);
    }

    // Delete orphaned sessions
    const deleteSessions = await pool.query(`
      DELETE FROM user_sessions 
      WHERE user_id NOT IN (SELECT id FROM users)
      RETURNING id
    `);

    if (deleteSessions.rowCount > 0) {
      console.log(`✓ Deleted ${deleteSessions.rowCount} orphaned sessions`);
    }

    // Delete orphaned verification tokens
    const deleteTokens = await pool.query(`
      DELETE FROM verification_tokens 
      WHERE user_id NOT IN (SELECT id FROM users)
      RETURNING id
    `);

    if (deleteTokens.rowCount > 0) {
      console.log(`✓ Deleted ${deleteTokens.rowCount} orphaned verification tokens`);
    }

    // Delete orphaned password resets
    const deleteResets = await pool.query(`
      DELETE FROM password_resets 
      WHERE user_id NOT IN (SELECT id FROM users)
      RETURNING id
    `);

    if (deleteResets.rowCount > 0) {
      console.log(`✓ Deleted ${deleteResets.rowCount} orphaned password resets`);
    }

    console.log('\n✅ Database cleanup completed successfully\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Database cleanup failed:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  cleanupTestDatabase();
}

module.exports = { cleanupTestDatabase };


