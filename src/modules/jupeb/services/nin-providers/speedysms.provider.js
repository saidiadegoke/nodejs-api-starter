const axios = require('axios');

// SpeedySMS Identity API — POST /identity/nin returns IdentityLookupResult
// (see /Users/pro/websites/speedysms-web/IDENTITY_PROVIDER_CONTRACT.md §5).
// We map that wire shape onto reg-portal's internal {outcome, profile, ...}
// contract consumed by nin-resolver.job.js and identity.service.js.

const DEFAULT_BASE_URL = 'https://api.speedysms.com.ng';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_SECONDS = 300;

const name = 'speedysms';

function joinNonEmpty(parts, sep) {
  return parts.filter((p) => typeof p === 'string' && p.trim() !== '').join(sep) || null;
}

function mapProfile(payload) {
  const data = payload && payload.data ? payload.data : {};
  const birthplace = data.birthplace || {};
  const residence = data.residence || {};
  const nok = data.next_of_kin || {};
  return {
    first_name: data.first_name ?? null,
    last_name: data.last_name ?? null,
    middle_name: data.middle_name ?? null,
    date_of_birth: data.date_of_birth ?? null,
    gender: data.gender ?? null,
    address: joinNonEmpty(
      [residence.address, residence.town, residence.lga, residence.state],
      ', '
    ),
    state_of_origin: birthplace.state ?? null,
    lga: birthplace.lga ?? null,
    place_of_birth: joinNonEmpty(
      [birthplace.lga, birthplace.state, birthplace.country],
      ', '
    ),
    phone: data.phone_number ?? null,
    next_of_kin: {
      name: joinNonEmpty([nok.first_name, nok.middle_name, nok.last_name], ' '),
      // SpeedySMS NormalizedData does not carry NOK relationship or contact;
      // leave null rather than invent values.
      relationship: null,
      contact: null,
    },
    photo_url: payload && payload.photo_url ? payload.photo_url : null,
  };
}

function unavailable(errorCode, errorMessage, retrySeconds) {
  return {
    outcome: 'unavailable',
    error_code: errorCode,
    error_message: errorMessage,
    retry_after_seconds: retrySeconds,
  };
}

function getConfig() {
  const retry = Number(process.env.JUPEB_NIN_RETRY_AFTER_SECONDS) || DEFAULT_RETRY_SECONDS;
  const timeout = Number(process.env.SPEEDYSMS_NIN_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  return {
    apiKey: process.env.SPEEDYSMS_API_KEY || '',
    baseUrl: (process.env.SPEEDYSMS_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
    timeoutMs: timeout,
    retryAfterSeconds: retry,
  };
}

async function verifyNin(normalizedNin, { http = axios } = {}) {
  const { apiKey, baseUrl, timeoutMs, retryAfterSeconds } = getConfig();

  // Local input checks. SpeedySMS will reject malformed NINs too, but a
  // short-circuit here saves a billed round-trip on obvious junk.
  if (typeof normalizedNin !== 'string' || normalizedNin.length !== 11) {
    return {
      outcome: 'failed',
      error_code: 'invalid_nin',
      error_message: 'NIN must be 11 digits',
    };
  }

  if (!apiKey) {
    // Misconfiguration — surface as unavailable so the resolver retries
    // after an operator sets the secret, rather than terminally failing
    // a real candidate's verification.
    return unavailable(
      'provider_misconfigured',
      'SPEEDYSMS_API_KEY is not set',
      retryAfterSeconds
    );
  }

  let response;
  try {
    response = await http.post(
      `${baseUrl}/identity/nin`,
      { nin: normalizedNin },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        timeout: timeoutMs,
        // Inspect 4xx ourselves to map status precisely; let 5xx and network
        // errors throw.
        validateStatus: (s) => s < 500,
      }
    );
  } catch (err) {
    return unavailable(
      'provider_unavailable',
      err.message || 'SpeedySMS request failed',
      retryAfterSeconds
    );
  }

  const body = response.data || {};

  // SpeedySMS's live wire shape wraps every result in {success, message, ...}.
  // - Success:  { success: true,  message: 'Lookup successful', data: {...profile}, lookup_id? }
  // - Refusal:  { success: false, code, message }  (identity_balance_exhausted,
  //             unauthenticated, forbidden, rate_limited, not_found, invalid, ...)
  // The contract doc still describes the older {status: 'success'|'not_found'|...}
  // shape — keep that branch below for back-compat with mock fixtures and any
  // gateway that still uses it.
  if (body && body.success === true) {
    return {
      outcome: 'verified',
      provider_reference: (body.data && body.data.lookup_id) || body.lookup_id || null,
      profile: mapProfile(body),
    };
  }
  if (body && body.success === false && body.code) {
    const code = String(body.code).toLowerCase();
    // Terminal codes — record's not found or input is bad. Charged per §4.
    if (code === 'not_found' || code === 'invalid') {
      return {
        outcome: 'failed',
        error_code: code,
        error_message: body.message || (code === 'invalid' ? 'Invalid NIN' : 'NIN not found'),
      };
    }
    // Everything else (identity_balance_exhausted, rate_limited, …) is retryable.
    return unavailable(
      code,
      body.message || `SpeedySMS refused with ${code}`,
      retryAfterSeconds
    );
  }

  const status = (body.status || '').toLowerCase();

  if (status === 'success') {
    return {
      outcome: 'verified',
      provider_reference: body.lookup_id || null,
      profile: mapProfile(body),
    };
  }

  if (status === 'not_found' || status === 'invalid') {
    return {
      outcome: 'failed',
      error_code: status,
      error_message: body.error_message || (status === 'invalid' ? 'Invalid NIN' : 'NIN not found'),
    };
  }

  return unavailable(
    status || 'provider_unavailable',
    body.error_message || body.message || `SpeedySMS returned ${response.status}`,
    retryAfterSeconds
  );
}

module.exports = { name, verifyNin };
