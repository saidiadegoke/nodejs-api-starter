/**
 * Unified spreadsheet ingestion middleware.
 *
 * Accepts multipart/form-data (.xlsx, .xls, .csv), raw text/csv,
 * or JSON payloads, and populates:
 *   - req.uploadedFileBuffer (Buffer)
 *   - req.uploadedFileExt ('xlsx' | 'xls' | 'csv')
 *   - req.uploadedFileName (string)
 */
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const multipartAny = upload.any();

function detectExtension(originalname, mimetype) {
  const name = String(originalname || '').toLowerCase();
  const mime = String(mimetype || '').toLowerCase();

  if (name.endsWith('.xlsx') || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return 'xlsx';
  }
  if (name.endsWith('.xls') || mime === 'application/vnd.ms-excel') {
    return 'xls';
  }
  if (name.endsWith('.csv') || mime === 'text/csv' || mime === 'application/csv') {
    return 'csv';
  }
  // Default to csv if unknown text format, or null
  return null;
}

function spreadsheetUpload(req, res, next) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();

  // 1) multipart/form-data
  if (contentType.startsWith('multipart/form-data')) {
    return multipartAny(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'Multipart upload failed',
        });
      }
      const files = req.files || [];
      const file = files.find((f) => {
        if (!f) return false;
        const ext = detectExtension(f.originalname, f.mimetype);
        return ext !== null;
      }) || files[0];

      if (file && file.buffer) {
        req.uploadedFileBuffer = file.buffer;
        req.uploadedFileName = file.originalname || 'upload';
        req.uploadedFileExt = detectExtension(file.originalname, file.mimetype) || 'csv';
      } else if (req.body && typeof req.body.csv === 'string') {
        req.uploadedFileBuffer = Buffer.from(req.body.csv, 'utf8');
        req.uploadedFileName = 'upload.csv';
        req.uploadedFileExt = 'csv';
      } else {
        req.uploadedFileBuffer = null;
        req.uploadedFileExt = null;
      }
      return next();
    });
  }

  // 2) text/csv or application/csv raw body
  if (contentType.startsWith('text/csv') || contentType.startsWith('application/csv')) {
    const text = typeof req.body === 'string' ? req.body : '';
    req.uploadedFileBuffer = Buffer.from(text, 'utf8');
    req.uploadedFileName = 'upload.csv';
    req.uploadedFileExt = 'csv';
    return next();
  }

  // 3) application/json — { csv: "<text>" }
  if (contentType.startsWith('application/json')) {
    if (req.body && typeof req.body.csv === 'string') {
      req.uploadedFileBuffer = Buffer.from(req.body.csv, 'utf8');
      req.uploadedFileName = 'upload.csv';
      req.uploadedFileExt = 'csv';
    } else {
      req.uploadedFileBuffer = null;
      req.uploadedFileExt = null;
    }
    return next();
  }

  // 4) Fallback string body
  if (typeof req.body === 'string') {
    req.uploadedFileBuffer = Buffer.from(req.body, 'utf8');
    req.uploadedFileName = 'upload.csv';
    req.uploadedFileExt = 'csv';
  } else {
    req.uploadedFileBuffer = null;
    req.uploadedFileExt = null;
  }
  return next();
}

module.exports = { spreadsheetUpload };
