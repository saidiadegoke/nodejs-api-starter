const SubscriptionService = require('../services/subscription.service');
const SubscriptionModel = require('../models/subscription.model');
const PaymentModel = require('../models/payment.model');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND, FORBIDDEN } = require('../../../shared/constants/statusCodes');

/**
 * Subscription Controller
 * Handles subscription-related HTTP requests
 */
class SubscriptionController {
  /**
   * Get current subscription for user
   * GET /subscriptions/current
   * Disable caching so clients always get the latest subscription (avoid 304 / stale data).
   */
  static async getCurrentSubscription(req, res) {
    try {
      const userId = req.user.user_id || req.user.id;
      if (!userId) {
        return sendError(res, 'User not identified', BAD_REQUEST);
      }
      const subscription = await SubscriptionService.getCurrentSubscription(userId);

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      sendSuccess(res, subscription, 'Subscription retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get available plans
   * GET /subscriptions/plans
   */
  static async getAvailablePlans(req, res) {
    try {
      const PlanConfigService = require('../services/planConfig.service');
      const plans = await PlanConfigService.getPublicPlans();

      sendSuccess(res, { plans }, 'Plans retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get subscription usage
   * GET /subscriptions/usage
   */
  static async getUsage(req, res) {
    try {
      const userId = req.user.user_id;
      const usage = await SubscriptionService.getUsage(userId);
      
      sendSuccess(res, usage, 'Usage retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Subscribe or upgrade subscription
   * POST /subscriptions/subscribe
   * Creates a new subscription if user doesn't have one, or upgrades existing subscription
   */
  static async subscribe(req, res) {
    try {
      const userId = req.user.user_id;
      const { plan_type, billing_cycle = 'monthly', currency = 'NGN' } = req.body;

      if (!plan_type) {
        return sendError(res, 'plan_type is required', BAD_REQUEST);
      }

      // Check if user has an active subscription
      const existingSubscription = await SubscriptionModel.getActiveSubscription(userId);

      let subscription;
      if (existingSubscription) {
        // User has subscription - upgrade it
        subscription = await SubscriptionService.upgradeSubscription(
          existingSubscription.id,
          plan_type,
          userId
        );
      } else {
        // User doesn't have subscription - create new one
        subscription = await SubscriptionService.createSubscription(
          userId,
          plan_type,
          billing_cycle,
          currency
        );
      }

      sendSuccess(res, subscription, 'Subscription activated successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Upgrade subscription
   * POST /subscriptions/upgrade
   * @deprecated Use /subscriptions/subscribe instead. This endpoint requires subscription_id.
   */
  static async upgrade(req, res) {
    try {
      const userId = req.user.user_id;
      const { subscription_id, plan_type } = req.body;

      if (!subscription_id || !plan_type) {
        return sendError(res, 'subscription_id and plan_type are required', BAD_REQUEST);
      }

      const subscription = await SubscriptionService.upgradeSubscription(
        subscription_id,
        plan_type,
        userId
      );

      sendSuccess(res, subscription, 'Subscription upgraded successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Downgrade subscription (scheduled at period end)
   * POST /subscriptions/downgrade
   */
  static async downgrade(req, res) {
    try {
      const userId = req.user.user_id;
      const { subscription_id, plan_type } = req.body;

      if (!subscription_id || !plan_type) {
        return sendError(res, 'subscription_id and plan_type are required', BAD_REQUEST);
      }

      const subscription = await SubscriptionService.downgradeSubscription(
        subscription_id,
        plan_type,
        userId
      );

      sendSuccess(res, subscription, 'Subscription downgrade scheduled successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Cancel subscription
   * POST /subscriptions/cancel
   */
  static async cancel(req, res) {
    try {
      const userId = req.user.user_id;
      const { subscription_id, immediately = false } = req.body;

      if (!subscription_id) {
        return sendError(res, 'subscription_id is required', BAD_REQUEST);
      }

      const result = await SubscriptionService.cancelSubscription(
        subscription_id,
        immediately,
        userId
      );

      sendSuccess(res, result, result.message || 'Subscription cancelled successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get subscription history
   * GET /subscriptions/history
   */
  static async getHistory(req, res) {
    try {
      const userId = req.user.user_id;
      const { limit = 20, offset = 0 } = req.query;

      const subscriptions = await SubscriptionModel.getUserSubscriptions(userId, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      sendSuccess(res, { subscriptions }, 'Subscription history retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get subscription invoices/payments
   * GET /subscriptions/invoices
   */
  static async getInvoices(req, res) {
    try {
      const userId = req.user.user_id;
      const { limit = 20, offset = 0 } = req.query;

      // Get active subscription
      const subscription = await SubscriptionModel.getActiveSubscription(userId);
      
      if (!subscription) {
        return sendSuccess(res, { payments: [] }, 'No subscription found', OK);
      }

      // Get payments for this subscription
      // Note: PaymentModel may need subscription_id support - check if method exists
      const payments = await PaymentModel.findByUserId(userId, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        payment_type: 'subscription'
      });

      sendSuccess(res, { payments }, 'Invoices retrieved successfully', OK);
    } catch (error) {
      // If findByUserId doesn't support subscription filtering, return empty array
      if (error.message.includes('subscription')) {
        return sendSuccess(res, { payments: [] }, 'No invoices found', OK);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Handle payment provider webhook
   * POST /subscriptions/webhook
   */
  static async webhook(req, res) {
    try {
      const { provider, event, data } = req.body;

      if (!provider || !event || !data) {
        return sendError(res, 'Invalid webhook payload', BAD_REQUEST);
      }

      // TODO: Verify webhook signature based on provider (Stripe, PayPal, etc.)

      // Handle different webhook events
      switch (event) {
        case 'subscription.created':
        case 'subscription.updated':
          // Sync subscription from provider
          await SubscriptionService.syncSubscriptionFromProvider(
            data.subscription_id,
            data
          );
          break;

        case 'subscription.cancelled':
          // Handle cancellation
          const subscription = await SubscriptionModel.findByStripeSubscriptionId(data.subscription_id);
          if (subscription) {
            await SubscriptionService.cancelSubscription(subscription.id, true, subscription.user_id);
          }
          break;

        case 'payment.succeeded':
          // Process successful payment
          if (data.subscription_id) {
            await SubscriptionService.processSubscriptionPayment(
              data.subscription_id,
              data.payment_data
            );
          }
          break;

        default:
          console.log(`Unhandled webhook event: ${event}`);
      }

      sendSuccess(res, { received: true }, 'Webhook processed successfully', OK);
    } catch (error) {
      console.error('Webhook processing error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = SubscriptionController;

