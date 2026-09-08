#!/usr/bin/env node

/**
 * CLI Script to delete JUPEB universities and all related associations.
 *
 * Usage:
 *   node scripts/clear-universities.js --all                      # Delete all universities and their associations
 *   node scripts/clear-universities.js --id=<UUID>                # Delete a specific university by ID
 *   node scripts/clear-universities.js --code=<CODE>              # Delete a specific university by code
 *   node scripts/clear-universities.js --all --dry-run            # Preview count of records to be deleted
 *   node scripts/clear-universities.js --all --force              # Delete without prompt
 */

require('dotenv').config();
const readline = require('readline');
const pool = require('../src/db/pool');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    all: false,
    id: null,
    code: null,
    dryRun: false,
    force: false,
  };

  for (const arg of args) {
    if (arg === '--all') options.all = true;
    else if (arg.startsWith('--id=')) options.id = arg.split('=')[1];
    else if (arg.startsWith('--code=')) options.code = arg.split('=')[1];
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force' || arg === '-y') options.force = true;
  }

  return options;
}

function promptConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes' || answer.trim().toLowerCase() === 'y');
    });
  });
}

async function safeQuery(client, sql, params = []) {
  try {
    await client.query('SAVEPOINT sp_uni');
    const res = await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT sp_uni');
    return res;
  } catch (err) {
    try {
      await client.query('ROLLBACK TO SAVEPOINT sp_uni');
    } catch (_) {}
    return { rowCount: 0, rows: [] };
  }
}

async function clearUniversities({ all = false, id = null, code = null, dryRun = false }) {
  const client = await pool.connect();
  try {
    if (!dryRun) await client.query('BEGIN');

    const stats = {};

    // 1. Locate Target University IDs
    let uniRes;
    if (all) {
      uniRes = await client.query(`SELECT id, code, name FROM jupeb_universities`);
    } else if (id) {
      uniRes = await client.query(`SELECT id, code, name FROM jupeb_universities WHERE id = $1`, [id]);
    } else if (code) {
      uniRes = await client.query(`SELECT id, code, name FROM jupeb_universities WHERE LOWER(code) = LOWER($1)`, [code]);
    } else {
      throw new Error('Must specify --all, --id=<uuid>, or --code=<code>');
    }

    const uniList = uniRes.rows;
    const uniIds = uniList.map((u) => u.id);

    stats.universities_found = uniList.length;
    if (uniList.length === 0) {
      if (!dryRun) await client.query('ROLLBACK');
      return stats;
    }

    // 2. Find Associated Registrations
    const regRes = await client.query(
      `SELECT id, user_id, nin_verification_id FROM jupeb_registrations WHERE university_id = ANY($1::uuid[])`,
      [uniIds]
    );
    const regIds = regRes.rows.map((r) => r.id);
    const candidateUserIds = regRes.rows.map((r) => r.user_id).filter(Boolean);
    const ninIds = regRes.rows.map((r) => r.nin_verification_id).filter(Boolean);

    stats.registrations_found = regIds.length;

    // 3. Delete OCR results and jobs for candidate users
    if (candidateUserIds.length > 0) {
      const ocrJobsRes = await safeQuery(
        client,
        `SELECT id FROM ocr_jobs WHERE requested_by = ANY($1::uuid[]) OR requested_for = ANY($1::uuid[])`,
        [candidateUserIds]
      );
      const ocrJobIds = ocrJobsRes.rows.map((r) => r.id);
      if (ocrJobIds.length > 0) {
        if (!dryRun) {
          await safeQuery(client, `DELETE FROM ocr_results WHERE job_id = ANY($1::uuid[])`, [ocrJobIds]);
          const delOcr = await safeQuery(client, `DELETE FROM ocr_jobs WHERE id = ANY($1::uuid[])`, [ocrJobIds]);
          stats.ocr_jobs = delOcr.rowCount;
        } else {
          stats.ocr_jobs = ocrJobIds.length;
        }
      }
    }

    // 4. Delete Registration Dependent Records
    if (regIds.length > 0) {
      const dependentTables = [
        'jupeb_registration_status_history',
        'jupeb_biometric_captures',
        'jupeb_registration_documents',
        'jupeb_result_entries',
        'jupeb_next_of_kin',
        'jupeb_registration_scores',
        'jupeb_registration_results',
        'jupeb_payment_reconciliations',
      ];

      for (const tbl of dependentTables) {
        if (!dryRun) {
          const res = await safeQuery(
            client,
            `DELETE FROM "${tbl}" WHERE registration_id = ANY($1::uuid[])`,
            [regIds]
          );
          stats[tbl] = res.rowCount;
        } else {
          const countRes = await safeQuery(
            client,
            `SELECT COUNT(*)::int AS count FROM "${tbl}" WHERE registration_id = ANY($1::uuid[])`,
            [regIds]
          );
          stats[tbl] = countRes.rows[0]?.count || 0;
        }
      }

      // Delete registrations
      if (!dryRun) {
        const delRegRes = await client.query(
          `DELETE FROM jupeb_registrations WHERE id = ANY($1::uuid[])`,
          [regIds]
        );
        stats.jupeb_registrations = delRegRes.rowCount;
      } else {
        stats.jupeb_registrations = regIds.length;
      }
    }

    // 5. Delete unlinked NIN verifications
    if (ninIds.length > 0) {
      if (!dryRun) {
        const ninRes = await safeQuery(
          client,
          `DELETE FROM jupeb_nin_verifications WHERE id = ANY($1::uuid[]) AND id NOT IN (SELECT nin_verification_id FROM jupeb_registrations WHERE nin_verification_id IS NOT NULL)`,
          [ninIds]
        );
        stats.jupeb_nin_verifications = ninRes.rowCount;
      }
    }

    // 6. Delete jupeb_courses mapped to these universities
    if (!dryRun) {
      const delCourses = await safeQuery(
        client,
        `DELETE FROM jupeb_courses WHERE university_id = ANY($1::uuid[])`,
        [uniIds]
      );
      stats.jupeb_courses = delCourses.rowCount;
    } else {
      const countCourses = await safeQuery(
        client,
        `SELECT COUNT(*)::int AS count FROM jupeb_courses WHERE university_id = ANY($1::uuid[])`,
        [uniIds]
      );
      stats.jupeb_courses = countCourses.rows[0]?.count || 0;
    }

    // 7. Delete user_universities mappings
    if (!dryRun) {
      const delUserUnis = await safeQuery(
        client,
        `DELETE FROM user_universities WHERE university_id = ANY($1::uuid[])`,
        [uniIds]
      );
      stats.user_universities = delUserUnis.rowCount;
    } else {
      const countUserUnis = await safeQuery(
        client,
        `SELECT COUNT(*)::int AS count FROM user_universities WHERE university_id = ANY($1::uuid[])`,
        [uniIds]
      );
      stats.user_universities = countUserUnis.rows[0]?.count || 0;
    }

    // 8. Handle References in profiles, payments, and institution-scoped roles
    if (!dryRun) {
      const profRes = await safeQuery(
        client,
        `UPDATE profiles SET jupeb_university_id = NULL WHERE jupeb_university_id = ANY($1::uuid[])`,
        [uniIds]
      );
      stats.profiles_detached = profRes.rowCount;

      const payRes = await safeQuery(
        client,
        `UPDATE payments SET jupeb_university_id = NULL WHERE jupeb_university_id = ANY($1::uuid[])`,
        [uniIds]
      );
      stats.payments_detached = payRes.rowCount;
    }

    // Delete institution-owned custom roles and their permissions/user bindings
    const instRolesRes = await client.query(
      `SELECT id FROM roles WHERE owner_jupeb_university_id = ANY($1::uuid[])`,
      [uniIds]
    );
    const instRoleIds = instRolesRes.rows.map((r) => r.id);
    if (instRoleIds.length > 0) {
      if (!dryRun) {
        await safeQuery(
          client,
          `DELETE FROM role_permissions WHERE role_id = ANY($1::uuid[])`,
          [instRoleIds]
        );
        await safeQuery(
          client,
          `DELETE FROM user_roles WHERE role_id = ANY($1::uuid[])`,
          [instRoleIds]
        );
        const delRolesRes = await client.query(
          `DELETE FROM roles WHERE id = ANY($1::uuid[])`,
          [instRoleIds]
        );
        stats.institution_roles_deleted = delRolesRes.rowCount;
      } else {
        stats.institution_roles_deleted = instRoleIds.length;
      }
    }

    // 9. Delete non-admin candidate user accounts
    if (candidateUserIds.length > 0) {
      const adminSubquery = `SELECT DISTINCT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name IN ('super_admin', 'admin', 'system_admin')`;
      const nonAdminUsersRes = await client.query(
        `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND id NOT IN (${adminSubquery})`,
        [candidateUserIds]
      );
      const nonAdminIds = nonAdminUsersRes.rows.map((r) => r.id);

      if (nonAdminIds.length > 0 && !dryRun) {
        const userDepTables = [
          'otp_codes',
          'password_resets',
          'verification_tokens',
          'user_preferences',
          'user_sessions',
          'user_universities',
          'user_permissions',
          'social_accounts',
          'profiles',
          'user_roles',
        ];

        for (const tbl of userDepTables) {
          await safeQuery(client, `DELETE FROM "${tbl}" WHERE user_id = ANY($1::uuid[])`, [nonAdminIds]);
        }

        const delUsers = await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [nonAdminIds]);
        stats.student_users_deleted = delUsers.rowCount;
      }
    }

    // 10. Finally Delete jupeb_universities
    if (!dryRun) {
      const delUniRes = await client.query(
        `DELETE FROM jupeb_universities WHERE id = ANY($1::uuid[])`,
        [uniIds]
      );
      stats.jupeb_universities_deleted = delUniRes.rowCount;
      await client.query('COMMIT');
    } else {
      stats.jupeb_universities_deleted = uniIds.length;
      stats.dry_run = true;
    }

    return stats;
  } catch (err) {
    if (!dryRun) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const options = parseArgs();

  if (!options.all && !options.id && !options.code) {
    console.log(`
Usage:
  node scripts/clear-universities.js --all                      Delete all universities and all associations
  node scripts/clear-universities.js --id=<UUID>                Delete specific university by ID
  node scripts/clear-universities.js --code=<CODE>              Delete specific university by code (e.g. UNILAG)
  node scripts/clear-universities.js --all --dry-run            Preview count of records without deleting
  node scripts/clear-universities.js --all --force              Skip confirmation prompt
    `);
    process.exit(1);
  }

  try {
    const targetDesc = options.all
      ? 'ALL universities and their courses, registrations, and associations'
      : options.id
      ? `university ID: ${options.id}`
      : `university code: ${options.code}`;

    console.log(`\nTarget: ${targetDesc}`);

    if (!options.dryRun && !options.force) {
      const confirmed = await promptConfirmation(
        `WARNING: This will permanently delete ${targetDesc}.\nType "yes" or "y" to proceed: `
      );
      if (!confirmed) {
        console.log('Aborted.');
        process.exit(0);
      }
    }

    console.log('Running university cleanup...');
    const stats = await clearUniversities(options);
    console.log('\n--- Cleanup Results ---');
    console.table(stats);
  } catch (err) {
    console.error('\n❌ Cleanup error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
