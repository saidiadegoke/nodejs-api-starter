const {
  resolveProvider,
  defaultChain,
  fallbackProvider
} = require('../providers');
const {
  ProviderUnavailableError,
  ProviderLowConfidenceError
} = require('../providers/base.provider');

const CONFIDENCE_FLOOR = parseFloat(process.env.OCR_CONFIDENCE_FLOOR || '60');

/**
 * Run the configured provider chain against a document.
 *
 * Strategy:
 *   1. Try each provider in the default chain in order.
 *   2. If a provider throws ProviderUnavailableError, skip it.
 *   3. If a provider returns confidence below the floor and there is a
 *      next provider, skip it (treat as low confidence).
 *   4. After the default chain, if a fallback provider is configured and
 *      we still don't have a confident result, try it.
 *   5. If nothing produced text, throw OCR_UNREADABLE.
 *
 * Returns the best result we got (highest confidence among providers that
 * produced any text).
 */
async function runChain({ buffer, mimeType, filename, forcedProvider = null }) {
  const chain = forcedProvider ? [forcedProvider] : defaultChain();
  const fallback = forcedProvider ? null : fallbackProvider();

  let best = null;
  const attempts = [];

  for (const name of chain) {
    const outcome = await tryProvider(name, { buffer, mimeType, filename });
    attempts.push(outcome);
    if (!outcome.ok) continue;

    if (!best || outcome.result.providerConfidence > best.providerConfidence) {
      best = outcome.result;
    }
    if (outcome.result.providerConfidence >= CONFIDENCE_FLOOR) {
      return { result: best, attempts };
    }
  }

  if (fallback) {
    const outcome = await tryProvider(fallback, { buffer, mimeType, filename });
    attempts.push(outcome);
    if (outcome.ok) {
      if (!best || outcome.result.providerConfidence > best.providerConfidence) {
        best = outcome.result;
      }
    }
  }

  if (!best || !best.text || !best.text.trim()) {
    const err = new Error('OCR could not extract any usable text');
    err.code = 'OCR_UNREADABLE';
    err.attempts = attempts;
    throw err;
  }

  return { result: best, attempts };
}

async function tryProvider(name, input) {
  let provider;
  try {
    provider = resolveProvider(name);
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      return { ok: false, name, skipped: true, reason: err.reason };
    }
    throw err;
  }

  if (!provider.supportsMime(input.mimeType)) {
    return { ok: false, name, skipped: true, reason: 'mime not supported' };
  }

  try {
    const result = await provider.extractText(input);
    return {
      ok: true,
      name,
      result: { ...result, providerName: name }
    };
  } catch (err) {
    if (
      err instanceof ProviderUnavailableError ||
      err instanceof ProviderLowConfidenceError
    ) {
      return { ok: false, name, skipped: true, reason: err.message };
    }
    return { ok: false, name, skipped: false, error: err };
  }
}

module.exports = {
  runChain,
  CONFIDENCE_FLOOR
};
