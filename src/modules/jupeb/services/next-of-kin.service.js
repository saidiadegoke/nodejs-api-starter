const nextOfKinModel = require('../models/next-of-kin.model');
const registrationModel = require('../models/registration.model');

function httpError(status, message, details = null) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

const ALLOWED_RELATIONSHIPS = new Set([
  'mother', 'father', 'parent', 'guardian', 'spouse',
  'sibling', 'child', 'relative', 'friend', 'other'
]);

function validatePayload(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object') {
    throw httpError(422, 'Body is required');
  }
  const errors = [];

  const required = ['name', 'relationship'];
  for (const field of required) {
    if (!partial && (body[field] === undefined || body[field] === null || String(body[field]).trim() === '')) {
      errors.push(`${field} is required`);
    }
  }

  if (body.name !== undefined && typeof body.name === 'string' && body.name.trim().length < 2) {
    errors.push('name must be at least 2 characters');
  }

  if (body.relationship !== undefined && body.relationship !== null) {
    const rel = String(body.relationship).toLowerCase();
    if (!ALLOWED_RELATIONSHIPS.has(rel)) {
      errors.push(`relationship must be one of: ${Array.from(ALLOWED_RELATIONSHIPS).join(', ')}`);
    }
  }

  const phone = body.phone ? String(body.phone).trim() : null;
  const email = body.email ? String(body.email).trim() : null;
  if (!partial && !phone && !email) {
    errors.push('phone or email is required');
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    errors.push('email is not a valid address');
  }
  if (phone && phone.length < 6) {
    errors.push('phone is too short');
  }

  if (errors.length) {
    throw httpError(422, 'Invalid next-of-kin payload', { errors });
  }

  return {
    name: body.name && String(body.name).trim(),
    relationship: body.relationship && String(body.relationship).toLowerCase(),
    phone,
    email,
    address: body.address ? String(body.address).trim() : null
  };
}

async function loadStudentRegistration(userId) {
  const reg = await registrationModel.findLatestForUser(userId);
  if (!reg) throw httpError(404, 'No registration found for current user');
  return reg;
}

class NextOfKinService {
  async getMine(userId) {
    const reg = await loadStudentRegistration(userId);
    const row = await nextOfKinModel.findActiveByRegistration(reg.id);
    if (!row) throw httpError(404, 'No next-of-kin recorded yet');
    return { registration_id: reg.id, ...row };
  }

  async createMine(userId, body) {
    const reg = await loadStudentRegistration(userId);
    const existing = await nextOfKinModel.findActiveByRegistration(reg.id);
    if (existing) {
      throw httpError(409, 'A next-of-kin already exists. Use PUT to replace it.', {
        error_code: 'next_of_kin_exists'
      });
    }
    const payload = validatePayload(body);
    const row = await nextOfKinModel.create({
      registration_id: reg.id,
      name: payload.name,
      relationship: payload.relationship,
      phone: payload.phone,
      email: payload.email,
      address: payload.address,
      source: 'student',
      created_by: userId
    });
    return { registration_id: reg.id, ...row };
  }

  async replaceMine(userId, body) {
    const reg = await loadStudentRegistration(userId);
    const payload = validatePayload(body);
    const row = await nextOfKinModel.softReplaceActive(reg.id, {
      ...payload,
      source: 'student',
      created_by: userId
    });
    return { registration_id: reg.id, ...row };
  }

  async listHistoryMine(userId) {
    const reg = await loadStudentRegistration(userId);
    const rows = await nextOfKinModel.listHistoryByRegistration(reg.id);
    return { registration_id: reg.id, history: rows };
  }
}

module.exports = new NextOfKinService();
module.exports.validatePayload = validatePayload;
module.exports.ALLOWED_RELATIONSHIPS = ALLOWED_RELATIONSHIPS;
