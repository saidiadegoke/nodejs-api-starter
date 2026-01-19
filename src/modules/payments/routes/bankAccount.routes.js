const express = require('express');
const router = express.Router();
const BankAccount = require('../models/bankAccount.model');
const authorize = require('../../auth/middleware/authorize');
const requireRole = require('../../auth/middleware/requireRole');

// List all bank accounts (admin)
router.get('/admin/all', authorize, requireRole("admin"), async (req, res) => {
  try {
    const { page = 1, limit = 50, is_active } = req.query;
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined
    };

    const result = await BankAccount.getAll(options);

    res.json({
      success: true,
      data: result.accounts,
      pagination: {
        currentPage: result.page,
        totalPages: result.totalPages,
        totalItems: result.total,
        itemsPerPage: result.limit,
        hasNextPage: result.page < result.totalPages,
        hasPreviousPage: result.page > 1
      },
      message: `Retrieved ${result.accounts.length} bank accounts successfully`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching bank accounts' });
  }
});

// Create bank account (admin)
router.post('/admin', authorize, requireRole("admin"), async (req, res) => {
  try {
    const { bank_name, account_number, account_name, is_active } = req.body;
    const account = await BankAccount.create({ bank_name, account_number, account_name, is_active });
    res.json({ success: true, data: account });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error creating bank account' });
  }
});

// Update bank account (admin)
router.put('/admin/:id', authorize, requireRole("admin"), async (req, res) => {
  try {
    const { bank_name, account_number, account_name, is_active } = req.body;
    const id = req.params.id;
    const updated = await BankAccount.update(id, { bank_name, account_number, account_name, is_active });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating bank account' });
  }
});

// Delete bank account (admin)
router.delete('/admin/:id', authorize, requireRole("admin"), async (req, res) => {
  try {
    const id = req.params.id;
    await BankAccount.delete(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error deleting bank account' });
  }
});

// Set active bank account (admin)
router.post('/admin/:id/set-active', authorize, requireRole("admin"), async (req, res) => {
  try {
    const id = req.params.id;
    await BankAccount.setActive(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error setting active bank account' });
  }
});

module.exports = router; 