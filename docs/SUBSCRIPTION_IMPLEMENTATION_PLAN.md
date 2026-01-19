# Subscription Payment Implementation Plan

## Overview

This plan outlines the implementation of subscription-based payments for SmartStore, aligning with the existing payments module structure while adding subscription-specific functionality.

**Current State**: The payments module is designed for donations/campaigns.  
**Target State**: Support both donations/campaigns AND subscription payments.

---

## File Changes Summary

### 📝 Files to Add (New)
- `src/modules/payments/models/payment.model.js` - Create payments table model
- `src/modules/payments/models/paymentMethod.model.js` - Create payment_methods table model
- `src/modules/payments/models/subscription.model.js` - Create subscriptions table model
- `src/modules/payments/models/sitePageUsage.model.js` - Create site_page_usage table model
- `src/modules/payments/controllers/subscription.controller.js` - Subscription controller
- `src/modules/payments/services/subscription.service.js` - Subscription service
- `src/modules/payments/services/planAccess.service.js` - Plan access service (middleware)
- `src/modules/payments/routes/subscription.routes.js` - Subscription routes
- `src/db/migrations/XXX_create_payment_methods_table.sql` - Create payment_methods table
- `src/db/migrations/XXX_create_payments_table.sql` - Create payments table (with subscription support)
- `src/db/migrations/XXX_create_subscriptions_table.sql` - Create user_subscriptions table
- `src/db/migrations/XXX_create_site_page_usage_table.sql` - Create site_page_usage table
- `src/db/migrations/XXX_add_subscription_fk_to_payments.sql` - Add foreign key constraint
- `src/db/migrations/XXX_initialize_subscriptions_for_existing_users.sql` - Initialize existing users

### 🔄 Files to Modify (Update Existing)
- `src/modules/payments/routes/index.js` - Add subscription routes mount
- `src/modules/payments/services/payment.service.js` - Add subscription payment methods (if service already exists, otherwise create new)
- `src/modules/payments/controllers/payment.controller.js` - Add subscription payment methods (if controller already exists, otherwise create new)
- `src/modules/sites/models/site.model.js` - Add plan access methods
- `src/modules/sites/routes/public.api.routes.js` - Add plan checks (optional, for public info)
- `src/modules/sites/routes.js` - Add plan access middleware
- `src/modules/sites/controllers/page.controller.js` - Add page limit checks
- `src/modules/sites/controllers/customDomain.controller.js` - Add custom domain plan checks
- `src/modules/users/models/user.model.js` - Add `plan_type` field (or use subscriptions table)

### ❌ Files to Keep (May Need Updates)
- `src/modules/payments/services/paymentProcessor.service.js` - Reuse payment processor for subscriptions
- `src/modules/payments/middleware/` - Reuse validation/auth middleware
- `src/modules/payments/models/campaign.model.js` - Donations/campaigns functionality (if exists)
- `src/modules/payments/models/donor.model.js` - Donations functionality (if exists)
- `src/modules/payments/services/paymentProcessor.service.js` - Reuse for subscription payments
- `src/modules/payments/controllers/payment.controller.js` - Keep donation payments, add subscription methods
- `src/modules/payments/routes/payment.routes.js` - Keep donation routes, add subscription routes

### 🗑️ Files to Remove (Consider Removing)
- **None** - The donation/campaign functionality can coexist with subscriptions

---

## Detailed Implementation Steps

### Phase 1: Database Schema

**Note**: Payment-related tables need to be created. We will create:
- **`payments` table** - Handles both donation and subscription payments
- **`payment_methods` table** - Payment providers (Stripe, PayPal, Flutterwave, Paystack)
- **`user_subscriptions` table** - User subscription plans
- **`site_page_usage` table** - Track page usage per site

#### Step 1.1: Create Payment Methods Table
**File**: `src/db/migrations/XXX_create_payment_methods_table.sql`

**Note**: This should be created FIRST before payments table (payments references payment_methods).

```sql
-- Payment Methods Table
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL, -- 'stripe', 'paypal', 'flutterwave', 'paystack'
  type VARCHAR(20) NOT NULL, -- 'gateway', 'manual'
  is_active BOOLEAN DEFAULT TRUE,
  supported_currencies JSONB DEFAULT '["NGN", "USD"]',
  processing_fee DECIMAL(10,4) DEFAULT 0,
  processing_fee_type VARCHAR(20) DEFAULT 'percentage', -- 'percentage', 'fixed'
  api_public_key TEXT,
  api_secret_key TEXT,
  webhook_secret TEXT,
  base_url TEXT,
  display_name VARCHAR(100),
  description TEXT,
  icon_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_code ON payment_methods(code);
CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON payment_methods(is_active);

-- Seed default payment methods (Stripe, PayPal for subscriptions)
INSERT INTO payment_methods (name, code, type, display_name, description, is_active, supported_currencies)
VALUES 
  ('Stripe', 'stripe', 'gateway', 'Stripe', 'Stripe payment gateway', true, '["USD", "EUR", "GBP"]'::jsonb),
  ('PayPal', 'paypal', 'gateway', 'PayPal', 'PayPal payment gateway', true, '["USD", "EUR", "GBP"]'::jsonb),
  ('Flutterwave', 'flutterwave', 'gateway', 'Flutterwave', 'Flutterwave payment gateway', true, '["NGN", "USD", "KES", "GHS", "ZAR"]'::jsonb),
  ('Paystack', 'paystack', 'gateway', 'Paystack', 'Paystack payment gateway', true, '["NGN", "ZAR", "KES", "GHS"]'::jsonb)
ON CONFLICT (code) DO NOTHING;
```

#### Step 1.2: Create Payments Table
**File**: `src/db/migrations/XXX_create_payments_table.sql`

**Note**: This table handles both donation and subscription payments.

```sql
-- Payments Table (for both donations and subscriptions)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id VARCHAR(255) UNIQUE NOT NULL, -- Unique payment identifier
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  type VARCHAR(50) NOT NULL, -- 'donation', 'dues', 'campaign', 'event', 'merchandise', 'subscription'
  payment_type VARCHAR(50) DEFAULT 'donation' CHECK (payment_type IN ('donation', 'subscription', 'campaign', 'event', 'merchandise')),
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded', 'processing'
  
  -- Payment Details
  payment_method VARCHAR(50), -- 'stripe', 'paypal', 'flutterwave', 'paystack'
  payment_method_id UUID REFERENCES payment_methods(id),
  transaction_ref VARCHAR(255), -- External payment processor reference
  processor_response JSONB, -- Raw response from payment processor
  
  -- User/Donor Information
  user_id UUID REFERENCES users(id), -- User making the payment (for both donations and subscriptions)
  donor_id UUID REFERENCES users(id), -- Legacy: for donations (same as user_id)
  anonymous_donor_first_name VARCHAR(100),
  anonymous_donor_last_name VARCHAR(100),
  anonymous_donor_email VARCHAR(255),
  anonymous_donor_phone VARCHAR(20),
  
  -- Subscription (for subscription payments)
  subscription_id UUID, -- Will reference user_subscriptions(id) after table is created
  
  -- Campaign/Purpose (for donations)
  campaign_id UUID, -- For donation campaigns
  purpose TEXT, -- General purpose if not campaign-specific
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  user_agent TEXT,
  ip_address INET,
  source VARCHAR(20) DEFAULT 'web', -- 'web', 'mobile', 'api'
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_interval VARCHAR(20), -- 'monthly', 'quarterly', 'annually'
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP WITH TIME ZONE,
  
  -- Optional fields
  notes TEXT,
  internal_notes TEXT, -- Admin-only notes
  receipt_url TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_donor_id ON payments(donor_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_campaign_id ON payments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_payment_type ON payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_ref ON payments(transaction_ref);
CREATE INDEX IF NOT EXISTS idx_payments_anonymous_email ON payments(anonymous_donor_email);
```

**Note**: The `subscription_id` foreign key constraint will be added after `user_subscriptions` table is created (in a separate migration step).

#### Step 1.3: Create Subscriptions Table
**File**: `src/db/migrations/XXX_create_subscriptions_table.sql`

```sql
CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_type VARCHAR(50) NOT NULL DEFAULT 'free', -- 'free', 'small_scale', 'medium_scale', 'large_scale'
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'cancelled', 'expired', 'past_due', 'trialing'
  billing_cycle VARCHAR(20) DEFAULT 'monthly', -- 'monthly', 'annual'
  current_period_start TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  current_period_end TIMESTAMP NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  
  -- Payment Provider Integration
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_customer_id VARCHAR(255),
  paypal_subscription_id VARCHAR(255) UNIQUE,
  
  -- Pricing
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0, -- Monthly/annual amount based on billing_cycle
  currency VARCHAR(3) DEFAULT 'USD',
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT valid_plan_type CHECK (plan_type IN ('free', 'small_scale', 'medium_scale', 'large_scale')),
  CONSTRAINT valid_status CHECK (status IN ('active', 'cancelled', 'expired', 'past_due', 'trialing')),
  CONSTRAINT valid_billing_cycle CHECK (billing_cycle IN ('monthly', 'annual'))
);

-- Indexes
CREATE INDEX idx_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_subscriptions_plan_type ON user_subscriptions(plan_type);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON user_subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_stripe_customer_id ON user_subscriptions(stripe_customer_id);
CREATE UNIQUE INDEX idx_subscriptions_active_user ON user_subscriptions(user_id) WHERE status = 'active';

-- Add foreign key constraint for subscription_id (after user_subscriptions table is created)
ALTER TABLE payments 
ADD CONSTRAINT fk_payments_subscription_id 
FOREIGN KEY (subscription_id) REFERENCES user_subscriptions(id) ON DELETE SET NULL;
```

#### Step 1.4: Create Site Page Usage Table
**File**: `src/db/migrations/XXX_create_site_page_usage_table.sql`

```sql
CREATE TABLE site_page_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_count INTEGER NOT NULL DEFAULT 0,
  plan_limit INTEGER NOT NULL DEFAULT 5, -- Based on current subscription plan
  additional_pages INTEGER DEFAULT 0, -- Pages beyond plan limit (paid separately for small scale)
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(site_id)
);

CREATE INDEX idx_site_page_usage_site_id ON site_page_usage(site_id);
```

#### Step 1.4: Add Foreign Key Constraint for Payments
**File**: `src/db/migrations/XXX_add_subscription_fk_to_payments.sql`

**Note**: This migration runs AFTER `user_subscriptions` table is created.

```sql
-- Add foreign key constraint for subscription_id in payments table
ALTER TABLE payments 
ADD CONSTRAINT IF NOT EXISTS fk_payments_subscription_id 
FOREIGN KEY (subscription_id) REFERENCES user_subscriptions(id) ON DELETE SET NULL;
```

#### Step 1.5: Initialize Existing Users with Free Plan
**File**: `src/db/migrations/XXX_initialize_subscriptions_for_existing_users.sql`

```sql
-- Create free subscriptions for all existing users
INSERT INTO user_subscriptions (user_id, plan_type, status, current_period_start, current_period_end, amount)
SELECT 
  id as user_id,
  'free' as plan_type,
  'active' as status,
  CURRENT_TIMESTAMP as current_period_start,
  (CURRENT_TIMESTAMP + INTERVAL '1 year') as current_period_end,
  0 as amount
FROM users
ON CONFLICT DO NOTHING;

-- Initialize page usage for existing sites
INSERT INTO site_page_usage (site_id, page_count, plan_limit)
SELECT 
  id as site_id,
  COALESCE((SELECT COUNT(*) FROM pages WHERE site_id = sites.id), 0) as page_count,
  5 as plan_limit -- Free plan limit
FROM sites
ON CONFLICT (site_id) DO NOTHING;
```

---

### Phase 2: Models

#### Step 2.1: Create Subscription Model
**File**: `src/modules/payments/models/subscription.model.js` (NEW)

```javascript
const pool = require('../../../config/database');

class Subscription {
  constructor() {
    this.tableName = 'user_subscriptions';
  }

  // Create subscription
  async create(subscriptionData) { }

  // Get active subscription for user
  async getActiveByUserId(userId) { }

  // Update subscription
  async update(id, data) { }

  // Cancel subscription
  async cancel(id, cancelAtPeriodEnd = true) { }

  // Get subscription by Stripe/PayPal ID
  async findByProviderId(providerId, provider = 'stripe') { }

  // Get all subscriptions for user
  async findByUserId(userId) { }

  // Update status
  async updateStatus(id, status) { }

  // Get subscriptions expiring soon (for notifications)
  async getExpiringSoon(days = 7) { }

  // Get past due subscriptions
  async getPastDue() { }
}

module.exports = new Subscription();
```

#### Step 2.2: Create Site Page Usage Model
**File**: `src/modules/payments/models/sitePageUsage.model.js` (NEW)

```javascript
const pool = require('../../../config/database');

class SitePageUsage {
  constructor() {
    this.tableName = 'site_page_usage';
  }

  // Get or create usage record
  async getOrCreate(siteId) { }

  // Update page count
  async updatePageCount(siteId, pageCount) { }

  // Get current usage
  async getUsage(siteId) { }

  // Check if site can create more pages
  async canCreatePage(siteId, currentPlanLimit) { }

  // Get all sites exceeding their limit
  async getSitesExceedingLimit() { }
}

module.exports = new SitePageUsage();
```

#### Step 2.3: Modify Payment Model
**File**: `src/modules/payments/models/payment.model.js` (MODIFY)

**Changes:**
- Add methods to query by `subscription_id`
- Add methods to filter by `payment_type = 'subscription'`
- Update `create` method to accept `subscription_id` and `payment_type`

**Add Methods:**
```javascript
// Get payments by subscription
async findBySubscriptionId(subscriptionId, options = {}) { }

// Get subscription payments by user
async getSubscriptionPaymentsByUserId(userId, options = {}) { }
```

---

### Phase 3: Services

#### Step 3.1: Create Subscription Service
**File**: `src/modules/payments/services/subscription.service.js` (NEW)

**Key Methods:**
- `createSubscription(userId, planType, billingCycle)` - Create new subscription
- `upgradeSubscription(subscriptionId, newPlanType)` - Upgrade with pro-rated billing
- `downgradeSubscription(subscriptionId, newPlanType)` - Schedule downgrade
- `cancelSubscription(subscriptionId, immediately)` - Cancel subscription
- `renewSubscription(subscriptionId)` - Process renewal payment
- `processSubscriptionPayment(subscriptionId, paymentData)` - Handle recurring payment
- `getSubscriptionFeatures(planType)` - Get plan features/limits
- `checkFeatureAccess(userId, feature)` - Check if user has access to feature
- `syncSubscriptionFromProvider(providerId, providerData)` - Sync from Stripe/PayPal webhook

#### Step 3.2: Create Plan Access Service
**File**: `src/modules/payments/services/planAccess.service.js` (NEW)

**Key Methods:**
- `getUserPlan(userId)` - Get user's current plan
- `checkPageLimit(userId, siteId)` - Check if user can create more pages
- `checkCustomDomainAccess(userId)` - Check if user can add custom domains
- `getPlanLimits(planType)` - Get all limits for a plan
- `canUpgrade(userId, newPlanType)` - Check if user can upgrade

#### Step 3.3: Modify Payment Service
**File**: `src/modules/payments/services/payment.service.js` (MODIFY)

**Add Methods:**
```javascript
// Create subscription payment
async createSubscriptionPayment(subscriptionId, paymentData) { }

// Process subscription renewal
async processSubscriptionRenewal(subscriptionId) { }

// Handle subscription payment webhook
async handleSubscriptionWebhook(webhookData) { }
```

---

### Phase 4: Controllers

#### Step 4.1: Create Subscription Controller
**File**: `src/modules/payments/controllers/subscription.controller.js` (NEW)

**Key Endpoints:**
- `GET /subscriptions/current` - Get current subscription
- `GET /subscriptions/plans` - Get available plans
- `POST /subscriptions/upgrade` - Upgrade plan
- `POST /subscriptions/downgrade` - Downgrade plan (scheduled)
- `POST /subscriptions/cancel` - Cancel subscription
- `GET /subscriptions/usage` - Get current usage (pages, etc.)
- `GET /subscriptions/history` - Get subscription history
- `GET /subscriptions/invoices` - Get invoices
- `POST /subscriptions/webhook` - Handle payment provider webhooks

#### Step 4.2: Modify Site Controllers

**File**: `src/modules/sites/controllers/page.controller.js` (MODIFY)

**Add Plan Checks:**
```javascript
// In createPage method
const canCreate = await PlanAccessService.checkPageLimit(req.user.id, siteId);
if (!canCreate.allowed) {
  return sendError(res, canCreate.message, FORBIDDEN);
}
```

**File**: `src/modules/sites/controllers/customDomain.controller.js` (MODIFY)

**Add Plan Checks:**
```javascript
// In addCustomDomain method
const hasAccess = await PlanAccessService.checkCustomDomainAccess(req.user.id);
if (!hasAccess) {
  return sendError(res, 'Custom domains require Small Scale plan or higher', FORBIDDEN);
}
```

---

### Phase 5: Routes

#### Step 5.1: Create Subscription Routes
**File**: `src/modules/payments/routes/subscription.routes.js` (NEW)

```javascript
const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const authorize = require('../../../auth/middleware/authorize');

// All routes require authentication
router.use(authorize);

// Get current subscription
router.get('/current', subscriptionController.getCurrentSubscription);

// Get available plans
router.get('/plans', subscriptionController.getAvailablePlans);

// Get usage
router.get('/usage', subscriptionController.getUsage);

// Upgrade/Downgrade
router.post('/upgrade', subscriptionController.upgrade);
router.post('/downgrade', subscriptionController.downgrade);

// Cancel
router.post('/cancel', subscriptionController.cancel);

// History & Invoices
router.get('/history', subscriptionController.getHistory);
router.get('/invoices', subscriptionController.getInvoices);

// Webhook (no auth - verified by signature)
router.post('/webhook', subscriptionController.handleWebhook);

module.exports = router;
```

#### Step 5.2: Modify Payments Routes Index
**File**: `src/modules/payments/routes/index.js` (MODIFY)

**Add:**
```javascript
const subscriptionRoutes = require('./subscription.routes');

// Mount subscription routes
router.use('/subscriptions', subscriptionRoutes);
```

#### Step 5.3: Add Middleware to Site Routes
**File**: `src/modules/sites/routes.js` (MODIFY)

**Add plan access middleware:**
```javascript
const checkPlanAccess = require('../middleware/planAccess.middleware');

// Protect page creation routes
router.post('/sites/:id/pages', 
  authenticate, 
  checkPlanAccess('page_creation'),
  pageController.createPage
);

// Protect custom domain routes
router.post('/sites/:id/custom-domains',
  authenticate,
  checkPlanAccess('custom_domains'),
  customDomainController.addCustomDomain
);
```

#### Step 5.4: Create Plan Access Middleware
**File**: `src/modules/sites/middleware/planAccess.middleware.js` (NEW)

```javascript
const PlanAccessService = require('../../payments/services/planAccess.service');

const checkPlanAccess = (feature) => {
  return async (req, res, next) => {
    const userId = req.user.id;
    
    try {
      const hasAccess = await PlanAccessService.checkFeatureAccess(userId, feature);
      
      if (!hasAccess) {
        const userPlan = await PlanAccessService.getUserPlan(userId);
        const requiredPlan = getRequiredPlanForFeature(feature);
        
        return res.status(403).json({
          success: false,
          message: `This feature requires ${requiredPlan} plan or higher`,
          currentPlan: userPlan.plan_type,
          requiredPlan: requiredPlan
        });
      }
      
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error checking plan access'
      });
    }
  };
};

module.exports = checkPlanAccess;
```

---

### Phase 6: Configuration

#### Step 6.1: Create Plan Configuration
**File**: `src/modules/payments/config/plans.config.js` (NEW)

```javascript
const PLAN_CONFIG = {
  free: {
    name: 'Free Plan',
    monthly: 0,
    annual: 0,
    pageLimit: 5,
    features: {
      subdomain: true,
      publish: true,
      customDomains: false,
      additionalPages: false,
    }
  },
  small_scale: {
    name: 'Small Scale',
    monthly: 9.99,
    annual: 99.99,
    pageLimit: 10,
    additionalPagePrice: 0.50, // per page per month
    features: {
      subdomain: true,
      publish: true,
      customDomains: true,
      additionalPages: true,
    }
  },
  medium_scale: {
    name: 'Medium Scale',
    monthly: 29.99,
    annual: 299.99,
    pageLimit: 25,
    features: {
      subdomain: true,
      publish: true,
      customDomains: true,
      additionalPages: false, // Not needed, 25 is enough
      prioritySupport: true,
      analytics: true,
    }
  },
  large_scale: {
    name: 'Large Scale',
    monthly: 99.99,
    annual: 999.99,
    pageLimit: -1, // Unlimited
    features: {
      subdomain: true,
      publish: true,
      customDomains: true,
      additionalPages: false,
      prioritySupport: true,
      analytics: true,
      apiAccess: true,
      whiteLabel: true,
    }
  }
};

module.exports = PLAN_CONFIG;
```

---

### Phase 7: Integration Points

#### Step 7.1: Update Site Creation Flow
**File**: `src/modules/sites/services/site.service.js` (MODIFY)

**Add page usage tracking:**
```javascript
// After site creation
await SitePageUsageModel.getOrCreate(siteId);
```

#### Step 7.2: Update Page Creation Flow
**File**: `src/modules/sites/services/page.service.js` (MODIFY)

**Add limit check:**
```javascript
// Before creating page
const usage = await SitePageUsageModel.getUsage(siteId);
const subscription = await SubscriptionModel.getActiveByUserId(userId);
const planConfig = PLAN_CONFIG[subscription.plan_type];

if (usage.page_count >= planConfig.pageLimit && subscription.plan_type === 'free') {
  throw new Error('Page limit reached. Upgrade to create more pages.');
}

// After page creation
await SitePageUsageModel.updatePageCount(siteId, usage.page_count + 1);
```

#### Step 7.3: Update Custom Domain Flow
**File**: `src/modules/sites/services/customDomain.service.js` (MODIFY)

**Add plan check:**
```javascript
// Before adding custom domain
const subscription = await SubscriptionModel.getActiveByUserId(userId);
if (subscription.plan_type === 'free') {
  throw new Error('Custom domains require Small Scale plan or higher');
}
```

---

## Migration Order

1. **Database Migrations** (Phase 1)
   - Create subscriptions table
   - Create site_page_usage table
   - Add subscription_id to payments
   - Initialize existing users

2. **Models** (Phase 2)
   - Create Subscription model
   - Create SitePageUsage model
   - Modify Payment model

3. **Services** (Phase 3)
   - Create SubscriptionService
   - Create PlanAccessService
   - Modify PaymentService

4. **Controllers & Routes** (Phase 4 & 5)
   - Create SubscriptionController
   - Create Subscription routes
   - Modify Site controllers
   - Add middleware

5. **Integration** (Phase 6 & 7)
   - Add plan checks to existing flows
   - Update site/page/domain creation

---

## Testing Checklist

- [ ] Create free subscription for new user
- [ ] Upgrade from free to small scale
- [ ] Downgrade from small scale to free (with restrictions)
- [ ] Test page limit enforcement (free plan, 5 pages)
- [ ] Test custom domain restriction (free plan)
- [ ] Test additional page billing (small scale, beyond 10 pages)
- [ ] Test subscription renewal (webhook handling)
- [ ] Test subscription cancellation
- [ ] Test pro-rated upgrade billing
- [ ] Test past-due subscription handling
- [ ] Test plan access middleware
- [ ] Test existing donation functionality (ensure not broken)

---

## Rollback Plan

If issues arise:
1. Remove subscription routes from `index.js`
2. Comment out plan checks in site controllers
3. Keep database tables (no data loss)
4. Revert subscription-related code changes
5. Restore original donation-only functionality

---

## Notes

- **Coexistence**: Subscriptions and donations can coexist - different `payment_type` values
- **Backward Compatibility**: All existing donation flows remain unchanged
- **Gradual Migration**: Implement feature checks incrementally
- **Default Plan**: All existing users automatically get 'free' plan
- **Payment Provider**: Choose Stripe or PayPal (or both) for subscription handling

