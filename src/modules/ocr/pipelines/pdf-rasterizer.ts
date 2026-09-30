/**
 * Rasterize a PDF buffer to a list of PNG image buffers using pdfjs-dist.
 */

const DEFAULT_DPI = 200;

let pdfjsLibPromise: Promise<any> | null = null;
async function getPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      try {
        return require('pdfjs-dist/legacy/build/pdf.js');
      } catch (err: any) {
        const e: any = new Error(
          'pdfjs-dist is not installed. Run `npm install pdfjs-dist` to enable PDF rasterization.',
        );
        e.code = 'OCR_RASTERIZER_UNAVAILABLE';
        e.cause = err;
        throw e;
      }
    })();
  }
  return pdfjsLibPromise;
}

let canvasFactoryPromise: Promise<any> | null = null;
async function getCanvasFactory() {
  if (!canvasFactoryPromise) {
    canvasFactoryPromise = (async () => {
      try {
        const { createCanvas } = require('canvas');
        return {
          create(width: number, height: number) {
            const canvas = createCanvas(width, height);
            return { canvas, context: canvas.getContext('2d') };
          },
          reset(canvasAndContext: any, width: number, height: number) {
            canvasAndContext.canvas.width = width;
            canvasAndContext.canvas.height = height;
          },
          destroy(canvasAndContext: any) {
            canvasAndContext.canvas.width = 0;
            canvasAndContext.canvas.height = 0;
          },
        };
      } catch (err: any) {
        const e: any = new Error(
          'node-canvas is not installed. PDF rasterization requires `npm install canvas`.',
        );
        e.code = 'OCR_RASTERIZER_UNAVAILABLE';
        e.cause = err;
        throw e;
      }
    })();
  }
  return canvasFactoryPromise;
}

export async function rasterizePdf(buffer: Buffer, { dpi = DEFAULT_DPI, maxPages = 10 }: { dpi?: number; maxPages?: number } = {}) {
  const pdfjsLib = await getPdfjs();
  const canvasFactory = await getCanvasFactory();

  const data = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: false,
  });
  const doc = await loadingTask.promise;

  const pageCount = Math.min(doc.numPages, maxPages);
  const scale = dpi / 72;
  const pages: Buffer[] = [];

  for (let i = 1; i <= pageCount; i += 1) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvasAndContext = canvasFactory.create(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    await page.render({
      canvasContext: canvasAndContext.context,
      viewport,
      canvasFactory,
    }).promise;
    const pngBuffer = canvasAndContext.canvas.toBuffer('image/png');
    pages.push(pngBuffer);
    canvasFactory.destroy(canvasAndContext);
    page.cleanup();
  }

  await doc.cleanup();
  await doc.destroy();

  return { pages, pageCount };
}
