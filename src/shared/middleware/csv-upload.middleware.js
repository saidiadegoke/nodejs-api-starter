/**
 * Unified CSV ingestion middleware.
 *
 * Bulk-upload endpoints (POST /catalog/{universities,subjects,subject-combinations}/bulk)
 * historically only accepted a raw text/csv body via `express.text(...)`.
 * Frontend file pickers send multipart/form-data with an attached file
 * instead, which slipped through that middleware untouched and ended up
 * looking like an empty payload to the controller.
 *
 * This middleware accepts ALL three common shapes and writes the CSV
 * string to `req.csvText`:
 *   • multipart/form-data with a file field (`file` or `csv`)
 *   • text/csv (or application/csv) raw body
 *   • application/json `{ "csv": "<csv text>" }`
 *
 * Field name on the multipart upload is flexible — `file` is the
 * default, but `csv` is also accepted so the frontend can call it
 * whatever feels natural. Memory storage; 10MB cap.
 */
const multer = require('multer');
const XLSX = require('xlsx');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Catch any multipart field name (file | csv | upload | …). `.any()`
// returns an array of files which we then sniff.
const multipartAny = upload.any();

function csvUpload(req, res, next) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();

  // 1) multipart — multer fills `req.files`, we pick the first one that
  //    looks like CSV (by mimetype or extension).
  if (contentType.startsWith('multipart/form-data')) {
    return multipartAny(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'multipart upload failed',
        });
      }
      const files = req.files || [];
      const csvFile = files.find((f) => {
        if (!f) return false;
        const mime = String(f.mimetype || '').toLowerCase();
        const name = String(f.originalname || '').toLowerCase();
        return mime === 'text/csv'
          || mime === 'application/csv'
          || mime === 'application/vnd.ms-excel'
          || name.endsWith('.csv');
      }) || files[0]; // fall back to the first file regardless of type

      if (csvFile && csvFile.buffer) {
        const name = String(csvFile.originalname || '').toLowerCase();
        const mime = String(csvFile.mimetype || '').toLowerCase();
        const isExcel =
          name.endsWith('.xlsx') ||
          name.endsWith('.xls') ||
          mime.includes('spreadsheet') ||
          (mime.includes('ms-excel') && !name.endsWith('.csv')) ||
          (csvFile.buffer.length >= 2 && csvFile.buffer[0] === 0x50 && csvFile.buffer[1] === 0x4b);
        if (isExcel) {
          try {
            const wb = XLSX.read(csvFile.buffer, { type: 'buffer' });
            const firstSheet = wb.SheetNames[0];
            req.csvText = firstSheet ? XLSX.utils.sheet_to_csv(wb.Sheets[firstSheet]) : '';
          } catch {
            req.csvText = csvFile.buffer.toString('utf8');
          }
        } else {
          req.csvText = csvFile.buffer.toString('utf8');
        }
      } else if (req.body && typeof req.body.csv === 'string') {
        // Some clients send the CSV as a form text field rather than a file.
        req.csvText = req.body.csv;
      } else {
        req.csvText = '';
      }
      return next();
    });
  }

  // 2) text/csv — express.text() has already parsed it onto req.body.
  if (contentType.startsWith('text/csv') || contentType.startsWith('application/csv')) {
    req.csvText = typeof req.body === 'string' ? req.body : '';
    return next();
  }

  // 3) application/json — { csv: "<text>" } shape.
  if (contentType.startsWith('application/json')) {
    req.csvText = (req.body && typeof req.body.csv === 'string') ? req.body.csv : '';
    return next();
  }

  // 4) Fallback — accept whatever's on req.body (string or {csv}).
  if (typeof req.body === 'string') {
    req.csvText = req.body;
  } else if (req.body && typeof req.body.csv === 'string') {
    req.csvText = req.body.csv;
  } else {
    req.csvText = '';
  }
  return next();
}

module.exports = { csvUpload };
