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

    // JUPEB test fixtures — `nextJupebTestUniversityCode` generates codes
    // shaped `<tag><timestamp><rand>`, easily distinguishable from the
    // small set of real seeded codes ('UNILAG', 'OAU', etc.). Soft-delete
    // anything outside that allow-list so accumulated runs don't saturate
    // the partial-unique 100..999 jupeb_prefix space.
    try {
      const SEEDED_UNIS = [
        'UNILAG', 'OAU', 'UI', 'FUTMINNA', 'FUTA', 'UNILORIN',
        'OOU', 'CU', 'FUNAAB', 'ABU', 'UNN', 'UNIZIK',
      ];
      const SEEDED_COMBOS = [
        'JUPEB SC-001', 'JUPEB SC-002', 'JUPEB SC-003', 'JUPEB SC-004',
      ];
      const u = await pool.query(
        `UPDATE jupeb_universities
            SET deleted_at = NOW()
          WHERE deleted_at IS NULL AND code <> ALL($1::text[])`,
        [SEEDED_UNIS]
      );
      if (u.rowCount > 0) console.log(`✓ Soft-deleted ${u.rowCount} test universities`);

      const s = await pool.query(
        `DELETE FROM jupeb_registration_sessions
          WHERE academic_year !~ '^20[0-9]{2}/20[0-9]{2}$'`
      );
      if (s.rowCount > 0) console.log(`✓ Deleted ${s.rowCount} test sessions`);

      const c = await pool.query(
        `UPDATE jupeb_subject_combinations
            SET deleted_at = NOW()
          WHERE deleted_at IS NULL AND code <> ALL($1::text[])`,
        [SEEDED_COMBOS]
      );
      if (c.rowCount > 0) console.log(`✓ Soft-deleted ${c.rowCount} test subject combinations`);
    } catch (e) {
      console.warn(`⚠️  JUPEB fixture cleanup partial: ${e.message}`);
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


