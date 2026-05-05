const CountryModel = require('../../../shared/models/country.model');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, NOT_FOUND } = require('../../../shared/constants/statusCodes');

class CountryController {
  /**
   * Get all countries
   */
  static async getAllCountries(req, res) {
    try {
      const activeOnly = req.query.active !== 'false'; // Default to true
      const countries = await CountryModel.getAll(activeOnly);
      
      sendSuccess(res, { countries }, 'Countries retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  /**
   * Get country by ID
   */
  static async getCountryById(req, res) {
    try {
      const { id } = req.params;
      const country = await CountryModel.getById(id);
      
      if (!country) {
        return sendError(res, 'Country not found', NOT_FOUND);
      }
      
      sendSuccess(res, { country }, 'Country retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  /**
   * Search countries
   */
  static async searchCountries(req, res) {
    try {
      const { q } = req.query;
      
      if (!q || q.trim().length < 2) {
        return sendError(res, 'Search query must be at least 2 characters', 400);
      }
      
      const countries = await CountryModel.search(q);
      
      sendSuccess(res, { countries }, 'Search completed successfully', OK);
    } catch (error) {
      sendError(res, error.message);
    }
  }
}

module.exports = CountryController;


