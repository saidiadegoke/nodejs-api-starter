const axios = require('axios');
const FormInstanceService = require('../services/form-instance.service');
const FormSubmissionService = require('../services/form-submission.service');
const SiteService = require('../../sites/services/site.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const {
  OK,
  CREATED,
  BAD_REQUEST,
  NOT_FOUND,
  FORBIDDEN,
  UNPROCESSABLE_ENTITY,
} = require('../../../shared/constants/statusCodes');

/** Honeypot field names: if any are present and truthy, treat as bot (do not reveal reason). */
const HONEYPOT_FIELDS = ['_hp', 'website', 'url', 'homepage'];

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verify Cloudflare Turnstile token. Returns true if valid, false otherwise.
 */
async function verifyTurnstile(secret, token, remoteip = null) {
  try {
    const params = new URLSearchParams({ secret, response: token });
    if (remoteip) params.set('remoteip', remoteip);
    const { data } = await axios.post(TURNSTILE_VERIFY_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 5000,
    });
    return data && data.success === true;
  } catch {
    return false;
  }
}

/**
 * POST /api/sites/:siteId/forms/submit (public)
 * Submit form data; resolve form by form_instance_id or page_slug + block_id.
 * Bot prevention: honeypot (reject if filled), optional Turnstile CAPTCHA when TURNSTILE_SECRET_KEY is set.
 */
/**
 * Check if siteId is a valid numeric site ID.
 */
function isValidSiteId(siteId) {
  if (siteId == null || typeof siteId !== 'string') return false;
  const n = parseInt(siteId, 10);
  return String(n) === siteId && n > 0;
}

async function submit(req, res) {
  try {
    const siteIdParam = req.params.siteId;
    if (!isValidSiteId(siteIdParam)) {
      return sendError(res, 'Invalid site ID', BAD_REQUEST);
    }
    const siteId = siteIdParam;
    const body = req.body || {};
    const { form_instance_id: formInstanceId, page_slug: pageSlug, block_id: blockId, payload, source_url: sourceUrl, captcha_token: captchaToken } = body;

    // Honeypot: reject if any honeypot field is filled (bots often fill all fields)
    for (const field of HONEYPOT_FIELDS) {
      if (body[field] && String(body[field]).trim() !== '') {
        return sendError(res, 'Submission failed. Please try again.', BAD_REQUEST);
      }
    }

    // Optional CAPTCHA: when TURNSTILE_SECRET_KEY is set, require valid token
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      if (!captchaToken || typeof captchaToken !== 'string') {
        return sendError(res, 'Verification required. Please complete the challenge and try again.', UNPROCESSABLE_ENTITY);
      }
      const verifyOk = await verifyTurnstile(turnstileSecret, captchaToken, req.ip);
      if (!verifyOk) {
        return sendError(res, 'Verification failed. Please try again.', UNPROCESSABLE_ENTITY);
      }
    }

    if (!payload || typeof payload !== 'object') {
      return sendError(res, 'payload is required and must be an object', UNPROCESSABLE_ENTITY);
    }
    const resolved = await FormInstanceService.resolveForSubmit(siteId, {
      formInstanceId,
      pageSlug,
      blockId,
    });
    if (resolved.error) {
      return sendError(res, resolved.error, NOT_FOUND);
    }
    const { formInstance } = resolved;
    const ipAddress = req.ip || req.connection?.remoteAddress || null;
    const userAgent = req.get('user-agent') || null;
    const submission = await FormSubmissionService.createSubmission(
      {
        formInstanceId: formInstance.id,
        siteId: formInstance.site_id,
        pageId: formInstance.page_id,
        blockId: formInstance.block_id,
        payload,
      },
      { sourceUrl, ipAddress, userAgent }
    );
    sendSuccess(
      res,
      { submissionId: submission.id, message: 'Submission received' },
      'Submission received',
      CREATED
    );
  } catch (err) {
    sendError(res, err.message || 'Submission failed', BAD_REQUEST);
  }
}

/**
 * GET /api/sites/:siteId/forms/:formInstanceId/submissions (dashboard)
 */
async function listSubmissions(req, res) {
  try {
    const { siteId, formInstanceId } = req.params;
    const { page, limit, status } = req.query;
    await SiteService.getSiteById(siteId, req.user.user_id);
    const instance = await FormInstanceService.getById(formInstanceId, siteId);
    if (!instance) {
      return sendError(res, 'Form not found', NOT_FOUND);
    }
    const result = await FormSubmissionService.listByFormInstance(formInstanceId, siteId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status: status || undefined,
    });
    sendSuccess(res, { items: result.items, total: result.total, page: result.page, limit: result.limit }, 'Submissions retrieved', OK);
  } catch (err) {
    if (err.message === 'Site not found') {
      return sendError(res, err.message, NOT_FOUND);
    }
    if (err.message === 'Unauthorized') {
      return sendError(res, err.message, FORBIDDEN);
    }
    sendError(res, err.message, BAD_REQUEST);
  }
}

/**
 * GET /api/sites/:siteId/forms/submissions/:submissionId (dashboard)
 */
async function getSubmission(req, res) {
  try {
    const { siteId, submissionId } = req.params;
    await SiteService.getSiteById(siteId, req.user.user_id);
    const submission = await FormSubmissionService.getSubmissionWithResponses(submissionId, siteId);
    if (!submission) {
      return sendError(res, 'Submission not found', NOT_FOUND);
    }
    sendSuccess(res, submission, 'Submission retrieved', OK);
  } catch (err) {
    if (err.message === 'Site not found') {
      return sendError(res, err.message, NOT_FOUND);
    }
    if (err.message === 'Unauthorized') {
      return sendError(res, err.message, FORBIDDEN);
    }
    sendError(res, err.message, BAD_REQUEST);
  }
}

/**
 * PATCH /api/sites/:siteId/forms/submissions/:submissionId (dashboard)
 */
async function updateSubmission(req, res) {
  try {
    const { siteId, submissionId } = req.params;
    const { status } = req.body || {};
    if (!status) {
      return sendError(res, 'status is required', UNPROCESSABLE_ENTITY);
    }
    await SiteService.getSiteById(siteId, req.user.user_id);
    const updated = await FormSubmissionService.updateStatus(submissionId, siteId, status);
    if (!updated) {
      return sendError(res, 'Submission not found', NOT_FOUND);
    }
    sendSuccess(res, updated, 'Submission updated', OK);
  } catch (err) {
    if (err.message === 'Site not found') {
      return sendError(res, err.message, NOT_FOUND);
    }
    if (err.message === 'Unauthorized') {
      return sendError(res, err.message, FORBIDDEN);
    }
    if (err.message && err.message.startsWith('Invalid status')) {
      return sendError(res, err.message, UNPROCESSABLE_ENTITY);
    }
    sendError(res, err.message, BAD_REQUEST);
  }
}

/**
 * POST /api/sites/:siteId/forms/submissions/:submissionId/responses (dashboard)
 */
async function addResponse(req, res) {
  try {
    const { siteId, submissionId } = req.params;
    const { type = 'note', body } = req.body || {};
    if (!body || typeof body !== 'string') {
      return sendError(res, 'body is required and must be a string', UNPROCESSABLE_ENTITY);
    }
    await SiteService.getSiteById(siteId, req.user.user_id);
    const response = await FormSubmissionService.addResponse(
      submissionId,
      siteId,
      { type, body },
      req.user.user_id
    );
    sendSuccess(res, response, 'Response added', CREATED);
  } catch (err) {
    if (err.message === 'Site not found') {
      return sendError(res, err.message, NOT_FOUND);
    }
    if (err.message === 'Unauthorized') {
      return sendError(res, err.message, FORBIDDEN);
    }
    if (err.message === 'Submission not found') {
      return sendError(res, err.message, NOT_FOUND);
    }
    if (err.message && err.message.startsWith('Invalid type')) {
      return sendError(res, err.message, UNPROCESSABLE_ENTITY);
    }
    sendError(res, err.message, BAD_REQUEST);
  }
}

module.exports = {
  submit,
  listSubmissions,
  getSubmission,
  updateSubmission,
  addResponse,
};
