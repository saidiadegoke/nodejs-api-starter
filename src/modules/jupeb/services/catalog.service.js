const universityModel = require('../models/university.model');
const subjectCombinationModel = require('../models/subject-combination.model');
const { validateJupebPrefix, normalizeSubjects } = require('../utils/catalog-validation');

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

class CatalogService {
  listUniversitiesPublic() {
    return universityModel.findPublicActive();
  }

  listSubjectCombinationsPublic({ universityId }) {
    if (universityId && !isUuid(universityId)) {
      throw httpError(422, 'university_id must be a valid UUID');
    }
    return subjectCombinationModel.findPublicActive({ universityId: universityId || null });
  }

  async listUniversitiesAdmin({ page, limit, status }) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;
    const rows = await universityModel.findAllAdmin({ limit: safeLimit, offset, status });
    const total = await universityModel.countAdmin({ status });
    return { rows, page: safePage, limit: safeLimit, total };
  }

  async getUniversityById(id) {
    if (!isUuid(id)) throw httpError(422, 'Invalid university id');
    const row = await universityModel.findById(id);
    if (!row) throw httpError(404, 'University not found');
    return row;
  }

  async createUniversity(body) {
    const { code, name, short_name, jupeb_prefix, metadata } = body;
    if (!code || !name || !jupeb_prefix) {
      throw httpError(422, 'code, name, and jupeb_prefix are required');
    }
    const p = validateJupebPrefix(String(jupeb_prefix).trim());
    if (!p.ok) throw httpError(422, p.error);
    return universityModel.create({
      code,
      name,
      short_name,
      jupeb_prefix: String(jupeb_prefix).trim(),
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    });
  }

  async patchUniversity(id, body) {
    await this.getUniversityById(id);
    const fields = {};
    if (body.name !== undefined) fields.name = body.name;
    if (body.short_name !== undefined) fields.short_name = body.short_name;
    if (body.metadata !== undefined) fields.metadata = body.metadata;
    if (body.code !== undefined) fields.code = body.code;
    if (body.jupeb_prefix !== undefined) {
      const p = validateJupebPrefix(String(body.jupeb_prefix).trim());
      if (!p.ok) throw httpError(422, p.error);
      fields.jupeb_prefix = String(body.jupeb_prefix).trim();
    }
    const row = await universityModel.updateById(id, fields);
    if (!row) throw httpError(404, 'University not found');
    return row;
  }

  async setUniversityStatus(id, status) {
    if (!['active', 'inactive'].includes(status)) {
      throw httpError(422, 'status must be active or inactive');
    }
    await this.getUniversityById(id);
    const row = await universityModel.setStatus(id, status);
    if (!row) throw httpError(404, 'University not found');
    return row;
  }

  async listSubjectCombinationsAdmin({ page, limit, status, university_id }) {
    if (university_id && !isUuid(university_id)) {
      throw httpError(422, 'university_id must be a valid UUID');
    }
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;
    const rows = await subjectCombinationModel.findAllAdmin({
      limit: safeLimit,
      offset,
      status,
      university_id: university_id || null,
    });
    const total = await subjectCombinationModel.countAdmin({ status, university_id: university_id || null });
    return { rows, page: safePage, limit: safeLimit, total };
  }

  async getSubjectCombinationById(id) {
    if (!isUuid(id)) throw httpError(422, 'Invalid subject combination id');
    const row = await subjectCombinationModel.findById(id);
    if (!row) throw httpError(404, 'Subject combination not found');
    return row;
  }

  async createSubjectCombination(body) {
    const { code, title, subjects, is_global, university_id } = body;
    if (!code || !title || subjects === undefined) {
      throw httpError(422, 'code, title, and subjects are required');
    }
    const norm = normalizeSubjects(subjects);
    if (norm.error) throw httpError(422, norm.error);
    const ig = is_global !== false;
    if (!ig) {
      if (!university_id || !isUuid(university_id)) {
        throw httpError(422, 'university_id is required when is_global is false');
      }
      const uni = await universityModel.findById(university_id);
      if (!uni) throw httpError(422, 'university_id must reference an existing university');
    }
    return subjectCombinationModel.create({
      code,
      title,
      subjects: norm.subjects,
      is_global: ig,
      university_id: ig ? null : university_id,
    });
  }

  async patchSubjectCombination(id, body) {
    await this.getSubjectCombinationById(id);
    const fields = {};
    if (body.title !== undefined) fields.title = body.title;
    if (body.code !== undefined) fields.code = body.code;
    if (body.subjects !== undefined) {
      const norm = normalizeSubjects(body.subjects);
      if (norm.error) throw httpError(422, norm.error);
      fields.subjects = norm.subjects;
    }
    if (body.is_global !== undefined || body.university_id !== undefined) {
      fields.is_global = body.is_global !== false;
      fields.university_id = fields.is_global ? null : body.university_id;
      if (!fields.is_global) {
        if (!fields.university_id || !isUuid(fields.university_id)) {
          throw httpError(422, 'university_id is required when is_global is false');
        }
        const uni = await universityModel.findById(fields.university_id);
        if (!uni) throw httpError(422, 'university_id must reference an existing university');
      }
    }
    const row = await subjectCombinationModel.updateById(id, fields);
    if (!row) throw httpError(404, 'Subject combination not found');
    return row;
  }

  async setSubjectCombinationStatus(id, status) {
    if (!['active', 'inactive'].includes(status)) {
      throw httpError(422, 'status must be active or inactive');
    }
    await this.getSubjectCombinationById(id);
    const row = await subjectCombinationModel.setStatus(id, status);
    if (!row) throw httpError(404, 'Subject combination not found');
    return row;
  }
}

module.exports = new CatalogService();
