/**
 * Unit tests for PaymentService, especially activateSubscriptionForCompletedPayment
 * (guard clauses and behavior when subscription is created/linked).
 */

const mockPoolQuery = jest.fn().mockResolvedValue({ rows: [] });
const mockCreateSubscription = jest.fn().mockResolvedValue({
  id: 'sub-uuid-123',
  user_id: 'user-uuid',
  plan_type: 'small_scale',
  status: 'pending',
  billing_cycle: 'monthly'
});
const mockGetActiveSubscription = jest.fn().mockResolvedValue(null);
const mockFindById = jest.fn().mockResolvedValue(null);
const mockUpdateStatus = jest.fn().mockResolvedValue({});
const mockUpgradeSubscription = jest.fn().mockResolvedValue({
  id: 'sub-uuid-123',
  plan_type: 'small_scale',
  status: 'active'
});

jest.mock('../../../db/pool', () => ({
  query: (...args) => mockPoolQuery(...args)
}));

jest.mock('../models/subscription.model', () => ({
  findById: (...args) => mockFindById(...args),
  getActiveSubscription: (...args) => mockGetActiveSubscription(...args),
  updateStatus: (...args) => mockUpdateStatus(...args)
}));

jest.mock('./subscription.service', () => ({
  createSubscription: (...args) => mockCreateSubscription(...args),
  upgradeSubscription: (...args) => mockUpgradeSubscription(...args)
}));

jest.mock('../../referrals/services/referral.service', () => ({
  recordMilestone: jest.fn().mockResolvedValue(undefined)
}));

const paymentServiceModule = require('./payment.service');

describe('PaymentService', () => {
  const defaultSubscription = {
    id: 'sub-uuid-123',
    user_id: 'user-uuid',
    plan_type: 'small_scale',
    status: 'pending',
    billing_cycle: 'monthly'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveSubscription.mockResolvedValue(null);
    mockCreateSubscription.mockResolvedValue(defaultSubscription);
    mockUpgradeSubscription.mockResolvedValue({ ...defaultSubscription, status: 'active' });
  });

  describe('activateSubscriptionForCompletedPayment', () => {
    const paymentId = 'payment-db-uuid-1';
    const userId = 'user-uuid-45';

    it('does nothing when payment type is not subscription', async () => {
      const payment = {
        id: paymentId,
        payment_id: 'PAY_123',
        type: 'donation',
        payment_type: 'donation',
        donor_id: userId,
        metadata: { plan_type: 'small_scale', billing_cycle: 'monthly' }
      };
      await paymentServiceModule.activateSubscriptionForCompletedPayment(payment, paymentId);
      expect(mockCreateSubscription).not.toHaveBeenCalled();
      expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('uses donor_id when user_id is null (donation-style subscription payment)', async () => {
      const payment = {
        id: paymentId,
        payment_id: 'PAY_donor',
        type: 'subscription',
        payment_type: 'donation',
        subscription_id: null,
        donor_id: userId,
        user_id: null,
        currency: 'NGN',
        metadata: { plan_type: 'small_scale', billing_cycle: 'monthly' }
      };
      await paymentServiceModule.activateSubscriptionForCompletedPayment(payment, paymentId);

      expect(mockCreateSubscription).toHaveBeenCalledWith(userId, 'small_scale', 'monthly', 'NGN');
      expect(mockPoolQuery).toHaveBeenCalledWith(
        'UPDATE payments SET subscription_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        expect.arrayContaining(['sub-uuid-123', paymentId])
      );
      expect(mockUpdateStatus).toHaveBeenCalledWith('sub-uuid-123', 'active');
    });

    it('does not create subscription when userId is missing', async () => {
      const payment = {
        id: paymentId,
        payment_id: 'PAY_nouser',
        type: 'subscription',
        subscription_id: null,
        donor_id: null,
        user_id: null,
        metadata: { plan_type: 'small_scale' }
      };
      await paymentServiceModule.activateSubscriptionForCompletedPayment(payment, paymentId);

      expect(mockCreateSubscription).not.toHaveBeenCalled();
      expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('does not create subscription when plan_type is missing in metadata', async () => {
      const payment = {
        id: paymentId,
        payment_id: 'PAY_noplan',
        type: 'subscription',
        subscription_id: null,
        donor_id: userId,
        metadata: {}
      };
      await paymentServiceModule.activateSubscriptionForCompletedPayment(payment, paymentId);

      expect(mockCreateSubscription).not.toHaveBeenCalled();
    });

    it('creates subscription, links payment, and activates when type is subscription and subscription_id is null', async () => {
      const payment = {
        id: paymentId,
        payment_id: 'PAY_456',
        type: 'subscription',
        subscription_id: null,
        donor_id: userId,
        user_id: null,
        currency: 'NGN',
        metadata: { plan_type: 'small_scale', billing_cycle: 'monthly' }
      };
      await paymentServiceModule.activateSubscriptionForCompletedPayment(payment, paymentId);

      expect(mockGetActiveSubscription).toHaveBeenCalledWith(userId);
      expect(mockCreateSubscription).toHaveBeenCalledWith(userId, 'small_scale', 'monthly', 'NGN');
      expect(mockPoolQuery).toHaveBeenCalledWith(
        'UPDATE payments SET subscription_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        expect.arrayContaining(['sub-uuid-123', paymentId])
      );
      expect(mockUpdateStatus).toHaveBeenCalledWith('sub-uuid-123', 'active');
    });

    it('upgrades existing subscription when user already has active subscription', async () => {
      mockGetActiveSubscription.mockResolvedValueOnce({
        id: 'existing-sub-id',
        plan_type: 'free',
        status: 'active'
      });
      const payment = {
        id: paymentId,
        payment_id: 'PAY_upgrade',
        type: 'subscription',
        subscription_id: null,
        donor_id: userId,
        currency: 'NGN',
        metadata: { plan_type: 'small_scale', billing_cycle: 'monthly' }
      };
      await paymentServiceModule.activateSubscriptionForCompletedPayment(payment, paymentId);

      expect(mockGetActiveSubscription).toHaveBeenCalledWith(userId);
      expect(mockUpgradeSubscription).toHaveBeenCalledWith('existing-sub-id', 'small_scale', userId);
      expect(mockCreateSubscription).not.toHaveBeenCalled();
      expect(mockPoolQuery).toHaveBeenCalledWith(
        'UPDATE payments SET subscription_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        expect.arrayContaining(['sub-uuid-123', paymentId])
      );
    });
  });
});
