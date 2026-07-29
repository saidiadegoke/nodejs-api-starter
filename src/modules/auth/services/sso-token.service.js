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
  // if (!user.jupeb_university_id) {
  //   throw new Error('User institution is required for SSO handoff');
  // }

  return {
    sub: String(user.id),
    email: user.email,
    roles: Array.isArray(user.roles) ? user.roles : [],
    institution_id: String(user.jupeb_university_id) || null,
  };
}

async function issueHandoffToken({ user, targetApp }) {
  const { issuer } = getSsoConfig();
  const { privateKey, kid } = await getSigningMaterial();
  const claims = buildHandoffClaims(user);

  const token = await new SignJWT({
    email: claims.email,
    roles: claims.roles,
    institution_id: claims.institution_id,
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
