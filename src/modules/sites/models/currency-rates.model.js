const pool = require('../../../db/pool');

const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP'];

/**
 * Get the platform currency rates row (id=1). Single row for platform default.
 */
async function get() {
  const result = await pool.query(
    'SELECT id, base_currency, rates, updated_at FROM currency_rates WHERE id = 1'
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    rates: typeof row.rates === 'string' ? JSON.parse(row.rates) : row.rates,
  };
}

/**
 * Update platform currency rates (id=1). rates = { NGN: 1, USD: 0.00064, EUR: 0.00058, GBP: 0.00052 }
 */
async function update(rates, baseCurrency = 'NGN') {
  const ratesJson = typeof rates === 'string' ? rates : JSON.stringify(rates);
  const result = await pool.query(
    `INSERT INTO currency_rates (id, base_currency, rates, updated_at)
     VALUES (1, $1, $2::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET base_currency = $1, rates = $2::jsonb, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [baseCurrency, ratesJson]
  );
  const row = result.rows[0];
  return row ? { ...row, rates: typeof row.rates === 'string' ? JSON.parse(row.rates) : row.rates } : null;
}

module.exports = {
  SUPPORTED_CURRENCIES,
  get,
  update,
};
