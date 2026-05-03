const ninVerificationModel = require('../models/nin-verification.model');
const ninAdapter = require('../services/nin-adapter.service');
const { emitNinResolved } = require('../services/nin-events.service');

const BACKOFF_LADDER_SECONDS = [60, 300, 1800, 7200, 21600, 43200, 86400];
const TWENTY_FOUR_HOURS_MS = 24 * 3600 * 1000;

function nextRetryAfter(attemptCount, nowMs = Date.now()) {
  const idx = Math.min(Math.max(attemptCount - 1, 0), BACKOFF_LADDER_SECONDS.length - 1);
  const seconds = BACKOFF_LADDER_SECONDS[idx];
  const cappedMs = Math.min(seconds * 1000, TWENTY_FOUR_HOURS_MS);
  return new Date(nowMs + cappedMs).toISOString();
}

function maxAttempts() {
  const n = Number(process.env.JUPEB_NIN_MAX_ATTEMPTS);
  if (!Number.isFinite(n) || n <= 0) return 12;
  return n;
}

async function resolveOne(row) {
  const adapterResult = await ninAdapter.verifyNin(row.nin_last4.padStart(11, '0'));
  if (adapterResult.outcome === 'verified') {
    await ninVerificationModel.markVerified(row.id, {
      response_payload: adapterResult.profile || {},
      provider_reference: adapterResult.provider_reference || row.provider_reference,
    });
    await emitNinResolved(row.id, 'verified');
    return 'verified';
  }
  if (adapterResult.outcome === 'failed') {
    await ninVerificationModel.markFailed(row.id, {
      error_payload: {
        code: adapterResult.error_code || 'verification_failed',
        message: adapterResult.error_message || 'Verification failed',
      },
      last_error_code: adapterResult.error_code || 'verification_failed',
    });
    await emitNinResolved(row.id, 'failed');
    return 'failed';
  }
  if (row.attempt_count >= maxAttempts()) {
    await ninVerificationModel.markFailed(row.id, {
      error_payload: {
        code: 'provider_unavailable_giveup',
        message: 'Provider remained unavailable; gave up after max attempts',
      },
      last_error_code: 'provider_unavailable_giveup',
    });
    await emitNinResolved(row.id, 'failed');
    return 'gaveup';
  }
  await ninVerificationModel.incrementAttempt(row.id, {
    retry_after: nextRetryAfter(row.attempt_count + 1),
    last_error_code: adapterResult.error_code || 'provider_unavailable',
  });
  return 'pending';
}

async function resolvePendingOnce({ now, limit } = {}) {
  const due = await ninVerificationModel.findDuePending({ now: now || new Date(), limit: limit || 50 });
  let verified = 0;
  let failed = 0;
  let gaveup = 0;
  let stillPending = 0;
  for (const row of due) {
    const outcome = await resolveOne(row);
    if (outcome === 'verified') verified += 1;
    else if (outcome === 'failed') failed += 1;
    else if (outcome === 'gaveup') gaveup += 1;
    else stillPending += 1;
  }
  return { verified, failed, gaveup, stillPending, scanned: due.length };
}

let _interval = null;
function start() {
  if (_interval) return _interval;
  const ms = Number(process.env.JUPEB_NIN_RESOLVER_INTERVAL_MS) || 60_000;
  _interval = setInterval(() => {
    resolvePendingOnce().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[nin-resolver] tick failed', err);
    });
  }, ms);
  if (typeof _interval.unref === 'function') _interval.unref();
  return _interval;
}

function stop() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

module.exports = {
  resolvePendingOnce,
  nextRetryAfter,
  start,
  stop,
};
