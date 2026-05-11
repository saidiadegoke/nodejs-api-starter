const OcrJobModel = require('../models/ocr-job.model');
const OcrResultModel = require('../models/ocr-result.model');
const { runChain } = require('../pipelines/extraction.pipeline');
const { parseResult } = require('../parsers');
const { loadFileBuffer } = require('../utils/file-loader');

/**
 * In-process OCR worker.
 *
 * Phase 1: simple semaphore. Each call to enqueue() returns a promise that
 * resolves when the job reaches a terminal state. The shape lets us swap
 * to BullMQ / SQS later without changing OcrService.
 */

const MAX_CONCURRENCY = parseInt(process.env.OCR_TESSERACT_WORKER_COUNT || '2', 10);
let active = 0;
const queue = [];

function next() {
  if (active >= MAX_CONCURRENCY) return;
  const task = queue.shift();
  if (!task) return;
  active += 1;
  task()
    .catch(() => {})
    .finally(() => {
      active -= 1;
      next();
    });
}

function schedule(fn) {
  return new Promise((resolve, reject) => {
    queue.push(async () => {
      try {
        const v = await fn();
        resolve(v);
      } catch (err) {
        reject(err);
      }
    });
    next();
  });
}

async function processJob(jobId, { directBuffer = null, directMime = null, directFilename = null } = {}) {
  const job = await OcrJobModel.findById(jobId);
  if (!job) {
    const err = new Error('Job not found');
    err.code = 'OCR_JOB_NOT_FOUND';
    throw err;
  }

  await OcrJobModel.markStarted(job.id, null);

  let bufferInput;
  try {
    if (directBuffer) {
      bufferInput = {
        buffer: directBuffer,
        mimeType: directMime,
        filename: directFilename || `${job.id}`
      };
    } else {
      const loaded = await loadFileBuffer(job.file_id);
      bufferInput = {
        buffer: loaded.buffer,
        mimeType: loaded.mimeType,
        filename: loaded.filename
      };
    }
  } catch (err) {
    await OcrJobModel.markFailed(job.id, err.code || 'OCR_FILE_NOT_FOUND', err.message);
    throw err;
  }

  let extraction;
  try {
    extraction = await runChain({
      ...bufferInput,
      forcedProvider: job.provider && job.provider !== 'pdf_text' ? null : null
    });
  } catch (err) {
    const code = err.code || 'OCR_PROVIDER_FAILED';
    await OcrJobModel.markFailed(job.id, code, err.message);
    throw err;
  }

  const { result_json, exam_type_detected } = parseResult({
    text: extraction.result.text,
    examType: job.exam_type
  });

  // Provider confidence dampened by parser warnings
  const parserPenalty = Math.min(
    20,
    (result_json.warnings || []).filter((w) => w.startsWith('low_confidence')).length * 5 +
      ((result_json.warnings || []).includes('no_subjects_parsed') ? 30 : 0)
  );
  const finalConfidence = Math.max(
    0,
    Math.min(100, extraction.result.providerConfidence - parserPenalty)
  );
  result_json.confidence = Number(finalConfidence.toFixed(2));

  await OcrResultModel.create({
    job_id: job.id,
    exam_type_detected,
    confidence: finalConfidence,
    result_json,
    raw_text: extraction.result.text,
    provider_payload: extraction.result.providerPayload || {},
    page_count: extraction.result.pages || 1
  });

  // M.8b — write parsed subjects through to jupeb_result_entries when the
  // OCR job was triggered from the submission flow (metadata carries
  // registration_id). Best-effort: swallow + log on failure so OCR jobs
  // still complete cleanly when result_entries is missing.
  await writeThroughToResultEntries(job, result_json, exam_type_detected).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn(
      '[ocr.worker] write-through to jupeb_result_entries failed for job',
      job.id,
      err && (err.code || err.message)
    );
  });

  const completed = await OcrJobModel.markCompleted(
    job.id,
    extraction.result.providerName
  );
  return completed;
}

const SUPPORTED_RESULT_SOURCES = new Set(['waec', 'neco', 'nabteb', 'gce']);

async function writeThroughToResultEntries(job, result_json, exam_type_detected) {
  const meta = job.metadata || {};
  const registrationId = meta.registration_id;
  if (!registrationId) return;
  if (!SUPPORTED_RESULT_SOURCES.has(exam_type_detected)) return;

  const subjects = Array.isArray(result_json && result_json.subjects)
    ? result_json.subjects
    : [];
  if (subjects.length === 0) return;

  const sitting = Number(meta.sitting) || 1;
  // Lazy require to avoid a hard dep cycle through models/registration → jupeb services.
  // eslint-disable-next-line global-require
  const resultEntriesModel = require('../../jupeb/models/result-entries.model');

  const rows = subjects.map((s, idx) => ({
    registration_id: registrationId,
    source: exam_type_detected,
    sitting,
    serial: idx,
    subject: String(s.name || '').trim().toUpperCase(),
    grade: String(s.grade || '').trim().toUpperCase(),
    grade_normalized: s.grade_normalized || null,
    score: typeof s.score === 'number' ? Math.max(0, Math.min(100, Math.round(s.score))) : null,
    origin: 'ocr',
    ocr_job_id: job.id,
    created_by: meta.created_by || null
  }));

  await resultEntriesModel.bulkUpsert(rows);
}

function enqueue(jobId, opts = {}) {
  return schedule(() => processJob(jobId, opts));
}

module.exports = { enqueue, processJob };
