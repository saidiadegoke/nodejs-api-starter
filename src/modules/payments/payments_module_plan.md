# Payments Module Architecture Plan

## Overview
The payments module will handle donations, membership dues, campaign contributions, and other payments. It supports both authenticated members and anonymous donors with proper tracking and dashboard integration.

## Module Structure

```
payments/
├── models/
│   ├── payment.model.js
│   ├── campaign.model.js
│   ├── paymentMethod.model.js
│   ├── donor.model.js
├── controllers/
│   ├── payment.controller.js
│   ├── campaign.controller.js
│   ├── donor.controller.js
├── services/
│   ├── payment.service.js
│   ├── campaign.service.js
│   ├── paymentProcessor.service.js
│   ├── notification.service.js
├── utils/
│   ├── validators.js
│   ├── formatters.js
│   ├── constants.js
│   └── helpers.js
├── routes/
│   ├── payment.routes.js
│   ├── campaign.routes.js
│   ├── donor.routes.js
│   └── index.js
└── middleware/
    ├── auth.middleware.js
    ├── validation.middleware.js
    └── rateLimit.middleware.js
```

## 1. Models (PostgreSQL Tables)

### Payment Model (`payment.model.js`)
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id VARCHAR(255) UNIQUE NOT NULL, -- Unique payment identifier
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN',
  type VARCHAR(50) NOT NULL, -- 'donation', 'dues', 'campaign', 'event', 'merchandise'
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded'
  
  -- Payment Details
  payment_method VARCHAR(50), -- 'card', 'bank_transfer', 'paystack', 'flutterwave'
  transaction_ref VARCHAR(255), -- External payment processor reference
  processor_response JSONB, -- Raw response from payment processor
  
  -- Donor Information
  donor_id UUID REFERENCES users(id), -- If authenticated member
  anonymous_donor_first_name VARCHAR(100),
  anonymous_donor_last_name VARCHAR(100),
  anonymous_donor_email VARCHAR(255),
  anonymous_donor_phone VARCHAR(20),
  
  -- Campaign/Purpose
  campaign_id UUID REFERENCES campaigns(id),
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
CREATE INDEX idx_payments_payment_id ON payments(payment_id);
CREATE INDEX idx_payments_donor_id ON payments(donor_id);
CREATE INDEX idx_payments_campaign_id ON payments(campaign_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX idx_payments_transaction_ref ON payments(transaction_ref);
CREATE INDEX idx_payments_anonymous_email ON payments(anonymous_donor_email);
```
```

### Campaign Model (`campaign.model.js`)
```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL, -- 'donation', 'dues', 'event', 'merchandise', 'general'
  
  -- Financial Details
  target_amount DECIMAL(15,2),
  current_amount DECIMAL(15,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'NGN',
  
  -- Campaign Settings
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'paused', 'completed', 'cancelled'
  is_public BOOLEAN DEFAULT TRUE,
  allow_anonymous BOOLEAN DEFAULT TRUE,
  
  -- Amounts
  min_amount DECIMAL(15,2),
  max_amount DECIMAL(15,2),
  suggested_amounts JSONB DEFAULT '[]',
  
  -- Dates
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  
  -- Media
  image_url TEXT,
  gallery JSONB DEFAULT '[]',
  
  -- Content
  short_description TEXT,
  long_description TEXT,
  
  -- Tracking
  total_donors INTEGER DEFAULT 0,
  total_payments INTEGER DEFAULT 0,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Configuration
  requires_approval BOOLEAN DEFAULT FALSE,
  categories JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]'
);

-- Indexes
CREATE INDEX idx_campaigns_slug ON campaigns(slug);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_type ON campaigns(type);
CREATE INDEX idx_campaigns_public ON campaigns(is_public);
CREATE INDEX idx_campaigns_end_date ON campaigns(end_date);
```
```

### Donor Model (`donor.model.js`)
```sql
CREATE TABLE donors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic Info
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  
  -- Linked Account
  user_id UUID REFERENCES users(id),
  
  -- Donation History
  total_donated DECIMAL(15,2) DEFAULT 0,
  total_payments INTEGER DEFAULT 0,
  first_donation_date TIMESTAMP WITH TIME ZONE,
  last_donation_date TIMESTAMP WITH TIME ZONE,
  
  -- Preferences
  is_anonymous BOOLEAN DEFAULT FALSE,
  marketing_consent BOOLEAN DEFAULT FALSE,
  receipt_preference VARCHAR(20) DEFAULT 'email', -- 'email', 'sms', 'none'
  
  -- Contact Info
  address_street TEXT,
  address_city VARCHAR(100),
  address_state VARCHAR(100),
  address_country VARCHAR(100),
  address_zip_code VARCHAR(20),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_blocked BOOLEAN DEFAULT FALSE,
  notes TEXT
);

-- Indexes
CREATE UNIQUE INDEX idx_donors_email ON donors(email);
CREATE INDEX idx_donors_user_id ON donors(user_id);
CREATE INDEX idx_donors_total_donated ON donors(total_donated DESC);
```
```

### Payment Method Model (`paymentMethod.model.js`)
```sql
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL, -- 'paystack', 'flutterwave', 'bank_transfer'
  type VARCHAR(20) NOT NULL, -- 'gateway', 'manual'
  
  -- Configuration
  is_active BOOLEAN DEFAULT TRUE,
  supported_currencies JSONB DEFAULT '["NGN"]',
  processing_fee DECIMAL(10,4) DEFAULT 0,
  processing_fee_type VARCHAR(20) DEFAULT 'percentage', -- 'percentage', 'fixed'
  
  -- API Configuration
  api_public_key TEXT,
  api_secret_key TEXT,
  webhook_secret TEXT,
  base_url TEXT,
  
  -- Display
  display_name VARCHAR(100),
  description TEXT,
  icon_url TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE UNIQUE INDEX idx_payment_methods_code ON payment_methods(code);
CREATE INDEX idx_payment_methods_active ON payment_methods(is_active);
```
```

## 2. Controllers

### Payment Controller (`payment.controller.js`)
```javascript
class PaymentController {
  // Create payment intent
  async createPayment(req, res)
  
  // Process payment
  async processPayment(req, res)
  
  // Verify payment
  async verifyPayment(req, res)
  
  // Get payment details
  async getPayment(req, res)
  
  // Get user payment history
  async getUserPayments(req, res)
  
  // Get campaign payments
  async getCampaignPayments(req, res)
  
  // Webhook handlers
  async handleWebhook(req, res)
  
  // Admin functions
  async getAllPayments(req, res)
  async refundPayment(req, res)
  async updatePayment(req, res)
}
```

### Campaign Controller (`campaign.controller.js`)
```javascript
class CampaignController {
  // Public endpoints
  async getActiveCampaigns(req, res)
  async getCampaign(req, res)
  async getCampaignStats(req, res)
  
  // Admin endpoints
  async createCampaign(req, res)
  async updateCampaign(req, res)
  async deleteCampaign(req, res)
  async getAllCampaigns(req, res)
  async getCampaignAnalytics(req, res)
}
```

## 3. Services

### Payment Service (`payment.service.js`)
```javascript
class PaymentService {
  // Core payment operations
  async createPayment(paymentData)
  async processPayment(paymentId, processorData)
  async verifyPayment(paymentId, transactionRef)
  async refundPayment(paymentId, reason)
  
  // Payment calculations
  async calculateFees(amount, paymentMethod)
  async calculateNetAmount(amount, paymentMethod)
  
  // Payment retrieval
  async getPaymentById(paymentId)
  async getPaymentsByUser(userId, options)
  async getPaymentsByCampaign(campaignId, options)
  
  // Analytics
  async getPaymentStats(filters)
  async getDonationTrends(timeframe)
  
  // Recurring payments
  async createRecurringPayment(paymentData)
  async processRecurringPayments()
}
```

### Payment Processor Service (`paymentProcessor.service.js`)
```javascript
class PaymentProcessorService {
  // Initialize payment
  async initializePayment(paymentData, processor)
  
  // Verify payment
  async verifyPayment(reference, processor)
  
  // Process refund
  async processRefund(transactionRef, amount, processor)
  
  // Webhook verification
  async verifyWebhook(payload, signature, processor)
  
  // Processor-specific methods
  async paystackInitialize(paymentData)
  async paystackVerify(reference)
  async flutterwaveInitialize(paymentData)
  async flutterwaveVerify(reference)
}
```

## 4. API Endpoints

### Payment Routes (`payment.routes.js`)
```javascript
// Public routes
POST /v1/payments/create
POST /v1/payments/process
GET /v1/payments/verify/:reference
POST /v1/payments/webhook/:processor

// Authenticated routes
GET /v1/payments/my-payments
GET /v1/payments/:id
POST /v1/payments/:id/receipt

// Admin routes
GET /v1/payments/admin/all
GET /v1/payments/admin/stats
POST /v1/payments/admin/:id/refund
PUT /v1/payments/admin/:id
```

### Campaign Routes (`campaign.routes.js`)
```javascript
// Public routes
GET /v1/campaigns
GET /v1/campaigns/:slug
GET /v1/campaigns/:id/stats

// Admin routes
POST /v1/campaigns
PUT /v1/campaigns/:id
DELETE /v1/campaigns/:id
GET /v1/campaigns/admin/all
GET /v1/campaigns/admin/:id/analytics
```

### Routes Index (`routes/index.js`)
```javascript
const express = require('express');
const router = express.Router();

// Import route modules
const paymentRoutes = require('./payment.routes');
const campaignRoutes = require('./campaign.routes');
const donorRoutes = require('./donor.routes');

// Mount routes
router.use('/payments', paymentRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/donors', donorRoutes);

module.exports = router;
```

## 5. Frontend Integration

### Updated Donation Form Data Flow
```javascript
// 1. Load available campaigns
const campaigns = await fetch('/v1/campaigns')

// 2. Create payment intent
const paymentIntent = await fetch('/v1/payments/create', {
  method: 'POST',
  body: JSON.stringify({
    amount: 5000,
    currency: 'NGN',
    campaignId: 'campaign-id',
    donor: isAuthenticated ? null : donorDetails,
    type: 'donation'
  })
})

// 3. Process payment
const paymentResult = await processPayment(paymentIntent.authorizationUrl)

// 4. Verify payment
const verification = await fetch(`/v1/payments/verify/${paymentResult.reference}`)
```

### Member Dashboard Integration
```javascript
// Payment history for authenticated users
const memberPayments = await fetch('/v1/payments/my-payments')

// Display in dashboard:
// - Total donated
// - Recent donations
// - Receipts
// - Recurring payments
```

## 6. Database Considerations

### PostgreSQL Specific Features
```sql
-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$ language 'plpgsql';

-- Apply to all tables
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_donors_updated_at BEFORE UPDATE ON donors
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update campaign totals
CREATE OR REPLACE FUNCTION update_campaign_totals()
RETURNS TRIGGER AS $
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
        UPDATE campaigns 
        SET 
            current_amount = current_amount + NEW.amount,
            total_payments = total_payments + 1
        WHERE id = NEW.campaign_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.status != 'completed' AND NEW.status = 'completed' THEN
        UPDATE campaigns 
        SET 
            current_amount = current_amount + NEW.amount,
            total_payments = total_payments + 1
        WHERE id = NEW.campaign_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status != 'completed' THEN
        UPDATE campaigns 
        SET 
            current_amount = current_amount - OLD.amount,
            total_payments = total_payments - 1
        WHERE id = OLD.campaign_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$ language 'plpgsql';

CREATE TRIGGER update_campaign_totals_trigger
AFTER INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION update_campaign_totals();
```

### Views for Common Queries
```sql
-- Payment summary view
CREATE VIEW payment_summary AS
SELECT 
    p.id,
    p.payment_id,
    p.amount,
    p.currency,
    p.type,
    p.status,
    p.created_at,
    p.paid_at,
    -- Donor info (prioritize user info over anonymous)
    COALESCE(u.first_name, p.anonymous_donor_first_name) as donor_first_name,
    COALESCE(u.last_name, p.anonymous_donor_last_name) as donor_last_name,
    COALESCE(u.email, p.anonymous_donor_email) as donor_email,
    -- Campaign info
    c.name as campaign_name,
    c.slug as campaign_slug
FROM payments p
LEFT JOIN users u ON p.donor_id = u.id
LEFT JOIN campaigns c ON p.campaign_id = c.id;

-- Campaign analytics view
CREATE VIEW campaign_analytics AS
SELECT 
    c.id,
    c.name,
    c.slug,
    c.target_amount,
    c.current_amount,
    c.total_payments,
    COUNT(DISTINCT p.donor_id) + COUNT(DISTINCT p.anonymous_donor_email) as unique_donors,
    AVG(p.amount) as average_donation,
    MAX(p.amount) as largest_donation,
    MIN(p.amount) as smallest_donation
FROM campaigns c
LEFT JOIN payments p ON c.id = p.campaign_id AND p.status = 'completed'
GROUP BY c.id, c.name, c.slug, c.target_amount, c.current_amount, c.total_payments;
```

## 7. Security & Validation

### Payment Validation
- Amount validation (min/max limits)
- Currency validation
- Campaign eligibility
- Rate limiting for payment attempts
- Webhook signature verification

### Data Security
- Encrypt sensitive payment data
- PCI DSS compliance considerations
- Audit logging for all payment operations
- Secure API key management

## 8. Notification System

### Email Notifications
- Payment confirmation
- Receipt delivery
- Failed payment alerts
- Recurring payment reminders

### SMS Notifications
- Payment confirmations
- OTP for verification

## 9. Analytics & Reporting

### Payment Analytics
- Revenue tracking
- Donor analytics
- Campaign performance
- Payment method analysis
- Geographic analysis

### Dashboard Metrics
- Daily/Monthly revenue
- Top campaigns
- Donor retention
- Payment success rates

## 10. Testing Strategy

### Unit Tests
- Payment processing logic
- Calculation functions
- Validation rules

### Integration Tests
- Payment gateway integration
- Webhook handling
- Database operations

### End-to-End Tests
- Complete payment flow
- Member dashboard integration
- Anonymous donor flow

This architecture provides a comprehensive payments module that handles all your requirements while maintaining scalability and security.