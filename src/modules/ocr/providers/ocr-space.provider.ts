import axios from 'axios';
import * as FormData from 'form-data';
import { BaseProvider, ExtractionInput, ExtractionResult, ProviderUnavailableError } from './base.provider';

const OCR_SPACE_URL = 'https://api.ocr.space/parse/image';
const SUPPORTED_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff',
  'image/gif',
  'image/bmp',
]);

export class OcrSpaceProvider extends BaseProvider {
  get name(): string {
    return 'ocr_space';
  }

  supportsMime(mimeType: string): boolean {
    return SUPPORTED_MIMES.has(mimeType);
  }

  async extractText({ buffer, mimeType, filename }: ExtractionInput): Promise<ExtractionResult> {
    const apiKey = process.env.OCR_SPACE_API_KEY;
    if (!apiKey) {
      throw new ProviderUnavailableError('ocr_space', 'OCR_SPACE_API_KEY not set');
    }

    const form = new FormData();
    form.append('file', buffer, {
      filename: filename || 'document',
      contentType: mimeType,
    });
    form.append('apikey', apiKey);
    form.append('OCREngine', process.env.OCR_SPACE_ENGINE || '2');
    form.append('isTable', 'true');
    form.append('scale', 'true');
    form.append('language', process.env.OCR_SPACE_LANGUAGE || 'eng');

    const timeoutMs = parseInt(process.env.OCR_PROVIDER_TIMEOUT_MS || '25000', 10);

    const response = await axios.post(OCR_SPACE_URL, form, {
      headers: form.getHeaders(),
      timeout: timeoutMs,
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024,
    });

    const body = response.data || {};
    if (body.IsErroredOnProcessing) {
      const msg = Array.isArray(body.ErrorMessage)
        ? body.ErrorMessage.join('; ')
        : String(body.ErrorMessage || 'unknown');
      const err: any = new Error(`ocr.space failure: ${msg}`);
      err.code = 'OCR_PROVIDER_FAILED';
      throw err;
    }

    const parsed = Array.isArray(body.ParsedResults) ? body.ParsedResults : [];
    const text = parsed.map((p: any) => (p.ParsedText || '').trim()).join('\n\n').trim();
    const pages = parsed.length || 1;

    const exitCode = parseInt(body.OCRExitCode, 10);
    let providerConfidence = 0;
    if (exitCode === 1) providerConfidence = 85;
    else if (exitCode === 2) providerConfidence = 65;

    return {
      text,
      pages,
      providerPayload: { exitCode, processingTimeMs: body.ProcessingTimeInMilliseconds },
      providerConfidence,
    };
  }
}

export default OcrSpaceProvider;
