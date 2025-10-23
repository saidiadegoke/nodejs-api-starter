const express = require('express');
const router = express.Router();
const CountryController = require('./controllers/country.controller');

/**
 * @route   GET /api/shared/countries
 * @desc    Get all countries
 * @access  Public
 */
router.get('/countries', CountryController.getAllCountries);

/**
 * @route   GET /api/shared/countries/search
 * @desc    Search countries by name
 * @access  Public
 */
router.get('/countries/search', CountryController.searchCountries);

/**
 * @route   GET /api/shared/countries/:id
 * @desc    Get country by ID
 * @access  Public
 */
router.get('/countries/:id', CountryController.getCountryById);

module.exports = router;

