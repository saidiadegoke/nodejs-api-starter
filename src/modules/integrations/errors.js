/**
 * Normalized errors for external Attendance / CRMS providers.
 * Controllers map `err.status` (or `err.statusCode`) into HTTP responses.
 */

function providerError(status, message, errorCode, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  err.details = { error_code: errorCode, ...extra };
  return err;
}

function notConfigured(serviceName) {
  return providerError(
    503,
    `${serviceName} provider is not configured`,
    'provider_not_configured',
    { service: serviceName }
  );
}

function unavailable(serviceName, message) {
  return providerError(
    503,
    message || `${serviceName} is temporarily unavailable`,
    'provider_unavailable',
    { service: serviceName }
  );
}

function normalizeUpstreamError(serviceName, err) {
  if (err && (err.status || err.statusCode) && err.details?.error_code) {
    return err;
  }
  if (err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT') {
    return unavailable(serviceName, `${serviceName} request timed out`);
  }
  if (err?.response) {
    const status = err.response.status >= 500 ? 503 : err.response.status;
    return providerError(
      status === 404 ? 404 : status >= 400 && status < 500 ? status : 503,
      err.response.data?.message || `${serviceName} request failed`,
      'provider_upstream_error',
      { service: serviceName }
    );
  }
  return unavailable(serviceName, err?.message || `${serviceName} request failed`);
}

module.exports = {
  providerError,
  notConfigured,
  unavailable,
  normalizeUpstreamError,
};
