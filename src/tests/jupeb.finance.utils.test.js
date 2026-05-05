const { mapPaymentStatusToJupebProjection } = require('../modules/jupeb/utils/finance-projection');

describe('JUPEB finance projection', () => {
  it('maps gateway-style payment statuses', () => {
    expect(mapPaymentStatusToJupebProjection('completed')).toBe('paid');
    expect(mapPaymentStatusToJupebProjection('pending')).toBe('pending');
    expect(mapPaymentStatusToJupebProjection('pending_transfer')).toBe('pending');
    expect(mapPaymentStatusToJupebProjection('processing')).toBe('pending');
    expect(mapPaymentStatusToJupebProjection('failed')).toBe('payment_failed');
    expect(mapPaymentStatusToJupebProjection('refunded')).toBe('payment_failed');
    expect(mapPaymentStatusToJupebProjection('unknown')).toBe('unpaid');
  });
});
