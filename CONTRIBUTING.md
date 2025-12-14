# Contributing to OpinionPolls Backend

Thank you for contributing to OpinionPolls! This guide will help you add new features and modules following our architecture standards.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Module Structure](#module-structure)
3. [Code Organization](#code-organization)
4. [Style Guide](#style-guide)
5. [Testing Requirements](#testing-requirements)
6. [Pull Request Process](#pull-request-process)

---

## Getting Started

### 1. Create a Feature Branch

```bash
# Update development branch
git checkout development
git pull origin development

# Create feature branch from development
# Format: feature/module-name or feature/feature-description
git checkout -b feature/wallet-management

# Or for bug fixes
git checkout -b fix/order-cancellation-bug

# Or for hotfixes (from main)
git checkout main
git checkout -b hotfix/critical-security-patch
```

### 2. Set Up Development Environment

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Run migrations
npm run migrate

# Seed database
npm run seed

# Start development server
npm run dev
```

---

## Module Structure

Each module follows a **feature-based architecture** with a consistent folder structure.

### Standard Module Structure

```
src/modules/{module-name}/
├── models/                    # Data access layer
│   └── {entity}.model.js      # Database operations
│
├── services/                  # Business logic layer
│   └── {entity}.service.js    # Business rules & orchestration
│
├── controllers/               # Request handling layer
│   └── {entity}.controller.js # HTTP request/response handling
│
├── utils/                     # Module-specific utilities
│   └── {helper}.helper.js     # Helper functions
│
├── validators/                # Module-specific validations (optional)
│   └── {entity}.validator.js  # Custom validation logic
│
└── routes.js                  # Route definitions
```

### Example: Wallet Module

```
src/modules/wallet/
├── models/
│   ├── wallet.model.js        # Wallet CRUD operations
│   ├── transaction.model.js   # Transaction operations
│   └── withdrawal.model.js    # Withdrawal operations
│
├── services/
│   ├── wallet.service.js      # Wallet business logic
│   ├── transaction.service.js # Transaction processing
│   └── payment.service.js     # Payment gateway integration
│
├── controllers/
│   ├── wallet.controller.js   # Wallet endpoints
│   └── transaction.controller.js # Transaction endpoints
│
├── utils/
│   └── payment.helper.js      # Payment calculations
│
└── routes.js                  # Wallet routes
```

---

## Code Organization

### What Goes Where?

#### **1. Models (`models/*.model.js`)**

**Purpose:** Direct database operations, SQL queries, data access

**Contains:**
- SQL queries (SELECT, INSERT, UPDATE, DELETE)
- Database-specific logic
- Data retrieval and persistence

**Should NOT contain:**
- Business logic
- Validation rules
- HTTP-related code

**Example:**

```javascript
// src/modules/wallet/models/wallet.model.js

const pool = require('../../../db/pool');

class WalletModel {
  /**
   * Get wallet by user ID
   */
  static async getByUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM wallets WHERE user_id = $1',
      [userId]
    );
    return result.rows[0];
  }

  /**
   * Create wallet for user
   */
  static async create(userId, currency = 'NGN') {
    const result = await pool.query(
      `INSERT INTO wallets (user_id, balance, currency, status)
       VALUES ($1, 0, $2, 'active')
       RETURNING *`,
      [userId, currency]
    );
    return result.rows[0];
  }

  /**
   * Update wallet balance
   */
  static async updateBalance(walletId, newBalance) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `UPDATE wallets 
         SET balance = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [newBalance, walletId]
      );
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = WalletModel;
```

---

#### **2. Services (`services/*.service.js`)**

**Purpose:** Business logic, data orchestration, complex operations

**Contains:**
- Business rules and validation
- Multi-step operations
- Calls to multiple models
- External API integrations
- Complex calculations

**Should NOT contain:**
- Direct SQL queries (use models instead)
- HTTP request/response handling

**Example:**

```javascript
// src/modules/wallet/services/wallet.service.js

const WalletModel = require('../models/wallet.model');
const TransactionModel = require('../models/transaction.model');

class WalletService {
  /**
   * Get or create wallet for user
   */
  static async getOrCreateWallet(userId) {
    let wallet = await WalletModel.getByUserId(userId);
    
    if (!wallet) {
      wallet = await WalletModel.create(userId);
    }
    
    return wallet;
  }

  /**
   * Add funds to wallet
   */
  static async addFunds(userId, amount, source, metadata = {}) {
    // Validate amount
    if (amount < 100) {
      throw new Error('Minimum top-up amount is 100 NGN');
    }

    const wallet = await this.getOrCreateWallet(userId);

    // Create transaction record
    const transaction = await TransactionModel.create({
      wallet_id: wallet.id,
      type: 'credit',
      amount: amount,
      source: source,
      status: 'pending',
      metadata: metadata
    });

    // Update wallet balance
    const newBalance = parseInt(wallet.balance) + amount;
    await WalletModel.updateBalance(wallet.id, newBalance);

    // Mark transaction as completed
    await TransactionModel.updateStatus(transaction.id, 'completed');

    return {
      wallet,
      transaction,
      new_balance: newBalance
    };
  }

  /**
   * Withdraw funds
   */
  static async withdrawFunds(userId, amount, destination, metadata = {}) {
    const wallet = await WalletModel.getByUserId(userId);
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Validate sufficient balance
    if (parseInt(wallet.balance) < amount) {
      throw new Error('Insufficient balance');
    }

    // Create withdrawal transaction
    const transaction = await TransactionModel.create({
      wallet_id: wallet.id,
      type: 'debit',
      amount: amount,
      destination: destination,
      status: 'pending',
      metadata: metadata
    });

    // Update balance
    const newBalance = parseInt(wallet.balance) - amount;
    await WalletModel.updateBalance(wallet.id, newBalance);

    // Transaction processing happens async
    // For now, mark as completed
    await TransactionModel.updateStatus(transaction.id, 'completed');

    return {
      transaction,
      new_balance: newBalance
    };
  }
}

module.exports = WalletService;
```

---

#### **3. Controllers (`controllers/*.controller.js`)**

**Purpose:** Handle HTTP requests, format responses

**Contains:**
- Request parameter extraction
- Calling service methods
- Response formatting
- HTTP status codes
- Error handling for HTTP context

**Should NOT contain:**
- Business logic (use services)
- SQL queries (use models)

**Example:**

```javascript
// src/modules/wallet/controllers/wallet.controller.js

const WalletService = require('../services/wallet.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND } = require('../../../shared/constants/statusCodes');

class WalletController {
  /**
   * Get current user's wallet
   */
  static async getWallet(req, res) {
    try {
      const userId = req.user.user_id;
      const wallet = await WalletService.getOrCreateWallet(userId);
      
      sendSuccess(res, {
        wallet_id: wallet.id,
        balance: wallet.balance,
        currency: wallet.currency,
        status: wallet.status
      }, 'Wallet retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Add funds to wallet
   */
  static async topUp(req, res) {
    try {
      const userId = req.user.user_id;
      const { amount, payment_method } = req.body;

      const result = await WalletService.addFunds(
        userId, 
        amount, 
        payment_method,
        { ip_address: req.ip }
      );

      sendSuccess(res, {
        transaction_id: result.transaction.id,
        new_balance: result.new_balance,
        amount: amount,
        status: result.transaction.status
      }, 'Wallet topped up successfully', CREATED);
    } catch (error) {
      if (error.message.includes('Minimum')) {
        return sendError(res, error.message, 422);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Withdraw funds
   */
  static async withdraw(req, res) {
    try {
      const userId = req.user.user_id;
      const { amount, bank_account } = req.body;

      const result = await WalletService.withdrawFunds(
        userId, 
        amount, 
        bank_account
      );

      sendSuccess(res, {
        transaction_id: result.transaction.id,
        new_balance: result.new_balance,
        amount: amount,
        status: result.transaction.status
      }, 'Withdrawal initiated successfully', CREATED);
    } catch (error) {
      if (error.message.includes('Insufficient')) {
        return sendError(res, error.message, 422);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = WalletController;
```

---

#### **4. Routes (`routes.js`)**

**Purpose:** Define API endpoints, attach middleware, validation

**Contains:**
- Route definitions
- Validation rules (express-validator)
- Middleware attachment (auth, RBAC)
- Route documentation comments

**Example:**

```javascript
// src/modules/wallet/routes.js

const router = require('express').Router();
const WalletController = require('./controllers/wallet.controller');
const TransactionController = require('./controllers/transaction.controller');
const { body } = require('express-validator');
const { validate } = require('../../shared/validations/validator');
const { requireAuth, requireRole } = require('../../shared/middleware/rbac.middleware');

/**
 * @route   GET /api/wallet
 * @desc    Get current user's wallet
 * @access  Private (customer, shopper, dispatcher)
 */
router.get(
  '/',
  requireAuth,
  WalletController.getWallet
);

/**
 * @route   POST /api/wallet/topup
 * @desc    Add funds to wallet
 * @access  Private (customer only)
 */
router.post(
  '/topup',
  requireAuth,
  requireRole('customer'),
  [
    body('amount').isInt({ min: 100 }).withMessage('Amount must be at least 100'),
    body('payment_method').isIn(['card', 'bank_transfer', 'ussd']).withMessage('Invalid payment method'),
    validate
  ],
  WalletController.topUp
);

/**
 * @route   POST /api/wallet/withdraw
 * @desc    Withdraw funds from wallet
 * @access  Private (shopper, dispatcher only)
 */
router.post(
  '/withdraw',
  requireAuth,
  requireRole('shopper', 'dispatcher'),
  [
    body('amount').isInt({ min: 1000 }).withMessage('Minimum withdrawal is 1000'),
    body('bank_account.account_number').isLength({ min: 10, max: 10 }).withMessage('Valid account number required'),
    body('bank_account.bank_code').notEmpty().withMessage('Bank code is required'),
    validate
  ],
  WalletController.withdraw
);

/**
 * @route   GET /api/wallet/transactions
 * @desc    Get wallet transaction history
 * @access  Private
 */
router.get(
  '/transactions',
  requireAuth,
  TransactionController.getTransactions
);

module.exports = router;
```

---

#### **5. Utils (`utils/*.helper.js`)**

**Purpose:** Module-specific helper functions

**Example:**

```javascript
// src/modules/wallet/utils/payment.helper.js

/**
 * Calculate transaction fee
 */
function calculateTransactionFee(amount, type = 'topup') {
  if (type === 'topup') {
    // 1.5% fee capped at 2000
    return Math.min(Math.floor(amount * 0.015), 2000);
  }
  
  if (type === 'withdrawal') {
    // Flat fee of 100
    return 100;
  }
  
  return 0;
}

/**
 * Validate bank account number
 */
function validateBankAccount(accountNumber, bankCode) {
  // Nigerian bank accounts are 10 digits
  if (!/^\d{10}$/.test(accountNumber)) {
    return false;
  }
  
  // Validate bank code exists
  const validBankCodes = ['058', '044', '033', '057']; // Sample codes
  return validBankCodes.includes(bankCode);
}

module.exports = {
  calculateTransactionFee,
  validateBankAccount
};
```

---

## Style Guide

### Naming Conventions

#### **Files**
- Models: `{entity}.model.js` (e.g., `wallet.model.js`)
- Services: `{entity}.service.js`
- Controllers: `{entity}.controller.js`
- Routes: `routes.js`
- Helpers: `{name}.helper.js`

#### **Classes**
- Use PascalCase: `WalletModel`, `WalletService`, `WalletController`
- One class per file
- Class name matches filename

#### **Functions**
- Use camelCase: `getWallet`, `addFunds`, `calculateFee`
- Static methods for stateless operations
- Async/await for all database operations

#### **Variables**
- Use camelCase: `userId`, `walletBalance`, `transactionId`
- Use const by default, let when reassignment needed
- No var

#### **Constants**
- Use UPPER_SNAKE_CASE: `MAX_WITHDRAWAL_AMOUNT`, `DEFAULT_CURRENCY`

### Code Style

#### **Indentation**
- 2 spaces (no tabs)
- Consistent throughout

#### **Semicolons**
- Required at end of statements

#### **Quotes**
- Single quotes for strings: `'Hello'`
- Template literals for interpolation: `` `User ${id}` ``

#### **Async/Await**
- Always use async/await (no raw promises)
- Always use try/catch in controllers

```javascript
// ✅ Good
static async getWallet(req, res) {
  try {
    const wallet = await WalletService.getWallet(userId);
    sendSuccess(res, wallet);
  } catch (error) {
    sendError(res, error.message);
  }
}

// ❌ Bad
static getWallet(req, res) {
  WalletService.getWallet(userId)
    .then(wallet => sendSuccess(res, wallet))
    .catch(error => sendError(res, error.message));
}
```

#### **Error Handling**

```javascript
// In Services - throw errors with descriptive messages
if (!wallet) {
  throw new Error('Wallet not found');
}

if (amount < 100) {
  throw new Error('Minimum top-up amount is 100 NGN');
}

// In Controllers - catch and return appropriate HTTP status
try {
  // ... service call
} catch (error) {
  if (error.message.includes('not found')) {
    return sendError(res, error.message, NOT_FOUND);
  }
  if (error.message.includes('Insufficient')) {
    return sendError(res, error.message, 422);
  }
  sendError(res, error.message, BAD_REQUEST);
}
```

#### **Database Transactions**

Use transactions for multi-step operations:

```javascript
static async transferFunds(fromUserId, toUserId, amount) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Deduct from sender
    await client.query(
      'UPDATE wallets SET balance = balance - $1 WHERE user_id = $2',
      [amount, fromUserId]
    );
    
    // Add to receiver
    await client.query(
      'UPDATE wallets SET balance = balance + $1 WHERE user_id = $2',
      [amount, toUserId]
    );
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

#### **Comments**

Use JSDoc-style comments for functions:

```javascript
/**
 * Add funds to user wallet
 * 
 * @param {string} userId - User ID
 * @param {number} amount - Amount in kobo/cents
 * @param {string} source - Payment source (card, bank, etc.)
 * @param {Object} metadata - Additional transaction metadata
 * @returns {Promise<Object>} Transaction result
 * @throws {Error} If amount is below minimum or wallet not found
 */
static async addFunds(userId, amount, source, metadata = {}) {
  // Implementation
}
```

---

## Testing Requirements

### Test File Structure

Create tests in `src/tests/{module}.test.js`:

```
src/tests/
├── auth.test.js
├── rbac.test.js
├── orders.test.js
├── wallet.test.js          # Your new module tests
├── setup.js
├── cleanup-helper.js
└── README.md
```

### Test Template

```javascript
// src/tests/wallet.test.js

/**
 * Wallet Module Integration Tests
 * 
 * Tests wallet operations, transactions, and balance management
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3010/api';

// Test data tracking
const testUsers = {
  customer: null,
  shopper: null
};

const testTokens = {
  customer: null,
  shopper: null
};

const testData = {
  wallets: [],
  transactions: []
};

// Helper to create test user
async function createTestUser(role, emailPrefix) {
  const timestamp = Date.now();
  const phoneNumber = `08${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;
  
  const email = `${emailPrefix}-${timestamp}@test-wallet.com`;
  const password = 'Test@123456';
  
  const userData = {
    email,
    phone: phoneNumber,
    password,
    first_name: role.charAt(0).toUpperCase() + role.slice(1),
    last_name: 'Tester',
    role: role
  };

  // Register user
  await axios.post(`${API_BASE_URL}/auth/register`, userData);
  
  // Login to get token
  const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
    identifier: email,
    password: password
  });

  return { 
    user: loginResponse.data.data.user, 
    token: loginResponse.data.data.access_token 
  };
}

// Cleanup function
async function cleanupTestData() {
  console.log('\n🧹 Cleaning up test data...');
  
  // Delete users (cascades to wallets, transactions)
  for (const [role, user] of Object.entries(testUsers)) {
    if (user && testTokens[role]) {
      try {
        await axios.delete(`${API_BASE_URL}/users/me`, {
          headers: { Authorization: `Bearer ${testTokens[role]}` }
        });
      } catch (error) {
        // User might already be deleted
      }
    }
  }

  console.log('✅ Cleanup completed');
}

// Setup: Create test users
beforeAll(async () => {
  console.log('🚀 Setting up wallet tests...');
  
  try {
    const customer = await createTestUser('customer', 'customer-wallet');
    testUsers.customer = customer.user;
    testTokens.customer = customer.token;

    const shopper = await createTestUser('shopper', 'shopper-wallet');
    testUsers.shopper = shopper.user;
    testTokens.shopper = shopper.token;

    console.log('✅ Test users created');
  } catch (error) {
    console.error('❌ Setup failed:', error.response?.data || error.message);
    throw error;
  }
}, 30000);

// Cleanup after all tests
afterAll(async () => {
  await cleanupTestData();
}, 30000);

describe('Wallet API', () => {
  describe('GET /api/wallet - Get Wallet', () => {
    test('should get or create wallet for customer', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/wallet`,
        { headers: { Authorization: `Bearer ${testTokens.customer}` } }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('wallet_id');
      expect(response.data.data).toHaveProperty('balance');
      expect(response.data.data.balance).toBe(0); // New wallet starts at 0
    });

    test('should fail without authentication', async () => {
      try {
        await axios.get(`${API_BASE_URL}/wallet`);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
      }
    });
  });

  describe('POST /api/wallet/topup - Top Up Wallet', () => {
    test('should top up wallet successfully', async () => {
      const topUpData = {
        amount: 50000, // 500 NGN
        payment_method: 'card'
      };

      const response = await axios.post(
        `${API_BASE_URL}/wallet/topup`,
        topUpData,
        { headers: { Authorization: `Bearer ${testTokens.customer}` } }
      );

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('transaction_id');
      expect(response.data.data).toHaveProperty('new_balance');
      expect(response.data.data.new_balance).toBe(50000);
    });

    test('should fail with amount below minimum', async () => {
      try {
        await axios.post(
          `${API_BASE_URL}/wallet/topup`,
          { amount: 50, payment_method: 'card' }, // Below minimum
          { headers: { Authorization: `Bearer ${testTokens.customer}` } }
        );
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBeGreaterThanOrEqual(400);
      }
    });

    test('should fail without authentication', async () => {
      try {
        await axios.post(
          `${API_BASE_URL}/wallet/topup`,
          { amount: 10000, payment_method: 'card' }
        );
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
      }
    });
  });

  describe('POST /api/wallet/withdraw - Withdraw Funds', () => {
    beforeAll(async () => {
      // Top up shopper wallet first
      await axios.post(
        `${API_BASE_URL}/wallet/topup`,
        { amount: 100000, payment_method: 'card' },
        { headers: { Authorization: `Bearer ${testTokens.shopper}` } }
      );
    });

    test('should withdraw funds successfully', async () => {
      const withdrawData = {
        amount: 50000,
        bank_account: {
          account_number: '0123456789',
          bank_code: '058',
          account_name: 'Test Shopper'
        }
      };

      const response = await axios.post(
        `${API_BASE_URL}/wallet/withdraw`,
        withdrawData,
        { headers: { Authorization: `Bearer ${testTokens.shopper}` } }
      );

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('transaction_id');
      expect(response.data.data.new_balance).toBe(50000);
    });

    test('should fail with insufficient balance', async () => {
      try {
        await axios.post(
          `${API_BASE_URL}/wallet/withdraw`,
          { 
            amount: 1000000, // More than balance
            bank_account: { account_number: '0123456789', bank_code: '058' }
          },
          { headers: { Authorization: `Bearer ${testTokens.shopper}` } }
        );
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBeGreaterThanOrEqual(400);
        expect(error.response.data.message).toContain('Insufficient');
      }
    });

    test('should fail for customer role', async () => {
      try {
        await axios.post(
          `${API_BASE_URL}/wallet/withdraw`,
          { 
            amount: 10000,
            bank_account: { account_number: '0123456789', bank_code: '058' }
          },
          { headers: { Authorization: `Bearer ${testTokens.customer}` } }
        );
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(403); // Forbidden - role check
      }
    });
  });

  describe('GET /api/wallet/transactions - Transaction History', () => {
    test('should get transaction history', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/wallet/transactions`,
        { 
          headers: { Authorization: `Bearer ${testTokens.customer}` },
          params: { page: 1, limit: 10 }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.data).toHaveProperty('transactions');
      expect(Array.isArray(response.data.data.transactions)).toBe(true);
      expect(response.data).toHaveProperty('pagination');
    });
  });
});
```

### Test Requirements

**Every new module MUST have:**

1. ✅ **Setup** - Create test users with proper roles
2. ✅ **Cleanup** - Delete all test data in `afterAll()`
3. ✅ **Positive tests** - Test successful operations
4. ✅ **Negative tests** - Test error conditions
5. ✅ **Auth tests** - Test authentication requirements
6. ✅ **RBAC tests** - Test role-based access
7. ✅ **Validation tests** - Test input validation

**Minimum Coverage:**
- At least one test per API endpoint
- Test success case + at least 2 failure cases per endpoint
- All RBAC roles tested

---

## Database Migrations

### Creating a Migration

```bash
# Create new migration file
# Format: {number}_description.sql
touch src/db/migrations/003_create_wallet_tables.sql
```

### Migration Template

```sql
-- ============================================================================
-- WALLET MANAGEMENT SYSTEM
-- ============================================================================

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE,
  balance INTEGER DEFAULT 0,              -- Amount in kobo/cents
  currency VARCHAR(3) DEFAULT 'NGN',
  status VARCHAR(20) DEFAULT 'active',    -- active, suspended, frozen
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_wallets_user ON wallets(user_id);
CREATE INDEX idx_wallets_status ON wallets(status);

COMMENT ON TABLE wallets IS 'User wallet balances for platform transactions';
COMMENT ON COLUMN wallets.balance IS 'Balance in kobo (1/100 of NGN)';

-- Transactions table
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL,
  type VARCHAR(20) NOT NULL,              -- credit, debit, refund, fee
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  source VARCHAR(50),                     -- card, bank, order_payment, withdrawal
  destination VARCHAR(50),
  reference VARCHAR(100) UNIQUE,
  status VARCHAR(20) DEFAULT 'pending',   -- pending, completed, failed, reversed
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  
  FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
);

CREATE INDEX idx_transactions_wallet ON wallet_transactions(wallet_id);
CREATE INDEX idx_transactions_type ON wallet_transactions(type);
CREATE INDEX idx_transactions_status ON wallet_transactions(status);
CREATE INDEX idx_transactions_created_at ON wallet_transactions(created_at);
CREATE INDEX idx_transactions_reference ON wallet_transactions(reference);

COMMENT ON TABLE wallet_transactions IS 'All wallet transaction history';
```

### Migration Best Practices

1. **Use UUID for IDs** (except for reference tables like countries)
2. **Add indexes** for foreign keys and frequently queried columns
3. **Use JSONB** for flexible metadata
4. **Include comments** for complex tables/columns
5. **Use transactions** (handled by migrate.js)
6. **Use IF NOT EXISTS** for idempotency

---

## Registering Your Module

### 1. Add to Module Index

```javascript
// src/modules/index.js

module.exports = {
  users: require('./users/routes'),
  auth: require('./auth/routes'),
  files: require('./files/routes'),
  orders: require('./orders/routes'),
  wallet: require('./wallet/routes'), // Add your module
};
```

### 2. Add to Main Router

```javascript
// src/routes/index.js

const walletRoutes = require('../modules/wallet/routes');

// ... other routes

router.use('/wallet', walletRoutes);
```

### 3. Add Test Script

```json
// package.json

"scripts": {
  "test:wallet": "NODE_ENV=test jest src/tests/wallet.test.js --runInBand"
}
```

---

## Pull Request Process

### 1. Before Submitting

**Run all checks:**

```bash
# Run migrations
npm run migrate

# Run all tests
npm test

# Run your module tests
npm run test:wallet

# Check for linting errors (if eslint configured)
npm run lint
```

### 2. Commit Guidelines

**Format:** `type(scope): description`

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `test`: Adding tests
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `chore`: Maintenance tasks

**Examples:**

```bash
git commit -m "feat(wallet): add wallet top-up functionality"
git commit -m "test(wallet): add transaction history tests"
git commit -m "fix(orders): correct fee calculation for long distances"
git commit -m "docs(wallet): add wallet API documentation"
```

### 3. Push and Create PR

```bash
# Push your branch
git push origin feature/wallet-management

# Create Pull Request:
# - Base branch: development (not main!)
# - Compare branch: feature/wallet-management
# - Clear title describing the feature
# - Description of what was added
# - List of API endpoints added
# - Test coverage summary
# - Any breaking changes
```

### 4. Branch Strategy

**Main Branches:**
- `main` - Production-ready code
- `development` - Integration branch for features

**Feature Branches:**
- Created from: `development`
- Merged into: `development`
- Naming: `feature/`, `fix/`, `test/`, `docs/`

**Release Flow:**
```
feature/wallet → development → (release) → main
```

### 5. PR Template

```markdown
**Base Branch:** `development`

## Description
Added wallet management module with top-up and withdrawal functionality.

## Changes
- ✅ Created wallet module (models, services, controllers, routes)
- ✅ Added wallet and transactions tables (migration 003)
- ✅ Implemented top-up with multiple payment methods
- ✅ Implemented withdrawal with bank account validation
- ✅ Added transaction history with pagination
- ✅ Comprehensive test suite (25 tests, 100% passing)

## API Endpoints Added
- `GET /api/wallet` - Get wallet balance
- `POST /api/wallet/topup` - Add funds
- `POST /api/wallet/withdraw` - Withdraw funds (shopper/dispatcher only)
- `GET /api/wallet/transactions` - Transaction history

## Test Coverage
```bash
npm run test:wallet
```
- 25 tests covering all endpoints
- Role-based access control tested
- Validation rules tested
- Error scenarios covered
- **All tests passing** ✅

## Database Changes
✅ **Migration Required** - Run `npm run migrate` after merging
- Created `wallets` table
- Created `wallet_transactions` table

## Breaking Changes
❌ None

## How to Test
```bash
# Start server
npm run dev

# In another terminal, run tests
npm run test:wallet
```

## Checklist
- [x] Code follows style guide
- [x] Tests added and passing (25/25)
- [x] Documentation updated (README, SETUP)
- [x] Migration file created with proper indexes
- [x] No console.log() or debugging code
- [x] Proper error handling throughout
- [x] RBAC middleware applied correctly
- [x] Merged from `development` branch
```

---

## Code Review Checklist

Before requesting review, ensure:

- [ ] **Architecture** - Follows modular pattern (models, services, controllers)
- [ ] **Naming** - Consistent with existing codebase
- [ ] **Comments** - All functions have JSDoc comments
- [ ] **Error Handling** - All async operations wrapped in try/catch
- [ ] **Validation** - Input validation in routes
- [ ] **RBAC** - Proper role checks applied
- [ ] **Tests** - Comprehensive test coverage (>80%)
- [ ] **Documentation** - README and SETUP updated if needed
- [ ] **Database** - Migrations use proper indexes and constraints
- [ ] **Security** - No sensitive data in logs, proper auth checks
- [ ] **Performance** - Queries optimized, indexes added

---

## Common Patterns

### Using Centralized Systems

#### **Locations**

```javascript
const LocationModel = require('../../../shared/models/location.model');

// Create location
const location = await LocationModel.create({
  latitude: 6.5244,
  longitude: 3.3792,
  address_line1: '123 Street',
  city: 'Lagos',
  country: 'Nigeria', // Auto-converts to country_id
  place_name: 'Test Location',
  created_by: userId
});

// Use location_id in your table
await YourModel.create({
  location_id: location.id,
  // ... other fields
});
```

#### **Files**

```javascript
const FileService = require('../../files/services/file.service');

// Reference files by ID
const photoData = {
  file_id: 'uuid-of-uploaded-file',
  context: 'wallet_proof',
  // ... other fields
};
```

#### **Countries**

```javascript
const CountryModel = require('../../../shared/models/country.model');

// Get default country (Nigeria)
const country = await CountryModel.getDefault();

// Get by ISO code
const country = await CountryModel.getByIsoCode('NG');
```

---

## Need Help?

- **Architecture questions**: Check `api-architecture-guidelines.md`
- **API reference**: Check `api-documentation.md`
- **Code examples**: Check existing modules (`auth`, `orders`, `files`)
- **Test examples**: Check `src/tests/` directory
- **Database schema**: Check migration files in `src/db/migrations/`

## 📧 Contact

For questions or support, contact: info@opinionpulse.org

---

**Happy coding! 🚀**

