const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../../config/env.config');
const { logger } = require('../utils/logger');

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> Set of socket IDs
    this.userSockets = new Map(); // socketId -> { userId }
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 90000,
      pingInterval: 25000,
      upgradeTimeout: 30000,
      allowEIO3: true
    });

    this.setupMiddleware();
    this.setupEventHandlers();

    logger.info('WebSocket server initialized');
  }

  setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, jwtSecret);
        socket.userId = decoded.userId;
        socket.userRole = decoded.role;

        logger.info(`User ${decoded.userId} connected via WebSocket`);
        next();
      } catch (error) {
        logger.error('WebSocket authentication failed:', error.message);
        next(new Error('Authentication failed'));
      }
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });
  }

  handleConnection(socket) {
    const userId = socket.userId;

    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId).add(socket.id);

    this.userSockets.set(socket.id, { userId });

    socket.join(`user:${userId}`);

    logger.info(`User ${userId} connected with socket ${socket.id}`);
  }

  handleDisconnect(socket) {
    const userId = socket.userId;

    if (this.connectedUsers.has(userId)) {
      this.connectedUsers.get(userId).delete(socket.id);
      if (this.connectedUsers.get(userId).size === 0) {
        this.connectedUsers.delete(userId);
      }
    }

    this.userSockets.delete(socket.id);

    logger.info(`User ${userId} disconnected (socket ${socket.id})`);
  }

  sendUserNotification(userId, notification) {
    this.io.to(`user:${userId}`).emit('notification', notification);
    logger.info(`Sent notification to user ${userId}`);
  }

  broadcastUserProfileUpdate(userId, updatedProfile) {
    this.io.to(`user:${userId}`).emit('user_profile_updated', {
      type: 'user_profile_updated',
      userId,
      profile: updatedProfile
    });
  }

  getStats() {
    return {
      connectedUsers: this.connectedUsers.size,
      totalConnections: this.userSockets.size
    };
  }
}

const webSocketService = new WebSocketService();

module.exports = webSocketService;
