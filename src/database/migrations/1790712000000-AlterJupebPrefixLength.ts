import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterJupebPrefixLength1790712000000 implements MigrationInterface {
  name = 'AlterJupebPrefixLength1790712000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "jupeb_universities" DROP CONSTRAINT IF EXISTS "jupeb_universities_prefix_numeric"`,
    );
    await queryRunner.query(
      `ALTER TABLE "jupeb_universities" ALTER COLUMN "jupeb_prefix" TYPE character varying(20)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "jupeb_universities" ALTER COLUMN "jupeb_prefix" TYPE character(3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "jupeb_universities" ADD CONSTRAINT "jupeb_universities_prefix_numeric" CHECK (jupeb_prefix ~ '^[0-9]{3}$');`,
    );
  }
}
