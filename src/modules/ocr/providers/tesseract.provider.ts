import { BaseProvider, ExtractionInput, ExtractionResult, ProviderUnavailableError } from './base.provider';
import { rasterizePdf } from '../pipelines/pdf-rasterizer';

const SUPPORTED_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff',
]);

let tesseractPromise: Promise<any> | null = null;
async function getTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = (async () => {
      try {
        return require('tesseract.js');
      } catch {
        throw new ProviderUnavailableError('tesseract', 'tesseract.js not installed');
      }
    })();
  }
  return tesseractPromise;
}

let sharpPromise: Promise<any> | null = null;
async function getSharp() {
  if (!sharpPromise) {
    sharpPromise = (async () => {
      try {
        return require('sharp');
      } catch {
        return null;
      }
    })();
  }
  return sharpPromise;
}

async function preprocess(buffer: Buffer) {
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

export class TesseractProvider extends BaseProvider {
  get name(): string {
    return 'tesseract';
  }

  supportsMime(mimeType: string): boolean {
    return SUPPORTED_MIMES.has(mimeType);
  }

  async extractText({ buffer, mimeType }: ExtractionInput): Promise<ExtractionResult> {
    const langs = process.env.OCR_TESSERACT_LANGS || 'eng';
    let imageBuffers: Buffer[];
    let pageCount: number;

    if (mimeType === 'application/pdf') {
      const rast = await rasterizePdf(buffer);
      imageBuffers = rast.pages;
      pageCount = rast.pageCount;
    } else {
      imageBuffers = [buffer];
      pageCount = 1;
    }

    const Tesseract = await getTesseract();
    const texts: string[] = [];
    const confidences: number[] = [];

    for (const imgBuf of imageBuffers) {
      const cleaned = await preprocess(imgBuf);
      const { data } = await Tesseract.recognize(cleaned, langs, {
        logger: () => {},
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
      providerConfidence,
    };
  }
}

export default TesseractProvider;
