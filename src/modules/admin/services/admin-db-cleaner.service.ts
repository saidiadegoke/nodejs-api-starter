import {
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../../logger';
import { ClearDbDto, ClearDbResultDto } from '../dto';

// ── Table group configuration ───────────────────────────────────────────────

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

const FILE_AND_OCR_TABLES = ['ocr_results', 'ocr_jobs', 'files', 'asset_groups'];

const PAYMENT_TABLES = [
  'payments',
  'payment_items',
  'payment_structures',
  'payment_methods',
  'bank_accounts',
];

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

const COMMUNITY_TABLES = [
  'post_comment_likes',
  'post_comments',
  'post_likes',
  'post_media',
  'posts',
];

const CATALOG_TABLES: string[] = [];

const PROTECTED_ADMIN_ROLES = [
  'super_admin',
  'admin',
  'system_admin',
  'institution_admin',
  'registrar',
];

@Injectable()
export class AdminDbCleanerService {
  private readonly logger;

  constructor(
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(AdminDbCleanerService.name);
  }

  /** Returns the configured table groups for inspection. */
  getConfiguredTables() {
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

  /** Subquery returning admin user IDs that must be preserved. */
  private getAdminUserIdsSubquery(): string {
    const rolesList = PROTECTED_ADMIN_ROLES.map((r) => `'${r}'`).join(', ');
    return `SELECT DISTINCT ur.user_id
            FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
            JOIN users u ON u.id = ur.user_id
            WHERE r.name IN (${rolesList})
              AND (u.email = 'admin@example.com'
                   OR (u.email NOT LIKE '%@example.com'
                       AND u.email NOT LIKE '%@test.com'
                       AND u.email NOT LIKE '%@release-test.edu.ng'
                       AND u.email NOT LIKE '%@yopmail.com'))`;
  }

  /** Execute SQL inside a savepoint so a single failure doesn't abort the tx. */
  private async safeQuery(
    runner: any,
    sql: string,
    params: any[] = [],
  ): Promise<{ rowCount: number; rows: any[] }> {
    try {
      await runner.query('SAVEPOINT sp_safe');
      const res = await runner.query(sql, params);
      await runner.query('RELEASE SAVEPOINT sp_safe');
      // DataSource.query returns rows directly; rowCount inferred
      const rows = Array.isArray(res) ? res : [];
      return { rowCount: rows.length, rows };
    } catch {
      try {
        await runner.query('ROLLBACK TO SAVEPOINT sp_safe');
      } catch { /* swallow */ }
      return { rowCount: 0, rows: [] };
    }
  }

  /** Clear records scoped to a specific registration session. */
  async clearBySession(sessionId: string): Promise<Record<string, number>> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const stats: Record<string, number> = {};

      // 1. Find registrations in this session
      const regRows: any[] = await queryRunner.query(
        `SELECT id, user_id, nin_verification_id FROM jupeb_registrations WHERE session_id = $1`,
        [sessionId],
      );
      const regIds = regRows.map((r) => r.id);
      const sessionUserIds = regRows.map((r) => r.user_id).filter(Boolean);
      const ninIds = regRows.map((r) => r.nin_verification_id).filter(Boolean);
      stats['registrations_found'] = regIds.length;

      // Identify non-admin candidate users
      let candidateUserIds: string[] = [];
      if (sessionUserIds.length > 0) {
        const adminSubquery = this.getAdminUserIdsSubquery();
        const candidateUsers: any[] = await queryRunner.query(
          `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND id NOT IN (${adminSubquery})`,
          [sessionUserIds],
        );
        candidateUserIds = candidateUsers.map((r) => r.id);
      }

      // 2. OCR cleanup
      if (candidateUserIds.length > 0) {
        const ocrJobs = await this.safeQuery(
          queryRunner,
          `SELECT id FROM ocr_jobs WHERE requested_by = ANY($1::uuid[]) OR requested_for = ANY($1::uuid[])`,
          [candidateUserIds],
        );
        const ocrJobIds = ocrJobs.rows.map((r: any) => r.id);
        if (ocrJobIds.length > 0) {
          await this.safeQuery(queryRunner, `DELETE FROM ocr_results WHERE job_id = ANY($1::uuid[])`, [ocrJobIds]);
          const delOcr = await this.safeQuery(queryRunner, `DELETE FROM ocr_jobs WHERE id = ANY($1::uuid[])`, [ocrJobIds]);
          stats['ocr_jobs'] = delOcr.rowCount;
        }
      }

      // 3. Registration dependents
      if (regIds.length > 0) {
        const depTables = [
          'jupeb_registration_status_history',
          'jupeb_biometric_captures',
          'jupeb_registration_documents',
          'jupeb_result_entries',
          'jupeb_next_of_kin',
        ];
        for (const tbl of depTables) {
          const res = await queryRunner.query(
            `DELETE FROM "${tbl}" WHERE registration_id = ANY($1::uuid[])`,
            [regIds],
          );
          stats[tbl] = Array.isArray(res) ? res.length : 0;
        }

        const safeTables = [
          'jupeb_registration_scores',
          'jupeb_registration_results',
          'jupeb_payment_reconciliations',
        ];
        for (const tbl of safeTables) {
          const res = await this.safeQuery(
            queryRunner,
            `DELETE FROM "${tbl}" WHERE registration_id = ANY($1::uuid[])`,
            [regIds],
          );
          stats[tbl] = res.rowCount;
        }

        await queryRunner.query(
          `DELETE FROM jupeb_registrations WHERE id = ANY($1::uuid[])`,
          [regIds],
        );
        stats['jupeb_registrations'] = regIds.length;
      }

      // 4. Session events
      const evRes = await this.safeQuery(
        queryRunner,
        `DELETE FROM jupeb_session_events WHERE session_id = $1`,
        [sessionId],
      );
      stats['jupeb_session_events'] = evRes.rowCount;

      // 5. NIN verifications
      if (ninIds.length > 0) {
        const ninRes = await this.safeQuery(
          queryRunner,
          `DELETE FROM jupeb_nin_verifications WHERE id = ANY($1::uuid[])
           AND id NOT IN (SELECT nin_verification_id FROM jupeb_registrations WHERE nin_verification_id IS NOT NULL)`,
          [ninIds],
        );
        stats['jupeb_nin_verifications'] = ninRes.rowCount;
      }

      // 6. Candidate user accounts
      if (candidateUserIds.length > 0) {
        await this.safeQuery(
          queryRunner,
          `DELETE FROM jupeb_registration_status_history WHERE changed_by = ANY($1::uuid[])`,
          [candidateUserIds],
        );
        await this.safeQuery(
          queryRunner,
          `DELETE FROM jupeb_result_entries WHERE created_by = ANY($1::uuid[])`,
          [candidateUserIds],
        );

        const delPay = await this.safeQuery(queryRunner, `DELETE FROM payments WHERE user_id = ANY($1::uuid[])`, [candidateUserIds]);
        stats['payments'] = delPay.rowCount;

        const delFiles = await this.safeQuery(queryRunner, `DELETE FROM files WHERE uploaded_by = ANY($1::uuid[])`, [candidateUserIds]);
        stats['files'] = delFiles.rowCount;

        await this.safeQuery(
          queryRunner,
          `DELETE FROM notifications WHERE user_id = ANY($1::uuid[]) OR actor_id = ANY($1::uuid[])`,
          [candidateUserIds],
        );

        const userDepTables = [
          'otp_codes', 'password_resets', 'verification_tokens',
          'post_comment_likes', 'post_comments', 'post_likes', 'post_media', 'posts',
          'user_preferences', 'user_sessions', 'user_universities',
          'user_permissions', 'social_accounts', 'profiles', 'user_roles',
        ];
        for (const tbl of userDepTables) {
          const check = await this.safeQuery(
            queryRunner,
            `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
            [tbl],
          );
          if (!check.rows.length) continue;

          let res;
          if (tbl === 'post_media') {
            res = await this.safeQuery(
              queryRunner,
              `DELETE FROM post_media
               WHERE post_id IN (
                 SELECT id FROM posts WHERE user_id = ANY($1::uuid[])
               )`,
              [candidateUserIds],
            );
          } else {
            res = await this.safeQuery(
              queryRunner,
              `DELETE FROM "${tbl}" WHERE user_id = ANY($1::uuid[])`,
              [candidateUserIds],
            );
          }

          stats[tbl] = res.rowCount;
        }

        await queryRunner.query(
          `DELETE FROM users WHERE id = ANY($1::uuid[])`,
          [candidateUserIds],
        );
        stats['student_users_deleted'] = candidateUserIds.length;
      }

      await queryRunner.commitTransaction();
      return stats;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /** Clear all operational data, preserving admin users and system tables. */
  async clearAll(options: {
    includeNonAdminUsers?: boolean;
    customTables?: string[] | null;
  } = {}): Promise<Record<string, number | string>> {
    const { includeNonAdminUsers = true, customTables = null } = options;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const stats: Record<string, number | string> = {};
      const adminSubquery = this.getAdminUserIdsSubquery();

      const orderedTables = [
        ...COMMUNITY_TABLES,
        ...REGISTRATION_TABLES,
        ...FILE_AND_OCR_TABLES,
        ...PAYMENT_TABLES,
        ...LOG_AND_TOKEN_TABLES,
        ...CATALOG_TABLES,
      ];

      const tablesToClear = customTables || orderedTables;

      for (const table of tablesToClear) {
        try {
          const check = await queryRunner.query(
            `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
            [table],
          );
          if (Array.isArray(check) && check.length) {
            const countRes = await queryRunner.query(
              `SELECT COUNT(*)::int AS count FROM "${table}"`,
            );
            const rowCount = Number(countRes[0]?.count) || 0;
            if (rowCount > 0) {
              await queryRunner.query(`DELETE FROM "${table}"`);
            }
            stats[table] = rowCount;
          }
        } catch (tableErr: any) {
          stats[table] = `skipped: ${tableErr.message}`;
        }
      }

      if (includeNonAdminUsers) {
        for (const tbl of USER_TABLES) {
          try {
            const check = await queryRunner.query(
              `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
              [tbl],
            );
            if (!Array.isArray(check) || !check.length) continue;

            const idCol = tbl === 'users' ? 'id' : 'user_id';
            const countRes = await queryRunner.query(
              `SELECT COUNT(*)::int AS count FROM "${tbl}" WHERE "${idCol}" NOT IN (${adminSubquery})`,
            );
            const count = Number(countRes[0]?.count) || 0;

            if (count > 0) {
              await queryRunner.query(
                `DELETE FROM "${tbl}" WHERE "${idCol}" NOT IN (${adminSubquery})`,
              );
            }
            stats[tbl] = count;
          } catch (tblErr: any) {
            stats[tbl] = `skipped: ${tblErr.message}`;
          }
        }
      }

      await queryRunner.commitTransaction();
      return stats;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /** Main entry point called by the controller. */
  async clearDb(dto: ClearDbDto): Promise<ClearDbResultDto> {
    if (dto.confirm !== 'CONFIRM_DELETE') {
      throw new UnprocessableEntityException(
        'confirm must be "CONFIRM_DELETE"',
      );
    }

    let cleared: Record<string, number | string>;

    if (dto.session_id) {
      cleared = await this.clearBySession(dto.session_id);
    } else {
      cleared = await this.clearAll({
        customTables: dto.tables?.length ? dto.tables : null,
      });
    }

    const numericCleared: Record<string, number> = {};
    for (const [k, v] of Object.entries(cleared)) {
      numericCleared[k] = typeof v === 'number' ? v : 0;
    }

    return {
      success: true,
      message: dto.session_id
        ? `Session ${dto.session_id} records cleared successfully`
        : 'Database records cleared successfully',
      cleared: numericCleared,
    };
  }
}
