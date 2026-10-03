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

      // Create profile with all demographic fields
      await this.dataSource.query(
        `INSERT INTO profiles (
          user_id, first_name, last_name, display_name, gender, date_of_birth,
          residential_address, state_of_origin, lga, place_of_birth, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, '2005-05-15',
          '123 Demo Campus Road, Lagos', 'Lagos State', 'Ikeja', 'Ikeja General Hospital', NOW(), NOW()
        ) ON CONFLICT (user_id) DO UPDATE SET
          first_name = $2,
          last_name = $3,
          residential_address = '123 Demo Campus Road, Lagos',
          state_of_origin = 'Lagos State',
          lga = 'Ikeja',
          place_of_birth = 'Ikeja General Hospital'`,
        [userId, firstName, lastName, `${firstName} ${lastName}`, i % 2 === 0 ? 'female' : 'male'],
      );

      // Create approved registration without candidate number (ready for finalization)
      const institutionCode = `DEMO/${new Date().getFullYear()}/${String(i).padStart(4, '0')}`;
      const provCode = `PROV-${new Date().getFullYear()}-${String(i).padStart(4, '0')}`;

      const regRows = await this.dataSource.query(
        `INSERT INTO jupeb_registrations (
          session_id, university_id, user_id, subject_combination_id,
          institution_issued_code, provisional_candidate_code,
          jupeb_candidate_number, status, approved_at, payment_projection, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, NULL, 'approved', NOW(), 'paid', NOW(), NOW()
        ) RETURNING id`,
        [session.id, university.id, userId, combination.id, institutionCode, provCode],
      );
      const regId = regRows[0].id;

      // Seed Next of Kin
      await this.dataSource.query(
        `INSERT INTO jupeb_next_of_kin (
          registration_id, name, relationship, phone, email, address, source, is_active, created_at, updated_at
        ) VALUES (
          $1, $2, 'Parent', $3, $4, '123 Demo Campus Road, Lagos', 'candidate', true, NOW(), NOW()
        ) ON CONFLICT DO NOTHING`,
        [regId, `Parent of Candidate ${i}`, phone, `parent.${i}@${TEST_CANDIDATE_EMAIL_DOMAIN}`],
      );

      // Seed O-Level Examination Results (WAEC / NECO)
      const examSubjects = [
        { subject: 'English Language', grade: 'B2' },
        { subject: 'Mathematics', grade: 'A1' },
        { subject: 'Physics', grade: 'B3' },
        { subject: 'Chemistry', grade: 'A1' },
        { subject: 'Biology', grade: 'B2' },
      ];

      for (let sIdx = 0; sIdx < examSubjects.length; sIdx++) {
        const item = examSubjects[sIdx];
        await this.dataSource.query(
          `INSERT INTO jupeb_result_entries (
            registration_id, source, sitting, serial, subject, grade, created_at, updated_at
          ) VALUES (
            $1, 'waec', 1, $2, $3, $4, NOW(), NOW()
          ) ON CONFLICT DO NOTHING`,
          [regId, sIdx + 1, item.subject, item.grade],
        );
      }

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
   * Clean and remove all seeded test candidates, registrations, profiles, next of kin, and result entries.
   */
  async clean(): Promise<{ deletedCount: number }> {
    this.logger.log('🧹 Cleaning up test candidate registrations, next of kin, results, and users...');

    // Delete next of kin
    await this.dataSource.query(`
      DELETE FROM jupeb_next_of_kin
      WHERE registration_id IN (
        SELECT r.id FROM jupeb_registrations r
        JOIN users u ON u.id = r.user_id
        WHERE u.email LIKE '%@${TEST_CANDIDATE_EMAIL_DOMAIN}' OR u.email LIKE '${TEST_CANDIDATE_EMAIL_PREFIX}%'
      )
    `);

    // Delete result entries
    await this.dataSource.query(`
      DELETE FROM jupeb_result_entries
      WHERE registration_id IN (
        SELECT r.id FROM jupeb_registrations r
        JOIN users u ON u.id = r.user_id
        WHERE u.email LIKE '%@${TEST_CANDIDATE_EMAIL_DOMAIN}' OR u.email LIKE '${TEST_CANDIDATE_EMAIL_PREFIX}%'
      )
    `);

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
