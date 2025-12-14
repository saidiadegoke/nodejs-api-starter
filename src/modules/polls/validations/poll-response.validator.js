/**
 * Poll Response Validator
 *
 * Validates poll responses based on poll type
 * Ensures response data conforms to poll type specifications
 */

class PollResponseValidator {
  /**
   * Validate poll response based on poll type
   * @param {Object} poll - The poll being responded to
   * @param {Object} responseData - The response data
   * @param {Array} pollOptions - Poll options
   * @returns {Object} { valid: boolean, errors: string[], normalizedResponse: Object }
   */
  static validate(poll, responseData, pollOptions = []) {
    const errors = [];
    let normalizedResponse = {};

    const { poll_type, config = {} } = poll;

    switch (poll_type) {
      case 'yesno':
        normalizedResponse = this.validateYesNo(responseData, pollOptions, errors);
        break;

      case 'multipleChoice':
        normalizedResponse = this.validateMultipleChoice(responseData, pollOptions, errors);
        break;

      case 'multiSelect':
        normalizedResponse = this.validateMultiSelect(responseData, pollOptions, config, errors);
        break;

      case 'ranking':
        normalizedResponse = this.validateRanking(responseData, pollOptions, errors);
        break;

      case 'likertScale':
        normalizedResponse = this.validateLikertScale(responseData, pollOptions, errors);
        break;

      case 'slider':
        normalizedResponse = this.validateSlider(responseData, config, errors);
        break;

      case 'imageBased':
        normalizedResponse = this.validateImageBased(responseData, pollOptions, errors);
        break;

      case 'abcTest':
        normalizedResponse = this.validateABCTest(responseData, pollOptions, errors);
        break;

      case 'openEnded':
        normalizedResponse = this.validateOpenEnded(responseData, errors);
        break;

      case 'predictionMarket':
        normalizedResponse = this.validatePredictionMarket(responseData, config, errors);
        break;

      case 'agreementDistribution':
        normalizedResponse = this.validateAgreementDistribution(responseData, pollOptions, errors);
        break;

      case 'mapBased':
        normalizedResponse = this.validateMapBased(responseData, errors);
        break;

      case 'timeline':
        normalizedResponse = this.validateTimeline(responseData, config, errors);
        break;

      case 'binaryWithExplanation':
        normalizedResponse = this.validateBinaryWithExplanation(responseData, pollOptions, errors);
        break;

      case 'gamified':
        normalizedResponse = this.validateGamified(responseData, pollOptions, errors);
        break;

      default:
        errors.push(`Unknown poll type: ${poll_type}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      normalizedResponse
    };
  }

  /**
   * Validate Yes/No response
   * Stores in: option_id
   */
  static validateYesNo(responseData, pollOptions, errors) {
    const { option_id } = responseData;

    if (!option_id) {
      errors.push('option_id is required for yes/no polls');
      return {};
    }

    // Verify option exists
    const option = pollOptions.find(opt => opt.id === option_id);
    if (!option) {
      errors.push('Invalid option selected');
      return {};
    }

    return { option_id };
  }

  /**
   * Validate Multiple Choice response
   * Stores in: option_id
   */
  static validateMultipleChoice(responseData, pollOptions, errors) {
    const { option_id } = responseData;

    if (!option_id) {
      errors.push('option_id is required for multiple choice polls');
      return {};
    }

    // Verify option exists
    const option = pollOptions.find(opt => opt.id === option_id);
    if (!option) {
      errors.push('Invalid option selected');
      return {};
    }

    return { option_id };
  }

  /**
   * Validate Multi-Select response
   * Stores in: option_ids (array)
   */
  static validateMultiSelect(responseData, pollOptions, config, errors) {
    const { option_ids } = responseData;

    if (!option_ids || !Array.isArray(option_ids)) {
      errors.push('option_ids array is required for multi-select polls');
      return {};
    }

    if (option_ids.length === 0) {
      errors.push('At least one option must be selected');
      return {};
    }

    // Check maxSelections
    const maxSelections = config.maxSelections || pollOptions.length;
    if (option_ids.length > maxSelections) {
      errors.push(`You can select at most ${maxSelections} options`);
      return {};
    }

    // Verify all options exist
    const validOptionIds = pollOptions.map(opt => opt.id);
    const invalidOptions = option_ids.filter(id => !validOptionIds.includes(id));
    if (invalidOptions.length > 0) {
      errors.push('One or more invalid options selected');
      return {};
    }

    return { option_ids };
  }

  /**
   * Validate Ranking response
   * Stores in: ranking_data (JSONB array of {option_id, rank})
   */
  static validateRanking(responseData, pollOptions, errors) {
    const { ranking_data } = responseData;

    if (!ranking_data || !Array.isArray(ranking_data)) {
      errors.push('ranking_data array is required for ranking polls');
      return {};
    }

    if (ranking_data.length !== pollOptions.length) {
      errors.push('All items must be ranked');
      return {};
    }

    // Verify structure
    const validOptionIds = pollOptions.map(opt => opt.id);
    const rankedOptionIds = ranking_data.map(item => item.option_id);
    const ranks = ranking_data.map(item => item.rank);

    // Check all options are ranked
    const missingOptions = validOptionIds.filter(id => !rankedOptionIds.includes(id));
    if (missingOptions.length > 0) {
      errors.push('All options must be included in ranking');
      return {};
    }

    // Check ranks are unique and sequential
    const sortedRanks = [...ranks].sort((a, b) => a - b);
    const expectedRanks = Array.from({ length: pollOptions.length }, (_, i) => i + 1);
    if (JSON.stringify(sortedRanks) !== JSON.stringify(expectedRanks)) {
      errors.push('Ranks must be unique and sequential from 1 to N');
      return {};
    }

    return { ranking_data };
  }

  /**
   * Validate Likert Scale response
   * Stores in: option_id
   */
  static validateLikertScale(responseData, pollOptions, errors) {
    const { option_id } = responseData;

    if (!option_id) {
      errors.push('option_id is required for Likert scale polls');
      return {};
    }

    // Verify option exists
    const option = pollOptions.find(opt => opt.id === option_id);
    if (!option) {
      errors.push('Invalid scale option selected');
      return {};
    }

    return { option_id };
  }

  /**
   * Validate Slider response
   * Stores in: numeric_value
   */
  static validateSlider(responseData, config, errors) {
    const { numeric_value } = responseData;

    if (numeric_value === undefined || numeric_value === null) {
      errors.push('numeric_value is required for slider polls');
      return {};
    }

    const value = Number(numeric_value);
    if (isNaN(value)) {
      errors.push('numeric_value must be a number');
      return {};
    }

    const min = Number(config.sliderMin || 0);
    const max = Number(config.sliderMax || 100);

    if (value < min || value > max) {
      errors.push(`Value must be between ${min} and ${max}`);
      return {};
    }

    return { numeric_value: value };
  }

  /**
   * Validate Image-Based response
   * Stores in: option_id
   */
  static validateImageBased(responseData, pollOptions, errors) {
    const { option_id } = responseData;

    if (!option_id) {
      errors.push('option_id is required for image-based polls');
      return {};
    }

    // Verify option exists
    const option = pollOptions.find(opt => opt.id === option_id);
    if (!option) {
      errors.push('Invalid image option selected');
      return {};
    }

    return { option_id };
  }

  /**
   * Validate A/B/C Test response
   * Stores in: option_id
   */
  static validateABCTest(responseData, pollOptions, errors) {
    const { option_id } = responseData;

    if (!option_id) {
      errors.push('option_id is required for A/B/C test polls');
      return {};
    }

    // Verify option exists
    const option = pollOptions.find(opt => opt.id === option_id);
    if (!option) {
      errors.push('Invalid variant selected');
      return {};
    }

    return { option_id };
  }

  /**
   * Validate Open-Ended response
   * Stores in: text_value
   */
  static validateOpenEnded(responseData, errors) {
    const { text_value } = responseData;

    if (!text_value || !text_value.trim()) {
      errors.push('text_value is required for open-ended polls');
      return {};
    }

    if (text_value.trim().length < 3) {
      errors.push('Response must be at least 3 characters');
      return {};
    }

    if (text_value.length > 5000) {
      errors.push('Response must be less than 5000 characters');
      return {};
    }

    return { text_value: text_value.trim() };
  }

  /**
   * Validate Prediction Market response
   * Stores in: numeric_value
   */
  static validatePredictionMarket(responseData, config, errors) {
    const { numeric_value } = responseData;

    if (numeric_value === undefined || numeric_value === null) {
      errors.push('numeric_value is required for prediction market polls');
      return {};
    }

    const value = Number(numeric_value);
    if (isNaN(value)) {
      errors.push('numeric_value must be a number');
      return {};
    }

    // For percentage predictions
    if (config.predictionType === 'percentage') {
      if (value < 0 || value > 100) {
        errors.push('Prediction percentage must be between 0 and 100');
        return {};
      }
    }

    return { numeric_value: value };
  }

  /**
   * Validate Agreement Distribution response
   * Stores in: option_id
   */
  static validateAgreementDistribution(responseData, pollOptions, errors) {
    const { option_id } = responseData;

    if (!option_id) {
      errors.push('option_id is required for agreement distribution polls');
      return {};
    }

    // Verify option exists
    const option = pollOptions.find(opt => opt.id === option_id);
    if (!option) {
      errors.push('Invalid agreement option selected');
      return {};
    }

    return { option_id };
  }

  /**
   * Validate Map-Based response
   * Stores in: metadata (with location and optional rating)
   */
  static validateMapBased(responseData, errors) {
    const { metadata } = responseData;

    if (!metadata || !metadata.location) {
      errors.push('Location is required for map-based polls');
      return {};
    }

    if (!metadata.location.trim()) {
      errors.push('Location cannot be empty');
      return {};
    }

    // Optional rating validation
    if (metadata.rating !== undefined) {
      const rating = Number(metadata.rating);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        errors.push('Rating must be between 1 and 5');
        return {};
      }
    }

    return { metadata };
  }

  /**
   * Validate Timeline response
   * Stores in: metadata (with timepoint and value)
   */
  static validateTimeline(responseData, config, errors) {
    const { metadata } = responseData;

    if (!metadata || !metadata.timepoint) {
      errors.push('Timepoint is required for timeline polls');
      return {};
    }

    // Verify timepoint is valid
    const validTimepoints = config.timePoints || [];
    if (!validTimepoints.includes(metadata.timepoint)) {
      errors.push('Invalid timepoint selected');
      return {};
    }

    // Value should be numeric (e.g., sentiment score)
    if (metadata.value !== undefined) {
      const value = Number(metadata.value);
      if (isNaN(value)) {
        errors.push('Timeline value must be a number');
        return {};
      }
    }

    return { metadata };
  }

  /**
   * Validate Binary with Explanation response
   * Stores in: option_id and explanation
   */
  static validateBinaryWithExplanation(responseData, pollOptions, errors) {
    const { option_id, explanation } = responseData;

    if (!option_id) {
      errors.push('option_id is required for binary with explanation polls');
      return {};
    }

    // Verify option exists
    const option = pollOptions.find(opt => opt.id === option_id);
    if (!option) {
      errors.push('Invalid option selected');
      return {};
    }

    if (!explanation || !explanation.trim()) {
      errors.push('Explanation is required for binary with explanation polls');
      return {};
    }

    if (explanation.trim().length < 10) {
      errors.push('Explanation must be at least 10 characters');
      return {};
    }

    if (explanation.length > 1000) {
      errors.push('Explanation must be less than 1000 characters');
      return {};
    }

    return { option_id, explanation: explanation.trim() };
  }

  /**
   * Validate Gamified response
   * Stores in: option_id with optional metadata for game state
   */
  static validateGamified(responseData, pollOptions, errors) {
    const { option_id, metadata = {} } = responseData;

    if (!option_id) {
      errors.push('option_id is required for gamified polls');
      return {};
    }

    // Verify option exists
    const option = pollOptions.find(opt => opt.id === option_id);
    if (!option) {
      errors.push('Invalid option selected');
      return {};
    }

    return { option_id, metadata };
  }
}

module.exports = PollResponseValidator;
