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
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const stats = webSocketService.getStats();
    sendSuccess(res, stats, 'WebSocket statistics retrieved successfully');
  } catch (error) {
    console.error('Get WebSocket stats error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
