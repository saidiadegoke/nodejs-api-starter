const { BaseProvider, ProviderUnavailableError } = require('./base.provider');

let pdfParsePromise;
async function getPdfParse() {
  if (!pdfParsePromise) {
    pdfParsePromise = (async () => {
      try {
        // eslint-disable-next-line global-require, import/no-unresolved
        return require('pdf-parse');
      } catch (err) {
        throw new ProviderUnavailableError('pdf_text', 'pdf-parse not installed');
      }
    })();
  }
  return pdfParsePromise;
}

class PdfTextProvider extends BaseProvider {
  get name() {
    return 'pdf_text';
  }

  supportsMime(mimeType) {
    return mimeType === 'application/pdf';
  }

  async extractText({ buffer }) {
    const pdfParse = await getPdfParse();
    const data = await pdfParse(buffer);
    const text = (data.text || '').trim();
    const pages = data.numpages || 1;

    if (!text || text.length < 20) {
      // Probably a scanned PDF without a text layer; signal low confidence
      // so the chain advances to Tesseract.
      return {
        text,
        pages,
        providerPayload: { info: data.info || {}, metadata: data.metadata || null },
        providerConfidence: 0
      };
    }

    return {
      text,
      pages,
      providerPayload: { info: data.info || {}, metadata: data.metadata || null },
      providerConfidence: 98
    };
  }
}

module.exports = PdfTextProvider;
