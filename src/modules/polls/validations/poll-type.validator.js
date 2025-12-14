/**
 * Poll Type Validator
 *
 * Type-specific validation rules for different poll types
 * Based on /start-poll page validation logic
 */

class PollTypeValidator {
  /**
   * Validate poll data based on poll type
   * @param {Object} pollData - Poll data to validate
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  static validate(pollData) {
    const { poll_type, question, options = [], config = {} } = pollData;
    const errors = [];

    // Common validation: question is required
    if (!question || !question.trim()) {
      errors.push('Poll question is required');
    }

    // Type-specific validation
    switch (poll_type) {
      case 'yesno':
        this.validateYesNo(options, errors);
        break;

      case 'multipleChoice':
        this.validateMultipleChoice(options, errors);
        break;

      case 'multiSelect':
        this.validateMultiSelect(options, config, errors);
        break;

      case 'ranking':
        this.validateRanking(options, errors);
        break;

      case 'likertScale':
        this.validateLikertScale(options, config, errors);
        break;

      case 'slider':
        this.validateSlider(config, errors);
        break;

      case 'imageBased':
        this.validateImageBased(options, errors);
        break;

      case 'abcTest':
        this.validateABCTest(options, errors);
        break;

      case 'openEnded':
        this.validateOpenEnded(errors);
        break;

      case 'predictionMarket':
        this.validatePredictionMarket(config, errors);
        break;

      case 'agreementDistribution':
        this.validateAgreementDistribution(options, errors);
        break;

      case 'mapBased':
        this.validateMapBased(config, errors);
        break;

      case 'timeline':
        this.validateTimeline(config, errors);
        break;

      case 'binaryWithExplanation':
        this.validateBinaryWithExplanation(options, errors);
        break;

      case 'gamified':
        this.validateGamified(options, config, errors);
        break;

      default:
        errors.push(`Invalid poll type: ${poll_type}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate Yes/No poll
   */
  static validateYesNo(options, errors) {
    if (!options || options.length !== 2) {
      errors.push('Yes/No polls must have exactly 2 options');
      return;
    }

    if (options.some(opt => !opt.label || !opt.label.trim())) {
      errors.push('All options must have a label');
    }

    // Ensure options are Yes and No
    const labels = options.map(opt => opt.label?.toLowerCase());
    if (!labels.includes('yes') || !labels.includes('no')) {
      errors.push('Yes/No polls must have "Yes" and "No" as options');
    }
  }

  /**
   * Validate Multiple Choice poll
   */
  static validateMultipleChoice(options, errors) {
    if (!options || options.length < 2) {
      errors.push('Multiple choice polls need at least 2 options');
      return;
    }

    if (options.length > 10) {
      errors.push('Multiple choice polls can have at most 10 options');
    }

    if (options.some(opt => !opt.label || !opt.label.trim())) {
      errors.push('All options must have a label');
    }
  }

  /**
   * Validate Multi-Select poll
   */
  static validateMultiSelect(options, config, errors) {
    if (!options || options.length < 2) {
      errors.push('Multi-select polls need at least 2 options');
      return;
    }

    if (options.length > 10) {
      errors.push('Multi-select polls can have at most 10 options');
    }

    if (options.some(opt => !opt.label || !opt.label.trim())) {
      errors.push('All options must have a label');
    }

    // Validate maxSelections
    if (config.maxSelections) {
      const maxSelections = Number(config.maxSelections);
      if (isNaN(maxSelections) || maxSelections < 1) {
        errors.push('maxSelections must be a positive number');
      }
      if (maxSelections > options.length) {
        errors.push('maxSelections cannot be greater than the number of options');
      }
    }
  }

  /**
   * Validate Ranking poll
   */
  static validateRanking(options, errors) {
    if (!options || options.length < 3) {
      errors.push('Ranking polls need at least 3 items');
      return;
    }

    if (options.length > 8) {
      errors.push('Ranking polls can have at most 8 items');
    }

    if (options.some(opt => !opt.label || !opt.label.trim())) {
      errors.push('All ranking items must have a label');
    }
  }

  /**
   * Validate Likert Scale poll
   */
  static validateLikertScale(options, config, errors) {
    // Validate scaleType
    const validScaleTypes = ['agreement', 'satisfaction', 'concern', 'frequency', 'importance'];
    if (!config.scaleType || !validScaleTypes.includes(config.scaleType)) {
      errors.push(`scaleType must be one of: ${validScaleTypes.join(', ')}`);
    }

    // Validate scaleRange
    const validRanges = [5, 7];
    if (!config.scaleRange || !validRanges.includes(Number(config.scaleRange))) {
      errors.push('scaleRange must be either 5 or 7');
    }

    // Options should match the scale range
    if (options && options.length > 0) {
      const expectedCount = Number(config.scaleRange) || 5;
      if (options.length !== expectedCount) {
        errors.push(`Likert scale with range ${expectedCount} must have exactly ${expectedCount} options`);
      }

      if (options.some(opt => !opt.label || !opt.label.trim())) {
        errors.push('All scale options must have a label');
      }
    }
  }

  /**
   * Validate Slider poll
   */
  static validateSlider(config, errors) {
    // Validate min and max
    if (config.sliderMin === undefined || config.sliderMax === undefined) {
      errors.push('Slider polls must have sliderMin and sliderMax in config');
      return;
    }

    const min = Number(config.sliderMin);
    const max = Number(config.sliderMax);

    if (isNaN(min) || isNaN(max)) {
      errors.push('Slider min and max values must be numbers');
      return;
    }

    if (min >= max) {
      errors.push('Slider minimum value must be less than maximum value');
    }
  }

  /**
   * Validate Image-Based poll
   */
  static validateImageBased(options, errors) {
    if (!options || options.length < 2) {
      errors.push('Image-based polls need at least 2 images');
      return;
    }

    if (options.length > 6) {
      errors.push('Image-based polls can have at most 6 images');
    }

    if (options.some(opt => !opt.label || !opt.label.trim())) {
      errors.push('All image options must have a label');
    }

    if (options.some(opt => !opt.image_url || !opt.image_url.trim())) {
      errors.push('All image options must have an image URL');
    }

    // Validate image URLs
    options.forEach((opt, index) => {
      if (opt.image_url && !this.isValidUrl(opt.image_url)) {
        errors.push(`Image URL at position ${index} is not a valid URL`);
      }
    });
  }

  /**
   * Validate A/B/C Test poll
   */
  static validateABCTest(options, errors) {
    if (!options || options.length < 2) {
      errors.push('A/B/C test polls need at least 2 variants');
      return;
    }

    if (options.length > 5) {
      errors.push('A/B/C test polls can have at most 5 variants');
    }

    if (options.some(opt => !opt.label || !opt.label.trim())) {
      errors.push('All variants must have a label');
    }

    // Variant content is optional but if provided should not be empty
    options.forEach((opt, index) => {
      if (opt.variant_content !== undefined && opt.variant_content !== null && !opt.variant_content.trim()) {
        errors.push(`Variant at position ${index} has empty content`);
      }
    });
  }

  /**
   * Validate Open-Ended poll
   */
  static validateOpenEnded(errors) {
    // Open-ended polls don't need options
    // No additional validation needed
  }

  /**
   * Validate Prediction Market poll
   */
  static validatePredictionMarket(config, errors) {
    // Validate predictionType
    const validTypes = ['percentage', 'numeric', 'binary'];
    if (!config.predictionType || !validTypes.includes(config.predictionType)) {
      errors.push(`predictionType must be one of: ${validTypes.join(', ')}`);
    }
  }

  /**
   * Validate Agreement Distribution poll
   */
  static validateAgreementDistribution(options, errors) {
    if (!options || options.length !== 5) {
      errors.push('Agreement distribution polls must have exactly 5 options');
      return;
    }

    if (options.some(opt => !opt.label || !opt.label.trim())) {
      errors.push('All agreement options must have a label');
    }

    // Expected labels for agreement distribution
    const expectedLabels = [
      'strongly support',
      'support',
      'neutral',
      'oppose',
      'strongly oppose'
    ];

    const actualLabels = options.map(opt => opt.label?.toLowerCase().replace(/\s+/g, ''));
    const normalizedExpectedLabels = expectedLabels.map(label => label.replace(/\s+/g, ''));
    const hasAllLabels = normalizedExpectedLabels.every(label =>
      actualLabels.includes(label)
    );

    if (!hasAllLabels) {
      errors.push('Agreement distribution must include: Strongly Support, Support, Neutral, Oppose, Strongly Oppose');
    }
  }

  /**
   * Validate Map-Based poll
   */
  static validateMapBased(config, errors) {
    // Validate mapType
    const validMapTypes = ['usa_states', 'world_countries', 'custom'];
    if (!config.mapType || !validMapTypes.includes(config.mapType)) {
      errors.push(`mapType must be one of: ${validMapTypes.join(', ')}`);
    }
  }

  /**
   * Validate Timeline poll
   */
  static validateTimeline(config, errors) {
    if (!config.timePoints || !Array.isArray(config.timePoints)) {
      errors.push('Timeline polls must have a timePoints array in config');
      return;
    }

    if (config.timePoints.length < 2) {
      errors.push('Timeline polls need at least 2 time points');
    }

    if (config.timePoints.some(tp => !tp || !tp.trim())) {
      errors.push('All time points must have a label');
    }
  }

  /**
   * Validate Binary with Explanation poll
   */
  static validateBinaryWithExplanation(options, errors) {
    if (!options || options.length !== 2) {
      errors.push('Binary with explanation polls must have exactly 2 options');
      return;
    }

    if (options.some(opt => !opt.label || !opt.label.trim())) {
      errors.push('All options must have a label');
    }

    // Ensure options are Yes and No
    const labels = options.map(opt => opt.label?.toLowerCase());
    if (!labels.includes('yes') || !labels.includes('no')) {
      errors.push('Binary with explanation polls must have "Yes" and "No" as options');
    }
  }

  /**
   * Validate Gamified poll
   */
  static validateGamified(options, config, errors) {
    if (!options || options.length < 2) {
      errors.push('Gamified polls need at least 2 options');
      return;
    }

    if (options.length > 6) {
      errors.push('Gamified polls can have at most 6 options');
    }

    if (options.some(opt => !opt.label || !opt.label.trim())) {
      errors.push('All options must have a label');
    }

    // Validate gameMode
    const validGameModes = ['spinToVote', 'swipeToVote', 'streakRewards'];
    if (!config.gameMode || !validGameModes.includes(config.gameMode)) {
      errors.push(`gameMode must be one of: ${validGameModes.join(', ')}`);
    }
  }

  /**
   * Helper: Validate URL format
   */
  static isValidUrl(urlString) {
    try {
      const url = new URL(urlString);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

module.exports = PollTypeValidator;
