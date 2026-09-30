import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrationName1790705187668 implements MigrationInterface {
  name = 'MigrationName1790705187668';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Initial schema baseline migration placeholder
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op
  }
}
