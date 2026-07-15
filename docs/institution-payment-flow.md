# Institution Payment Flow

This document explains how the institution portal payment flow works for the frontend.

Production API base URL:

```text
https://reg-portal-api.morgengreen.cloud
```

All `/finance/*` institution endpoints require a Bearer token for a user with the right payment permission, usually `payments.pay_fees` or a finance/admin permission.

## Main Frontend Flow

1. Load available payment methods.
2. Load the institution fee preview for the selected fee type.
3. User selects a payment method.
4. Create checkout.
5. If online payment, redirect to the returned payment link.
6. If direct transfer, show returned bank account details and let user upload receipt.
7. After online redirect, verify payment by reference.
8. Refresh payment history/overview.

## Payment Method Codes

The backend supports these checkout methods:

```text
paystack
flutterwave
remita
direct_transfer
```

The UI currently shows Direct Transfer, Paystack, and Remita. Flutterwave is also supported by the backend if configured and active.

## 1. Load Payment Methods

```http
GET /finance/payment-methods
Authorization: Bearer <token>
```

Example response shape:

```json
{
  "success": true,
  "message": "Available payment methods",
  "data": [
    {
      "code": "direct_transfer",
      "name": "Direct Transfer",
      "group": "bank_transfer"
    },
    {
      "code": "paystack",
      "name": "Paystack",
      "group": "online"
    },
    {
      "code": "remita",
      "name": "Remita",
      "group": "pay_at_bank"
    }
  ]
}
```

Use `code` as the `payment_method` in checkout.

## 2. Load Fee Preview

Use this before opening the payment modal. It tells the frontend how much is due and whether there is already a pending payment.

```http
GET /finance/institution/fee-preview?payment_item=affiliation_fee&payment_structure=full&session_id=<session_id>
Authorization: Bearer <token>
```

Common query params:

```text
payment_item=affiliation_fee | examination_fee
payment_structure=full | partial
session_id=<uuid> optional, defaults to effective/current session
university_id=<uuid> optional for full finance admins; institution users are scoped automatically
```

Example response shape:

```json
{
  "success": true,
  "message": "Institution fee preview",
  "data": {
    "payment_item": {
      "id": "uuid",
      "code": "affiliation_fee",
      "name": "Affiliation Fee"
    },
    "payment_structure": {
      "id": "uuid",
      "code": "full",
      "name": "Full Payment"
    },
    "full_fee": 20000,
    "already_paid": 0,
    "outstanding": 20000,
    "fully_paid": false,
    "pending_payment": null
  }
}
```

If `pending_payment` is not null, do not create a new checkout immediately. Show a "pending payment exists" state and let the user resume, wait, or cancel if the UI supports cancellation.

## 3. Create Institution Checkout

```http
POST /finance/institution/checkout
Authorization: Bearer <token>
Content-Type: application/json
```

### Full Payment Payload

```json
{
  "payment_method": "paystack",
  "payment_item": "affiliation_fee",
  "payment_structure": "full",
  "amount": 20000,
  "currency": "NGN",
  "redirect_url": "https://crp-theta.vercel.app/payment/callback"
}
```

### Direct Transfer Payload

```json
{
  "payment_method": "direct_transfer",
  "payment_item": "affiliation_fee",
  "payment_structure": "full",
  "amount": 20000,
  "currency": "NGN",
  "redirect_url": "https://crp-theta.vercel.app/payment"
}
```

### Partial Payment Payload

Only use partial if the selected payment structure allows partial payment.

```json
{
  "payment_method": "paystack",
  "payment_item": "examination_fee",
  "payment_structure": "partial",
  "amount": 50000,
  "currency": "NGN",
  "redirect_url": "https://crp-theta.vercel.app/payment/callback"
}
```

## 4. Checkout Response

### Online Payment Response

For `paystack`, `flutterwave`, and `remita`, backend creates a payment row and returns a payment link.

```json
{
  "success": true,
  "message": "Payment intent created",
  "data": {
    "payment": {
      "id": "internal-db-uuid",
      "payment_id": "PAY_1784123456789_abcd1234",
      "amount": "20000.00",
      "currency": "NGN",
      "status": "pending",
      "payment_method": "paystack"
    },
    "payment_method": "paystack",
    "payment_item": {
      "id": "uuid",
      "code": "affiliation_fee",
      "name": "Affiliation Fee"
    },
    "payment_structure": {
      "id": "uuid",
      "code": "full",
      "name": "Full Payment"
    },
    "amount": 20000,
    "full_fee": 20000,
    "outstanding_before": 20000,
    "outstanding_after": 0,
    "payment_link": "https://checkout.paystack.com/...",
    "bank_account": null
  }
}
```

Frontend action:

```text
window.location.href = data.payment_link
```

### Direct Transfer Response

For `direct_transfer`, `payment_link` is usually an internal frontend path and `bank_account` is populated.

```json
{
  "success": true,
  "message": "Payment intent created",
  "data": {
    "payment": {
      "id": "internal-db-uuid",
      "payment_id": "PAY_1784123456789_abcd1234",
      "amount": "20000.00",
      "currency": "NGN",
      "status": "pending_transfer",
      "payment_method": "direct_transfer"
    },
    "payment_method": "direct_transfer",
    "amount": 20000,
    "payment_link": "/payments/direct-transfer/PAY_1784123456789_abcd1234",
    "bank_account": {
      "bank_name": "Example Bank",
      "account_name": "JUPEB Foundation",
      "account_number": "0123456789"
    }
  }
}
```

Frontend action:

```text
Show bank name, account name, account number, amount, and payment_id.
Ask the user to upload proof of payment after transfer.
```

## 5. Verify Online Payment

After gateway redirects back to the frontend callback page, call:

```http
GET /payments/verify/:reference
```

Use the backend `payment.payment_id` as the reference. For Paystack, the gateway reference is also initialized as `payment.payment_id`.

Example:

```http
GET /payments/verify/PAY_1784123456789_abcd1234
```

Example response:

```json
{
  "success": true,
  "message": "Verification finished",
  "data": {
    "payment_id": "PAY_1784123456789_abcd1234",
    "status": "completed",
    "verifiedStatus": "success",
    "verificationData": {
      "success": true,
      "status": "success"
    }
  }
}
```

Frontend action after verification:

```text
Refresh:
GET /finance/institution/overview
GET /finance/institution/fees
GET /finance/institution/payments
```

## 6. Direct Transfer Receipt Upload

When user uploads receipt directly as a file:

```http
POST /payments/direct-transfer/:paymentId/submit-receipt
Content-Type: multipart/form-data
```

Path param:

```text
paymentId = payment.payment_id, for example PAY_1784123456789_abcd1234
```

Form fields:

```text
file=<receipt image/pdf>
notes=<optional text>
```

Allowed file types:

```text
image/jpeg
image/jpg
image/png
application/pdf
```

Max file size:

```text
5MB
```

Example response:

```json
{
  "success": true,
  "data": {
    "payment": {
      "payment_id": "PAY_1784123456789_abcd1234",
      "status": "pending_verification",
      "receipt_file_id": "uuid"
    },
    "file": {
      "id": "uuid"
    }
  }
}
```

Frontend action:

```text
Show "Receipt submitted. Awaiting verification."
Refresh payment history.
```

## 7. Cancel Existing Pending Institution Payment

If checkout returns `pending_payment_exists`, frontend can show a cancel option if the user should be allowed to restart.

```http
POST /finance/institution/payments/:paymentId/cancel
Authorization: Bearer <token>
```

Use `pending_payment.payment_id` or the payment identifier returned in the pending payment object, depending on what the UI stores.

Then call checkout again.

## 8. Payment History

```http
GET /finance/institution/payments?session_id=<session_id>&payment_item=affiliation_fee&page=1&limit=20
Authorization: Bearer <token>
```

Use this to render payment history and status.

## 9. Receipt After Payment

```http
GET /finance/institution/payments/:paymentId/receipt
Authorization: Bearer <token>
```

Use this after a payment is completed or submitted, depending on UI requirements.

## Important Status Values

```text
pending
```

Online payment initialized, but not yet confirmed.

```text
pending_transfer
```

Direct transfer initialized, user has not uploaded receipt yet.

```text
pending_verification
```

Direct transfer receipt uploaded, staff needs to verify.

```text
completed
```

Payment verified and counted as paid.

```text
failed
```

Gateway/payment failed.

```text
cancelled
```

Pending payment was cancelled so a new checkout can be started.

## Common Error Responses

### Existing Pending Payment

Status:

```text
409
```

Response:

```json
{
  "success": false,
  "message": "An unpaid payment already exists for this fee type",
  "details": {
    "error_code": "pending_payment_exists",
    "pending_payment": {
      "id": "internal-db-uuid",
      "payment_id": "PAY_1784123456789_abcd1234",
      "status": "pending",
      "amount": "20000.00",
      "created_at": "2026-07-15T12:00:00.000Z",
      "payment_item": {
        "id": "uuid",
        "code": "affiliation_fee",
        "name": "Affiliation Fee"
      }
    }
  }
}
```

Frontend should not create another checkout until this is resolved.

### Missing Email For Online Payment

Status:

```text
422
```

Message:

```text
A card / online payment requires an email on the payer account
```

Direct transfer does not require payer email.

### Amount Too High

Status:

```text
422
```

Message:

```text
amount may not exceed the outstanding balance
```

## Recommended Frontend Logic

```text
On page load:
1. GET /finance/payment-methods
2. GET /finance/institution/fee-preview
3. GET /finance/institution/payments

When user clicks Make Payment:
1. Validate payment_method selected
2. POST /finance/institution/checkout
3. If response has payment_link and method is online, redirect
4. If method is direct_transfer, show bank_account and upload UI
5. If 409 pending_payment_exists, show pending payment state

On callback page:
1. Read reference from URL if present, otherwise use stored payment_id
2. GET /payments/verify/:reference
3. Show success/failure
4. Redirect back to payment page and refresh overview/history
```

## Endpoint Summary

```text
GET  /finance/payment-methods
GET  /finance/institution/fee-preview
POST /finance/institution/checkout
GET  /finance/institution/payments
GET  /finance/institution/payments/:paymentId/receipt
POST /finance/institution/payments/:paymentId/cancel

GET  /payments/verify/:reference
GET  /payments/by-reference/:reference
GET  /payments/direct-transfer/:paymentId/bank-account
POST /payments/direct-transfer/:paymentId/submit-receipt
POST /payments/webhook/:processor
```
