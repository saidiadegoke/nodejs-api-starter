const pool = require('../../../db/pool');
const paymentModel = require('../../payments/models/payment.model');
const { mapPaymentStatusToJupebProjection } = require('../utils/finance-projection');
const WebhookService = require('../../webhooks/services/webhook.service');

/**
 * Persist payment_projection on jupeb_registrations from the latest payment row state.
 */
async function syncRegistrationProjectionForPaymentId(paymentInternalId) {
  const p = await paymentModel.findById(paymentInternalId);
  if (!p || !p.registration_id) return null;
  const proj = mapPaymentStatusToJupebProjection(p.status);
  const r = await pool.query(
    `UPDATE jupeb_registrations
     SET payment_projection = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, user_id, payment_projection`,
    [p.registration_id, proj]
  );
  const row = r.rows[0];
  if (row && row.user_id) {
    WebhookService.fire(row.user_id, 'jupeb.payment.projection_updated', {
      registration_id: p.registration_id,
      payment_id: p.id,
      payment_status: p.status,
      payment_projection: row.payment_projection,
    });
  }
  return row;
}

module.exports = {
  syncRegistrationProjectionForPaymentId,
};
