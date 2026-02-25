# Site Payment Settings & Merchant Payouts

## Overview

Each SmartStore site can configure its **own Paystack keys** and **direct-transfer bank account**.
SmartStore's platform keys/account serve as the fallback when a site has not configured its own.

Merchants who receive payments via Paystack can **initiate a payout** — a Paystack Transfer from
their Paystack balance to their registered bank account — directly from the dashboard.

---

## 1. Database Schema

### `site_payment_settings`

Stores per-site payment credentials. Secret key is stored as-is (server-side only; never returned
to the frontend in plaintext).

```sql
CREATE TABLE site_payment_settings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

  -- Paystack (merchant's own account)
  paystack_public_key   TEXT,
  paystack_secret_key   TEXT,           -- never exposed to frontend
  paystack_webhook_secret TEXT,         -- optional; for verifying webhooks per-site

  -- Direct Transfer bank account
  dt_bank_name      VARCHAR(100),
  dt_account_number VARCHAR(30),
  dt_account_name   VARCHAR(150),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_site_payment_settings UNIQUE (site_id)
);
```

### `site_payouts`

Tracks outbound Paystack Transfer requests initiated by merchants.

```sql
CREATE TABLE site_payouts (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id            UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  amount             DECIMAL(15,2) NOT NULL,
  currency           VARCHAR(3) DEFAULT 'NGN',
  transfer_reference VARCHAR(255),          -- Paystack transfer_code
  recipient_code     VARCHAR(255),          -- Paystack recipient_code (cached)
  status             VARCHAR(30) DEFAULT 'pending',
    -- pending | processing | success | failed | reversed
  reason             TEXT,
  metadata           JSONB DEFAULT '{}',
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 2. Key Resolution — Paystack

When `POST /payments/create` is called with `metadata.site_id`:

```
payment.controller.js
  └── look up site_payment_settings for site_id
  └── if paystack_secret_key exists → pass as override to paymentProcessor
  └── else → use SmartStore global key from payment_methods table (existing)
```

`paymentProcessor.service.js`:
- `paystackInitialize(paymentData, payment, overrideSecretKey?)` — uses override if provided
- `paystackVerify(reference, overrideSecretKey?)` — same

> Secret keys from `site_payment_settings` are never returned to any frontend.
> The GET endpoint returns `paystack_public_key` and a masked secret `sk_***...last4`.

---

## 3. Key Resolution — Direct Transfer

When `payment_method = 'direct_transfer'` and `metadata.site_id` is present:

```
paymentProcessor.service.js (direct_transfer branch)
  └── if site has dt_account_number → use site bank account
  └── else → use global BankAccount.getActive() (existing)
```

Email template receives the effective bank account details.

---

## 4. API Endpoints

### Payment Settings (owner only)

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/sites/:siteId/payment-settings` | Get settings (secret masked) |
| PUT  | `/sites/:siteId/payment-settings` | Create/update settings |

**GET response**:
```json
{
  "paystack_public_key": "pk_live_...",
  "paystack_secret_key_masked": "sk_***...abcd",
  "paystack_webhook_secret_set": true,
  "dt_bank_name": "Access Bank",
  "dt_account_number": "0123456789",
  "dt_account_name": "John Doe Store"
}
```

**PUT body** (all fields optional — only provided fields are updated):
```json
{
  "paystack_public_key": "pk_live_...",
  "paystack_secret_key": "sk_live_...",
  "paystack_webhook_secret": "whsec_...",
  "dt_bank_name": "Access Bank",
  "dt_account_number": "0123456789",
  "dt_account_name": "John Doe Store"
}
```

### Payouts (owner only)

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/sites/:siteId/payouts` | List payout history |
| POST | `/sites/:siteId/payouts` | Request a new payout |

**POST body**:
```json
{ "amount": 50000, "reason": "Weekly withdrawal" }
```

**POST flow**:
1. Verify site ownership
2. Load `site_payment_settings` — require `paystack_secret_key` + `dt_account_*` fields
3. Create/fetch Paystack Transfer Recipient from bank account details:
   `POST https://api.paystack.co/transferrecipient`
4. Initiate Paystack Transfer:
   `POST https://api.paystack.co/transfer`
5. Insert record into `site_payouts` (status: `processing`)
6. Paystack webhook (`transfer.success` / `transfer.failed`) updates status

### Paystack Transfer Webhook

`POST /payments/webhook/paystack` already exists. Extend to handle transfer events:
- `transfer.success` → update `site_payouts.status = 'success'`
- `transfer.failed` → update `site_payouts.status = 'failed'`
- `transfer.reversed` → update `site_payouts.status = 'reversed'`

---

## 5. Frontend — Dashboard

### Payment Settings Tab (`SitePaymentSettingsTab.tsx`)

Located at `dashboard/products/[siteId]` as a **Settings** tab (4th tab after Orders).

Sections:
1. **Paystack** — public key input, secret key input (write-only / shows masked), webhook secret
   - Shows a green "Configured" / grey "Using SmartStore default" badge
2. **Direct Transfer** — bank name, account number, account name inputs
   - Shows "Using SmartStore default account" when not configured

### Payout UI (inside `SiteOrdersTab.tsx`)

Shown as a collapsible card at the top of the Orders tab:
- **Available balance** = sum of `completed` merchandise payments via Paystack (not yet paid out)
- "Request Payout" button → amount input + confirm dialog → calls POST `/sites/:siteId/payouts`
- **Payout history** table (reference, amount, date, status badge)

---

## 6. Security Notes

- `paystack_secret_key` is never included in GET responses
- Only the masked form `sk_***...last4` is returned for display
- Payout endpoint requires site ownership check (same as orders)
- Paystack keys are used server-side only inside `paymentProcessor.service.js`
- Direct transfer account details are visible to site owner only
