const { sendSuccess, sendError } = require('../../../shared/utils/response');
const analyticsService = require('../services/analytics.service');

/**
 * Get platform statistics
 * @route GET /analytics/platform-stats
 * @access Requires 'analytics.view' permission
 */
const getPlatformStats = async (req, res) => {
  try {
    const stats = await analyticsService.getPlatformStats();
    sendSuccess(res, stats, 'Platform statistics retrieved successfully');
  } catch (error) {
    console.error('Error getting platform stats:', error);
    sendError(res, 'Failed to retrieve platform statistics', 500);
  }
};

/**
 * Get user engagement metrics
 * @route GET /analytics/user-engagement
 * @access Requires 'analytics.view' permission
 */
const getUserEngagement = async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    const engagement = await analyticsService.getUserEngagement(timeframe);
    sendSuccess(res, engagement, 'User engagement metrics retrieved successfully');
  } catch (error) {
    console.error('Error getting user engagement:', error);
    sendError(res, 'Failed to retrieve user engagement metrics', 500);
  }
};

/**
 * Get poll performance analytics
 * @route GET /analytics/poll-performance
 * @access Requires 'analytics.view' permission
 */
const getPollPerformance = async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    const performance = await analyticsService.getPollPerformance(timeframe);
    sendSuccess(res, performance, 'Poll performance analytics retrieved successfully');
  } catch (error) {
    console.error('Error getting poll performance:', error);
    sendError(res, 'Failed to retrieve poll performance analytics', 500);
  }
};

/**
 * Get content analytics
 * @route GET /analytics/content-stats
 * @access Requires 'analytics.view' permission
 */
const getContentStats = async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    const stats = await analyticsService.getContentStats(timeframe);
    sendSuccess(res, stats, 'Content statistics retrieved successfully');
  } catch (error) {
    console.error('Error getting content stats:', error);
    sendError(res, 'Failed to retrieve content statistics', 500);
  }
};

/**
 * Get trending topics
 * @route GET /analytics/trending-topics
 * @access Requires 'analytics.view' permission
 */
const getTrendingTopics = async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    const topics = await analyticsService.getTrendingTopics(timeframe);
    sendSuccess(res, topics, 'Trending topics retrieved successfully');
  } catch (error) {
    console.error('Error getting trending topics:', error);
    sendError(res, 'Failed to retrieve trending topics', 500);
  }
};

/**
 * Get growth metrics over time
 * @route GET /analytics/growth-metrics
 * @access Requires 'analytics.view' permission
 */
const getGrowthMetrics = async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    const metrics = await analyticsService.getGrowthMetrics(timeframe);
    sendSuccess(res, metrics, 'Growth metrics retrieved successfully');
  } catch (error) {
    console.error('Error getting growth metrics:', error);
    sendError(res, 'Failed to retrieve growth metrics', 500);
  }
};

/**
 * Get top performing content
 * @route GET /analytics/top-content
 * @access Requires 'analytics.view' permission
 */
const getTopContent = async (req, res) => {
  try {
    const { timeframe = '30d', limit = 10 } = req.query;
    const content = await analyticsService.getTopContent(timeframe, parseInt(limit));
    sendSuccess(res, content, 'Top content retrieved successfully');
  } catch (error) {
    console.error('Error getting top content:', error);
    sendError(res, 'Failed to retrieve top content', 500);
  }
};

/**
 * Get user retention metrics
 * @route GET /analytics/user-retention
 * @access Requires 'analytics.view' permission
 */
const getUserRetention = async (req, res) => {
  try {
    const retention = await analyticsService.getUserRetention();
    sendSuccess(res, retention, 'User retention metrics retrieved successfully');
  } catch (error) {
    console.error('Error getting user retention:', error);
    sendError(res, 'Failed to retrieve user retention metrics', 500);
  }
};

module.exports = {
  getPlatformStats,
  getUserEngagement,
  getPollPerformance,
  getContentStats,
  getTrendingTopics,
  getGrowthMetrics,
  getTopContent,
  getUserRetention,
};