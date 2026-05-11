const pool = require('../../../db/pool');
const resultEntriesModel = require('../models/result-entries.model');
const registrationModel = require('../models/registration.model');
const { getUserRoles } = require('../../../shared/middleware/rbac.middleware');
const { assertInstitutionUniversityAccess } = require('../utils/institution-scope');

function httpError(status, message, details = null) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

const ALLOWED_SOURCES = new Set(['waec', 'neco', 'nabteb', 'gce']);
const ALLOWED_SITTINGS = new Set([1, 2]);
const ROLE_INST_REVIEW = new Set([
  'super_admin',
  'admin',
  'registrar',
  'program_director',
  'institution_admin',
]);

async function userHasInstReview(userId) {
  const roles = await getUserRoles(userId);
  return roles.some((r) => ROLE_INST_REVIEW.has(r));
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

/** Collapse a printed grade to A..F. Mirrors the OCR module's normalizer. */
function normalizeGrade(rawGrade) {
  if (!rawGrade) return null;
  const g = String(rawGrade).trim().toUpperCase();
  const m = {
    A1: 'A',
    B2: 'B', B3: 'B',
    C4: 'C', C5: 'C', C6: 'C',
    D7: 'D',
    E8: 'E',
    F9: 'F',
    A: 'A', B: 'B', C: 'C', D: 'D', E: 'E', F: 'F',
    U: 'F'
  };
  return m[g] || null;
}

function validateBulkPayload(body) {
  if (!body || typeof body !== 'object') {
    throw httpError(422, 'Body is required');
  }
  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    throw httpError(422, 'entries[] is required');
  }
  if (body.entries.length > 50) {
    throw httpError(422, 'entries[] cannot exceed 50 rows');
  }

  const errors = [];
  const cleaned = [];
  const seenKeys = new Set();

  body.entries.forEach((raw, idx) => {
    const path = `entries[${idx}]`;
    if (!raw || typeof raw !== 'object') {
      errors.push({ path, error_code: 'invalid_entry' });
      return;
    }
    const source = raw.source && String(raw.source).toLowerCase().trim();
    const sitting = Number(raw.sitting);
    const serial = Number(raw.serial);
    const subject = raw.subject && String(raw.subject).trim();
    const grade = raw.grade && String(raw.grade).trim().toUpperCase();
    const score = raw.score === undefined || raw.score === null ? null : Number(raw.score);

    if (!source || !ALLOWED_SOURCES.has(source)) {
      errors.push({ path, field: 'source', error_code: 'source_invalid' });
    }
    if (!ALLOWED_SITTINGS.has(sitting)) {
      errors.push({ path, field: 'sitting', error_code: 'sitting_invalid' });
    }
    if (!Number.isInteger(serial) || serial < 0) {
      errors.push({ path, field: 'serial', error_code: 'serial_invalid' });
    }
    if (!subject || subject.length < 2) {
      errors.push({ path, field: 'subject', error_code: 'subject_required' });
    }
    if (!grade || grade.length > 4) {
      errors.push({ path, field: 'grade', error_code: 'grade_invalid' });
    }
    if (score !== null && (Number.isNaN(score) || score < 0 || score > 100)) {
      errors.push({ path, field: 'score', error_code: 'score_invalid' });
    }

    const key = `${source}|${sitting}|${serial}`;
    if (seenKeys.has(key)) {
      errors.push({ path, error_code: 'duplicate_serial_in_payload' });
    }
    seenKeys.add(key);

    cleaned.push({
      source,
      sitting,
      serial,
      subject: subject ? subject.toUpperCase() : null,
      grade,
      score,
      grade_normalized: normalizeGrade(grade)
    });
  });

  if (errors.length) {
    throw httpError(422, 'Result entries payload invalid', { errors });
  }
  return cleaned;
}

class ResultEntriesService {
  async listMine(userId) {
    const reg = await registrationModel.findLatestForUser(userId);
    if (!reg) throw httpError(404, 'No registration found for current user');
    const rows = await resultEntriesModel.findByRegistration(reg.id);
    return { registration_id: reg.id, entries: rows };
  }

  async upsertMine(userId, body) {
    const reg = await registrationModel.findLatestForUser(userId);
    if (!reg) throw httpError(404, 'No registration found for current user');
    const cleaned = validateBulkPayload(body);

    const rows = cleaned.map((c) => ({
      registration_id: reg.id,
      ...c,
      origin: 'manual',
      ocr_job_id: null,
      created_by: userId
    }));

    const saved = await resultEntriesModel.bulkUpsert(rows);
    return {
      registration_id: reg.id,
      upserted_count: saved.length,
      entries: saved
    };
  }

  /**
   * M.13 — Registrar listing of result entries with origin + OCR confidence.
   * Joins ocr_results so the registrar UI can see how confident the OCR
   * extraction was when deciding whether to accept or override.
   */
  async listForInstitution(viewerId, registrationId) {
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const ok = await userHasInstReview(viewerId);
    if (!ok) throw httpError(403, 'Forbidden');

    const reg = await registrationModel.findById(registrationId);
    if (!reg) throw httpError(404, 'Registration not found');
    await assertInstitutionUniversityAccess(viewerId, reg.university_id);

    const result = await pool.query(
      `SELECT e.*,
              ores.confidence AS ocr_confidence,
              ores.exam_type_detected AS ocr_exam_type
         FROM jupeb_result_entries e
         LEFT JOIN ocr_results ores ON ores.job_id = e.ocr_job_id
        WHERE e.registration_id = $1
        ORDER BY e.source ASC, e.sitting ASC, e.serial ASC`,
      [registrationId]
    );

    // Group by (source, sitting) so the institution UI can render side-by-side.
    const groups = {};
    for (const row of result.rows) {
      const key = `${row.source}-${row.sitting}`;
      if (!groups[key]) {
        groups[key] = {
          source: row.source,
          sitting: row.sitting,
          rows: [],
        };
      }
      groups[key].rows.push({
        id: row.id,
        serial: row.serial,
        subject: row.subject,
        grade: row.grade,
        grade_normalized: row.grade_normalized,
        score: row.score,
        origin: row.origin,
        ocr_job_id: row.ocr_job_id,
        ocr_confidence: row.ocr_confidence !== null && row.ocr_confidence !== undefined
          ? Number(row.ocr_confidence)
          : null,
        ocr_exam_type: row.ocr_exam_type,
        updated_at: row.updated_at,
      });
    }

    return {
      registration_id: registrationId,
      groups: Object.values(groups).map((g) => ({
        source: g.source,
        sitting: g.sitting,
        subjects: g.rows.sort((a, b) => a.serial - b.serial),
      })),
    };
  }

  /**
   * M.13 — Registrar override of a single entry. Sets origin='manual' so the
   * row is no longer a candidate for OCR overwrite.
   */
  async patchInstitutionEntry(viewerId, entryId, body) {
    if (!isUuid(entryId)) throw httpError(422, 'Invalid entry id');
    const ok = await userHasInstReview(viewerId);
    if (!ok) throw httpError(403, 'Forbidden');

    const existing = await resultEntriesModel.findById(entryId);
    if (!existing) throw httpError(404, 'Entry not found');

    const reg = await registrationModel.findById(existing.registration_id);
    if (!reg) throw httpError(404, 'Registration not found');
    await assertInstitutionUniversityAccess(viewerId, reg.university_id);

    const errors = [];
    const update = { origin: 'manual' };

    if (body.subject !== undefined) {
      const s = String(body.subject || '').trim();
      if (s.length < 2) errors.push({ field: 'subject', error_code: 'subject_required' });
      else update.subject = s.toUpperCase();
    }
    if (body.grade !== undefined) {
      const g = String(body.grade || '').trim().toUpperCase();
      if (!g || g.length > 4) {
        errors.push({ field: 'grade', error_code: 'grade_invalid' });
      } else {
        update.grade = g;
        update.grade_normalized = normalizeGrade(g);
      }
    }
    if (body.score !== undefined) {
      if (body.score === null) {
        update.score = null;
      } else {
        const n = Number(body.score);
        if (Number.isNaN(n) || n < 0 || n > 100) {
          errors.push({ field: 'score', error_code: 'score_invalid' });
        } else {
          update.score = Math.round(n);
        }
      }
    }
    if (errors.length) throw httpError(422, 'Override payload invalid', { errors });
    if (Object.keys(update).length === 1) {
      // Only `origin` would change — no-op write.
      return existing;
    }
    return resultEntriesModel.updateById(entryId, update);
  }
}

module.exports = new ResultEntriesService();
module.exports.normalizeGrade = normalizeGrade;
module.exports.validateBulkPayload = validateBulkPayload;
