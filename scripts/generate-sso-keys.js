/**
 * Generate an RSA keypair for CRP SSO issuer env vars.
 *
 *   node scripts/generate-sso-keys.js [kid]
 *
 * Prints CRP_SSO_PRIVATE_KEY_PEM, CRP_SSO_CURRENT_KID, and CRP_SSO_JWKS_JSON
 * ready to paste into .env. Does not write files or mutate the database.
 */
const { generateKeyPair, exportPKCS8, exportJWK } = require('jose');

function defaultKid() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `crp-key-${year}-${month}`;
}

function pemForEnv(pem) {
  return pem.trim().replace(/\n/g, '\\n');
}

async function main() {
  const kid = process.argv[2] || defaultKid();
  const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
  const privatePem = await exportPKCS8(privateKey);
  const publicJwk = await exportJWK(publicKey);

  publicJwk.kid = kid;
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';

  const jwksJson = JSON.stringify({ keys: [publicJwk] });

  console.log('CRP SSO keypair generated.\n');
  console.log('Add these to your .env (set CRP_SSO_ISSUER to your public API URL):\n');
  console.log(`CRP_SSO_CURRENT_KID=${kid}`);
  console.log(`CRP_SSO_PRIVATE_KEY_PEM=${pemForEnv(privatePem)}`);
  console.log(`CRP_SSO_JWKS_JSON=${jwksJson}`);
  console.log('\nExample issuer value:');
  console.log('CRP_SSO_ISSUER=http://localhost:5269');
  console.log('\nKeep the private key secret. Publish only the JWKS public key set.');
}

main().catch((error) => {
  console.error('Failed to generate SSO keys:', error.message);
  process.exit(1);
});
