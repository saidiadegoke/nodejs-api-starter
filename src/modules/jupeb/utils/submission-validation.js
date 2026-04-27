/**
 * @param {string | null | undefined} fileType from files.file_type
 * @param {string[]} allowedMimeTypes from requirement.allowed_mime_types JSON
 */
function mimeAllowed(fileType, allowedMimeTypes) {
  if (!Array.isArray(allowedMimeTypes) || allowedMimeTypes.length === 0) return true;
  const ft = String(fileType || '').toLowerCase();
  return allowedMimeTypes.some((a) => {
    const m = String(a).toLowerCase();
    return ft === m || ft.includes(m) || m.includes(ft);
  });
}

/**
 * @param {number | null} fileSizeBytes
 * @param {number} maxFileSizeMb
 */
function sizeAllowed(fileSizeBytes, maxFileSizeMb) {
  if (fileSizeBytes == null) return true;
  const maxBytes = Number(maxFileSizeMb) * 1024 * 1024;
  return Number(fileSizeBytes) <= maxBytes;
}

module.exports = { mimeAllowed, sizeAllowed };
