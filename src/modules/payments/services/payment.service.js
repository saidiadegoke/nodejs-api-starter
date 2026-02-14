const Payment = require('../models/payment.model');
const Campaign = require('../models/campaign.model');
const Donor = require('../models/donor.model');
const PaymentMethod = require('../models/paymentMethod.model');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class PaymentService {
  constructor() {
    this.paymentModel = Payment;
    this.campaignModel = Campaign;
    this.donorModel = Donor;
    this.paymentMethodModel = PaymentMethod;
    this.defaultProvider = 'flutterwave';
  }

  // Get default payment provider
  getDefaultProvider() {
    return this.defaultProvider;
  }

  // Set default payment provider
  setDefaultProvider(provider) {
    const validProviders = ['flutterwave', 'paystack', 'squad'];
    if (!validProviders.includes(provider)) {
      throw new Error('Invalid payment provider');
    }
    this.defaultProvider = provider;
  }

  // Create a new payment
  async createPayment(paymentData) {
    try {
      // Generate unique payment ID
      const payment_id = `PAY_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
      
      // Validate amount
      if (!paymentData.amount || paymentData.amount <= 0) {
        throw new Error('Invalid amount');
      }

      // Validate payment type
      const validTypes = ['donation', 'dues', 'campaign', 'event', 'merchandise', 'subscription'];
      if (!validTypes.includes(paymentData.type)) {
        throw new Error('Invalid payment type');
      }

      // Validate campaign if provided
      if (paymentData.campaign_id) {
        const campaign = await this.campaignModel.findById(paymentData.campaign_id);
        if (!campaign || campaign.status !== 'active') {
          throw new Error('Invalid or inactive campaign');
        }
      }

      // Create payment record
      const payment = await this.paymentModel.create({
        ...paymentData,
        payment_id,
        status: 'pending'
      });

      return payment;
    } catch (error) {
      throw new Error(`Error creating payment: ${error.message}`);
    }
  }

  // Process payment with payment processor
  async processPayment(paymentId, processorData) {
    try {
      const payment = await this.paymentModel.findByPaymentId(paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status !== 'pending') {
        throw new Error('Payment is not in pending status');
      }

      // Update payment with processor data
      const updatedPayment = await this.paymentModel.updateStatus(payment.id, 'processing', {
        transaction_ref: processorData.transaction_ref,
        processor_response: processorData.response
      });

      return updatedPayment;
    } catch (error) {
      throw new Error(`Error processing payment: ${error.message}`);
    }
  }

  // Verify payment completion
  async verifyPayment(paymentId, transactionRef, transactionId, processor) {
    try {
      const payment = await this.paymentModel.findByPaymentId(paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }

      // Update payment status to completed
      const updatedPayment = await this.paymentModel.updateStatus(payment.id, 'completed', {
        transaction_ref: processor === "flutterwave"? transactionId: transactionRef,
        paid_at: new Date()
      });

      // Update campaign totals if campaign payment
      if (payment.campaign_id) {
        await this.campaignModel.updateTotals(payment.campaign_id, payment.amount, true);
      }

      // Update donor totals only for donation/campaign payments (not for subscription payments)
      // Subscription payments should not update donor records
      const isDonationPayment = payment.type === 'donation' || payment.type === 'campaign' || payment.type === 'dues';
      if (payment.donor_id && isDonationPayment) {
        try {
          await this.donorModel.updateDonationTotals(payment.donor_id, payment.amount, true);
          await this.donorModel.setFirstDonationDate(payment.donor_id);
        } catch (donorError) {
          // Don't fail payment verification if donor update fails (donors table might not exist)
          // Log the error but continue with payment verification
          console.warn('[Payment] Failed to update donor totals (non-critical):', donorError.message);
        }
      }

      // For subscription payments, handle subscription activation
      if (payment.type === 'subscription' || payment.payment_type === 'subscription') {
        try {
          const SubscriptionService = require('./subscription.service');
          const SubscriptionModel = require('../models/subscription.model');
          
          // Get plan details from payment metadata
          const metadata = payment.metadata || {};
          const planType = metadata.plan_type;
          const billingCycle = metadata.billing_cycle || 'monthly';
          const currency = payment.currency || 'NGN';
          const userId = payment.user_id || payment.donor_id;
          
          if (!userId) {
            console.warn('[Payment] Cannot activate subscription: No user_id found in payment', {
              payment_id: payment.payment_id
            });
          } else if (!planType) {
            console.warn('[Payment] Cannot activate subscription: No plan_type in payment metadata', {
              payment_id: payment.payment_id,
              metadata: metadata
            });
          } else {
            let subscription;
            
            // If payment already has a subscription_id, use it
            if (payment.subscription_id) {
              subscription = await SubscriptionModel.findById(payment.subscription_id);
              
              if (!subscription) {
                console.warn('[Payment] Subscription ID in payment not found, creating new subscription', {
                  subscription_id: payment.subscription_id,
                  payment_id: payment.payment_id
                });
                // Subscription doesn't exist, create new one
                subscription = await SubscriptionService.createSubscription(
                  userId,
                  planType,
                  billingCycle,
                  currency
                );
                
                // Link payment to subscription
                const pool = require('../../../db/pool');
                await pool.query(
                  'UPDATE payments SET subscription_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                  [subscription.id, updatedPayment.id]
                );
              }
            } else {
              // Check if user has an existing subscription
              const existingSubscription = await SubscriptionModel.getActiveSubscription(userId);
              
              if (existingSubscription) {
                // Upgrade existing subscription
                subscription = await SubscriptionService.upgradeSubscription(
                  existingSubscription.id,
                  planType,
                  userId
                );
                
                // Link payment to subscription
                const pool = require('../../../db/pool');
                await pool.query(
                  'UPDATE payments SET subscription_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                  [subscription.id, updatedPayment.id]
                );
              } else {
                // Create new subscription
                subscription = await SubscriptionService.createSubscription(
                  userId,
                  planType,
                  billingCycle,
                  currency
                );
                
                // Link payment to subscription
                const pool = require('../../../db/pool');
                await pool.query(
                  'UPDATE payments SET subscription_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                  [subscription.id, updatedPayment.id]
                );
              }
            }
            
            // Activate subscription (if not already active)
            if (subscription && subscription.status !== 'active') {
              await SubscriptionModel.updateStatus(subscription.id, 'active');
              console.log('[Payment] Subscription activated:', {
                subscription_id: subscription.id,
                plan_type: planType,
                user_id: userId
              });
            } else if (subscription && subscription.status === 'active') {
              console.log('[Payment] Subscription already active:', {
                subscription_id: subscription.id,
                plan_type: planType,
                user_id: userId
              });
            }
          }
        } catch (subscriptionError) {
          // Don't fail payment verification if subscription activation fails
          // Log the error but continue
          console.error('[Payment] Failed to activate subscription (non-critical):', {
            error: subscriptionError.message,
            stack: subscriptionError.stack,
            payment_id: payment.payment_id
          });
        }
      }

      // Merchandise: send order confirmation & receipt email to customer (non-blocking)
      if (payment.type === 'merchandise' || payment.payment_type === 'merchandise') {
        const orderEmailService = require('./orderEmail.service');
        orderEmailService.sendOrderConfirmationEmail(updatedPayment).catch((err) => {
          console.error('[Payment] Order confirmation email failed (non-critical):', err.message);
        });
      }

      return updatedPayment;
    } catch (error) {
      throw new Error(`Error verifying payment: ${error.message}`);
    }
  }

  // Refund payment
  async refundPayment(paymentId, reason) {
    try {
      const payment = await this.paymentModel.findByPaymentId(paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status !== 'completed') {
        throw new Error('Payment is not completed');
      }

      // Update payment status to refunded
      const updatedPayment = await this.paymentModel.updateStatus(payment.id, 'refunded', {
        notes: reason
      });

      // Update campaign totals if campaign payment
      if (payment.campaign_id) {
        await this.campaignModel.updateTotals(payment.campaign_id, payment.amount, false);
      }

      // Update donor totals only for donation/campaign payments (not for subscription payments)
      const isDonationPayment = payment.type === 'donation' || payment.type === 'campaign' || payment.type === 'dues';
      if (payment.donor_id && isDonationPayment) {
        try {
          await this.donorModel.updateDonationTotals(payment.donor_id, payment.amount, false);
        } catch (donorError) {
          // Don't fail refund if donor update fails (donors table might not exist)
          console.warn('[Payment] Failed to update donor totals on refund (non-critical):', donorError.message);
        }
      }

      return updatedPayment;
    } catch (error) {
      throw new Error(`Error refunding payment: ${error.message}`);
    }
  }

  // Calculate fees for payment method
  async calculateFees(amount, paymentMethodCode) {
    try {
      const fee = await this.paymentMethodModel.calculateFee(amount, paymentMethodCode);
      return {
        amount,
        fee,
        total: amount + fee
      };
    } catch (error) {
      throw new Error(`Error calculating fees: ${error.message}`);
    }
  }

  // Calculate net amount after fees
  async calculateNetAmount(amount, paymentMethodCode) {
    try {
      const fee = await this.paymentMethodModel.calculateFee(amount, paymentMethodCode);
      return amount - fee;
    } catch (error) {
      throw new Error(`Error calculating net amount: ${error.message}`);
    }
  }

  // Get payment by payment_id (external ID)
  async getPaymentByPaymentId(paymentId) {
    try {
      const payment = await this.paymentModel.findByPaymentId(paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }
      return payment;
    } catch (error) {
      throw new Error(`Error getting payment: ${error.message}`);
    }
  }

  // Get payment by internal ID
  async getPaymentById(id) {
    try {
      return await this.paymentModel.findById(id);
    } catch (error) {
      throw new Error(`Error getting payment: ${error.message}`);
    }
  }

  // Get payments by user
  async getPaymentsByUser(userId, options = {}) {
    try {
      return await this.paymentModel.findByUserId(userId, options);
    } catch (error) {
      throw new Error(`Error getting user payments: ${error.message}`);
    }
  }

  // Get user payments count for pagination
  async getUserPaymentsCount(userId, status = null) {
    try {
      return await this.paymentModel.getUserPaymentsCount(userId, status);
    } catch (error) {
      throw new Error(`Error getting user payments count: ${error.message}`);
    }
  }

  // Get user donation summary
  async getUserDonationSummary(userId) {
    try {
      return await this.paymentModel.getUserDonationSummary(userId);
    } catch (error) {
      throw new Error(`Error getting user donation summary: ${error.message}`);
    }
  }

  // Get payments by campaign
  async getPaymentsByCampaign(campaignId, options = {}) {
    try {
      return await this.paymentModel.findByCampaignId(campaignId, options);
    } catch (error) {
      throw new Error(`Error getting campaign payments: ${error.message}`);
    }
  }

  // Get payment statistics
  async getPaymentStats(filters = {}) {
    try {
      return await this.paymentModel.getStats(filters);
    } catch (error) {
      throw new Error(`Error getting payment stats: ${error.message}`);
    }
  }

  // Get recent payments
  async getRecentPayments(limit = 5) {
    try {
      return await this.paymentModel.getRecentPayments(limit);
    } catch (error) {
      throw new Error(`Error getting recent payments: ${error.message}`);
    }
  }

  // Get donation trends
  async getDonationTrends(timeframe = '30d') {
    try {
      const query = `
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          COUNT(*) as payments_count,
          SUM(amount) as total_amount,
          AVG(amount) as average_amount
        FROM payments
        WHERE status = 'completed' 
          AND type = 'donation'
          AND created_at >= NOW() - INTERVAL '1 ${timeframe}'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY date DESC
      `;

      const result = await this.paymentModel.pool.query(query);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting donation trends: ${error.message}`);
    }
  }

  // Create recurring payment
  async createRecurringPayment(paymentData) {
    try {
      const recurringPayment = await this.createPayment({
        ...paymentData,
        is_recurring: true,
        recurring_interval: paymentData.recurring_interval || 'monthly'
      });

      return recurringPayment;
    } catch (error) {
      throw new Error(`Error creating recurring payment: ${error.message}`);
    }
  }

  // Update payment with receipt information
  async updatePaymentReceipt(paymentId, receiptData) {
    try {
      const { receipt_file_id, notes, status } = receiptData;
      
      // Update payment with receipt information
      const updatedPayment = await this.paymentModel.updateReceipt(paymentId, {
        receipt_file_id,
        notes,
        status
      });

      return updatedPayment;
    } catch (error) {
      throw new Error(`Error updating payment receipt: ${error.message}`);
    }
  }

  // Process recurring payments
  async processRecurringPayments() {
    try {
      const query = `
        SELECT * FROM payments 
        WHERE is_recurring = true 
          AND status = 'completed'
          AND recurring_interval IS NOT NULL
          AND created_at <= NOW() - INTERVAL '1 ' || recurring_interval
      `;

      const result = await this.paymentModel.pool.query(query);
      const recurringPayments = result.rows;

      for (const payment of recurringPayments) {
        // Create new payment for next cycle
        await this.createPayment({
          amount: payment.amount,
          currency: payment.currency,
          type: payment.type,
          campaign_id: payment.campaign_id,
          donor_id: payment.donor_id,
          anonymous_donor_first_name: payment.anonymous_donor_first_name,
          anonymous_donor_last_name: payment.anonymous_donor_last_name,
          anonymous_donor_email: payment.anonymous_donor_email,
          anonymous_donor_phone: payment.anonymous_donor_phone,
          purpose: payment.purpose,
          is_recurring: true,
          recurring_interval: payment.recurring_interval
        });
      }

      return recurringPayments.length;
    } catch (error) {
      throw new Error(`Error processing recurring payments: ${error.message}`);
    }
  }

  // Generate receipt URL
  async generateReceiptUrl(paymentId) {
    try {
      const payment = await this.paymentModel.findByPaymentId(paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }

      const receiptUrl = `/receipts/${payment.payment_id}`;
      
      // Update payment with receipt URL
      await this.paymentModel.updateStatus(payment.id, payment.status, {
        receipt_url: receiptUrl
      });

      return receiptUrl;
    } catch (error) {
      throw new Error(`Error generating receipt URL: ${error.message}`);
    }
  }

  // Get payment summary
  async getPaymentSummary(paymentId) {
    try {
      const payment = await this.paymentModel.findByPaymentId(paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }

      let campaign = null;
      if (payment.campaign_id) {
        campaign = await this.campaignModel.findById(payment.campaign_id);
      }

      let donor = null;
      if (payment.donor_id) {
        donor = await this.donorModel.findById(payment.donor_id);
      }

      return {
        payment,
        campaign,
        donor
      };
    } catch (error) {
      throw new Error(`Error getting payment summary: ${error.message}`);
    }
  }

  // Update transaction reference
  async updateTransactionRef(paymentId, transactionRef) {
    try {
      const payment = await this.paymentModel.findByPaymentId(paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }
      
      return await this.paymentModel.updateTransactionRef(payment.id, transactionRef);
    } catch (error) {
      throw new Error(`Error updating transaction reference: ${error.message}`);
    }
  }

  // Create subscription payment
  async createSubscriptionPayment(subscriptionId, paymentData) {
    try {
      const SubscriptionModel = require('../models/subscription.model');
      const subscription = await SubscriptionModel.findById(subscriptionId);
      
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Generate unique payment ID
      const payment_id = `SUB_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

      // Create payment record with subscription link
      const payment = await this.paymentModel.create({
        ...paymentData,
        payment_id,
        amount: subscription.amount,
        currency: subscription.currency,
        type: 'subscription',
        payment_type: 'subscription',
        status: 'pending',
        user_id: subscription.user_id,
        subscription_id: subscriptionId,
        is_recurring: true,
        recurring_interval: subscription.billing_cycle
      });

      return payment;
    } catch (error) {
      throw new Error(`Error creating subscription payment: ${error.message}`);
    }
  }

  // Process subscription renewal
  async processSubscriptionRenewal(subscriptionId) {
    try {
      const SubscriptionService = require('./subscription.service');
      
      // Renew subscription (extends period)
      const subscription = await SubscriptionService.renewSubscription(subscriptionId);
      
      // Create payment record for renewal
      const payment = await this.createSubscriptionPayment(subscriptionId, {
        payment_method: subscription.payment_method || 'stripe',
        metadata: {
          renewal: true,
          period_start: subscription.current_period_start,
          period_end: subscription.current_period_end
        }
      });

      // Mark payment as completed
      await this.paymentModel.updateStatus(payment.id, 'completed', {
        paid_at: new Date()
      });

      return { subscription, payment };
    } catch (error) {
      throw new Error(`Error processing subscription renewal: ${error.message}`);
    }
  }

  // Get subscription payments
  async getSubscriptionPayments(userId, options = {}) {
    try {
      // Get payments with subscription type
      const payments = await this.paymentModel.findByUserId(userId, {
        ...options,
        type: 'subscription'
      });

      return payments;
    } catch (error) {
      throw new Error(`Error getting subscription payments: ${error.message}`);
    }
  }

  // Handle subscription payment webhook
  async handleSubscriptionWebhook(webhookData) {
    try {
      const { subscription_id, payment_id, status, transaction_ref } = webhookData;

      // Find payment by subscription_id or payment_id
      const payment = subscription_id 
        ? await this.paymentModel.findBySubscriptionId?.(subscription_id)
        : await this.paymentModel.findByPaymentId(payment_id);

      if (!payment) {
        throw new Error('Payment not found');
      }

      // Update payment status
      const updatedPayment = await this.paymentModel.updateStatus(payment.id, status, {
        transaction_ref,
        paid_at: status === 'completed' ? new Date() : null
      });

      // If payment completed, update subscription
      if (status === 'completed' && subscription_id) {
        const SubscriptionService = require('./subscription.service');
        await SubscriptionService.renewSubscription(subscription_id);
      }

      return updatedPayment;
    } catch (error) {
      throw new Error(`Error handling subscription webhook: ${error.message}`);
    }
  }
}

module.exports = new PaymentService();