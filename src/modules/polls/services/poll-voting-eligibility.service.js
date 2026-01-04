/**
 * Poll Voting Eligibility Service
 *
 * Business logic layer for checking voting eligibility based on:
 * - Voting schedule (absolute date/time windows)
 * - Day of week restrictions
 * - Time of day restrictions
 * - Vote frequency limits
 */

const pool = require('../../../db/pool');

class VotingEligibilityService {
  /**
   * Check if user can vote on poll based on all restrictions
   * Uses the PostgreSQL can_vote_on_poll() function
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @param {Date} checkTime - Time to check (defaults to now)
   * @returns {Promise<Object>} Eligibility result
   * @example
   * {
   *   allowed: true,
   *   reason: 'You can vote on this poll',
   *   nextAvailableAt: null
   * }
   */
  static async canUserVote(pollId, userId, checkTime = null) {
    try {
      const query = `
        SELECT can_vote, reason, next_available_at
        FROM can_vote_on_poll($1, $2, $3)
      `;

      const params = [pollId, userId, checkTime || new Date()];
      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        return {
          allowed: false,
          reason: 'Unable to check voting eligibility',
          nextAvailableAt: null
        };
      }

      const row = result.rows[0];
      return {
        allowed: row.can_vote,
        reason: row.reason,
        nextAvailableAt: row.next_available_at
      };
    } catch (error) {
      console.error('Error checking voting eligibility:', error);
      throw new Error('Failed to check voting eligibility');
    }
  }

  /**
   * Record a vote in the history table
   * Note: This is typically handled automatically by the database trigger
   * This method is here for manual recording if needed
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @param {string} responseId - Poll response UUID
   * @returns {Promise<Object>} Created vote history record
   */
  static async recordVote(pollId, userId, responseId) {
    try {
      const query = `
        INSERT INTO user_vote_history (poll_id, user_id, response_id, voted_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING *
      `;

      const params = [pollId, userId, responseId];
      const result = await pool.query(query, params);

      return result.rows[0];
    } catch (error) {
      console.error('Error recording vote history:', error);
      throw new Error('Failed to record vote history');
    }
  }

  /**
   * Get user's voting history for a specific poll
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @param {Object} options - Query options
   * @param {Date} options.since - Only get votes since this date
   * @param {number} options.limit - Maximum number of records to return
   * @returns {Promise<Array>} Array of vote history records
   */
  static async getUserVoteHistory(pollId, userId, options = {}) {
    try {
      const { since, limit } = options;

      let query = `
        SELECT *
        FROM user_vote_history
        WHERE poll_id = $1 AND user_id = $2
      `;

      const params = [pollId, userId];
      let paramIndex = 3;

      if (since) {
        query += ` AND voted_at >= $${paramIndex}`;
        params.push(since);
        paramIndex++;
      }

      query += ` ORDER BY voted_at DESC`;

      if (limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(limit);
      }

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error getting vote history:', error);
      throw new Error('Failed to get vote history');
    }
  }

  /**
   * Get vote count for a user on a poll within a time period
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @param {Date} since - Start of time period
   * @returns {Promise<number>} Number of votes in period
   */
  static async getVoteCountInPeriod(pollId, userId, since) {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM user_vote_history
        WHERE poll_id = $1 AND user_id = $2 AND voted_at >= $3
      `;

      const params = [pollId, userId, since];
      const result = await pool.query(query, params);

      return parseInt(result.rows[0].count) || 0;
    } catch (error) {
      console.error('Error getting vote count:', error);
      throw new Error('Failed to get vote count');
    }
  }

  /**
   * Check if a poll has voting schedule restrictions
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object>} Poll voting schedule settings
   */
  static async getPollVotingSchedule(pollId) {
    try {
      const query = `
        SELECT
          voting_starts_at,
          voting_ends_at,
          voting_days_of_week,
          voting_time_start,
          voting_time_end,
          allow_revote,
          vote_frequency_type,
          vote_frequency_value,
          created_at,
          expires_at
        FROM polls
        WHERE id = $1
      `;

      const result = await pool.query(query, [pollId]);

      if (result.rows.length === 0) {
        throw new Error('Poll not found');
      }

      const poll = result.rows[0];

      return {
        votingStartsAt: poll.voting_starts_at,
        votingEndsAt: poll.voting_ends_at,
        votingDaysOfWeek: poll.voting_days_of_week,
        votingTimeStart: poll.voting_time_start,
        votingTimeEnd: poll.voting_time_end,
        allowRevote: poll.allow_revote,
        voteFrequencyType: poll.vote_frequency_type,
        voteFrequencyValue: poll.vote_frequency_value,
        // Effective voting window (with fallbacks)
        effectiveStartsAt: poll.voting_starts_at || poll.created_at,
        effectiveEndsAt: poll.voting_ends_at || poll.expires_at
      };
    } catch (error) {
      console.error('Error getting poll voting schedule:', error);
      // Preserve "Poll not found" error
      if (error.message === 'Poll not found') {
        throw error;
      }
      throw new Error('Failed to get poll voting schedule');
    }
  }

  /**
   * Get detailed eligibility information for display to user
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} Detailed eligibility information
   */
  static async getDetailedEligibility(pollId, userId) {
    try {
      // Get voting eligibility
      const eligibility = await this.canUserVote(pollId, userId);

      // Get voting schedule
      const schedule = await this.getPollVotingSchedule(pollId);

      // Get user's vote history if frequency type is not 'once' or 'unlimited'
      let voteCount = 0;
      if (schedule.voteFrequencyType !== 'once' && schedule.voteFrequencyType !== 'unlimited') {
        const since = this.getTimePeriodStart(schedule.voteFrequencyType);
        voteCount = await this.getVoteCountInPeriod(pollId, userId, since);
      }

      return {
        ...eligibility,
        schedule,
        voteCount,
        votesRemaining: schedule.voteFrequencyValue - voteCount
      };
    } catch (error) {
      console.error('Error getting detailed eligibility:', error);
      // Preserve "Poll not found" error
      if (error.message === 'Poll not found') {
        throw error;
      }
      throw new Error('Failed to get detailed eligibility');
    }
  }

  /**
   * Calculate the start of a time period based on frequency type
   *
   * @param {string} frequencyType - hourly, daily, weekly, monthly
   * @returns {Date} Start of the time period
   */
  static getTimePeriodStart(frequencyType) {
    const now = new Date();

    switch (frequencyType) {
      case 'hourly':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case 'daily':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'monthly':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return now;
    }
  }

  /**
   * Delete old vote history records (for cleanup)
   *
   * @param {number} daysToKeep - Number of days of history to keep
   * @returns {Promise<number>} Number of records deleted
   */
  static async cleanupOldVoteHistory(daysToKeep = 365) {
    try {
      const query = `
        DELETE FROM user_vote_history
        WHERE voted_at < NOW() - INTERVAL '${daysToKeep} days'
        RETURNING id
      `;

      const result = await pool.query(query);
      return result.rowCount;
    } catch (error) {
      console.error('Error cleaning up vote history:', error);
      throw new Error('Failed to cleanup vote history');
    }
  }
}

module.exports = VotingEligibilityService;
