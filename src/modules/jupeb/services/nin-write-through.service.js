const pool = require('../../../db/pool');
const nextOfKinModel = require('../models/next-of-kin.model');

/**
 * M.12 — When a registration is linked to a verified NIN payload, push the
 * NIM-issued data into the editable tables so dashboards / final-preview
 * read from a single normalized source.
 *
 * Behavior is non-destructive:
 *   - profiles columns are only filled when currently NULL/empty.
 *   - jupeb_next_of_kin is only seeded when there is no active row yet.
 *
 * Best-effort: throws are caught and logged by the caller; this function
 * itself never throws on missing fields, only on real DB errors.
 */
async function applyNinPayloadToRegistration({ registrationId, ninPayload, userId = null }) {
  if (!registrationId) return { applied: { profile: false, next_of_kin: false } };
  const payload = ninPayload || {};

  const result = { applied: { profile: false, next_of_kin: false } };

  // Pull the registration's user_id so we can target the right `profiles` row.
  const regRow = await pool.query(
    `SELECT user_id FROM jupeb_registrations WHERE id = $1`,
    [registrationId]
  );
  const reg = regRow.rows[0];

  // 1) Profile: address / state / lga / place_of_birth — only fill if empty.
  if (reg && reg.user_id) {
    const profileFields = {
      residential_address: payload.address || payload.residential_address,
      state_of_origin: payload.state_of_origin,
      lga: payload.lga,
      place_of_birth: payload.place_of_birth,
    };
    const present = Object.entries(profileFields).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
    if (present.length) {
      // Make sure a profile row exists.
      await pool.query(
        `INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [reg.user_id]
      );
      // Only update fields that are NULL/empty today.
      const sets = present.map(([k], idx) => `${k} = COALESCE(NULLIF(${k}, ''), $${idx + 2})`).join(', ');
      const values = present.map(([, v]) => String(v));
      const upd = await pool.query(
        `UPDATE profiles SET ${sets}, updated_at = NOW() WHERE user_id = $1 RETURNING ${present.map(([k]) => k).join(', ')}`,
        [reg.user_id, ...values]
      );
      result.applied.profile = upd.rowCount > 0;
    }
  }

  // 2) Next-of-kin: insert when no active row exists, with source='nin'.
  const nok = payload.next_of_kin;
  if (nok && typeof nok === 'object') {
    const existing = await nextOfKinModel.findActiveByRegistration(registrationId);
    if (!existing) {
      const name = nok.name || nok.full_name;
      const relationship = (nok.relationship || nok.relation || 'relative').toString().toLowerCase();
      const phone = nok.phone || nok.contact;
      const email = nok.email || null;
      const address = nok.address || null;
      if (name && (phone || email)) {
        try {
          await nextOfKinModel.create({
            registration_id: registrationId,
            name: String(name).trim(),
            relationship,
            phone: phone ? String(phone).trim() : null,
            email: email ? String(email).trim() : null,
            address: address ? String(address).trim() : null,
            source: 'nin',
            created_by: userId,
          });
          result.applied.next_of_kin = true;
        } catch (err) {
          // Constraint violations (e.g. unknown relationship that doesn't pass
          // the API-layer allow-list) are swallowed; the student can edit later.
          // eslint-disable-next-line no-console
          console.warn(
            '[nin-write-through] could not seed next_of_kin for registration',
            registrationId,
            err && err.message
          );
        }
      }
    }
  }

  return result;
}

module.exports = { applyNinPayloadToRegistration };
