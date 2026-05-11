/**
 * BaseProvider — every OCR provider implements this shape.
 *
 *   extractText({ buffer, mimeType, filename }) ->
 *     {
 *       text: string,
 *       pages: number,
 *       providerPayload: object,
 *       providerConfidence: number,   // 0..100
 *       providerName: string
 *     }
 *
 * Throwing ProviderUnavailableError tells the chain to skip this provider
 * and try the next one. Throwing any other Error halts the chain.
 */

class ProviderUnavailableError extends Error {
  constructor(provider, reason) {
    super(`Provider unavailable: ${provider} (${reason})`);
    this.code = 'OCR_PROVIDER_UNAVAILABLE';
    this.provider = provider;
    this.reason = reason;
  }
}

class ProviderLowConfidenceError extends Error {
  constructor(provider, confidence) {
    super(`Provider returned low confidence: ${provider} (${confidence})`);
    this.code = 'OCR_LOW_CONFIDENCE';
    this.provider = provider;
    this.confidence = confidence;
  }
}

class BaseProvider {
  get name() {
    throw new Error('BaseProvider.name must be overridden');
  }

  // eslint-disable-next-line no-unused-vars
  async extractText({ buffer, mimeType, filename }) {
    throw new Error('BaseProvider.extractText must be overridden');
  }

  supportsMime(mimeType) {
    return Boolean(mimeType);
  }
}

module.exports = {
  BaseProvider,
  ProviderUnavailableError,
  ProviderLowConfidenceError
};
