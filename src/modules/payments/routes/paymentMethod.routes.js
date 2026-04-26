const express = require('express');
const router = express.Router();
const PaymentMethod = require('../models/paymentMethod.model');
const validationMiddleware = require('../middleware/validation.middleware');
const { authenticate } = require('../../../shared/middleware/authenticate.middleware');
const { requireRole } = require('../../../shared/middleware/rbac.middleware');

router.get(
  '/admin/all',
  authenticate,
  requireRole('admin', 'super_admin'),
  async (req, res) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = (page - 1) * limit;
      const is_active =
        req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined;
      const type = req.query.type || undefined;

      const options = { limit, offset, is_active, type };
      const result = await PaymentMethod.findAll(options);
      const total = await PaymentMethod.count(options);

      res.json({
        success: true,
        data: result,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit) || 1,
          totalItems: total,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(total / limit),
          hasPreviousPage: page > 1,
        },
        message: `Retrieved ${result.length} payment methods successfully`,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error fetching payment methods' });
    }
  }
);

router.get(
  '/admin/:id',
  authenticate,
  requireRole('admin', 'super_admin'),
  async (req, res) => {
    try {
      const paymentMethod = await PaymentMethod.findById(req.params.id);
      if (!paymentMethod) {
        return res.status(404).json({ success: false, message: 'Payment method not found' });
      }
      res.json({ success: true, data: paymentMethod });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error fetching payment method' });
    }
  }
);

router.post(
  '/admin',
  authenticate,
  requireRole('admin', 'super_admin'),
  validationMiddleware.validatePaymentMethodData,
  async (req, res) => {
    try {
      const paymentMethod = await PaymentMethod.create(req.body);
      res.status(201).json({
        success: true,
        data: paymentMethod,
        message: 'Payment method created successfully',
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message || 'Error creating payment method' });
    }
  }
);

router.put(
  '/admin/:id',
  authenticate,
  requireRole('admin', 'super_admin'),
  async (req, res) => {
    try {
      const paymentMethod = await PaymentMethod.update(req.params.id, req.body);
      if (!paymentMethod) {
        return res.status(404).json({ success: false, message: 'Payment method not found' });
      }
      res.json({
        success: true,
        data: paymentMethod,
        message: 'Payment method updated successfully',
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message || 'Error updating payment method' });
    }
  }
);

router.delete(
  '/admin/:id',
  authenticate,
  requireRole('admin', 'super_admin'),
  async (req, res) => {
    try {
      const result = await PaymentMethod.delete(req.params.id);
      if (!result) {
        return res.status(404).json({ success: false, message: 'Payment method not found' });
      }
      res.json({
        success: true,
        message: 'Payment method deleted successfully',
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message || 'Error deleting payment method' });
    }
  }
);

module.exports = router;
