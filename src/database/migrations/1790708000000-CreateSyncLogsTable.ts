import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSyncLogsTable1790708000000 implements MigrationInterface {
  name = 'CreateSyncLogsTable1790708000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "jupeb_sync_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "entity_type" character varying(50) NOT NULL,
        "entity_id" character varying(255),
        "target" character varying(50) NOT NULL DEFAULT 'all',
        "status" character varying(30) NOT NULL DEFAULT 'pending',
        "job_id" character varying(255),
        "attempt_count" integer NOT NULL DEFAULT 1,
        "max_attempts" integer NOT NULL DEFAULT 5,
        "triggered_by" character varying(100),
        "user_id" uuid,
        "payload" jsonb,
        "response_payload" jsonb,
        "error_message" text,
        "error_details" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_jupeb_sync_logs_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sync_logs_entity" ON "jupeb_sync_logs" ("entity_type", "entity_id");
      CREATE INDEX IF NOT EXISTS "idx_sync_logs_status" ON "jupeb_sync_logs" ("status");
      CREATE INDEX IF NOT EXISTS "idx_sync_logs_created_at" ON "jupeb_sync_logs" ("created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "jupeb_sync_logs"`);
  }
}
