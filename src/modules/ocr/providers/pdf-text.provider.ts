import { BaseProvider, ExtractionInput, ExtractionResult, ProviderUnavailableError } from './base.provider';

let pdfParsePromise: Promise<any> | null = null;
async function getPdfParse() {
  if (!pdfParsePromise) {
    pdfParsePromise = (async () => {
      try {
        return require('pdf-parse');
      } catch {
        throw new ProviderUnavailableError('pdf_text', 'pdf-parse not installed');
      }
    })();
  }
  return pdfParsePromise;
}

export class PdfTextProvider extends BaseProvider {
  get name(): string {
    return 'pdf_text';
  }

  supportsMime(mimeType: string): boolean {
    return mimeType === 'application/pdf';
  }

  async extractText({ buffer }: ExtractionInput): Promise<ExtractionResult> {
    const pdfParse = await getPdfParse();
    const data = await pdfParse(buffer);
    const text = (data.text || '').trim();
    const pages = data.numpages || 1;

    if (!text || text.length < 20) {
      return {
        text,
        pages,
        providerPayload: { info: data.info || {}, metadata: data.metadata || null },
        providerConfidence: 0,
      };
    }

    return {
      text,
      pages,
      providerPayload: { info: data.info || {}, metadata: data.metadata || null },
      providerConfidence: 98,
    };
  }
}

export default PdfTextProvider;
