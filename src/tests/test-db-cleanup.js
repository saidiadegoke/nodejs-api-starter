/**
 * Direct Database Cleanup Script
 * Use this to clean up test database directly when API cleanup fails
 */

const pool = require('../db/pool');

const cleanupTestDatabase = async () => {
  console.log('🗑️  Cleaning up test database...\n');

  try {
    const SEEDED_EMAILS = [
      'admin@example.com',
      'student@example.com',
      'unilag-admin@example.com',
    ];
    const SEEDED_UNIS = [
      'UNILAG', 'OAU', 'UI', 'FUTMINNA', 'FUTA', 'UNILORIN',
      'OOU', 'CU', 'FUNAAB', 'ABU', 'UNN', 'UNIZIK',
    ];
    const PROTECTED_ROLES = [
      'super_admin', 'admin', 'system_admin', 'institution_admin', 'registrar',
    ];

    // 1. Delete test subjects associated with test sessions (if jupeb_subjects.session_id exists)
    const checkSubjectSessionCol = await pool.query(
      `SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'jupeb_subjects' AND column_name = 'session_id'`
    );
    if (checkSubjectSessionCol.rows.length > 0) {
      await pool.query(
        `DELETE FROM jupeb_subject_combination_items
          WHERE subject_id IN (
            SELECT id FROM jupeb_subjects
            WHERE session_id IN (
              SELECT id FROM jupeb_registration_sessions
              WHERE academic_year !~ '^20[0-9]{2}/20[0-9]{2}$'
            )
          )`
      );
      const delTestSubjects = await pool.query(
        `DELETE FROM jupeb_subjects
          WHERE session_id IN (
            SELECT id FROM jupeb_registration_sessions
            WHERE academic_year !~ '^20[0-9]{2}/20[0-9]{2}$'
          )`
      );
      if (delTestSubjects.rowCount > 0) {
        console.log(`✓ Deleted ${delTestSubjects.rowCount} test subjects scoped to test sessions`);
      }
    }

    // 2. Delete test JUPEB registration sessions (those not matching 20xx/20xx)
    // Deleting sessions cascades to jupeb_registrations and all its child tables
    // (jupeb_registration_status_history, jupeb_result_entries, documents, biometrics, etc.)
    const testSessions = await pool.query(
      `DELETE FROM jupeb_registration_sessions
        WHERE academic_year !~ '^20[0-9]{2}/20[0-9]{2}$'
        RETURNING id, academic_year`
    );
    if (testSessions.rowCount > 0) {
      console.log(`✓ Deleted ${testSessions.rowCount} test sessions:`);
      testSessions.rows.forEach((s) => console.log(`    - ${s.academic_year} (${s.id})`));
    }

    // 3. Clean up test registrations and courses belonging to test universities
    const testUniIdsRes = await pool.query(
      `SELECT id, code FROM jupeb_universities WHERE code <> ALL($1::text[])`,
      [SEEDED_UNIS]
    );
    if (testUniIdsRes.rowCount > 0) {
      const testUniIds = testUniIdsRes.rows.map((u) => u.id);
      const delUniRegs = await pool.query(
        `DELETE FROM jupeb_registrations WHERE university_id = ANY($1::uuid[])`,
        [testUniIds]
      );
      if (delUniRegs.rowCount > 0) {
        console.log(`✓ Deleted ${delUniRegs.rowCount} registrations under test universities`);
      }

      const u = await pool.query(
        `UPDATE jupeb_universities
            SET deleted_at = NOW()
          WHERE deleted_at IS NULL AND code <> ALL($1::text[])`,
        [SEEDED_UNIS]
      );
      if (u.rowCount > 0) console.log(`✓ Soft-deleted ${u.rowCount} test universities`);
    }

    // 4. Delete test dummy subject combinations (those not matching the JUPEB SC-NNN pattern)
    // Deleting combinations cascades to jupeb_subject_combination_items
    const delCombos = await pool.query(
      `DELETE FROM jupeb_subject_combinations
        WHERE code !~ '^JUPEB[ -]SC-[0-9]+$'
        RETURNING code`
    );
    if (delCombos.rowCount > 0) {
      console.log(`✓ Deleted ${delCombos.rowCount} test subject combinations:`);
      delCombos.rows.forEach((r) => console.log(`    - ${r.code}`));
    }

    // 5. Identify test users to delete (strictly preserving admins and seeded accounts)
    const testUsersRes = await pool.query(
      `SELECT id, email, phone FROM users
        WHERE (
          email LIKE 'test%@example.com'
          OR email LIKE '%@test.com'
          OR email LIKE 'test_%'
          OR email LIKE 'test-%'
          OR email LIKE 'delete-me-%'
          OR email LIKE 'nok-%'
          OR email LIKE 'pdf-%'
          OR email LIKE 'inst-%'
          OR email LIKE 'insdet-%'
          OR email LIKE 're-%'
          OR email LIKE 'm4-%'
          OR email LIKE 'dl-%'
          OR email LIKE 'admintest_%'
          OR email LIKE 'webhooks_%'
          OR email LIKE 'postmedia_%'
          OR email LIKE 'otp-%'
          OR email LIKE 'batch-%'
        )
        AND email <> ALL($1::text[])
        AND id NOT IN (
          SELECT ur.user_id FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE r.name = ANY($2::text[])
        )`,
      [SEEDED_EMAILS, PROTECTED_ROLES]
    );

    const testUserIds = testUsersRes.rows.map((u) => u.id);

    if (testUserIds.length > 0) {
      // Clear RESTRICT foreign-key references before deleting users
      await pool.query(
        `DELETE FROM jupeb_registration_status_history WHERE changed_by = ANY($1::uuid[])`,
        [testUserIds]
      );
      await pool.query(
        `DELETE FROM jupeb_registration_results WHERE entered_by = ANY($1::uuid[])`,
        [testUserIds]
      );
      await pool.query(
        `DELETE FROM jupeb_result_entries WHERE created_by = ANY($1::uuid[])`,
        [testUserIds]
      );
      await pool.query(
        `DELETE FROM ocr_results WHERE job_id IN (
           SELECT id FROM ocr_jobs WHERE requested_by = ANY($1::uuid[]) OR requested_for = ANY($1::uuid[])
         )`,
        [testUserIds]
      );
      await pool.query(
        `DELETE FROM ocr_jobs WHERE requested_by = ANY($1::uuid[]) OR requested_for = ANY($1::uuid[])`,
        [testUserIds]
      );
      await pool.query(
        `DELETE FROM jupeb_registrations WHERE user_id = ANY($1::uuid[])`,
        [testUserIds]
      );
      await pool.query(
        `DELETE FROM payments WHERE user_id = ANY($1::uuid[])`,
        [testUserIds]
      );
      await pool.query(
        `DELETE FROM files WHERE uploaded_by = ANY($1::uuid[])`,
        [testUserIds]
      );
      await pool.query(
        `UPDATE user_roles SET assigned_by = NULL WHERE assigned_by = ANY($1::uuid[])`,
        [testUserIds]
      );
      await pool.query(
        `UPDATE user_permissions SET granted_by = NULL WHERE granted_by = ANY($1::uuid[])`,
        [testUserIds]
      );

      // Now safe to delete test users
      const deleteUsers = await pool.query(
        `DELETE FROM users WHERE id = ANY($1::uuid[]) RETURNING id, email, phone`,
        [testUserIds]
      );
      console.log(`✓ Deleted ${deleteUsers.rowCount} test users`);
      deleteUsers.rows.forEach((user) => {
        console.log(`    - ${user.email || user.phone} (${user.id})`);
      });
    }

    // 5. Delete orphaned records if any exist
    const deleteProfiles = await pool.query(`
      DELETE FROM profiles 
      WHERE user_id NOT IN (SELECT id FROM users)
      RETURNING id
    `);
    if (deleteProfiles.rowCount > 0) {
      console.log(`✓ Deleted ${deleteProfiles.rowCount} orphaned profiles`);
    }


    const deleteSessions = await pool.query(`
      DELETE FROM user_sessions 
      WHERE user_id NOT IN (SELECT id FROM users)
      RETURNING id
    `);
    if (deleteSessions.rowCount > 0) {
      console.log(`✓ Deleted ${deleteSessions.rowCount} orphaned sessions`);
    }

    const deleteTokens = await pool.query(`
      DELETE FROM verification_tokens 
      WHERE user_id NOT IN (SELECT id FROM users)
      RETURNING id
    `);
    if (deleteTokens.rowCount > 0) {
      console.log(`✓ Deleted ${deleteTokens.rowCount} orphaned verification tokens`);
    }

    const deleteResets = await pool.query(`
      DELETE FROM password_resets
      WHERE user_id NOT IN (SELECT id FROM users)
      RETURNING id
    `);
    if (deleteResets.rowCount > 0) {
      console.log(`✓ Deleted ${deleteResets.rowCount} orphaned password resets`);
    }

    console.log('\n✅ Database cleanup completed successfully\n');
    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Database cleanup failed:', error);
    await pool.end().catch(() => {});
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  cleanupTestDatabase();
}

module.exports = { cleanupTestDatabase };


