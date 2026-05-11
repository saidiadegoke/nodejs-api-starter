const { BaseProvider, ProviderUnavailableError } = require('./base.provider');
const { rasterizePdf } = require('../pipelines/pdf-rasterizer');

const SUPPORTED_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff'
]);

let tesseractPromise;
async function getTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = (async () => {
      try {
        // eslint-disable-next-line global-require, import/no-unresolved
        return require('tesseract.js');
      } catch (err) {
        throw new ProviderUnavailableError('tesseract', 'tesseract.js not installed');
      }
    })();
  }
  return tesseractPromise;
}

let sharpPromise;
async function getSharp() {
  if (!sharpPromise) {
    sharpPromise = (async () => {
      try {
        // eslint-disable-next-line global-require, import/no-unresolved
        return require('sharp');
      } catch (err) {
        // sharp is optional — without it we just skip preprocessing
        return null;
      }
    })();
  }
  return sharpPromise;
}

async function preprocess(buffer) {
  const sharp = await getSharp();
  if (!sharp) return buffer;
  try {
    return await sharp(buffer)
      .grayscale()
      .normalize()
      .toFormat('png')
      .toBuffer();
  } catch {
    return buffer;
  }
}

class TesseractProvider extends BaseProvider {
  get name() {
    return 'tesseract';
  }

  supportsMime(mimeType) {
    return SUPPORTED_MIMES.has(mimeType);
  }

  async extractText({ buffer, mimeType }) {
    const langs = process.env.OCR_TESSERACT_LANGS || 'eng';
    let imageBuffers;
    let pageCount;

    if (mimeType === 'application/pdf') {
      const rast = await rasterizePdf(buffer);
      imageBuffers = rast.pages;
      pageCount = rast.pageCount;
    } else {
      imageBuffers = [buffer];
      pageCount = 1;
    }

    const Tesseract = await getTesseract();
    const texts = [];
    let confidences = [];

    for (const imgBuf of imageBuffers) {
      const cleaned = await preprocess(imgBuf);
      const { data } = await Tesseract.recognize(cleaned, langs, {
        // suppress noisy logs
        logger: () => {}
      });
      texts.push((data.text || '').trim());
      if (typeof data.confidence === 'number') {
        confidences.push(data.confidence);
      }
    }

    const text = texts.join('\n\n').trim();
    const providerConfidence = confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    return {
      text,
      pages: pageCount,
      providerPayload: { perPageConfidence: confidences },
      providerConfidence
    };
  }
}

module.exports = TesseractProvider;
