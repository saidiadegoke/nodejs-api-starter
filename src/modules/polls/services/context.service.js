/**
 * Context Service
 *
 * Business logic layer for poll context/evidence
 * Handles context source creation, linking to polls, and engagement tracking
 */

const ContextSourceModel = require('../models/context-source.model');
const ContextBlockModel = require('../models/context-block.model');
const PollContextModel = require('../models/poll-context.model');
const ContextEngagementModel = require('../models/context-engagement.model');
const PollModel = require('../models/poll.model');

class ContextService {
  /**
   * Create a new context source with blocks
   *
   * @param {string} userId - User UUID
   * @param {Object} sourceData - Source data including blocks
   * @returns {Promise<Object>} Created source with blocks
   * @throws {Error} If validation fails
   */
  static async createContextSource(userId, sourceData) {
    const {
      source_type,
      title,
      summary,
      author,
      publisher,
      source_url,
      publication_date,
      credibility_score,
      tags = [],
      blocks = [],
      not_for_feed = false
    } = sourceData;

    // Validation
    if (!source_type) {
      throw new Error('Source type is required');
    }

    const validSourceTypes = [
      'research', 'news_article', 'blog_post', 'whitepaper',
      'dataset', 'report', 'story', 'study', 'survey'
    ];

    if (!validSourceTypes.includes(source_type)) {
      throw new Error(`Invalid source type. Must be one of: ${validSourceTypes.join(', ')}`);
    }

    if (!title || title.trim().length < 5) {
      throw new Error('Title must be at least 5 characters');
    }

    // Validate blocks content
    if (blocks && blocks.length > 0) {
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (!block.content || block.content.trim().length === 0) {
          throw new Error(`Block ${i + 1} content is required`);
        }
        
        // For text and quote blocks, validate HTML content
        if (['text', 'quote'].includes(block.block_type)) {
          const textContent = block.content.replace(/<[^>]*>/g, '').trim();
          if (textContent.length === 0) {
            throw new Error(`Block ${i + 1} must contain some text content`);
          }
          if (textContent.length > 5000) {
            throw new Error(`Block ${i + 1} cannot exceed 5000 characters`);
          }
        }
      }
    }

    if (credibility_score !== undefined && credibility_score !== null) {
      if (credibility_score < 0 || credibility_score > 10) {
        throw new Error('Credibility score must be between 0 and 10');
      }
    }

    // Create source
    const source = await ContextSourceModel.create({
      source_type,
      title,
      summary,
      author,
      publisher,
      source_url,
      publication_date,
      credibility_score,
      tags,
      created_by: userId,
      not_for_feed
    });

    // Create blocks if provided
    let createdBlocks = [];
    if (blocks.length > 0) {
      createdBlocks = await ContextBlockModel.createBulk(source.id, blocks);
    }

    return {
      ...source,
      blocks: createdBlocks
    };
  }

  /**
   * Get context source by ID with blocks
   *
   * @param {string} sourceId - Source UUID
   * @returns {Promise<Object>} Source with blocks
   * @throws {Error} If source not found
   */
  static async getContextSourceById(sourceId) {
    const source = await ContextSourceModel.getByIdWithBlocks(sourceId);

    if (!source) {
      throw new Error('Context source not found');
    }

    return source;
  }

  /**
   * Update context source
   *
   * @param {string} sourceId - Source UUID
   * @param {string} userId - User UUID (for permission check)
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated source
   * @throws {Error} If source not found or user not authorized
   */
  static async updateContextSource(sourceId, userId, updates) {
    const source = await ContextSourceModel.getById(sourceId);

    if (!source) {
      throw new Error('Context source not found');
    }

    // Check ownership
    if (source.created_by !== userId) {
      throw new Error('You are not authorized to update this context source');
    }

    const updatedSource = await ContextSourceModel.update(sourceId, updates);

    return updatedSource;
  }

  /**
   * Delete context source
   *
   * @param {string} sourceId - Source UUID
   * @param {string} userId - User UUID (for permission check)
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If source not found or user not authorized
   */
  static async deleteContextSource(sourceId, userId) {
    const source = await ContextSourceModel.getById(sourceId);

    if (!source) {
      throw new Error('Context source not found');
    }

    // Check ownership
    if (source.created_by !== userId) {
      throw new Error('You are not authorized to delete this context source');
    }

    const deleted = await ContextSourceModel.delete(sourceId);

    return deleted;
  }

  /**
   * Link context source to poll
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID (for permission check)
   * @param {Object} linkData - Link configuration
   * @returns {Promise<Object>} Created link
   * @throws {Error} If poll not found or user not authorized
   */
  static async linkContextToPoll(pollId, userId, linkData) {
    const { source_id, display_position, is_required, order_index } = linkData;

    // Check poll exists and user owns it
    const poll = await PollModel.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }

    if (poll.user_id !== userId) {
      throw new Error('You are not authorized to modify this poll');
    }

    // Check source exists
    const source = await ContextSourceModel.getById(source_id);
    if (!source) {
      throw new Error('Context source not found');
    }

    // Validate display_position
    const validPositions = ['pre_poll', 'inline', 'post_poll', 'on_demand'];
    if (display_position && !validPositions.includes(display_position)) {
      throw new Error(`Invalid display position. Must be one of: ${validPositions.join(', ')}`);
    }

    // Create link
    const link = await PollContextModel.create({
      poll_id: pollId,
      source_id,
      display_position: display_position || 'pre_poll',
      is_required: is_required || false,
      order_index: order_index || 0
    });

    return link;
  }

  /**
   * Get contexts for a poll
   *
   * @param {string} pollId - Poll UUID
   * @param {boolean} includeBlocks - Whether to include blocks
   * @returns {Promise<Array>} Array of context sources
   */
  static async getPollContexts(pollId, includeBlocks = true) {
    const poll = await PollModel.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }

    if (includeBlocks) {
      return await PollContextModel.getByPollIdWithBlocks(pollId);
    } else {
      return await PollContextModel.getByPollId(pollId);
    }
  }

  /**
   * Get required contexts for a poll
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Array>} Array of required context sources
   */
  static async getRequiredPollContexts(pollId) {
    return await PollContextModel.getRequiredByPollId(pollId);
  }

  /**
   * Remove context from poll
   *
   * @param {string} pollId - Poll UUID
   * @param {string} sourceId - Source UUID
   * @param {string} userId - User UUID (for permission check)
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If poll not found or user not authorized
   */
  static async unlinkContextFromPoll(pollId, sourceId, userId) {
    // Check poll exists and user owns it
    const poll = await PollModel.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }

    if (poll.user_id !== userId) {
      throw new Error('You are not authorized to modify this poll');
    }

    const deleted = await PollContextModel.delete(pollId, sourceId);

    if (!deleted) {
      throw new Error('Context link not found');
    }

    return true;
  }

  /**
   * Record context engagement
   *
   * @param {Object} engagementData - Engagement data
   * @returns {Promise<Object>} Created engagement
   */
  static async recordEngagement(engagementData) {
    const {
      source_id,
      poll_id,
      user_id,
      engagement_type,
      duration_seconds,
      scroll_percentage,
      metadata = {}
    } = engagementData;

    // Validate engagement type
    const validTypes = [
      'view', 'scroll_complete', 'click_source',
      'expand', 'download', 'share'
    ];

    if (!validTypes.includes(engagement_type)) {
      throw new Error(`Invalid engagement type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Check source exists
    const source = await ContextSourceModel.getById(source_id);
    if (!source) {
      throw new Error('Context source not found');
    }

    // Validate scroll_percentage if provided
    if (scroll_percentage !== undefined && scroll_percentage !== null) {
      if (scroll_percentage < 0 || scroll_percentage > 100) {
        throw new Error('Scroll percentage must be between 0 and 100');
      }
    }

    const engagement = await ContextEngagementModel.create({
      source_id,
      poll_id,
      user_id,
      engagement_type,
      duration_seconds,
      scroll_percentage,
      metadata
    });

    return engagement;
  }

  /**
   * Get engagement summary for a source
   *
   * @param {string} sourceId - Source UUID
   * @returns {Promise<Object>} Engagement summary
   */
  static async getSourceEngagementSummary(sourceId) {
    const source = await ContextSourceModel.getById(sourceId);
    if (!source) {
      throw new Error('Context source not found');
    }

    const summary = await ContextEngagementModel.getSummaryBySourceId(sourceId);
    const breakdown = await ContextEngagementModel.getBreakdownBySourceId(sourceId);

    return {
      source_id: sourceId,
      source_title: source.title,
      ...summary,
      engagement_breakdown: breakdown
    };
  }

  /**
   * Get engagement summary for a poll's contexts
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object>} Engagement summary
   */
  static async getPollContextEngagementSummary(pollId) {
    const poll = await PollModel.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }

    const summary = await ContextEngagementModel.getSummaryByPollId(pollId);

    return {
      poll_id: pollId,
      ...summary
    };
  }

  /**
   * Check if user has completed required contexts for a poll
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object>} Completion status
   */
  static async checkRequiredContextsCompletion(userId, pollId) {
    const requiredContexts = await PollContextModel.getRequiredByPollId(pollId);

    if (requiredContexts.length === 0) {
      return {
        has_required_contexts: false,
        all_completed: true,
        completed_count: 0,
        total_required: 0
      };
    }

    let completedCount = 0;
    const contextStatuses = [];

    for (const context of requiredContexts) {
      const hasCompleted = await ContextEngagementModel.hasUserCompleted(
        userId,
        context.source_id
      );

      if (hasCompleted) {
        completedCount++;
      }

      contextStatuses.push({
        source_id: context.source_id,
        title: context.title,
        completed: hasCompleted
      });
    }

    return {
      has_required_contexts: true,
      all_completed: completedCount === requiredContexts.length,
      completed_count: completedCount,
      total_required: requiredContexts.length,
      context_statuses: contextStatuses
    };
  }

  /**
   * Search context sources with comprehensive filtering
   *
   * @param {string} query - Search query
   * @param {Object} filters - Filter options
   * @param {Object} pagination - Pagination options
   * @param {Object} sorting - Sorting options
   * @returns {Promise<Object>} Sources with pagination
   */
  static async searchContextSources(query, filters = {}, pagination = {}, sorting = {}) {
    const { page = 1, limit = 20 } = pagination;
    const { 
      source_type, 
      tags, 
      author, 
      publisher,
      credibility_min,
      credibility_max,
      date_from,
      date_to
    } = filters;
    const { sort_by = 'created_at', sort_order = 'desc' } = sorting;

    // Build comprehensive search parameters
    const searchParams = {
      query: query && query.trim().length > 0 ? query.trim() : undefined,
      source_type,
      tags,
      author,
      publisher,
      credibility_min,
      credibility_max,
      date_from,
      date_to,
      sort_by,
      sort_order,
      page,
      limit
    };

    // Use enhanced search method
    const sources = await ContextSourceModel.searchWithFilters(searchParams);
    const total = await ContextSourceModel.getCountWithFilters(searchParams);

    return {
      sources,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Add blocks to a context source
   *
   * @param {string} sourceId - Source UUID
   * @param {string} userId - User UUID (for permission check)
   * @param {Array} blocks - Array of block data
   * @returns {Promise<Array>} Created blocks
   * @throws {Error} If source not found or user not authorized
   */
  static async addBlocksToSource(sourceId, userId, blocks) {
    const source = await ContextSourceModel.getById(sourceId);

    if (!source) {
      throw new Error('Context source not found');
    }

    // Check ownership
    if (source.created_by !== userId) {
      throw new Error('You are not authorized to modify this context source');
    }

    // Validate blocks
    const validBlockTypes = [
      'text', 'quote', 'image', 'chart', 'video',
      'dataset_preview', 'statistic', 'key_finding', 'methodology'
    ];

    for (const block of blocks) {
      if (!block.block_type || !validBlockTypes.includes(block.block_type)) {
        throw new Error(`Invalid block type. Must be one of: ${validBlockTypes.join(', ')}`);
      }
    }

    const createdBlocks = await ContextBlockModel.createBulk(sourceId, blocks);

    return createdBlocks;
  }

  /**
   * Update context block
   *
   * @param {string} blockId - Block UUID
   * @param {string} userId - User UUID (for permission check)
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated block
   * @throws {Error} If block not found or user not authorized
   */
  static async updateContextBlock(blockId, userId, updates) {
    const block = await ContextBlockModel.getById(blockId);

    if (!block) {
      throw new Error('Context block not found');
    }

    // Check source ownership
    const source = await ContextSourceModel.getById(block.source_id);
    if (!source || source.created_by !== userId) {
      throw new Error('You are not authorized to modify this context block');
    }

    const updatedBlock = await ContextBlockModel.update(blockId, updates);

    return updatedBlock;
  }

  /**
   * Delete context block
   *
   * @param {string} blockId - Block UUID
   * @param {string} userId - User UUID (for permission check)
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If block not found or user not authorized
   */
  static async deleteContextBlock(blockId, userId) {
    const block = await ContextBlockModel.getById(blockId);

    if (!block) {
      throw new Error('Context block not found');
    }

    // Check source ownership
    const source = await ContextSourceModel.getById(block.source_id);
    if (!source || source.created_by !== userId) {
      throw new Error('You are not authorized to delete this context block');
    }

    const deleted = await ContextBlockModel.delete(blockId);

    return deleted;
  }

  /**
   * Get polls that use a context source
   *
   * @param {string} sourceId - Source UUID
   * @returns {Promise<Array>} Array of polls using this context with full details
   * @throws {Error} If source not found
   */
  static async getPollsBySourceId(sourceId) {
    // Verify source exists
    const source = await ContextSourceModel.getById(sourceId);
    if (!source) {
      throw new Error('Context source not found');
    }

    // Get polls using this source (includes author and stats)
    const polls = await PollContextModel.getPollsBySourceId(sourceId);

    // Fetch options with vote counts for each poll
    const PollOptionModel = require('../models/poll-option.model');
    const PollResponseModel = require('../models/poll-response.model');
    const ResponseFormatter = require('../utils/response-formatter');

    for (const poll of polls) {
      // Get poll options with vote counts
      const options = await PollOptionModel.getWithVoteCounts(poll.id);
      const totalVotes = poll.responses || 0;

      // Add percentage to each option
      poll.options = options.map(opt => ({
        ...opt,
        vote_count: parseInt(opt.vote_count) || 0,
        percentage: totalVotes > 0 ? Math.round((parseInt(opt.vote_count) / totalVotes) * 100) : 0
      }));

      // For slider and prediction market polls, calculate aggregate statistics
      if (poll.poll_type === 'slider' || poll.poll_type === 'predictionMarket') {
        const allResponses = await PollResponseModel.getByPollId(poll.id, { page: 1, limit: 10000 });
        poll.aggregate_stats = ResponseFormatter.aggregateNumeric(allResponses, poll);
      }

      // Get poll contexts (for display)
      poll.contexts = await PollContextModel.getByPollIdWithBlocks(poll.id);
    }

    return polls;
  }
}

module.exports = ContextService;
