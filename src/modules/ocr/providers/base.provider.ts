/**
 * BaseProvider — shape implemented by all OCR extraction providers.
 */

export interface ExtractionInput {
  buffer: Buffer;
  mimeType: string;
  filename?: string;
}

export interface ExtractionResult {
  text: string;
  pages: number;
  providerPayload?: Record<string, any>;
  providerConfidence: number; // 0..100
  providerName?: string;
}

export class ProviderUnavailableError extends Error {
  code: string;
  provider: string;
  reason: string;

  constructor(provider: string, reason: string) {
    super(`Provider unavailable: ${provider} (${reason})`);
    this.code = 'OCR_PROVIDER_UNAVAILABLE';
    this.provider = provider;
    this.reason = reason;
  }
}

export class ProviderLowConfidenceError extends Error {
  code: string;
  provider: string;
  confidence: number;

  constructor(provider: string, confidence: number) {
    super(`Provider returned low confidence: ${provider} (${confidence})`);
    this.code = 'OCR_LOW_CONFIDENCE';
    this.provider = provider;
    this.confidence = confidence;
  }
}

export abstract class BaseProvider {
  abstract get name(): string;

  abstract extractText(input: ExtractionInput): Promise<ExtractionResult>;

  supportsMime(mimeType: string): boolean {
    return Boolean(mimeType);
  }
}
