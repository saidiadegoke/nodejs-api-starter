const express = require('express');
const router = express.Router();
const webSocketService = require('../../shared/services/websocket.service');
const { sendSuccess } = require('../../shared/utils/response');
const { requireAuth } = require('../../shared/middleware/rbac.middleware');

/**
 * Get WebSocket connection statistics
 * 
 * @route GET /api/websocket/stats
 * @access Private (Admin only)
 */
router.get('/stats', requireAuth, (req, res) => {
  try {
    // Only allow admins to view stats
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const stats = webSocketService.getStats();
    sendSuccess(res, stats, 'WebSocket statistics retrieved successfully');
  } catch (error) {
    console.error('Get WebSocket stats error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * Test WebSocket broadcast
 * 
 * @route POST /api/websocket/test-broadcast
 * @access Private (Admin only)
 */
router.post('/test-broadcast', requireAuth, (req, res) => {
  try {
    // Only allow admins to test broadcasts
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { type, data } = req.body;

    switch (type) {
      case 'poll_created':
        webSocketService.broadcastPollCreated(data);
        break;
      case 'poll_updated':
        webSocketService.broadcastPollUpdated(data);
        break;
      case 'poll_deleted':
        webSocketService.broadcastPollDeleted(data.pollId);
        break;
      case 'poll_vote_update':
        webSocketService.broadcastPollVoteUpdate(data.pollId, data.votes);
        break;
      default:
        return res.status(400).json({ message: 'Invalid broadcast type' });
    }

    sendSuccess(res, null, 'Test broadcast sent successfully');
  } catch (error) {
    console.error('Test broadcast error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;