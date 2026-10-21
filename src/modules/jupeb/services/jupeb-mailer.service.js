/**
 * JUPEB lifecycle email helpers.
 *
 * Centralizes the data lookups + template/placeholder shape for every
 * lifecycle email. Callers fire-and-forget: send failures are logged but
 * never propagate, because email outages must not block the lifecycle
 * event itself (approval, claim, etc.).
 *
 * Templates live under src/shared/emails/ and use {{key}} placeholders.
 */
const pool = require('../../../database/pool');
const { resolveCandidateDisplayName } = require('../utils/candidate-name');
const sendEmail = require('../../../utils/utils/sendEmail');

function appName() {
  return process.env.APP_NAME || 'Registration Portal';
}

function frontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function year() {
  return new Date().getUTCFullYear();
}

function fireAndForget(promise, label) {
  return Promise.resolve(promise).catch((e) => {
    // eslint-disable-next-line no-console
    console.warn(`[jupeb-mailer:${label}] send failed:`, e && e.message);
  });
}

// Pulls the candidate's email, first name, and university from a
// registration id. Returns null when the email is unknown — callers must
// treat that as "skip the send".
async function loadRecipient(registrationId) {
  const r = await pool.query(
    `SELECT r.id,
            r.institution_issued_code,
            r.institution_code_expires_at,
            r.provisional_candidate_code,
            r.jupeb_candidate_number,
            r.approved_at,
            r.status_reason,
            u.email AS user_email,
            u.phone AS user_phone,
            p.first_name AS profile_first_name,
            uni.name AS university_name,
            n.intake_payload AS nin_intake,
            n.response_payload AS nin_payload,
            n.status AS nin_verification_status
       FROM jupeb_registrations r
       LEFT JOIN users u            ON u.id = r.user_id
       LEFT JOIN profiles p         ON p.user_id = r.user_id
       LEFT JOIN jupeb_universities uni ON uni.id = r.university_id
       LEFT JOIN jupeb_nin_verifications n ON n.id = r.nin_verification_id
      WHERE r.id = $1`,
    [registrationId]
  );
  const row = r.rows[0];
  if (!row) return null;

  // Prefer the authenticated user's email; fall back to intake (set at
  // NIN-verify time) which is the only address we have pre-claim.
  const intake = row.nin_intake || {};
  const nin = row.nin_payload || {};
  const email = row.user_email || intake.email || null;
  if (!email) return null;

  const fullName = resolveCandidateDisplayName({
    ninPayload: nin,
    intake,
    profile: { first_name: row.profile_first_name },
    ninStatus: row.nin_verification_status || null,
  });
  const firstName = (fullName && fullName.split(/\s+/)[0]) || 'Candidate';

  return {
    registrationId: row.id,
    email,
    firstName,
    universityName: row.university_name || 'your institution',
    institutionIssuedCode: row.institution_issued_code,
    institutionCodeExpiresAt: row.institution_code_expires_at,
    provisionalCode: row.provisional_candidate_code,
    candidateNumber: row.jupeb_candidate_number,
    approvedAt: row.approved_at,
    statusReason: row.status_reason,
  };
}

function dashboardUrl() {
  return `${frontendUrl()}/`;
}

function claimUrl(code) {
  return `${frontendUrl()}/auth/claim?code=${encodeURIComponent(code || '')}`;
}

function formatDate(value) {
  if (!value) return '';
  try {
    const d = new Date(value);
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

/**
 * Sent when an institution issues a registration code. Goes to the
 * NIN-intake email if present (the candidate has not yet claimed and so
 * has no user_id / users.email at this point).
 */
async function sendCodeIssued(registrationId) {
  const recipient = await loadRecipient(registrationId);
  if (!recipient || !recipient.institutionIssuedCode) return;
  const expiresAt = recipient.institutionCodeExpiresAt;
  const expiryNotice = expiresAt
    ? `<p style="margin: 16px 0 0 0; font-size: 14px; color: #b91c1c;">This code expires on ${formatDate(expiresAt)}. Claim it before then.</p>`
    : '';
  return fireAndForget(
    sendEmail({
      to: recipient.email,
      subject: `${appName()} — your JUPEB registration code`,
      templateFile: 'jupeb-code-issued.html',
      placeholders: {
        appName: appName(),
        firstName: recipient.firstName,
        universityName: recipient.universityName,
        code: recipient.institutionIssuedCode,
        claimUrl: claimUrl(recipient.institutionIssuedCode),
        expiryNotice,
        email: recipient.email,
        year: year(),
      },
    }),
    'code-issued'
  );
}

/**
 * Sent immediately after a student claims a code via
 * `POST /auth/complete-registration`.
 */
async function sendWelcomeStudent({ email, firstName, universityName, provisionalCode }) {
  if (!email) return;
  return fireAndForget(
    sendEmail({
      to: email,
      subject: `Welcome to ${appName()}`,
      templateFile: 'jupeb-welcome-student.html',
      placeholders: {
        appName: appName(),
        firstName: firstName || 'Candidate',
        universityName: universityName || 'your institution',
        provisionalCode: provisionalCode || '',
        dashboardUrl: dashboardUrl(),
        email,
        year: year(),
      },
    }),
    'welcome-student'
  );
}

async function sendRegistrationApproved(registrationId) {
  const recipient = await loadRecipient(registrationId);
  if (!recipient) return;
  return fireAndForget(
    sendEmail({
      to: recipient.email,
      subject: `${appName()} — your JUPEB registration was approved`,
      templateFile: 'jupeb-registration-approved.html',
      placeholders: {
        appName: appName(),
        firstName: recipient.firstName,
        universityName: recipient.universityName,
        candidateNumber: recipient.candidateNumber || recipient.provisionalCode || '',
        approvedAt: formatDate(recipient.approvedAt) || formatDate(new Date()),
        dashboardUrl: dashboardUrl(),
        email: recipient.email,
        year: year(),
      },
    }),
    'registration-approved'
  );
}

async function sendRegistrationRejected(registrationId, reason) {
  const recipient = await loadRecipient(registrationId);
  if (!recipient) return;
  return fireAndForget(
    sendEmail({
      to: recipient.email,
      subject: `${appName()} — your JUPEB registration was not approved`,
      templateFile: 'jupeb-registration-rejected.html',
      placeholders: {
        appName: appName(),
        firstName: recipient.firstName,
        universityName: recipient.universityName,
        reason: reason || recipient.statusReason || 'No reason provided.',
        dashboardUrl: dashboardUrl(),
        email: recipient.email,
        year: year(),
      },
    }),
    'registration-rejected'
  );
}

async function sendRegistrationWithdrawn(registrationId, reason) {
  const recipient = await loadRecipient(registrationId);
  if (!recipient) return;
  const reasonText = reason || recipient.statusReason;
  const reasonBlock = reasonText
    ? `<table cellpadding="14" cellspacing="0" style="width: 100%; background: #f1f5f9; border-left: 4px solid #475569; border-radius: 6px; margin: 16px 0;"><tr><td><p style="margin: 0 0 6px 0; font-size: 13px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">Reason given</p><p style="margin: 0; color: #1e293b;">${reasonText}</p></td></tr></table>`
    : '';
  return fireAndForget(
    sendEmail({
      to: recipient.email,
      subject: `${appName()} — your JUPEB registration was withdrawn`,
      templateFile: 'jupeb-registration-withdrawn.html',
      placeholders: {
        appName: appName(),
        firstName: recipient.firstName,
        universityName: recipient.universityName,
        reasonBlock,
        dashboardUrl: dashboardUrl(),
        email: recipient.email,
        year: year(),
      },
    }),
    'registration-withdrawn'
  );
}

/**
 * Sent when the registrar finalizes a session and a matric number is
 * assigned to the student's registration. From this point on, the
 * student's only valid login identifier is the matric number.
 */
async function sendMatricAssigned(registrationId) {
  const recipient = await loadRecipient(registrationId);
  if (!recipient || !recipient.candidateNumber) return;
  return fireAndForget(
    sendEmail({
      to: recipient.email,
      subject: `${appName()} — your JUPEB candidate number is ${recipient.candidateNumber}`,
      templateFile: 'jupeb-matric-assigned.html',
      placeholders: {
        appName: appName(),
        firstName: recipient.firstName,
        universityName: recipient.universityName,
        candidateNumber: recipient.candidateNumber,
        dashboardUrl: dashboardUrl(),
        email: recipient.email,
        year: year(),
      },
    }),
    'matric-assigned'
  );
}

/**
 * Sent when an institution_admin account is provisioned (e.g. POST /catalog/universities).
 */
async function sendInstitutionAdminCredentials({ email, password, firstName, universityName }) {
  if (!email || !password) return;
  const loginUrl = `${process.env.INSTITUTION_FRONTEND_URL}`;
  const cleanFirst = firstName && String(firstName).trim().toLowerCase() !== 'there' ? String(firstName).trim() : '';
  const resolvedFirst = cleanFirst || universityName || 'Admin';
  return fireAndForget(
    sendEmail({
      to: email,
      subject: `${appName()} — your institution account is ready`,
      templateFile: 'jupeb-institution-admin-credentials.html',
      placeholders: {
        appName: appName(),
        firstName: resolvedFirst,
        universityName: universityName || 'your institution',
        email,
        password,
        loginUrl,
        year: year(),
      },
    }),
    'institution-admin-credentials'
  );
}

/**
 * Sent when an admin-created portal user account is created with a temporary password.
 */
async function sendUserCredentials({ email, password, firstName, role, universityName }) {
  if (!email || !password) return;
  const loginUrl = `${frontendUrl()}/auth/login`;
  const roleLabel = role ? String(role).replace(/_/g, ' ') : 'portal user';
  const cleanFirst = firstName && String(firstName).trim().toLowerCase() !== 'there' ? String(firstName).trim() : '';
  const resolvedFirst = cleanFirst || universityName || 'User';
  return fireAndForget(
    sendEmail({
      to: email,
      subject: `${appName()} — your account is ready`,
      templateFile: 'jupeb-user-credentials.html',
      placeholders: {
        appName: appName(),
        firstName: resolvedFirst,
        role: roleLabel,
        universityName: universityName || '',
        email,
        password,
        loginUrl,
        year: year(),
      },
    }),
    'user-credentials'
  );
}

module.exports = {
  sendCodeIssued,
  sendWelcomeStudent,
  sendRegistrationApproved,
  sendRegistrationRejected,
  sendRegistrationWithdrawn,
  sendMatricAssigned,
  sendInstitutionAdminCredentials,
  sendUserCredentials,
};
