const PaymentService = require('../services/payment.service');
const PaymentProcessorService = require('../services/paymentProcessor.service');
const { validatePaymentData, validatePaymentVerification } = require('../utils/validators');

// Optional referral tracking - wrap in try-catch to handle missing module
let extractReferralCode, trackDonationConversion;
try {
  const referralTracking = require('../../referrals/utils/referral-tracking');
  extractReferralCode = referralTracking.extractReferralCode;
  trackDonationConversion = referralTracking.trackDonationConversion;
} catch (error) {
  // Referral tracking module not available - provide no-op functions
  extractReferralCode = () => null;
  trackDonationConversion = async () => {};
}

class PaymentController {
  constructor() {
    this.paymentService = PaymentService;
    this.paymentProcessorService = PaymentProcessorService;
  }

  // Create payment intent
  async createPayment(req, res) {
    try {
      const { error } = validatePaymentData(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message
        });
      }

      // Check if we should link this donation to an existing user by email
      // optionalAuth middleware sets req.user if token is present, otherwise req.user is null/undefined
      let donorId = req.user?.id || req.user?.user_id;
      let shouldLinkByEmail = false;
      let userEmail = null;
      
      // If user is authenticated (token present), get their email using User model
      if (donorId) {
        try {
          const UserModel = require('../../users/models/user.model');
          const user = await UserModel.findById(donorId);
          if (user && user.email) {
            userEmail = user.email;
            console.log('[Payment] Authenticated user email retrieved:', userEmail.substring(0, 5) + '...');
          } else {
            console.warn('[Payment] User found but no email:', { donorId, user: user ? 'exists' : 'null' });
          }
        } catch (err) {
          console.error('[Payment] Error fetching user email:', err.message || err);
        }
      } else {
        console.log('[Payment] No authenticated user found (optionalAuth allows anonymous):', { hasUser: !!req.user });
      }
      
      if (!donorId && req.body.anonymous_donor_email) {
        // Try to find a user with this email
        const AuthModel = require('../../auth/models/auth.model');
        const existingUser = await AuthModel.findByIdentifier(req.body.anonymous_donor_email);
        
        if (existingUser) {
          donorId = existingUser.id;
          userEmail = existingUser.email;
          shouldLinkByEmail = true;
        }
      }

      // Use redirect_url from request body (frontend sends the full callback URL)
      const redirectUrl = req.body.redirect_url || `${process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:4070'}/payments/callback`;

      // Final email - prioritize authenticated user email
      const finalEmail = userEmail || req.body.anonymous_donor_email || req.body.email || req.body.donor_email;
      
      console.log('[Payment] Payment data preparation:', {
        hasUser: !!req.user,
        donorId: donorId || 'none',
        userEmail: userEmail ? userEmail.substring(0, 5) + '...' : 'none',
        finalEmail: finalEmail ? finalEmail.substring(0, 5) + '...' : 'none',
        requestBodyEmail: req.body.email || req.body.anonymous_donor_email || 'none'
      });

      const paymentData = {
        ...req.body,
        redirect_url: redirectUrl, // Ensure redirect_url uses frontend base URL
        donor_id: donorId,
        user_id: donorId, // Also set user_id for subscription payments
        // Ensure email is available for payment processors (Paystack requires email)
        email: finalEmail,
        anonymous_donor_email: finalEmail,
        user_agent: req.headers['user-agent'],
        ip_address: req.ip
      };

      // Check if campaign supports the selected payment method
      if (paymentData.campaign_id) {
        const CampaignPaymentMethod = require('../models/campaign-payment-method.model');
        const isSupported = await CampaignPaymentMethod.isSupported(paymentData.campaign_id, req.body.payment_method);
        
        if (!isSupported) {
          return res.status(400).json({
            success: false,
            message: `Payment method '${req.body.payment_method}' is not supported for this campaign`
          });
        }
      }

      // REMOVED: Duplicate payment creation - payment processor service handles this
      // const payment = await this.paymentService.createPayment(paymentData);

      // Initialize payment with provider (get payment link)
      let paymentLink = null;
      let bankAccount = null;
      let payment = null;
      try {
        console.log('[Payment] Initializing payment with processor:', {
          method: req.body.payment_method,
          hasEmail: !!paymentData.email,
          email: paymentData.email ? paymentData.email.substring(0, 5) + '...' : 'missing'
        });
        
        const processorResult = await this.paymentProcessorService.initializePayment(paymentData, req.body.payment_method);
        paymentLink = processorResult?.paymentLink || processorResult?.authorization_url || processorResult?.redirect_url || null;
        bankAccount = processorResult?.bank_account || null;
        payment = processorResult?.payment || null; // Get payment from processor result
        
        console.log('[Payment] Processor result:', {
          hasPaymentLink: !!paymentLink,
          hasAuthorizationUrl: !!processorResult?.authorization_url,
          hasRedirectUrl: !!processorResult?.redirect_url,
          paymentId: payment?.payment_id
        });
        
        // If payment link is still null, the initialization likely failed
        if (!paymentLink && req.body.payment_method !== 'direct_transfer') {
          console.error('[Payment] Payment processor initialization failed: No payment link returned', {
            processorResult: processorResult ? Object.keys(processorResult) : 'null',
            method: req.body.payment_method
          });
        }
      } catch (initErr) {
        // Log the error but still return the payment if it was created
        console.error('[Payment] Payment processor initialization error:', {
          error: initErr.message || initErr,
          stack: initErr.stack,
          paymentMethod: req.body.payment_method
        });
        // Re-throw if it's a critical error (e.g., missing email for Paystack, API key issues)
        const errorMessage = (initErr.message || '').toLowerCase();
        if (errorMessage.includes('email') || errorMessage.includes('api key') || errorMessage.includes('required')) {
          console.error('[Payment] Critical error - re-throwing:', initErr.message);
          throw initErr;
        }
      }

      let message = 'Payment created successfully';
      if (shouldLinkByEmail) {
        message = 'Payment created successfully and linked to your account by email';
      }

      res.status(201).json({
        success: true,
        message: message,
        data: {
          payment_id: payment?.payment_id,
          amount: payment?.amount || paymentData.amount,
          currency: payment?.currency || paymentData.currency,
          status: payment?.status || 'pending',
          paymentLink,
          bankAccount,
          linkedByEmail: shouldLinkByEmail
        }
      });
    } catch (error) {
      console.error('Payment creation error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error creating payment'
      });
    }
  }

  // Process payment
  async processPayment(req, res) {
    try {
      const { payment_id, processor } = req.body;

      if (!payment_id || !processor) {
        return res.status(400).json({
          success: false,
          message: 'Payment ID and processor are required'
        });
      }

      const payment = await this.paymentService.getPaymentByPaymentId(payment_id);
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      const processorResult = await this.paymentProcessorService.initializePayment(payment, processor);

      res.json({
        success: true,
        message: 'Payment initialized successfully',
        data: processorResult
      });
    } catch (error) {
      console.error('Payment processing error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error processing payment'
      });
    }
  }

  // Verify payment
  async verifyPayment(req, res) {
    try {
      // Get reference from URL params (GET /verify/:reference) or request body (POST requests)
      const reference = req.params.reference || req.body.reference || req.query.reference;
      const transactionId = req.body.transactionId || req.query.transaction_id;

      if (!reference) {
        return res.status(400).json({
          success: false,
          message: 'Payment reference is required'
        });
      }

      const payment = await this.paymentService.paymentModel.findByTransactionRef(reference);
      if (!payment) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
      }

      const processor = payment.payment_method;

      // Verify with payment processor
      const verificationResult = await this.paymentProcessorService.verifyPayment(reference, processor, transactionId);

      if (verificationResult.success && (verificationResult.status === 'successful' || verificationResult.status === 'success')) {
        // Update payment status
        await this.paymentService.verifyPayment(payment.payment_id, reference, transactionId, processor);
        
        // Get updated payment data
        const updatedPayment = await this.paymentService.paymentModel.findByTransactionRef(reference);
        
        // Track referral conversion if payment is successful and referral code exists
        try {
          const referralCode = extractReferralCode(req);
          if (referralCode && updatedPayment.donor_id) {
            await trackDonationConversion(
              referralCode,
              {
                id: updatedPayment.payment_id,
                amount: updatedPayment.amount,
                paymentMethod: updatedPayment.payment_method,
                currency: updatedPayment.currency
              },
              req
            );
          }
        } catch (referralError) {
          console.error('Failed to track referral conversion during payment verification:', referralError);
        }
        
        return res.status(200).json({
          success: true,
          message: 'Payment verification completed',
          data: {
            ...updatedPayment,
            verifiedStatus: verificationResult.status,
            providerMessage: verificationResult.message || 'Payment verified successfully',
            verificationData: verificationResult
          }
        });
      } else {
        return res.status(200).json({
          success: true,
          message: 'Payment verification completed',
          data: {
            ...payment,
            verifiedStatus: verificationResult.status,
            providerMessage: verificationResult.message || 'Payment verification failed',
            verificationData: verificationResult
          }
        });
      }
    } catch (error) {
      console.error('Payment verification error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error verifying payment'
      });
    }
  }

  // Get payment details
  async getPayment(req, res) {
    try {
      const { id } = req.params;
      const payment = await this.paymentService.getPaymentById(id);

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      // Check if user has permission to view this payment
      const userId = req.user?.user_id || req.user?.id;
      if (req.user && payment.user_id !== userId && payment.donor_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      res.json({
        success: true,
        data: payment
      });
    } catch (error) {
      console.error('Get payment error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving payment'
      });
    }
  }

  // Get user payment history
  async getUserPayments(req, res) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const { page = 1, limit = 20, status } = req.query;
      const offset = (page - 1) * limit;

      const options = {
        limit: parseInt(limit),
        offset: parseInt(offset),
        status
      };

      const userId = req.user.user_id || req.user.id;
      const payments = await this.paymentService.getPaymentsByUser(userId, options);

      // Get total count for pagination
      const totalCount = await this.paymentService.getUserPaymentsCount(userId, status);
      const totalPages = Math.ceil(totalCount / parseInt(limit));

      res.json({
        success: true,
        data: payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          totalPages: totalPages,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      });
    } catch (error) {
      console.error('Get user payments error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving user payments'
      });
    }
  }

  // Get user donation summary
  async getUserDonationSummary(req, res) {
    try {
      const userId = req.user.user_id || req.user.id;
      const summary = await this.paymentService.getUserDonationSummary(userId);

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Get user donation summary error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving user donation summary'
      });
    }
  }

  // Get campaign payments
  async getCampaignPayments(req, res) {
    try {
      const { campaignId } = req.params;
      const { page = 1, limit = 20, status } = req.query;
      const offset = (page - 1) * limit;

      const options = {
        limit: parseInt(limit),
        offset: parseInt(offset),
        status
      };

      const payments = await this.paymentService.getPaymentsByCampaign(campaignId, options);

      res.json({
        success: true,
        data: payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: payments.length
        }
      });
    } catch (error) {
      console.error('Get campaign payments error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving campaign payments'
      });
    }
  }

  // Webhook handlers
  async handleWebhook(req, res) {
    try {
      const { processor } = req.params;
      const signature = req.headers['x-paystack-signature'] || req.headers['verif-hash'];
      const payload = req.body;

      // Verify webhook signature
      const isValid = await this.paymentProcessorService.verifyWebhook(payload, signature, processor);
      
      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid webhook signature'
        });
      }

      // Process webhook based on processor
      let paymentId, reference;
      
      if (processor === 'paystack') {
        paymentId = payload.data?.metadata?.payment_id;
        reference = payload.data?.reference;
      } else if (processor === 'flutterwave') {
        paymentId = payload.meta?.payment_id;
        reference = payload.tx_ref;
      }

      if (paymentId && reference) {
        // Update payment status
        await this.paymentService.verifyPayment(paymentId, reference);
      }

      res.json({
        success: true,
        message: 'Webhook processed successfully'
      });
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error processing webhook'
      });
    }
  }

  // Payment callback handler for provider redirects
  async handlePaymentCallback(req, res) {
    const { txRef, status, transactionId } = req.body;
    try {
      // Find payment by txRef (transaction reference)
      const payment = await this.paymentService.paymentModel.findByTransactionRef(txRef);
      if (!payment) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
      }

      // Verify the transaction status with Flutterwave (or other provider)
      // For now, only Flutterwave is implemented
      let verifiedStatus = status;
      let providerMessage = '';
      let verificationData = null;
      if (payment.provider === 'flutterwave' && transactionId) {
        const axios = require('axios');
        const response = await axios.get(
          `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
          {
            headers: {
              Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (!response.data || response.data.status !== 'success') {
          return res.status(500).json({
            success: false,
            message: 'Failed to verify transaction status with Flutterwave',
          });
        }
        verifiedStatus = response.data.data.status;
        providerMessage = response.data.message;
        verificationData = response.data.data;
      }

      // Update payment status in the payments table based on verified status
      await this.paymentService.paymentModel.updateStatus(payment.id, verifiedStatus);
      payment.status = verifiedStatus;

      // Optionally update provider transaction log here (if you have such a table)
      // await updateFlutterwaveTransaction(...)

      // Optionally send email notifications here

      return res.status(200).json({
        success: true,
        message: 'Payment processed',
        data: {
          ...payment,
          verifiedStatus,
          providerMessage,
          verificationData,
        },
      });
    } catch (err) {
      console.error('Error processing payment callback:', err);
      return res.status(500).json({
        success: false,
        message: 'Error processing payment callback',
        error: err.message || 'Something went wrong',
      });
    }
  }

  // Admin functions
  async getAllPayments(req, res) {
    try { 
      const { page = 1, limit = 50, status, type, payment_method, start_date, end_date, campaign } = req.query;
      const offset = (page - 1) * limit;

      const options = {
        limit: parseInt(limit),
        offset: parseInt(offset),
        status,
        type,
        payment_method,
        start_date,
        end_date,
        campaign
      };

      const result = await this.paymentService.paymentModel.findAll(options);

      res.json({
        success: true,
        data: result.payments,
        pagination: {
          currentPage: result.page,
          totalPages: result.totalPages,
          totalItems: result.total,
          itemsPerPage: result.limit,
          hasNextPage: result.page < result.totalPages,
          hasPreviousPage: result.page > 1
        },
        message: `Retrieved ${result.payments.length} payments successfully`
      });
    } catch (error) {
      console.error('Get all payments error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving payments'
      });
    }
  }

  async refundPayment(req, res) {
    try {
      

      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Refund reason is required'
        });
      }

      const refundedPayment = await this.paymentService.refundPayment(id, reason);

      res.json({
        success: true,
        message: 'Payment refunded successfully',
        data: refundedPayment
      });
    } catch (error) {
      console.error('Refund payment error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error refunding payment'
      });
    }
  }

  async updatePayment(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const payment = await this.paymentService.paymentModel.findById(id);
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      const additionalData = { ...updateData };
      if (updateData.status === 'completed') {
        additionalData.paid_at = additionalData.paid_at || new Date();
      }

      const updatedPayment = await this.paymentService.paymentModel.updateStatus(id, updateData.status, additionalData);

      // When admin approves (status -> completed): create/link/activate subscription when subscription_id is null (e.g. donor_id-only subscription payments)
      if (updateData.status === 'completed') {
        try {
          await this.paymentService.activateSubscriptionForCompletedPayment(payment, id);
          // If payment already had a subscription_id, activateSubscriptionForCompletedPayment handles activation; otherwise it creates and links
          if (payment.subscription_id) {
            const SubscriptionService = require('../services/subscription.service');
            await SubscriptionService.renewSubscription(payment.subscription_id);
          }
        } catch (subErr) {
          console.error('[Payment] Admin approve: subscription activation/renewal failed:', subErr.message);
        }
      }

      res.json({
        success: true,
        message: 'Payment updated successfully',
        data: updatedPayment
      });
    } catch (error) {
      console.error('Update payment error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error updating payment'
      });
    }
  }

  // Admin: get payment by id (full details, no ownership check)
  async getPaymentAdmin(req, res) {
    try {
      const { id } = req.params;
      const payment = await this.paymentService.getPaymentById(id);
      if (!payment) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
      }
      res.json({ success: true, data: payment });
    } catch (error) {
      console.error('Get payment admin error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving payment'
      });
    }
  }

  // Admin: requery payment with provider (Paystack/Flutterwave) to update status
  async requeryPayment(req, res) {
    try {
      const { id } = req.params;
      const payment = await this.paymentService.paymentModel.findById(id);
      if (!payment) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
      }
      if (payment.payment_method === 'direct_transfer') {
        return res.status(400).json({
          success: false,
          message: 'Use Approve for direct transfer payments instead of Requery'
        });
      }

      const reference = payment.transaction_ref || payment.payment_id;
      let transactionId = null;
      if (payment.payment_method === 'flutterwave' && payment.processor_response) {
        try {
          const pr = typeof payment.processor_response === 'string'
            ? JSON.parse(payment.processor_response) : payment.processor_response;
          transactionId = pr.id || pr.transaction_id || payment.transaction_ref;
        } catch (_) {
          transactionId = payment.transaction_ref;
        }
      }

      const verificationResult = await this.paymentProcessorService.verifyPayment(
        reference,
        payment.payment_method,
        transactionId
      );

      const isSuccess = verificationResult.success &&
        (verificationResult.status === 'successful' || verificationResult.status === 'success');

      if (isSuccess) {
        await this.paymentService.verifyPayment(
          payment.payment_id,
          reference,
          transactionId,
          payment.payment_method
        );
      }

      const updatedPayment = await this.paymentService.paymentModel.findById(id);
      res.json({
        success: true,
        message: isSuccess ? 'Payment verified and updated' : 'Requery completed; status unchanged',
        data: updatedPayment,
        verification: {
          provider_status: verificationResult.status,
          message: verificationResult.message || verificationResult.gateway_ref
        }
      });
    } catch (error) {
      console.error('Requery payment error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error requerying payment'
      });
    }
  }

  // Get payment statistics
  async getPaymentStats(req, res) {
    try {
      const { start_date, end_date, status, type } = req.query;
      const filters = { start_date, end_date, status, type };

      const stats = await this.paymentService.getPaymentStats(filters);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get payment stats error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving payment statistics'
      });
    }
  }

  // Public payment statistics for dashboard
  async getPublicPaymentStats(req, res) {
    try {
      // Get payment stats (total donations, dues, donors, etc.)
      const stats = await this.paymentService.getPaymentStats({});
      
      // Get recent payments
      const recentPayments = await this.paymentService.getRecentPayments(5);
      
      // Campaign stats (SmartStore has no campaigns table; use zeros)
      const totalCampaigns = 0;
      const activeCampaigns = 0;

      // Calculate monthly goal and progress (example logic, adjust as needed)
      const monthlyGoal = 500000; // You can make this dynamic if needed
      const monthlyProgress = stats.total_donations && monthlyGoal ? Math.round((stats.total_donations / monthlyGoal) * 100) : 0;

      res.json({
        success: true,
        data: {
          totalDonations: parseFloat(stats.total_donations) || 0,
          totalDues: parseFloat(stats.total_dues) || 0,
          totalCampaigns,
          activeCampaigns,
          totalDonors: parseInt(stats.unique_donors) || 0,
          monthlyGoal,
          monthlyProgress,
          recentPayments: recentPayments || []
        }
      });
    } catch (error) {
      console.error('Get public payment stats error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving payment statistics'
      });
    }
  }

  // Generate receipt
  async generateReceipt(req, res) {
    try {
      const { id } = req.params;

      const payment = await this.paymentService.getPaymentById(id);
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      // Check if user has permission to view this payment
      const userId = req.user?.user_id || req.user?.id;
      if (req.user && payment.user_id !== userId && payment.donor_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      const receiptUrl = await this.paymentService.generateReceiptUrl(id);

      res.json({
        success: true,
        data: {
          receipt_url: receiptUrl
        }
      });
    } catch (error) {
      console.error('Generate receipt error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error generating receipt'
      });
    }
  }

  // Upload proof of payment for direct transfer
  async uploadProofOfPayment(req, res) {
    try {
      const { paymentId } = req.params;
      const { receipt_file_id, notes } = req.body;
      
      if (!receipt_file_id) {
        return res.status(400).json({
          success: false,
          message: 'Receipt file is required'
        });
      }

      // Get payment details by payment_id (external ID)
      const payment = await this.paymentService.getPaymentByPaymentId(paymentId);
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      // Check if this is a direct transfer payment
      if (payment.payment_method !== 'direct_transfer') {
        return res.status(400).json({
          success: false,
          message: 'This payment is not a direct transfer'
        });
      }

      // Update payment with receipt information using internal ID
      const updatedPayment = await this.paymentService.updatePaymentReceipt(payment.id, {
        receipt_file_id,
        notes,
        status: 'pending_verification'
      });

      res.json({
        success: true,
        message: 'Proof of payment uploaded successfully',
        data: {
          payment: updatedPayment
        }
      });
    } catch (error) {
      console.error('Upload proof of payment error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error uploading proof of payment'
      });
    }
  }

  // Get bank account information for direct transfer payment
  async getPaymentBankAccount(req, res) {
    try {
      const { paymentId } = req.params;
      
      // Get payment details by payment_id (external ID)
      const payment = await this.paymentService.getPaymentByPaymentId(paymentId);
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      // Check if this is a direct transfer payment
      if (payment.payment_method !== 'direct_transfer') {
        return res.status(400).json({
          success: false,
          message: 'This payment is not a direct transfer'
        });
      }

      // Get all campaign-specific bank accounts
      const CampaignBankAccount = require('../models/campaign-bank-account.model');
      let bankAccounts = await CampaignBankAccount.getByCampaignId(payment.campaign_id);
      
      // Fallback to global active bank account if no campaign-specific accounts
      if (!bankAccounts || bankAccounts.length === 0) {
        const BankAccount = require('../models/bankAccount.model');
        const globalBankAccount = await BankAccount.getActive();
        
        if (globalBankAccount) {
          bankAccounts = [{
            id: globalBankAccount.id,
            bank_name: globalBankAccount.bank_name,
            account_name: globalBankAccount.account_name,
            account_number: globalBankAccount.account_number,
            is_primary: true,
            is_active: true
          }];
        } else {
          return res.status(404).json({
            success: false,
            message: 'No bank account configured for this campaign'
          });
        }
      }

      res.json({
        success: true,
        data: {
          payment: {
            payment_id: payment.payment_id,
            amount: payment.amount,
            currency: payment.currency,
            status: payment.status,
            anonymous_donor_first_name: payment.anonymous_donor_first_name,
            anonymous_donor_last_name: payment.anonymous_donor_last_name,
            anonymous_donor_email: payment.anonymous_donor_email,
            anonymous_donor_phone: payment.anonymous_donor_phone,
            purpose: payment.purpose,
            created_at: payment.created_at
          },
          bank_accounts: bankAccounts.map(account => ({
            id: account.id,
            bank_name: account.bank_name,
            account_name: account.account_name,
            account_number: account.account_number,
            is_primary: account.is_primary,
            is_active: account.is_active
          }))
        }
      });
    } catch (error) {
      console.error('Get payment bank account error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving bank account information'
      });
    }
  }

  async getPaymentByReference(req, res) {
    try {
      const { reference } = req.params;

      if (!reference) {
        return res.status(400).json({
          success: false,
          message: 'Payment reference is required'
        });
      }

      const result = await this.paymentService.paymentModel.findByReference(reference);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      res.json({
        success: true,
        data: result,
        message: 'Payment retrieved successfully'
      });
    } catch (error) {
      console.error('Get payment by reference error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving payment'
      });
    }
  }
}

module.exports = new PaymentController(); 