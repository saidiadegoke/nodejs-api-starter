function joinNameParts(first, last) {
  const parts = [first, last]
    .filter((x) => x != null && String(x).trim() !== '')
    .map((x) => String(x).trim());
  return parts.length ? parts.join(' ') : null;
}

function profileDisplayName(profile) {
  if (!profile || typeof profile !== 'object') return null;
  if (profile.display_name && String(profile.display_name).trim()) {
    return String(profile.display_name).trim();
  }
  return joinNameParts(profile.first_name, profile.last_name);
}

function intakeDisplayName(intake) {
  if (!intake || typeof intake !== 'object') return null;
  if (intake.name && String(intake.name).trim()) {
    return String(intake.name).trim();
  }
  return null;
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
  const fromNin = joinNameParts(ninPayload.first_name, ninPayload.last_name)
    || (ninFullName && String(ninFullName).trim() ? String(ninFullName).trim() : null);
  const fromIntake = intakeDisplayName(intake);
  const fromProfile = profileDisplayName(profile);

  if (ninStatus === 'verified' && fromNin) return fromNin;
  if (ninStatus === 'pending') return fromIntake || fromProfile || fromNin || null;
  return fromNin || fromIntake || fromProfile || null;
}

module.exports = {
  resolveCandidateDisplayName,
  joinNameParts,
};
