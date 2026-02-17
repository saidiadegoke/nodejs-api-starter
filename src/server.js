const app = require('./app');
const { port } = require('./config/env.config');
const { logger } = require('./shared/utils/logger');
const pool = require('./db/pool');
const { runSeeds } = require('./db/seed');
const webSocketService = require('./shared/services/websocket.service');
const http = require('http');

const PORT = port || 4050;

// Test database connection and run idempotent seeds before starting server
const startServer = async () => {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    logger.info('Database connection successful');

    // Run seeds (idempotent: ON CONFLICT DO NOTHING in seed SQL)
    await runSeeds();

    // Create HTTP server
    const server = http.createServer(app);
    
    // Initialize WebSocket
    webSocketService.initialize(server);
    
    // Start server
    server.listen(PORT, () => {
      logger.info(`🚀 API Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`API Documentation: http://localhost:${PORT}`);
      logger.info(`WebSocket server ready for connections`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

startServer();


