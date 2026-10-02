# Finance Module — Postman API Documentation
### Institution Receipts, Reconciliation & Platform Payment Auditing

This guide provides complete Postman reference documentation for the Finance receipt and reconciliation endpoints ([src/modules/finance/controllers/finance.controller.ts:L177-L321](file:///Users/soq/Documents/projects/reg-portal-api/src/modules/finance/controllers/finance.controller.ts#L177-L321)).

---

## 1. Postman Environment Variables

Set up the following variables in your Postman Environment:

| Variable | Initial / Current Value | Description |
| :--- | :--- | :--- |
| `baseUrl` | `https://reg-portal-api.morgengreen.cloud` | API Base URL (or `http://localhost:5269`) |
| `institutionToken` | `eyJhbGciOi...` | JWT Bearer token for an Institution User |
| `adminToken` | `eyJhbGciOi...` | JWT Bearer token with `jupeb.finance.manage` permission |
| `paymentId` | `e4b2d358-18e5-420a-9fc9-0b1a136cf982` | Target Payment UUID or Reference (`PAY-...`) |

---

## 2. Endpoints Overview

| Method | Path | Description | Authorization |
| :--- | :--- | :--- | :--- |
| `POST` | `/finance/institution/upload-receipt` | Upload bank payment receipt document & fee details | Institution User |
| `POST` / `PATCH` | `/finance/admin/payments/:paymentId/confirm` | Finance Officer: Approve, reject, or reconcile payment | Finance Admin |
| `POST` | `/finance/institution/payments/:paymentId/cancel` | Cancel pending institution payment attempt | Institution User |
| `GET` | `/finance/institution/payments` | List payment transactions for the university | Institution User |
| `GET` | `/finance/institution/payments/:paymentId/receipt` | Get downloadable / viewable receipt details | Institution User |
| `GET` | `/finance/payments` | List and search all platform-wide payments | Admin / Finance Officer |

---

## 3. Detailed Request Specifications

### 3.1. Upload Institution Payment Receipt
Allows a university institution user to upload bank payment evidence along with the payment item, structure, and amount.

- **Method**: `POST`
- **Path**: `{{baseUrl}}/finance/institution/upload-receipt`
- **Aliases**:
  - `POST {{baseUrl}}/finance/institution/payments/upload-receipt`
  - `POST {{baseUrl}}/finance/institution/upload-payment-document`
- **Headers**:
  ```http
  Authorization: Bearer {{institutionToken}}
  Content-Type: multipart/form-data
  ```

#### Form Data Fields (`multipart/form-data`):
| Field | Type | Required | Description / Example |
| :--- | :--- | :--- | :--- |
| `file` | File | Conditional | Payment receipt file (`.pdf`, `.png`, `.jpg`, `.jpeg`). *Optional if `receipt_url` is provided.* |
| `payment_item_id` | Text | **Yes** | Selected payment item UUID or slug code (e.g. `fee_affiliation`, `fee_acceptance`). |
| `amount` | Text | **Yes** | Total amount paid in NGN (e.g. `500000`). |
| `payment_structure_id` | Text | No | Payment structure UUID or code (e.g. `struct_full`, `struct_part`). |
| `transaction_ref` | Text | No | Bank teller or deposit transaction reference (e.g. `TEL-20261002-9941`). |
| `bank_name` | Text | No | Bank where payment was made (e.g. `Wema Bank (JUPEB Central)`). |
| `payment_date` | Text | No | Date on teller / remittance slip (`YYYY-MM-DD`). |
| `description` | Text | No | Notes or description (max 250 characters). |
| `receipt_url` | Text | No | Pre-hosted receipt URL if already uploaded to S3/CDN. |
| `session_id` | Text | No | Academic session UUID (defaults to current active session). |
| `university_id` | Text | No | University UUID (auto-inferred from authenticated institution user). |

#### JSON Payload Alternative (`application/json`):
```json
{
  "payment_item_id": "fee_affiliation",
  "payment_structure_id": "struct_full",
  "amount": 500000,
  "transaction_ref": "TEL-20261002-9941",
  "bank_name": "Wema Bank",
  "payment_date": "2026-10-02",
  "description": "Affiliation fee 2026/2027 session",
  "receipt_url": "https://utme-ibass.fra1.digitaloceanspaces.com/receipts/bank_teller_9941.pdf"
}
```

#### cURL Example:
```bash
curl -X POST "{{baseUrl}}/finance/institution/upload-receipt" \
  -H "Authorization: Bearer {{institutionToken}}" \
  -F "file=@/path/to/bank_receipt.pdf" \
  -F "payment_item_id=fee_affiliation" \
  -F "amount=500000" \
  -F "transaction_ref=TEL-20261002-9941" \
  -F "bank_name=Wema Bank" \
  -F "payment_date=2026-10-02" \
  -F "description=Affiliation fee payment"
```

#### Success Response (`201 Created`):
```json
{
  "success": true,
  "message": "Payment receipt submitted successfully for verification",
  "data": {
    "payment_id": "e4b2d358-18e5-420a-9fc9-0b1a136cf982",
    "reference": "PAY-INST-20261002-8812",
    "status": "pending",
    "amount": 500000,
    "payment_type": "fee_affiliation",
    "receipt_url": "https://utme-ibass.fra1.digitaloceanspaces.com/receipts/bank_receipt.pdf",
    "created_at": "2026-10-02T07:30:00.000Z"
  }
}
```

---

### 3.2. Finance Officer: Confirm or Update Payment Status
Allows authorized Finance Officers to review uploaded receipts, approve or reject payments, and enter reconciliation notes and ledger reference numbers.

- **Method**: `POST` or `PATCH`
- **Path**: `{{baseUrl}}/finance/admin/payments/:paymentId/confirm`
- **Aliases**:
  - `POST / PATCH {{baseUrl}}/finance/payments/:paymentId/confirm`
  - `POST / PATCH {{baseUrl}}/finance/admin/payments/:paymentId/status`
- **Path Parameter**:
  - `paymentId`: Payment UUID or reference string (e.g. `e4b2d358-18e5-420a-9fc9-0b1a136cf982` or `PAY-INST-20261002-8812`)
- **Headers**:
  ```http
  Authorization: Bearer {{adminToken}}
  Content-Type: application/json
  ```

#### Request Body (`application/json`):
```json
{
  "status": "successful",
  "confirmed_amount": 500000,
  "reconciliation_ref": "REC-WEMA-9921",
  "notes": "Bank statement credit verified against Central account."
}
```

#### Body Parameters:
| Property | Type | Allowed Values | Description |
| :--- | :--- | :--- | :--- |
| `status` | string | `successful`, `confirmed`, `rejected`, `failed`, `pending` | New status of the transaction. |
| `confirmed_amount` | number | $\ge 0$ | Final verified amount credited (in NGN). |
| `reconciliation_ref` | string | any | Internal bank statement or audit reference code. |
| `notes` | string | any | Remarks or justification for approval/rejection. |

#### cURL Example:
```bash
curl -X POST "{{baseUrl}}/finance/admin/payments/e4b2d358-18e5-420a-9fc9-0b1a136cf982/confirm" \
  -H "Authorization: Bearer {{adminToken}}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "successful",
    "confirmed_amount": 500000,
    "reconciliation_ref": "REC-WEMA-9921",
    "notes": "Bank statement credit verified against Central account."
  }'
```

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Payment confirmed successfully",
  "data": {
    "payment_id": "e4b2d358-18e5-420a-9fc9-0b1a136cf982",
    "reference": "PAY-INST-20261002-8812",
    "status": "successful",
    "amount": 500000,
    "confirmed_amount": 500000,
    "reconciliation_ref": "REC-WEMA-9921",
    "verified_by": "a102435b-1184-49c0-84a1-39fe9b1a0391",
    "verified_at": "2026-10-02T07:35:00.000Z"
  }
}
```

---

### 3.3. Cancel Pending Institution Payment
Cancels an unconfirmed payment attempt.

- **Method**: `POST`
- **Path**: `{{baseUrl}}/finance/institution/payments/:paymentId/cancel`
- **Path Parameter**:
  - `paymentId`: Payment UUID or reference string
- **Headers**:
  ```http
  Authorization: Bearer {{institutionToken}}
  ```

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Payment cancelled successfully",
  "data": {
    "payment_id": "e4b2d358-18e5-420a-9fc9-0b1a136cf982",
    "status": "cancelled"
  }
}
```

---

### 3.4. List Institution Payment Transactions
Retrieves paginated transactions made by the authenticated university.

- **Method**: `GET`
- **Path**: `{{baseUrl}}/finance/institution/payments`
- **Headers**:
  ```http
  Authorization: Bearer {{institutionToken}}
  ```
- **Query Parameters**:
  - `page`: Page number (Default: `1`)
  - `limit`: Records per page (Default: `20`)
  - `status`: Filter by status (`pending`, `successful`, `failed`, `cancelled`)
  - `session_id`: Academic session UUID filter

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Institution payments retrieved",
  "data": {
    "items": [
      {
        "id": "e4b2d358-18e5-420a-9fc9-0b1a136cf982",
        "reference": "PAY-INST-20261002-8812",
        "payment_type": "Affiliation Fee",
        "amount": 500000,
        "status": "successful",
        "receipt_url": "https://utme-ibass.fra1.digitaloceanspaces.com/receipts/bank_receipt.pdf",
        "created_at": "2026-10-02T07:30:00.000Z"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
}
```

---

### 3.5. Get Institution Payment Receipt
Retrieves the finalized receipt details for an institution fee transaction.

- **Method**: `GET`
- **Path**: `{{baseUrl}}/finance/institution/payments/:paymentId/receipt`
- **Path Parameter**:
  - `paymentId`: Payment UUID or reference string
- **Headers**:
  ```http
  Authorization: Bearer {{institutionToken}}
  ```

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Receipt retrieved successfully",
  "data": {
    "receipt_number": "REC-20261002-8812",
    "payment_reference": "PAY-INST-20261002-8812",
    "institution_name": "University of Lagos",
    "item": "Affiliation Fee",
    "amount": 500000,
    "currency": "NGN",
    "status": "successful",
    "payment_date": "2026-10-02T07:35:00.000Z"
  }
}
```

---

### 3.6. Admin: List All Payments Across Platform
Global search and filter across all student, institution, and module payments.

- **Method**: `GET`
- **Path**: `{{baseUrl}}/finance/payments`
- **Headers**:
  ```http
  Authorization: Bearer {{adminToken}}
  ```
- **Query Parameters**:
  - `page`: Page number (Default: `1`)
  - `limit`: Records per page (Default: `20`)
  - `q`: Search keyword (payer name, candidate code, reference, institution)
  - `status`: Filter by status (`successful`, `pending`, `failed`, `refunded`)
  - `payment_item_id`: Filter by payment item code / UUID
  - `university_id`: Filter by institution UUID
  - `session_id`: Filter by academic session UUID

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Payments retrieved successfully",
  "data": {
    "items": [
      {
        "id": "e4b2d358-18e5-420a-9fc9-0b1a136cf982",
        "reference": "PAY-INST-20261002-8812",
        "payer_name": "University of Lagos",
        "payer_type": "institution",
        "payment_type": "Affiliation Fee",
        "amount": 500000,
        "status": "successful",
        "created_at": "2026-10-02T07:30:00.000Z"
      }
    ],
    "pagination": {
      "total": 45,
      "page": 1,
      "limit": 20,
      "totalPages": 3
    }
  }
}
```

---

## 4. Error Responses

### 4.1. 401 Unauthorized
```json
{
  "success": false,
  "message": "Unauthorized access. Token is missing or invalid.",
  "statusCode": 401
}
```

### 4.2. 403 Forbidden (Insufficient Permissions)
```json
{
  "success": false,
  "message": "Forbidden resource. You lack required permission 'jupeb.finance.manage'.",
  "statusCode": 403
}
```

### 4.3. 400 Bad Request (Validation Failure)
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    "amount must not be less than 0",
    "payment_item_id should not be empty"
  ],
  "statusCode": 400
}
```
