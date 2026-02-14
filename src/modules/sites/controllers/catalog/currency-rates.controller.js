const CurrencyService = require('../../services/catalog/currency.service');
const { sendSuccess, sendError } = require('../../../../shared/utils/response');
const { OK, BAD_REQUEST } = require('../../../../shared/constants/statusCodes');

/**
 * GET /sites/currency-rates - Platform exchange rates (for product price computation).
 * Public; used by dashboard and storefront to display prices in NGN, USD, EUR, GBP.
 */
async function getRates(req, res) {
  try {
    const rates = await CurrencyService.getRates(false);
    sendSuccess(res, rates, 'Currency rates retrieved successfully', OK);
  } catch (err) {
    sendError(res, err.message || 'Failed to get currency rates', BAD_REQUEST);
  }
}

module.exports = { getRates };
