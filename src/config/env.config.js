module.exports = {
  jwtSecret: process.env.JWT_SECRET || 'replace_with_a_long_random_string',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'replace_with_a_different_long_random_string',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:5269',
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5269', 10),
};
