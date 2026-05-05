const express = require('express');
const router = express.Router();
const BankAccount = require('../models/bankAccount.model');
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
      const is_active =
        req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined;

      const result = await BankAccount.getAll({ page, limit, is_active });

      res.json({
        success: true,
        data: result.accounts,
        pagination: {
          currentPage: result.page,
          totalPages: result.totalPages,
          totalItems: result.total,
          itemsPerPage: result.limit,
          hasNextPage: result.page < result.totalPages,
          hasPreviousPage: result.page > 1,
        },
        message: `Retrieved ${result.accounts.length} bank accounts successfully`,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error fetching bank accounts' });
    }
  }
);

router.post(
  '/admin',
  authenticate,
  requireRole('admin', 'super_admin'),
  async (req, res) => {
    try {
      const { bank_name, account_number, account_name, is_active } = req.body;
      const account = await BankAccount.create({ bank_name, account_number, account_name, is_active });
      res.json({ success: true, data: account });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error creating bank account' });
    }
  }
);

router.put(
  '/admin/:id',
  authenticate,
  requireRole('admin', 'super_admin'),
  async (req, res) => {
    try {
      const { bank_name, account_number, account_name, is_active } = req.body;
      const updated = await BankAccount.update(req.params.id, {
        bank_name,
        account_number,
        account_name,
        is_active,
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error updating bank account' });
    }
  }
);

router.delete(
  '/admin/:id',
  authenticate,
  requireRole('admin', 'super_admin'),
  async (req, res) => {
    try {
      await BankAccount.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error deleting bank account' });
    }
  }
);

router.post(
  '/admin/:id/set-active',
  authenticate,
  requireRole('admin', 'super_admin'),
  async (req, res) => {
    try {
      await BankAccount.setActive(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error setting active bank account' });
    }
  }
);

module.exports = router;
