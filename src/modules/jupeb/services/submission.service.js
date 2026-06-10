const pool = require('../../../db/pool');
const documentRequirementModel = require('../models/document-requirement.model');
const registrationDocumentModel = require('../models/registration-document.model');
const registrationModel = require('../models/registration.model');
const { getUserRoles } = require('../../../shared/middleware/rbac.middleware');
const { mimeAllowed, sizeAllowed } = require('../utils/submission-validation');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

const ROLE_MANAGE_REQ = new Set(['super_admin', 'admin', 'registrar']);
const ROLE_INST_REVIEW = new Set([
  'super_admin',
  'admin',
  'registrar',
  'program_director',
  'institution_admin',
]);

// M.4: requirement keys whose attachments must carry (source, sitting).
// Match either `<src>_result` or `<src>` so we tolerate either seed style.
const RESULT_REQUIREMENT_PATTERN = /^(waec|neco|nabteb|gce|jamb)(_result)?$/i;
const ALLOWED_SOURCES = new Set(['waec', 'neco', 'nabteb', 'gce', 'jamb', 'other']);

function isResultRequirementKey(key) {
  return typeof key === 'string' && RESULT_REQUIREMENT_PATTERN.test(key);
}

function inferSourceFromRequirementKey(key) {
  if (!key) return null;
  const m = String(key).toLowerCase().match(/^(waec|neco|nabteb|gce|jamb)/);
  return m ? m[1] : null;
}

function isOcrEnabled() {
  // Default: enabled. Set FEATURE_OCR_ENABLED=false to disable.
  return String(process.env.FEATURE_OCR_ENABLED || 'true').toLowerCase() !== 'false';
}

/**
 * Best-effort OCR dispatch for result-type document uploads.
 * Returns the queued ocr_job (or null if skipped / failed). Never throws —
 * upload must always succeed even if OCR is unavailable.
 */
async function dispatchOcrForDocument({ document, requirement, userId, registrationId }) {
  if (!isOcrEnabled()) return null;
  if (!document || !document.source || !document.sitting) return null;
  if (!requirement || !RESULT_REQUIREMENT_PATTERN.test(requirement.key)) return null;

  try {
    // Lazy require so a missing OCR module / config can't crash the submission path.
    // eslint-disable-next-line global-require
    const OcrService = require('../../ocr/services/ocr.service');
    const { job } = await OcrService.createJob({
      userId,
      fileId: document.file_id,
      examType: document.source && ['waec', 'neco', 'nabteb', 'gce'].includes(document.source)
        ? document.source
        : 'auto',
      context: 'submission',
      metadata: {
        registration_id: registrationId,
        requirement_id: document.requirement_id,
        document_id: document.id,
        source: document.source,
        sitting: document.sitting
      }
    });
    return job ? { id: job.id, status: job.status } : null;
  } catch (err) {
    // Log + swallow. Common reasons: OCR module unavailable, mime not allowed
    // by OCR validator, file_id not found by the OCR side, etc.
    // eslint-disable-next-line no-console
    console.warn(
      '[submission] OCR auto-dispatch failed for document',
      document && document.id,
      err && (err.code || err.message)
    );
    return null;
  }
}

function validateSourceSitting({ requirementKey, source, sitting }) {
  const isResult = isResultRequirementKey(requirementKey);
  const errors = [];

  let normalizedSource = source ? String(source).toLowerCase().trim() : null;
  let normalizedSitting = sitting !== undefined && sitting !== null ? Number(sitting) : null;

  if (isResult) {
    if (!normalizedSource) {
      // Fall back to inferring from the requirement key.
      normalizedSource = inferSourceFromRequirementKey(requirementKey);
    }
    if (!normalizedSource) {
      errors.push({ field: 'source', error_code: 'source_required' });
    } else if (!ALLOWED_SOURCES.has(normalizedSource)) {
      errors.push({ field: 'source', error_code: 'source_invalid' });
    }
    if (normalizedSitting === null || Number.isNaN(normalizedSitting)) {
      errors.push({ field: 'sitting', error_code: 'sitting_required' });
    } else if (![1, 2].includes(normalizedSitting)) {
      errors.push({ field: 'sitting', error_code: 'sitting_invalid' });
    }
  } else {
    // For non-result requirements, source/sitting are ignored if supplied —
    // they only apply to certificate uploads. Don't accidentally persist them.
    normalizedSource = null;
    normalizedSitting = null;
  }

  if (errors.length) {
    const err = httpError(422, 'Document metadata invalid');
    err.details = { errors };
    throw err;
  }

  return { source: normalizedSource, sitting: normalizedSitting };
}

async function hasRoleIn(userId, set) {
  const roles = await getUserRoles(userId);
  return roles.some((r) => set.has(r));
}

class SubmissionService {
  async listRequirementsAdmin({ page, limit, status }) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (safePage - 1) * safeLimit;
    const rows = await documentRequirementModel.findAll({ limit: safeLimit, offset, status });
    const total = await documentRequirementModel.count({ status });
    return { rows, page: safePage, limit: safeLimit, total };
  }

  async createRequirement(body) {
    const dup = await documentRequirementModel.findByKey(body.key);
    if (dup) throw httpError(409, 'Requirement key already exists');
    return documentRequirementModel.create(body);
  }

  async patchRequirement(id, body) {
    if (!isUuid(id)) throw httpError(422, 'Invalid requirement id');
    const row = await documentRequirementModel.findById(id);
    if (!row) throw httpError(404, 'Requirement not found');
    return documentRequirementModel.updateById(id, body);
  }

  async setRequirementStatus(id, status) {
    if (!['active', 'inactive'].includes(status)) {
      throw httpError(422, 'status must be active or inactive');
    }
    if (!isUuid(id)) throw httpError(422, 'Invalid requirement id');
    const row = await documentRequirementModel.findById(id);
    if (!row) throw httpError(404, 'Requirement not found');
    return documentRequirementModel.updateById(id, { status });
  }

  async resolveRegistrationForStudent(userId, registrationIdOpt) {
    if (registrationIdOpt) {
      if (!isUuid(registrationIdOpt)) throw httpError(422, 'Invalid registration_id');
      const reg = await registrationModel.findById(registrationIdOpt);
      if (!reg) throw httpError(404, 'Registration not found');
      if (reg.user_id && reg.user_id !== userId) {
        const adminOk = await hasRoleIn(userId, ROLE_MANAGE_REQ);
        if (!adminOk) throw httpError(403, 'Registration does not belong to current user');
      }
      return reg;
    }
    const reg = await registrationModel.findLatestForUser(userId);
    if (!reg) throw httpError(404, 'No registration found for current user');
    if (!reg.user_id || reg.user_id !== userId) {
      const adminOk = await hasRoleIn(userId, ROLE_MANAGE_REQ);
      if (!adminOk) throw httpError(403, 'Registration is not linked to your account');
    }
    return reg;
  }

  async loadFileForUser(fileId, userId) {
    if (!isUuid(fileId)) throw httpError(422, 'Invalid file_id');
    const r = await pool.query(
      `SELECT id, uploaded_by, file_size, file_type, deleted_at FROM files WHERE id = $1`,
      [fileId]
    );
    const f = r.rows[0];
    if (!f || f.deleted_at) throw httpError(404, 'File not found');
    const adminOverride = await hasRoleIn(userId, ROLE_MANAGE_REQ);
    if (!adminOverride && f.uploaded_by !== userId) {
      throw httpError(403, 'You do not own this file');
    }
    return f;
  }

  async assertRequirementAndFile(requirementId, fileId, userId) {
    const reqRow = await documentRequirementModel.findById(requirementId);
    if (!reqRow || reqRow.status !== 'active') {
      throw httpError(404, 'Requirement not found or inactive');
    }
    const file = await this.loadFileForUser(fileId, userId);
    const rawAllowed = reqRow.allowed_mime_types;
    const allowed = Array.isArray(rawAllowed) ? rawAllowed : [];
    if (!mimeAllowed(file.file_type, allowed)) {
      throw httpError(422, 'File type is not allowed for this requirement');
    }
    if (!sizeAllowed(file.file_size, reqRow.max_file_size_mb)) {
      throw httpError(422, 'File exceeds maximum size for this requirement');
    }
    return { reqRow, file };
  }

  /**
   * Institution document bind: file must be owned by the candidate, the acting
   * staff user, or any user when the actor has ROLE_MANAGE_REQ.
   */
  async loadFileForRegistrationEdit(fileId, actorUserId, candidateUserId) {
    if (!isUuid(fileId)) throw httpError(422, 'Invalid file_id');
    const r = await pool.query(
      `SELECT id, uploaded_by, file_size, file_type, deleted_at FROM files WHERE id = $1`,
      [fileId]
    );
    const f = r.rows[0];
    if (!f || f.deleted_at) throw httpError(404, 'File not found');
    const instOk = await hasRoleIn(actorUserId, ROLE_INST_REVIEW);
    if (!instOk) throw httpError(403, 'Forbidden');
    const adminOverride = await hasRoleIn(actorUserId, ROLE_MANAGE_REQ);
    if (adminOverride) return f;
    const uploader = f.uploaded_by ? String(f.uploaded_by) : '';
    if (candidateUserId && uploader === String(candidateUserId)) return f;
    if (uploader === String(actorUserId)) return f;
    throw httpError(
      403,
      'File must be uploaded by the candidate or the acting institution user'
    );
  }

  async assertRequirementAndFileForInstitutionEdit(requirementId, fileId, actorUserId, candidateUserId) {
    const reqRow = await documentRequirementModel.findById(requirementId);
    if (!reqRow || reqRow.status !== 'active') {
      throw httpError(404, 'Requirement not found or inactive');
    }
    const file = await this.loadFileForRegistrationEdit(fileId, actorUserId, candidateUserId);
    const rawAllowed = reqRow.allowed_mime_types;
    const allowed = Array.isArray(rawAllowed) ? rawAllowed : [];
    if (!mimeAllowed(file.file_type, allowed)) {
      throw httpError(422, 'File type is not allowed for this requirement');
    }
    if (!sizeAllowed(file.file_size, reqRow.max_file_size_mb)) {
      throw httpError(422, 'File exceeds maximum size for this requirement');
    }
    return { reqRow, file };
  }

  async getMeRequirements(userId, registrationIdOpt) {
    const reg = await this.resolveRegistrationForStudent(userId, registrationIdOpt);
    const reqs = await documentRequirementModel.findActiveForCompleteness();
    const docs = await registrationDocumentModel.findByRegistration(reg.id);
    const satisfiedReqIds = new Set(
      docs.filter((d) => ['submitted', 'accepted'].includes(d.status)).map((d) => d.requirement_id)
    );
    return reqs.map((r) => ({
      ...r,
      satisfied: satisfiedReqIds.has(r.id),
    }));
  }

  async listMeDocuments(userId, registrationIdOpt) {
    const reg = await this.resolveRegistrationForStudent(userId, registrationIdOpt);
    return registrationDocumentModel.findByRegistration(reg.id);
  }

  /**
   * M.11 — Issue a short-lived download URL for a document the candidate owns.
   * Lifetime defaults to 5 minutes (configurable via OCR-friendly env). Staff
   * with `ROLE_INST_REVIEW` can also fetch URLs for any document.
   */
  async downloadUrlMine(userId, documentId) {
    if (!isUuid(documentId)) throw httpError(422, 'Invalid document id');
    const row = await registrationDocumentModel.findById(documentId);
    if (!row) throw httpError(404, 'Document not found');

    const owns = row.registration_user_id === userId;
    if (!owns) {
      const ok = await hasRoleIn(userId, ROLE_INST_REVIEW);
      if (!ok) throw httpError(403, 'Forbidden');
    }
    if (!row.file_id) throw httpError(404, 'Document has no file');

    // eslint-disable-next-line global-require
    const FileModel = require('../../files/models/file.model');
    // eslint-disable-next-line global-require
    const FileService = require('../../files/services/file.service');
    const file = await FileModel.findById(row.file_id);
    if (!file) throw httpError(404, 'File record not found');

    const expiresInSec = parseInt(process.env.JUPEB_DOC_DOWNLOAD_TTL_SEC || '300', 10);
    let url = null;
    if (file.provider === 's3' && file.provider_path) {
      try {
        url = await FileService.getSignedUrl(file.provider_path, expiresInSec);
      } catch (err) {
        // Fall back to the stored URL if signing fails (e.g. dev/mock buckets).
        url = file.file_url || null;
      }
    } else {
      url = file.file_url || null;
    }
    if (!url) throw httpError(500, 'Could not produce a download URL');

    return {
      document_id: row.id,
      file_id: file.id,
      file_name:
        (file.metadata && file.metadata.original_name) ||
        file.provider_path ||
        null,
      file_type: file.file_type,
      url,
      expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
    };
  }

  async attachMeDocument(userId, body) {
    const { requirement_id, file_id, registration_id } = body;
    if (!requirement_id || !file_id) {
      throw httpError(422, 'requirement_id and file_id are required');
    }
    if (!isUuid(requirement_id)) throw httpError(422, 'Invalid requirement_id');
    const reg = await this.resolveRegistrationForStudent(userId, registration_id || null);
    await this.assertRequirementAndFile(requirement_id, file_id, userId);

    // M.4 — pull the requirement so we can decide if (source, sitting) are needed.
    const requirement = await documentRequirementModel.findById(requirement_id);
    if (!requirement) throw httpError(404, 'Requirement not found');

    const { source, sitting } = validateSourceSitting({
      requirementKey: requirement.key,
      source: body.source,
      sitting: body.sitting
    });

    // For result-type uploads, two distinct sittings are valid concurrently.
    // We only mark the prior row replaced if it shares the same (source, sitting).
    if (source && sitting) {
      const sameTuple = await registrationDocumentModel.findCurrentBySourceSitting(
        reg.id,
        source,
        sitting
      );
      if (sameTuple) {
        const err = httpError(409, 'Result already uploaded for this source and sitting. PATCH /me/documents/:id to replace.');
        err.details = {
          error_code: 'duplicate_source_sitting',
          existing_document_id: sameTuple.id
        };
        throw err;
      }
    } else {
      const existing = await registrationDocumentModel.findCurrentSubmittedOrAccepted(reg.id, requirement_id);
      if (existing) {
        await registrationDocumentModel.markReplaced(existing.id);
      }
    }

    const document = await registrationDocumentModel.create({
      registration_id: reg.id,
      requirement_id,
      file_id,
      status: 'submitted',
      source,
      sitting
    });

    // M.6 — auto-trigger OCR for result-type uploads (best effort).
    const ocr_job = await dispatchOcrForDocument({
      document,
      requirement,
      userId,
      registrationId: reg.id
    });

    return ocr_job ? { ...document, ocr_job } : document;
  }

  async patchMeDocument(userId, documentId, body) {
    if (!isUuid(documentId)) throw httpError(422, 'Invalid document id');
    const row = await registrationDocumentModel.findById(documentId);
    if (!row) throw httpError(404, 'Document not found');
    await this.resolveRegistrationForStudent(userId, row.registration_id);
    if (row.registration_user_id !== userId) {
      const ok = await hasRoleIn(userId, ROLE_MANAGE_REQ);
      if (!ok) throw httpError(403, 'Forbidden');
    }
    if (!['submitted'].includes(row.status)) {
      throw httpError(422, 'Only submitted documents can be replaced');
    }
    if (!body.file_id) throw httpError(422, 'file_id is required');
    await this.assertRequirementAndFile(row.requirement_id, body.file_id, userId);

    // M.4 — carry source/sitting forward from the prior row unless the caller
    // explicitly overrides. Re-validate either way.
    const requirement = await documentRequirementModel.findById(row.requirement_id);
    const { source, sitting } = validateSourceSitting({
      requirementKey: requirement ? requirement.key : null,
      source: body.source !== undefined ? body.source : row.source,
      sitting: body.sitting !== undefined ? body.sitting : row.sitting
    });

    await registrationDocumentModel.markReplaced(row.id);
    const document = await registrationDocumentModel.create({
      registration_id: row.registration_id,
      requirement_id: row.requirement_id,
      file_id: body.file_id,
      status: 'submitted',
      source,
      sitting
    });

    // M.6 — re-trigger OCR on replace.
    const ocr_job = await dispatchOcrForDocument({
      document,
      requirement,
      userId,
      registrationId: row.registration_id
    });

    return ocr_job ? { ...document, ocr_job } : document;
  }

  async validateCompleteness(userId, registrationIdOpt) {
    const reg = await this.resolveRegistrationForStudent(userId, registrationIdOpt);
    const reqs = await documentRequirementModel.findActiveForCompleteness();
    const mandatory = reqs.filter((r) => r.is_mandatory);
    const docs = await registrationDocumentModel.findByRegistration(reg.id);
    const satisfiedReqIds = new Set(
      docs.filter((d) => ['submitted', 'accepted'].includes(d.status)).map((d) => d.requirement_id)
    );
    const missing_keys = mandatory.filter((r) => !satisfiedReqIds.has(r.id)).map((r) => r.key);
    return {
      registration_id: reg.id,
      complete: missing_keys.length === 0,
      missing_keys,
    };
  }

  async institutionListDocuments(userId, registrationId) {
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const ok = await hasRoleIn(userId, ROLE_INST_REVIEW);
    if (!ok) throw httpError(403, 'Forbidden');
    const reg = await registrationModel.findById(registrationId);
    if (!reg) throw httpError(404, 'Registration not found');
    return registrationDocumentModel.findByRegistration(registrationId);
  }

  /**
   * Staff (ROLE_INST_REVIEW): attach or replace documents for a registration on behalf of the candidate.
   * Each entry is either `{ requirement_id, file_id, source?, sitting? }` (new slot, same rules as student attach)
   * or `{ document_id, file_id, source?, sitting? }` (replace a submitted row).
   */
  async institutionReuploadDocuments(actorUserId, registrationId, documents, candidateUserId) {
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const ok = await hasRoleIn(actorUserId, ROLE_INST_REVIEW);
    if (!ok) throw httpError(403, 'Forbidden');
    if (!candidateUserId) {
      throw httpError(422, 'Registration has no linked candidate user');
    }
    if (!Array.isArray(documents)) {
      throw httpError(422, 'documents must be an array');
    }
    if (!documents.length) {
      throw httpError(422, 'documents must be a non-empty array');
    }
    const reg = await registrationModel.findById(registrationId);
    if (!reg) throw httpError(404, 'Registration not found');

    const out = [];
    for (const item of documents) {
      if (!item || typeof item !== 'object') {
        throw httpError(422, 'Each documents[] entry must be an object');
      }
      if (item.document_id) {
        out.push(
          await this._institutionReplaceDocument(actorUserId, candidateUserId, registrationId, item)
        );
      } else if (item.requirement_id && item.file_id) {
        out.push(await this._institutionAttachDocument(actorUserId, candidateUserId, reg, item));
      } else {
        throw httpError(
          422,
          'Each document entry requires document_id+file_id or requirement_id+file_id'
        );
      }
    }
    return out;
  }

  async _institutionReplaceDocument(actorUserId, candidateUserId, registrationId, item) {
    const { document_id, file_id, source, sitting } = item;
    if (!isUuid(document_id)) throw httpError(422, 'Invalid document id');
    const row = await registrationDocumentModel.findById(document_id);
    if (!row || row.registration_id !== registrationId) {
      throw httpError(404, 'Document not found');
    }
    if (!['submitted'].includes(row.status)) {
      throw httpError(422, 'Only submitted documents can be replaced');
    }
    if (!file_id) throw httpError(422, 'file_id is required');
    await this.assertRequirementAndFileForInstitutionEdit(
      row.requirement_id,
      file_id,
      actorUserId,
      candidateUserId
    );
    const requirement = await documentRequirementModel.findById(row.requirement_id);
    const vs = validateSourceSitting({
      requirementKey: requirement ? requirement.key : null,
      source: source !== undefined ? source : row.source,
      sitting: sitting !== undefined ? sitting : row.sitting,
    });
    await registrationDocumentModel.markReplaced(row.id);
    const document = await registrationDocumentModel.create({
      registration_id: row.registration_id,
      requirement_id: row.requirement_id,
      file_id,
      status: 'submitted',
      source: vs.source,
      sitting: vs.sitting,
    });
    const ocr_job = await dispatchOcrForDocument({
      document,
      requirement,
      userId: candidateUserId,
      registrationId: row.registration_id,
    });
    return ocr_job ? { ...document, ocr_job } : document;
  }

  async _institutionAttachDocument(actorUserId, candidateUserId, reg, body) {
    const { requirement_id, file_id } = body;
    if (!requirement_id || !file_id) {
      throw httpError(422, 'requirement_id and file_id are required');
    }
    if (!isUuid(requirement_id)) throw httpError(422, 'Invalid requirement_id');
    await this.assertRequirementAndFileForInstitutionEdit(
      requirement_id,
      file_id,
      actorUserId,
      candidateUserId
    );

    const requirement = await documentRequirementModel.findById(requirement_id);
    if (!requirement) throw httpError(404, 'Requirement not found');

    const { source, sitting } = validateSourceSitting({
      requirementKey: requirement.key,
      source: body.source,
      sitting: body.sitting,
    });

    if (source && sitting) {
      const sameTuple = await registrationDocumentModel.findCurrentBySourceSitting(reg.id, source, sitting);
      if (sameTuple) {
        const err = httpError(
          409,
          'Result already uploaded for this source and sitting. Use document_id+file_id to replace.'
        );
        err.details = {
          error_code: 'duplicate_source_sitting',
          existing_document_id: sameTuple.id,
        };
        throw err;
      }
    } else {
      const existing = await registrationDocumentModel.findCurrentSubmittedOrAccepted(reg.id, requirement_id);
      if (existing) {
        await registrationDocumentModel.markReplaced(existing.id);
      }
    }

    const document = await registrationDocumentModel.create({
      registration_id: reg.id,
      requirement_id,
      file_id,
      status: 'submitted',
      source,
      sitting,
    });

    const ocr_job = await dispatchOcrForDocument({
      document,
      requirement,
      userId: candidateUserId,
      registrationId: reg.id,
    });

    return ocr_job ? { ...document, ocr_job } : document;
  }

  async institutionReviewDocument(userId, documentId, status, review_note) {
    if (!['accepted', 'rejected'].includes(status)) {
      throw httpError(422, 'status must be accepted or rejected');
    }
    const ok = await hasRoleIn(userId, ROLE_INST_REVIEW);
    if (!ok) throw httpError(403, 'Forbidden');
    const row = await registrationDocumentModel.findById(documentId);
    if (!row) throw httpError(404, 'Document not found');
    if (row.status !== 'submitted') {
      throw httpError(422, 'Only submitted documents can be reviewed');
    }
    return registrationDocumentModel.setReview(documentId, {
      status,
      review_note,
      reviewed_by: userId,
    });
  }
}

module.exports = new SubmissionService();
