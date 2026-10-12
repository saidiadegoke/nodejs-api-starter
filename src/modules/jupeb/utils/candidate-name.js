function joinNameParts(...args) {
  const parts = args
    .flat()
    .filter((x) => x != null && String(x).trim() !== '')
    .map((x) => String(x).trim());
  return parts.length ? parts.join(' ') : null;
}

function profileDisplayName(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const first = profile.first_name ? String(profile.first_name).trim() : '';
  const middle = profile.middle_name ? String(profile.middle_name).trim() : '';
  const last = profile.last_name ? String(profile.last_name).trim() : '';
  const disp = profile.display_name && String(profile.display_name).trim() ? String(profile.display_name).trim() : '';

  if (middle && first && last) {
    if (!disp || disp.toLowerCase() === `${first} ${last}`.toLowerCase()) {
      return `${first} ${middle} ${last}`;
    }
    if (!disp.toLowerCase().includes(middle.toLowerCase())) {
      return joinNameParts(first, middle, last);
    }
  }
  if (disp) return disp;
  return joinNameParts(first, middle, last);
}

function intakeDisplayName(intake) {
  if (!intake || typeof intake !== 'object') return null;
  if (intake.name && String(intake.name).trim()) {
    return String(intake.name).trim();
  }
  return joinNameParts(
    intake.first_name || intake.firstname,
    intake.middle_name || intake.middlename || intake.middleName,
    intake.last_name || intake.lastname || intake.surname
  );
}

/**
 * Resolve the candidate display name from NIN verification data.
 * When NIN is verified, response_payload names are authoritative.
 * When pending, intake_payload.name is the fallback (typed before verify completed).
 *
 * @param {object} [params]
 * @param {object} [params.ninPayload] - jupeb_nin_verifications.response_payload
 * @param {object} [params.intake] - jupeb_nin_verifications.intake_payload
 * @param {object} [params.profile] - profiles row (first_name, last_name, display_name)
 * @param {string|null} [params.ninStatus] - verified | pending | failed
 * @param {string|null} [params.ninFullName] - pre-joined NIN name when parts are unavailable
 */
function resolveCandidateDisplayName({
  ninPayload = {},
  intake = {},
  profile = {},
  ninStatus = null,
  ninFullName = null,
} = {}) {
  const ninMiddle =
    (ninPayload && (ninPayload.middle_name || ninPayload.middlename || ninPayload.middleName)) ||
    (intake && (intake.middle_name || intake.middlename || intake.middleName)) ||
    null;
  const ninFirst =
    (ninPayload && (ninPayload.first_name || ninPayload.firstname || ninPayload.firstName)) ||
    (intake && (intake.first_name || intake.firstname)) ||
    null;
  const ninLast =
    (ninPayload && (ninPayload.last_name || ninPayload.lastname || ninPayload.lastName || ninPayload.surname)) ||
    (intake && (intake.last_name || intake.lastname || intake.surname)) ||
    null;

  const fromNin = joinNameParts(ninFirst, ninMiddle, ninLast)
    || (ninFullName && String(ninFullName).trim() ? String(ninFullName).trim() : null);
  const fromIntake = intakeDisplayName(intake);
  const fromProfile = profileDisplayName(profile);

  if (ninStatus === 'verified') {
    return fromNin || fromProfile || fromIntake || null;
  }
  if (ninStatus === 'pending') {
    return fromIntake || fromProfile || fromNin || null;
  }
  return fromNin || fromProfile || fromIntake || null;
}

module.exports = {
  resolveCandidateDisplayName,
  joinNameParts,
};

