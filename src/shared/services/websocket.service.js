const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../../config/env.config');
const { logger } = require('../utils/logger');

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> Set of socket IDs
    this.pollSubscriptions = new Map(); // pollId -> Set of socket IDs
    this.userSockets = new Map(); // socketId -> { userId, pollSubscriptions }
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    
    logger.info('WebSocket server initialized');
  }

  setupMiddleware() {
    // Authentication middleware
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
      
      socket.on('subscribe', (data) => this.handleSubscribe(socket, data));
      socket.on('unsubscribe', (data) => this.handleUnsubscribe(socket, data));
      socket.on('subscribe_polls', (data) => this.handleSubscribePolls(socket, data));
      socket.on('unsubscribe_polls', (data) => this.handleUnsubscribePolls(socket, data));
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });
  }

  handleConnection(socket) {
    const userId = socket.userId;
    
    // Track user connections
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId).add(socket.id);
    
    // Track socket info
    this.userSockets.set(socket.id, {
      userId,
      pollSubscriptions: new Set()
    });

    // Join user-specific room for notifications
    socket.join(`user:${userId}`);
    
    logger.info(`User ${userId} connected with socket ${socket.id}`);
  }

  handleSubscribe(socket, data) {
    const { channel } = data;
    
    if (channel === 'polls') {
      socket.join('polls:all');
      logger.info(`Socket ${socket.id} subscribed to all polls`);
    }
  }

  handleUnsubscribe(socket, data) {
    const { channel } = data;
    
    if (channel === 'polls') {
      socket.leave('polls:all');
      logger.info(`Socket ${socket.id} unsubscribed from all polls`);
    }
  }

  handleSubscribePolls(socket, data) {
    const { pollIds } = data;
    const socketInfo = this.userSockets.get(socket.id);
    
    if (!socketInfo || !Array.isArray(pollIds)) return;

    pollIds.forEach(pollId => {
      // Join poll-specific room
      socket.join(`poll:${pollId}`);
      
      // Track subscription
      socketInfo.pollSubscriptions.add(pollId);
      
      if (!this.pollSubscriptions.has(pollId)) {
        this.pollSubscriptions.set(pollId, new Set());
      }
      this.pollSubscriptions.get(pollId).add(socket.id);
    });
    
    logger.info(`Socket ${socket.id} subscribed to polls: ${pollIds.join(', ')}`);
  }

  handleUnsubscribePolls(socket, data) {
    const { pollIds } = data;
    const socketInfo = this.userSockets.get(socket.id);
    
    if (!socketInfo || !Array.isArray(pollIds)) return;

    pollIds.forEach(pollId => {
      // Leave poll-specific room
      socket.leave(`poll:${pollId}`);
      
      // Remove subscription tracking
      socketInfo.pollSubscriptions.delete(pollId);
      
      if (this.pollSubscriptions.has(pollId)) {
        this.pollSubscriptions.get(pollId).delete(socket.id);
        if (this.pollSubscriptions.get(pollId).size === 0) {
          this.pollSubscriptions.delete(pollId);
        }
      }
    });
    
    logger.info(`Socket ${socket.id} unsubscribed from polls: ${pollIds.join(', ')}`);
  }

  handleDisconnect(socket) {
    const userId = socket.userId;
    const socketInfo = this.userSockets.get(socket.id);
    
    // Clean up user connections
    if (this.connectedUsers.has(userId)) {
      this.connectedUsers.get(userId).delete(socket.id);
      if (this.connectedUsers.get(userId).size === 0) {
        this.connectedUsers.delete(userId);
      }
    }
    
    // Clean up poll subscriptions
    if (socketInfo) {
      socketInfo.pollSubscriptions.forEach(pollId => {
        if (this.pollSubscriptions.has(pollId)) {
          this.pollSubscriptions.get(pollId).delete(socket.id);
          if (this.pollSubscriptions.get(pollId).size === 0) {
            this.pollSubscriptions.delete(pollId);
          }
        }
      });
    }
    
    // Clean up socket tracking
    this.userSockets.delete(socket.id);
    
    logger.info(`User ${userId} disconnected (socket ${socket.id})`);
  }

  // Broadcast methods for poll events
  broadcastPollCreated(poll) {
    this.io.to('polls:all').emit('poll_created', {
      type: 'poll_created',
      pollId: poll.id,
      poll
    });
    
    logger.info(`Broadcasted poll created: ${poll.id}`);
  }

  broadcastPollUpdated(poll) {
    // Broadcast to general polls channel
    this.io.to('polls:all').emit('poll_updated', {
      type: 'poll_updated',
      pollId: poll.id,
      poll
    });
    
    // Broadcast to specific poll subscribers
    this.io.to(`poll:${poll.id}`).emit('poll_updated', {
      type: 'poll_updated',
      pollId: poll.id,
      poll
    });
    
    logger.info(`Broadcasted poll updated: ${poll.id}`);
  }

  broadcastPollDeleted(pollId) {
    // Broadcast to general polls channel
    this.io.to('polls:all').emit('poll_deleted', {
      type: 'poll_deleted',
      pollId
    });
    
    // Broadcast to specific poll subscribers
    this.io.to(`poll:${pollId}`).emit('poll_deleted', {
      type: 'poll_deleted',
      pollId
    });
    
    logger.info(`Broadcasted poll deleted: ${pollId}`);
  }

  broadcastPollVoteUpdate(pollId, updatedVotes) {
    // Broadcast to general polls channel
    this.io.to('polls:all').emit('poll_vote_update', {
      type: 'poll_vote_update',
      pollId,
      votes: updatedVotes
    });
    
    // Broadcast to specific poll subscribers
    this.io.to(`poll:${pollId}`).emit('poll_vote_update', {
      type: 'poll_vote_update',
      pollId,
      votes: updatedVotes
    });
    
    logger.info(`Broadcasted vote update for poll: ${pollId}`);
  }

  // Send notification to specific user
  sendUserNotification(userId, notification) {
    this.io.to(`user:${userId}`).emit('notification', notification);
    logger.info(`Sent notification to user ${userId}`);
  }

  // Broadcast user profile update
  broadcastUserProfileUpdate(userId, updatedProfile) {
    this.io.to(`user:${userId}`).emit('user_profile_updated', {
      type: 'user_profile_updated',
      userId,
      profile: updatedProfile
    });
    
    logger.info(`Broadcasted profile update for user: ${userId}`);
  }

  // Broadcast user stats update
  broadcastUserStatsUpdate(userId, updatedStats) {
    this.io.to(`user:${userId}`).emit('user_stats_updated', {
      type: 'user_stats_updated',
      userId,
      stats: updatedStats
    });
    
    logger.info(`Broadcasted stats update for user: ${userId}`);
  }

  // Get connection stats
  getStats() {
    return {
      connectedUsers: this.connectedUsers.size,
      totalConnections: this.userSockets.size,
      pollSubscriptions: this.pollSubscriptions.size
    };
  }
}

// Create singleton instance
const webSocketService = new WebSocketService();

module.exports = webSocketService;