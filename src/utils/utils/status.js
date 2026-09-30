/**
 * Normalizes entity status values across the API.
 * Accepts:
 *   - 'inactive', 'deactivated', 'deactivate', false -> 'inactive'
 *   - 'active', 'activated', 'activate', true -> 'active'
 *
 * @param {string|boolean|null|undefined} val
 * @returns {'active'|'inactive'|null|undefined}
 *   - 'active' or 'inactive' if recognized
 *   - null if an unrecognized/invalid value was provided
 *   - undefined if val is undefined or null
 */
function normalizeStatus(val) {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'boolean') {
    return val ? 'active' : 'inactive';
  }
  const s = String(val).trim().toLowerCase();
  if (s === 'inactive' || s === 'deactivated' || s === 'deactivate') {
    return 'inactive';
  }
  if (s === 'active' || s === 'activated' || s === 'activate') {
    return 'active';
  }
  return null;
}

module.exports = {
  normalizeStatus,
};
