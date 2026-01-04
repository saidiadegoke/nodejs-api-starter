/**
 * Response Formatter
 *
 * Formats poll responses for frontend consumption based on poll type
 * Transforms database response format to UI-friendly format
 */

class ResponseFormatter {
  /**
   * Format poll response for display
   * @param {Object} poll - The poll object
   * @param {Object} response - The response object
   * @param {Array} pollOptions - Poll options
   * @returns {Object} Formatted response
   */
  static formatResponse(poll, response, pollOptions = []) {
    if (!response) return null;

    const baseResponse = {
      id: response.id,
      poll_id: response.poll_id,
      user_id: response.user_id,
      created_at: response.created_at,
      updated_at: response.updated_at
    };

    switch (poll.poll_type) {
      case 'yesno':
      case 'multipleChoice':
      case 'imageBased':
      case 'abcTest':
      case 'likertScale':
      case 'agreementDistribution':
      case 'gamified':
        return this.formatSingleOption(baseResponse, response, pollOptions);

      case 'multiSelect':
        return this.formatMultipleOptions(baseResponse, response, pollOptions);

      case 'ranking':
        return this.formatRanking(baseResponse, response, pollOptions);

      case 'slider':
      case 'predictionMarket':
        return this.formatNumeric(baseResponse, response, poll);

      case 'openEnded':
        return this.formatText(baseResponse, response);

      case 'mapBased':
        return this.formatMap(baseResponse, response);

      case 'timeline':
        return this.formatTimeline(baseResponse, response, poll);

      case 'binaryWithExplanation':
        return this.formatBinaryWithExplanation(baseResponse, response, pollOptions);

      default:
        return baseResponse;
    }
  }

  /**
   * Format single option response
   */
  static formatSingleOption(baseResponse, response, pollOptions) {
    const selectedOption = pollOptions.find(opt => opt.id === response.option_id);

    return {
      ...baseResponse,
      type: 'single_option',
      selected_option: {
        id: response.option_id,
        label: selectedOption?.label || 'Unknown option',
        image_url: selectedOption?.image_url,
        variant_name: selectedOption?.variant_name,
        variant_content: selectedOption?.variant_content
      }
    };
  }

  /**
   * Format multiple options response
   */
  static formatMultipleOptions(baseResponse, response, pollOptions) {
    const selectedOptions = (response.option_ids || [])
      .map(optionId => {
        const option = pollOptions.find(opt => opt.id === optionId);
        return option ? {
          id: optionId,
          label: option.label
        } : null;
      })
      .filter(Boolean);

    return {
      ...baseResponse,
      type: 'multiple_options',
      selected_options: selectedOptions,
      selection_count: selectedOptions.length
    };
  }

  /**
   * Format ranking response
   */
  static formatRanking(baseResponse, response, pollOptions) {
    const rankingData = typeof response.ranking_data === 'string'
      ? JSON.parse(response.ranking_data)
      : response.ranking_data;

    const rankedItems = (rankingData || [])
      .map(item => {
        const option = pollOptions.find(opt => opt.id === item.option_id);
        return option ? {
          id: item.option_id,
          label: option.label,
          rank: item.rank
        } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.rank - b.rank);

    return {
      ...baseResponse,
      type: 'ranking',
      ranked_items: rankedItems
    };
  }

  /**
   * Format numeric response (slider, prediction)
   */
  static formatNumeric(baseResponse, response, poll) {
    const config = poll.config || {};

    return {
      ...baseResponse,
      type: 'numeric',
      value: response.numeric_value,
      min: config.sliderMin || 0,
      max: config.sliderMax || 100,
      unit: config.unit || '',
      prediction_type: config.predictionType
    };
  }

  /**
   * Format text response (open-ended)
   */
  static formatText(baseResponse, response) {
    return {
      ...baseResponse,
      type: 'text',
      text: response.text_value,
      sentiment: response.metadata?.sentiment,
      word_count: response.text_value ? response.text_value.split(/\s+/).length : 0
    };
  }

  /**
   * Format map-based response
   */
  static formatMap(baseResponse, response) {
    const metadata = typeof response.metadata === 'string'
      ? JSON.parse(response.metadata)
      : response.metadata || {};

    return {
      ...baseResponse,
      type: 'map',
      location: metadata.location,
      rating: metadata.rating,
      coordinates: metadata.coordinates
    };
  }

  /**
   * Format timeline response
   */
  static formatTimeline(baseResponse, response, poll) {
    const metadata = typeof response.metadata === 'string'
      ? JSON.parse(response.metadata)
      : response.metadata || {};

    return {
      ...baseResponse,
      type: 'timeline',
      timepoint: metadata.timepoint,
      value: metadata.value,
      available_timepoints: poll.config?.timePoints || []
    };
  }

  /**
   * Format binary with explanation response
   */
  static formatBinaryWithExplanation(baseResponse, response, pollOptions) {
    const selectedOption = pollOptions.find(opt => opt.id === response.option_id);

    return {
      ...baseResponse,
      type: 'binary_with_explanation',
      selected_option: {
        id: response.option_id,
        label: selectedOption?.label || 'Unknown'
      },
      explanation: response.explanation,
      explanation_length: response.explanation ? response.explanation.length : 0
    };
  }

  /**
   * Format aggregated results for a poll
   * @param {Object} poll - The poll object
   * @param {Array} responses - All responses to the poll
   * @param {Array} pollOptions - Poll options
   * @returns {Object} Aggregated results
   */
  static formatAggregatedResults(poll, responses, pollOptions) {
    const totalResponses = responses.length;

    switch (poll.poll_type) {
      case 'yesno':
      case 'multipleChoice':
      case 'imageBased':
      case 'abcTest':
      case 'likertScale':
      case 'agreementDistribution':
      case 'gamified':
        return this.aggregateSingleChoice(pollOptions, responses, totalResponses);

      case 'multiSelect':
        return this.aggregateMultipleChoice(pollOptions, responses, totalResponses);

      case 'ranking':
        return this.aggregateRanking(pollOptions, responses);

      case 'slider':
      case 'predictionMarket':
        return this.aggregateNumeric(responses, poll);

      case 'openEnded':
        return this.aggregateText(responses);

      case 'mapBased':
        return this.aggregateMap(responses);

      case 'timeline':
        return this.aggregateTimeline(responses, poll);

      case 'binaryWithExplanation':
        return this.aggregateBinaryWithExplanation(pollOptions, responses, totalResponses);

      default:
        return { total_responses: totalResponses };
    }
  }

  /**
   * Aggregate single choice results
   */
  static aggregateSingleChoice(pollOptions, responses, totalResponses) {
    const optionCounts = {};
    pollOptions.forEach(opt => {
      optionCounts[opt.id] = 0;
    });

    responses.forEach(response => {
      if (response.option_id && optionCounts[response.option_id] !== undefined) {
        optionCounts[response.option_id]++;
      }
    });

    const results = pollOptions.map(option => ({
      id: option.id,
      label: option.label,
      image_url: option.image_url,
      count: optionCounts[option.id],
      percentage: totalResponses > 0
        ? Math.round((optionCounts[option.id] / totalResponses) * 100)
        : 0
    }));

    return {
      total_responses: totalResponses,
      results
    };
  }

  /**
   * Aggregate multiple choice results
   */
  static aggregateMultipleChoice(pollOptions, responses, totalResponses) {
    const optionCounts = {};
    pollOptions.forEach(opt => {
      optionCounts[opt.id] = 0;
    });

    responses.forEach(response => {
      const optionIds = response.option_ids || [];
      optionIds.forEach(optionId => {
        if (optionCounts[optionId] !== undefined) {
          optionCounts[optionId]++;
        }
      });
    });

    // Calculate total selections across all options
    const totalSelections = Object.values(optionCounts).reduce((sum, count) => sum + count, 0);

    // Calculate percentages based on total selections (will add up to 100%)
    const results = pollOptions.map(option => ({
      id: option.id,
      label: option.label,
      count: optionCounts[option.id],
      percentage: totalSelections > 0
        ? Math.round((optionCounts[option.id] / totalSelections) * 100)
        : 0
    }));

    return {
      total_responses: totalResponses,
      total_selections: totalSelections,
      results
    };
  }

  /**
   * Aggregate ranking results
   */
  static aggregateRanking(pollOptions, responses) {
    const rankSums = {};
    const rankCounts = {};

    pollOptions.forEach(opt => {
      rankSums[opt.id] = 0;
      rankCounts[opt.id] = 0;
    });

    responses.forEach(response => {
      const rankingData = typeof response.ranking_data === 'string'
        ? JSON.parse(response.ranking_data)
        : response.ranking_data || [];

      rankingData.forEach(item => {
        if (rankSums[item.option_id] !== undefined) {
          rankSums[item.option_id] += item.rank;
          rankCounts[item.option_id]++;
        }
      });
    });

    const results = pollOptions.map(option => ({
      id: option.id,
      label: option.label,
      average_rank: rankCounts[option.id] > 0
        ? (rankSums[option.id] / rankCounts[option.id]).toFixed(2)
        : 0,
      vote_count: rankCounts[option.id]
    })).sort((a, b) => parseFloat(a.average_rank) - parseFloat(b.average_rank));

    return {
      total_responses: responses.length,
      results
    };
  }

  /**
   * Aggregate numeric results
   */
  static aggregateNumeric(responses, poll) {
    const values = responses
      .map(r => r.numeric_value)
      .filter(v => v !== null && v !== undefined);

    // Get slider config for calculating defaults
    const config = poll.config || {};
    const minValue = config.sliderMin || 0;
    const maxValue = config.sliderMax || 100;
    const midpoint = Math.round((minValue + maxValue) / 2);

    if (values.length === 0) {
      return {
        total_responses: 0,
        average: midpoint, // Use calculated midpoint, not 0
        min: minValue,
        max: maxValue,
        median: midpoint
      };
    }

    const sum = values.reduce((acc, val) => acc + val, 0);
    const average = sum / values.length;
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    return {
      total_responses: responses.length,
      average: Math.round(average * 100) / 100,
      min: Math.min(...values),
      max: Math.max(...values),
      median,
      distribution: this.createDistribution(values, poll.config)
    };
  }

  /**
   * Aggregate text responses
   */
  static aggregateText(responses) {
    const textResponses = responses
      .filter(r => r.text_value)
      .map(r => ({
        id: r.id,
        text: r.text_value,
        created_at: r.created_at,
        sentiment: r.metadata?.sentiment
      }));

    return {
      total_responses: responses.length,
      responses: textResponses.slice(0, 50), // Return top 50
      has_more: textResponses.length > 50
    };
  }

  /**
   * Aggregate map responses
   */
  static aggregateMap(responses) {
    const locationData = {};

    responses.forEach(response => {
      const metadata = typeof response.metadata === 'string'
        ? JSON.parse(response.metadata)
        : response.metadata || {};

      const location = metadata.location;
      if (location) {
        if (!locationData[location]) {
          locationData[location] = {
            count: 0,
            total_rating: 0,
            rating_count: 0
          };
        }
        locationData[location].count++;
        if (metadata.rating) {
          locationData[location].total_rating += metadata.rating;
          locationData[location].rating_count++;
        }
      }
    });

    const results = Object.entries(locationData).map(([location, data]) => ({
      location,
      count: data.count,
      average_rating: data.rating_count > 0
        ? (data.total_rating / data.rating_count).toFixed(2)
        : null
    }));

    return {
      total_responses: responses.length,
      results
    };
  }

  /**
   * Aggregate timeline responses
   */
  static aggregateTimeline(responses, poll) {
    const timepointData = {};
    const timePoints = poll.config?.timePoints || [];

    timePoints.forEach(tp => {
      timepointData[tp] = {
        count: 0,
        total_value: 0
      };
    });

    responses.forEach(response => {
      const metadata = typeof response.metadata === 'string'
        ? JSON.parse(response.metadata)
        : response.metadata || {};

      const timepoint = metadata.timepoint;
      if (timepoint && timepointData[timepoint]) {
        timepointData[timepoint].count++;
        if (metadata.value !== undefined) {
          timepointData[timepoint].total_value += metadata.value;
        }
      }
    });

    const results = Object.entries(timepointData).map(([timepoint, data]) => ({
      timepoint,
      count: data.count,
      average_value: data.count > 0 ? (data.total_value / data.count).toFixed(2) : 0
    }));

    return {
      total_responses: responses.length,
      results
    };
  }

  /**
   * Aggregate binary with explanation
   */
  static aggregateBinaryWithExplanation(pollOptions, responses, totalResponses) {
    // Get vote counts
    const voteCounts = this.aggregateSingleChoice(pollOptions, responses, totalResponses);

    // Get top explanations for each option
    const yesOption = pollOptions.find(opt => opt.label.toLowerCase() === 'yes');
    const noOption = pollOptions.find(opt => opt.label.toLowerCase() === 'no');

    const yesExplanations = responses
      .filter(r => r.option_id === yesOption?.id && r.explanation)
      .map(r => r.explanation)
      .slice(0, 10);

    const noExplanations = responses
      .filter(r => r.option_id === noOption?.id && r.explanation)
      .map(r => r.explanation)
      .slice(0, 10);

    return {
      ...voteCounts,
      explanations: {
        yes: yesExplanations,
        no: noExplanations
      }
    };
  }

  /**
   * Helper: Create distribution buckets for numeric values
   */
  static createDistribution(values, config = {}) {
    const min = config.sliderMin || 0;
    const max = config.sliderMax || 100;
    const bucketCount = 10;
    const bucketSize = (max - min) / bucketCount;

    const buckets = Array(bucketCount).fill(0);

    values.forEach(value => {
      const bucketIndex = Math.min(
        Math.floor((value - min) / bucketSize),
        bucketCount - 1
      );
      buckets[bucketIndex]++;
    });

    return buckets.map((count, index) => ({
      range_start: min + (index * bucketSize),
      range_end: min + ((index + 1) * bucketSize),
      count
    }));
  }
}

module.exports = ResponseFormatter;
