/**
 * Maps core `payments.status` to JUPEB finance projection labels (see docs/006-jupeb-finance-technical-design.md).
 * @param {string} status
 * @returns {'unpaid' | 'pending' | 'paid' | 'payment_failed'}
 */
function mapPaymentStatusToJupebProjection(status) {
  if (status === 'completed') return 'paid';
  if (status === 'refunded' || status === 'failed') return 'payment_failed';
  if (status === 'pending' || status === 'pending_transfer' || status === 'processing') return 'pending';
  return 'unpaid';
}

module.exports = { mapPaymentStatusToJupebProjection };
