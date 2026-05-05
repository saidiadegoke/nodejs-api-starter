const NotificationService = require('../../notifications/services/notification.service');
const WebhookService = require('../../webhooks/services/webhook.service');
const ninVerificationModel = require('../models/nin-verification.model');
const pool = require('../../../db/pool');

async function findLinkedRegistrationUserIds(verificationId) {
  const r = await pool.query(
    `SELECT user_id FROM jupeb_registrations
     WHERE nin_verification_id = $1 AND user_id IS NOT NULL`,
    [verificationId]
  );
  return r.rows.map((row) => row.user_id);
}

async function emitNinResolved(verificationId, status) {
  if (status !== 'verified' && status !== 'failed') return;
  const row = await ninVerificationModel.findById(verificationId);
  if (!row) return;
  const event = status === 'verified' ? 'jupeb.nin.verified' : 'jupeb.nin.failed';
  const notifType = status === 'verified' ? 'jupeb_nin_verified' : 'jupeb_nin_failed';
  const message =
    status === 'verified'
      ? 'Your NIN verification has been completed.'
      : 'NIN verification could not be completed. Please contact your institution.';
  const payload = {
    verification_id: row.id,
    status: row.status,
    nin_last4: row.nin_last4,
    requested_by: row.requested_by,
    last_error_code: row.last_error_code,
    verified_at: row.verified_at,
  };
  const userIds = new Set(await findLinkedRegistrationUserIds(verificationId));
  if (row.requested_by) userIds.add(row.requested_by);
  for (const uid of userIds) {
    try {
      await NotificationService.createNotification({
        user_id: uid,
        type: notifType,
        message,
        metadata: payload,
      });
    } catch {
      /* non-fatal */
    }
    try {
      WebhookService.fire(uid, event, payload);
    } catch {
      /* non-fatal */
    }
  }
  if (userIds.size === 0) {
    // Still fire a webhook with a null user so listeners that subscribe to
    // global identity events can react.
    try {
      WebhookService.fire(null, event, payload);
    } catch {
      /* non-fatal */
    }
  }
}

module.exports = {
  emitNinResolved,
};
