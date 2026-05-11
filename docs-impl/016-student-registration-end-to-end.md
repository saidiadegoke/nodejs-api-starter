---
name: Student registration end-to-end
description: Complete-journey audit of figma student-registration flow vs current API. Identifies remaining gaps after 013 + how OCR integrates. Pairs with 016-student-registration-task-list.md.
type: project
---

# Student registration — end-to-end audit (post-OCR)

This doc closes the question: **"do we have all endpoints to handle a
complete student registration, from code entry through bio data, contact,
NoK, institution + result upload, biometrics, all the way to submit?"**

It re-walks the full journey as a single narrative (not per-screen),
marks every step with current API status, then names the still-missing
pieces — including new OCR-integration work that post-dates `013`.

For per-screen detail, see:
- `011-figma-vs-api-gap-analysis.md` — original per-screen audit
- `013-figma-gap-task-list.md` — original TDD task list (some items
  shipped, others outstanding — see "Status of 013 tasks" below)
- `015-ocr-technical-design.md` — OCR module design (pdf-parse +
  tesseract.js, free)

## Legend
- ✓ Done — endpoint live, schema in place, smoke-tested.
- ⚠ Partial — endpoint exists but missing fields, role scope, or hooks
  needed by the figma flow.
- ✗ Missing — no endpoint / schema / wiring at all.

## Status of `013` tasks (today)

| 013 task | What it added | Today |
|---|---|---|
| A.1 NIN payload extras | `state_of_origin`, `lga`, `place_of_birth`, `next_of_kin`, `photo_url` on NIN response | ⚠ Mock adapter populates these; **no schema** for them on `users` / `profiles` / `jupeb_registrations`, so a student that *edits* them in the wizard has nowhere to persist. |
| A.2 `GET /registration/me/profile` | Composite profile read | ✓ |
| A.3 `GET /registration/me/submission-preview` | Final-review composite | ✓ (route registered) |
| A.4 Embed FK display names | `subject_combination`, `university`, `session` sub-objects | ✓ |
| A.5 Signed photo URL | `GET /identity/registrations/:id/photo` | ✓ |
| B.1 Biometric skip cols | `fingerprint_skipped_at`, `face_skipped_at` | ✓ |
| B.2 `POST /…/biometrics/skip` | | ✓ |
| C.1 Intake schema | `sittings_count`, `result_types`, `university_type` | ✓ (sittings + result_types; university_type unverified) |
| C.2 `PATCH /me/academic-intake` | | ✓ |
| D.1/D.2 `jupeb_result_entries` | per-subject grade rows | ✗ — **table does not exist**, no endpoint |
| F.1 Short institution code | 6-char human code | ✗ — still 16-hex |
| F.2 `GET /me/code-status` | Pre-validate code | ✓ |
| F.3 Structured 410 on expired claim | | ⚠ — message generic |
| F.4 `POST /auth/register-with-code` | Single-shot signup | ✗ |
| G.1 Immutable NIN-derived fields on `PUT /users/me` | | ✗ |
| H.1 Registration form PDF | | ✗ |
| E.6 Candidate export CSV | | ✗ |

**Bottom line:** A lot of the wizard *reads* are wired, but several
*writes* aren't, and the **end-to-end flow won't run today** because of
gaps below.

## Complete student journey (as the figma intends)

### Step 1 — Entry: existing student or new student
**Figma:** `log in 10` (login) + `log in 11` (6-cell code entry)

| Need | Status | Endpoint |
|---|---|---|
| Returning student login | ✓ | `POST /auth/login` |
| Forgot password | ✓ | `POST /auth/forgot-password` |
| New student lands on code-entry | ✗ | The figma's "Click here to get started" implies a public path. Today claim-code requires a logged-in user. |
| Validate code without claiming | ✓ | `GET /registration/me/code-status` (auth required — should be public for the wizard) |
| Single-shot register-with-code | ✗ | `POST /auth/register-with-code` not implemented (013 §F.4). |
| 6-cell short code | ✗ | Codes are 16-char hex; figma input is 6 cells (013 §F.1). |

**End-to-end blocker:** without `register-with-code`, a brand-new
candidate cannot start the wizard from screen 11 — they must first
register a generic account, then claim. Mismatch with figma.

### Step 2 — Information validated (NIM-pulled bio data)
**Figma:** `log in 12` ("Your information has been validated!")

| Need | Status | Endpoint |
|---|---|---|
| Pre-fill candidate from NIN | ⚠ | NIN payload structure now carries `state_of_origin`, `lga`, `place_of_birth`, `phone`, `next_of_kin` (013 §A.1). But these are stored *only* in `nin_verifications.response_payload` JSONB. There is no normalized place to *persist* student edits. |
| Read composite profile | ✓ | `GET /registration/me/profile` |
| Subject combination display | ✓ | embedded by 013 §A.4 |

### Step 3 — Bio Data Update (student edits)
**Figma:** `log in 13` ("Bio Data Update")

Fields the student can change: full name (greyed), email (greyed),
residential address, phone, password, DOB (greyed), gender (greyed).

| Field | Storage today | Status |
|---|---|---|
| Full name, DOB, gender | `users` / `profiles` (immutable on figma, sourced from NIN) | ⚠ — `PUT /users/me` will *let* a student overwrite these (no NIN-immutability guard). 013 §G.1 still open. |
| Email | `users.email` | ✓ — `PUT /users/me` updates it |
| Residential address | ✗ | No column on `profiles` / `jupeb_registrations`. Currently lives in `nin.response_payload.address`, which is a *NIM-issued* address — figma needs the student's editable address separately. |
| Phone | `users.phone` | ⚠ — no `PUT /users/me` field for phone today |
| Password | `users.password_hash` | ✓ — `POST /auth/change-password` |

**End-to-end blocker:** there is no place to write the student's chosen
**residential address** or **phone** that figma expects them to enter.

### Step 4 — Contact information / Next of Kin
**Figma:** `log in 12`, `log in 18`, `NIN Details screen`

| Need | Status |
|---|---|
| NoK name + relationship + contact | ✗ — only stored in `nin.response_payload.next_of_kin` JSONB. No schema. No write path for the student to add or correct it. |

**End-to-end blocker:** this is a hard miss. Figma pre-fills from NIM
but figma also implies the student verifies/edits it. We have neither
the storage nor the endpoint.

### Step 5 — Document upload (institution + sittings + results)
**Figma:** `log in 14`, `log in 15`

| Need | Status |
|---|---|
| Institution dropdown | ✓ — `GET /catalog/universities/public` (greyed in figma; pre-bound from registrar code) |
| Institution type filter (Federal / State / Private) | ⚠ — needs `university_type` filter on the public list (013 §C.3) |
| Number of sittings | ✓ — `sittings_count` column (013 §C.1) + `PATCH /me/academic-intake` (013 §C.2) |
| Result types selector (WAEC, NECO, …) | ✓ — `result_types` JSONB (013 §C.1) |
| Per-result file upload | ✓ — `POST /files/upload` + `POST /submission/me/documents` |
| Per-result metadata (which sitting, which exam body) | ✗ — `jupeb_registration_documents` has no `source` (`waec`/`neco`) or `sitting` columns. Cannot tell two WAEC uploads apart. |
| **OCR auto-trigger after upload** | ✗ — OCR module (`/ocr/jobs`) exists but `submission` does not call it on upload. |
| **OCR auto-bind to registration + requirement** | ⚠ — `POST /ocr/jobs/:id/bind-requirement` exists, but is not called automatically. |
| Persisted parsed grades | ✗ — no `jupeb_result_entries` table (013 §D.1, never built). |
| Seeded WAEC / NECO requirements | ✗ — `jupeb_document_requirements` is empty in fresh DBs (013 §C.4). Wizard step 5 cannot show "1. WAEC / 2. NECO" upload tiles. |

**End-to-end blocker:** without seeded requirements, no upload tile is
shown. Without `(source, sitting)` metadata, the same student uploading
WAEC + NECO produces ambiguous rows. Without OCR auto-trigger and
`jupeb_result_entries`, the figma's final-preview "subject + grade"
table at `log in 18` cannot be populated automatically.

### Step 6 — Confirm subject combinations
**Figma:** `Frame 2147225316`

| Need | Status |
|---|---|
| Confirm | ✓ — `POST /registration/me/confirm-subjects` |

### Step 7 — Biometrics: fingerprint + face
**Figma:** `log in 17`, `log in 26`, `Frame 2147225317`, `Frame 2147225318`

| Need | Status |
|---|---|
| Capture fingerprint (file) | ✓ — `POST /identity/biometrics` |
| Capture face (file) | ✓ — same endpoint, `capture_type=face` |
| Skip with continue-later semantics | ✓ — `POST /identity/registrations/:id/biometrics/skip` (013 §B.2) |
| "Mobile device with fingerprint reader" path | n/a — handled client-side; the API just receives the captured file. ✓ |
| Server-side quality threshold | ⚠ — 013 §B.4 not done; low-quality face captures aren't rejected. |
| Replace-in-place | ⚠ — 013 §B.3 not done; the unique `(registration_id, capture_type)` index forces delete-then-create. |

### Step 8 — Final preview + submit
**Figma:** `log in 18` ("Student Information — Preview your details below")

| Need | Status |
|---|---|
| Composite preview read | ✓ — `GET /registration/me/submission-preview` (013 §A.3) |
| Per-result subject + grade table | ⚠ — depends on OCR result entries (Step 5 gap) |
| Biometric thumbnails | ✓ — face thumbnail via `GET /identity/registrations/:id/photo`; fingerprint icon-only is fine without API |
| Submit | ✓ — `POST /registration/me/submit` |

### Step 9 — Profile (post-submit "View / Download")
**Figma:** `Profile.jpg`

| Need | Status |
|---|---|
| Profile composite read | ✓ — `GET /registration/me/profile` |
| Biometric authentication enabled flag | ✓ — derivable; may need explicit field |
| Download "Registration Form" PDF | ✗ — 013 §H.1 not done |
| Download individual results (WAEC, NECO) | ⚠ — file ids are exposed, but no per-document signed-URL endpoint scoped to "this student's documents". `GET /files/:id` exists but ownership rules are loose. |

## OCR integration (new since `013`)

The OCR module ships pdf-parse + tesseract.js (free, no third-party
billing). To unlock the figma's final-preview grade table without
manual data entry, we need the **submission → OCR → result_entries**
flow to be wired:

```
student POSTs WAEC PDF
    │
    ▼
POST /submission/me/documents       (creates jupeb_registration_documents row)
    │
    ▼  ── auto ──
POST /ocr/jobs                      (file_id, exam_type='auto', metadata={ requirement_id, registration_id })
    │
    ▼  ── worker completes ──
ocr.job.completed event
    │
    ▼  ── auto bind ──
POST /ocr/jobs/:id/bind-requirement
    │
    ▼  ── new step ──
upsert jupeb_result_entries from OCR result_json.subjects
    │
    ▼
GET /registration/me/submission-preview now returns parsed rows
```

Each arrow that says "auto" is a missing hook today.

## Registrar / institution side (Candidates.jpg)

This page is largely covered by 013 Initiative E (E.1–E.8). All of E
is still outstanding. Key gaps relevant to *enabling student
registration* (not just candidate browsing):

| Need | Status |
|---|---|
| Generate Code modal — "Register New Candidate" → "Generate Code" | ✓ — `POST /institution/registrations` |
| Enter NIN form → verify → preview → Generate Code | ✓ — `POST /identity/nin/verify` then `POST /institution/registrations` with `nin_verification_id` |
| "Total Registered / Institutions / Current Candidate With Biometrics" KPIs | ⚠ — `GET /dashboard/stat-cards` exists; verify it includes `with_biometrics` count (013 §E.4) |
| Top-12 institutions bar chart | ✗ — 013 §E.5 |
| All / Approved / Pending / Rejected tabs + bucket filter | ⚠ — `GET /institution/registrations` accepts `status`; no `bucket=pending` union (013 §E.3) |
| Candidate-list export | ✗ — 013 §E.6 |

## Summary of remaining gaps (in priority order)

These are **the remaining must-do items** to actually run the figma's
end-to-end student registration without manual workarounds. Each
references the new task IDs in
`016-student-registration-task-list.md`, plus existing 013 IDs where
they apply.

### Must-have (the wizard literally won't run without these)

1. **Persistent address + phone + NoK schema** — new tables /
   columns. (Task M.1, M.2)
2. **`POST /auth/register-with-code`** — single-shot signup using the
   institution code. (013 §F.4 / Task M.3)
3. **Document `source` + `sitting`** on `jupeb_registration_documents`.
   (Task M.4)
4. **Seed canonical document requirements** (WAEC, NECO, JAMB,
   signed registration form). (013 §C.4 / Task M.5)
5. **Submission → OCR auto-trigger + auto-bind** — wire the hook
   described above. (Task M.6)
6. **`jupeb_result_entries` table + endpoint + OCR write-through**.
   (013 §D.1, §D.2 / Task M.7, M.8)
7. **Editable address / phone path** — extend `PUT /users/me` /
   create `PATCH /registration/me/profile`. (Task M.2)
8. **NoK CRUD** — `GET / POST / PUT /registration/me/next-of-kin`.
   (Task M.1)

### Should-have (figma works but degrades without these)

9. **Public `GET /auth/code-status`** (no auth) so the wizard can
   pre-validate at screen 11. (Task M.9)
10. **Short 6-char institution codes**. (013 §F.1)
11. **Immutable NIN-derived fields** on `PUT /users/me`. (013 §G.1)
12. **Biometric quality threshold + replace-in-place**. (013 §B.3,
    §B.4)
13. **Registration form PDF**. (013 §H.1 / Task M.10)
14. **Per-document download URL endpoint** scoped to the candidate.
    (Task M.11)

### Nice-to-have (polish, registrar UX)

15. Candidate-list KPIs / bar chart / bucket filter / export / batch
    actions. (013 §E.1–E.8)
16. NoK + address pulled from NIN automatically into the new tables on
    NIN verify. (Task M.12)
17. Registrar UI to review OCR-extracted grades vs student's manual
    entry, with a "use OCR" / "keep manual" choice. (Task M.13)

## Out of scope for this initiative

- Attendance, classes, in-session dashboards (figma `Home.jpg` —
  separate initiative, see 013 Initiative J).
- WAEC / NECO upstream verification (separate module — distinct from
  OCR; we OCR the *certificate*, we don't talk to the boards).
- WhatsApp / SMS notification channels.

## Acceptance criteria

The end-to-end flow is "complete" when:

1. A brand-new candidate can:
   - Land on the portal with only the 6-char code from their Program
     Director.
   - Enter the code → set password → log in.
   - See their NIM-validated bio data + NoK pre-filled.
   - Edit their residential address and phone.
   - Confirm their subject combination.
   - Upload WAEC + NECO PDFs and see the parsed subjects + grades on
     the final preview without any manual entry.
   - Capture face + fingerprint on a phone (or skip).
   - Submit and see status `pending_institution_review`.
   - Download a PDF of their completed registration form from the
     Profile screen.
2. The institution registrar can:
   - Generate a fresh code from a NIN-verified candidate.
   - Browse the candidate list and see biometric-completion status.
   - Approve / reject submissions.
   - Override OCR-parsed grades when the student disputes them.

The task list at `016-student-registration-task-list.md` enumerates
the work in TDD order, sequenced so each milestone is shippable.
