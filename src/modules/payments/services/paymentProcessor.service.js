const axios = require('axios');
const crypto = require('crypto');
const PaymentMethod = require('../models/paymentMethod.model');
const PaymentService = require('../services/payment.service');

class PaymentProcessorService {
  constructor() {
    this.paymentMethodModel = PaymentMethod;
    this.paymentService = PaymentService;
  }

  // Initialize payment with processor
  async initializePayment(paymentData, processor) {
    try {
      const paymentMethod = await this.paymentMethodModel.findByCode(processor);
      if (!paymentMethod || !paymentMethod.is_active) {
        throw new Error('Payment method not available');
      }

      // Create payment record for ALL payment methods (single source of truth)
      const payment = await this.paymentService.createPayment({
        ...paymentData,
        payment_method: processor,
        status: processor === 'direct_transfer' ? 'pending_transfer' : 'pending'
      });

      // Resolve per-site payment settings (fallback to platform keys)
      let sitePaystackSecretKey = null;
      let siteBankAccount = null;
      const siteId = paymentData.metadata?.site_id;
      if (siteId) {
        try {
          const SitePaymentSettings = require('../../sites/models/site-payment-settings.model');
          const siteSettings = await SitePaymentSettings.getBySiteId(siteId);
          if (siteSettings?.paystack_secret_key) sitePaystackSecretKey = siteSettings.paystack_secret_key;
          if (siteSettings?.dt_account_number) {
            siteBankAccount = {
              bank_name: siteSettings.dt_bank_name,
              account_number: siteSettings.dt_account_number,
              account_name: siteSettings.dt_account_name,
            };
          }
        } catch (e) {
          console.warn('[PaymentProcessor] Could not load site payment settings:', e?.message);
        }
      }

      switch (processor) {
        case 'paystack':
          return await this.paystackInitialize(paymentData, payment, sitePaystackSecretKey);
        case 'flutterwave':
          return await this.flutterwaveInitialize(paymentData, payment);
        case 'direct_transfer': {
          // Use site bank account if configured, otherwise fall back to platform active account
          let bankAccount = siteBankAccount;
          if (!bankAccount) {
          const BankAccount = require('../models/bankAccount.model');
          bankAccount = await BankAccount.getActive();
          }
          if (!bankAccount) {
            throw new Error('No active bank account configured');
          }

          // Send direct transfer instructions email
          try {
            const { Worker } = require('worker_threads');
            const path = require('path');
            // Fix path: from src/modules/payments/services to src/shared/utils
            const emailWorkerPath = path.join(__dirname, '../../../shared/utils/emailWorker.js');
            const worker = new Worker(emailWorkerPath);
            const confirmationLink = `${process.env.BASE_URL || process.env.FRONTEND_URL || 'https://smartstore.ng'}/payments/direct-transfer/${payment.payment_id}`;
            const currency = payment.currency || paymentData.currency || 'NGN';
            const currencySymbol = currency === 'NGN' ? '₦' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
            const formattedAmount = `${currencySymbol}${parseFloat(payment.amount).toLocaleString()}`;
            
            // Placeholders order matching direct-transfer-instructions.html template:
            // 0: name, 1: formattedAmount, 2: bank_name, 3: account_name, 4: account_number,
            // 5: payment_id, 6: confirmationLink (button), 7: confirmationLink (link URL), 8: confirmationLink (link text), 9: email
            const placeholders = [
              paymentData.first_name || paymentData.donor_name || paymentData.anonymous_donor_first_name || paymentData.email || paymentData.anonymous_donor_email || 'Customer',
              formattedAmount, // Amount with currency symbol
              bankAccount.bank_name,
              bankAccount.account_name,
              bankAccount.account_number,
              payment.payment_id, // Payment reference for note
              confirmationLink, // For button href
              confirmationLink, // For link href
              confirmationLink, // For link text (same URL)
              paymentData.email || paymentData.anonymous_donor_email || ''
            ];
            worker.postMessage({
              to: paymentData.email || paymentData.anonymous_donor_email,
              subject: 'SmartStore - Direct Bank Transfer Instructions',
              templateFile: 'direct-transfer-instructions.html',
              placeholders
            });
          } catch (err) {
            console.error('Failed to send direct transfer email:', err);
          }

          // Return redirect URL to show bank details page
          return {
            success: true,
            redirect_url: `/payments/direct-transfer/${payment.payment_id}`,
            payment_id: payment.payment_id,
            bank_account: bankAccount,
            payment: payment // Return payment object consistently
          };
        }
        default:
          throw new Error('Unsupported payment processor');
      }
    } catch (error) {
      throw new Error(`Error initializing payment: ${error.message}`);
    }
  }

  // Verify payment with processor
  async verifyPayment(reference, processor, transactionId) {
    try {
      switch (processor) {
        case 'paystack':
          return await this.paystackVerify(reference);
        case 'flutterwave':
          return await this.flutterwaveVerify(reference, transactionId);
        case 'direct_transfer':
          throw new Error('Direct transfer verification is manual and not supported via API');
        default:
          throw new Error('Unsupported payment processor');
      }
    } catch (error) {
      throw new Error(`Error verifying payment: ${error.message}`);
    }
  }

  // Process refund
  async processRefund(transactionRef, amount, processor) {
    try {
      switch (processor) {
        case 'paystack':
          return await this.paystackRefund(transactionRef, amount);
        case 'flutterwave':
          return await this.flutterwaveRefund(transactionRef, amount);
        case 'direct_transfer':
          throw new Error('Refunds are not supported for direct transfer payments');
        default:
          throw new Error('Unsupported payment processor');
      }
    } catch (error) {
      throw new Error(`Error processing refund: ${error.message}`);
    }
  }

  // Verify webhook signature
  async verifyWebhook(payload, signature, processor) {
    try {
      const paymentMethod = await this.paymentMethodModel.findByCode(processor);
      if (!paymentMethod) {
        throw new Error('Payment method not found');
      }

      switch (processor) {
        case 'paystack':
          return this.paystackVerifyWebhook(payload, signature, paymentMethod.webhook_secret);
        case 'flutterwave':
          return this.flutterwaveVerifyWebhook(payload, signature, paymentMethod.webhook_secret);
        default:
          throw new Error('Unsupported payment processor');
      }
    } catch (error) {
      throw new Error(`Error verifying webhook: ${error.message}`);
    }
  }

  // Paystack Integration
  async paystackInitialize(paymentData, payment, overrideSecretKey) {
    try {
      const paymentMethod = await this.paymentMethodModel.findByCode('paystack');
      const secretKey = overrideSecretKey || paymentMethod.api_secret_key;
      if (!secretKey) {
        throw new Error('Paystack API key not configured');
      }

      // Get email from paymentData - prioritize explicit email fields, then user email
      const email = paymentData.email || paymentData.anonymous_donor_email || paymentData.donor_email;
      
      if (!email) {
        console.error('[Paystack] Email missing in paymentData:', {
          hasEmail: !!paymentData.email,
          hasAnonymousDonorEmail: !!paymentData.anonymous_donor_email,
          hasDonorEmail: !!paymentData.donor_email,
          userId: paymentData.user_id,
          paymentId: payment?.payment_id
        });
        throw new Error('Email is required for Paystack payment initialization');
      }
      
      console.log('[Paystack] Using email for payment:', email.substring(0, 5) + '...');

      const payload = {
        amount: paymentData.amount * 100, // Paystack expects amount in kobo
        email: email,
        reference: payment.payment_id,
        callback_url: paymentData.redirect_url, // Frontend callback URL: http://localhost:4070/payments/callback
        metadata: {
          payment_id: payment.payment_id,
          campaign_id: paymentData.campaign_id,
          donor_id: paymentData.donor_id,
          user_id: paymentData.user_id,
          type: paymentData.type,
          is_recurring: paymentData.is_recurring || false,
          recurring_interval: paymentData.recurring_interval,
          plan_type: paymentData.metadata?.plan_type,
          billing_cycle: paymentData.metadata?.billing_cycle
        }
      };

      // For recurring payments, Paystack can store authorization for future charges
      // Note: For full subscription management, consider using Paystack Subscription API
      if (paymentData.is_recurring && paymentData.type === 'subscription') {
        console.log('[Paystack] Recurring payment enabled - authorization will be saved for future charges');
        // Paystack will automatically save the authorization when customer pays
        // We can use this authorization_code for future charges via Paystack Charge API
      }

      const response = await axios.post(
        'https://api.paystack.co/transaction/initialize',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.status) {
        return {
          success: true,
          authorization_url: response.data.data.authorization_url,
          reference: response.data.data.reference,
          access_code: response.data.data.access_code,
          payment: payment // Return payment object consistently
        };
      } else {
        throw new Error(response.data.message || 'Failed to initialize payment');
      }
    } catch (error) {
      throw new Error(`Paystack initialization error: ${error.message}`);
    }
  }

  async paystackVerify(reference, overrideSecretKey) {
    try {
      const paymentMethod = await this.paymentMethodModel.findByCode('paystack');
      const secretKey = overrideSecretKey || paymentMethod.api_secret_key;
      if (!secretKey) {
        throw new Error('Paystack API key not configured');
      }

      const response = await axios.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            'Authorization': `Bearer ${secretKey}`
          }
        }
      );

      if (response.data.status) {
        const transaction = response.data.data;
        return {
          success: true,
          status: transaction.status,
          amount: transaction.amount / 100, // Convert from kobo to naira
          reference: transaction.reference,
          gateway_ref: transaction.id,
          paid_at: transaction.paid_at,
          metadata: transaction.metadata
        };
      } else {
        throw new Error(response.data.message || 'Failed to verify payment');
      }
    } catch (error) {
      throw new Error(`Paystack verification error: ${error.message}`);
    }
  }

  async paystackRefund(transactionRef, amount) {
    try {
      const paymentMethod = await this.paymentMethodModel.findByCode('paystack');
      if (!paymentMethod.api_secret_key) {
        throw new Error('Paystack API key not configured');
      }

      const payload = {
        transaction: transactionRef,
        amount: amount * 100 // Convert to kobo
      };

      const response = await axios.post(
        'https://api.paystack.co/refund',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${paymentMethod.api_secret_key}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.status) {
        return {
          success: true,
          refund_id: response.data.data.id,
          status: response.data.data.status
        };
      } else {
        throw new Error(response.data.message || 'Failed to process refund');
      }
    } catch (error) {
      throw new Error(`Paystack refund error: ${error.message}`);
    }
  }

  paystackVerifyWebhook(payload, signature, secret) {
    try {
      const hash = crypto
        .createHmac('sha512', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      return hash === signature;
    } catch (error) {
      throw new Error(`Paystack webhook verification error: ${error.message}`);
    }
  }

  // Flutterwave Integration
  async flutterwaveInitialize(paymentData, payment) {
    try {
      const paymentMethod = await this.paymentMethodModel.findByCode('flutterwave');
      if (!paymentMethod.api_secret_key) {
        throw new Error('Flutterwave API key not configured');
      }

      // Generate unique transaction reference if not provided
      const tx_ref = payment.payment_id || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Prepare customer data
      const customer = {
        email: paymentData.anonymous_donor_email || paymentData.donor_email,
        name: paymentData.anonymous_donor_first_name && paymentData.anonymous_donor_last_name 
          ? `${paymentData.anonymous_donor_first_name} ${paymentData.anonymous_donor_last_name}`
          : 'AAC Donor',
        phonenumber: paymentData.anonymous_donor_phone || ''
      };

      // Construct payment data for Flutterwave
      const payload = {
        tx_ref,
        amount: paymentData.amount,
        currency: paymentData.currency || 'NGN',
        redirect_url: paymentData.redirect_url, //`${process.env.BASE_URL}/api/v1/payments/webhook/flutterwave`,
        customer,
        customizations: {
          title: 'AAC Party Payment',
          description: paymentData.purpose || 'Supporting AAC initiatives',
          logo: 'https://aacparty.com/logo.png'
        },
        configurations: {
          session_duration: 10,
          max_retry_attempt: 5,
        },
        meta: {
          payment_id: payment.payment_id,
          campaign_id: paymentData.campaign_id,
          donor_id: paymentData.donor_id,
          user_id: paymentData.user_id || paymentData.donor_id,
          type: paymentData.type,
          payment_type: paymentData.type,
          is_recurring: paymentData.is_recurring || false,
          recurring_interval: paymentData.recurring_interval,
          plan_type: paymentData.metadata?.plan_type,
          billing_cycle: paymentData.metadata?.billing_cycle
        }
      };

      // For recurring payments, Flutterwave can save card token for future charges
      // Note: For full subscription management, consider using Flutterwave Subscription API
      if (paymentData.is_recurring && paymentData.type === 'subscription') {
        console.log('[Flutterwave] Recurring payment enabled - card token will be saved for future charges');
        // Flutterwave will automatically save the card token when customer pays
        // We can use this card token for future charges via Flutterwave Charge API
        // Optionally, you can add payment_plan for structured subscriptions
      }

      const response = await axios.post(
        'https://api.flutterwave.com/v3/payments',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${paymentMethod.api_secret_key}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.status === 'success') {
        // Log the Flutterwave transaction
        await this.logFlutterwaveTransaction(
          tx_ref,
          paymentData.amount,
          paymentData.currency || 'NGN',
          paymentData.redirect_url, //`${process.env.BASE_URL}/api/v1/payments/webhook/flutterwave`,
          paymentData.donor_id,
          response.data.data.link,
          'Initialized',
          response.data.message
        );

        return {
          success: true,
          authorization_url: response.data.data.link,
          reference: tx_ref,
          flw_ref: response.data.data.flw_ref,
          paymentLink: response.data.data.link,
          payment: payment // Return payment object consistently
        };
      } else {
        throw new Error(response.data.message || 'Failed to initialize payment');
      }
    } catch (error) {
      throw new Error(`Flutterwave initialization error: ${error.message}`);
    }
  }

  async flutterwaveVerify(reference, transactionId) {
    try {
      const paymentMethod = await this.paymentMethodModel.findByCode('flutterwave');
      if (!paymentMethod.api_secret_key) {
        throw new Error('Flutterwave API key not configured');
      }

      // Try to verify transaction using the reference
      const response = await axios.get(
        `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
        {
          headers: {
            'Authorization': `Bearer ${paymentMethod.api_secret_key}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Check if the response is successful
      if (!response.data || response.data.status !== 'success') {
        throw new Error('Failed to verify transaction status with Flutterwave');
      }

      const transaction = response.data.data;
      const verifiedStatus = transaction.status; // e.g., "successful", "failed"
      const flutterwaveMessage = response.data.message;

      // Update Flutterwave transaction log with verification details
      await this.updateFlutterwaveTransaction(
        reference,
        'completed', //verifiedStatus,
        flutterwaveMessage,
        transactionId
      );

      return {
        success: verifiedStatus === 'successful',
        status: verifiedStatus,
        amount: transaction.amount,
        reference: transaction.tx_ref,
        gateway_ref: transaction.id,
        paid_at: transaction.created_at,
        metadata: transaction.meta,
        message: flutterwaveMessage
      };
    } catch (error) { console.log('err', error)
      throw new Error(`Flutterwave verification error: ${error.message}`);
    }
  }

  async flutterwaveRefund(transactionRef, amount) {
    try {
      const paymentMethod = await this.paymentMethodModel.findByCode('flutterwave');
      if (!paymentMethod.api_public_key) {
        throw new Error('Flutterwave API key not configured');
      }

      const payload = {
        id: transactionRef,
        amount: amount
      };

      const response = await axios.post(
        'https://api.flutterwave.com/v3/refunds',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${paymentMethod.api_public_key}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.status === 'success') {
        return {
          success: true,
          refund_id: response.data.data.id,
          status: response.data.data.status
        };
      } else {
        throw new Error(response.data.message || 'Failed to process refund');
      }
    } catch (error) {
      throw new Error(`Flutterwave refund error: ${error.message}`);
    }
  }

  flutterwaveVerifyWebhook(payload, signature, secret) {
    try {
      const hash = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      return hash === signature;
    } catch (error) {
      throw new Error(`Flutterwave webhook verification error: ${error.message}`);
    }
  }

  // Helper methods for Flutterwave transaction logging
  async logFlutterwaveTransaction(txRef, amount, currency, redirectUrl, userId, paymentLink, status, message) {
    try {
      // This would typically save to a database table for Flutterwave transactions
      console.log('Flutterwave transaction logged:', {
        txRef,
        amount,
        currency,
        redirectUrl,
        userId,
        paymentLink,
        status,
        message
      });
    } catch (error) {
      console.error('Error logging Flutterwave transaction:', error);
    }
  }

  async updateFlutterwaveTransaction(txRef, status, message, transactionId) {
    try {
      
      // Find payment by transaction reference and update it
      const payment = await this.paymentService.paymentModel.findByTransactionRef(txRef);
      if (payment) {
        // await this.paymentService.paymentModel.updateTransactionRef(payment.id, transactionId, status);
        // console.log('Flutterwave transaction updated:', {
        //   paymentId: payment.id,
        //   status,
        //   message,
        //   transactionId
        // });
      } else {
        console.log('Payment not found for transaction ID:', transactionId);
      }
    } catch (error) {
      console.error('Error updating Flutterwave transaction:', error);
    }
  }

  // Get supported processors
  async getSupportedProcessors() {
    try {
      const paymentMethods = await this.paymentMethodModel.getActiveMethods();
      return paymentMethods.filter(method => method.type === 'gateway');
    } catch (error) {
      throw new Error(`Error getting supported processors: ${error.message}`);
    }
  }

  // Test processor connection
  async testProcessorConnection(processor) {
    try {
      switch (processor) {
        case 'paystack':
          return await this.testPaystackConnection();
        case 'flutterwave':
          return await this.testFlutterwaveConnection();
        default:
          throw new Error('Unsupported processor');
      }
    } catch (error) {
      throw new Error(`Error testing processor connection: ${error.message}`);
    }
  }

  async testPaystackConnection() {
    try {
      const paymentMethod = await this.paymentMethodModel.findByCode('paystack');
      if (!paymentMethod.api_secret_key) {
        throw new Error('Paystack API key not configured');
      }

      const response = await axios.get(
        'https://api.paystack.co/balance',
        {
          headers: {
            'Authorization': `Bearer ${paymentMethod.api_secret_key}`
          }
        }
      );

      return {
        success: true,
        balance: response.data.data
      };
    } catch (error) {
      throw new Error(`Paystack connection test failed: ${error.message}`);
    }
  }

  async testFlutterwaveConnection() {
    try {
      const paymentMethod = await this.paymentMethodModel.findByCode('flutterwave');
      if (!paymentMethod.api_public_key) {
        throw new Error('Flutterwave API key not configured');
      }

      const response = await axios.get(
        'https://api.flutterwave.com/v3/balance',
        {
          headers: {
            'Authorization': `Bearer ${paymentMethod.api_public_key}`
          }
        }
      );

      return {
        success: true,
        balance: response.data.data
      };
    } catch (error) {
      throw new Error(`Flutterwave connection test failed: ${error.message}`);
    }
  }
}

module.exports = new PaymentProcessorService(); 