/**
 * Geo lookups (countries → states → lgas).
 *
 * NIN payloads carry state/LGA as plain strings; this module resolves them
 * to system-wide ids so responses can return {id, name} pairs. All lookups
 * tolerate fuzzy input (case, hyphens, "State"/"LGA" suffixes).
 */

const pool = require('../../db/pool');

const NIGERIA_ISO2 = 'NG';

function _normalize(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/[\s\-_/]+/g, ' ')
    .replace(/\b(state|lga|local government( area)?)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

class GeoModel {
  static async findCountryByName(name) {
    if (!name) return null;
    const result = await pool.query(
      `SELECT id, name, iso_code_2 FROM countries
       WHERE name ILIKE $1 OR iso_code_2 ILIKE $1 OR iso_code_3 ILIKE $1
       LIMIT 1`,
      [String(name).trim()]
    );
    return result.rows[0] || null;
  }

  static async findStateByName(name, { countryId, countryIso = NIGERIA_ISO2 } = {}) {
    if (!name) return null;
    const normKey = _normalize(name).replace(/\s+/g, '');
    if (!normKey) return null;
    const params = [normKey];
    let where = `regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g') = $1`;
    if (countryId) {
      params.push(countryId);
      where += ` AND s.country_id = $${params.length}`;
    } else if (countryIso) {
      params.push(countryIso);
      where += ` AND s.country_id = (SELECT id FROM countries WHERE iso_code_2 = $${params.length})`;
    }
    const result = await pool.query(
      `SELECT s.id, s.name, s.code, s.country_id
       FROM states s
       WHERE ${where}
       LIMIT 1`,
      params
    );
    return result.rows[0] || null;
  }

  static async findLgaByName(name, { stateId } = {}) {
    if (!name || !stateId) return null;
    const norm = _normalize(name).replace(/\s+/g, '');
    if (!norm) return null;
    const result = await pool.query(
      `SELECT id, name, state_id, country_id
       FROM lgas
       WHERE state_id = $1
         AND regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = $2
       LIMIT 1`,
      [stateId, norm]
    );
    return result.rows[0] || null;
  }

  /**
   * Resolve a {country, state_of_origin, lga} bundle of NIN strings into
   * {country: {id,name}|null, state_of_origin: {id,name}|null, lga: {id,name}|null}.
   * Country defaults to Nigeria when unspecified.
   */
  static async resolveBundle({ country, stateOfOrigin, lga } = {}) {
    const countryRow =
      (country && (await GeoModel.findCountryByName(country))) ||
      (await GeoModel.findCountryByName(NIGERIA_ISO2));
    const stateRow = stateOfOrigin
      ? await GeoModel.findStateByName(stateOfOrigin, { countryId: countryRow ? countryRow.id : null })
      : null;
    const lgaRow = lga && stateRow
      ? await GeoModel.findLgaByName(lga, { stateId: stateRow.id })
      : null;
    return {
      country: countryRow ? { id: countryRow.id, name: countryRow.name } : null,
      state_of_origin: stateRow
        ? { id: stateRow.id, name: stateRow.name, code: stateRow.code }
        : (stateOfOrigin ? { id: null, name: String(stateOfOrigin) } : null),
      lga: lgaRow
        ? { id: lgaRow.id, name: lgaRow.name }
        : (lga ? { id: null, name: String(lga) } : null),
    };
  }
}

module.exports = GeoModel;
