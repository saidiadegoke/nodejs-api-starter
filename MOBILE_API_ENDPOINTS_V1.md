# CERP Student App — Mobile API Endpoint Specification

This is the **mobile engineer** contract for the CERP (JUPEB Student Portal) app.
Use it to wire screens to `reg-portal-api`. Every screen in the app maps to the
endpoints listed below.

**Base URL (current):** `https://reg-portal-api.morgengreen.cloud`

**Auth:** `Authorization: Bearer <access_token>` on all authenticated routes unless noted.

**Response envelope (all routes):**

```json
{
  "success": true,
  "message": "Optional human-readable message",
  "data": { },
  "details": {
    "error_code": "optional_machine_code"
  }
}
```

Errors use the same shape with `success: false` and an appropriate HTTP status (400, 401, 403, 404, 422, 500, 503).

> Backend-only: Attendance/CRMS upstream wiring lives in
> [`INTEGRATIONS_ATTENDANCE_CRMS.md`](INTEGRATIONS_ATTENDANCE_CRMS.md). Mobile
> clients do **not** call those services directly.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | API ready — call this endpoint; response shape is stable |
| 🟡 | API ready with fixture/mock upstream data — same paths and shapes; live Attendance/CRMS data lands later without path changes |
| ❌ | Not available on the API yet (do not call / keep UI fallback) |

---

## Screen → Endpoint Map

| Screen | Route | Endpoints |
|--------|-------|-----------|
| Onboarding | `/(auth)/onboarding` | None (static) |
| Login | `/(auth)/login` | `POST /auth/login` ✅ · `POST /auth/forgot-password` ✅ · `POST /auth/reset-password` ✅ |
| Enter registration code | `/(auth)/signup/enter-code` | `GET /auth/code-status` ✅ |
| Validate information | `/(auth)/signup/validate-information` | `GET /auth/code-status` ✅ · `POST /registration/me/confirm-subjects` ✅ |
| Bio-data update | `/(auth)/signup/bio-data-update` | `POST /auth/complete-registration` ✅ · `POST /registration/me/confirm-subjects` ✅ |
| Document upload | `/(auth)/signup/document-upload` | `PATCH /registration/me/academic-intake` ✅ · `GET /submission/me/requirements` ✅ · `GET /submission/me/documents` ✅ · `POST /files/upload` ✅ · `POST /submission/me/documents` ✅ · `GET /registration/me/exam-results` ✅ |
| Biometrics capture | `/(auth)/signup/biometrics-capture` | `POST /identity/biometrics` ✅ · `POST /identity/registrations/:id/biometrics/skip` ✅ · `GET /identity/registrations/:id/biometrics` ✅ |
| Data preview & submit | `/(auth)/signup/data-preview` | `GET /registration/me/submission-preview` ✅ · `POST /registration/me/submit` ✅ · `GET /registration/me/exam-results` ✅ |
| Registration status | `/(auth)/registration-status` | `registration` object from login/profile (no dedicated screen endpoint) |
| Dashboard home | `/(modules)/dashboard` | `GET /registration/me/profile` ✅ · `GET /dashboard/home` 🟡 |
| Dashboard courses | `/(modules)/dashboard/courses` | `GET /dashboard/courses` 🟡 |
| Dashboard results | `/(modules)/dashboard/result` | `GET /dashboard/results` 🟡 |
| Attendance home | `/(modules)/attendance` | `GET /registration/me/profile` ✅ · `GET /attendance/home` 🟡 |
| Attendance lectures | `/(modules)/attendance/lectures` | `GET /attendance/summary` 🟡 · `GET /attendance/classes` 🟡 · `GET /attendance/history` 🟡 |
| Attendance history (detail) | `/attendance/history` | `GET /attendance/classes/:courseCode/sessions` 🟡 |
| Attendance timetable | `/(modules)/attendance/timetable` | `GET /attendance/timetable` 🟡 |
| Notifications | `/notifications` | `GET /notifications` ✅ · `PATCH /notifications/:id/read` ✅ · `PATCH /notifications/read-all` ✅ |
| Settings | `/(modules)/*/settings` | `POST /auth/logout` ✅ · `GET /users/me/preferences` ✅ · `PATCH /users/me/preferences` ✅ · `DELETE /users/me` ✅ |
| View profile | `/settings/view-profile` | `GET /registration/me/profile` ✅ · `GET /registration/me/submission-preview` ✅ |
| View registration slip | `/settings/view-registration-slip` | `GET /registration/me/submission-preview` ✅ · `GET /registration/me/exam-results` ✅ · `GET /registration/me/slip` ✅ |

---

## Registration routing (`next_step`)

After login or submit, the app routes users based on `registration.next_step`:

| `next_step` value | Screen |
|-------------------|--------|
| `claim_code` | Enter code |
| `confirm_subjects` | Validate information |
| `complete_profile` / `update_biodata` | Bio-data update |
| `upload_documents` | Document upload |
| `capture_biometrics` / `biometrics` | Biometrics capture |
| `review_submission` / `data_preview` | Data preview |
| `await_review` | Registration status (under review) |
| `view_rejection` | Registration status (rejected) |
| `view_dashboard` | Dashboard (only if `dashboard_unlocked: true`) |
| `restart` | Onboarding |

---

## 1. Authentication

### `GET /auth/code-status` ✅

**Screen:** Enter registration code

**Auth:** No

**Query:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | 6-character institution code |

**Response `data`:**

```json
{
  "valid": true,
  "error_code": null,
  "expires_at": "2026-08-01T00:00:00Z",
  "university": {
    "id": "uuid",
    "name": "University of Lagos",
    "short_name": "UNILAG",
    "jupeb_prefix": "UL"
  },
  "candidate": {
    "registration_id": "uuid",
    "full_name": "Jane Doe",
    "jupeb_reg_no": "270010001",
    "provisional_candidate_code": "ABC123",
    "photo_url": "https://cdn.example.com/photo.jpg",
    "status": "pending"
  },
  "basic_information": {
    "date_of_birth": "1999-01-01",
    "gender": "female",
    "residential_address": "123 Main St, Lagos",
    "country": { "id": 1, "name": "Nigeria" },
    "state_of_origin": { "id": 25, "name": "Lagos", "code": "LA" },
    "lga": { "id": 301, "name": "Ikeja" },
    "place_of_birth": "Lagos"
  },
  "contact_information": {
    "email": "jane@example.com",
    "phone": "+2348012345678"
  },
  "next_of_kin": {
    "name": "John Doe",
    "relationship": "Father",
    "contact_no": "+2348098765432",
    "phone": "+2348098765432",
    "email": null,
    "address": null,
    "source": "registrar"
  },
  "subject_combination": {
    "id": "uuid",
    "code": "CRS/ISS/GOV/LIT",
    "title": "CRS, ISS, Government, Literature"
  },
  "session": {
    "id": "uuid",
    "academic_year": "2025/2026",
    "year_short": "25/26"
  },
  "account": {
    "exists": false,
    "active": false,
    "email_masked": null,
    "phone_masked": null,
    "email_verified": false,
    "phone_verified": false,
    "can_login": false
  },
  "nin_verification": {
    "id": "uuid",
    "status": "verified"
  }
}
```

**Notes:**
- Return populated `basic_information`, `contact_information`, and `next_of_kin` for real candidates (currently a blocker for UAT).
- When `valid: false`, set `error_code` (e.g. `code_invalid`, `code_expired`, `code_already_claimed`).
- `photo_url` must be a reachable URL when a photo exists.

---

### `POST /auth/register-with-code` ✅ (defined, optional)

**Screen:** Not currently used (enter-code uses `GET /auth/code-status` instead). Kept for parity with API.

**Auth:** No

**Request:**

```json
{ "code": "ABC123" }
```

**Response `data`:** Same candidate preview fields as `code-status` (no tokens):

```json
{
  "candidate": { },
  "basic_information": { },
  "contact_information": { },
  "next_of_kin": { },
  "subject_combination": { },
  "university": { },
  "session": { },
  "code": { "expires_at": "2026-08-01T00:00:00Z" },
  "editable_fields": ["email", "phone", "residential_address", "date_of_birth", "gender"],
  "nin_verification": { "id": "uuid", "status": "pending" }
}
```

---

### `POST /auth/complete-registration` ✅

**Screen:** Bio-data update

**Auth:** No (code proves eligibility)

**Request:**

```json
{
  "code": "ABC123",
  "password": "SecurePass123",
  "email": "jane@example.com",
  "phone": "+2348012345678",
  "first_name": "Jane",
  "last_name": "Doe",
  "residential_address": "123 Main St, Lagos",
  "date_of_birth": "1999-01-01",
  "gender": "female"
}
```

**Response `data`:**

```json
{
  "access_token": "jwt",
  "refresh_token": "jwt",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "user_id": "uuid",
    "email": "jane@example.com",
    "phone": "+2348012345678",
    "first_name": "Jane",
    "last_name": "Doe",
    "role": "student",
    "roles": ["student"],
    "verified": true
  },
  "registration": {
    "id": "uuid",
    "status": "in_progress",
    "provisional_candidate_code": "ABC123",
    "jupeb_candidate_number": null,
    "claimed_at": "2026-07-10T12:00:00Z",
    "submitted_at": null,
    "approved_at": null,
    "dashboard_unlocked": false,
    "next_step": "upload_documents"
  }
}
```

---

### `POST /auth/login` ✅

**Screen:** Login

**Auth:** No

**Request:**

```json
{
  "identifier": "jane@example.com",
  "password": "SecurePass123"
}
```

`identifier` accepts email, phone, or provisional registration code.

**Response `data`:** Same shape as `complete-registration` tokens response. `registration.next_step` drives post-login routing.

---

### `POST /auth/refresh-token` ✅

**Screen:** Background token refresh (not a visible screen)

**Auth:** No

**Request:**

```json
{ "refresh_token": "jwt" }
```

**Response `data`:**

```json
{
  "access_token": "jwt",
  "refresh_token": "jwt"
}
```

---

### `POST /auth/logout` ✅

**Screen:** Settings → Log out

**Auth:** Yes

**Request:** Empty body

**Response `data`:** `null` or `{}`

---

### `POST /auth/forgot-password` ✅

**Screen:** Login → "Reset it" link

**Auth:** No

**Request:**

```json
{
  "identifier": "jane@example.com",
  "delivery": "otp",
  "channel": "email"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `identifier` | string | Yes | Email or phone |
| `delivery` | string | No | `token` (email link, default) or `otp` (6-digit code — prefer for mobile) |
| `channel` | string | No | `email` \| `sms` \| `both` |

**Response `data`:** success envelope; treat as opaque. Do not reveal whether the account exists.

---

### `POST /auth/reset-password` ✅

**Screen:** Reset-password / OTP entry

**Auth:** No

Two body shapes are supported:

**OTP flow (mobile):**

```json
{
  "identifier": "jane@example.com",
  "code": "123456",
  "new_password": "NewSecurePass123"
}
```

**Email-link / token flow:**

```json
{
  "token": "reset-token-from-email",
  "new_password": "NewSecurePass123"
}
```

**Response `data`:** success envelope when the password was updated.
---

## 2. Registration & Profile

### `GET /registration/me/profile` ✅

**Screens:** Dashboard home, Attendance home, View profile, Signup resume (hydration)

**Auth:** Yes

**Response `data`:**

```json
{
  "candidate": {
    "id": "uuid",
    "full_name": "Jane Doe",
    "provisional_candidate_code": "ABC123",
    "photo_url": "https://cdn.example.com/photo.jpg",
    "status": "approved"
  },
  "basic_information": {
    "date_of_birth": "1999-01-01",
    "gender": "female",
    "residential_address": "123 Main St, Lagos",
    "country": { "id": 1, "name": "Nigeria" },
    "state_of_origin": { "id": 25, "name": "Lagos", "code": "LA" },
    "lga": { "id": 301, "name": "Ikeja" },
    "place_of_birth": "Lagos"
  },
  "contact_information": {
    "email": "jane@example.com",
    "phone": "+2348012345678"
  },
  "next_of_kin": {
    "name": "John Doe",
    "relationship": "Father",
    "contact_no": "+2348098765432",
    "phone": "+2348098765432",
    "email": null,
    "address": null,
    "source": "registrar"
  },
  "subject_combination": {
    "id": "uuid",
    "code": "CRS/ISS/GOV/LIT",
    "title": "CRS, ISS, Government, Literature"
  },
  "university": {
    "id": "uuid",
    "name": "University of Lagos",
    "short_name": "UNILAG",
    "jupeb_prefix": "UL"
  },
  "session": {
    "id": "uuid",
    "academic_year": "2025/2026",
    "year_short": "25/26"
  },
  "nin_verification": {
    "id": "uuid",
    "status": "verified"
  }
}
```

---

### `PATCH /registration/me/profile` ✅

**Screen:** Bio-data update (post-registration edits; available after account creation)

**Auth:** Yes

**Request** (all fields optional):

```json
{
  "title": "Mr",
  "residential_address": "456 New Address",
  "state_of_origin": "Lagos",
  "lga": "Ikeja",
  "place_of_birth": "Lagos",
  "phone": "+2348011111111",
  "email": "newemail@example.com",
  "next_of_kin": {
    "name": "Jane Doe",
    "relationship": "mother",
    "phone": "+2348012345678",
    "email": "jane@example.com",
    "address": "123 Main St"
  }
}
```

**Response `data`:** Same composite shape as `GET /registration/me/profile`.

---

### `PATCH /registration/me/academic-intake` ✅

**Screen:** Document upload (sitting count & exam types)

**Auth:** Yes

**Request:**

```json
{
  "sittings_count": 2,
  "result_types": ["waec", "neco"]
}
```

**Response `data`:**

```json
{
  "id": "uuid",
  "status": "in_progress",
  "provisional_candidate_code": "ABC123",
  "jupeb_candidate_number": null,
  "claimed_at": "2026-07-10T12:00:00Z",
  "submitted_at": null,
  "approved_at": null,
  "dashboard_unlocked": false,
  "next_step": "upload_documents"
}
```

---

### `POST /registration/me/confirm-subjects` ✅

**Screens:** Validate information, Bio-data update

**Auth:** Yes

**Request:**

```json
{ "subject_combination_id": "uuid" }
```

Empty body `{}` is also accepted when confirming the pre-assigned combination.

**Response `data`:** `RegistrationSummary` (same shape as academic-intake response).

---

### `GET /registration/me/submission-preview` ✅

**Screens:** Data preview, View profile (documents), View registration slip

**Auth:** Yes

**Response `data`:**

```json
{
  "candidate": { },
  "basic_information": { },
  "contact_information": { },
  "next_of_kin": { },
  "subject_combination": { },
  "university": { },
  "documents": [
    {
      "id": "uuid",
      "requirement_id": "uuid",
      "file_name": "WAECresult.pdf",
      "download_url": "https://cdn.example.com/files/waec.pdf"
    }
  ],
  "biometrics": [
    {
      "id": "uuid",
      "capture_type": "face",
      "quality_score": 0.92,
      "captured_at": "2026-07-10T14:00:00Z"
    },
    {
      "id": "uuid",
      "capture_type": "fingerprint",
      "quality_score": 0.88,
      "captured_at": "2026-07-10T14:01:00Z"
    }
  ],
  "biometric_status": "complete",
  "registration": {
    "id": "uuid",
    "status": "submitted",
    "next_step": "await_review",
    "dashboard_unlocked": false
  }
}
```

**Notes:**
- Every document must include a valid `download_url` when available.
- `biometrics` drives the registration slip biometric section.

---

### `POST /registration/me/submit` ✅

**Screen:** Data preview → Confirm submit

**Auth:** Yes

**Request:** Empty body

**Response `data`:** `RegistrationSummary` with `status: "submitted"` and `next_step: "await_review"`.

---

### `GET /registration/me/exam-results` ✅

**Screens:** Document upload (grade table), Data preview, View registration slip

**Auth:** Yes

Returns uploaded O-level (WAEC/NECO/…) grade rows for the current registration.
This is **not** the JUPEB dashboard results endpoint (`GET /dashboard/results`).

**Query (optional):**

| Param | Type | Description |
|-------|------|-------------|
| `source` | string | `waec` \| `neco` \| `nabteb` \| `gce` |
| `sitting` | number | `1` or `2` |

**Response `data`:**

```json
{
  "results": [
    {
      "source": "waec",
      "sitting": 1,
      "file_id": "uuid",
      "grades": [
        { "sn": 1, "subject": "Mathematics", "grade": "A" },
        { "sn": 2, "subject": "English Language", "grade": "B" }
      ],
      "parse_status": "complete"
    }
  ]
}
```

---

### `GET /registration/me/slip` ✅

**Screen:** View registration slip → Download

**Auth:** Yes

Returns a short-lived signed URL. Open `download_url` in a WebView / browser /
download manager — **no Bearer header** on that URL. Available when registration
status is `pending_institution_review` or `approved` (otherwise **422**
`not_ready`).

**Response `data`:**

```json
{
  "download_url": "https://reg-portal-api.morgengreen.cloud/registration/me/slip/download?token=…",
  "expires_at": "2026-07-11T12:00:00Z"
}
```

`GET /registration/me/slip/download?token=…` streams `application/pdf`.
---

## 3. Documents & File Upload

### `POST /files/upload` ✅

**Screen:** Document upload

**Auth:** Yes

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | PDF or image, max 5 MB in app |
| `context` | string | No | e.g. `result` |

**Response `data`:**

```json
{
  "id": "uuid",
  "file_id": "uuid",
  "url": "https://cdn.example.com/files/uploaded.pdf",
  "name": "WAECresult.pdf"
}
```

---

### `GET /submission/me/requirements` ✅

**Screen:** Document upload

**Auth:** Yes

**Response `data`:**

```json
[
  {
    "id": "uuid",
    "code": "waec_result",
    "name": "WAEC Result",
    "title": "WAEC Result",
    "description": "Upload your WAEC certificate",
    "result_type": "waec"
  },
  {
    "id": "uuid",
    "code": "neco_result",
    "name": "NECO Result",
    "title": "NECO Result",
    "description": "Upload your NECO certificate",
    "result_type": "neco"
  }
]
```

---

### `GET /submission/me/documents` ✅

**Screen:** Document upload (resume)

**Auth:** Yes

**Response `data`:**

```json
[
  {
    "id": "uuid",
    "requirement_id": "uuid",
    "file_id": "uuid",
    "file_name": "WAECresult.pdf",
    "registration_id": "uuid"
  }
]
```

---

### `POST /submission/me/documents` ✅

**Screen:** Document upload

**Auth:** Yes

**Request:**

```json
{
  "requirement_id": "uuid",
  "file_id": "uuid",
  "registration_id": "uuid",
  "source": "waec",
  "sitting": 1
}
```

`source` and `sitting` are required for result-type requirements.

**Response `data`:**

```json
{
  "id": "uuid",
  "requirement_id": "uuid",
  "file_id": "uuid",
  "file_name": "WAECresult.pdf",
  "registration_id": "uuid"
}
```

---

### `DELETE /submission/me/documents/:documentId` ❌

**Screen:** Document upload (re-upload / replace — not built yet but recommended)

**Auth:** Yes

**Response `data`:** `null` or `{ "deleted": true }`

---

## 4. Identity / Biometrics

### `POST /identity/biometrics` ✅

**Screen:** Biometrics capture (face upload)

**Auth:** Yes

**Request:**

```json
{
  "registration_id": "uuid",
  "capture_type": "face",
  "external_reference": "file-id-or-vendor-ref",
  "quality_score": 0.92
}
```

`capture_type`: `"face"` | `"fingerprint"`

**Response `data`:**

```json
{
  "id": "uuid",
  "capture_type": "face",
  "quality_score": 0.92,
  "captured_at": "2026-07-10T14:00:00Z",
  "external_reference": "file-id-or-vendor-ref"
}
```

---

### `POST /identity/registrations/:registrationId/biometrics/skip` ✅

**Screen:** Biometrics capture (when device biometrics unavailable)

**Auth:** Yes

**Request:**

```json
{ "capture_type": "fingerprint" }
```

**Response `data`:** `null` or `{}`

---

### `GET /identity/registrations/:registrationId/biometrics` ✅

**Screen:** Biometrics capture (resume), submission preview hydration

**Auth:** Yes

**Response `data`:**

```json
[
  {
    "id": "uuid",
    "capture_type": "face",
    "quality_score": 0.92,
    "captured_at": "2026-07-10T14:00:00Z",
    "external_reference": "file-id"
  }
]
```

---

## 5. Dashboard (post-registration) — 🟡 API ready (fixture-backed)

> Call these endpoints now. Paths and `data` shapes are final for mobile.
> Until live Attendance/CRMS are connected, values come from deterministic
> fixtures. No client path changes will be required when live data is enabled.

### `GET /dashboard/home` 🟡

**Screen:** Dashboard home

**Auth:** Yes

**Response `data`:**

```json
{
  "summary": {
    "attendance_percent": 96,
    "average_score_percent": 74,
    "subjects_count": 3,
    "overall_grade": "A"
  },
  "todays_classes": [
    {
      "id": "uuid",
      "course_code": "ELE 201",
      "status": "ongoing",
      "time_range": "09:30 - 11:00",
      "action": "mark_attendance",
      "action_disabled": false
    },
    {
      "id": "uuid",
      "course_code": "ELE 321",
      "status": "upcoming",
      "time_range": "11:00 - 12:30",
      "action": "preview",
      "action_disabled": false
    }
  ],
  "attendance_chart": {
    "headline_percent": 80,
    "caption": "Average attendance over the week",
    "labels": ["Mon", "Tue", "Wed", "Thurs", "Fri"],
    "series_primary": [42, 48, 78, 85, 75],
    "series_secondary": [25, 63, 28, 48, 95]
  },
  "unread_notifications_count": 2
}
```

`status`: `ongoing` | `upcoming` | `completed`

---

### `GET /dashboard/courses` 🟡

**Screen:** Dashboard courses

**Auth:** Yes

**Response `data`:**

```json
{
  "summary": {
    "subjects_count": 3,
    "subtopics_count": 10
  },
  "courses": [
    {
      "id": "uuid",
      "title": "Mathematics",
      "subtopics": ["Algebra", "Geometry", "Calculus basics", "Statistics intro"]
    },
    {
      "id": "uuid",
      "title": "English Language",
      "subtopics": ["Grammar", "Comprehension", "Essay writing"]
    }
  ]
}
```

---

### `GET /dashboard/results` 🟡

**Screen:** Dashboard results

**Auth:** Yes

**Response `data`:**

```json
{
  "summary": {
    "grade_label": "A",
    "average_score": 72.5,
    "grade_point": 7
  },
  "exam_scores": [
    {
      "id": "uuid",
      "subject": "MTH101",
      "ca": "6/15",
      "exam": "80/85",
      "total": "86/100",
      "grade": "A"
    }
  ],
  "download_url": "https://cdn.example.com/results/transcript.pdf",
  "share_url": "https://portal.example.com/results/share/token"
}
```

---

## 6. Attendance — 🟡 API ready (fixture-backed)

> Same guidance as dashboard: wire the UI to these paths now. Shapes are stable.

### `GET /attendance/home` 🟡

**Screen:** Attendance home tab (same layout as dashboard home)

**Auth:** Yes

**Response `data`:** Same shape as `GET /dashboard/home`.

---

### `GET /attendance/summary` 🟡

**Screen:** Attendance lectures

**Auth:** Yes

**Response `data`:**

```json
{
  "total_marked": 14,
  "attendance_ratio_percent": 96,
  "analytics": {
    "attended_percent": 75,
    "missed_percent": 25
  }
}
```

---

### `GET /attendance/classes` 🟡

**Screen:** Attendance lectures → Classes tab

**Auth:** Yes

**Query (optional):** `q` — search by course code

**Response `data`:**

```json
[
  {
    "id": "uuid",
    "course_code": "ELE 202",
    "course_title": "Electrical Science Studies",
    "room": "Room 101",
    "date_label": "Sun, Feb 22",
    "time_range": "09:00 - 11:30"
  }
]
```

---

### `GET /attendance/history` 🟡

**Screen:** Attendance lectures → History tab

**Auth:** Yes

**Query (optional):** `q` — search

**Response `data`:**

```json
[
  {
    "id": "uuid",
    "course_code": "ELE 202",
    "course_title": "Electrical science studies",
    "attended_count": 10,
    "attendance_percent": 34
  }
]
```

---

### `GET /attendance/classes/:courseCode/sessions` 🟡

**Screen:** Attendance history (per-course detail)

**Auth:** Yes

**Query (optional):** `q` — search

**Path:** URL-encode spaces in `courseCode` (e.g. `ELE%20202`).

**Response `data`:**

```json
[
  {
    "id": "uuid",
    "course_code": "ELE 202",
    "location": "Angola Hall",
    "date_label": "Sun, Feb 22",
    "time_range": "09:00 - 11:30",
    "checked_in_at": "2026-02-22T15:03:00Z",
    "checked_out_at": "2026-02-22T17:03:00Z"
  }
]
```

---

### `GET /attendance/timetable` 🟡

**Screen:** Attendance timetable

**Auth:** Yes

**Query (optional):**

| Param | Type | Description |
|-------|------|-------------|
| `month` | string | `YYYY-MM` (invalid format → **422**) |

**Response `data`:**

```json
{
  "marked_dates": ["2026-07-27", "2026-08-06", "2026-08-15"],
  "sessions_by_date": {
    "2026-07-27": [
      {
        "id": "uuid",
        "course_code": "ELE 202",
        "time_range": "09:00 - 11:30",
        "room": "Room 101"
      }
    ]
  }
}
```

---

### `POST /attendance/sessions/:sessionId/check-in` ❌

**Screen:** Dashboard / Attendance → "Mark Attendance" (future)

**Auth:** Yes

**Not available yet.** Keep the button disabled or local-only until this ships.

**Intended request:**

```json
{
  "latitude": 6.5244,
  "longitude": 3.3792,
  "accuracy_meters": 12
}
```

**Intended response `data`:**

```json
{
  "id": "uuid",
  "session_id": "uuid",
  "checked_in_at": "2026-07-10T09:05:00Z",
  "status": "checked_in"
}
```

---

## 7. Notifications — ✅ implemented (PATCH + PUT aliases)

### `GET /notifications` ✅

**Screen:** Notifications list, header badge dot

**Auth:** Yes

**Query (optional):**

| Param | Type | Description |
|-------|------|-------------|
| `filter` | string | `all` \| `unread` |
| `page` | number | Pagination |
| `per_page` | number | Default 20 |

**Response `data`:**

```json
{
  "unread_count": 2,
  "items": [
    {
      "id": "uuid",
      "title": "Upcoming Class Reminder",
      "message": "Mathematics Class starts in 2 hours",
      "timestamp": "2026-02-22T07:00:00Z",
      "icon_variant": "reminder",
      "is_read": false,
      "action_url": null
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 5
  }
}
```

`icon_variant`: `reminder` | `info` | `alert`

---

### `PATCH /notifications/:id/read` ✅

**Screen:** Notifications → tap item

**Auth:** Yes

**Request:**

```json
{ "is_read": true }
```

**Response `data`:**

```json
{
  "id": "uuid",
  "is_read": true
}
```

Also available as `PUT /notifications/:notification_id/read` for legacy clients.

---

### `PATCH /notifications/read-all` ✅

**Screen:** Future "mark all read" action

**Auth:** Yes

**Request:** Empty body

**Response `data`:**

```json
{ "updated_count": 5 }
```

Also available as `PUT /notifications/read-all`.

---

### `DELETE /notifications/:id` ✅

**Screen:** Not in UI yet; optional for swipe-to-delete

**Auth:** Yes

**Response `data`:** `{ "deleted": true }`

---

## 8. User Settings — ✅ implemented

### `PATCH /users/me/preferences` ✅

**Screen:** Settings → Push Notification / Fingerprint toggles

**Auth:** Yes

**Request:**

```json
{
  "push_notifications_enabled": true,
  "biometric_login_enabled": false
}
```

**Response `data`:**

```json
{
  "push_notifications_enabled": true,
  "biometric_login_enabled": false
}
```

---

### `GET /users/me/preferences` ✅

**Screen:** Settings (load initial toggle state)

**Auth:** Yes

**Response `data`:** Same as PATCH response.

---

### `DELETE /users/me` ✅

**Screen:** Settings → Delete my account

**Auth:** Yes

**Request:**

```json
{ "confirmation": "DELETE" }
```

**Response `data`:**

```json
{ "deleted": true }
```

Soft-deletes the user (`users.deleted_at`) and revokes all refresh sessions.
---

## Shared Types Reference

### `RegistrationSummary`

Returned on login, complete-registration, confirm-subjects, academic-intake, and submit.

```json
{
  "id": "uuid",
  "status": "in_progress | submitted | approved | rejected",
  "provisional_candidate_code": "ABC123",
  "jupeb_candidate_number": "270010001",
  "claimed_at": "ISO-8601",
  "submitted_at": "ISO-8601 | null",
  "approved_at": "ISO-8601 | null",
  "dashboard_unlocked": false,
  "next_step": "upload_documents"
}
```

### `BasicInformation` / `ContactInformation` / `NextOfKin`

See `GET /auth/code-status` response above. Reused across code-status, profile, and submission-preview.

---

## Suggested mobile wiring priority

1. **Done / call now (✅):** Full registration flow, notifications, preferences, account delete, exam-results, slip download, forgot/reset password.
2. **Wire now with fixtures (🟡):** Dashboard home/courses/results and all Attendance GET routes — shapes will not change when live data arrives.
3. **Still blocked (❌):** `POST /attendance/sessions/:sessionId/check-in` only.

---

## Related docs

- [`INTEGRATIONS_ATTENDANCE_CRMS.md`](./INTEGRATIONS_ATTENDANCE_CRMS.md) — backend/upstream only (not for mobile clients).
- [`BACKEND_DEPENDENCIES.md`](./BACKEND_DEPENDENCIES.md) — tracker for blocked tasks and ownership.
