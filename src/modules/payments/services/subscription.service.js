const SubscriptionModel = require('../models/subscription.model');
const PaymentModel = require('../models/payment.model');
const PlanConfigService = require('./planConfig.service');
const { v4: uuidv4 } = require('uuid');

/**
 * Subscription Service
 * Handles subscription business logic: upgrades, downgrades, cancellations, renewals
 * Uses PlanConfigService to get plan configurations from database
 */
class SubscriptionService {
  /**
   * Get plan configuration from database
   */
  static async getPlanConfig(planType) {
    try {
      const config = await PlanConfigService.getConfigByType(planType);
      return PlanConfigService.formatForSubscriptionService(config);
    } catch (error) {
      throw new Error(`Invalid plan type: ${planType} - ${error.message}`);
    }
  }

  /**
   * Get plan features/limits
   */
  static async getSubscriptionFeatures(planType) {
    return await this.getPlanConfig(planType);
  }

  /**
   * Get all plan configurations (for compatibility and admin use)
   */
  static async getAllPlanConfigs() {
    const configs = await PlanConfigService.getAllConfigs();
    const formattedConfigs = {};
    
    for (const config of configs) {
      formattedConfigs[config.plan_type] = PlanConfigService.formatForSubscriptionService(config);
    }
    
    return formattedConfigs;
  }

  /**
   * Get user's current subscription
   */
  static async getCurrentSubscription(userId) {
    const subscription = await SubscriptionModel.getActiveSubscription(userId);
    
    if (!subscription) {
      // Return free plan as default
      const freePlanConfig = await this.getPlanConfig('free');
      return {
        plan_type: 'free',
        status: 'active',
        limits: freePlanConfig.limits,
        features: freePlanConfig.features
      };
    }

    const planConfig = await this.getPlanConfig(subscription.plan_type);
    return {
      ...subscription,
      limits: planConfig.limits,
      features: planConfig.features
    };
  }

  /**
   * Create new subscription
   */
  static async createSubscription(userId, planType, billingCycle = 'monthly', currency = 'NGN') {
    // Validate plan type by loading config from database
    let planConfig;
    try {
      planConfig = await this.getPlanConfig(planType);
    } catch (error) {
      throw new Error(`Invalid plan type: ${planType}`);
    }

    // Check if user already has active subscription
    const existingSubscription = await SubscriptionModel.getActiveSubscription(userId);
    if (existingSubscription) {
      throw new Error('User already has an active subscription');
    }

    // Get price for selected currency and billing cycle
    const currencyKey = currency.toUpperCase();
    const billingKey = billingCycle === 'monthly' ? 'monthly' : 'yearly';
    
    if (!planConfig.prices || !planConfig.prices[currencyKey] || planConfig.prices[currencyKey][billingKey] === undefined) {
      throw new Error(`Price not found for currency ${currency} and billing cycle ${billingCycle}`);
    }

    const amount = planConfig.prices[currencyKey][billingKey];
    
    // Calculate period end
    const currentPeriodStart = new Date();
    const currentPeriodEnd = new Date();
    if (billingCycle === 'monthly') {
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    } else {
      currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
    }

    const subscription = await SubscriptionModel.create({
      user_id: userId,
      plan_type: planType,
      status: planType === 'free' ? 'active' : 'pending',
      billing_cycle: billingCycle,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      amount: amount,
      currency: currency
    });

    return subscription;
  }

  /**
   * Upgrade subscription
   */
  static async upgradeSubscription(subscriptionId, newPlanType, userId) {
    const subscription = await SubscriptionModel.findById(subscriptionId);
    
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (subscription.user_id !== userId) {
      throw new Error('Unauthorized');
    }

    // Validate new plan type
    let newPlanConfig;
    try {
      newPlanConfig = await this.getPlanConfig(newPlanType);
    } catch (error) {
      throw new Error(`Invalid plan type: ${newPlanType}`);
    }

    // Check if upgrade is valid (based on display order)
    const allConfigs = await PlanConfigService.getAllConfigs();
    const planOrder = ['free', 'small_scale', 'medium_scale', 'large_scale'];
    const currentPlanIndex = planOrder.indexOf(subscription.plan_type);
    const newPlanIndex = planOrder.indexOf(newPlanType);
    
    if (newPlanIndex <= currentPlanIndex) {
      throw new Error('New plan must be higher than current plan');
    }
    
    // Get price for user's currency and billing cycle
    const currencyKey = (subscription.currency || 'NGN').toUpperCase();
    const billingKey = subscription.billing_cycle === 'monthly' ? 'monthly' : 'yearly';
    
    if (!newPlanConfig.prices || !newPlanConfig.prices[currencyKey] || newPlanConfig.prices[currencyKey][billingKey] === undefined) {
      throw new Error(`Price not found for currency ${subscription.currency} and billing cycle ${subscription.billing_cycle}`);
    }
    
    const newAmount = newPlanConfig.prices[currencyKey][billingKey];

    // TODO: Calculate pro-rated amount for remaining period
    // For now, immediate upgrade with full new price
    
    const updatedSubscription = await SubscriptionModel.update(subscriptionId, {
      plan_type: newPlanType,
      amount: newAmount,
      status: 'active'
    });

    return updatedSubscription;
  }

  /**
   * Downgrade subscription (scheduled at period end)
   */
  static async downgradeSubscription(subscriptionId, newPlanType, userId) {
    const subscription = await SubscriptionModel.findById(subscriptionId);
    
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (subscription.user_id !== userId) {
      throw new Error('Unauthorized');
    }

    // Validate new plan type
    try {
      await this.getPlanConfig(newPlanType);
    } catch (error) {
      throw new Error(`Invalid plan type: ${newPlanType}`);
    }

    // Schedule downgrade at period end
    const updatedSubscription = await SubscriptionModel.update(subscriptionId, {
      cancel_at_period_end: true,
      // Store new plan type in metadata for processing at period end
      metadata: {
        ...(subscription.metadata || {}),
        scheduled_plan_type: newPlanType
      }
    });

    return updatedSubscription;
  }

  /**
   * Cancel subscription
   */
  static async cancelSubscription(subscriptionId, immediately = false, userId) {
    const subscription = await SubscriptionModel.findById(subscriptionId);
    
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (subscription.user_id !== userId) {
      throw new Error('Unauthorized');
    }

    if (immediately) {
      // Cancel immediately, revert to free plan
      await SubscriptionModel.updateStatus(subscriptionId, 'cancelled');
      
      // Create free subscription
      await this.createSubscription(userId, 'free', 'monthly');
    } else {
      // Cancel at period end
      await SubscriptionModel.cancel(subscriptionId, true);
    }

    return { success: true, message: immediately ? 'Subscription cancelled immediately' : 'Subscription will be cancelled at period end' };
  }

  /**
   * Process subscription renewal
   */
  static async renewSubscription(subscriptionId) {
    const subscription = await SubscriptionModel.findById(subscriptionId);
    
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (subscription.status !== 'active') {
      throw new Error('Subscription is not active');
    }

    // Check if renewal is needed (period has ended)
    const now = new Date();
    if (new Date(subscription.current_period_end) > now) {
      return subscription; // Not yet time to renew
    }

    // TODO: Process payment via payment gateway
    // For now, just extend the period
    
    const newPeriodEnd = new Date(subscription.current_period_end);
    if (subscription.billing_cycle === 'monthly') {
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
    } else {
      newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 1);
    }

    const updatedSubscription = await SubscriptionModel.update(subscriptionId, {
      current_period_start: new Date(),
      current_period_end: newPeriodEnd,
      status: 'active'
    });

    return updatedSubscription;
  }

  /**
   * Process subscription payment
   */
  static async processSubscriptionPayment(subscriptionId, paymentData) {
    const subscription = await SubscriptionModel.findById(subscriptionId);
    
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Create payment record
    const payment = await PaymentModel.create({
      payment_id: uuidv4(),
      amount: subscription.amount,
      currency: subscription.currency,
      type: 'subscription',
      payment_type: 'subscription',
      status: 'completed',
      payment_method: paymentData.payment_method,
      transaction_ref: paymentData.transaction_ref,
      processor_response: paymentData.processor_response,
      user_id: subscription.user_id,
      subscription_id: subscriptionId,
      metadata: {
        billing_cycle: subscription.billing_cycle,
        plan_type: subscription.plan_type
      }
    });

    // Update subscription status
    await SubscriptionModel.updateStatus(subscriptionId, 'active');

    return payment;
  }

  /**
   * Check feature access for user
   */
  static async checkFeatureAccess(userId, feature) {
    const subscription = await this.getCurrentSubscription(userId);
    return subscription.features?.includes(feature) || false;
  }

  /**
   * Sync subscription from payment provider (webhook)
   */
  static async syncSubscriptionFromProvider(providerId, providerData) {
    // TODO: Implement Stripe/PayPal webhook sync
    // This would update subscription status based on provider events
    
    const subscription = await SubscriptionModel.findByStripeSubscriptionId(providerId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Update subscription based on provider data
    const updateData = {
      status: providerData.status,
      current_period_end: providerData.current_period_end,
      cancel_at_period_end: providerData.cancel_at_period_end || false
    };

    return await SubscriptionModel.update(subscription.id, updateData);
  }

  /**
   * Get subscription usage statistics
   */
  static async getUsage(userId) {
    const subscription = await this.getCurrentSubscription(userId);
    // TODO: Get actual usage from SitePageUsageModel
    return {
      plan_type: subscription.plan_type,
      limits: subscription.limits,
      usage: {
        pages: 0, // TODO: Get from SitePageUsageModel
        custom_domains: 0, // TODO: Get from CustomDomainModel
        sites: 0 // TODO: Get from SiteModel
      }
    };
  }
}

module.exports = SubscriptionService;

