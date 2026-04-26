const NotificationService = require('../../notifications/services/notification.service');

/**
 * Best-effort in-app notifications for post engagement (never throws).
 */
async function notifyUser({ userId, type, actorId, message, metadata = {} }) {
  if (!userId || (actorId && userId === actorId)) return;
  try {
    await NotificationService.createNotification({
      user_id: userId,
      type,
      actor_id: actorId || null,
      message,
      metadata,
    });
  } catch (e) {
    console.warn('[posts] notification skipped:', e.message);
  }
}

module.exports = { notifyUser };
