const pool = require('../../../db/pool');
const universityModel = require('../models/university.model');
const subjectCombinationModel = require('../models/subject-combination.model');
const subjectModel = require('../models/subject.model');
const { validateJupebPrefix, normalizeSubjects } = require('../utils/catalog-validation');
const { parseCsv, runBulk } = require('../utils/bulk-upload');

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
  listUniversitiesPublic({ type } = {}) {
    if (type) {
      const allowed = new Set(['federal', 'state', 'private']);
      if (!allowed.has(type)) {
        throw httpError(422, 'type must be federal, state, or private');
      }
    }
    return universityModel.findPublicActive({ universityType: type || null });
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

  _validateInstitutionContact(body) {
    if (body.email !== undefined && body.email !== null && body.email !== '') {
      const email = String(body.email).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw httpError(422, 'email is malformed');
      }
    }
    if (
      body.expected_candidate_count !== undefined
      && body.expected_candidate_count !== null
      && body.expected_candidate_count !== ''
    ) {
      const n = Number(body.expected_candidate_count);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        throw httpError(422, 'expected_candidate_count must be a non-negative integer');
      }
    }
  }

  async createUniversity(body) {
    const { code, name, short_name, jupeb_prefix, metadata, university_type } = body;
    if (!code || !name || !jupeb_prefix) {
      throw httpError(422, 'code, name, and jupeb_prefix are required');
    }
    const p = validateJupebPrefix(String(jupeb_prefix).trim());
    if (!p.ok) throw httpError(422, p.error);
    if (university_type !== undefined && university_type !== null) {
      const allowed = new Set(['federal', 'state', 'private']);
      if (!allowed.has(university_type)) {
        throw httpError(422, 'university_type must be federal, state, or private');
      }
    }
    this._validateInstitutionContact(body);
    return universityModel.create({
      code,
      name,
      short_name,
      jupeb_prefix: String(jupeb_prefix).trim(),
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      university_type: university_type || null,
      email: body.email ? String(body.email).trim() : null,
      address: body.address ? String(body.address).trim() : null,
      phone: body.phone ? String(body.phone).trim() : null,
      expected_candidate_count:
        body.expected_candidate_count !== undefined && body.expected_candidate_count !== null && body.expected_candidate_count !== ''
          ? Number(body.expected_candidate_count)
          : null,
      description: body.description ? String(body.description).trim() : null,
    });
  }

  async patchUniversity(id, body) {
    await this.getUniversityById(id);
    this._validateInstitutionContact(body);
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
    if (body.university_type !== undefined) {
      const allowed = new Set(['federal', 'state', 'private']);
      if (body.university_type !== null && !allowed.has(body.university_type)) {
        throw httpError(422, 'university_type must be federal, state, or private');
      }
      fields.university_type = body.university_type;
    }
    if (body.email !== undefined) fields.email = body.email ? String(body.email).trim() : null;
    if (body.address !== undefined) fields.address = body.address ? String(body.address).trim() : null;
    if (body.phone !== undefined) fields.phone = body.phone ? String(body.phone).trim() : null;
    if (body.expected_candidate_count !== undefined) {
      fields.expected_candidate_count =
        body.expected_candidate_count === null || body.expected_candidate_count === ''
          ? null
          : Number(body.expected_candidate_count);
    }
    if (body.description !== undefined) {
      fields.description = body.description ? String(body.description).trim() : null;
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

  async getSubjectCombinationById(id, { embedItems = false } = {}) {
    if (!isUuid(id)) throw httpError(422, 'Invalid subject combination id');
    const row = await subjectCombinationModel.findById(id);
    if (!row) throw httpError(404, 'Subject combination not found');
    if (embedItems) return this._embedSubjectItems(row);
    return row;
  }

  async _resolveSubjectIds(codes) {
    // Resolve each subject input string to a jupeb_subjects.id.
    // Lookup order: exact code (case-insensitive) → exact name → uppercased-truncated code.
    // When `JUPEB_ENFORCE_SUBJECT_CATALOG=true`, missing subjects throw 422.
    // Otherwise, missing subjects are auto-created (backward-compat for legacy callers
    // that pass display names like 'Mathematics').
    const trimmed = codes.map((c) => String(c).trim()).filter(Boolean);
    const strict = process.env.JUPEB_ENFORCE_SUBJECT_CATALOG === 'true';
    const ids = [];
    const missing = [];
    for (const value of trimmed) {
      // eslint-disable-next-line no-await-in-loop
      const byCode = await subjectModel.findByCode(value);
      if (byCode) {
        ids.push(byCode.id);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const byName = await pool.query(
        `SELECT id FROM jupeb_subjects WHERE deleted_at IS NULL AND LOWER(name) = LOWER($1) LIMIT 1`,
        [value]
      );
      if (byName.rows[0]) {
        ids.push(byName.rows[0].id);
        continue;
      }
      if (strict) {
        missing.push(value);
        ids.push(null);
        continue;
      }
      // Auto-create.
      const upper = value.toUpperCase().slice(0, 20);
      // eslint-disable-next-line no-await-in-loop
      const ins = await pool.query(
        `INSERT INTO jupeb_subjects (code, name) VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [upper, value]
      );
      if (ins.rows[0]) {
        ids.push(ins.rows[0].id);
      } else {
        // Conflict on case-insensitive code; fetch the existing one.
        // eslint-disable-next-line no-await-in-loop
        const again = await subjectModel.findByCode(upper);
        ids.push(again ? again.id : null);
      }
    }
    if (missing.length) {
      throw httpError(422, `Unknown subject code(s): ${missing.join(', ')}`);
    }
    return ids;
  }

  async _deriveCombinationDefaults(subjectCodes) {
    const sorted = [...subjectCodes].sort((a, b) => String(a).localeCompare(String(b)));
    const code = sorted.join('-').slice(0, 40);
    let title;
    try {
      const rows = await Promise.all(sorted.map((c) => subjectModel.findByCode(c)));
      const names = rows.map((r, i) => (r && r.name) || sorted[i]);
      title = names.join(', ').slice(0, 255);
    } catch {
      title = sorted.join(', ').slice(0, 255);
    }
    return { code, title };
  }

  async _resolveUniqueCombinationCode(baseCode) {
    // Reserve up to 4 chars for a `-NN` suffix so retries actually produce distinct codes.
    const trunk = baseCode.slice(0, 36);
    let candidate = trunk;
    for (let i = 1; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const dup = await subjectCombinationModel.findByCode(candidate);
      if (!dup) return candidate;
      candidate = `${trunk}-${i}`;
    }
    throw httpError(500, 'Could not allocate unique subject combination code');
  }

  async createSubjectCombination(body) {
    const { subjects, is_global, university_id } = body;
    if (subjects === undefined) {
      throw httpError(422, 'subjects is required');
    }
    const norm = normalizeSubjects(subjects);
    if (norm.error) throw httpError(422, norm.error);

    // Single write path: resolve subjects to IDs first; combination + items are
    // committed together so the row is never persisted without its membership.
    const subjectIds = await this._resolveSubjectIds(norm.subjects);

    let code = body.code ? String(body.code).trim() : null;
    let title = body.title ? String(body.title).trim() : null;
    if (!code || !title) {
      const derived = await this._deriveCombinationDefaults(norm.subjects);
      if (!code) code = await this._resolveUniqueCombinationCode(derived.code);
      if (!title) title = derived.title;
    }

    const ig = is_global !== false;
    if (!ig) {
      if (!university_id || !isUuid(university_id)) {
        throw httpError(422, 'university_id is required when is_global is false');
      }
      const uni = await universityModel.findById(university_id);
      if (!uni) throw httpError(422, 'university_id must reference an existing university');
    }

    const created = await subjectCombinationModel.create({
      code,
      title,
      is_global: ig,
      university_id: ig ? null : university_id,
    });
    await subjectCombinationModel.replaceItems(created.id, subjectIds);
    return this._embedSubjectItems(created);
  }

  async patchSubjectCombination(id, body) {
    await this.getSubjectCombinationById(id);
    const fields = {};
    if (body.title !== undefined) fields.title = body.title;
    if (body.code !== undefined) fields.code = body.code;
    let newSubjectIds = null;
    if (body.subjects !== undefined) {
      const norm = normalizeSubjects(body.subjects);
      if (norm.error) throw httpError(422, norm.error);
      newSubjectIds = await this._resolveSubjectIds(norm.subjects);
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
    if (newSubjectIds) {
      await subjectCombinationModel.replaceItems(row.id, newSubjectIds);
    }
    return this._embedSubjectItems(row);
  }

  async _embedSubjectItems(row) {
    if (!row || !row.id) return row;
    const items = await subjectCombinationModel.listItems(row.id);
    return { ...row, subject_items: items };
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

  // ----- Subjects (first-class catalog) -----
  listSubjectsPublic() {
    return subjectModel.findPublicActive();
  }

  async listSubjectsAdmin({ page, limit, status }) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;
    const rows = await subjectModel.findAllAdmin({ limit: safeLimit, offset, status });
    const total = await subjectModel.countAdmin({ status });
    return { rows, page: safePage, limit: safeLimit, total };
  }

  async getSubjectById(id) {
    if (!isUuid(id)) throw httpError(422, 'Invalid subject id');
    const row = await subjectModel.findById(id);
    if (!row) throw httpError(404, 'Subject not found');
    return row;
  }

  async createSubject(body) {
    const code = body && body.code ? String(body.code).trim() : '';
    const name = body && body.name ? String(body.name).trim() : '';
    if (!code || !name) {
      throw httpError(422, 'code and name are required');
    }
    if (code.length > 20) throw httpError(422, 'code must be 20 characters or less');
    const existing = await subjectModel.findByCode(code);
    if (existing) throw httpError(409, 'Subject with this code already exists');
    return subjectModel.create({
      code,
      name,
      description: body.description ?? null,
    });
  }

  async patchSubject(id, body) {
    await this.getSubjectById(id);
    const fields = {};
    if (body.name !== undefined) fields.name = body.name;
    if (body.description !== undefined) fields.description = body.description;
    if (body.code !== undefined) {
      const code = String(body.code).trim();
      if (!code) throw httpError(422, 'code cannot be blank');
      const dup = await subjectModel.findByCode(code);
      if (dup && dup.id !== id) throw httpError(409, 'Another subject already uses this code');
      fields.code = code;
    }
    const row = await subjectModel.updateById(id, fields);
    if (!row) throw httpError(404, 'Subject not found');
    return row;
  }

  async setSubjectStatus(id, status) {
    if (!['active', 'inactive'].includes(status)) {
      throw httpError(422, 'status must be active or inactive');
    }
    await this.getSubjectById(id);
    const row = await subjectModel.setStatus(id, status);
    if (!row) throw httpError(404, 'Subject not found');
    return row;
  }

  async bulkCreateUniversities(csvText) {
    const rows = parseCsv(csvText);
    return runBulk(rows, (row) => this.createUniversity({
      code: row.code,
      name: row.name,
      short_name: row.short_name || undefined,
      jupeb_prefix: row.jupeb_prefix || row.prefix,
      university_type: row.university_type || undefined,
      email: row.email || undefined,
      address: row.address || undefined,
      phone: row.phone || undefined,
      expected_candidate_count: row.expected_candidate_count || undefined,
      description: row.description || undefined,
    }));
  }

  async bulkCreateSubjects(csvText) {
    const rows = parseCsv(csvText);
    return runBulk(rows, (row) => this.createSubject({
      code: row.code,
      name: row.name,
      description: row.description,
    }));
  }

  async bulkCreateSubjectCombinations(csvText) {
    const rows = parseCsv(csvText);
    return runBulk(rows, (row) => {
      const subjects = String(row.subjects || '')
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean);
      return this.createSubjectCombination({
        code: row.code || undefined,
        title: row.title || undefined,
        subjects,
        is_global: row.is_global === undefined ? true : row.is_global !== 'false',
        university_id: row.university_id || undefined,
      });
    });
  }
}

module.exports = new CatalogService();
