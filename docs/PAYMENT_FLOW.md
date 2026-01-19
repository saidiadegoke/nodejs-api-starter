# Payment Flow & Subscription Plans

## Overview

This document outlines the payment flow and subscription plan structure for SmartStore. The platform uses a tiered subscription model that scales with user needs.

---

## Subscription Plans

### 🆓 Free Plan

**Limitations:**
- **Pages**: Up to 5 pages (default pages only: Home, About, Contact, Services, Store)
- **Domain**: Subdomain on `smartstore.ng` only (e.g., `mysite.smartstore.ng`)
- **Publishing**: ✅ Can publish site (draft → active)
- **Custom Domains**: ❌ Not allowed
- **Page Modifications**: ✅ Can modify default pages (content, blocks, layout)
- **Additional Pages**: ❌ Cannot create pages beyond the 5 default pages

**Use Case**: Perfect for small businesses, portfolios, or users testing the platform.

---

### 💼 Small Scale Plan

**Features:**
- **Pages**: Up to 10 pages (includes default + 5 additional)
- **Domain**: Subdomain on `smartstore.ng` + ✅ Custom domains
- **Publishing**: ✅ Can publish site
- **Custom Domains**: ✅ Can connect custom domains (unlimited)
- **Page Creation**: ✅ Can create custom pages beyond defaults
- **Additional Pages**: Extra pages beyond 10 available for additional fee (see pricing below)

**Use Case**: Small to medium businesses needing more pages and custom branding.

**Additional Page Pricing:**
- $X per page per month (or one-time fee, depending on pricing model)

---

### 🏢 Medium Scale Plan

**Features:**
- **Pages**: Up to 25 pages
- **Domain**: Subdomain on `smartstore.ng` + ✅ Custom domains (unlimited)
- **Publishing**: ✅ Can publish site
- **Custom Domains**: ✅ Unlimited custom domains
- **Page Creation**: ✅ Full page creation and customization
- **Additional Features**:
  - Priority support
  - Advanced analytics
  - [Additional features to be defined]

**Use Case**: Growing businesses with expanding content needs.

---

### 🚀 Large Scale Plan

**Features:**
- **Pages**: Unlimited pages
- **Domain**: Subdomain on `smartstore.ng` + ✅ Custom domains (unlimited)
- **Publishing**: ✅ Can publish site
- **Custom Domains**: ✅ Unlimited custom domains
- **Page Creation**: ✅ Full unlimited page creation
- **Additional Features**:
  - Priority support (24/7)
  - Advanced analytics & reporting
  - API access
  - White-label options
  - [Additional features to be defined]

**Use Case**: Large businesses, agencies, or enterprises with extensive content needs.

---

## Payment Flow Implementation

### 1. User Registration & Plan Selection

```
User Registration → Choose Plan → Payment → Account Activation
```

**Flow Steps:**
1. User registers account (free plan by default)
2. During site creation wizard, prompt for plan upgrade if needed:
   - If creating 6th+ page → Prompt upgrade to Small Scale or higher
   - If trying to add custom domain → Prompt upgrade to Small Scale or higher
3. User selects plan and proceeds to payment
4. After successful payment, plan is activated
5. User gains access to plan features

---

### 2. Plan Upgrade/Downgrade Flow

#### **Upgrade Flow:**
```
Current Plan → Select New Plan → Payment → Pro-rated Upgrade → Feature Unlock
```

**Implementation:**
- Calculate pro-rated amount (remaining time in current billing cycle)
- Charge difference between plans
- Immediately unlock new features
- Update next billing cycle amount

#### **Downgrade Flow:**
```
Current Plan → Select Lower Plan → Warning Check → Confirm Downgrade → Schedule at End of Billing Cycle
```

**Implementation:**
- Show warning if downgrade would:
  - Remove access to features currently in use (custom domains, pages beyond limit)
  - Require content removal
- Schedule downgrade at end of current billing period
- Continue current plan access until period ends
- Apply new plan restrictions after downgrade

---

### 3. Page Limit Enforcement

#### **Free Plan (5 pages max):**
```typescript
// Pseudocode
if (userPlan === 'free' && currentPageCount >= 5) {
  if (pageSlug is one of: ['home', 'about', 'contact', 'services', 'store']) {
    // Allow modification of existing default page
    allowEdit()
  } else {
    // Block creation of new pages
    showUpgradePrompt({
      message: "Free plan allows 5 pages. Upgrade to create more.",
      requiredPlan: 'small_scale'
    })
  }
}
```

**Frontend Checkpoints:**
- "Create Page" button: Disabled with upgrade prompt for free users after 5 pages
- Site setup wizard: Validate page count before allowing next step
- Page management dashboard: Show plan limits and upgrade CTA

**Backend Validation:**
- API endpoint: `POST /sites/:id/pages` - Validate page count against plan
- Return error: `403 Forbidden` with upgrade message if limit exceeded

---

### 4. Custom Domain Enforcement

#### **Free Plan:**
```typescript
if (userPlan === 'free') {
  // Block custom domain connection
  showUpgradePrompt({
    message: "Custom domains require Small Scale plan or higher.",
    requiredPlan: 'small_scale'
  })
}
```

**Frontend Checkpoints:**
- Custom domain settings page: Hide/disable "Add Domain" for free users
- Show upgrade prompt when accessing domain settings

**Backend Validation:**
- API endpoint: `POST /sites/:id/custom-domains` - Check plan before allowing
- Return error: `403 Forbidden` with upgrade message for free users

---

### 5. Payment Processing

#### **Payment Provider Integration:**
- Recommended: Stripe or PayPal
- Support recurring subscriptions (monthly/annual)
- Handle webhooks for payment events:
  - `payment_succeeded` → Activate plan
  - `payment_failed` → Notify user, grace period
  - `subscription_cancelled` → Downgrade to free (with restrictions)
  - `subscription_updated` → Update plan features

#### **Database Schema:**

```sql
-- User subscription table
CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_type VARCHAR(50) NOT NULL DEFAULT 'free', -- 'free', 'small_scale', 'medium_scale', 'large_scale'
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'cancelled', 'expired', 'past_due'
  billing_cycle VARCHAR(20) DEFAULT 'monthly', -- 'monthly', 'annual'
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  stripe_subscription_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Payment history table
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) NOT NULL, -- 'pending', 'succeeded', 'failed', 'refunded'
  payment_method VARCHAR(50), -- 'stripe', 'paypal'
  transaction_id VARCHAR(255),
  invoice_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Page usage tracking (for additional page billing)
CREATE TABLE site_page_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_count INTEGER NOT NULL DEFAULT 0,
  plan_limit INTEGER NOT NULL DEFAULT 5, -- Based on plan
  additional_pages INTEGER DEFAULT 0, -- Pages beyond plan limit (paid separately)
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(site_id)
);
```

---

### 6. Feature Access Middleware

#### **Backend Middleware (Node.js/Express):**

```javascript
// middleware/planAccess.js
const checkPlanAccess = (requiredFeature) => {
  return async (req, res, next) => {
    const userId = req.user.id;
    const subscription = await UserSubscriptionModel.getActiveSubscription(userId);
    
    const featureMap = {
      'custom_domains': ['small_scale', 'medium_scale', 'large_scale'],
      'unlimited_pages': ['large_scale'],
      'extra_pages': ['small_scale', 'medium_scale', 'large_scale'],
    };
    
    const allowedPlans = featureMap[requiredFeature] || [];
    
    if (!allowedPlans.includes(subscription.plan_type)) {
      return res.status(403).json({
        success: false,
        message: `This feature requires ${requiredFeature} access. Please upgrade your plan.`,
        requiredPlan: allowedPlans[0], // First allowed plan
        currentPlan: subscription.plan_type
      });
    }
    
    next();
  };
};

// Usage in routes
router.post('/sites/:id/custom-domains', 
  authenticate,
  checkPlanAccess('custom_domains'),
  customDomainController.addDomain
);
```

---

### 7. User Experience Flow

#### **Free Plan User Creating 6th Page:**

1. User clicks "Create Page" button
2. Frontend checks: `userPlan === 'free' && pageCount >= 5`
3. Show modal:
   ```
   ⚠️ Page Limit Reached
   
   Free plan allows 5 pages. Create unlimited pages with Small Scale plan.
   
   [Upgrade to Small Scale] [Cancel]
   ```
4. If user clicks "Upgrade":
   - Redirect to billing page
   - Select Small Scale plan
   - Process payment
   - Return to page creation (with upgrade success message)

#### **Free Plan User Adding Custom Domain:**

1. User navigates to "Custom Domains" settings
2. Frontend checks: `userPlan === 'free'`
3. Show banner at top of page:
   ```
   🔒 Custom domains require Small Scale plan or higher.
   [Upgrade Now] to connect your domain (e.g., mydomain.com)
   ```
4. "Add Domain" button is disabled with tooltip: "Upgrade required"
5. If user clicks "Upgrade Now" → Redirect to billing page

#### **Page Count Check During Site Creation:**

```
Step 2: Select Template → [User selects template with 6+ pages]
↓
Validation: Check plan limits
↓
If free plan && template.pages.length > 5:
  Show warning: "This template has X pages. Free plan allows 5 pages. 
                You can still create the site but will need to upgrade 
                to edit beyond the first 5 pages."
  [Continue with Free Plan] [Upgrade Now]
```

---

### 8. Pricing Configuration

#### **Plan Pricing (Example - Adjust as needed):**

```javascript
const PLAN_PRICING = {
  free: {
    monthly: 0,
    annual: 0,
    pageLimit: 5,
    features: ['subdomain', 'publish']
  },
  small_scale: {
    monthly: 9.99, // USD
    annual: 99.99, // USD (save ~17%)
    pageLimit: 10,
    additionalPagePrice: 0.50, // per page per month
    features: ['subdomain', 'custom_domains', 'publish', 'extra_pages']
  },
  medium_scale: {
    monthly: 29.99,
    annual: 299.99,
    pageLimit: 25,
    features: ['subdomain', 'custom_domains', 'publish', 'priority_support', 'analytics']
  },
  large_scale: {
    monthly: 99.99,
    annual: 999.99,
    pageLimit: -1, // Unlimited
    features: ['subdomain', 'custom_domains', 'publish', 'priority_support', 'analytics', 'api_access', 'white_label']
  }
};
```

---

### 9. Implementation Checklist

#### **Backend:**
- [ ] Create `user_subscriptions` and `payments` tables
- [ ] Implement subscription model and service
- [ ] Add plan check middleware for protected routes
- [ ] Implement page count validation in page creation endpoint
- [ ] Implement custom domain plan check in domain endpoint
- [ ] Integrate payment provider (Stripe/PayPal)
- [ ] Set up webhook handlers for payment events
- [ ] Implement pro-rated upgrade/downgrade logic
- [ ] Add billing history endpoint for users

#### **Frontend:**
- [ ] Add plan selection UI during registration/upgrade
- [ ] Implement page count display in dashboard
- [ ] Add upgrade prompts in appropriate locations:
  - Page creation (when limit reached)
  - Custom domain settings (for free users)
  - Site settings (show current plan, upgrade CTA)
- [ ] Create billing/subscription management page
- [ ] Add plan comparison table
- [ ] Implement payment form (Stripe Elements or PayPal)
- [ ] Add subscription status indicator
- [ ] Show grace period warnings for failed payments

#### **Database Migrations:**
- [ ] Migration: Create `user_subscriptions` table
- [ ] Migration: Create `payments` table
- [ ] Migration: Create `site_page_usage` table
- [ ] Migration: Add `plan_type` default to existing users (set to 'free')
- [ ] Migration: Initialize page usage for existing sites

#### **Testing:**
- [ ] Test free plan page limit enforcement
- [ ] Test custom domain restriction for free users
- [ ] Test upgrade flow (payment → feature unlock)
- [ ] Test downgrade flow (with content restrictions)
- [ ] Test payment webhook handling
- [ ] Test pro-rated billing calculations
- [ ] Test additional page billing (small scale plan)

---

### 10. API Endpoints

```javascript
// Subscription Management
GET    /api/subscriptions/current          // Get current user's subscription
POST   /api/subscriptions/upgrade          // Upgrade plan
POST   /api/subscriptions/downgrade        // Downgrade plan (scheduled)
GET    /api/subscriptions/plans            // Get available plans
GET    /api/subscriptions/usage            // Get current usage (pages, etc.)

// Payment
POST   /api/payments/create-checkout       // Create payment checkout session
POST   /api/payments/webhook               // Payment provider webhook handler
GET    /api/payments/history               // Get payment history
GET    /api/payments/invoices              // Get invoices

// Feature Checks
GET    /api/subscriptions/check/:feature   // Check if user has access to feature
```

---

## Notes

- **Grace Period**: Consider 7-14 day grace period for failed payments before downgrading
- **Annual Discounts**: Offer 15-20% discount for annual billing
- **Additional Pages**: For small scale plan, charge extra monthly fee per page beyond 10
- **Free Plan Restrictions**: Clearly communicate limitations during onboarding
- **Upgrade Incentives**: Offer time-limited discounts or features to encourage upgrades

---

## Questions to Resolve

1. **Pricing**: What are the actual prices for each plan?
2. **Additional Pages**: One-time fee or recurring monthly charge?
3. **Payment Provider**: Stripe, PayPal, or both?
4. **Billing Cycle**: Monthly only, or monthly + annual options?
5. **Trial Period**: Should we offer a trial for paid plans?
6. **Refund Policy**: What is the refund policy for subscriptions?

