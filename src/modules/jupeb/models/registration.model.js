const axios = require('axios');
const pool = require('../../../db/pool');
const registrationKpi = require('../services/registration-kpi.service');

class RegistrationModel {
  async appendHistory({ registration_id, from_status, to_status, reason, changed_by }) {
    await pool.query(
      `INSERT INTO jupeb_registration_status_history (registration_id, from_status, to_status, reason, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [registration_id, from_status || null, to_status, reason || null, changed_by]
    );
  }

  async findById(id) {
    const result = await pool.query(`SELECT * FROM jupeb_registrations WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }

  /**
   * Registrations linked to a NIN verification row (may be more than one when
   * session/university differ — callers enforce business rules).
   */
  async findByNinVerificationId(ninVerificationId) {
    if (!ninVerificationId) return [];
    const result = await pool.query(
      `SELECT id, status, session_id, university_id, nin_verification_id
         FROM jupeb_registrations
        WHERE nin_verification_id = $1
        ORDER BY created_at DESC`,
      [ninVerificationId]
    );
    return result.rows;
  }

  /**
   * True when a non-retry registration exists for this NIN hash. Rejected and
   * withdrawn rows are ignored so a candidate may re-apply after those outcomes.
   */
  async hasBlockingRegistrationForNinHash(ninHash, { sessionId } = {}) {
    if (!ninHash) return false;
    const values = [ninHash];
    let sessionClause = '';
    if (sessionId) {
      values.push(sessionId);
      sessionClause = ` AND r.session_id = $${values.length}`;
    }
    const result = await pool.query(
      `SELECT 1
         FROM jupeb_registrations r
         INNER JOIN jupeb_nin_verifications nv ON nv.id = r.nin_verification_id
        WHERE nv.nin_hash = $1
          AND r.status NOT IN ('rejected', 'withdrawn')
          ${sessionClause}
        LIMIT 1`,
      values
    );
    return result.rowCount > 0;
  }

  async findByInstitutionCode(code) {
    const result = await pool.query(
      `SELECT * FROM jupeb_registrations WHERE institution_issued_code = $1`,
      [String(code).trim()]
    );
    return result.rows[0] || null;
  }

  async findLatestForUser(userId) {
    // Prefer a registration in the currently-open session — that's the
    // one the student is actively working on. If they don't have one in
    // the open session (or no session is open), fall back to whichever
    // row was touched most recently. Tie-breaker on created_at keeps
    // the ordering deterministic when nothing has been updated yet.
    const result = await pool.query(
      `SELECT r.*
         FROM jupeb_registrations r
         LEFT JOIN jupeb_registration_sessions s ON s.id = r.session_id
        WHERE r.user_id = $1
        ORDER BY (s.status = 'open') DESC,
                 r.updated_at DESC NULLS LAST,
                 r.created_at DESC
        LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  async nextProvisionalSerial(sessionId, universityId) {
    const result = await pool.query(
      `SELECT COALESCE(MAX(provisional_serial), 0) + 1 AS n
       FROM jupeb_registrations WHERE session_id = $1 AND university_id = $2`,
      [sessionId, universityId]
    );
    return result.rows[0].n;
  }

  async insertRegistration(data) {
    const {
      session_id,
      university_id,
      user_id,
      subject_combination_id,
      nin_verification_id,
      institution_issued_code,
      provisional_serial,
      provisional_candidate_code,
      status,
      created_by,
      institution_code_expires_at,
    } = data;
    const result = await pool.query(
      `INSERT INTO jupeb_registrations (
        session_id, university_id, user_id, subject_combination_id, nin_verification_id,
        institution_issued_code, provisional_serial, provisional_candidate_code, status, created_by,
        institution_code_expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        session_id,
        university_id,
        user_id || null,
        subject_combination_id,
        nin_verification_id || null,
        institution_issued_code,
        provisional_serial,
        provisional_candidate_code,
        status,
        created_by,
        institution_code_expires_at || null,
      ]
    );
    return result.rows[0];
  }

  async updateRegistration(id, fields) {
    const allowed = [
      'user_id',
      'subject_combination_id',
      'nin_verification_id',
      'status',
      'status_reason',
      'dashboard_unlocked_at',
      'claimed_at',
      'submitted_at',
      'approved_at',
      'approved_by',
      'jupeb_candidate_number',
      'payment_projection',
      'institution_code_expires_at',
    ];
    const sets = [];
    const values = [];
    let i = 1;
    for (const k of allowed) {
      if (fields[k] !== undefined) {
        sets.push(`${k} = $${i++}`);
        values.push(fields[k]);
      }
    }
    if (!sets.length) return this.findById(id);
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    const result = await pool.query(
      `UPDATE jupeb_registrations SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async setBiometricSkip(id, captureType) {
    const column = captureType === 'face' ? 'face_skipped_at' : 'fingerprint_skipped_at';
    const result = await pool.query(
      `UPDATE jupeb_registrations
         SET ${column} = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }

  async updateAcademicIntake(id, { sittings_count, result_types }) {
    const result = await pool.query(
      `UPDATE jupeb_registrations
         SET sittings_count = $2,
             result_types = $3::jsonb,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id, sittings_count, JSON.stringify(result_types || [])]
    );
    return result.rows[0];
  }

  /**
   * E.1 + E.2 + E.3 — institution list with candidate identity join, search,
   * bucket filter, and computed biometric_status.
   *
   * Returns `enriched` rows: each row carries the registration columns plus
   *   - candidate: { id, name, email, candidate_id }
   *   - biometric_status: 'yes' | 'partial' | 'no'
   *   - university: { id, name, short_name }
   *
   * Filters:
   *   - university_id, session_id, status (legacy)
   *   - bucket: 'approved' | 'pending' | 'rejected' | 'withdrawn' (server-side mapping)
   *   - q: fuzzy ILIKE on full name, email, provisional_candidate_code,
   *     jupeb_candidate_number, institution_issued_code
   */
  _buildInstitutionWhere({ university_id, session_id, status, bucket, q }) {
    const where = ['1=1'];
    const values = [];
    let idx = 1;
    if (university_id) {
      where.push(`r.university_id = $${idx++}`);
      values.push(university_id);
    }
    if (session_id) {
      where.push(`r.session_id = $${idx++}`);
      values.push(session_id);
    }
    // Status filtering. `bucket` — or a `status` that is itself a bucket
    // word — filters by the coarse pending / approved / rejected /
    // withdrawn grouping; any other `status` is an exact raw-status match.
    // `pending` is "not yet decided" — every status that isn't terminal.
    const BUCKET_WORDS = ['pending', 'approved', 'rejected', 'withdrawn'];
    const bucketFilter = bucket || (BUCKET_WORDS.includes(status) ? status : null);
    const rawStatus = bucketFilter ? null : status;
    if (rawStatus) {
      where.push(`r.status = $${idx++}`);
      values.push(rawStatus);
    }
    if (bucketFilter === 'pending') {
      where.push(`r.status NOT IN ('approved', 'rejected', 'withdrawn')`);
    } else if (bucketFilter) {
      where.push(`r.status = $${idx++}`);
      values.push(bucketFilter);
    }
    if (q) {
      const term = `%${String(q).trim()}%`;
      where.push(
        `(
          COALESCE(p.display_name, '') ILIKE $${idx} OR
          COALESCE(p.first_name, '')   ILIKE $${idx} OR
          COALESCE(p.last_name, '')    ILIKE $${idx} OR
          COALESCE(u.email, '')        ILIKE $${idx} OR
          COALESCE(r.provisional_candidate_code, '') ILIKE $${idx} OR
          COALESCE(r.jupeb_candidate_number, '')      ILIKE $${idx} OR
          COALESCE(r.institution_issued_code, '')     ILIKE $${idx} OR
          COALESCE(nv.intake_payload->>'name', '')    ILIKE $${idx} OR
          COALESCE(nv.intake_payload->>'email', '')   ILIKE $${idx} OR
          COALESCE(TRIM(CONCAT(COALESCE(nv.response_payload->>'first_name', ''), ' ', COALESCE(nv.response_payload->>'last_name', ''))), '') ILIKE $${idx}
        )`
      );
      values.push(term);
      idx += 1;
    }
    return { whereSql: where.join(' AND '), values, nextIdx: idx };
  }

  async listInstitution({ university_id, session_id, status, bucket, q, limit, offset }) {
    const { whereSql, values, nextIdx } = this._buildInstitutionWhere({
      university_id, session_id, status, bucket, q,
    });
    const sql = `
      SELECT
        r.*,
        u.email AS user_email,
        p.first_name,
        p.last_name,
        p.display_name,
        uni.id   AS uni_id,
        uni.name AS uni_name,
        uni.short_name AS uni_short_name,
        COALESCE(b.has_face, false)        AS has_face,
        COALESCE(b.has_fingerprint, false) AS has_fingerprint,
        (nv.intake_payload->>'name') AS nin_intake_name,
        (nv.intake_payload->>'email') AS nin_intake_email,
        nv.status AS nin_verification_status,
        NULLIF(TRIM(CONCAT(COALESCE(nv.response_payload->>'first_name', ''), ' ', COALESCE(nv.response_payload->>'last_name', ''))), '') AS nin_display_name
      FROM jupeb_registrations r
      LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN jupeb_universities uni ON uni.id = r.university_id
      LEFT JOIN jupeb_nin_verifications nv ON nv.id = r.nin_verification_id
      LEFT JOIN (
        SELECT registration_id,
               BOOL_OR(capture_type = 'face')        AS has_face,
               BOOL_OR(capture_type = 'fingerprint') AS has_fingerprint
        FROM jupeb_biometric_captures
        GROUP BY registration_id
      ) b ON b.registration_id = r.id
      WHERE ${whereSql}
      ORDER BY r.created_at DESC
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const result = await pool.query(sql, [...values, limit, offset]);
    return result.rows;
  }

  async countInstitution({ university_id, session_id, status, bucket, q }) {
    const { whereSql, values } = this._buildInstitutionWhere({
      university_id, session_id, status, bucket, q,
    });
    const sql = `
      SELECT COUNT(*)::int AS c
      FROM jupeb_registrations r
      LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN jupeb_universities uni ON uni.id = r.university_id
      LEFT JOIN jupeb_nin_verifications nv ON nv.id = r.nin_verification_id
      WHERE ${whereSql}`;
    const result = await pool.query(sql, values);
    return result.rows[0].c;
  }

  /**
   * E.4 — bucket counts scoped to (university_id?, session_id?).
   * Returns { total, approved, pending, rejected, with_biometrics, total_subject_combinations }.
   * Uses shared KPI SQL (aligned with program dashboard stat-cards). `total` includes withdrawn.
   */
  async statsInstitution({ university_id, session_id }) {
    const row = await registrationKpi.kpiCounts(university_id || null, session_id || null);
    return {
      total: row.total,
      approved: row.approved,
      pending: row.pending,
      rejected: row.rejected,
      with_biometrics: row.biometric,
      total_subject_combinations: row.total_subject_combinations,
    };
  }

  /**
   * E.5 — registrations grouped by university (for the bar chart).
   */
  async byUniversity({ session_id, university_id, limit = 12 }) {
    const values = [];
    const where = ['1=1'];
    let idx = 1;
    if (session_id) {
      where.push(`r.session_id = $${idx++}`);
      values.push(session_id);
    }
    if (university_id) {
      where.push(`r.university_id = $${idx++}`);
      values.push(university_id);
    }
    values.push(limit);
    const sql = `
      SELECT uni.id   AS university_id,
             uni.name AS university_name,
             uni.short_name AS short_name,
             COUNT(r.id)::int AS registered_count
      FROM jupeb_registrations r
      JOIN jupeb_universities uni ON uni.id = r.university_id
      WHERE ${where.join(' AND ')}
      GROUP BY uni.id, uni.name, uni.short_name
      ORDER BY registered_count DESC, uni.name ASC
      LIMIT $${idx}`;
    const result = await pool.query(sql, values);
    return result.rows;
  }

  async findApprovedWithoutCandidateNumber(sessionId) {
    const result = await pool.query(
      `SELECT r.*, u.jupeb_prefix AS university_jupeb_prefix
       FROM jupeb_registrations r
       JOIN jupeb_universities u ON u.id = r.university_id
       WHERE r.session_id = $1 AND r.status = 'approved' AND r.jupeb_candidate_number IS NULL
       ORDER BY r.university_id, r.provisional_serial ASC`,
      [sessionId]
    );
    return result.rows;
  }

  async setCandidateNumber(id, number) {
    const result = await pool.query(
      `UPDATE jupeb_registrations SET jupeb_candidate_number = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id, number]
    );
    return result.rows[0];
  }

  /** Idempotent finalize: only rows still without a final number are updated. */
  async setCandidateNumberIfNull(id, number) {
    const result = await pool.query(
      `UPDATE jupeb_registrations
       SET jupeb_candidate_number = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND jupeb_candidate_number IS NULL
       RETURNING *`,
      [id, number]
    );
    return result.rows[0];
  }

  async getStudentSyncPayloads(registrationIds) {
    if (!registrationIds || !registrationIds.length) return [];
    const query = `
      SELECT
        r.jupeb_candidate_number AS "jupebNumber",
        p.first_name AS "firstName",
        p.last_name AS "lastName",
        u.email AS "email",
        uni.jupeb_prefix AS "institutionCode",
        'STUDENT' AS "role",
        UPPER(p.gender) AS "gender",
        p.date_of_birth AS "dateOfBirth",
        u.phone AS "phone",
        p.residential_address AS "address",
        p.profile_photo_url AS "base64image",
        (
          SELECT array_agg(si.code)
          FROM jupeb_subject_combination_items sci
          JOIN jupeb_subjects si ON si.id = sci.subject_id
          WHERE sci.combination_id = r.subject_combination_id
        ) AS "subjects"
      FROM jupeb_registrations r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN profiles p ON p.user_id = u.id
      JOIN jupeb_universities uni ON uni.id = r.university_id
      WHERE r.id = ANY($1::uuid[])
    `;
    const result = await pool.query(query, [registrationIds]);
    
    // Fetch images and convert to base64 data URIs
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];
      if (row.base64image && row.base64image.startsWith('http')) {
        try {
          const imageRes = await axios.get(row.base64image, { responseType: 'arraybuffer' });
          const contentType = imageRes.headers['content-type'] || 'image/jpeg';
          const base64 = Buffer.from(imageRes.data).toString('base64');
          row.base64image = `data:${contentType};base64,${base64}`;
        } catch (err) {
          console.error(`[AttendanceSync] Failed to fetch image for jupebNumber ${row.jupebNumber}:`, err.message);
          row.base64image = "";
        }
      }
    }
    
    return result.rows;
  }

  async updateAttendanceSync(registrationId, { registrationCode, studentId }) {
    const result = await pool.query(
      `UPDATE jupeb_registrations
       SET attendance_registration_code = $2, attendance_student_id = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [registrationId, registrationCode, studentId]
    );
    return result.rowCount > 0;
  }

  /** Hard-delete a registration row; child tables with ON DELETE CASCADE are cleaned up. */
  async deleteRegistration(id) {
    const result = await pool.query(`DELETE FROM jupeb_registrations WHERE id = $1 RETURNING id`, [id]);
    return result.rows[0] || null;
  }
}

module.exports = new RegistrationModel();
