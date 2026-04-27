const crypto = require('crypto');
const Payment = require('../models/payment.model');
const PaymentMethod = require('../models/paymentMethod.model');

const VALID_TYPES = [
  'donation',
  'dues',
  'campaign',
  'event',
  'merchandise',
  'subscription',
  'order',
  'invoice',
  'membership',
  'checkout',
  'other',
];

class PaymentService {
  constructor() {
    this.paymentModel = Payment;
    this.paymentMethodModel = PaymentMethod;
  }

  async createPayment(paymentData) {
    const payment_id = `PAY_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    if (!paymentData.amount || paymentData.amount <= 0) {
      throw new Error('Invalid amount');
    }
    if (!VALID_TYPES.includes(paymentData.type)) {
      throw new Error(`Invalid payment type. Allowed: ${VALID_TYPES.join(', ')}`);
    }

    let payment_method_id = null;
    if (paymentData.payment_method) {
      const pm = await this.paymentMethodModel.findByCode(paymentData.payment_method);
      if (pm) payment_method_id = pm.id;
    }

    return this.paymentModel.create({
      ...paymentData,
      payment_id,
      payment_method_id,
      status: paymentData.status || 'pending',
    });
  }

  async processPayment(paymentId, processorData) {
    const payment = await this.paymentModel.findByPaymentId(paymentId);
    if (!payment) throw new Error('Payment not found');
    if (payment.status !== 'pending' && payment.status !== 'pending_transfer') {
      throw new Error('Payment is not in a processable status');
    }
    return this.paymentModel.updateStatus(payment.id, 'processing', {
      transaction_ref: processorData.transaction_ref,
      processor_response: processorData.response,
    });
  }

  /**
   * Mark payment completed after gateway verification (no SmartStore side-effects).
   */
  async verifyPayment(paymentId, transactionRef, transactionId, processor, processorPayload = null) {
    const payment = await this.paymentModel.findByPaymentId(paymentId);
    if (!payment) throw new Error('Payment not found');
    if (payment.status === 'completed') return payment;

    const txRef =
      processor === 'flutterwave' && transactionId ? transactionId : transactionRef;

    const updated = await this.paymentModel.updateStatus(payment.id, 'completed', {
      transaction_ref: txRef,
      paid_at: new Date(),
      processor_response: processorPayload,
    });
    try {
      const {
        syncRegistrationProjectionForPaymentId,
      } = require('../../jupeb/services/registration-payment-projection.service');
      await syncRegistrationProjectionForPaymentId(updated.id);
    } catch {
      /* optional JUPEB wiring */
    }
    return updated;
  }

  async refundPayment(idOrPaymentId, reason) {
    let payment = await this.paymentModel.findById(idOrPaymentId);
    if (!payment) payment = await this.paymentModel.findByPaymentId(idOrPaymentId);
    if (!payment) throw new Error('Payment not found');
    if (payment.status !== 'completed') throw new Error('Payment is not completed');
    const updated = await this.paymentModel.updateStatus(payment.id, 'refunded', { notes: reason });
    try {
      const {
        syncRegistrationProjectionForPaymentId,
      } = require('../../jupeb/services/registration-payment-projection.service');
      await syncRegistrationProjectionForPaymentId(updated.id);
    } catch {
      /* optional JUPEB wiring */
    }
    return updated;
  }

  async getPaymentByPaymentId(paymentId) {
    const row = await this.paymentModel.findByPaymentId(paymentId);
    if (!row) throw new Error('Payment not found');
    return row;
  }

  async getPaymentById(id) {
    return this.paymentModel.findById(id);
  }

  async getPaymentsByUser(userId, options) {
    return this.paymentModel.findByUserId(userId, options);
  }

  async getUserPaymentsCount(userId, status = null, payment_type = null) {
    return this.paymentModel.getUserPaymentsCount(userId, status, payment_type);
  }

  async getUserDonationSummary(userId) {
    return this.paymentModel.getUserDonationSummary(userId);
  }

  async getPaymentsByCampaign(campaignId, options) {
    return this.paymentModel.findByCampaignId(campaignId, options);
  }

  async getPaymentStats(filters) {
    return this.paymentModel.getStats(filters);
  }

  async getRecentPayments(limit) {
    return this.paymentModel.getRecentPayments(limit);
  }

  async calculateFees(amount, code) {
    const fee = await this.paymentMethodModel.calculateFee(amount, code);
    return { amount, fee, total: amount + fee };
  }

  async updatePaymentReceipt(internalId, receiptData) {
    return this.paymentModel.updateReceipt(internalId, receiptData);
  }

  async generateReceiptUrl(paymentId) {
    const payment = await this.paymentModel.findByPaymentId(paymentId);
    if (!payment) throw new Error('Payment not found');
    const receiptUrl = `/receipts/${payment.payment_id}`;
    await this.paymentModel.updateStatus(payment.id, payment.status, { receipt_url: receiptUrl });
    return receiptUrl;
  }
}

module.exports = new PaymentService();
