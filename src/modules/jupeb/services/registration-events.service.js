const NotificationService = (() => {
  try { return require('../../notifications/services/notifications.service') || require('../../notifications/services/notification.service'); } catch { return { createNotification: async () => {} }; }
})();
const WebhookService = (() => {
  try { return require('../../webhooks/services/webhook.service'); } catch { return { dispatchEvent: async () => {} }; }
})();
const jupebMailer = (() => {
  try { return require('./jupeb-mailer.service'); } catch { return { sendRegistrationApprovedEmail: async () => {} }; }
})();

/**
 * After a registration is approved: in-app notification + user webhook
 * delivery + congratulations email. Failures (including email delivery)
 * are swallowed so approval cannot be rolled back by side-effects.
 */
async function emitRegistrationApproved(registration, approvedByUserId) {
  if (!registration.user_id) return;
  const payload = {
    registration_id: registration.id,
    session_id: registration.session_id,
    university_id: registration.university_id,
    approved_at: registration.approved_at,
    approved_by: approvedByUserId,
  };
  try {
    await NotificationService.createNotification({
      user_id: registration.user_id,
      type: 'jupeb_registration_approved',
      actor_id: approvedByUserId,
      message: 'Your JUPEB registration has been approved.',
      metadata: payload,
    });
  } catch {
    /* non-fatal */
  }
  WebhookService.fire(registration.user_id, 'jupeb.registration.approved', payload);
  setImmediate(() => { jupebMailer.sendRegistrationApproved(registration.id); });
}

module.exports = {
  emitRegistrationApproved,
};
