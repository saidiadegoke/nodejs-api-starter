const express = require('express');
const router = express.Router();

const paymentRoutes = require('./payment.routes');
const paymentMethodRoutes = require('./paymentMethod.routes');
const bankAccountRoutes = require('./bankAccount.routes');

router.use('/', paymentRoutes);
router.use('/payment-methods', paymentMethodRoutes);
router.use('/bank-accounts', bankAccountRoutes);

module.exports = router;
