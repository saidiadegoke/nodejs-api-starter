const XLSX = require('xlsx');
const sessionModel = require('../models/session.model');
const universityModel = require('../models/university.model');
const subjectCombinationModel = require('../models/subject-combination.model');
const ninVerificationModel = require('../models/nin-verification.model');
const registrationModel = require('../models/registration.model');
const registrationService = require('./registration.service');
const ninAdapter = require('./nin-adapter.service');
const { normalizeNin, hashNin, ninLast4 } = require('../utils/identity-crypto');
const { assertInstitutionUniversityAccess } = require('../utils/institution-scope');
const { hasPermission } = require('../../../shared/middleware/rbac.middleware');

function httpError(status, message, details) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function assertInstitutionRegistration(userId) {
  const checks = await Promise.all([
    hasPermission(userId, 'candidate.view'),
    hasPermission(userId, 'candidate.create'),
    hasPermission(userId, 'jupeb.registration.manage'),
  ]);
  const ok = checks.some(Boolean);
  if (!ok) {
    throw httpError(
      403,
      'Access denied. Required permission(s): candidate.create, jupeb.registration.manage',
      { required_permissions: ['candidate.create', 'jupeb.registration.manage'] }
    );
  }
}

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

function extractCandidate(rowObj) {
  const clean = {};
  for (const [key, val] of Object.entries(rowObj)) {
    const k = String(key || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    clean[k] = typeof val === 'string' ? val.trim() : (val != null ? String(val).trim() : '');
  }

  const firstName = clean.firstname || '';
  const lastName = clean.lastname || '';
  const middleName = clean.middlename || '';
  const email = clean.email || '';
  const phone = clean.phone || '';
  const nin = clean.nin || '';
  const combinationCode = clean.combinationcode || '';

  const name = [firstName, middleName, lastName].filter(Boolean).join(' ');

  return {
    first_name: firstName,
    last_name: lastName,
    middle_name: middleName,
    name,
    email,
    phone,
    nin,
    combination_code: combinationCode,
    raw: rowObj,
  };
}

class BulkRegistrationService {
  parseSpreadsheet(buffer) {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw httpError(422, 'Uploaded file is empty or missing');
    }
    let workbook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch (err) {
      throw httpError(422, `Failed to parse spreadsheet: ${err.message || 'Invalid format'}`);
    }
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw httpError(422, 'Spreadsheet contains no sheets');
    }
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    return rawRows;
  }

  async process({
    buffer,
    session_id,
    university_id,
    userId,
    provider: providerOverride,
  }) {
    if (!session_id || !university_id) {
      throw httpError(422, 'session_id and university_id are required');
    }
    if (!isUuid(session_id) || !isUuid(university_id)) {
      throw httpError(422, 'session_id and university_id must be valid UUIDs');
    }

    const session = await sessionModel.findById(session_id);
    if (!session) throw httpError(404, 'Session not found');
    if (session.status !== 'open') {
      throw httpError(422, 'Registrations can only be created for an open session');
    }
    if (session.registration_locked) {
      throw httpError(423, 'Registration is locked for this session');
    }

    const university = await universityModel.findById(university_id);
    if (!university || university.status !== 'active') {
      throw httpError(404, 'University not found or inactive');
    }

    await assertInstitutionRegistration(userId);
    await assertInstitutionUniversityAccess(userId, university_id);

    // Cache verified subject combinations for fast validation by code
    const comboCache = new Map();
    const getValidatedCombo = async (code) => {
      if (!code) return null;
      const key = String(code).trim().toLowerCase();
      if (comboCache.has(key)) return comboCache.get(key);

      const combo = await subjectCombinationModel.findByCode(code);
      if (!combo || combo.status !== 'active') {
        throw httpError(422, `Subject combination '${code}' not found or inactive`);
      }
      if (!combo.is_global && combo.university_id !== university_id) {
        throw httpError(422, `Subject combination '${code}' is not available for this university`);
      }

      comboCache.set(key, combo);
      return combo;
    };

    const rawRows = this.parseSpreadsheet(buffer);
    if (!rawRows.length) {
      return {
        total_rows: 0,
        succeeded_count: 0,
        failed_count: 0,
        skipped_count: 0,
        failed: [],
        skipped: [],
      };
    }

    let succeededCount = 0;
    const failed = [];
    const skipped = [];
    const validCandidates = [];
    const seenNinsInBatch = new Set();

    // 1. Initial syntax/field validation of rows
    for (let i = 0; i < rawRows.length; i++) {
      const rowNum = i + 2; // Row 1 is header, first data row is 2
      const candidate = extractCandidate(rawRows[i]);

      if (!candidate.first_name || !candidate.last_name) {
        skipped.push({
          row: rowNum,
          first_name: candidate.first_name,
          last_name: candidate.last_name,
          middle_name: candidate.middle_name,
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          nin: candidate.nin,
          combination_code: candidate.combination_code,
          error_code: 'missing_name',
          error: 'First name and last name are required',
        });
        continue;
      }

      if (!candidate.email || !EMAIL_RE.test(candidate.email)) {
        skipped.push({
          row: rowNum,
          first_name: candidate.first_name,
          last_name: candidate.last_name,
          middle_name: candidate.middle_name,
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          nin: candidate.nin,
          combination_code: candidate.combination_code,
          error_code: 'invalid_email',
          error: 'Valid email address is required',
        });
        continue;
      }

      const normalizedNin = normalizeNin(candidate.nin);
      if (!normalizedNin || normalizedNin.length !== 11) {
        skipped.push({
          row: rowNum,
          first_name: candidate.first_name,
          last_name: candidate.last_name,
          middle_name: candidate.middle_name,
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          nin: candidate.nin,
          combination_code: candidate.combination_code,
          error_code: 'invalid_nin',
          error: 'NIN must be exactly 11 digits',
        });
        continue;
      }

      if (!candidate.combination_code) {
        skipped.push({
          row: rowNum,
          first_name: candidate.first_name,
          last_name: candidate.last_name,
          middle_name: candidate.middle_name,
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          nin: candidate.nin,
          combination_code: candidate.combination_code,
          error_code: 'missing_combination_code',
          error: 'combination_code is required',
        });
        continue;
      }

      // Check intra-file duplicate NIN
      if (seenNinsInBatch.has(normalizedNin)) {
        failed.push({
          row: rowNum,
          first_name: candidate.first_name,
          last_name: candidate.last_name,
          middle_name: candidate.middle_name,
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          nin_last4: ninLast4(normalizedNin),
          combination_code: candidate.combination_code,
          error_code: 'duplicate_in_file',
          error: 'Duplicate NIN in uploaded file',
        });
        continue;
      }
      seenNinsInBatch.add(normalizedNin);

      const ninHash = hashNin(normalizedNin);
      validCandidates.push({
        rowNumber: rowNum,
        first_name: candidate.first_name,
        last_name: candidate.last_name,
        middle_name: candidate.middle_name,
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        normalizedNin,
        ninHash,
        combination_code: candidate.combination_code,
      });
    }

    if (!validCandidates.length) {
      return {
        total_rows: rawRows.length,
        succeeded_count: 0,
        failed_count: failed.length,
        skipped_count: skipped.length,
        failed,
        skipped,
      };
    }

    // 2. Batch-preload NIN cache and existing blocking registrations in single queries
    const allHashes = validCandidates.map((c) => c.ninHash);
    const [cachedRows, blockedHashesSet] = await Promise.all([
      ninVerificationModel.findActiveCacheByNinHashBatch(allHashes),
      registrationModel.findBlockingRegistrationsByNinHashes(allHashes, { sessionId: session_id }),
    ]);

    const activeCacheMap = new Map();
    for (const row of cachedRows) {
      activeCacheMap.set(row.nin_hash, row);
    }

    // 3. Process candidates with concurrency cap of 5
    await mapConcurrent(validCandidates, 5, async (candidate) => {
      let comboRow = null;
      try {
        comboRow = await getValidatedCombo(candidate.combination_code);
      } catch (comboErr) {
        failed.push({
          row: candidate.rowNumber,
          first_name: candidate.first_name,
          last_name: candidate.last_name,
          middle_name: candidate.middle_name,
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          nin_last4: ninLast4(candidate.normalizedNin),
          combination_code: candidate.combination_code,
          error_code: 'invalid_subject_combination',
          error: comboErr.message || 'Invalid subject combination',
        });
        return;
      }
      const candidateComboId = comboRow.id;

      // Check if candidate's NIN is already registered for this session
      if (blockedHashesSet.has(candidate.ninHash)) {
        failed.push({
          row: candidate.rowNumber,
          first_name: candidate.first_name,
          last_name: candidate.last_name,
          middle_name: candidate.middle_name,
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          nin_last4: ninLast4(candidate.normalizedNin),
          combination_code: comboRow.code,
          error_code: 'already_registered',
          error: 'This NIN is already registered for this session',
        });
        return;
      }

      let ninVerificationId = null;

      // Check active cache first (free — avoids calling provider)
      if (activeCacheMap.has(candidate.ninHash)) {
        const cachedRow = activeCacheMap.get(candidate.ninHash);
        ninVerificationId = cachedRow.id;

        // Best-effort intake update
        try {
          await ninVerificationModel.mergeIntakePayload(cachedRow.id, {
            first_name: candidate.first_name,
            last_name: candidate.last_name,
            middle_name: candidate.middle_name,
            name: candidate.name,
            email: candidate.email,
            phone: candidate.phone,
            subject_combination_id: candidateComboId,
            subject_combination_code: comboRow.code,
          });
        } catch {
          // ignore non-fatal intake merge failure
        }
      } else {
        // Not in active cache: check if blocked globally across any active session
        const isBlockedGlobally = await registrationModel.hasBlockingRegistrationForNinHash(
          candidate.ninHash
        );
        if (isBlockedGlobally) {
          failed.push({
            row: candidate.rowNumber,
            first_name: candidate.first_name,
            last_name: candidate.last_name,
            middle_name: candidate.middle_name,
            name: candidate.name,
            email: candidate.email,
            phone: candidate.phone,
            nin_last4: ninLast4(candidate.normalizedNin),
            combination_code: comboRow.code,
            error_code: 'already_registered',
            error: 'This NIN is already registered',
          });
          return;
        }

        // Call NIN verification provider
        const adapterOpts = {};
        if (providerOverride) adapterOpts.provider = String(providerOverride);

        let adapterResult;
        try {
          adapterResult = await ninAdapter.verifyNin(candidate.normalizedNin, adapterOpts);
        } catch (err) {
          adapterResult = {
            outcome: 'unavailable',
            error_code: 'provider_error',
            error_message: err.message || 'NIN verification call failed',
          };
        }

        const useBodyMock = String(providerOverride || '').toLowerCase() === 'mock';
        const providerName =
          useBodyMock || (adapterResult && adapterResult.simulated_outage) ? 'mock' : 'speedysms';

        if (adapterResult.outcome === 'unavailable') {
          const seconds = adapterResult.retry_after_seconds || 300;
          const retry_after = new Date(Date.now() + seconds * 1000).toISOString();
          try {
            await ninVerificationModel.createPending({
              nin_hash: candidate.ninHash,
              nin_last4: ninLast4(candidate.normalizedNin),
              provider: providerName,
              intake_payload: {
                first_name: candidate.first_name,
                last_name: candidate.last_name,
                middle_name: candidate.middle_name,
                name: candidate.name,
                email: candidate.email,
                phone: candidate.phone,
                subject_combination_id: candidateComboId,
                subject_combination_code: comboRow.code,
              },
              retry_after,
              last_error_code: adapterResult.error_code || 'provider_unavailable',
              error_payload: {
                code: adapterResult.error_code || 'provider_unavailable',
                message: adapterResult.error_message || null,
              },
              requested_by: userId,
            });
          } catch {
            // ignore
          }

          failed.push({
            row: candidate.rowNumber,
            first_name: candidate.first_name,
            last_name: candidate.last_name,
            middle_name: candidate.middle_name,
            name: candidate.name,
            email: candidate.email,
            phone: candidate.phone,
            nin_last4: ninLast4(candidate.normalizedNin),
            combination_code: comboRow.code,
            error_code: 'nin_unavailable',
            error: adapterResult.error_message || 'NIN provider is temporarily unavailable',
          });
          return;
        }

        if (adapterResult.outcome === 'failed') {
          try {
            await ninVerificationModel.create({
              nin_hash: candidate.ninHash,
              nin_last4: ninLast4(candidate.normalizedNin),
              provider: providerName,
              provider_reference: adapterResult.provider_reference || null,
              status: 'failed',
              response_payload: {},
              error_payload: {
                code: adapterResult.error_code || 'verification_failed',
                message: adapterResult.error_message || 'Verification failed',
              },
              verified_at: null,
              requested_by: userId,
              intake_payload: {
                first_name: candidate.first_name,
                last_name: candidate.last_name,
                middle_name: candidate.middle_name,
                name: candidate.name,
                email: candidate.email,
                phone: candidate.phone,
                subject_combination_id: candidateComboId,
                subject_combination_code: comboRow.code,
              },
            });
          } catch {
            // ignore
          }

          failed.push({
            row: candidate.rowNumber,
            first_name: candidate.first_name,
            last_name: candidate.last_name,
            middle_name: candidate.middle_name,
            name: candidate.name,
            email: candidate.email,
            phone: candidate.phone,
            nin_last4: ninLast4(candidate.normalizedNin),
            combination_code: comboRow.code,
            error_code: 'nin_failed',
            error: adapterResult.error_message || 'NIN verification failed',
          });
          return;
        }

        // Outcome: verified!
        try {
          const verifiedRow = await ninVerificationModel.create({
            nin_hash: candidate.ninHash,
            nin_last4: ninLast4(candidate.normalizedNin),
            provider: providerName,
            provider_reference: adapterResult.provider_reference || null,
            status: 'verified',
            response_payload: { ...(adapterResult.profile || {}) },
            error_payload: {},
            verified_at: new Date().toISOString(),
            requested_by: userId,
            intake_payload: {
              first_name: candidate.first_name,
              last_name: candidate.last_name,
              middle_name: candidate.middle_name,
              name: candidate.name,
              email: candidate.email,
              phone: candidate.phone,
              subject_combination_id: candidateComboId,
              subject_combination_code: comboRow.code,
            },
          });
          ninVerificationId = verifiedRow.id;
          activeCacheMap.set(candidate.ninHash, verifiedRow);
        } catch (createErr) {
          failed.push({
            row: candidate.rowNumber,
            first_name: candidate.first_name,
            last_name: candidate.last_name,
            middle_name: candidate.middle_name,
            name: candidate.name,
            email: candidate.email,
            phone: candidate.phone,
            nin_last4: ninLast4(candidate.normalizedNin),
            combination_code: comboRow.code,
            error_code: 'nin_persistence_failed',
            error: createErr.message || 'Failed to save NIN verification record',
          });
          return;
        }
      }

      // 4. Create registration record and send registration code email
      try {
        await registrationService.createRegistrationRecord({
          session_id,
          university_id,
          subject_combination_id: candidateComboId,
          nin_verification_id: ninVerificationId,
          university,
          userId,
        });

        // Add to blocked hashes to prevent duplicate registration in same session
        blockedHashesSet.add(candidate.ninHash);
        succeededCount++;
      } catch (regErr) {
        failed.push({
          row: candidate.rowNumber,
          first_name: candidate.first_name,
          last_name: candidate.last_name,
          middle_name: candidate.middle_name,
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          nin_last4: ninLast4(candidate.normalizedNin),
          combination_code: comboRow.code,
          error_code: regErr.status === 409 ? 'already_registered' : 'registration_failed',
          error: regErr.message || 'Registration creation failed',
        });
      }
    });

    // Sort outputs by row number ascending
    failed.sort((a, b) => a.row - b.row);
    skipped.sort((a, b) => a.row - b.row);

    return {
      total_rows: rawRows.length,
      succeeded_count: succeededCount,
      failed_count: failed.length,
      skipped_count: skipped.length,
      failed,
      skipped,
    };
  }
}

module.exports = new BulkRegistrationService();
