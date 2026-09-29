const OcrService = require('../services/ocr.service');
const OcrResultModel = require('../models/ocr-result.model');
const { sendSuccess, sendError } = require('../../../utils/utils/response');
const { OLEVEL_SUBJECTS } = require('../constants/olevel-subjects');

function serializeJob(job, result, viewerIsStaff) {
  if (!job) return null;
  const out = {
    job_id: job.id,
    file_id: job.file_id,
    exam_type: job.exam_type,
    provider: job.provider,
    status: job.status,
    attempt_count: job.attempt_count,
    started_at: job.started_at,
    completed_at: job.completed_at,
    requested_by: job.requested_by,
    context: job.context,
    metadata: job.metadata || {},
    created_at: job.created_at,
    updated_at: job.updated_at,
    error: job.error_code
      ? { code: job.error_code, message: job.error_message }
      : null,
    result: null,
    raw_text_excerpt: null,
    confidence: null,
    exam_type_detected: null
  };

  if (result) {
    out.result = result.result_json;
    out.confidence = Number(result.confidence);
    out.exam_type_detected = result.exam_type_detected;
    out.raw_text_excerpt = (result.raw_text || '').slice(0, 500);
    if (viewerIsStaff) {
      out.raw_text = result.raw_text;
      out.provider_payload = result.provider_payload;
    }
  }
  return out;
}

function handle(res, fn) {
  return Promise.resolve()
    .then(fn)
    .catch((err) => {
      const status = err.status || 500;
      const code = err.code || 'OCR_INTERNAL';
      sendError(res, err.message || 'OCR error', status, { code });
    });
}

class OcrController {
  static async createJob(req, res) {
    return handle(res, async () => {
      const userId = req.user.user_id;
      const ct = (req.headers['content-type'] || '').toLowerCase();
      const isMultipart = ct.startsWith('multipart/form-data');

      const examType = (req.body && req.body.exam_type) || 'auto';
      const wait =
        req.body && (req.body.wait === true || req.body.wait === 'true');
      const ocrContext = (req.body && req.body.context) || null;

      let metadata = {};
      if (req.body && req.body.metadata) {
        if (typeof req.body.metadata === 'string') {
          try {
            metadata = JSON.parse(req.body.metadata);
          } catch {
            metadata = {};
          }
        } else if (typeof req.body.metadata === 'object') {
          metadata = req.body.metadata;
        }
      }

      let createArgs;
      if (isMultipart) {
        if (!req.file) {
          return sendError(res, 'No file uploaded', 400, { code: 'OCR_INPUT_REQUIRED' });
        }
        createArgs = {
          userId,
          multerFile: req.file,
          examType,
          wait,
          context: ocrContext,
          metadata
        };
      } else if (req.body && req.body.file_id) {
        createArgs = {
          userId,
          fileId: req.body.file_id,
          examType,
          wait,
          context: ocrContext,
          metadata
        };
      } else if (req.body && req.body.data && req.body.filename) {
        createArgs = {
          userId,
          base64: {
            data: req.body.data,
            filename: req.body.filename,
            mime_type: req.body.mime_type
          },
          examType,
          wait,
          context: ocrContext,
          metadata
        };
      } else {
        return sendError(
          res,
          'Provide one of: file (multipart), file_id (json), or data+filename (json)',
          400,
          { code: 'OCR_INPUT_REQUIRED' }
        );
      }

      const { job, completedJob } = await OcrService.createJob(createArgs);
      const finalJob = completedJob || job;
      const result = finalJob.status === 'completed'
        ? await OcrResultModel.findByJobId(finalJob.id)
        : null;

      const status = wait && finalJob.status === 'completed' ? 200 : 202;
      sendSuccess(
        res,
        serializeJob(finalJob, result, false),
        status === 200 ? 'OCR completed' : 'OCR job accepted',
        status
      );
    });
  }

  static async getJob(req, res) {
    return handle(res, async () => {
      const { jobId } = req.params;
      const { job, result, viewerIsStaff } = await OcrService.getJob(
        jobId,
        req.user.user_id
      );
      sendSuccess(res, serializeJob(job, result, viewerIsStaff));
    });
  }

  static async listJobs(req, res) {
    return handle(res, async () => {
      const { status, exam_type, file_id, page, limit } = req.query;
      const { rows, total, page: p, limit: l, viewerIsStaff } =
        await OcrService.listJobs({
          viewerId: req.user.user_id,
          status,
          examType: exam_type,
          fileId: file_id,
          page,
          limit
        });

      // Fetch results for completed jobs in one go
      const completedIds = rows.filter((r) => r.status === 'completed').map((r) => r.id);
      const resultsByJob = {};
      if (completedIds.length) {
        // small N — issue per-job lookups for clarity
        await Promise.all(
          completedIds.map(async (id) => {
            resultsByJob[id] = await OcrResultModel.findByJobId(id);
          })
        );
      }

      const data = rows.map((r) =>
        serializeJob(r, resultsByJob[r.id] || null, viewerIsStaff)
      );

      res.status(200).json({
        success: true,
        data,
        pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) }
      });
    });
  }

  static async retryJob(req, res) {
    return handle(res, async () => {
      const newJob = await OcrService.retryJob(req.params.jobId, req.user.user_id);
      sendSuccess(res, serializeJob(newJob, null, false), 'Retry accepted', 202);
    });
  }

  static async bindRequirement(req, res) {
    return handle(res, async () => {
      const { registration_id, requirement_id } = req.body || {};
      if (!registration_id || !requirement_id) {
        return sendError(
          res,
          'registration_id and requirement_id are required',
          400,
          { code: 'OCR_INVALID_REQUEST' }
        );
      }
      const updated = await OcrService.bindRequirement({
        jobId: req.params.jobId,
        viewerId: req.user.user_id,
        registrationId: registration_id,
        requirementId: requirement_id
      });
      sendSuccess(res, serializeJob(updated, null, false), 'Bound');
    });
  }

  static async getLatestForFile(req, res) {
    return handle(res, async () => {
      const { job, result, viewerIsStaff } = await OcrService.getLatestForFile({
        fileId: req.params.fileId,
        viewerId: req.user.user_id
      });
      sendSuccess(res, serializeJob(job, result, viewerIsStaff));
    });
  }

  static async createManualEntry(req, res) {
    return handle(res, async () => {
      const { exam_type, subjects, metadata: rawMeta, context } = req.body || {};

      if (!exam_type) {
        return sendError(res, 'exam_type is required', 400, { code: 'OCR_INPUT_REQUIRED' });
      }
      if (!Array.isArray(subjects) || subjects.length === 0) {
        return sendError(res, 'subjects must be a non-empty array', 400, { code: 'OCR_INPUT_REQUIRED' });
      }

      let metadata = {};
      if (rawMeta) {
        if (typeof rawMeta === 'string') {
          try { metadata = JSON.parse(rawMeta); } catch { metadata = {}; }
        } else if (typeof rawMeta === 'object') {
          metadata = rawMeta;
        }
      }

      const { job, result } = await OcrService.createManualEntry({
        userId: req.user.user_id,
        examType: exam_type,
        subjects,
        metadata,
        context: context || null
      });

      sendSuccess(res, serializeJob(job, result, false), 'Manual entry recorded', 201);
    });
  }

  /**
   * GET /ocr/subjects?board=waec
   * Returns the full O-level subject list, optionally filtered by exam board.
   */
  static getSubjects(req, res) {
    const board = (req.query.board || '').toLowerCase().trim();
    const VALID_BOARDS = ['waec', 'neco', 'nabteb', 'gce'];

    if (board && !VALID_BOARDS.includes(board)) {
      return sendError(
        res,
        `Invalid board '${board}'. Must be one of: ${VALID_BOARDS.join(', ')}`,
        400,
        { code: 'OCR_INVALID_BOARD' }
      );
    }

    const subjects = board
      ? OLEVEL_SUBJECTS.filter((s) => s.boards.includes(board))
      : OLEVEL_SUBJECTS;

    return sendSuccess(res, { subjects, total: subjects.length });
  }
}

module.exports = OcrController;
