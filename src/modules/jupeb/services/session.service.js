const sessionModel = require('../models/session.model');
const pool = require('../../../db/pool');
const registrationService = require('./registration.service');
const { validateYearShortForAcademicYear, canTransitionStatus } = require('../utils/session-validation');

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

function parseTs(value, label) {
  if (value === undefined || value === null) {
    throw httpError(422, `${label} is required`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw httpError(422, `${label} must be a valid ISO date`);
  }
  return d;
}

class SessionService {
  async list({ page, limit, status }) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;
    const rows = await sessionModel.findAll({ limit: safeLimit, offset, status });
    const total = await sessionModel.count({ status });
    return { rows, page: safePage, limit: safeLimit, total };
  }

  async getById(id) {
    if (!isUuid(id)) throw httpError(422, 'Invalid session id');
    const row = await sessionModel.findById(id);
    if (!row) throw httpError(404, 'Session not found');
    return row;
  }

  async create(body, userId) {
    const {
      academic_year,
      year_short,
      opens_at,
      closes_at,
      student_submission_deadline,
      institution_approval_deadline,
      notes,
      registration_fee_amount,
      registration_fee_currency,
    } = body;
    if (!academic_year || !year_short) {
      throw httpError(422, 'academic_year and year_short are required');
    }
    const y = validateYearShortForAcademicYear(academic_year, year_short);
    if (!y.ok) throw httpError(422, y.error);
    const o = parseTs(opens_at, 'opens_at');
    const c = parseTs(closes_at, 'closes_at');
    if (o.getTime() >= c.getTime()) {
      throw httpError(422, 'opens_at must be before closes_at');
    }
    const sdl = student_submission_deadline ? parseTs(student_submission_deadline, 'student_submission_deadline') : null;
    const adl = institution_approval_deadline
      ? parseTs(institution_approval_deadline, 'institution_approval_deadline')
      : null;
    let feeAmount = null;
    let feeCurrency = null;
    if (registration_fee_amount !== undefined && registration_fee_amount !== null) {
      feeAmount = Number(registration_fee_amount);
      if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
        throw httpError(422, 'registration_fee_amount must be a positive number when set');
      }
    }
    if (registration_fee_currency !== undefined && registration_fee_currency !== null) {
      feeCurrency = String(registration_fee_currency).trim().toUpperCase().slice(0, 3);
      if (feeCurrency.length !== 3) throw httpError(422, 'registration_fee_currency must be a 3-letter code');
    }
    if (feeAmount != null && feeCurrency == null) {
      feeCurrency = 'NGN';
    }
    try {
      return await sessionModel.create({
        academic_year,
        year_short,
        opens_at: o.toISOString(),
        closes_at: c.toISOString(),
        student_submission_deadline: sdl ? sdl.toISOString() : null,
        institution_approval_deadline: adl ? adl.toISOString() : null,
        notes: notes || null,
        created_by: userId,
        registration_fee_amount: feeAmount,
        registration_fee_currency: feeCurrency,
      });
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'A session with this academic_year already exists');
      throw e;
    }
  }

  async patch(id, body, userId) {
    const row = await this.getById(id);
    if (row.status === 'archived') {
      throw httpError(422, 'Cannot update an archived session');
    }
    const fields = {};
    if (row.status === 'closed') {
      const disallowed = Object.keys(body).filter(
        (k) => body[k] !== undefined && !['notes'].includes(k)
      );
      if (disallowed.length) {
        throw httpError(422, 'Only notes may be updated on a closed session');
      }
      if (body.notes === undefined) {
        throw httpError(422, 'notes is required when patching a closed session');
      }
      fields.notes = body.notes;
      fields.updated_by = userId;
      return sessionModel.updateById(id, fields);
    }
    if (row.status === 'open') {
      const allowedOpen = [
        'notes',
        'student_submission_deadline',
        'institution_approval_deadline',
        'registration_fee_amount',
        'registration_fee_currency',
      ];
      const disallowed = Object.keys(body).filter(
        (k) => body[k] !== undefined && !allowedOpen.includes(k)
      );
      if (disallowed.length) {
        throw httpError(422, `Only ${allowedOpen.join(', ')} may be updated on an open session`);
      }
      for (const k of allowedOpen) {
        if (body[k] !== undefined) fields[k] = body[k];
      }
      if (Object.keys(fields).length === 0) {
        throw httpError(422, 'No updatable fields supplied for an open session');
      }
      if (fields.student_submission_deadline) {
        fields.student_submission_deadline = parseTs(
          fields.student_submission_deadline,
          'student_submission_deadline'
        ).toISOString();
      }
      if (fields.institution_approval_deadline) {
        fields.institution_approval_deadline = parseTs(
          fields.institution_approval_deadline,
          'institution_approval_deadline'
        ).toISOString();
      }
      if (fields.registration_fee_amount !== undefined) {
        if (fields.registration_fee_amount === null) {
          fields.registration_fee_amount = null;
        } else {
          const fa = Number(fields.registration_fee_amount);
          if (!Number.isFinite(fa) || fa <= 0) {
            throw httpError(422, 'registration_fee_amount must be a positive number or null');
          }
          fields.registration_fee_amount = fa;
        }
      }
      if (fields.registration_fee_currency !== undefined && fields.registration_fee_currency !== null) {
        const fc = String(fields.registration_fee_currency).trim().toUpperCase().slice(0, 3);
        if (fc.length !== 3) throw httpError(422, 'registration_fee_currency must be a 3-letter code');
        fields.registration_fee_currency = fc;
      }
      fields.updated_by = userId;
      return sessionModel.updateById(id, fields);
    }
    // draft
    if (body.academic_year !== undefined) fields.academic_year = body.academic_year;
    if (body.year_short !== undefined) fields.year_short = body.year_short;
    if (body.opens_at !== undefined) fields.opens_at = parseTs(body.opens_at, 'opens_at').toISOString();
    if (body.closes_at !== undefined) fields.closes_at = parseTs(body.closes_at, 'closes_at').toISOString();
    if (body.student_submission_deadline !== undefined) {
      fields.student_submission_deadline = body.student_submission_deadline
        ? parseTs(body.student_submission_deadline, 'student_submission_deadline').toISOString()
        : null;
    }
    if (body.institution_approval_deadline !== undefined) {
      fields.institution_approval_deadline = body.institution_approval_deadline
        ? parseTs(body.institution_approval_deadline, 'institution_approval_deadline').toISOString()
        : null;
    }
    if (body.notes !== undefined) fields.notes = body.notes;
    if (body.registration_fee_amount !== undefined) {
      if (body.registration_fee_amount === null) {
        fields.registration_fee_amount = null;
      } else {
        const fa = Number(body.registration_fee_amount);
        if (!Number.isFinite(fa) || fa <= 0) {
          throw httpError(422, 'registration_fee_amount must be a positive number or null');
        }
        fields.registration_fee_amount = fa;
      }
    }
    if (body.registration_fee_currency !== undefined) {
      if (body.registration_fee_currency === null || body.registration_fee_currency === '') {
        fields.registration_fee_currency = null;
      } else {
        const fc = String(body.registration_fee_currency).trim().toUpperCase().slice(0, 3);
        if (fc.length !== 3) throw httpError(422, 'registration_fee_currency must be a 3-letter code');
        fields.registration_fee_currency = fc;
      }
    }
    if (Object.keys(fields).length === 0) {
      throw httpError(422, 'No fields to update');
    }
    if (fields.academic_year || fields.year_short) {
      const ay = fields.academic_year || row.academic_year;
      const ys = fields.year_short || row.year_short;
      const v = validateYearShortForAcademicYear(ay, ys);
      if (!v.ok) throw httpError(422, v.error);
    }
    if (fields.opens_at || fields.closes_at) {
      const o = new Date(fields.opens_at || row.opens_at);
      const cl = new Date(fields.closes_at || row.closes_at);
      if (o.getTime() >= cl.getTime()) {
        throw httpError(422, 'opens_at must be before closes_at');
      }
    }
    fields.updated_by = userId;
    return sessionModel.updateById(id, fields);
  }

  async open(id, userId) {
    const row = await this.getById(id);
    if (row.status === 'open') {
      return row;
    }
    if (!canTransitionStatus(row.status, 'open')) {
      throw httpError(422, `Cannot open session in status ${row.status}`);
    }
    const others = await sessionModel.countOtherOpenSessions(id);
    if (others > 0) {
      throw httpError(409, 'Another session is already open; close it before opening this one');
    }
    const updated = await sessionModel.setStatus(id, 'open', userId);
    await sessionModel.insertEvent(id, 'opened', {}, userId);
    return updated;
  }

  async close(id, userId) {
    const row = await this.getById(id);
    if (row.status === 'closed') {
      return row;
    }
    if (row.status !== 'open') {
      throw httpError(422, `Cannot close session in status ${row.status}`);
    }
    const updated = await sessionModel.setStatus(id, 'closed', userId);
    await sessionModel.insertEvent(id, 'closed', {}, userId);
    return updated;
  }

  async reopen(id, userId) {
    const row = await this.getById(id);
    if (!canTransitionStatus(row.status, 'open')) {
      throw httpError(422, `Cannot reopen session in status ${row.status}`);
    }
    const others = await sessionModel.countOtherOpenSessions(id);
    if (others > 0) {
      throw httpError(409, 'Another session is already open');
    }
    const updated = await sessionModel.setStatus(id, 'open', userId);
    await sessionModel.insertEvent(id, 'reopened', {}, userId);
    return updated;
  }

  async finalizeCandidateNumbers(id, userId) {
    const row = await this.getById(id);
    if (row.status !== 'closed') {
      throw httpError(422, 'finalize-candidate-numbers requires a closed session');
    }
    await sessionModel.insertEvent(id, 'finalization_triggered', {}, userId);
    return registrationService.finalizeCandidateNumbers(id, userId);
  }

  async stats(id, _query) {
    await this.getById(id);
    let byStatus = {};
    let total = 0;
    try {
      const result = await pool.query(
        `SELECT status, COUNT(*)::int AS c
         FROM jupeb_registrations
         WHERE session_id = $1
         GROUP BY status`,
        [id]
      );
      for (const r of result.rows) {
        byStatus[r.status] = r.c;
        total += r.c;
      }
    } catch (e) {
      if (e.code !== '42P01') throw e;
      byStatus = {};
      total = 0;
    }
    return {
      session_id: id,
      total_registrations: total,
      registrations_by_status: byStatus,
    };
  }
}

module.exports = new SessionService();
