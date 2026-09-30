import { PdfTextProvider } from './pdf-text.provider';
import { TesseractProvider } from './tesseract.provider';
import { OcrSpaceProvider } from './ocr-space.provider';
import { MockProvider } from './mock.provider';
import { BaseProvider, ProviderUnavailableError, ProviderLowConfidenceError } from './base.provider';

export const REGISTRY: Record<string, new () => BaseProvider> = {
  pdf_text: PdfTextProvider,
  tesseract: TesseractProvider,
  ocr_space: OcrSpaceProvider,
  mock: MockProvider,
};

const SINGLETONS = new Map<string, BaseProvider>();

export function resolveProvider(name: string): BaseProvider {
  const Cls = REGISTRY[name];
  if (!Cls) {
    throw new ProviderUnavailableError(name, 'unknown provider name');
  }

  if (name === 'mock' && process.env.NODE_ENV !== 'test') {
    throw new ProviderUnavailableError(
      'mock',
      'mock provider is only available in NODE_ENV=test',
    );
  }

  if (!SINGLETONS.has(name)) {
    SINGLETONS.set(name, new Cls());
  }
  return SINGLETONS.get(name)!;
}

export function defaultChain(): string[] {
  const raw = process.env.OCR_DEFAULT_CHAIN || 'pdf_text,tesseract';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function fallbackProvider(): string | null {
  const name = process.env.OCR_FALLBACK_PROVIDER;
  if (!name) return null;
  if (name === 'ocr_space' && !process.env.OCR_SPACE_API_KEY) return null;
  return name;
}

export {
  BaseProvider,
  PdfTextProvider,
  TesseractProvider,
  OcrSpaceProvider,
  MockProvider,
  ProviderUnavailableError,
  ProviderLowConfidenceError,
};
