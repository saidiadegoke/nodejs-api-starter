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
    const upstreamStatus = err.response.status;
    const body = err.response.data;
    const status =
      upstreamStatus >= 500 ? 503 : upstreamStatus >= 400 ? upstreamStatus : 503;
    const message =
      (body && (body.message || body.error || body.error_message)) ||
      `${serviceName} request failed`;

    // Prefer upstream details/body so clients see the real provider payload.
    const upstreamDetails =
      body && typeof body === 'object'
        ? body.details && typeof body.details === 'object'
          ? body.details
          : body
        : undefined;

    return providerError(status, message, 'provider_upstream_error', {
      service: serviceName,
      upstream_status: upstreamStatus,
      ...(upstreamDetails && typeof upstreamDetails === 'object' ? upstreamDetails : {}),
      upstream: body,
    });
  }
  return unavailable(serviceName, err?.message || `${serviceName} request failed`);
}

module.exports = {
  providerError,
  notConfigured,
  unavailable,
  normalizeUpstreamError,
};
