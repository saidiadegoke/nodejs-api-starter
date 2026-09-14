# CERP — Attendance & CRMS Integration Specification

This document defines how `reg-portal-api` talks to the **Attendance** and **CRMS** upstream services for mobile student screens (dashboard, courses, results, lectures, timetable). It is the companion to [`MOBILE_API_ENDPOINTS.md`](MOBILE_API_ENDPOINTS.md) and is intended for the Attendance/CRMS service teams and the `reg-portal-api` backend team.

**Gateway (this API):** `https://reg-portal-api.morgengreen.cloud`

**Auth (student → this API):** `Authorization: Bearer <access_token>`

**Auth (this API → upstream):** `Authorization: Bearer <service_api_key>`

**Response envelope (this API, all student routes):**

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

Upstream services should return either a bare JSON payload matching the `data` shapes below, **or** the same envelope (`{ "success": true, "data": { … } }`). The HTTP providers unwrap `data` when present.

Errors from this API use the same shape with `success: false` and an appropriate HTTP status (400, 401, 403, 404, 422, 503, 500).

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented end-to-end (local or fully wired upstream) |
| 🟡 | Implemented in this API behind a provider; mock fixtures today — real HTTP wiring pending upstream URLs/contracts |
| ❌ | Not implemented yet |

---

## Architecture overview

```
Mobile app
    │  Bearer student JWT
    ▼
reg-portal-api
    │  resolveStudentContext(user)
    ├──────────────────┬──────────────────┐
    ▼                  ▼                  ▼
Attendance provider   CRMS provider    Local DB
(mock | http)         (mock | http)    (notifications,
                                       preferences,
                                       O-level results,
                                       registration slip)
```

| Domain | Owning service | Mobile-facing routes |
|--------|----------------|----------------------|
| Attendance %, today’s classes, chart, lectures, history, sessions, timetable | **Attendance** | `/attendance/*`, part of `/dashboard/home` |
| Courses / subtopics, JUPEB exam scores, home academic summary | **CRMS** | `/dashboard/courses`, `/dashboard/results`, part of `/dashboard/home` |
| Unread notification count | **Local** | composed into home |
| O-level WAEC/NECO grades | **Local** | `/registration/me/exam-results` (not CRMS) |
| Registration slip PDF | **Local** | `/registration/me/slip` |

Code locations:

| Piece | Path |
|-------|------|
| Attendance registry | `src/modules/integrations/attendance/` |
| CRMS registry | `src/modules/integrations/crms/` |
| Shared errors | `src/modules/integrations/errors.js` |
| Student context | `src/modules/integrations/student-context.js` |
| Attendance module | `src/modules/attendance/` |
| Student dashboard | `src/modules/jupeb/services/student-dashboard.service.js` |

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ATTENDANCE_PROVIDER` | `http` | `mock` \| `http` |
| `ATTENDANCE_SERVICE_BASE_URL` | — | Required when `http` (no trailing slash) |
| `ATTENDANCE_ADMIN_SECRET` | — | Sent as `x-admin-secret` for generate/refresh token |
| `ATTENDANCE_APPLICATION_NAME` | — | App id for token body and `x-app-name` on data calls |
| `ATTENDANCE_SERVICE_TIMEOUT_MS` | `15000` | Axios timeout |
| `CRMS_PROVIDER` | `http` | `http` |
| `CRMS_SERVICE_BASE_URL` | — | Required when `http` |
| `CRMS_SERVICE_API_KEY` | — | Bearer token sent to CRMS |
| `CRMS_SERVICE_TIMEOUT_MS` | `15000` | Axios timeout |

When `http` is selected but base URL, admin secret, or application name is missing, this API returns:

```json
{
  "success": false,
  "message": "attendance provider is not configured",
  "details": {
    "error_code": "provider_not_configured",
    "service": "attendance"
  }
}
```

HTTP status: **503**.

---

## Student context (query identity)

Before every upstream call, this API loads the authenticated student’s latest registration and passes these query parameters on every Attendance / CRMS request:

| Param | Type | Description |
|-------|------|-------------|
| `student_id` | uuid | `users.id` |
| `registration_id` | uuid | Latest `jupeb_registrations.id` for the user |
| `candidate_code` | string \| null | `jupeb_candidate_number` if set, else `provisional_candidate_code` |

Internal context object (not all fields are sent upstream today):

```json
{
  "user_id": "uuid",
  "registration_id": "uuid",
  "university_id": "uuid",
  "session_id": "uuid",
  "candidate_code": "270010001",
  "provisional_candidate_code": "ABC123",
  "jupeb_candidate_number": "270010001",
  "status": "approved",
  "subject_combination_id": "uuid"
}
```

If the student has no registration, mobile routes return **404** with `error_code: registration_not_found`.

---

## Mobile route → upstream map

| Mobile endpoint | Status | Upstream |
|-----------------|--------|----------|
| `GET /dashboard/home` | 🟡 | Attendance `GET /api/students/me/home` + CRMS `GET /v1/students/me/home-summary` + local unread count |
| `GET /dashboard/courses` | 🟡 | CRMS `GET /v1/students/me/courses` |
| `GET /dashboard/results` | 🟡 | CRMS `GET /v1/students/me/results` |
| `GET /attendance/home` | 🟡 | Same composition as `/dashboard/home` |
| `GET /attendance/summary` | 🟡 | Attendance `GET /api/students/me/summary` |
| `GET /attendance/classes` | 🟡 | Attendance `GET /api/students/me/classes` |
| `GET /attendance/history` | 🟡 | Attendance `GET /api/students/me/history` |
| `GET /attendance/classes/:courseCode/sessions` | 🟡 | Attendance `GET /api/students/me/classes/:courseCode/sessions` |
| `GET /attendance/timetable` | 🟡 | Attendance `GET /api/students/me/timetable` |
| `POST /attendance/sessions/:sessionId/check-in` | ❌ | Not proxied yet |

---

## 1. Attendance service

**Base URL:** value of `ATTENDANCE_SERVICE_BASE_URL`

**Auth:**
1. `POST /api/auth/generate-token` with `x-admin-secret: <ATTENDANCE_ADMIN_SECRET>` and body `{ "applicationName": "<ATTENDANCE_APPLICATION_NAME>" }` → `{ token }`
2. `POST /api/auth/refresh-token` with `x-admin-secret` to renew (portal retries on `401`)
3. Student endpoints: headers `x-app-name` + `x-app-token` (not Bearer)

**Content-Type:** `application/json`

All paths below are relative to the Attendance base URL.

---

### `GET /api/students/me/home` 🟡

**Used by:** `GET /dashboard/home`, `GET /attendance/home`

**Query:** `student_id`, `registration_id`, `candidate_code`

**Response `data` (Attendance portion):**

```json
{
  "attendance_percent": 96,
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
  }
}
```

`status`: `ongoing` | `upcoming` | `completed`

`action`: `mark_attendance` | `preview` (extensible)

**Composed mobile `data` (this API adds CRMS + notifications):**

```json
{
  "summary": {
    "attendance_percent": 96,
    "average_score_percent": 74,
    "subjects_count": 3,
    "overall_grade": "A"
  },
  "todays_classes": [],
  "attendance_chart": {},
  "unread_notifications_count": 2
}
```

---

### `GET /api/students/me/summary` 🟡

**Used by:** `GET /attendance/summary`

**Query:** `student_id`, `registration_id`, `candidate_code`

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

### `GET /api/students/me/classes` 🟡

**Used by:** `GET /attendance/classes`

**Query:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `student_id` | uuid | Yes | Passed by this API |
| `registration_id` | uuid | Yes | Passed by this API |
| `candidate_code` | string | No | Passed by this API |
| `q` | string | No | Search by course code / title (forwarded from mobile) |

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

### `GET /api/students/me/history` 🟡

**Used by:** `GET /attendance/history`

**Query:** same as classes (`q` optional)

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

### `GET /api/students/me/classes/:courseCode/sessions` 🟡

**Used by:** `GET /attendance/classes/:courseCode/sessions`

**Path:** `courseCode` is URL-encoded (e.g. `ELE%20202`)

**Query:** `student_id`, `registration_id`, `candidate_code`, optional `q`

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

`checked_out_at` may be `null` when the student is still checked in.

---

### `GET /api/students/me/timetable` 🟡

**Used by:** `GET /attendance/timetable`

**Query:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `student_id` | uuid | Yes | Passed by this API |
| `registration_id` | uuid | Yes | Passed by this API |
| `candidate_code` | string | No | Passed by this API |
| `month` | string | No | `YYYY-MM`; validated by this API before forward |

Invalid `month` on the mobile route returns **422** (`error_code: month_invalid`) without calling upstream.

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

### `POST /api/students/me/sessions/:sessionId/check-in` ❌

**Planned for:** `POST /attendance/sessions/:sessionId/check-in`

**Not proxied yet.** Intended request body when wired:

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

## 2. CRMS service

**Base URL:** value of `CRMS_SERVICE_BASE_URL`

**Auth:** `Authorization: Bearer <CRMS_SERVICE_API_KEY>`

All paths below are relative to the CRMS base URL.

> **Scope note:** CRMS owns **JUPEB course / exam scores** for the student dashboard. Uploaded O-level (WAEC/NECO/NABTEB/GCE) intake results stay on this API as `GET /registration/me/exam-results` and must **not** be served by CRMS.

---

### `GET /v1/students/me/home-summary` 🟡

**Used by:** `GET /dashboard/home`, `GET /attendance/home`

**Query:** `student_id`, `registration_id`, `candidate_code`

**Response `data`:**

```json
{
  "average_score_percent": 74,
  "subjects_count": 3,
  "overall_grade": "A"
}
```

Merged by this API into `data.summary` alongside Attendance’s `attendance_percent`.

---

### `GET /v1/students/me/courses` 🟡

**Used by:** `GET /dashboard/courses`

**Query:** `student_id`, `registration_id`, `candidate_code`

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

### `GET /v1/students/me/results` 🟡

**Used by:** `GET /dashboard/results`

**Query:** `student_id`, `registration_id`, `candidate_code`

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

`download_url` / `share_url` may be `null` when no transcript has been issued.

---

## 3. Error mapping

Upstream failures are normalized before they reach the mobile client.

| Condition | HTTP status to mobile | `details.error_code` |
|-----------|----------------------|----------------------|
| Provider set to `http` but URL/key missing | 503 | `provider_not_configured` |
| Upstream timeout / network | 503 | `provider_unavailable` |
| Upstream 5xx | 503 | `provider_upstream_error` |
| Upstream 4xx (except where remapped) | same 4xx (or 503) | `provider_upstream_error` |
| Upstream 404 | 404 | `provider_upstream_error` |
| No local registration for student | 404 | `registration_not_found` |
| Invalid `month` query | 422 | `month_invalid` |

Example upstream timeout response:

```json
{
  "success": false,
  "message": "attendance request timed out",
  "details": {
    "error_code": "provider_unavailable",
    "service": "attendance"
  }
}
```

Axios / stack traces are **never** forwarded to the client.

---

## 4. Mock provider behaviour

With `ATTENDANCE_PROVIDER=mock` and `CRMS_PROVIDER=mock` (recommended for local development and tests):

- No network calls are made.
- Responses match the contracts above with deterministic fixture UUIDs.
- Search (`q`) filters mock Attendance lists client-side by course code / title / location.
- Timetable `month` seeds marked dates into the requested `YYYY-MM`.

Switching to live upstream:

```bash
ATTENDANCE_PROVIDER=http
ATTENDANCE_SERVICE_BASE_URL=https://attendance.example.com
ATTENDANCE_ADMIN_SECRET=…
ATTENDANCE_APPLICATION_NAME=…

CRMS_PROVIDER=http
CRMS_SERVICE_BASE_URL=https://crms.example.com
CRMS_SERVICE_API_KEY=sk_live_…
```

Providers can be flipped independently (e.g. live Attendance + mock CRMS).

---

## 5. Local endpoints (not upstream)

These mobile routes from [`MOBILE_API_ENDPOINTS.md`](MOBILE_API_ENDPOINTS.md) are **not** proxied to Attendance or CRMS. Documented here only for ownership clarity.

| Endpoint | Status | Source of truth |
|----------|--------|-----------------|
| `GET /notifications` (+ PATCH read / read-all) | ✅ | Local `notifications` table |
| `GET` / `PATCH /users/me/preferences` | ✅ | Local `user_preferences` table |
| `DELETE /users/me` | ✅ | Soft-delete `users.deleted_at` + revoke sessions |
| `GET /registration/me/exam-results` | ✅ | Local `jupeb_result_entries` (O-level) |
| `GET /registration/me/slip` | ✅ | Signed URL → local registration-form PDF |
| `GET /registration/me/profile` | ✅ | Local registration / profile |

---

## 6. Implementation checklist (upstream teams)

### Attendance service

- [ ] Expose the six `GET /api/students/me/…` routes above
- [ ] Expose `POST /api/auth/generate-token` and `POST /api/auth/refresh-token`
- [ ] Accept `student_id`, `registration_id`, `candidate_code` query params
- [ ] Authenticate via `x-app-name` + `x-app-token` on student routes
- [ ] Return JSON matching the documented `data` shapes (envelope optional)
- [ ] Support optional `q` on classes / history / sessions
- [ ] Support optional `month=YYYY-MM` on timetable
- [ ] (Future) Implement check-in `POST` when mobile enables mark-attendance

### CRMS service

- [ ] Expose `home-summary`, `courses`, and `results` under `/v1/students/me/…`
- [ ] Accept the same student identity query params
- [ ] Authenticate service Bearer API keys
- [ ] Return JUPEB academic scores only (not O-level intake results)
- [ ] Provide transcript `download_url` / `share_url` when available

### reg-portal-api (when contracts are live)

- [ ] Ensure `ATTENDANCE_PROVIDER=http` (now the default) and set `CRMS_PROVIDER=http` in each environment
- [ ] Store `ATTENDANCE_ADMIN_SECRET` / `ATTENDANCE_APPLICATION_NAME` and CRMS API keys as secrets (not in git)
- [ ] Confirm path prefixes if upstream differs — adjust `http.provider.js` mappers only
- [ ] Re-run `npm run test:mobile` with mocks; add contract tests against staging when available

---

## 7. Related docs & tests

| Resource | Location |
|----------|----------|
| Mobile screen → endpoint map | [`MOBILE_API_ENDPOINTS.md`](MOBILE_API_ENDPOINTS.md) |
| Env template | [`.env.example`](.env.example) |
| Provider unit tests | `src/tests/integrations.providers.test.js` |
| Dashboard / attendance API tests | `src/tests/mobile.dashboard.attendance.api.test.js` |
| Settings / slip / exam-results tests | `src/tests/mobile.settings.registration.api.test.js` |
| Test script | `npm run test:mobile` |
