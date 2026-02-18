/**
 * Unit tests for PaymentController, especially updatePayment (admin approve)
 * and subscription activation flow.
 */

const mockActivate = jest.fn().mockResolvedValue(undefined);
const mockFindById = jest.fn();
const mockUpdateStatus = jest.fn();

jest.mock('../services/payment.service', () => ({
  paymentModel: {
    findById: (...args) => mockFindById(...args),
    updateStatus: (...args) => mockUpdateStatus(...args)
  },
  activateSubscriptionForCompletedPayment: (...args) => mockActivate(...args)
}));

jest.mock('../services/subscription.service', () => ({
  renewSubscription: jest.fn().mockResolvedValue({})
}));

const paymentController = require('./payment.controller');

describe('PaymentController', () => {
  let req;
  let res;
  let jsonSpy;
  let statusSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    jsonSpy = jest.fn();
    statusSpy = jest.fn().mockReturnValue({ json: jsonSpy });
    res = { status: statusSpy, json: jsonSpy };
  });

  describe('updatePayment', () => {
    const paymentId = 'payment-uuid-1';

    it('returns 404 when payment not found', async () => {
      mockFindById.mockResolvedValue(null);
      req = { params: { id: paymentId }, body: { status: 'completed' } };

      await paymentController.updatePayment(req, res);

      expect(mockFindById).toHaveBeenCalledWith(paymentId);
      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Payment not found' })
      );
      expect(mockActivate).not.toHaveBeenCalled();
    });

    it('calls activateSubscriptionForCompletedPayment when status is completed (subscription payment)', async () => {
      const payment = {
        id: paymentId,
        payment_id: 'PAY_123',
        type: 'subscription',
        subscription_id: null,
        donor_id: 'user-uuid',
        status: 'pending'
      };
      mockFindById.mockResolvedValue(payment);
      mockUpdateStatus.mockResolvedValue({ ...payment, status: 'completed' });
      req = { params: { id: paymentId }, body: { status: 'completed' } };

      await paymentController.updatePayment(req, res);

      expect(mockFindById).toHaveBeenCalledWith(paymentId);
      expect(mockUpdateStatus).toHaveBeenCalled();
      expect(mockActivate).toHaveBeenCalledWith(payment, paymentId);
      expect(statusSpy).not.toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Payment updated successfully' })
      );
    });

    it('does not call activateSubscriptionForCompletedPayment when status is not completed', async () => {
      const payment = {
        id: paymentId,
        payment_id: 'PAY_456',
        type: 'subscription',
        status: 'pending'
      };
      mockFindById.mockResolvedValue(payment);
      mockUpdateStatus.mockResolvedValue({ ...payment, status: 'failed' });
      req = { params: { id: paymentId }, body: { status: 'failed' } };

      await paymentController.updatePayment(req, res);

      expect(mockActivate).not.toHaveBeenCalled();
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: expect.any(Object) })
      );
    });
  });
});
