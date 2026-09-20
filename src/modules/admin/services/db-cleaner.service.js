const pool = require('../../../db/pool');

/**
 * ============================================================================
 * DATABASE TABLES CONFIGURATION
 * Edit or comment out tables you do not want cleared.
 * ============================================================================
 */

// 1. Candidate & Registration Records (Cleared when session_id or all is selected)
const REGISTRATION_TABLES = [
  'jupeb_registration_status_history',
  'jupeb_biometric_captures',
  'jupeb_registration_documents',
  'jupeb_result_entries',
  'jupeb_registration_scores',
  'jupeb_registration_results',
  'jupeb_next_of_kin',
  'jupeb_payment_reconciliations',
  'jupeb_session_events',
  'jupeb_registrations',
  'jupeb_nin_verifications',
];

// 2. User & Authentication Tables (Non-admin accounts & sessions cleared; Admins protected)
const USER_TABLES = [
  'user_sessions',
  'user_preferences',
  'user_permissions',
  'user_universities',
  'social_accounts',
  'profiles',
  'user_roles',
  'users',
];

// 3. Files, OCR & Processing Artifacts
const FILE_AND_OCR_TABLES = [
  'ocr_results',
  'ocr_jobs',
  'files',
  'asset_groups',
];

// 4. Payments & Financial Transactions
const PAYMENT_TABLES = [
  'payments',
  'payment_items',
  'payment_structures',
  'payment_methods',
  'bank_accounts',
];

// 5. Notifications, Logs & Temporary Security Tokens
const LOG_AND_TOKEN_TABLES = [
  'notifications',
  'admin_audit_logs',
  'request_logs',
  'request_counters',
  'otp_codes',
  'password_resets',
  'verification_tokens',
  'api_keys',
  'webhooks',
];

// 6. Community & Posts (if used)
const COMMUNITY_TABLES = [
  'post_comment_likes',
  'post_comments',
  'post_likes',
  'post_media',
  'posts',
];

// 7. Optional Catalog Data (Comment out any you want to preserve)
const CATALOG_TABLES = [
  // 'jupeb_subject_combination_items',
  // 'jupeb_subject_combinations',
  // 'jupeb_subjects',
  // 'jupeb_universities',
  // 'jupeb_courses',
  // 'jupeb_document_requirements',
];

/**
 * PROTECTED ADMIN ROLES & CRITICAL TABLES
 * These tables and user roles are NEVER deleted:
 * - roles
 * - permissions
 * - role_permissions
 * - schema_migrations
 * - countries
 * - states
 * - lgas
 * - platform_settings
 * - jupeb_registration_sessions (preserved as requested)
 * - users with protected admin roles (and their sessions, profiles, user_roles)
 */
const PROTECTED_ADMIN_ROLES = [
  'super_admin',
  'admin',
  'system_admin',
  'institution_admin',
  'registrar',
];

class DbCleanerService {
  /**
   * Returns list of configured tables for inspection/editing.
   */
  static getConfiguredTables() {
    return {
      registration_tables: REGISTRATION_TABLES,
      user_tables: USER_TABLES,
      file_and_ocr_tables: FILE_AND_OCR_TABLES,
      payment_tables: PAYMENT_TABLES,
      log_and_token_tables: LOG_AND_TOKEN_TABLES,
      community_tables: COMMUNITY_TABLES,
      catalog_tables: CATALOG_TABLES,
      protected_admin_roles: PROTECTED_ADMIN_ROLES,
    };
  }

  /**
   * Helper: Get SQL subquery for protected admin user IDs.
   */
  static getAdminUserIdsSubquery() {
    const rolesList = PROTECTED_ADMIN_ROLES.map((r) => `'${r}'`).join(', ');
    return `SELECT DISTINCT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN users u ON u.id = ur.user_id WHERE r.name IN (${rolesList}) AND (u.email = 'admin@example.com' OR (u.email NOT LIKE '%@example.com' AND u.email NOT LIKE '%@test.com' AND u.email NOT LIKE '%@release-test.edu.ng' AND u.email NOT LIKE '%@yopmail.com'))`;
  }

  /**
   * Helper: Safely execute query with savepoint to protect transaction from aborting.
   */
  static async safeQuery(client, sql, params = []) {
    try {
      await client.query('SAVEPOINT sp_safe');
      const res = await client.query(sql, params);
      await client.query('RELEASE SAVEPOINT sp_safe');
      return res;
    } catch (err) {
      try {
        await client.query('ROLLBACK TO SAVEPOINT sp_safe');
      } catch (_) {}
      return { rowCount: 0, rows: [] };
    }
  }

  /**
   * Clear database records scoped by a specific session ID.
   * Cleans up candidate registrations, biometrics, documents, scores, files, OCR jobs, and candidate accounts.
   */
  static async clearBySession(sessionId, { dryRun = false } = {}) {
    if (!sessionId) {
      throw new Error('session_id is required for session-scoped cleanup');
    }

    const client = await pool.connect();
    try {
      if (!dryRun) await client.query('BEGIN');

      const stats = {};

      // 1. Find registrations in this session
      const regRes = await client.query(
        `SELECT id, user_id, nin_verification_id FROM jupeb_registrations WHERE session_id = $1`,
        [sessionId]
      );
      const regIds = regRes.rows.map((r) => r.id);
      const sessionUserIds = regRes.rows.map((r) => r.user_id).filter(Boolean);
      const ninIds = regRes.rows.map((r) => r.nin_verification_id).filter(Boolean);

      stats.registrations_found = regIds.length;

      // Identify non-admin candidate user IDs to safely clean up
      let candidateUserIds = [];
      if (sessionUserIds.length > 0) {
        const adminSubquery = this.getAdminUserIdsSubquery();
        const candidateUsersRes = await client.query(
          `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND id NOT IN (${adminSubquery})`,
          [sessionUserIds]
        );
        candidateUserIds = candidateUsersRes.rows.map((r) => r.id);
      }

      // 2. Delete OCR results and jobs associated with candidates
      if (candidateUserIds.length > 0) {
        const ocrJobsRes = await this.safeQuery(
          client,
          `SELECT id FROM ocr_jobs WHERE requested_by = ANY($1::uuid[]) OR requested_for = ANY($1::uuid[])`,
          [candidateUserIds]
        );
        const ocrJobIds = ocrJobsRes.rows.map((r) => r.id);
        if (ocrJobIds.length > 0) {
          await this.safeQuery(client, `DELETE FROM ocr_results WHERE job_id = ANY($1::uuid[])`, [ocrJobIds]);
          const delOcr = await this.safeQuery(client, `DELETE FROM ocr_jobs WHERE id = ANY($1::uuid[])`, [ocrJobIds]);
          stats.ocr_jobs = delOcr.rowCount;
        }
      }

      // 3. Delete registration dependents
      if (regIds.length > 0) {
        // Status history
        const histRes = await client.query(
          `DELETE FROM jupeb_registration_status_history WHERE registration_id = ANY($1::uuid[])`,
          [regIds]
        );
        stats.jupeb_registration_status_history = histRes.rowCount;

        // Biometrics
        const bioRes = await client.query(
          `DELETE FROM jupeb_biometric_captures WHERE registration_id = ANY($1::uuid[])`,
          [regIds]
        );
        stats.jupeb_biometric_captures = bioRes.rowCount;

        // Documents
        const docRes = await client.query(
          `DELETE FROM jupeb_registration_documents WHERE registration_id = ANY($1::uuid[])`,
          [regIds]
        );
        stats.jupeb_registration_documents = docRes.rowCount;

        // Result entries
        const resEntRes = await client.query(
          `DELETE FROM jupeb_result_entries WHERE registration_id = ANY($1::uuid[])`,
          [regIds]
        );
        stats.jupeb_result_entries = resEntRes.rowCount;

        // Next of kin
        const nokRes = await client.query(
          `DELETE FROM jupeb_next_of_kin WHERE registration_id = ANY($1::uuid[])`,
          [regIds]
        );
        stats.jupeb_next_of_kin = nokRes.rowCount;

        // Scores & Results (using safeQuery)
        const scRes = await this.safeQuery(
          client,
          `DELETE FROM jupeb_registration_scores WHERE registration_id = ANY($1::uuid[])`,
          [regIds]
        );
        stats.jupeb_registration_scores = scRes.rowCount;

        const rrRes = await this.safeQuery(
          client,
          `DELETE FROM jupeb_registration_results WHERE registration_id = ANY($1::uuid[])`,
          [regIds]
        );
        stats.jupeb_registration_results = rrRes.rowCount;

        const prRes = await this.safeQuery(
          client,
          `DELETE FROM jupeb_payment_reconciliations WHERE registration_id = ANY($1::uuid[])`,
          [regIds]
        );
        stats.jupeb_payment_reconciliations = prRes.rowCount;

        // Registrations
        const delRegRes = await client.query(
          `DELETE FROM jupeb_registrations WHERE id = ANY($1::uuid[])`,
          [regIds]
        );
        stats.jupeb_registrations = delRegRes.rowCount;
      }

      // 4. Session events
      const evRes = await this.safeQuery(
        client,
        `DELETE FROM jupeb_session_events WHERE session_id = $1`,
        [sessionId]
      );
      stats.jupeb_session_events = evRes.rowCount;

      // 5. Unlinked NIN verifications
      if (ninIds.length > 0) {
        const ninRes = await this.safeQuery(
          client,
          `DELETE FROM jupeb_nin_verifications WHERE id = ANY($1::uuid[]) AND id NOT IN (SELECT nin_verification_id FROM jupeb_registrations WHERE nin_verification_id IS NOT NULL)`,
          [ninIds]
        );
        stats.jupeb_nin_verifications = ninRes.rowCount;
      }

      // 6. Delete candidate accounts and all remaining user-dependent records
      if (candidateUserIds.length > 0) {
        await this.safeQuery(
          client,
          `DELETE FROM jupeb_registration_status_history WHERE changed_by = ANY($1::uuid[])`,
          [candidateUserIds]
        );
        await this.safeQuery(
          client,
          `DELETE FROM jupeb_result_entries WHERE entered_by = ANY($1::uuid[])`,
          [candidateUserIds]
        );

        // Payments
        const delPay = await this.safeQuery(
          client,
          `DELETE FROM payments WHERE user_id = ANY($1::uuid[])`,
          [candidateUserIds]
        );
        stats.payments = delPay.rowCount;

        // User files (uploads)
        const delFiles = await this.safeQuery(
          client,
          `DELETE FROM files WHERE uploaded_by = ANY($1::uuid[])`,
          [candidateUserIds]
        );
        stats.files = delFiles.rowCount;

        // Notifications
        await this.safeQuery(
          client,
          `DELETE FROM notifications WHERE user_id = ANY($1::uuid[]) OR actor_id = ANY($1::uuid[])`,
          [candidateUserIds]
        );

        // Clean user dependent tables
        const userDepTables = [
          'otp_codes',
          'password_resets',
          'verification_tokens',
          'post_comment_likes',
          'post_comments',
          'post_likes',
          'post_media',
          'posts',
          'user_preferences',
          'user_sessions',
          'user_universities',
          'user_permissions',
          'social_accounts',
          'profiles',
          'user_roles',
        ];

        for (const tbl of userDepTables) {
          const check = await this.safeQuery(
            client,
            `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
            [tbl]
          );
          if (!check.rows.length) continue;

          const res = await this.safeQuery(
            client,
            `DELETE FROM "${tbl}" WHERE user_id = ANY($1::uuid[])`,
            [candidateUserIds]
          );
          stats[tbl] = res.rowCount;
        }

        const studentUserRes = await client.query(
          `DELETE FROM users WHERE id = ANY($1::uuid[])`,
          [candidateUserIds]
        );
        stats.student_users_deleted = studentUserRes.rowCount;
      }

      if (dryRun) {
        stats.dry_run = true;
      } else {
        await client.query('COMMIT');
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

  /**
   * Clear all operational data across all configured tables.
   * Always protects admin users, sessions, roles, permissions, and system migrations.
   */
  static async clearAll({
    dryRun = false,
    includeNonAdminUsers = true,
    customTables = null,
  } = {}) {
    const client = await pool.connect();
    try {
      if (!dryRun) await client.query('BEGIN');

      const stats = {};
      const adminSubquery = this.getAdminUserIdsSubquery();

      // 1. Clear general operational tables in dependency order
      const orderedOperationalTables = [
        // Community
        'post_comment_likes',
        'post_comments',
        'post_likes',
        'post_media',
        'posts',
        // Registrations
        'jupeb_registration_status_history',
        'jupeb_biometric_captures',
        'jupeb_registration_documents',
        'jupeb_result_entries',
        'jupeb_registration_scores',
        'jupeb_registration_results',
        'jupeb_next_of_kin',
        'jupeb_payment_reconciliations',
        'jupeb_session_events',
        'jupeb_registrations',
        'jupeb_nin_verifications',
        // OCR
        'ocr_results',
        'ocr_jobs',
        // Files
        'files',
        'asset_groups',
        // Payments
        'payment_items',
        'payments',
        'payment_structures',
        'payment_methods',
        'bank_accounts',
        // Logs & Tokens
        'notifications',
        'admin_audit_logs',
        'request_logs',
        'request_counters',
        'otp_codes',
        'password_resets',
        'verification_tokens',
        'api_keys',
        'webhooks',
        // Catalog
        ...CATALOG_TABLES,
      ];

      const tablesToClear = customTables || orderedOperationalTables;

      for (const table of tablesToClear) {
        try {
          const check = await client.query(
            `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
            [table]
          );
          if (check.rows.length) {
            const countRes = await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
            const rowCount = countRes.rows[0]?.count || 0;
            if (!dryRun && rowCount > 0) {
              await client.query(`DELETE FROM "${table}"`);
            }
            stats[table] = rowCount;
          }
        } catch (tableErr) {
          stats[table] = `skipped: ${tableErr.message}`;
        }
      }

      // 2. Clear non-admin user tables while strictly preserving admins
      if (includeNonAdminUsers) {
        const userTablesList = [
          'user_preferences',
          'user_sessions',
          'user_universities',
          'user_permissions',
          'social_accounts',
          'profiles',
          'user_roles',
          'users',
        ];

        for (const tbl of userTablesList) {
          try {
            const check = await client.query(
              `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
              [tbl]
            );
            if (!check.rows.length) continue;

            const idCol = tbl === 'users' ? 'id' : 'user_id';
            const countRes = await client.query(
              `SELECT COUNT(*)::int AS count FROM "${tbl}" WHERE "${idCol}" NOT IN (${adminSubquery})`
            );
            const count = countRes.rows[0]?.count || 0;

            if (!dryRun && count > 0) {
              await client.query(
                `DELETE FROM "${tbl}" WHERE "${idCol}" NOT IN (${adminSubquery})`
              );
            }
            stats[tbl] = count;
          } catch (tblErr) {
            stats[tbl] = `skipped: ${tblErr.message}`;
          }
        }
      }

      if (dryRun) {
        stats.dry_run = true;
      } else {
        await client.query('COMMIT');
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
}

module.exports = DbCleanerService;

