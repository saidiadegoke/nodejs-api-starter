/**
 * Payment checkout configuration seed.
 *
 * Gateway credentials live in .env. A gateway is activated **only** when
 * both its keys are present there — gateways without env keys are left
 * untouched (they stay inactive until configured). .env is the source
 * of truth: keys are re-applied from env on every run.
 *
 * direct_transfer is keyless (a manual method) — always activated, with
 * a demo bank account so a transfer checkout has an account to show.
 *
 * Idempotent: safe to re-run on every server boot.
 */

// Maps each gateway's payment_methods columns to its .env vars.
const GATEWAYS = [
  { code: 'paystack', publicEnv: 'PAYSTACK_PUBLIC_KEY', secretEnv: 'PAYSTACK_SECRET_KEY' },
  { code: 'flutterwave', publicEnv: 'FLUTTERWAVE_PUBLIC_KEY', secretEnv: 'FLUTTERWAVE_SECRET_KEY' },
  {
    code: 'remita',
    publicEnv: 'REMITA_MERCHANT_ID',
    secretEnv: 'REMITA_API_KEY',
    baseUrlEnv: 'REMITA_BASE_URL',
  },
];

async function run(pool) {
  // Gateways — activate from env credentials when present.
  for (const g of GATEWAYS) {
    const publicKey = (process.env[g.publicEnv] || '').trim();
    const secretKey = (process.env[g.secretEnv] || '').trim();
    if (!publicKey || !secretKey) {
      console.log(`[seed:payment] ${g.code} — no credentials in .env, left untouched`);
      continue;
    }
    const baseUrl = g.baseUrlEnv ? (process.env[g.baseUrlEnv] || '').trim() || null : null;
    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `UPDATE payment_methods
          SET api_public_key = $1,
              api_secret_key = $2,
              base_url = COALESCE($3, base_url),
              is_active = true,
              updated_at = NOW()
        WHERE code = $4`,
      [publicKey, secretKey, baseUrl, g.code]
    );
    console.log(`[seed:payment] ${g.code} — activated from .env`);
  }

  // Direct transfer — keyless manual method; always available.
  await pool.query(
    `UPDATE payment_methods SET is_active = true, updated_at = NOW()
      WHERE code = 'direct_transfer'`
  );
  await pool.query(
    `INSERT INTO bank_accounts (bank_name, account_number, account_name, is_active)
     VALUES ('Demo Bank', '0123456789', 'JUPEB Foundation (Demo)', true)
     ON CONFLICT (account_number) DO NOTHING`
  );

  // Payment catalog — re-assert the known items / structures are active
  // (the rows themselves are seeded by migration 017).
  await pool.query(
    `UPDATE payment_items SET is_active = true, updated_at = NOW()
      WHERE code IN ('affiliation_fee', 'examination_fee')`
  );
  await pool.query(
    `UPDATE payment_structures SET is_active = true, updated_at = NOW()
      WHERE code IN ('full', 'partial')`
  );
}

module.exports = { run };
