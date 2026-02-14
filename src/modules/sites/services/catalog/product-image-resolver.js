/**
 * Resolve product images: accept array of URLs or site asset IDs (UUIDs).
 * Asset IDs are resolved to file URLs for the site's asset context; URLs are kept as-is.
 * Returns array of URL strings only (invalid IDs are skipped).
 */
const FileModel = require('../../../files/models/file.model');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function siteAssetsContext(siteId) {
  return `site_assets_${siteId}`;
}

function isUrl(str) {
  if (typeof str !== 'string' || !str.trim()) return false;
  const s = str.trim();
  return s.startsWith('http://') || s.startsWith('https://');
}

async function resolveImageRefs(siteId, images) {
  if (!Array.isArray(images) || images.length === 0) return [];
  const context = siteAssetsContext(siteId);
  const resolved = [];
  for (const ref of images) {
    const s = typeof ref === 'string' ? ref.trim() : ref?.url?.trim?.() || '';
    if (!s) continue;
    if (isUrl(s)) {
      resolved.push(s);
      continue;
    }
    if (UUID_REGEX.test(s)) {
      try {
        const file = await FileModel.findById(s);
        if (file && file.context === context && file.file_url) {
          resolved.push(file.file_url);
        }
      } catch {
        // skip invalid or missing file
      }
    }
  }
  return resolved;
}

module.exports = { resolveImageRefs };
