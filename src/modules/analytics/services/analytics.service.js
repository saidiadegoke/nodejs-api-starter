const pool = require('../../../db/pool');

/**
 * Get platform-wide statistics
 */
const getPlatformStats = async () => {
  const result = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days') as new_users_30d,
      (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days') as new_users_7d,
      (SELECT COUNT(*) FROM users) as total_users,
      (SELECT COUNT(*) FROM polls WHERE created_at >= NOW() - INTERVAL '30 days') as new_polls_30d,
      (SELECT COUNT(*) FROM polls WHERE created_at >= NOW() - INTERVAL '7 days') as new_polls_7d,
      (SELECT COUNT(*) FROM polls) as total_polls,
      (SELECT COUNT(*) FROM poll_responses WHERE created_at >= NOW() - INTERVAL '30 days') as new_responses_30d,
      (SELECT COUNT(*) FROM poll_responses WHERE created_at >= NOW() - INTERVAL '7 days') as new_responses_7d,
      (SELECT COUNT(*) FROM poll_responses) as total_responses,
      (SELECT COUNT(*) FROM context_sources WHERE created_at >= NOW() - INTERVAL '30 days') as new_stories_30d,
      (SELECT COUNT(*) FROM context_sources WHERE created_at >= NOW() - INTERVAL '7 days') as new_stories_7d,
      (SELECT COUNT(*) FROM context_sources) as total_stories,
      (SELECT COUNT(*) FROM poll_comments WHERE created_at >= NOW() - INTERVAL '30 days') as new_comments_30d,
      (SELECT COUNT(*) FROM poll_comments WHERE created_at >= NOW() - INTERVAL '7 days') as new_comments_7d,
      (SELECT COUNT(*) FROM poll_comments) as total_comments
  `);

  return result.rows[0];
};

/**
 * Get user engagement metrics
 */
const getUserEngagement = async (timeframe = '30d') => {
  const interval = timeframe === '7d' ? '7 days' : timeframe === '90d' ? '90 days' : '30 days';

  // Get active users based on various activities
  const result = await pool.query(`
    WITH user_activities AS (
      SELECT user_id, created_at FROM poll_responses WHERE created_at >= NOW() - INTERVAL '${interval}'
      UNION ALL
      SELECT user_id, created_at FROM polls WHERE created_at >= NOW() - INTERVAL '${interval}'
      UNION ALL
      SELECT created_by as user_id, created_at FROM context_sources WHERE created_at >= NOW() - INTERVAL '${interval}'
      UNION ALL
      SELECT user_id, created_at FROM poll_comments WHERE created_at >= NOW() - INTERVAL '${interval}'
    ),
    user_stats AS (
      SELECT
        user_id,
        COUNT(DISTINCT DATE(created_at)) as active_days,
        COUNT(*) as total_activities
      FROM user_activities
      GROUP BY user_id
    )
    SELECT
      COUNT(DISTINCT ua.user_id) as active_users,
      COUNT(DISTINCT CASE WHEN ua.created_at >= NOW() - INTERVAL '1 day' THEN ua.user_id END) as daily_active_users,
      COUNT(DISTINCT CASE WHEN ua.created_at >= NOW() - INTERVAL '7 days' THEN ua.user_id END) as weekly_active_users,
      COALESCE(AVG(us.active_days), 0) as avg_active_days_per_user,
      COALESCE(AVG(us.total_activities), 0) as avg_activities_per_user,
      COUNT(DISTINCT CASE WHEN us.total_activities >= 10 THEN us.user_id END) as highly_active_users
    FROM user_activities ua
    LEFT JOIN user_stats us ON ua.user_id = us.user_id
  `);

  return result.rows[0];
};

/**
 * Get poll performance analytics
 */
const getPollPerformance = async (timeframe = '30d') => {
  const interval = timeframe === '7d' ? '7 days' : timeframe === '90d' ? '90 days' : '30 days';

  const result = await pool.query(`
    WITH poll_stats AS (
      SELECT
        p.id,
        p.created_at,
        p.poll_type,
        p.is_public,
        COUNT(pr.id) as response_count,
        COUNT(DISTINCT pr.user_id) as unique_responders,
        MAX(pr.created_at) as last_response_at,
        COUNT(DISTINCT c.id) as comment_count
      FROM polls p
      LEFT JOIN poll_responses pr ON p.id = pr.poll_id
      LEFT JOIN comments c ON c.commentable_id = p.id AND c.commentable_type = 'poll'
      WHERE p.created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY p.id, p.created_at, p.poll_type, p.is_public
    )
    SELECT
      COUNT(*) as total_polls_created,
      COALESCE(AVG(response_count), 0) as avg_responses_per_poll,
      COALESCE(MAX(response_count), 0) as max_responses_per_poll,
      COALESCE(AVG(unique_responders), 0) as avg_unique_responders_per_poll,
      COUNT(CASE WHEN response_count = 0 THEN 1 END) as polls_with_no_responses,
      COUNT(CASE WHEN response_count >= 10 THEN 1 END) as popular_polls,
      COUNT(CASE WHEN response_count >= 100 THEN 1 END) as viral_polls,
      COALESCE(AVG(comment_count), 0) as avg_comments_per_poll,
      COALESCE(AVG(EXTRACT(EPOCH FROM (last_response_at - created_at))/3600), 0) as avg_poll_lifespan_hours,
      COUNT(CASE WHEN is_public = true THEN 1 END) as public_polls,
      COUNT(CASE WHEN is_public = false THEN 1 END) as private_polls
    FROM poll_stats
  `);

  return result.rows[0];
};

/**
 * Get content statistics
 */
const getContentStats = async (timeframe = '30d') => {
  const interval = timeframe === '7d' ? '7 days' : timeframe === '90d' ? '90 days' : '30 days';

  const result = await pool.query(`
    WITH content_stats AS (
      SELECT
        'poll' as content_type,
        p.id,
        p.user_id as created_by,
        CHAR_LENGTH(p.question) as content_length,
        p.created_at
      FROM polls p
      WHERE p.created_at >= NOW() - INTERVAL '${interval}'

      UNION ALL

      SELECT
        'story' as content_type,
        cs.id,
        cs.created_by,
        CHAR_LENGTH(cs.summary) as content_length,
        cs.created_at
      FROM context_sources cs
      WHERE cs.created_at >= NOW() - INTERVAL '${interval}'

      UNION ALL

      SELECT
        'comment' as content_type,
        c.id,
        c.user_id as created_by,
        CHAR_LENGTH(c.comment) as content_length,
        c.created_at
      FROM poll_comments c
      WHERE c.created_at >= NOW() - INTERVAL '${interval}'
    )
    SELECT
      COUNT(CASE WHEN content_type = 'poll' THEN 1 END) as total_polls,
      COUNT(CASE WHEN content_type = 'story' THEN 1 END) as total_stories,
      COUNT(CASE WHEN content_type = 'comment' THEN 1 END) as total_comments,
      COUNT(*) as total_content_pieces,
      COALESCE(AVG(CASE WHEN content_type = 'poll' THEN content_length END), 0) as avg_poll_question_length,
      COALESCE(AVG(CASE WHEN content_type = 'story' THEN content_length END), 0) as avg_story_content_length,
      COALESCE(AVG(CASE WHEN content_type = 'comment' THEN content_length END), 0) as avg_comment_length,
      COUNT(DISTINCT CASE WHEN content_type = 'poll' THEN created_by END) as unique_poll_creators,
      COUNT(DISTINCT CASE WHEN content_type = 'story' THEN created_by END) as unique_story_creators,
      COUNT(DISTINCT CASE WHEN content_type = 'comment' THEN created_by END) as unique_commenters,
      COUNT(DISTINCT created_by) as unique_content_creators
    FROM content_stats
  `);

  return result.rows[0];
};

/**
 * Get trending topics and hashtags
 */
const getTrendingTopics = async (timeframe = '30d') => {
  const interval = timeframe === '7d' ? '7 days' : timeframe === '90d' ? '90 days' : '30 days';

  const result = await pool.query(`
    WITH content_words AS (
      SELECT
        unnest(string_to_array(lower(question), ' ')) as word,
        'poll' as content_type
      FROM polls
      WHERE created_at >= NOW() - INTERVAL '${interval}'

      UNION ALL

      SELECT
        unnest(string_to_array(lower(title), ' ')) as word,
        'story' as content_type
      FROM context_sources
      WHERE created_at >= NOW() - INTERVAL '${interval}'
    ),
    word_counts AS (
      SELECT
        word,
        COUNT(*) as frequency,
        COUNT(CASE WHEN content_type = 'poll' THEN 1 END) as poll_mentions,
        COUNT(CASE WHEN content_type = 'story' THEN 1 END) as story_mentions
      FROM content_words
      WHERE LENGTH(word) > 3
      AND word NOT IN ('the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'man', 'way', 'she', 'use', 'her', 'now', 'oil', 'sit', 'set', 'run', 'eat', 'far', 'sea', 'eye', 'ask', 'own', 'say', 'too', 'any', 'try', 'let', 'put', 'end', 'why', 'let', 'old', 'try')
      GROUP BY word
    )
    SELECT
      word as topic,
      frequency,
      poll_mentions,
      story_mentions,
      ROUND((frequency::numeric / (SELECT SUM(frequency) FROM word_counts)) * 100, 2) as percentage
    FROM word_counts
    WHERE frequency >= 3
    ORDER BY frequency DESC
    LIMIT 20
  `);

  return result.rows;
};

/**
 * Get growth metrics over time
 */
const getGrowthMetrics = async (timeframe = '30d') => {
  const interval = timeframe === '7d' ? '7 days' : timeframe === '90d' ? '90 days' : '30 days';
  const dateFormat = timeframe === '7d' ? 'YYYY-MM-DD' : 'YYYY-MM';
  const truncUnit = timeframe === '7d' ? 'day' : 'month';
  const seriesInterval = timeframe === '7d' ? '1 day' : '1 month';

  const result = await pool.query(`
    WITH date_series AS (
      SELECT generate_series(
        date_trunc('${truncUnit}', NOW() - INTERVAL '${interval}'),
        date_trunc('${truncUnit}', NOW()),
        '${seriesInterval}'::interval
      ) as period
    ),
    growth_data AS (
      SELECT
        date_trunc('${truncUnit}', created_at) as period,
        'users' as metric_type,
        COUNT(*) as value
      FROM users
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY date_trunc('${truncUnit}', created_at)

      UNION ALL

      SELECT
        date_trunc('${truncUnit}', created_at) as period,
        'polls' as metric_type,
        COUNT(*) as value
      FROM polls
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY date_trunc('${truncUnit}', created_at)

      UNION ALL

      SELECT
        date_trunc('${truncUnit}', created_at) as period,
        'responses' as metric_type,
        COUNT(*) as value
      FROM poll_responses
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY date_trunc('${truncUnit}', created_at)
    )
    SELECT
      to_char(ds.period, '${dateFormat}') as period,
      COALESCE(SUM(CASE WHEN gd.metric_type = 'users' THEN gd.value END), 0) as new_users,
      COALESCE(SUM(CASE WHEN gd.metric_type = 'polls' THEN gd.value END), 0) as new_polls,
      COALESCE(SUM(CASE WHEN gd.metric_type = 'responses' THEN gd.value END), 0) as new_responses
    FROM date_series ds
    LEFT JOIN growth_data gd ON ds.period = gd.period
    GROUP BY ds.period
    ORDER BY ds.period
  `);

  return result.rows;
};

/**
 * Get top performing content
 */
const getTopContent = async (timeframe = '30d', limit = 10) => {
  const interval = timeframe === '7d' ? '7 days' : timeframe === '90d' ? '90 days' : '30 days';

  const result = await pool.query(`
    WITH poll_performance AS (
      SELECT
        p.id,
        p.question,
        p.created_at,
        'poll' as content_type,
        COUNT(pr.id) as engagement_count,
        COUNT(DISTINCT pr.user_id) as unique_users,
        u.first_name || ' ' || u.last_name as creator_name
      FROM polls p
      LEFT JOIN poll_responses pr ON p.id = pr.poll_id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY p.id, p.question, p.created_at, u.first_name, u.last_name
    ),
    story_performance AS (
      SELECT
        cs.id,
        cs.title as question,
        cs.created_at,
        'story' as content_type,
        COUNT(c.id) as engagement_count,
        COUNT(DISTINCT c.user_id) as unique_users,
        u.first_name || ' ' || u.last_name as creator_name
      FROM context_sources cs
      LEFT JOIN comments c ON c.commentable_id = cs.id AND c.commentable_type = 'context_source'
      LEFT JOIN users u ON cs.created_by = u.id
      WHERE cs.created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY cs.id, cs.title, cs.created_at, u.first_name, u.last_name
    ),
    combined_performance AS (
      SELECT * FROM poll_performance
      UNION ALL
      SELECT * FROM story_performance
    )
    SELECT
      id,
      question,
      content_type,
      engagement_count,
      unique_users,
      creator_name,
      created_at
    FROM combined_performance
    ORDER BY engagement_count DESC, unique_users DESC
    LIMIT $1
  `, [limit]);

  return result.rows;
};

/**
 * Get user retention metrics
 */
const getUserRetention = async () => {
  const result = await pool.query(`
    WITH user_cohorts AS (
      SELECT 
        u.id as user_id,
        date_trunc('month', u.created_at) as cohort_month,
        u.created_at as signup_date
      FROM users u
      WHERE u.created_at >= NOW() - INTERVAL '12 months'
    ),
    user_activities AS (
      SELECT 
        user_id,
        date_trunc('month', created_at) as activity_month
      FROM (
        SELECT user_id, created_at FROM poll_responses
        UNION ALL
        SELECT user_id, created_at FROM polls
        UNION ALL
        SELECT created_by as user_id, created_at FROM context_sources
        UNION ALL
        SELECT user_id, created_at FROM poll_comments
      ) activities
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY user_id, date_trunc('month', created_at)
    ),
    retention_data AS (
      SELECT 
        uc.cohort_month,
        COUNT(DISTINCT uc.user_id) as cohort_size,
        COUNT(DISTINCT CASE WHEN ua.activity_month = uc.cohort_month THEN uc.user_id END) as month_0,
        COUNT(DISTINCT CASE WHEN ua.activity_month = uc.cohort_month + INTERVAL '1 month' THEN uc.user_id END) as month_1,
        COUNT(DISTINCT CASE WHEN ua.activity_month = uc.cohort_month + INTERVAL '2 months' THEN uc.user_id END) as month_2,
        COUNT(DISTINCT CASE WHEN ua.activity_month = uc.cohort_month + INTERVAL '3 months' THEN uc.user_id END) as month_3
      FROM user_cohorts uc
      LEFT JOIN user_activities ua ON uc.user_id = ua.user_id
      GROUP BY uc.cohort_month
    )
    SELECT 
      to_char(cohort_month, 'YYYY-MM') as cohort,
      cohort_size,
      ROUND((month_0::float / cohort_size) * 100, 1) as retention_month_0,
      ROUND((month_1::float / cohort_size) * 100, 1) as retention_month_1,
      ROUND((month_2::float / cohort_size) * 100, 1) as retention_month_2,
      ROUND((month_3::float / cohort_size) * 100, 1) as retention_month_3
    FROM retention_data
    WHERE cohort_size > 0
    ORDER BY cohort_month DESC
    LIMIT 12
  `);

  return result.rows;
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