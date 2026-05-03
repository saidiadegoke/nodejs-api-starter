---
name: Figma vs API gap analysis
description: Per-screen audit of the figma flows vs the existing reg-portal-api endpoints, with concrete gaps and proposed endpoints.
type: project
---

# Figma vs API gap analysis

This document walks through every screen in `figma/` and identifies gaps
in the current API impl (`reg-portal-api/src/modules/jupeb/...`).

The goal is to enumerate **everything** the UI needs that the API does
not yet expose, or where the existing endpoint can not satisfy what the
designed UX requires.

Legend:
- 🟢 Already supported by an existing endpoint.
- 🟡 Partially supported — endpoint exists but is missing fields, role
  scope, or response shape needed by the screen.
- 🔴 Not supported — no endpoint exists.

## 1. Login (`log in 10.jpg`) — JUPEB Student Portal sign-in

UI elements: email, password, "Forgot your password? Reset it",
"Click here to get started".

| Need | Status | Endpoint / gap |
|---|---|---|
| Email + password login | 🟢 | `POST /auth/login` (modules/auth) |
| Password reset entry point | 🟢 | `POST /auth/forgot-password` exists |
| "Get started" → student onboarding via institution code | 🟡 | We have `POST /registration/me/claim-code` but no public sign-up that pairs the code with a fresh user account in one shot. Today the user must first register a `users` account, then call claim-code. The figma's "Click here to get started" implies a single flow. **Gap:** `POST /auth/register-with-code` (creates user + binds code in one transaction) or a dedicated onboarding wizard endpoint. |

## 2. Code entry (`log in 11.jpg`) — "Enter code" 6-cell input

UI elements: 6-character institution-issued code, three-dot progress
indicator showing the user is in step 1 of 3.

| Need | Status | Endpoint / gap |
|---|---|---|
| Submit institution code | 🟢 | `POST /registration/me/claim-code` |
| Pre-validate code without claiming it (so step 1 can advance only on valid codes) | 🔴 | Today, claim-code mutates: it binds the code to the authenticated user. There is no read-only "is this code valid?" probe. **Gap:** `GET /registration/me/code-status?code=…` returning `{ valid, expires_at, university_name }` so the wizard can show inline validation and the candidate's institution name before commit. |
| Code expiry signal | 🟡 | We have `institution_code_expires_at` on the row and the claim-code endpoint returns 410, but the UI needs to render expiry copy ("Code expired — request a new one from your Program Director") with the expiry timestamp. The 410 message is generic. **Gap:** include a structured `error_code: 'code_expired'` and `expires_at` in the error body. |
| Code length / format | 🟡 | The model uses 16-char hex codes (`generateUniqueInstitutionCode`). The figma shows 6 cells. **Mismatch.** Either: (a) backend issues short, human-readable codes (e.g. base32 6-char), or (b) UI changes to 16-cell input. We recommend (a) — shorten to 6–8 chars, store the original length under a unique constraint, keep collision check loop. |

## 3. Student information / NIN verification confirmation (`log in 12.jpg`)

UI shows pre-filled candidate data (name, candidate code 001/0001,
combination "CRS/ISS, Government, Literature - JUPEB SC-001", DOB,
state of origin, LGA, place of birth, phone, email, next-of-kin name &
contact). The whole page is "validated" — meaning these fields are
returned from a single endpoint after the code is bound.

| Field on screen | Source today | Gap |
|---|---|---|
| Full name | 🟡 | `users.full_name` exists, but the wizard's "validated" badge implies the data was sourced from NIN (per NIN Details screen). The current `nin-verification.response_payload` only stores `first_name/last_name/middle_name/date_of_birth/gender`. **Gap:** the NIN response payload must also carry residential address, state of origin, LGA, place of birth, phone, email — or these must be sourced from a separate user/profile fetch. |
| Candidate code (e.g. 001/0001) | 🟢 | `provisional_candidate_code` |
| Subject combination text | 🟡 | We have `subject_combination_id`. The screen shows the **display string**. **Gap:** `GET /registration/me/current` should embed the combination's title/code, not just the FK. Today `_publicRegistrationSummary` returns only the id. |
| Date of birth | 🟡 | Comes from NIN payload — see above. |
| Residential address | 🔴 | Not on `jupeb_registrations` and not in NIN payload schema. **Gap:** add `address` to NIN response or to a candidate-profile table. |
| State of origin / LGA / Place of birth | 🔴 | Same — no schema field today. |
| Phone / Email | 🟡 | `users.email` covers email; phone exists on `profiles`. Not exposed via `/registration/me/current`. |
| Next of kin name / contact | 🔴 | No schema. **Gap:** new `jupeb_candidate_next_of_kin` table, or JSONB column on `jupeb_registrations` (preferred for now: `next_of_kin JSONB NULL`). |
| Photo (the avatar shown beside the name) | 🔴 | `jupeb_biometric_captures` has `face` capture rows but they are referenced by `file_id`. **Gap:** an endpoint that returns a signed URL for the candidate's face photo so the UI can render it: `GET /identity/registrations/:id/photo` returning `{ url, expires_at }`. |

**Recommended endpoint:** `GET /registration/me/profile` returning a
single composite payload that the wizard can render in one call,
sourced from `users` + `profiles` + `jupeb_nin_verifications.response_payload`
+ `jupeb_registrations` + `jupeb_subject_combinations` (joined).

## 4. Bio Data Update (`log in 13.jpg`)

UI lets the student edit Full Name, Email, Residential Address, Phone,
Password, DOB, Gender. Some fields are greyed out (read-only).

| Need | Status | Endpoint / gap |
|---|---|---|
| Update phone, residential address, password | 🟡 | `PUT /users/me` exists for general profile, but it does not know about JUPEB-specific fields (residential address vs `addresses`). The figma greys out name/email/DOB/gender — these came from NIN and cannot be edited by the student. **Gap:** define which fields are editable in this stage; backend must reject edits to NIN-derived fields with `422 nin_field_immutable`. |
| Password change with current-password challenge | 🟡 | `POST /auth/change-password` likely exists in `modules/auth`. Confirm. |
| Validation feedback | 🟢 | Existing validation utilities are sufficient. |

## 5. Document Upload — short form (`log in 14.jpg`)

UI: Select Institution (read-only — pre-selected to "University of
Lagos"), Number of sittings (1 or 2), Select Result (WAEC/NECO).

| Need | Status | Endpoint / gap |
|---|---|---|
| List institutions | 🟢 | `GET /jupeb/catalog/universities/public` |
| Persist sitting count + result type per registration | 🔴 | No schema field on `jupeb_registrations` nor on submission tables. **Gap:** add `sittings_count INTEGER` and `result_types JSONB` (e.g. `["WAEC","NECO"]`) on `jupeb_registrations`, and surface via `PATCH /registration/me/academic-intake`. |

## 6. Document Upload — full form (`log in 15.jpg`)

UI adds: Institution Type (Federal/State/Private), and conditional
upload slots labelled "1. WAEC" and "2. NECO" each accepting PDF/JPEG/
PNG ≤ 5MB.

| Need | Status | Endpoint / gap |
|---|---|---|
| Institution type filter / list | 🟡 | `jupeb_universities` has `category`/`type` field? Check `universityModel`. If absent, **Gap:** add `university_type VARCHAR(20)` with check constraint and expose in catalog list. |
| Upload PDF/JPEG/PNG ≤ 5MB | 🟢 | `submission.routes.js` → `POST /submission/me/documents` already validates via `mimeAllowed`/`sizeAllowed` and `jupeb_document_requirements.allowed_mime_types`/`max_file_size_mb`. |
| Two requirements (WAEC, NECO) keyed by sitting | 🟡 | Requires document-requirement seeding with keys `waec`, `neco`. Today there is no migration that seeds these — `jupeb_document_requirements` is empty until an admin posts to `POST /submission/requirements`. **Gap:** seed file `008_jupeb_document_requirements.seed.sql` (or similar) with the canonical JUPEB requirements. |
| Conditional second-slot only when sittings=2 | 🟡 | Requires UI logic; backend must accept N documents per requirement key OR allow `requirement_id=neco` to be optional based on the registration's `sittings_count`. Today `jupeb_registration_documents` enforces only one active per `(registration_id, requirement_id)`. That is fine — UX adds a sitting which adds a separate requirement. |

## 7. Biometric — primary capture (`log in 17.jpg` / `log in 26.jpg`)

UI: Fingerprint capture, Face capturing (large green tick + camera
icon).

| Need | Status | Endpoint / gap |
|---|---|---|
| Record fingerprint | 🟢 | `POST /identity/biometrics` with `capture_type=fingerprint` |
| Record face | 🟢 | `POST /identity/biometrics` with `capture_type=face` |
| Show captured biometric on later screens | 🟡 | `GET /identity/registrations/:id/biometrics` returns metadata. No signed URL helper. **Gap:** include a `download_url` in the response (or proxy via `files` module) so the figma's "Face Capturing" thumbnail can render. |
| Replace a previously captured biometric | 🟡 | `DELETE /identity/biometrics/:captureId` works, but the unique index `(registration_id, capture_type)` blocks "upload new without delete first". **Gap:** either soft-delete + history, or a `PUT /identity/biometrics/:captureId` that replaces in place. |

## 8. Biometric — fingerprint warning dialog (`Frame 2147225317.jpg`)

Modal: "Click 'Proceed' to capture, or 'Skip' to continue later. Once
you skip, any further update can only be done at your institution."

| Need | Status | Endpoint / gap |
|---|---|---|
| Mark fingerprint as "skipped" so the student can continue, but lock further self-service updates | 🔴 | We have no concept of a "skipped biometric". **Gap:** new column `jupeb_registrations.fingerprint_skipped_at TIMESTAMP NULL` plus `POST /identity/registrations/:id/biometrics/skip` requiring `capture_type` in the body. While `fingerprint_skipped_at IS NOT NULL`, `POST /identity/biometrics` with that type must reject with `403 self_service_locked` and tell the user to contact their institution. Institution roles can still post on the candidate's behalf. |

## 9. Face capturing dialog (`Frame 2147225318.jpg`)

Modal: "Plain background, enough light…", Proceed / Go back.

| Need | Status | Endpoint / gap |
|---|---|---|
| Quality score on capture | 🟢 | `quality_score` is already in schema and validated. |
| Reject low-quality captures | 🔴 | The service does not enforce a minimum `quality_score`. **Gap:** add server-side threshold (configurable env var, e.g. `JUPEB_FACE_MIN_QUALITY=0.6`) and reject below it with `422 quality_too_low`. |

## 10. Subject combination confirm (`Frame 2147225316.jpg`)

Modal: "Confirm Subject Combinations — CRS/ISS, Government,
Literature - JUPEB SC-001". CTA: Confirm / Go back. Help text:
"Incorrect? Contact your institution to update your records."

| Need | Status | Endpoint / gap |
|---|---|---|
| Confirm subject combination | 🟢 | `POST /registration/me/confirm-subjects` |
| Tell the student they can't change it themselves at this stage | 🟡 | Today the endpoint allows the student to pass a new `subject_combination_id` while `status` is `claimed` or `pending_student_confirm`. The figma copy implies the student is read-only — the institution must change it. **Mismatch:** decide which is correct. If product says "student cannot change", remove the `subject_combination_id` body parameter from the student endpoint and make it institution-only via `PATCH /institution/registrations/:id`. |

## 11. Final review screen (`log in 18.jpg`)

UI shows: identity card, basic info, contact info, next of kin,
academic details (WAEC table + NECO table with subject/grade rows),
biometrics (fingerprint + face thumbnails). CTA: "Submit Details".

| Need | Status | Endpoint / gap |
|---|---|---|
| Get aggregated submission preview in one call | 🔴 | The page needs candidate identity + documents + biometrics + parsed result rows + subject combo, all in one shot. We have separate endpoints; nothing aggregates. **Gap:** `GET /registration/me/submission-preview` returning a composite payload. |
| Result rows parsed from the WAEC/NECO PDF | 🔴 | Currently `jupeb_registration_documents` only stores the file. There is no OCR / no `(subject, grade)` table. **Gap (significant):** new table `jupeb_result_entries (id, registration_id, source ENUM('waec','neco'), serial INT, subject TEXT, grade TEXT, sitting INT)`, plus an endpoint `POST /submission/me/result-entries` (bulk upsert). The OCR pipeline is out of scope for this gap doc — at minimum, allow manual entry from the UI. |
| Submit for review | 🟢 | `POST /registration/me/submit` |
| Preview document URL | 🟡 | The "Preview" link beside `WAECresult.pdf` needs a signed URL. The `files` module likely supports this — confirm `GET /files/:id/url`. |

## 12. Institution Portal — Register New Candidate (`Container.jpg`)

Modal: "Register New Candidate — Generate a registration code…".
Cancel / Generate Code.

| Need | Status | Endpoint / gap |
|---|---|---|
| Generate a code | 🟢 | `POST /registration/institution/registrations` returns `institution_issued_code`. |
| But the screen flow goes Generate Code → fill candidate NIN form → verify NIN → confirmation screen → ACTUALLY commit code | 🟡 | Today the flow is reversed: registration creation requires `subject_combination_id` up front, before NIN. Per the NIN Details flow ("Generate Code" CTA at the very end), the right shape is: **Step 1**: NIN verify (capturing name/email/subject combo). **Step 2**: registration create using the verification id. The current API supports this if the UI orders the calls correctly — but `nin_verification_id` is optional today, which permits orderless flows. **Recommendation:** make `nin_verification_id` required for institution-created registrations so the contract matches the figma flow. |

## 13. Enter Candidate NIN modal (`Container (1).jpg` / `Container (2).jpg`)

Form fields: Name, Email Address (with note "must be the candidate's
unique email"), NIN, Subject Combinations dropdown. CTA: Verify NIN.

| Need | Status | Endpoint / gap |
|---|---|---|
| Verify NIN | 🟢 | `POST /identity/nin/verify` |
| Capture name/email/subject during verification | 🔴 | Today `POST /identity/nin/verify` only accepts `{ nin, idempotency_key }`. The screen captures candidate name, email, and `subject_combination_id`. **Gap:** extend the verify body with an `intake_payload` object and persist on the verification row (see `010-nin-pending-flow.md`). |
| Validate that email is unique across candidates | 🔴 | No uniqueness check on candidate email today. **Gap:** before verifying, check `users` and `jupeb_nin_verifications.intake_payload->>'email'` for clashes; return `422 candidate_email_in_use` to drive the red helper text. |
| Subject combination dropdown source | 🟢 | `GET /jupeb/catalog/subject-combinations/public` |
| **NIN provider unavailable** | 🔴 | Documented in `010-nin-pending-flow.md`. |

## 14. NIN Details screen (`NIN Details screen.jpg`)

This is the **landing screen after verification succeeds**, before
"Generate Code". Headline reads "Verification successful — Details
retrieved" with full NIMC profile (name, candidate provisional code,
combination, gender, DOB, address, state of origin, LGA, place of
birth, phone, email, next of kin).

| Need | Status | Endpoint / gap |
|---|---|---|
| Read verification record + profile | 🟢 | `GET /identity/nin/verifications/:verificationId` |
| `response_payload` carrying the full NIMC fields | 🟡 | Today's adapter only stores `first_name/last_name/middle_name/date_of_birth/gender` (see `verifyWithMock`). NIMC actually returns address, LGA, state of origin, phone, photo, etc. **Gap:** extend the contract + the mock to include these fields (and decide which are PII-sensitive enough to redact). |
| Provisional candidate code at this stage | 🟡 | The screen shows `001/0001` **before** Generate Code is clicked. That suggests the UI mock is showing a preview. The real backend doesn't allocate a `provisional_candidate_code` until the registration row is inserted. **Mismatch / Gap:** either (a) UI removes the code from this screen, or (b) backend adds `GET /registration/institution/numbering-preview-row?session_id&university_id` that returns the next provisional serial without consuming it. We'd need to be careful with concurrency — make it advisory only. |
| Generate Code CTA → returns the code | 🟢 | `POST /registration/institution/registrations` |

## 15. Candidate Management (`Candidates.jpg`)

Table: candidate id, name, email, subject combination, biometric
status (Yes/No), status (Approved/Pending/Rejected). Above: search,
filters, batch actions, export. Tabs: All / Approved / Pending /
Rejected. KPI cards: Total Registered (2,318 +6.08%), Institutions
(3,671 -0.03%), Current Candidate With Biometrics (48 -0.03%). Bar
chart: top 12 institutions by registered candidate count.

| Need | Status | Endpoint / gap |
|---|---|---|
| List candidates with pagination + filters | 🟡 | `GET /registration/institution/registrations` exists. **Gap:** the list response does not embed candidate name, email, or biometric_status. Today it returns raw registration rows. The UI must do N+1 fetches per row to resolve names. **Fix:** the model returns plain rows; we need a service-level join + a derived `biometric_status` boolean. |
| Search by candidate name / email / candidate id | 🔴 | No search query parameter. **Gap:** add `q` param doing case-insensitive match on name/email/candidate_id. |
| Filter tabs (Approved / Pending / Rejected) | 🟢 | `status` query param exists. "Pending" likely maps to a set of statuses (`pending_documents` ∪ `pending_institution_review` ∪ `pending_student_confirm`). **Gap:** API does not expose a `pending` group filter. Either add a `bucket=approved|pending|rejected` query param that maps server-side, or document the set on the UI. |
| Export | 🔴 | No export endpoint. **Gap:** `GET /registration/institution/registrations/export?format=csv` returning a streamed CSV with respect to RBAC. |
| Batch actions | 🔴 | No batch endpoint. **Gap:** `POST /registration/institution/registrations/batch` with `{ ids: [...], action: 'approve'|'reject', reason? }`. Reuse the per-row guards. |
| KPI: Total registered | 🟡 | Achievable via `countInstitution`, but no scoped global counter is exposed. **Gap:** `GET /registration/institution/stats?university_id=…&session_id=…` returning `{ total, approved, pending, rejected, with_biometrics }` plus a delta against previous period (the `+6.08%` is delta vs last period — the API needs to support comparison windows). |
| KPI: Institutions count | 🟡 | Today this would come from `GET /jupeb/catalog/universities` (admin scope). The +/- delta is not modeled. |
| KPI: Current candidates with biometrics | 🔴 | No endpoint counts biometric coverage. **Gap:** include in the stats endpoint above. |
| Bar chart: top 12 institutions by registered candidate count | 🔴 | **Gap:** `GET /jupeb/overview/institutions/registrations-by-university?session_id=…&limit=12` (could live in the existing `008-overview-swagger`). |
| Per-row Edit / Delete actions | 🟡 | Edit subject is supported via PATCH. Delete is not — there is no `DELETE /institution/registrations/:id`. **Gap:** soft-withdraw via `POST .../withdraw` (the FSM already supports `withdrawn`). The trash icon should call this. |

## 16. Student Dashboard (`Home.jpg`)

UI: header with user avatar/name, candidate id and combination, summary
cards (Attendance %, Avg. Score %, Subjects count, Grade letter), today's
classes list with attendance buttons, weekly attendance chart, bottom
nav (Home / Courses / Result / Settings).

This is a **post-approval** academic dashboard, separate from
registration. The current API has only the bones for it.

| Need | Status | Endpoint / gap |
|---|---|---|
| Student profile header | 🟡 | `GET /registration/me/current` covers candidate id + combination but not the avatar. |
| Attendance % | 🔴 | No attendance schema or endpoint exists. **Gap (major):** new module `attendance` with `POST /attendance/me/mark`, `GET /attendance/me/summary`, `GET /attendance/courses/:id/today`. Plus weekly aggregate for the chart. |
| Avg. score % / Grade letter | 🟡 | The `academic` module has `GET /jupeb/academic/registrations/:id/score` but it's per-registration, not "current student". **Gap:** `GET /jupeb/academic/me/score` (resolve registration via `findLatestForUser`). |
| Subjects count (3) | 🟡 | Subjects come from the subject combination's components. Today `subject_combination` likely contains those — confirm `subjectCombinationModel`. **Gap:** expose subject list on `/registration/me/current`. |
| Today's classes (course code, status badge, time, "Mark Attendance" / "Preview" / "Class Ended") | 🔴 | No class scheduling schema. Course list exists (`/jupeb/academic/courses`) but no timetable, no class instance. **Gap (major):** new schema `jupeb_class_sessions (id, course_id, university_id, starts_at, ends_at, status)` + `GET /jupeb/academic/me/today-classes`. |
| Weekly attendance chart | 🔴 | Same as attendance gap. |
| Notification bell with red dot | 🟡 | `notifications` module exists. **Gap:** confirm `GET /notifications/me/unread-count` is exposed; if not, add it. |
| Hamburger nav | 🟢 | UI concern. |

## 17. Profile (`Profile.jpg`)

UI: user card (name, candidate id, combination, gender, email, phone,
"Biometric Authentication: Enabled"), document downloads (Registration
Form, WAEC Result, NECO Result with download icons, dated "Uploaded on
Mar 15, 2026").

| Need | Status | Endpoint / gap |
|---|---|---|
| Read-only profile card | 🟡 | Combination of `users.full_name`, `profiles.phone`, `jupeb_registrations.provisional_candidate_code`, `subject_combinations.title`. **Gap:** single endpoint as in §3 above. |
| "Biometric Authentication: Enabled" indicator | 🟡 | Boolean = `biometric_captures` count > 0 (or both face + fingerprint present). **Gap:** include `biometric_status` on the profile endpoint. |
| Download Registration Form (a generated PDF of the candidate's submission) | 🔴 | No PDF generator endpoint. **Gap:** `GET /registration/me/registration-form.pdf` produces a PDF of the candidate's snapshot at submission time. Stored to `files` for re-download. |
| Download WAEC / NECO results | 🟡 | These are documents already in `jupeb_registration_documents`. **Gap:** the UI needs a signed URL — confirm `files` module signs. The `Uploaded on …` date comes from `created_at` on `jupeb_registration_documents`. |

## Cross-cutting gaps

These are not screen-specific but block multiple flows.

1. **Composite read endpoints.** Several screens (NIN Details, Student
   Information preview, Profile, Submission preview) need a single
   call. The current API is normalised — the UI would need 4–6 calls
   per page. Add purpose-built read endpoints described above.

2. **Display strings on FK fields.** `subject_combination_id`,
   `university_id`, etc. are returned as bare UUIDs. Every figma
   screen renders display names. Consistently embed `*_display`
   sub-objects (`{ id, code, title }`) on read endpoints.

3. **Photo / biometric URLs.** The figma uses the candidate's face
   photo on at least 5 screens. There is no exposed URL for it.
   Resolve via signed URL helper in `files`.

4. **Soft-skip semantics for biometrics.** Today biometric is
   all-or-nothing. The figma "Skip" path has product implications
   (see §8) — needs schema + endpoint + UI lock.

5. **NIN-pending status.** Documented separately in
   `010-nin-pending-flow.md`. The whole institution flow (figma §12 →
   §13 → §14) hinges on this.

6. **Email uniqueness for candidates.** The figma's red helper text
   ("must be the candidate's unique email") implies the API enforces
   it. Today, no enforcement.

7. **Aggregations / KPIs / charts.** `Candidates.jpg` shows 5
   different aggregations. Build a small `overview` service to back
   them, gated by institution scope.

8. **Export + batch actions.** Both are non-trivial features the
   figma assumes exist.

9. **Attendance + class sessions** for `Home.jpg`. Largest missing
   subsystem.

10. **OCR / structured result entries.** The figma's submission
    preview shows parsed `(subject, grade)` rows. Today only the file
    is stored. Even with manual entry, we need a result-entries table.

## Suggested prioritisation

1. NIN-pending flow (§13–§14, blocks institution registration when
   NIMC is down).
2. Composite read endpoints (§3, §11, §17 — unblock the wizard UI).
3. Soft-skip biometric + replace flow (§8).
4. Sittings + result-types intake fields (§5).
5. Candidate list joins, search, KPIs (§15).
6. Export + batch actions (§15).
7. Attendance + class sessions (§16) — its own initiative.
8. PDF-of-registration-form generator (§17).
