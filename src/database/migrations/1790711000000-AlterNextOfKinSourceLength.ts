import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterNextOfKinSourceLength1790711000000 implements MigrationInterface {
  name = 'AlterNextOfKinSourceLength1790711000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "jupeb_next_of_kin" ALTER COLUMN "source" TYPE character varying(30)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "jupeb_next_of_kin" ALTER COLUMN "source" TYPE character varying(10)`,
    );
  }
}
