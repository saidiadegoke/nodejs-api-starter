/**
 * Rasterize a PDF buffer to a list of PNG image buffers using pdfjs-dist.
 *
 * Lazy-loaded so test suites that never touch raster paths don't pay the
 * pdfjs-dist startup cost (and so the module loads cleanly even if the
 * dependency isn't installed yet — we throw a clear error instead).
 */

const DEFAULT_DPI = 200;

let pdfjsLibPromise;
async function getPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      try {
        // pdfjs-dist exposes its legacy build for Node usage
        // eslint-disable-next-line global-require, import/no-unresolved
        return require('pdfjs-dist/legacy/build/pdf.js');
      } catch (err) {
        const e = new Error(
          'pdfjs-dist is not installed. Run `npm install pdfjs-dist` to enable PDF rasterization.'
        );
        e.code = 'OCR_RASTERIZER_UNAVAILABLE';
        e.cause = err;
        throw e;
      }
    })();
  }
  return pdfjsLibPromise;
}

let canvasFactoryPromise;
async function getCanvasFactory() {
  if (!canvasFactoryPromise) {
    canvasFactoryPromise = (async () => {
      try {
        // eslint-disable-next-line global-require, import/no-unresolved
        const { createCanvas } = require('canvas');
        return {
          create(width, height) {
            const canvas = createCanvas(width, height);
            return { canvas, context: canvas.getContext('2d') };
          },
          reset(canvasAndContext, width, height) {
            canvasAndContext.canvas.width = width;
            canvasAndContext.canvas.height = height;
          },
          destroy(canvasAndContext) {
            canvasAndContext.canvas.width = 0;
            canvasAndContext.canvas.height = 0;
          }
        };
      } catch (err) {
        const e = new Error(
          'node-canvas is not installed. PDF rasterization requires `npm install canvas`.'
        );
        e.code = 'OCR_RASTERIZER_UNAVAILABLE';
        e.cause = err;
        throw e;
      }
    })();
  }
  return canvasFactoryPromise;
}

async function rasterizePdf(buffer, { dpi = DEFAULT_DPI, maxPages = 10 } = {}) {
  const pdfjsLib = await getPdfjs();
  const canvasFactory = await getCanvasFactory();

  const data = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: false
  });
  const doc = await loadingTask.promise;

  const pageCount = Math.min(doc.numPages, maxPages);
  const scale = dpi / 72; // 72dpi is PDF native
  const pages = [];

  for (let i = 1; i <= pageCount; i += 1) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvasAndContext = canvasFactory.create(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height)
    );
    await page.render({
      canvasContext: canvasAndContext.context,
      viewport,
      canvasFactory
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

module.exports = { rasterizePdf };
