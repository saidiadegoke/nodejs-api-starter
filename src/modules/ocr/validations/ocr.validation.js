const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff'
]);

const ALLOWED_EXAM_TYPES = new Set(['auto', 'waec', 'neco', 'nabteb', 'gce', 'generic']);

function maxFileSizeBytes() {
  const mb = parseInt(process.env.OCR_MAX_FILE_SIZE_MB || '15', 10);
  return mb * 1024 * 1024;
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function ocrError(code, message, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function assertMimeAllowed(mimeType) {
  if (!ALLOWED_MIMES.has(mimeType)) {
    throw ocrError('OCR_UNSUPPORTED_MIME', `Unsupported MIME: ${mimeType}`, 415);
  }
}

function assertSizeAllowed(size) {
  if (size > maxFileSizeBytes()) {
    throw ocrError(
      'OCR_FILE_TOO_LARGE',
      `File exceeds ${process.env.OCR_MAX_FILE_SIZE_MB || 15}MB limit`,
      413
    );
  }
}

function assertExamType(examType) {
  if (examType && !ALLOWED_EXAM_TYPES.has(examType)) {
    throw ocrError('OCR_INVALID_EXAM_TYPE', `Invalid exam_type: ${examType}`, 400);
  }
}

module.exports = {
  ALLOWED_MIMES: Array.from(ALLOWED_MIMES),
  ALLOWED_EXAM_TYPES: Array.from(ALLOWED_EXAM_TYPES),
  maxFileSizeBytes,
  isUuid,
  ocrError,
  assertMimeAllowed,
  assertSizeAllowed,
  assertExamType
};
