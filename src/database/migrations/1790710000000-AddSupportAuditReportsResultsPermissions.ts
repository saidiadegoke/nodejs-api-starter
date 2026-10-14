import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSupportAuditReportsResultsPermissions1790710000000 implements MigrationInterface {
  name = 'AddSupportAuditReportsResultsPermissions1790710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Insert permissions
    await queryRunner.query(`
      INSERT INTO "permissions" ("name", "resource", "action", "description")
      VALUES
        ('support.view', 'support', 'view', 'View support tickets and inquiries'),
        ('support.manage', 'support', 'manage', 'Manage support tickets, assignments, replies, and status'),
        ('audit.view', 'audit', 'view', 'View and export system audit trail logs'),
        ('reports.generate', 'reports', 'generate', 'Generate session and analytical reports'),
        ('generate.report', 'generate', 'report', 'Generate reports (alias)'),
        ('results.send', 'results', 'send', 'Release and send examination results to institutions and students'),
        ('send.result', 'send', 'result', 'Send examination results (alias)'),
        ('results.view', 'results', 'view', 'View released examination results')
      ON CONFLICT ("name") DO UPDATE SET
        "description" = EXCLUDED."description",
        "resource" = EXCLUDED."resource",
        "action" = EXCLUDED."action";
    `);

    // 2. Assign permissions to roles
    const assignments = [
      {
        roles: ['super_admin', 'admin'],
        permissions: [
          'support.view',
          'support.manage',
          'audit.view',
          'reports.view',
          'reports.generate',
          'generate.report',
          'results.send',
          'send.result',
          'results.view',
        ],
      },
      {
        roles: ['registrar'],
        permissions: [
          'results.send',
          'send.result',
          'results.view',
          'reports.view',
          'reports.generate',
          'generate.report',
          'audit.view',
        ],
      },
      {
        roles: ['institution_admin', 'program_director'],
        permissions: [
          'support.view',
          'support.manage',
          'audit.view',
          'reports.view',
          'reports.generate',
          'generate.report',
          'results.view',
          'results.send',
          'send.result',
        ],
      },
      {
        roles: ['agent'],
        permissions: ['support.view', 'support.manage'],
      },
    ];

    for (const group of assignments) {
      for (const roleName of group.roles) {
        for (const permName of group.permissions) {
          await queryRunner.query(
            `
            INSERT INTO "role_permissions" ("role_id", "permission_id")
            SELECT r."id", p."id"
            FROM "roles" r, "permissions" p
            WHERE r."name" = $1 AND p."name" = $2
            ON CONFLICT DO NOTHING;
            `,
            [roleName, permName],
          );
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const permNames = [
      'support.view',
      'support.manage',
      'audit.view',
      'reports.generate',
      'generate.report',
      'results.send',
      'send.result',
      'results.view',
    ];

    await queryRunner.query(
      `
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "name" = ANY($1));
      `,
      [permNames],
    );

    await queryRunner.query(
      `
      DELETE FROM "permissions"
      WHERE "name" = ANY($1);
      `,
      [permNames],
    );
  }
}
