const pool = require('../../../db/pool');
const nextOfKinModel = require('../models/next-of-kin.model');

/**
 * M.12 — When a registration is linked to a verified NIN payload, push the
 * NIM-issued data into the editable tables so dashboards / final-preview
 * read from a single normalized source. Also used before NIN cache purge on
 * terminal registration status so demographics survive `response_payload` clear.
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

  const firstName = payload.first_name != null && String(payload.first_name).trim() !== ''
    ? String(payload.first_name).trim()
    : null;
  const lastName = payload.last_name != null && String(payload.last_name).trim() !== ''
    ? String(payload.last_name).trim()
    : null;
  const displayFromNames = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
  const displayName = (payload.display_name != null && String(payload.display_name).trim() !== '')
    ? String(payload.display_name).trim()
    : displayFromNames;

  // 1) Profile: demographics + address — only fill when empty (never overwrite edits).
  if (reg && reg.user_id) {
    const profileFields = {
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      display_name: displayName || undefined,
      residential_address: payload.address || payload.residential_address,
      state_of_origin: payload.state_of_origin,
      lga: payload.lga,
      place_of_birth: payload.place_of_birth,
      gender: payload.gender != null && String(payload.gender).trim() !== ''
        ? String(payload.gender).trim()
        : undefined,
      profile_photo_url: payload.photo_url != null && String(payload.photo_url).trim() !== ''
        ? String(payload.photo_url).trim()
        : undefined,
    };
    const present = Object.entries(profileFields).filter(
      ([, v]) => v !== undefined && v !== null && String(v).trim() !== ''
    );
    if (present.length) {
      await pool.query(
        `INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [reg.user_id]
      );
      const sets = present.map(([k], idx) => `${k} = COALESCE(NULLIF(${k}, ''), $${idx + 2})`).join(', ');
      const values = present.map(([, v]) => String(v));
      const upd = await pool.query(
        `UPDATE profiles SET ${sets}, updated_at = NOW() WHERE user_id = $1 RETURNING ${present.map(([k]) => k).join(', ')}`,
        [reg.user_id, ...values]
      );
      if (upd.rowCount > 0) result.applied.profile = true;
    }

    const dobRaw = payload.date_of_birth;
    if (dobRaw != null && String(dobRaw).trim() !== '') {
      await pool.query(
        `INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [reg.user_id]
      );
      const dobUpd = await pool.query(
        `UPDATE profiles
            SET date_of_birth = COALESCE(date_of_birth, $2::date), updated_at = NOW()
          WHERE user_id = $1`,
        [reg.user_id, String(dobRaw).trim()]
      );
      if (dobUpd.rowCount > 0) result.applied.profile = true;
    }
  }

  // 2) Next-of-kin: insert when no active row exists, with source='nin'.
  const nok = payload.next_of_kin;
  if (nok && typeof nok === 'object') {
    const existing = await nextOfKinModel.findActiveByRegistration(registrationId);
    if (!existing) {
      const nameRaw = nok.name || nok.full_name
        || [nok.first_name, nok.middle_name, nok.last_name]
          .filter((x) => x && String(x).trim())
          .map((x) => String(x).trim())
          .join(' ');
      const name = nameRaw ? String(nameRaw).trim() : '';
      const relationshipRaw = nok.relationship || nok.relation || 'relative';
      const relationship = String(relationshipRaw).toLowerCase();
      const phoneRaw = nok.phone || nok.contact || nok.contact_no;
      const phone = phoneRaw != null && String(phoneRaw).trim() !== '' ? String(phoneRaw).trim() : null;
      const email = nok.email != null && String(nok.email).trim() !== '' ? String(nok.email).trim() : null;
      const address = nok.address != null && String(nok.address).trim() !== '' ? String(nok.address).trim() : null;
      if (name) {
        try {
          await nextOfKinModel.create({
            registration_id: registrationId,
            name: name,
            relationship,
            phone,
            email,
            address,
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
