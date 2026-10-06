import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJupebUniversityIdToUserUniversities1790709000000 implements MigrationInterface {
  name = 'AddJupebUniversityIdToUserUniversities1790709000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_universities" 
      ADD COLUMN IF NOT EXISTS "jupeb_university_id" uuid;
    `);

    await queryRunner.query(`
      UPDATE "user_universities" 
      SET "jupeb_university_id" = "university_id" 
      WHERE "jupeb_university_id" IS NULL AND "university_id" IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION sync_user_universities_ids()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.jupeb_university_id IS NULL AND NEW.university_id IS NOT NULL THEN
          NEW.jupeb_university_id := NEW.university_id;
        ELSIF NEW.university_id IS NULL AND NEW.jupeb_university_id IS NOT NULL THEN
          NEW.university_id := NEW.jupeb_university_id;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_sync_user_universities_ids ON "user_universities";
      CREATE TRIGGER trg_sync_user_universities_ids
      BEFORE INSERT OR UPDATE ON "user_universities"
      FOR EACH ROW EXECUTE FUNCTION sync_user_universities_ids();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_sync_user_universities_ids ON "user_universities";
      DROP FUNCTION IF EXISTS sync_user_universities_ids();
      ALTER TABLE "user_universities" DROP COLUMN IF EXISTS "jupeb_university_id";
    `);
  }
}
