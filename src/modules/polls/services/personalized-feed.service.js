/**
 * Personalized Feed Service
 *
 * Creates personalized poll feeds based on user preferences and behavior
 */

const pool = require('../../../db/pool');
const UserPreferenceModel = require('../../users/models/user-preference.model');
const PollModel = require('../models/poll.model');
const PollOptionModel = require('../models/poll-option.model');
const PollResponseModel = require('../models/poll-response.model');
const PollEngagementModel = require('../models/poll-engagement.model');

class PersonalizedFeedService {
  /**
   * Get personalized feed for user
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Feed options
   * @returns {Promise<Object>} Personalized feed with polls
   */
  static async getPersonalizedFeed(userId, options = {}) {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    // Get user preferences
    const preferences = await UserPreferenceModel.getFeedPreferences(userId);
    
    if (!preferences) {
      // Fallback to general feed for new users
      return await this.getGeneralFeed(userId, options);
    }

    // Get polls user has already seen
    const seenPolls = await UserPreferenceModel.getSeenPolls(userId, 7);

    let polls = [];
    
    switch (preferences.feed_algorithm) {
      case 'chronological':
        polls = await this.getChronologicalFeed(userId, preferences, seenPolls, limit, offset);
        break;
      case 'engagement':
        polls = await this.getEngagementFeed(userId, preferences, seenPolls, limit, offset);
        break;
      case 'personalized':
        polls = await this.getPersonalizedAlgorithmFeed(userId, preferences, seenPolls, limit, offset);
        break;
      case 'balanced':
      default:
        polls = await this.getBalancedFeed(userId, preferences, seenPolls, limit, offset);
        break;
    }

    // Record feed views
    for (let i = 0; i < polls.length; i++) {
      await UserPreferenceModel.recordFeedView(
        userId, 
        polls[i].id, 
        offset + i + 1, 
        preferences.feed_algorithm
      );
    }

    return {
      polls,
      algorithm: preferences.feed_algorithm,
      pagination: {
        page,
        limit,
        has_more: polls.length === limit
      }
    };
  }

  /**
   * Get balanced feed (mix of personalized, trending, and new)
   */
  static async getBalancedFeed(userId, preferences, seenPolls, limit, offset) {
    const personalizedCount = Math.ceil(limit * 0.6); // 60% personalized
    const trendingCount = Math.ceil(limit * 0.25);    // 25% trending
    const newCount = limit - personalizedCount - trendingCount; // 15% new

    const [personalizedPolls, trendingPolls, newPolls] = await Promise.all([
      this.getPersonalizedPolls(userId, preferences, seenPolls, personalizedCount, 0),
      this.getTrendingPolls(userId, preferences, seenPolls, trendingCount, 0),
      this.getNewPolls(userId, preferences, seenPolls, newCount, 0)
    ]);

    // Interleave the results for variety
    const allPolls = this.interleavePolls([
      { polls: personalizedPolls, weight: 3 },
      { polls: trendingPolls, weight: 2 },
      { polls: newPolls, weight: 1 }
    ]);

    return allPolls.slice(offset, offset + limit);
  }

  /**
   * Get personalized algorithm feed (heavily based on user interests)
   */
  static async getPersonalizedAlgorithmFeed(userId, preferences, seenPolls, limit, offset) {
    return await this.getPersonalizedPolls(userId, preferences, seenPolls, limit, offset);
  }

  /**
   * Get engagement-based feed (popular polls)
   */
  static async getEngagementFeed(userId, preferences, seenPolls, limit, offset) {
    return await this.getTrendingPolls(userId, preferences, seenPolls, limit, offset);
  }

  /**
   * Get chronological feed (newest first)
   */
  static async getChronologicalFeed(userId, preferences, seenPolls, limit, offset) {
    return await this.getNewPolls(userId, preferences, seenPolls, limit, offset);
  }

  /**
   * Get personalized polls based on user interests
   */
  static async getPersonalizedPolls(userId, preferences, seenPolls, limit, offset) {
    const seenPollsClause = seenPolls.length > 0 
      ? `AND p.id NOT IN (${seenPolls.map((_, i) => `$${i + 15}`).join(',')})`
      : '';

    const result = await pool.query(
      `WITH user_scores AS (
        SELECT 
          p.*,
          s.responses, s.comments, s.likes, s.shares, s.reposts, s.views,
          u.id as author_id, u.email, prof.first_name, prof.last_name, prof.profile_photo_url as profile_photo,
          -- Calculate personalization score
          (
            -- Category interest score
            CASE WHEN p.category = ANY($1::text[]) THEN 10.0 ELSE 0.0 END +
            CASE WHEN p.category = ANY($2::text[]) THEN 5.0 ELSE 0.0 END +
            -- Poll type interest score  
            CASE WHEN p.poll_type = ANY($3::text[]) THEN 8.0 ELSE 0.0 END +
            CASE WHEN p.poll_type = ANY($4::text[]) THEN 4.0 ELSE 0.0 END +
            -- Engagement boost
            (COALESCE(s.responses, 0) * 0.1 + COALESCE(s.comments, 0) * 0.3 + COALESCE(s.likes, 0) * 0.05) +
            -- Recency boost (newer polls get slight boost)
            GREATEST(0, 5.0 - EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 86400) +
            -- Quality indicators
            CASE WHEN COALESCE(s.responses, 0) >= $5 THEN 2.0 ELSE 0.0 END +
            CASE WHEN COALESCE(s.comments, 0) >= $6 THEN 3.0 ELSE 0.0 END
          ) as personalization_score
        FROM polls p
        LEFT JOIN poll_stats s ON p.id = s.poll_id
        JOIN users u ON p.user_id = u.id
        LEFT JOIN profiles prof ON u.id = prof.user_id
        WHERE p.deleted_at IS NULL
          AND p.visibility = 'public'
          AND p.status = 'active'
          AND p.user_id != $7
          AND ($8 = true OR p.category NOT ILIKE '%controversial%')
          AND ($9 = false OR p.category != ANY($10::text[]))
          AND ($11 = false OR p.poll_type != ANY($12::text[]))
          AND COALESCE(s.responses, 0) >= $13
          AND COALESCE(s.comments, 0) >= $14
          ${seenPollsClause}
      )
      SELECT * FROM user_scores
      WHERE personalization_score > 0
      ORDER BY personalization_score DESC, created_at DESC
      LIMIT $${seenPolls.length + 15} OFFSET $${seenPolls.length + 16}`,
      [
        preferences.preferred_categories || [],           // $1
        preferences.top_category_interests || [],         // $2
        preferences.preferred_poll_types || [],           // $3
        preferences.top_poll_type_interests || [],        // $4
        preferences.min_responses || 0,                   // $5
        preferences.min_comments || 0,                    // $6
        userId,                                           // $7
        preferences.show_controversial !== false,         // $8
        preferences.blocked_categories?.length > 0,       // $9
        preferences.blocked_categories || [],             // $10
        preferences.blocked_poll_types?.length > 0,       // $11
        preferences.blocked_poll_types || [],             // $12
        preferences.min_responses || 0,                   // $13
        preferences.min_comments || 0,                    // $14
        ...seenPolls,                                     // $15+
        limit,                                            // Last - 1
        offset                                            // Last
      ]
    );

    return await this.enrichPollsWithOptions(result.rows, userId);
  }

  /**
   * Get trending polls
   */
  static async getTrendingPolls(userId, preferences, seenPolls, limit, offset) {
    const seenPollsClause = seenPolls.length > 0 
      ? `AND p.id NOT IN (${seenPolls.map((_, i) => `$${i + 10}`).join(',')})`
      : '';

    const result = await pool.query(
      `SELECT 
        p.*,
        s.responses, s.comments, s.likes, s.shares, s.reposts, s.views,
        u.id as author_id, u.email, prof.first_name, prof.last_name, prof.profile_photo_url as profile_photo,
        (COALESCE(s.responses, 0) + COALESCE(s.comments, 0) * 2 + COALESCE(s.likes, 0) + COALESCE(s.shares, 0) * 3) /
          GREATEST(1, EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600) as trending_score
      FROM polls p
      LEFT JOIN poll_stats s ON p.id = s.poll_id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      WHERE p.deleted_at IS NULL
        AND p.visibility = 'public'
        AND p.status = 'active'
        AND p.user_id != $1
        AND p.created_at > NOW() - INTERVAL '7 days'
        AND ($2 = true OR p.category NOT ILIKE '%controversial%')
        AND ($3 = false OR p.category != ANY($4::text[]))
        AND ($5 = false OR p.poll_type != ANY($6::text[]))
        AND COALESCE(s.responses, 0) >= $7
        AND COALESCE(s.comments, 0) >= $8
        ${seenPollsClause}
      ORDER BY trending_score DESC, p.created_at DESC
      LIMIT $${seenPolls.length + 10} OFFSET $${seenPolls.length + 11}`,
      [
        userId,                                           // $1
        preferences.show_controversial !== false,         // $2
        preferences.blocked_categories?.length > 0,       // $3
        preferences.blocked_categories || [],             // $4
        preferences.blocked_poll_types?.length > 0,       // $5
        preferences.blocked_poll_types || [],             // $6
        preferences.min_responses || 0,                   // $7
        preferences.min_comments || 0,                    // $8
        ...seenPolls,                                     // $9+
        limit,                                            // Last - 1
        offset                                            // Last
      ]
    );

    return await this.enrichPollsWithOptions(result.rows, userId);
  }

  /**
   * Get new polls
   */
  static async getNewPolls(userId, preferences, seenPolls, limit, offset) {
    const seenPollsClause = seenPolls.length > 0 
      ? `AND p.id NOT IN (${seenPolls.map((_, i) => `$${i + 9}`).join(',')})`
      : '';

    const result = await pool.query(
      `SELECT 
        p.*,
        s.responses, s.comments, s.likes, s.shares, s.reposts, s.views,
        u.id as author_id, u.email, prof.first_name, prof.last_name, prof.profile_photo_url as profile_photo
      FROM polls p
      LEFT JOIN poll_stats s ON p.id = s.poll_id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      WHERE p.deleted_at IS NULL
        AND p.visibility = 'public'
        AND p.status = 'active'
        AND p.user_id != $1
        AND ($2 = true OR p.category NOT ILIKE '%controversial%')
        AND ($3 = false OR p.category != ANY($4::text[]))
        AND ($5 = false OR p.poll_type != ANY($6::text[]))
        AND COALESCE(s.responses, 0) >= $7
        AND COALESCE(s.comments, 0) >= $8
        ${seenPollsClause}
      ORDER BY p.created_at DESC
      LIMIT $${seenPolls.length + 9} OFFSET $${seenPolls.length + 10}`,
      [
        userId,                                           // $1
        preferences.show_controversial !== false,         // $2
        preferences.blocked_categories?.length > 0,       // $3
        preferences.blocked_categories || [],             // $4
        preferences.blocked_poll_types?.length > 0,       // $5
        preferences.blocked_poll_types || [],             // $6
        preferences.min_responses || 0,                   // $7
        preferences.min_comments || 0,                    // $8
        ...seenPolls,                                     // $9+
        limit,                                            // Last - 1
        offset                                            // Last
      ]
    );

    return await this.enrichPollsWithOptions(result.rows, userId);
  }

  /**
   * Get general feed for users without preferences
   */
  static async getGeneralFeed(userId, options) {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT 
        p.*,
        s.responses, s.comments, s.likes, s.shares, s.reposts, s.views,
        u.id as author_id, u.email, prof.first_name, prof.last_name, prof.profile_photo_url as profile_photo,
        (COALESCE(s.responses, 0) + COALESCE(s.comments, 0) * 2 + COALESCE(s.likes, 0)) as engagement_score
      FROM polls p
      LEFT JOIN poll_stats s ON p.id = s.poll_id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      WHERE p.deleted_at IS NULL
        AND p.visibility = 'public'
        AND p.status = 'active'
        AND p.user_id != $1
      ORDER BY engagement_score DESC, p.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const polls = await this.enrichPollsWithOptions(result.rows, userId);

    return {
      polls,
      algorithm: 'general',
      pagination: {
        page,
        limit,
        has_more: polls.length === limit
      }
    };
  }

  /**
   * Enrich polls with options and user interactions
   */
  static async enrichPollsWithOptions(polls, userId) {
    for (const poll of polls) {
      // Get poll options
      const options = await PollOptionModel.getWithVoteCounts(poll.id);
      const totalVotes = poll.responses || 0;

      poll.options = options.map(opt => ({
        ...opt,
        vote_count: parseInt(opt.vote_count) || 0,
        percentage: totalVotes > 0 ? Math.round((parseInt(opt.vote_count) / totalVotes) * 100) : 0
      }));

      // Get user's response and engagements
      if (userId) {
        poll.user_response = await PollResponseModel.getByUserAndPoll(poll.id, userId);
        poll.user_engagements = await PollEngagementModel.getUserEngagements(poll.id, userId);
      }
    }

    return polls;
  }

  /**
   * Interleave multiple poll arrays with weights
   */
  static interleavePolls(pollGroups) {
    const result = [];
    const maxLength = Math.max(...pollGroups.map(group => group.polls.length));
    
    for (let i = 0; i < maxLength; i++) {
      for (const group of pollGroups) {
        for (let w = 0; w < group.weight && group.polls[i]; w++) {
          if (group.polls[i] && !result.find(p => p.id === group.polls[i].id)) {
            result.push(group.polls[i]);
          }
        }
      }
    }

    return result;
  }

  /**
   * Update user interests based on poll interaction
   */
  static async updateUserInterests(userId, poll, interactionType, interactionStrength = 1.0) {
    const baseScore = interactionStrength;
    
    // Update category interest
    if (poll.category) {
      await UserPreferenceModel.updateInterest(
        userId, 
        'category', 
        poll.category, 
        baseScore * this.getInteractionMultiplier(interactionType)
      );
    }

    // Update poll type interest
    if (poll.poll_type) {
      await UserPreferenceModel.updateInterest(
        userId, 
        'poll_type', 
        poll.poll_type, 
        baseScore * this.getInteractionMultiplier(interactionType)
      );
    }

    // Update author interest (for follows/frequent interactions)
    if (interactionType === 'follow' || interactionType === 'frequent_interaction') {
      await UserPreferenceModel.updateInterest(
        userId, 
        'author', 
        poll.user_id, 
        baseScore * 2.0
      );
    }
  }

  /**
   * Get interaction multiplier for different interaction types
   */
  static getInteractionMultiplier(interactionType) {
    const multipliers = {
      'view': 0.1,
      'like': 0.5,
      'comment': 2.0,
      'vote': 1.5,
      'share': 2.5,
      'bookmark': 1.8,
      'follow': 3.0,
      'frequent_interaction': 1.2
    };

    return multipliers[interactionType] || 1.0;
  }
}

module.exports = PersonalizedFeedService;