const CurrencyRatesModel = require('../../models/currency-rates.model');

let ratesCache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Get platform currency rates (cached). { base_currency, rates: { NGN: 1, USD: 0.00064, ... } }
 */
async function getRates(useCache = true) {
  const now = Date.now();
  if (useCache && ratesCache && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return ratesCache;
  }
  const row = await CurrencyRatesModel.get();
  if (!row || !row.rates) {
    ratesCache = { base_currency: 'NGN', rates: { NGN: 1, USD: 0.00064, EUR: 0.00058, GBP: 0.00052 } };
  } else {
    ratesCache = { base_currency: row.base_currency || 'NGN', rates: row.rates };
  }
  cacheTimestamp = now;
  return ratesCache;
}

/**
 * Convert amount from one currency to another using platform rates.
 * @param {number} amount
 * @param {string} fromCurrency - e.g. 'NGN'
 * @param {string} toCurrency - e.g. 'USD'
 * @returns {number} amount in toCurrency (rounded to 2 decimals)
 */
async function convert(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return Math.round(amount * 100) / 100;
  const { rates } = await getRates();
  const from = (rates[fromCurrency] ?? rates[fromCurrency?.toUpperCase()]);
  const to = (rates[toCurrency] ?? rates[toCurrency?.toUpperCase()]);
  if (from == null || to == null) return amount;
  const converted = (Number(amount) * to) / from;
  return Math.round(converted * 100) / 100;
}

/**
 * Compute amount in all supported currencies from a single amount in one currency.
 * @param {number} amount - price in fromCurrency
 * @param {string} fromCurrency - e.g. 'NGN'
 * @returns {Promise<Record<string, number>>} { NGN: 5000, USD: 3.2, EUR: 2.9, GBP: 2.6 }
 */
async function computePrices(amount, fromCurrency) {
  const { rates } = await getRates();
  const from = rates[fromCurrency] ?? rates[fromCurrency?.toUpperCase()];
  if (from == null) return { [fromCurrency]: Number(amount) };
  const result = {};
  for (const [code, rate] of Object.entries(rates)) {
    const value = (Number(amount) * rate) / from;
    result[code] = Math.round(value * 100) / 100;
  }
  return result;
}

/** Whether product has manual per-currency prices from DB (object with at least one numeric value). */
function hasManualPrices(product) {
  const p = product.prices;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  return Object.values(p).some((v) => typeof v === 'number' && !Number.isNaN(v));
}

/**
 * Attach computed `prices` (and optionally compare_at_prices, costs) to a product object.
 * If product has manual prices (DB column), use them and fill missing currencies from conversion.
 * Mutates the object in place.
 */
async function attachComputedPrices(product) {
  if (!product) return product;
  const currency = (product.price_currency || 'NGN').toUpperCase();
  const price = Number(product.price);
  const computed = await computePrices(price, currency);
  if (hasManualPrices(product)) {
    const manual = product.prices;
    product.prices = {};
    for (const [code, rateVal] of Object.entries(computed)) {
      product.prices[code] = typeof manual[code] === 'number' && !Number.isNaN(manual[code])
        ? Math.round(manual[code] * 100) / 100
        : rateVal;
    }
  } else {
    product.prices = computed;
  }
  if (product.compare_at_price != null) {
    product.compare_at_prices = await computePrices(Number(product.compare_at_price), currency);
  }
  if (product.cost != null) {
    product.costs = await computePrices(Number(product.cost), currency);
  }
  return product;
}

/**
 * Attach computed prices to an array of products (one getRates call, then map).
 * Products with manual prices (DB) use them and get missing currencies from conversion.
 */
async function attachComputedPricesToMany(products) {
  if (!Array.isArray(products) || products.length === 0) return products;
  const { rates } = await getRates();
  for (const product of products) {
    const currency = (product.price_currency || 'NGN').toUpperCase();
    const from = rates[currency];
    let computed = {};
    if (from == null) {
      computed = { [currency]: Number(product.price) };
    } else {
      for (const [code, rate] of Object.entries(rates)) {
        const value = (Number(product.price) * rate) / from;
        computed[code] = Math.round(value * 100) / 100;
      }
    }
    if (hasManualPrices(product)) {
      const manual = product.prices;
      product.prices = {};
      for (const [code, computedVal] of Object.entries(computed)) {
        product.prices[code] = typeof manual[code] === 'number' && !Number.isNaN(manual[code])
          ? Math.round(manual[code] * 100) / 100
          : computedVal;
      }
    } else {
      product.prices = computed;
    }
    if (product.compare_at_price != null && from != null) {
      product.compare_at_prices = {};
      for (const [code, rate] of Object.entries(rates)) {
        const value = (Number(product.compare_at_price) * rate) / from;
        product.compare_at_prices[code] = Math.round(value * 100) / 100;
      }
    }
    if (product.cost != null && from != null) {
      product.costs = {};
      for (const [code, rate] of Object.entries(rates)) {
        const value = (Number(product.cost) * rate) / from;
        product.costs[code] = Math.round(value * 100) / 100;
      }
    }
  }
  return products;
}

module.exports = {
  getRates,
  convert,
  computePrices,
  attachComputedPrices,
  attachComputedPricesToMany,
};
