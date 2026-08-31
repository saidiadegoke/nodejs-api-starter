const crypto = require('crypto');
const { SignJWT, importPKCS8 } = require('jose');
const { getSsoConfig } = require('../../../shared/config/sso-keys.config');
const { logger } = require('../../../shared/utils/logger');

let cachedPrivateKey = null;
let cachedKid = null;

async function getSigningMaterial() {
  const { privateKeyPem, currentKid, enabled } = getSsoConfig();
  if (!enabled) {
    throw new Error('SSO issuer is not configured');
  }

  if (!cachedPrivateKey || cachedKid !== currentKid) {
    cachedPrivateKey = await importPKCS8(privateKeyPem, 'RS256');
    cachedKid = currentKid;
  }

  return { privateKey: cachedPrivateKey, kid: currentKid };
}

function resetPrivateKeyCacheForTests() {
  cachedPrivateKey = null;
  cachedKid = null;
}

function buildHandoffClaims(user) {
  if (!user || !user.id) {
    throw new Error('User record required for SSO handoff');
  }
  if (!user.email) {
    throw new Error('User email is required for SSO handoff');
  }

  const institutionId = user.jupeb_university_id || null;
  const institutionCode = user.jupeb_university_code || null;
  const institutionShortCode = user.jupeb_university_short_name || null;

  return {
    sub: String(user.id),
    email: user.email,
    roles: Array.isArray(user.roles) ? user.roles : [],
    institution_id: institutionId ? String(institutionId) : null,
    institution_code: institutionCode ? String(institutionCode) : null,
    institution_short_code: institutionShortCode ? String(institutionShortCode) : null,
  };
}

async function issueHandoffToken({ user, targetApp }) {
  const { issuer } = getSsoConfig();
  const { privateKey, kid } = await getSigningMaterial();

  let enrichedUser = user;
  const hasUniCode = enrichedUser?.jupeb_university_code;
  const hasUniShortCode = enrichedUser?.jupeb_university_short_name;

  if ((!hasUniCode || !hasUniShortCode) && enrichedUser?.jupeb_university_id) {
    try {
      const universityModel = require('../../jupeb/models/university.model');
      const uni = await universityModel.findById(enrichedUser.jupeb_university_id);
      
      if (uni) {
        enrichedUser = {
          ...enrichedUser,
          jupeb_university_code: uni.code,
          jupeb_university_short_name: uni.short_name,
        };
      }
    } catch {
      // Non-fatal fallback
    }
  }

  const claims = buildHandoffClaims(enrichedUser);

  const token = await new SignJWT({
    email: claims.email,
    roles: claims.roles,
    institution_id: claims.institution_id,
    institution_code: claims.institution_code,
    institution_short_code: claims.institution_short_code,
    short_code: claims.institution_short_code,
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setSubject(claims.sub)
    .setIssuer(issuer)
    .setAudience(targetApp)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(privateKey);

  return token;
}

module.exports = {
  issueHandoffToken,
  buildHandoffClaims,
  resetPrivateKeyCacheForTests,
};
