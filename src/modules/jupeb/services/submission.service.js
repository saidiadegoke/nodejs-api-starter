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

  async attachMeDocument(userId, body) {
    const { requirement_id, file_id, registration_id } = body;
    if (!requirement_id || !file_id) {
      throw httpError(422, 'requirement_id and file_id are required');
    }
    if (!isUuid(requirement_id)) throw httpError(422, 'Invalid requirement_id');
    const reg = await this.resolveRegistrationForStudent(userId, registration_id || null);
    await this.assertRequirementAndFile(requirement_id, file_id, userId);
    const existing = await registrationDocumentModel.findCurrentSubmittedOrAccepted(reg.id, requirement_id);
    if (existing) {
      await registrationDocumentModel.markReplaced(existing.id);
    }
    return registrationDocumentModel.create({
      registration_id: reg.id,
      requirement_id,
      file_id,
      status: 'submitted',
    });
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
    await registrationDocumentModel.markReplaced(row.id);
    return registrationDocumentModel.create({
      registration_id: row.registration_id,
      requirement_id: row.requirement_id,
      file_id: body.file_id,
      status: 'submitted',
    });
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
