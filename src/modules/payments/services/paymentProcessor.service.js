const axios = require('axios');
const crypto = require('crypto');
const PaymentMethod = require('../models/paymentMethod.model');
const PaymentService = require('./payment.service');
const sendEmail = require('../../../shared/utils/sendEmail');

class PaymentProcessorService {
  constructor() {
    this.paymentMethodModel = PaymentMethod;
    this.paymentService = PaymentService;
  }

  async initializePayment(paymentData, processor) {
    const paymentMethod = await this.paymentMethodModel.findByCode(processor);
    if (!paymentMethod || !paymentMethod.is_active) {
      throw new Error('Payment method not available');
    }

    const payment = await this.paymentService.createPayment({
      ...paymentData,
      payment_method: processor,
      status: processor === 'direct_transfer' ? 'pending_transfer' : 'pending',
    });

    switch (processor) {
      case 'paystack':
        return this.paystackInitialize(paymentData, payment);
      case 'flutterwave':
        return this.flutterwaveInitialize(paymentData, payment);
      case 'direct_transfer': {
        const BankAccount = require('../models/bankAccount.model');
        const bankAccount = await BankAccount.getActive();
        if (!bankAccount) throw new Error('No active bank account configured');

        const appName = process.env.APP_NAME || 'Application';
        const customer =
          paymentData.first_name ||
          paymentData.anonymous_donor_first_name ||
          paymentData.email ||
          paymentData.anonymous_donor_email ||
          'Customer';
        const to = paymentData.email || paymentData.anonymous_donor_email;
        if (to && process.env.SMTP_HOST) {
          try {
            let base = process.env.FRONTEND_URL || 'http://localhost:3000';
            if (paymentData.redirect_url) {
              try {
                base = new URL(paymentData.redirect_url).origin;
              } catch {
                /* keep FRONTEND_URL */
              }
            }
            const link = `${base.replace(/\/$/, '')}/payments/direct-transfer/${payment.payment_id}`;
            const currency = payment.currency || paymentData.currency || 'NGN';
            const sym = currency === 'NGN' ? '₦' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
            const formatted = `${sym}${parseFloat(payment.amount).toLocaleString()}`;
            await sendEmail({
              to,
              subject: `${appName} — bank transfer instructions`,
              templateFile: 'direct-transfer-instructions.html',
              placeholders: [
                appName,
                customer,
                formatted,
                payment.payment_id,
                bankAccount.bank_name,
                bankAccount.account_name,
                bankAccount.account_number,
                link,
                link,
                appName,
              ],
            });
          } catch (e) {
            console.error('[PaymentProcessor] Direct transfer email failed:', e.message);
          }
        }

        return {
          success: true,
          redirect_url: `/payments/direct-transfer/${payment.payment_id}`,
          payment_id: payment.payment_id,
          bank_account: bankAccount,
          payment,
        };
      }
      default:
        throw new Error('Unsupported payment processor');
    }
  }

  async verifyPayment(reference, processor, transactionId) {
    switch (processor) {
      case 'paystack':
        return this.paystackVerify(reference);
      case 'flutterwave':
        return this.flutterwaveVerify(reference, transactionId);
      case 'direct_transfer':
        throw new Error('Direct transfer verification is manual');
      default:
        throw new Error('Unsupported payment processor');
    }
  }

  async processRefund(transactionRef, amount, processor) {
    switch (processor) {
      case 'paystack':
        return this.paystackRefund(transactionRef, amount);
      case 'flutterwave':
        return this.flutterwaveRefund(transactionRef, amount);
      default:
        throw new Error('Unsupported processor for refund');
    }
  }

  async verifyWebhook(payload, signature, processor) {
    const paymentMethod = await this.paymentMethodModel.findByCode(processor);
    if (!paymentMethod) throw new Error('Payment method not found');
    if (processor === 'paystack') {
      return this.paystackVerifyWebhook(payload, signature, paymentMethod.webhook_secret);
    }
    if (processor === 'flutterwave') {
      return this.flutterwaveVerifyWebhook(payload, signature, paymentMethod.webhook_secret);
    }
    throw new Error('Unsupported processor for webhook');
  }

  async paystackInitialize(paymentData, payment) {
    const paymentMethod = await this.paymentMethodModel.findByCode('paystack');
    if (!paymentMethod?.api_secret_key) throw new Error('Paystack API key not configured');

    const email =
      paymentData.email || paymentData.anonymous_donor_email || paymentData.donor_email;
    if (!email) throw new Error('Email is required for Paystack payment initialization');

    const payload = {
      amount: Math.round(Number(paymentData.amount) * 100),
      email,
      reference: payment.payment_id,
      callback_url: paymentData.redirect_url,
      metadata: {
        payment_id: payment.payment_id,
        user_id: paymentData.user_id,
        type: paymentData.type,
        is_recurring: paymentData.is_recurring || false,
        recurring_interval: paymentData.recurring_interval,
        plan_type: paymentData.metadata?.plan_type,
        billing_cycle: paymentData.metadata?.billing_cycle,
        campaign_id: paymentData.campaign_id,
      },
    };

    const response = await axios.post('https://api.paystack.co/transaction/initialize', payload, {
      headers: {
        Authorization: `Bearer ${paymentMethod.api_secret_key}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.data.status) {
      return {
        success: true,
        authorization_url: response.data.data.authorization_url,
        reference: response.data.data.reference,
        access_code: response.data.data.access_code,
        payment,
      };
    }
    throw new Error(response.data.message || 'Failed to initialize Paystack payment');
  }

  async paystackVerify(reference) {
    const paymentMethod = await this.paymentMethodModel.findByCode('paystack');
    if (!paymentMethod?.api_secret_key) throw new Error('Paystack API key not configured');

    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${paymentMethod.api_secret_key}` },
    });

    if (!response.data.status) {
      throw new Error(response.data.message || 'Failed to verify Paystack payment');
    }
    const transaction = response.data.data;
    return {
      success: true,
      status: transaction.status,
      amount: transaction.amount / 100,
      reference: transaction.reference,
      gateway_ref: transaction.id,
      paid_at: transaction.paid_at,
      metadata: transaction.metadata,
      message: response.data.message,
    };
  }

  async paystackRefund(transactionRef, amount) {
    const paymentMethod = await this.paymentMethodModel.findByCode('paystack');
    if (!paymentMethod?.api_secret_key) throw new Error('Paystack API key not configured');

    const response = await axios.post(
      'https://api.paystack.co/refund',
      { transaction: transactionRef, amount: Math.round(Number(amount) * 100) },
      {
        headers: {
          Authorization: `Bearer ${paymentMethod.api_secret_key}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.status) {
      return { success: true, refund_id: response.data.data.id, status: response.data.data.status };
    }
    throw new Error(response.data.message || 'Paystack refund failed');
  }

  paystackVerifyWebhook(payload, signature, secret) {
    if (!secret) return false;
    const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(payload)).digest('hex');
    return hash === signature;
  }

  async flutterwaveInitialize(paymentData, payment) {
    const paymentMethod = await this.paymentMethodModel.findByCode('flutterwave');
    if (!paymentMethod?.api_secret_key) throw new Error('Flutterwave API key not configured');

    const email =
      paymentData.email ||
      paymentData.anonymous_donor_email ||
      paymentData.donor_email;
    if (!email) throw new Error('Email is required for Flutterwave payment initialization');

    const tx_ref = payment.payment_id;
    const appName = process.env.APP_NAME || 'Payment';
    const customer = {
      email,
      name:
        paymentData.anonymous_donor_first_name && paymentData.anonymous_donor_last_name
          ? `${paymentData.anonymous_donor_first_name} ${paymentData.anonymous_donor_last_name}`
          : paymentData.first_name || 'Customer',
      phonenumber: paymentData.anonymous_donor_phone || '',
    };

    const payload = {
      tx_ref,
      amount: paymentData.amount,
      currency: paymentData.currency || 'NGN',
      redirect_url: paymentData.redirect_url,
      customer,
      customizations: {
        title: appName,
        description: paymentData.purpose || `Payment to ${appName}`,
        logo: process.env.FLW_CHECKOUT_LOGO_URL || '',
      },
      meta: {
        payment_id: payment.payment_id,
        user_id: paymentData.user_id,
        type: paymentData.type,
        campaign_id: paymentData.campaign_id,
      },
    };

    const response = await axios.post('https://api.flutterwave.com/v3/payments', payload, {
      headers: {
        Authorization: `Bearer ${paymentMethod.api_secret_key}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.data.status === 'success') {
      return {
        success: true,
        authorization_url: response.data.data.link,
        reference: tx_ref,
        flw_ref: response.data.data.flw_ref,
        paymentLink: response.data.data.link,
        payment,
      };
    }
    throw new Error(response.data.message || 'Flutterwave initialization failed');
  }

  async flutterwaveVerify(reference, transactionId) {
    const paymentMethod = await this.paymentMethodModel.findByCode('flutterwave');
    if (!paymentMethod?.api_secret_key) throw new Error('Flutterwave API key not configured');

    const id = transactionId || reference;
    const response = await axios.get(`https://api.flutterwave.com/v3/transactions/${id}/verify`, {
      headers: {
        Authorization: `Bearer ${paymentMethod.api_secret_key}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.data || response.data.status !== 'success') {
      throw new Error('Failed to verify Flutterwave transaction');
    }

    const transaction = response.data.data;
    return {
      success: transaction.status === 'successful',
      status: transaction.status,
      amount: transaction.amount,
      reference: transaction.tx_ref,
      gateway_ref: transaction.id,
      paid_at: transaction.created_at,
      metadata: transaction.meta,
      message: response.data.message,
    };
  }

  async flutterwaveRefund(transactionRef, amount) {
    const paymentMethod = await this.paymentMethodModel.findByCode('flutterwave');
    if (!paymentMethod?.api_secret_key) throw new Error('Flutterwave API key not configured');

    const response = await axios.post(
      'https://api.flutterwave.com/v3/refunds',
      { id: transactionRef, amount },
      {
        headers: {
          Authorization: `Bearer ${paymentMethod.api_secret_key}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.status === 'success') {
      return { success: true, refund_id: response.data.data.id, status: response.data.data.status };
    }
    throw new Error(response.data.message || 'Flutterwave refund failed');
  }

  flutterwaveVerifyWebhook(payload, signature, secret) {
    if (!secret) return false;
    const hash = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
    return hash === signature;
  }
}

module.exports = new PaymentProcessorService();
