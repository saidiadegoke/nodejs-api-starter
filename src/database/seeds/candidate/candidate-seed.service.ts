import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export const TEST_CANDIDATE_EMAIL_DOMAIN = 'demo.jupeb.edu.ng';
export const TEST_CANDIDATE_EMAIL_PREFIX = 'test.candidate.';

@Injectable()
export class CandidateSeedService {
  private readonly logger = new Logger(CandidateSeedService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Seed test approved candidates without candidate numbers for finalization & sync testing.
   */
  async run(count = 10): Promise<{ sessionId: string; createdCount: number }> {
    this.logger.log(`🌱 Seeding ${count} test approved candidates...`);

    // 1. Get or create an active academic session
    let session = (
      await this.dataSource.query(
        `SELECT id, academic_year, year_short, status FROM jupeb_registration_sessions WHERE status IN ('active', 'open', 'closed') ORDER BY created_at DESC LIMIT 1`,
      )
    )[0];

    if (!session) {
      const sessionInsert = await this.dataSource.query(
        `INSERT INTO jupeb_registration_sessions (
          academic_year, year_short, status, description, created_at, updated_at
        ) VALUES (
          '2026/2027', '26', 'open', 'Test Academic Session for Sync', NOW(), NOW()
        ) RETURNING id, academic_year, year_short, status`,
      );
      session = sessionInsert[0];
      this.logger.log(`Created test session: ${session.academic_year} (${session.id})`);
    }

    // 2. Get or create a test university
    let university = (
      await this.dataSource.query(
        `SELECT id, name, code, jupeb_prefix FROM jupeb_universities ORDER BY created_at ASC LIMIT 1`,
      )
    )[0];

    if (!university) {
      const uniInsert = await this.dataSource.query(
        `INSERT INTO jupeb_universities (
          name, code, jupeb_prefix, university_type, status, created_at, updated_at
        ) VALUES (
          'University of Lagos (Demo)', 'UNILAG', '001', 'federal', 'active', NOW(), NOW()
        ) RETURNING id, name, code, jupeb_prefix`,
      );
      university = uniInsert[0];
      this.logger.log(`Created test university: ${university.name} (${university.id})`);
    }

    // 3. Get or create a test subject combination
    let combination = (
      await this.dataSource.query(
        `SELECT id FROM jupeb_subject_combinations ORDER BY created_at ASC LIMIT 1`,
      )
    )[0];

    if (!combination) {
      // Ensure at least 3 subjects exist
      const subjects = ['MTH', 'PHY', 'CHM'];
      const subjectIds: string[] = [];
      for (const code of subjects) {
        let sub = (
          await this.dataSource.query(`SELECT id FROM jupeb_subjects WHERE code = $1 LIMIT 1`, [code])
        )[0];
        if (!sub) {
          const subInsert = await this.dataSource.query(
            `INSERT INTO jupeb_subjects (code, name, status, created_at, updated_at)
             VALUES ($1, $2, 'active', NOW(), NOW()) RETURNING id`,
            [code, code === 'MTH' ? 'Mathematics' : code === 'PHY' ? 'Physics' : 'Chemistry'],
          );
          sub = subInsert[0];
        }
        subjectIds.push(sub.id);
      }

      const comboInsert = await this.dataSource.query(
        `INSERT INTO jupeb_subject_combinations (name, code, status, created_at, updated_at)
         VALUES ('Math, Physics, Chemistry', 'MPC', 'active', NOW(), NOW()) RETURNING id`,
      );
      combination = comboInsert[0];

      for (let pos = 0; pos < subjectIds.length; pos++) {
        await this.dataSource.query(
          `INSERT INTO jupeb_subject_combination_items (combination_id, subject_id, position, created_at)
           VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING`,
          [combination.id, subjectIds[pos], pos + 1],
        );
      }
    }

    // 4. Seed test student users and approved registrations
    let createdCount = 0;
    const timestamp = Date.now();

    for (let i = 1; i <= count; i++) {
      const email = `${TEST_CANDIDATE_EMAIL_PREFIX}${timestamp}.${i}@${TEST_CANDIDATE_EMAIL_DOMAIN}`;
      const phone = `+23480${String(timestamp).slice(-4)}${String(i).padStart(4, '0')}`;
      const firstName = `TestCandidate${i}`;
      const lastName = `Demo${timestamp.toString().slice(-4)}`;

      // Create user
      const userRows = await this.dataSource.query(
        `INSERT INTO users (
          email, phone, email_verified, phone_verified, status, created_at, updated_at
        ) VALUES ($1, $2, true, true, 'active', NOW(), NOW())
        ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
        RETURNING id`,
        [email, phone],
      );
      const userId = userRows[0].id;

      // Create profile
      await this.dataSource.query(
        `INSERT INTO profiles (
          user_id, first_name, last_name, display_name, gender, date_of_birth, residential_address, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, '2005-05-15', '123 Demo Campus Road, Lagos', NOW(), NOW()
        ) ON CONFLICT (user_id) DO UPDATE SET first_name = $2, last_name = $3`,
        [userId, firstName, lastName, `${firstName} ${lastName}`, i % 2 === 0 ? 'female' : 'male'],
      );

      // Create approved registration without candidate number (ready for finalization)
      const institutionCode = `DEMO/${new Date().getFullYear()}/${String(i).padStart(4, '0')}`;
      const provCode = `PROV-${new Date().getFullYear()}-${String(i).padStart(4, '0')}`;

      await this.dataSource.query(
        `INSERT INTO jupeb_registrations (
          session_id, university_id, user_id, subject_combination_id,
          institution_issued_code, provisional_candidate_code,
          jupeb_candidate_number, status, approved_at, payment_projection, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, NULL, 'approved', NOW(), 'paid', NOW(), NOW()
        )`,
        [session.id, university.id, userId, combination.id, institutionCode, provCode],
      );

      createdCount++;
    }

    this.logger.log(
      `✅ Successfully seeded ${createdCount} approved test candidates for session: ${session.id} (${session.academic_year})`,
    );

    return {
      sessionId: session.id,
      createdCount,
    };
  }

  /**
   * Clean and remove all seeded test candidates, registrations, and profiles.
   */
  async clean(): Promise<{ deletedCount: number }> {
    this.logger.log('🧹 Cleaning up test candidate registrations and users...');

    const deletedRegistrations = await this.dataSource.query(`
      DELETE FROM jupeb_registrations
      WHERE user_id IN (
        SELECT id FROM users WHERE email LIKE '%@${TEST_CANDIDATE_EMAIL_DOMAIN}' OR email LIKE '${TEST_CANDIDATE_EMAIL_PREFIX}%'
      )
      RETURNING id
    `);

    const deletedProfiles = await this.dataSource.query(`
      DELETE FROM profiles
      WHERE user_id IN (
        SELECT id FROM users WHERE email LIKE '%@${TEST_CANDIDATE_EMAIL_DOMAIN}' OR email LIKE '${TEST_CANDIDATE_EMAIL_PREFIX}%'
      )
      RETURNING id
    `);

    const deletedUsers = await this.dataSource.query(`
      DELETE FROM users
      WHERE email LIKE '%@${TEST_CANDIDATE_EMAIL_DOMAIN}' OR email LIKE '${TEST_CANDIDATE_EMAIL_PREFIX}%'
      RETURNING id
    `);

    this.logger.log(
      `🗑️ Cleanup completed: ${deletedRegistrations.length} registrations, ${deletedProfiles.length} profiles, and ${deletedUsers.length} test users removed.`,
    );

    return {
      deletedCount: deletedRegistrations.length,
    };
  }
}
