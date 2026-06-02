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

/**
 * Maps SpeedySMS IdentityLookupResult (the `data` object inside { success, data })
 * onto the profile we persist on `jupeb_nin_verifications.response_payload` and
 * return from POST /identity/nin/verify. Includes flat M.12/write-through fields
 * plus nested upstream slices and lookup metadata.
 *
 * @param {object} lookupResult IdentityLookupResult (may be legacy top-level body)
 */
function mapProfile(lookupResult) {
  const env = lookupResult && typeof lookupResult === 'object' ? lookupResult : {};
  const data = env.data && typeof env.data === 'object' ? env.data : {};
  const birthplace = data.birthplace || {};
  const residence = data.residence || {};
  const nok = data.next_of_kin || {};
  const nokName = joinNonEmpty([nok.first_name, nok.middle_name, nok.last_name], ' ');
  return {
    first_name: data.first_name ?? null,
    last_name: data.last_name ?? null,
    middle_name: data.middle_name ?? null,
    title: data.title ?? null,
    date_of_birth: data.date_of_birth ?? null,
    gender: data.gender ?? null,
    height: data.height ?? null,
    marital_status: data.marital_status ?? null,
    religion: data.religion ?? null,
    profession: data.profession ?? null,
    education_level: data.education_level ?? null,
    employment_status: data.employment_status ?? null,
    spoken_language: data.spoken_language ?? null,
    email: data.email ?? null,
    phone_number: data.phone_number ?? null,
    phone: data.phone_number ?? null,
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
    birthplace: Object.keys(birthplace).length ? birthplace : null,
    residence: Object.keys(residence).length ? residence : null,
    next_of_kin: {
      name: nokName || null,
      relationship: nok.relationship ?? null,
      contact: nok.phone ?? nok.contact ?? nok.contact_no ?? null,
    },
    next_of_kin_record: Object.keys(nok).length ? nok : null,
    tracking_id: data.tracking_id ?? null,
    photo_url: env.photo_url ?? null,
    signature_url: env.signature_url ?? null,
    provider_lookup: {
      lookup_id: env.lookup_id ?? null,
      nin_last_4: env.nin_last_4 ?? null,
      from_cache: env.from_cache ?? null,
      cached_at: env.cached_at ?? null,
      original_lookup_id: env.original_lookup_id ?? null,
      billed: env.billed ?? null,
      error_message: env.error_message ?? null,
    },
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

/**
 * SpeedySMS sometimes returns HTTP 200 with { success: true, data: { status: 'failed', error } }.
 * Wallet / pool errors may incorrectly use error.code "not_found" — detect by message.
 */
function isBalanceOrPoolExhaustedMessage(message) {
  const m = String(message || '').toLowerCase();
  return (
    /insufficient\s+wallet|wallet\s+balance|balance\s+to\s+process|identity\s*balance|top\s*up|billing|pool/i.test(m)
  );
}

function resolveNestedDataFailure(inner, body, retryAfterSeconds) {
  const err = (inner && inner.error) || {};
  let errCode = String(err.code || inner.error_code || 'verification_failed').toLowerCase();
  const errMsg = err.message || inner.error_message || body.message || 'NIN verification failed';

  if (errCode === 'identity_balance_exhausted' || isBalanceOrPoolExhaustedMessage(errMsg)) {
    return unavailable(
      'identity_balance_exhausted',
      errMsg,
      retryAfterSeconds
    );
  }

  // Upstream reuses "not_found" for non-NIN failures; only treat as terminal NIN failure
  // when the message does not indicate funding / pool issues.
  if ((errCode === 'not_found' || errCode === 'invalid') && !isBalanceOrPoolExhaustedMessage(errMsg)) {
    return {
      outcome: 'failed',
      error_code: errCode,
      error_message: errMsg,
    };
  }

  return unavailable(
    errCode || 'provider_unavailable',
    errMsg,
    retryAfterSeconds
  );
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

async function verifyNin(normalizedNin, { http = axios, provider, force_fresh } = {}) {
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

  // SpeedySMS supports two per-request overrides on top of the NIN:
  //   provider:   'mock' switches to their free test pool (10 sample NINs,
  //               00000000001..00000000010). Any other value falls back to
  //               the gateway's default (Mono).
  //   force_fresh: when true, bypasses SpeedySMS's own cache and re-charges
  //               full price. Useful for debugging stale verified rows.
  // We pass these through verbatim — SpeedySMS validates them.
  const upstreamBody = { nin: normalizedNin };
  if (provider) upstreamBody.provider = String(provider);
  if (force_fresh) upstreamBody.force_fresh = true;

  let response;
  try {
    response = await http.post(
      `${baseUrl}/identity/nin`,
      upstreamBody,
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
  // - Success:  { success: true,  message: 'Lookup successful',
  //                data: {                              // <- IdentityLookupResult
  //                  status: 'success', lookup_id, nin_last_4,
  //                  data: { first_name, ... },        // <- NormalizedData (profile)
  //                  photo_url, signature_url, ...
  //                } }
  // - Same HTTP 200 can return success:true with data.status:'failed' and data.error
  //   (e.g. insufficient wallet — must NOT be treated as verified).
  // - Refusal:  { success: false, code, message }  (identity_balance_exhausted,
  //             unauthenticated, forbidden, rate_limited, not_found, invalid, ...)
  // The contract doc still describes the older {status: 'success'|'not_found'|...}
  // top-level shape — keep that branch below for back-compat with mock fixtures
  // and any gateway that still uses it.
  if (body && body.success === true && body.data && typeof body.data === 'object') {
    const inner = body.data;
    const innerStatus = String(inner.status || '').toLowerCase();
    if (innerStatus === 'failed' || innerStatus === 'invalid' || innerStatus === 'not_found') {
      return resolveNestedDataFailure(inner, body, retryAfterSeconds);
    }
    if (innerStatus && innerStatus !== 'success') {
      return unavailable(
        innerStatus,
        body.message || `SpeedySMS returned status ${inner.status}`,
        retryAfterSeconds
      );
    }
    if (innerStatus === 'success' || inner.lookup_id) {
      return {
        outcome: 'verified',
        provider_reference: inner.lookup_id || body.lookup_id || null,
        profile: mapProfile(inner),
      };
    }
    return unavailable(
      'provider_unavailable',
      body.message || 'Incomplete NIN response from provider',
      retryAfterSeconds
    );
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
