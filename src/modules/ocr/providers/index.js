const PdfTextProvider = require('./pdf-text.provider');
const TesseractProvider = require('./tesseract.provider');
const OcrSpaceProvider = require('./ocr-space.provider');
const MockProvider = require('./mock.provider');
const { ProviderUnavailableError } = require('./base.provider');

const REGISTRY = {
  pdf_text: PdfTextProvider,
  tesseract: TesseractProvider,
  ocr_space: OcrSpaceProvider,
  mock: MockProvider
};

const SINGLETONS = new Map();

function resolveProvider(name) {
  const Cls = REGISTRY[name];
  if (!Cls) {
    throw new ProviderUnavailableError(name, 'unknown provider name');
  }

  if (name === 'mock' && process.env.NODE_ENV !== 'test') {
    throw new ProviderUnavailableError(
      'mock',
      'mock provider is only available in NODE_ENV=test'
    );
  }

  if (!SINGLETONS.has(name)) {
    SINGLETONS.set(name, new Cls());
  }
  return SINGLETONS.get(name);
}

function defaultChain() {
  const raw = process.env.OCR_DEFAULT_CHAIN || 'pdf_text,tesseract';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function fallbackProvider() {
  const name = process.env.OCR_FALLBACK_PROVIDER;
  if (!name) return null;
  if (name === 'ocr_space' && !process.env.OCR_SPACE_API_KEY) return null;
  return name;
}

module.exports = {
  REGISTRY,
  resolveProvider,
  defaultChain,
  fallbackProvider
};
