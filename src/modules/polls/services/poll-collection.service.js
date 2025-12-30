/**
 * Poll Collection Service
 *
 * Business logic layer for poll collections
 * Handles collection creation, management, and wizard functionality
 */

const PollCollectionModel = require('../models/poll-collection.model');
const PollModel = require('../models/poll.model');
const PollOptionModel = require('../models/poll-option.model');
const PollResponseModel = require('../models/poll-response.model');
const PollContextModel = require('../models/poll-context.model');

class PollCollectionService {
  /**
   * Create a new poll collection
   *
   * @param {string} userId - User UUID
   * @param {Object} collectionData - Collection data
   * @returns {Promise<Object>} Created collection with polls
   * @throws {Error} If validation fails
   */
  static async createCollection(userId, collectionData) {
    const {
      title,
      description,
      poll_ids = [],
      is_public = true
    } = collectionData;

    // Validation
    if (!title || title.trim().length < 3) {
      throw new Error('Collection title must be at least 3 characters');
    }

    if (poll_ids.length === 0) {
      throw new Error('Collection must contain at least one poll');
    }

    if (poll_ids.length > 20) {
      throw new Error('Collection cannot contain more than 20 polls');
    }

    // Verify all polls exist and are accessible
    for (const pollId of poll_ids) {
      const poll = await PollModel.getById(pollId);
      if (!poll) {
        throw new Error(`Poll ${pollId} not found`);
      }
      if (poll.visibility !== 'public' && poll.user_id !== userId) {
        throw new Error(`Poll ${pollId} is not accessible`);
      }
    }

    // Create collection
    const collection = await PollCollectionModel.create({
      user_id: userId,
      title: title.trim(),
      description: description?.trim(),
      is_public
    }, poll_ids);

    // Fetch full details with polls, options, etc.
    return await this.getCollectionBySlug(collection.slug, userId);
  }

  /**
   * Get collection by slug with full details
   *
   * @param {string} slug - Collection slug
   * @param {string} userId - User UUID (optional)
   * @returns {Promise<Object>} Collection with polls and user progress
   * @throws {Error} If collection not found
   */
  static async getCollectionBySlug(slug, userId = null) {
    const collection = await PollCollectionModel.getBySlugWithPolls(slug, userId);

    if (!collection) {
      throw new Error('Collection not found');
    }

    // Check if collection is public or user has access
    if (!collection.is_public && collection.user_id !== userId) {
      throw new Error('Collection is private');
    }

    // Fetch options and user responses for each poll
    for (const poll of collection.polls) {
      const options = await PollOptionModel.getWithVoteCounts(poll.id);
      const totalVotes = poll.total_votes || 0;

      poll.options = options.map(opt => ({
        ...opt,
        vote_count: parseInt(opt.vote_count) || 0,
        percentage: totalVotes > 0 ? Math.round((parseInt(opt.vote_count) / totalVotes) * 100) : 0
      }));

      // Get poll contexts
      poll.contexts = await PollContextModel.getByPollIdWithBlocks(poll.id);

      // Get user's response if logged in
      if (userId) {
        poll.user_response = await PollResponseModel.getByUserAndPoll(poll.id, userId);
      }
    }

    return collection;
  }

  /**
   * Get collection summary (after completion)
   *
   * @param {string} slug - Collection slug
   * @param {string} userId - User UUID (required)
   * @returns {Promise<Object>} Summary with user responses and aggregate stats
   * @throws {Error} If collection not found or user not authenticated
   */
  static async getCollectionSummary(slug, userId) {
    if (!userId) {
      throw new Error('User must be authenticated to view summary');
    }

    const collection = await this.getCollectionBySlug(slug, userId);

    // Get user's responses for all polls in collection
    const userResponses = [];
    for (const poll of collection.polls) {
      const response = await PollResponseModel.getByUserAndPoll(poll.id, userId);
      if (response) {
        userResponses.push({
          poll_id: poll.id,
          question: poll.question,
          poll_type: poll.poll_type,
          user_vote: this.formatUserVote(poll, response),
          response_data: response
        });
      }
    }

    // Get aggregate statistics
    const stats = await PollCollectionModel.getStats(collection.id);

    // Calculate most popular choices for each poll
    const popularChoices = [];
    for (const poll of collection.polls) {
      if (poll.options && poll.options.length > 0) {
        const topOption = poll.options.reduce((max, opt) =>
          opt.vote_count > max.vote_count ? opt : max
        );

        popularChoices.push({
          poll_id: poll.id,
          question: poll.question,
          top_choice: topOption.label || topOption.option_text,
          percentage: topOption.percentage
        });
      }
    }

    return {
      collection: {
        id: collection.id,
        slug: collection.slug,
        title: collection.title,
        description: collection.description,
        total_polls: collection.total_polls
      },
      user_responses: userResponses,
      aggregate_stats: {
        ...stats,
        most_popular_choices: popularChoices
      }
    };
  }

  /**
   * Format user vote for display
   *
   * @param {Object} poll - Poll object
   * @param {Object} response - User response
   * @returns {string} Formatted vote
   */
  static formatUserVote(poll, response) {
    if (!response) return 'No response';

    switch (poll.poll_type) {
      case 'yesno':
      case 'multipleChoice':
      case 'likertScale':
      case 'agreementDistribution':
      case 'imageBased':
      case 'abcTest':
      case 'gamified':
        const option = poll.options?.find(opt => opt.id === response.option_id);
        return option?.label || option?.option_text || 'Unknown option';

      case 'slider':
      case 'predictionMarket':
        return `${response.numeric_value}${poll.config?.unit || ''}`;

      case 'ranking':
        return 'Ranking submitted';

      case 'openEnded':
        return response.text_response?.substring(0, 50) || 'Text response';

      case 'multiSelect':
        return `${response.option_ids?.length || 0} options selected`;

      case 'binaryWithExplanation':
        const binaryOption = poll.options?.find(opt => opt.id === response.option_id);
        return binaryOption?.label || binaryOption?.option_text || 'Unknown option';

      case 'mapBased':
      case 'timeline':
        return 'Response submitted';

      default:
        return 'Response submitted';
    }
  }

  /**
   * Update collection
   *
   * @param {string} collectionId - Collection UUID
   * @param {string} userId - User UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated collection
   * @throws {Error} If not authorized
   */
  static async updateCollection(collectionId, userId, updates) {
    const isOwner = await PollCollectionModel.isOwner(collectionId, userId);
    if (!isOwner) {
      throw new Error('Not authorized to update this collection');
    }

    return await PollCollectionModel.update(collectionId, updates);
  }

  /**
   * Delete collection
   *
   * @param {string} collectionId - Collection UUID
   * @param {string} userId - User UUID
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If not authorized
   */
  static async deleteCollection(collectionId, userId) {
    const isOwner = await PollCollectionModel.isOwner(collectionId, userId);
    if (!isOwner) {
      throw new Error('Not authorized to delete this collection');
    }

    return await PollCollectionModel.delete(collectionId);
  }

  /**
   * Get user's collections
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} User's collections with pagination
   */
  static async getUserCollections(userId, options = {}) {
    const { page = 1, limit = 20 } = options;

    const collections = await PollCollectionModel.getByUserId(userId, { page, limit });

    return {
      collections,
      pagination: {
        page,
        limit
      }
    };
  }

  /**
   * Add poll to collection
   *
   * @param {string} collectionId - Collection UUID
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID to add
   * @param {number} orderIndex - Optional order index
   * @returns {Promise<Object>} Updated collection
   * @throws {Error} If not authorized or poll not found
   */
  static async addPollToCollection(collectionId, userId, pollId, orderIndex = null) {
    const isOwner = await PollCollectionModel.isOwner(collectionId, userId);
    if (!isOwner) {
      throw new Error('Not authorized to modify this collection');
    }

    const poll = await PollModel.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }

    await PollCollectionModel.addPoll(collectionId, pollId, orderIndex);

    return await PollCollectionModel.getByIdWithPolls(collectionId, userId);
  }

  /**
   * Remove poll from collection
   *
   * @param {string} collectionId - Collection UUID
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID to remove
   * @returns {Promise<Object>} Updated collection
   * @throws {Error} If not authorized
   */
  static async removePollFromCollection(collectionId, userId, pollId) {
    const isOwner = await PollCollectionModel.isOwner(collectionId, userId);
    if (!isOwner) {
      throw new Error('Not authorized to modify this collection');
    }

    await PollCollectionModel.removePoll(collectionId, pollId);

    return await PollCollectionModel.getByIdWithPolls(collectionId, userId);
  }

  /**
   * Reorder polls in collection
   *
   * @param {string} collectionId - Collection UUID
   * @param {string} userId - User UUID
   * @param {Array} pollIds - Array of poll IDs in new order
   * @returns {Promise<Object>} Updated collection
   * @throws {Error} If not authorized
   */
  static async reorderPolls(collectionId, userId, pollIds) {
    const isOwner = await PollCollectionModel.isOwner(collectionId, userId);
    if (!isOwner) {
      throw new Error('Not authorized to modify this collection');
    }

    await PollCollectionModel.reorderPolls(collectionId, pollIds);

    return await PollCollectionModel.getByIdWithPolls(collectionId, userId);
  }

  /**
   * Auto-generate collection from context-linked polls
   *
   * @param {string} contextId - Context source UUID
   * @param {string} userId - User UUID (optional)
   * @returns {Promise<Object>} Auto-generated collection
   * @throws {Error} If context not found or no polls linked
   */
  static async generateCollectionFromContext(contextId, userId = null) {
    const ContextSourceModel = require('../models/context-source.model');

    const context = await ContextSourceModel.getByIdWithBlocks(contextId);
    if (!context) {
      throw new Error('Context source not found');
    }

    // Get all polls linked to this context
    const linkedPolls = await PollContextModel.getPollsBySourceId(contextId);

    if (linkedPolls.length === 0) {
      throw new Error('No polls linked to this context');
    }

    // Create temporary collection object (not saved to DB)
    const collection = {
      id: `context-${contextId}`,
      slug: `context-${context.id}`,
      title: `Polls about: ${context.title}`,
      description: context.summary,
      context_id: contextId,
      is_auto_generated: true,
      is_public: true,
      polls: [],
      total_polls: linkedPolls.length
    };

    // Fetch full poll details
    for (let i = 0; i < linkedPolls.length; i++) {
      const poll = linkedPolls[i];
      const fullPoll = await PollModel.getByIdWithAuthor(poll.id);

      if (fullPoll) {
        const options = await PollOptionModel.getWithVoteCounts(poll.id);
        const totalVotes = fullPoll.responses || 0;

        fullPoll.options = options.map(opt => ({
          ...opt,
          vote_count: parseInt(opt.vote_count) || 0,
          percentage: totalVotes > 0 ? Math.round((parseInt(opt.vote_count) / totalVotes) * 100) : 0
        }));

        fullPoll.order_index = i;

        if (userId) {
          fullPoll.user_response = await PollResponseModel.getByUserAndPoll(poll.id, userId);
        }

        collection.polls.push(fullPoll);
      }
    }

    // Calculate user progress if userId provided
    if (userId) {
      const completedPollIds = collection.polls
        .filter(p => p.user_response)
        .map(p => p.id);

      collection.user_progress = {
        completed_count: completedPollIds.length,
        total_count: collection.total_polls,
        completed_poll_ids: completedPollIds
      };
    }

    return collection;
  }
}

module.exports = PollCollectionService;
