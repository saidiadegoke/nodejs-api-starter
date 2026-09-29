const pool = require('../../../db/pool');
const FileModel = require('../../files/models/file.model');
const FileService = require('../../files/services/file.service');
const OcrJobModel = require('../models/ocr-job.model');
const OcrResultModel = require('../models/ocr-result.model');
const ocrWorker = require('./ocr.worker');
const {
  assertMimeAllowed,
  assertSizeAllowed,
  assertExamType,
  ocrError,
  isUuid
} = require('../validations/ocr.validation');
const { hasPermission, getUserRoles } =
  require('../../../utils/middleware/rbac.middleware');

const STAFF_ROLES = new Set(['admin', 'super_admin', 'registrar']);

const SYNC_WAIT_MS = 30000;

async function isStaff(userId) {
  if (!userId) return false;
  const roles = await getUserRoles(userId);
  return roles.some((r) => STAFF_ROLES.has(r));
}

async function canReadAny(userId) {
  if (await isStaff(userId)) return true;
  return hasPermission(userId, 'ocr.read.any');
}

class OcrService {
  /**
   * Create an OCR job from one of:
   *   - existing file_id (already uploaded via /files/upload)
   *   - direct multer file (req.file) — uploaded as part of this request
   *   - base64 payload via { data, filename, mime_type }
   */
  static async createJob({
    userId,
    fileId = null,
    multerFile = null,
    base64 = null,
    examType = 'auto',
    wait = false,
    context = null,
    metadata = {}
  }) {
    assertExamType(examType);

    // Resolve to a stored file record
    let fileRecord;
    let directBuffer = null;
    let directMime = null;
    let directFilename = null;

    if (multerFile) {
      assertMimeAllowed(multerFile.mimetype);
      assertSizeAllowed(multerFile.size || (multerFile.buffer && multerFile.buffer.length) || 0);
      fileRecord = await FileService.uploadFile(multerFile, userId, context || 'ocr');
      directBuffer = multerFile.buffer;
      directMime = multerFile.mimetype;
      directFilename = multerFile.originalname;
    } else if (base64 && base64.data && base64.filename) {
      // FileService.uploadFromBase64 stores the record. We then derive the
      // buffer locally so the worker doesn't have to re-fetch it.
      const buffer = Buffer.from(
        String(base64.data).replace(/^data:.+;base64,/, ''),
        'base64'
      );
      const mime = base64.mime_type || 'application/pdf';
      assertMimeAllowed(mime);
      assertSizeAllowed(buffer.length);
      fileRecord = await FileService.uploadFromBase64(
        base64.data,
        userId,
        context || 'ocr',
        base64.filename
      );
      directBuffer = buffer;
      directMime = mime;
      directFilename = base64.filename;
    } else if (fileId) {
      if (!isUuid(fileId)) {
        throw ocrError('OCR_INVALID_FILE_ID', 'file_id is not a valid uuid', 400);
      }
      fileRecord = await FileModel.findById(fileId);
      if (!fileRecord) {
        throw ocrError('OCR_FILE_NOT_FOUND', 'File not found', 404);
      }
      const owns = fileRecord.uploaded_by === userId;
      if (!owns && !(await canReadAny(userId))) {
        throw ocrError('OCR_NOT_OWNER', 'Not allowed to access this file', 403);
      }
      assertMimeAllowed(fileRecord.file_type);
      assertSizeAllowed(fileRecord.file_size || 0);
    } else {
      throw ocrError(
        'OCR_INPUT_REQUIRED',
        'Provide one of: file (multipart), file_id (json), or data+filename (json)',
        400
      );
    }

    const job = await OcrJobModel.create({
      file_id: fileRecord.id,
      exam_type: examType,
      provider: 'pdf_text',
      requested_by: userId,
      context,
      metadata: { ...metadata, source_file_id: fileRecord.id }
    });

    const promise = ocrWorker.enqueue(job.id, {
      directBuffer,
      directMime,
      directFilename
    });

    if (!wait) {
      promise.catch(() => {}); // worker logs internally; fire-and-forget
      return { job, completedJob: null };
    }

    const completedJob = await Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve(null), SYNC_WAIT_MS))
    ]);
    if (completedJob) {
      return { job, completedJob };
    }
    const refreshed = await OcrJobModel.findById(job.id);
    return { job, completedJob: refreshed };
  }

  static async getJob(jobId, viewerId) {
    if (!isUuid(jobId)) throw ocrError('OCR_INVALID_JOB_ID', 'Invalid job id', 400);
    const job = await OcrJobModel.findById(jobId);
    if (!job) throw ocrError('OCR_JOB_NOT_FOUND', 'Job not found', 404);

    const owns = job.requested_by === viewerId;
    const staff = await canReadAny(viewerId);
    if (!owns && !staff) {
      throw ocrError('OCR_NOT_OWNER', 'Not allowed to view this job', 403);
    }
    const result = await OcrResultModel.findByJobId(jobId);
    return { job, result, viewerIsStaff: staff };
  }

  static async listJobs({ viewerId, status, examType, fileId, page, limit }) {
    const staff = await canReadAny(viewerId);
    const requestedBy = staff ? null : viewerId;
    const list = await OcrJobModel.list({
      requestedBy,
      status,
      examType,
      fileId,
      page,
      limit
    });
    return { ...list, viewerIsStaff: staff };
  }

  static async retryJob(jobId, viewerId) {
    const { job } = await OcrService.getJob(jobId, viewerId);
    if (job.status !== 'failed') {
      throw ocrError('OCR_RETRY_NOT_ALLOWED', 'Only failed jobs can be retried', 409);
    }
    const newJob = await OcrJobModel.create({
      file_id: job.file_id,
      exam_type: job.exam_type,
      provider: 'pdf_text',
      requested_by: viewerId,
      context: job.context,
      metadata: { ...(job.metadata || {}), retry_of: job.id }
    });
    const promise = ocrWorker.enqueue(newJob.id, {});
    promise.catch(() => {});
    return newJob;
  }

  static async bindRequirement({ jobId, viewerId, registrationId, requirementId }) {
    if (!isUuid(jobId)) throw ocrError('OCR_INVALID_JOB_ID', 'Invalid job id', 400);
    if (!isUuid(registrationId)) {
      throw ocrError('OCR_INVALID_REGISTRATION_ID', 'Invalid registration id', 400);
    }
    if (!isUuid(requirementId)) {
      throw ocrError('OCR_INVALID_REQUIREMENT_ID', 'Invalid requirement id', 400);
    }
    const job = await OcrJobModel.findById(jobId);
    if (!job) throw ocrError('OCR_JOB_NOT_FOUND', 'Job not found', 404);
    if (job.status !== 'completed') {
      throw ocrError('OCR_JOB_NOT_COMPLETED', 'Only completed jobs can be bound', 409);
    }
    const owns = job.requested_by === viewerId;
    const allowed = owns || (await hasPermission(viewerId, 'ocr.requirement.bind'));
    if (!allowed) {
      throw ocrError('OCR_NOT_OWNER', 'Not allowed to bind this job', 403);
    }
    const updated = await OcrJobModel.updateMetadata(job.id, {
      ...(job.metadata || {}),
      binding: {
        registration_id: registrationId,
        requirement_id: requirementId,
        bound_by: viewerId,
        bound_at: new Date().toISOString()
      }
    });
    return updated;
  }

  static async getLatestForFile({ fileId, viewerId }) {
    if (!isUuid(fileId)) throw ocrError('OCR_INVALID_FILE_ID', 'Invalid file id', 400);
    const file = await FileModel.findById(fileId);
    if (!file) throw ocrError('OCR_FILE_NOT_FOUND', 'File not found', 404);

    const staff = await canReadAny(viewerId);
    if (!staff && file.uploaded_by !== viewerId) {
      throw ocrError('OCR_NOT_OWNER', 'Not allowed to view this file', 403);
    }
    const job = await OcrJobModel.findLatestCompletedByFile(fileId);
    if (!job) {
      throw ocrError('OCR_NO_RESULT', 'No completed OCR job for this file', 404);
    }
    const result = await OcrResultModel.findByJobId(job.id);
    return { job, result, viewerIsStaff: staff };
  }

  /**
   * Create a manually-entered result (no file, no OCR pipeline).
   *
   * @param {object} opts
   * @param {string}   opts.userId      - authenticated user
   * @param {string}   opts.examType    - 'waec' | 'neco' | 'nabteb' | 'gce' | 'generic'
   * @param {Array}    opts.subjects    - [{ name, grade }]
   * @param {object}   [opts.metadata]  - forwarded as-is (registration_id, requirement_id, etc.)
   * @param {string}   [opts.context]   - optional label
   * @returns {{ job, result }}
   */
  static async createManualEntry({
    userId,
    examType,
    subjects,
    metadata = {},
    context = null
  }) {
    // Validate exam type (reuse existing assertion; 'auto' not allowed for manual)
    const { ALLOWED_EXAM_TYPES } = require('../validations/ocr.validation');
    const manualAllowed = ALLOWED_EXAM_TYPES.filter((t) => t !== 'auto');
    if (!manualAllowed.includes(examType)) {
      throw ocrError(
        'OCR_INVALID_EXAM_TYPE',
        `exam_type must be one of: ${manualAllowed.join(', ')}`,
        400
      );
    }

    // Validate subjects array
    if (!Array.isArray(subjects) || subjects.length === 0) {
      throw ocrError('OCR_MANUAL_NO_SUBJECTS', 'subjects must be a non-empty array', 400);
    }
    const VALID_GRADES = new Set([
      'A1','B2','B3','C4','C5','C6','D7','E8','F9'
    ]);
    for (const s of subjects) {
      if (!s || typeof s.name !== 'string' || !s.name.trim()) {
        throw ocrError('OCR_MANUAL_INVALID_SUBJECT', 'Each subject must have a non-empty name', 400);
      }
      if (!s.grade || !VALID_GRADES.has(String(s.grade).toUpperCase())) {
        throw ocrError(
          'OCR_MANUAL_INVALID_GRADE',
          `Invalid grade '${s.grade}' for subject '${s.name}'. Allowed: ${[...VALID_GRADES].join(', ')}`,
          400
        );
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert job — file_id is NULL for manual entries
      const jobResult = await client.query(
        `INSERT INTO ocr_jobs
           (file_id, exam_type, provider, status,
            attempt_count, started_at, completed_at,
            requested_by, context, metadata)
         VALUES (NULL, $1, 'manual', 'completed',
                 1, NOW(), NOW(),
                 $2, $3, $4::jsonb)
         RETURNING *`,
        [
          examType,
          userId,
          context,
          JSON.stringify(metadata)
        ]
      );
      const job = jobResult.rows[0];

      // Normalise subjects for result_json
      const normalisedSubjects = subjects.map((s) => ({
        name: s.name.trim(),
        grade: String(s.grade).toUpperCase()
      }));

      // Insert result
      const resultRow = await client.query(
        `INSERT INTO ocr_results
           (job_id, exam_type_detected, confidence, result_json,
            raw_text, provider_payload, page_count)
         VALUES ($1, $2, 100, $3::jsonb, '', '{}'::jsonb, 0)
         RETURNING *`,
        [
          job.id,
          examType,
          JSON.stringify({ subjects: normalisedSubjects, source: 'manual' })
        ]
      );
      const result = resultRow.rows[0];

      // Write-through to jupeb_result_entries
      let registrationId = metadata && metadata.registration_id;
      if (!registrationId && userId) {
        const regRes = await client.query(
          `SELECT id FROM jupeb_registrations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [userId]
        );
        if (regRes.rows[0]) {
          registrationId = regRes.rows[0].id;
        }
      }

      const SUPPORTED_RESULT_SOURCES = new Set(['waec', 'neco', 'nabteb', 'gce', 'jamb']);
      if (registrationId && SUPPORTED_RESULT_SOURCES.has(examType.toLowerCase())) {
        const sitting = Number(metadata && metadata.sitting) || 1;
        const normalizeGrade = (raw) => {
          if (!raw) return null;
          const g = String(raw).trim().toUpperCase();
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
        };

        const rows = normalisedSubjects.map((s, idx) => ({
          registration_id: registrationId,
          source: examType.toLowerCase(),
          sitting,
          serial: idx,
          subject: String(s.name || '').trim().toUpperCase(),
          grade: String(s.grade || '').trim().toUpperCase(),
          grade_normalized: normalizeGrade(s.grade),
          score: typeof s.score === 'number' ? Math.max(0, Math.min(100, Math.round(s.score))) : null,
          origin: 'manual',
          ocr_job_id: job.id,
          created_by: userId || null
        }));

        // Clean up any extra rows beyond the new serial length for this key
        await client.query(
          `DELETE FROM jupeb_result_entries
           WHERE registration_id = $1 AND source = $2 AND sitting = $3 AND serial >= $4`,
          [registrationId, examType.toLowerCase(), sitting, rows.length]
        );

        const resultEntriesModel = require('../../jupeb/models/result-entries.model');
        await resultEntriesModel.bulkUpsert(rows, client);
      }

      await client.query('COMMIT');
      return { job, result };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = OcrService;
