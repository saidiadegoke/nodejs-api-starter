const AuthModel = require('../../auth/models/auth.model');
const PaymentService = require('../services/payment.service');
const PaymentProcessorService = require('../services/paymentProcessor.service');
const { validatePaymentData } = require('../utils/validators');

class PaymentController {
  constructor() {
    this.paymentService = PaymentService;
    this.paymentProcessorService = PaymentProcessorService;
  }

  async createPayment(req, res) {
    try {
      const { error } = validatePaymentData(req.body);
      if (error) {
        return res.status(400).json({ success: false, message: error.details[0].message });
      }

      let userId = req.user?.user_id;
      let userEmail = null;
      if (userId) {
        const pool = require('../../../db/pool');
        const r = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
        userEmail = r.rows[0]?.email || null;
      }

      if (!userId && req.body.anonymous_donor_email) {
        const existing = await AuthModel.findByIdentifier(req.body.anonymous_donor_email);
        if (existing) {
          userId = existing.id;
          userEmail = existing.email;
        }
      }

      const finalEmail =
        userEmail || req.body.anonymous_donor_email || req.body.email || req.body.donor_email;

      const redirectUrl =
        req.body.redirect_url ||
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payments/callback`;

      const paymentData = {
        ...req.body,
        redirect_url: redirectUrl,
        user_id: userId || null,
        email: finalEmail,
        anonymous_donor_email: finalEmail || req.body.anonymous_donor_email,
        user_agent: req.headers['user-agent'],
        ip_address: req.ip,
      };

      const processorResult = await this.paymentProcessorService.initializePayment(
        paymentData,
        req.body.payment_method
      );

      const paymentLink =
        processorResult?.paymentLink ||
        processorResult?.authorization_url ||
        processorResult?.redirect_url ||
        null;

      if (!paymentLink && req.body.payment_method !== 'direct_transfer') {
        return res.status(502).json({
          success: false,
          message: 'Payment provider did not return a checkout URL. Check gateway keys in admin.',
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Payment created',
        data: {
          payment_id: processorResult?.payment?.payment_id,
          amount: processorResult?.payment?.amount || paymentData.amount,
          currency: processorResult?.payment?.currency || paymentData.currency,
          status: processorResult?.payment?.status || 'pending',
          paymentLink,
          bankAccount: processorResult?.bank_account || null,
        },
      });
    } catch (err) {
      console.error('[payments] createPayment', err);
      return res.status(500).json({ success: false, message: err.message || 'Error creating payment' });
    }
  }

  async processPayment(req, res) {
    return res.status(501).json({
      success: false,
      message: 'Use POST /payments/create to start a checkout. Re-init for an existing row is not implemented.',
    });
  }

  async verifyPayment(req, res) {
    try {
      const reference =
        req.params.reference || req.body.reference || req.query.reference;
      const transactionId = req.body.transactionId || req.query.transaction_id;
      if (!reference) {
        return res.status(400).json({ success: false, message: 'Payment reference is required' });
      }

      const payment = await this.paymentService.paymentModel.findByTransactionRef(reference);
      if (!payment) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
      }

      const processor = payment.payment_method;
      const verificationResult = await this.paymentProcessorService.verifyPayment(
        reference,
        processor,
        transactionId
      );

      const ok =
        verificationResult.success &&
        (verificationResult.status === 'successful' ||
          verificationResult.status === 'success');

      if (ok) {
        await this.paymentService.verifyPayment(
          payment.payment_id,
          reference,
          transactionId,
          processor,
          verificationResult
        );
      }

      const updated = await this.paymentService.paymentModel.findByTransactionRef(reference);
      return res.status(200).json({
        success: true,
        message: 'Verification finished',
        data: {
          ...updated,
          verifiedStatus: verificationResult.status,
          verificationData: verificationResult,
        },
      });
    } catch (err) {
      console.error('[payments] verifyPayment', err);
      return res.status(500).json({ success: false, message: err.message || 'Error verifying payment' });
    }
  }

  async getPaymentByReference(req, res) {
    try {
      const payment = await this.paymentService.paymentModel.findByTransactionRef(req.params.reference);
      if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
      return res.json({ success: true, data: payment });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async handleWebhook(req, res) {
    try {
      const { processor } = req.params;
      const signature = req.headers['x-paystack-signature'] || req.headers['verif-hash'];
      const payload = req.body;

      const valid = await this.paymentProcessorService.verifyWebhook(payload, signature, processor);
      if (!valid) {
        return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
      }

      let paymentId;
      let reference;
      let transactionId = null;
      if (processor === 'paystack') {
        paymentId = payload.data?.metadata?.payment_id;
        reference = payload.data?.reference;
      } else if (processor === 'flutterwave') {
        paymentId = payload.meta?.payment_id || payload.data?.meta?.payment_id;
        reference = payload.tx_ref || payload.data?.tx_ref;
        transactionId = payload.data?.id;
      }

      if (paymentId && reference) {
        const payment = await this.paymentService.paymentModel.findByPaymentId(paymentId);
        if (payment) {
          const vr = await this.paymentProcessorService.verifyPayment(
            reference,
            payment.payment_method,
            transactionId
          );
          if (vr.success && (vr.status === 'successful' || vr.status === 'success')) {
            await this.paymentService.verifyPayment(
              payment.payment_id,
              reference,
              transactionId,
              payment.payment_method,
              vr
            );
          }
        }
      }

      return res.json({ success: true, message: 'Webhook processed' });
    } catch (err) {
      console.error('[payments] webhook', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async getPaymentBankAccount(req, res) {
    try {
      const BankAccount = require('../models/bankAccount.model');
      const payment = await this.paymentService.getPaymentByPaymentId(req.params.paymentId);
      if (payment.payment_method !== 'direct_transfer') {
        return res.status(400).json({ success: false, message: 'Not a direct transfer payment' });
      }
      const bank = await BankAccount.getActive();
      if (!bank) return res.status(404).json({ success: false, message: 'No bank account configured' });
      return res.json({
        success: true,
        data: {
          payment: {
            payment_id: payment.payment_id,
            amount: payment.amount,
            currency: payment.currency,
            status: payment.status,
            purpose: payment.purpose,
            created_at: payment.created_at,
          },
          bank_accounts: [
            {
              id: bank.id,
              bank_name: bank.bank_name,
              account_name: bank.account_name,
              account_number: bank.account_number,
              is_primary: true,
              is_active: true,
            },
          ],
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async uploadProofOfPayment(req, res) {
    try {
      const { receipt_file_id, notes } = req.body;
      if (!receipt_file_id) {
        return res.status(400).json({ success: false, message: 'receipt_file_id is required' });
      }
      const payment = await this.paymentService.getPaymentByPaymentId(req.params.paymentId);
      if (payment.payment_method !== 'direct_transfer') {
        return res.status(400).json({ success: false, message: 'Not a direct transfer payment' });
      }
      const updated = await this.paymentService.updatePaymentReceipt(payment.id, {
        receipt_file_id,
        notes,
        status: 'pending_verification',
      });
      return res.json({ success: true, data: { payment: updated } });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async submitReceiptWithFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'file is required' });
      }
      const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      if (!allowed.includes(req.file.mimetype)) {
        return res.status(400).json({ success: false, message: 'Only JPEG, PNG, or PDF allowed' });
      }
      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(400).json({ success: false, message: 'Max file size 5MB' });
      }
      const payment = await this.paymentService.getPaymentByPaymentId(req.params.paymentId);
      if (payment.payment_method !== 'direct_transfer') {
        return res.status(400).json({ success: false, message: 'Not a direct transfer payment' });
      }
      const FileService = require('../../files/services/file.service');
      const uploaded = await FileService.uploadFile(req.file, null, 'payment_receipts');
      const updated = await this.paymentService.updatePaymentReceipt(payment.id, {
        receipt_file_id: uploaded.id,
        notes: req.body.notes?.trim() || null,
        status: 'pending_verification',
      });
      return res.json({ success: true, data: { payment: updated, file: uploaded } });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async getPublicPaymentStats(req, res) {
    try {
      const stats = await this.paymentService.getPaymentStats({});
      const recent = await this.paymentService.getRecentPayments(5);
      const goal = Number(process.env.PAYMENT_STATS_MONTHLY_GOAL || 0);
      const donations = parseFloat(stats.total_donations) || 0;
      const monthlyProgress =
        goal > 0 ? Math.min(100, Math.round((donations / goal) * 100)) : 0;
      return res.json({
        success: true,
        data: {
          totalDonations: donations,
          totalDues: parseFloat(stats.total_dues) || 0,
          totalCampaignPayments: parseFloat(stats.total_campaign_payments) || 0,
          totalPayers: parseInt(stats.unique_payers, 10) || 0,
          monthlyGoal: goal,
          monthlyProgress,
          recentPayments: recent,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async getUserPayments(req, res) {
    try {
      const userId = req.user.user_id;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = (page - 1) * limit;
      const payments = await this.paymentService.getPaymentsByUser(userId, {
        limit,
        offset,
        status: req.query.status,
        payment_type: req.query.payment_type,
      });
      const total = await this.paymentService.getUserPaymentsCount(
        userId,
        req.query.status || null,
        req.query.payment_type || null
      );
      const totalPages = Math.ceil(total / limit) || 1;
      return res.json({
        success: true,
        data: payments,
        pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async getUserDonationSummary(req, res) {
    try {
      const summary = await this.paymentService.getUserDonationSummary(req.user.user_id);
      return res.json({ success: true, data: summary });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async getPayment(req, res) {
    try {
      const payment = await this.paymentService.getPaymentById(req.params.id);
      if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
      const uid = req.user.user_id;
      const anonymousEmail =
        payment.anonymous_donor_email && String(payment.anonymous_donor_email).trim();
      const hasOwnerHint = payment.user_id || anonymousEmail;
      if (!hasOwnerHint) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }
      if (payment.user_id && payment.user_id !== uid) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      if (!payment.user_id && anonymousEmail) {
        const pool = require('../../../db/pool');
        const r = await pool.query('SELECT email FROM users WHERE id = $1', [uid]);
        if ((r.rows[0]?.email || '') !== anonymousEmail) {
          return res.status(403).json({ success: false, message: 'Access denied' });
        }
      }
      return res.json({ success: true, data: payment });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async generateReceipt(req, res) {
    try {
      const payment = await this.paymentService.getPaymentById(req.params.id);
      if (!payment) return res.status(404).json({ success: false, message: 'Not found' });
      const uid = req.user.user_id;
      const anonymousEmail =
        payment.anonymous_donor_email && String(payment.anonymous_donor_email).trim();
      const hasOwnerHint = payment.user_id || anonymousEmail;
      if (!hasOwnerHint) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      if (payment.user_id && payment.user_id !== uid) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      if (!payment.user_id && anonymousEmail) {
        const pool = require('../../../db/pool');
        const r = await pool.query('SELECT email FROM users WHERE id = $1', [uid]);
        if ((r.rows[0]?.email || '') !== anonymousEmail) {
          return res.status(403).json({ success: false, message: 'Access denied' });
        }
      }
      const url = await this.paymentService.generateReceiptUrl(payment.payment_id);
      return res.json({ success: true, data: { receipt_url: url } });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async getAllPayments(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = (page - 1) * limit;
      const result = await this.paymentService.paymentModel.findAll({
        limit,
        offset,
        status: req.query.status,
        type: req.query.type,
        payment_method: req.query.payment_method,
        start_date: req.query.start_date,
        end_date: req.query.end_date,
        campaign: req.query.campaign,
      });
      return res.json({
        success: true,
        data: result.payments,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async getPaymentStats(req, res) {
    try {
      const stats = await this.paymentService.getPaymentStats(req.query);
      return res.json({ success: true, data: stats });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async getPaymentAdmin(req, res) {
    try {
      const payment = await this.paymentService.getPaymentById(req.params.id);
      if (!payment) return res.status(404).json({ success: false, message: 'Not found' });
      return res.json({ success: true, data: payment });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async requeryPayment(req, res) {
    try {
      const payment = await this.paymentService.paymentModel.findById(req.params.id);
      if (!payment) return res.status(404).json({ success: false, message: 'Not found' });
      if (payment.payment_method === 'direct_transfer') {
        return res.status(400).json({ success: false, message: 'Use manual approval for bank transfer' });
      }
      const reference = payment.transaction_ref || payment.payment_id;
      let transactionId = null;
      if (payment.payment_method === 'flutterwave' && payment.processor_response) {
        try {
          const pr =
            typeof payment.processor_response === 'string'
              ? JSON.parse(payment.processor_response)
              : payment.processor_response;
          transactionId = pr.id || pr.transaction_id || payment.transaction_ref;
        } catch {
          transactionId = payment.transaction_ref;
        }
      }
      const vr = await this.paymentProcessorService.verifyPayment(
        reference,
        payment.payment_method,
        transactionId
      );
      const ok =
        vr.success && (vr.status === 'successful' || vr.status === 'success');
      if (ok) {
        await this.paymentService.verifyPayment(
          payment.payment_id,
          reference,
          transactionId,
          payment.payment_method,
          vr
        );
      }
      const updated = await this.paymentService.paymentModel.findById(req.params.id);
      return res.json({ success: true, data: updated, verification: vr });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async refundPayment(req, res) {
    try {
      const refunded = await this.paymentService.refundPayment(req.params.id, req.body.reason);
      return res.json({ success: true, data: refunded });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async updatePayment(req, res) {
    try {
      const payment = await this.paymentService.paymentModel.findById(req.params.id);
      if (!payment) return res.status(404).json({ success: false, message: 'Not found' });
      const { status, ...rest } = req.body;
      if (!status) {
        return res.status(400).json({ success: false, message: 'status is required' });
      }
      const extra = { ...rest };
      if (status === 'completed') {
        extra.paid_at = extra.paid_at || new Date();
      }
      const updated = await this.paymentService.paymentModel.updateStatus(req.params.id, status, extra);
      return res.json({ success: true, data: updated });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async adminSummary(req, res) {
    try {
      const summary = await this.paymentService.paymentModel.getSummaryStats();
      return res.json({ success: true, data: summary });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new PaymentController();
