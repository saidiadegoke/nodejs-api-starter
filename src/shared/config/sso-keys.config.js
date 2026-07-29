const SSO_TARGET_APPS = ['crms', 'attendance'];

const TARGET_LABELS = {
  crms: 'CRMS',
  attendance: 'Attendance',
};

function normalizePem(value) {
  if (!value) return null;
  return String(value).replace(/\\n/g, '\n').trim();
}

function parseJwksJson(raw) {
  if (!raw) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`CRP_SSO_JWKS_JSON is not valid JSON: ${error.message}`);
  }

  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.keys)) return parsed.keys;
  if (parsed && parsed.kty) return [parsed];

  throw new Error('CRP_SSO_JWKS_JSON must be a JWK array or { keys: [...] } object');
}

function normalizeCallbackUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return null;
  }

  return parsed.toString();
}

function resolveLaunchCallbackUrl(targetApp, redirectUri) {
  const hasRedirectParam =
    redirectUri !== undefined && redirectUri !== null && String(redirectUri).trim() !== '';

  if (hasRedirectParam) {
    return normalizeCallbackUrl(redirectUri);
  }

  const config = getSsoConfig();
  const fromEnv = config.callbackUrls[targetApp];
  return fromEnv ? normalizeCallbackUrl(fromEnv) : null;
}

function getSsoConfig() {
  const issuer = process.env.CRP_SSO_ISSUER || null;
  const currentKid = process.env.CRP_SSO_CURRENT_KID || null;
  const privateKeyPem = normalizePem(process.env.CRP_SSO_PRIVATE_KEY_PEM);
  const jwksKeys = process.env.CRP_SSO_JWKS_JSON ? parseJwksJson(process.env.CRP_SSO_JWKS_JSON) : [];

  const callbackUrls = {
    crms: process.env.CRMS_SSO_CALLBACK_URL || null,
    attendance: process.env.ATTENDANCE_SSO_CALLBACK_URL || null,
  };

  const enabled = Boolean(issuer && currentKid && privateKeyPem && jwksKeys.length > 0);

  return {
    issuer,
    currentKid,
    privateKeyPem,
    jwksKeys,
    callbackUrls,
    enabled,
    targetApps: SSO_TARGET_APPS,
  };
}

function listConfiguredTargets() {
  const config = getSsoConfig();
  if (!config.enabled) {
    return [];
  }

  return SSO_TARGET_APPS.map((app) => ({
    app,
    label: TARGET_LABELS[app] || app,
    launch_path: `/sso/launch/${app}`,
    default_callback_url: config.callbackUrls[app] || null,
  }));
}

module.exports = {
  SSO_TARGET_APPS,
  TARGET_LABELS,
  getSsoConfig,
  listConfiguredTargets,
  normalizeCallbackUrl,
  resolveLaunchCallbackUrl,
  normalizePem,
  parseJwksJson,
};
