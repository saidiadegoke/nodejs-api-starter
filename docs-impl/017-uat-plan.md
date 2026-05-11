---
name: UAT plan — student registration end-to-end
description: Manual run-book for registrar → institution → student flow including document upload, OCR auto-trigger, biometrics, submit, profile downloads, institution review, batch actions, and dashboard data.
type: project
---

# UAT plan — JUPEB student registration

This is a step-by-step User Acceptance Testing run-book for everything
shipped under `016-student-registration-end-to-end.md` (M.1 → M.13) plus
the `013` Initiative E follow-ups (candidate list joins, search, bucket
filter, stats, by-university chart, CSV export, batch actions, withdraw).

It is meant to be runnable by a tester without needing to read the
implementation. Each test case has: prerequisite, exact request,
expected response shape, and pass/fail criteria.

The "Personas" you'll switch between are:

- **Registrar (admin)** — `admin@example.com / Admin@12`
- **Institution staff** — same admin token works (admin role passes the
  `instReg` middleware); for stricter testing assign a real
  `registrar` / `program_director` / `institution_admin` role.
- **Student (new)** — created on the fly via `POST /auth/register-with-code`.
- **Student (existing demo)** — `demo.adebayo.salami@example.com / Student@12`
  (one of the 30 demo accounts seeded by `005_seed_jupeb_demo_data.sql`).

---

## 0. Environment setup

### 0.1 Install dependencies

```bash
cd reg-portal-api
npm install
```

This pulls in the new deps: `pdfkit`, `pdf-parse`, `pdfjs-dist`,
`tesseract.js`, `sharp`, `form-data`.

### 0.2 Configure `.env`

Required for UAT (matches `.env.example` — split DB params, not a single URL):

```bash
# App / server
PORT=5269
API_BASE_URL=http://localhost:5269

# Postgres
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=<your_db_password>
DB_NAME=reg_portal_db

# JWT
JWT_SECRET=<random 32+ chars>
JWT_REFRESH_SECRET=<random 32+ chars>

# Code TTL: leave 0 (no expiry) for the happy-path scenarios; flip to '1'
# (1 hour) when running the expired-code negative case.
JUPEB_INSTITUTION_CODE_TTL_HOURS=0

# OCR: enabled by default; turn off to verify the M.6 disable path
FEATURE_OCR_ENABLED=true
OCR_DEFAULT_CHAIN=pdf_text,tesseract

# Biometric quality threshold (0 disables the check; set to 0.6 for B.4)
JUPEB_FACE_MIN_QUALITY=0

# NIN provider — selects which adapter answers /identity/nin/verify.
# Registered: `mock` (in-process, default; deterministic per-NIN fixtures)
# and `speedysms` (calls https://api.speedysms.com.ng/identity/nin).
JUPEB_NIN_PROVIDER=mock
# Seconds the resolver waits before retrying when a provider reports
# unavailable. Applies to every provider; default 300.
# JUPEB_NIN_RETRY_AFTER_SECONDS=300

# Required only when JUPEB_NIN_PROVIDER=speedysms
# SPEEDYSMS_API_KEY=sk_live_your_key
# SPEEDYSMS_API_BASE_URL=https://api.speedysms.com.ng
# SPEEDYSMS_NIN_TIMEOUT_MS=15000
```

For convenience, define a shell alias so the SQL snippets in this doc
work against the split DB params:

```bash
alias uatpsql='PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"'
```

### 0.3 Migrate + seed

```bash
npm run migrate
npm run seed
```

This applies migrations `001..009` and seed files `001..005`. Migrations
`008_jupeb_nin_cache_cleared_at.sql` (NIN cache invalidation) and
`009_jupeb_registration_documents_multi_sitting.sql` (relaxes the active
document uniqueness to allow sitting=1 and sitting=2 to coexist) were
added with the NIN-flow + multi-sitting work. The demo seed
(`005_seed_jupeb_demo_data.sql`) creates:

- 2 sessions (`2024/2025` closed, `2025/2026` open)
- 12 universities (UNILAG, OAU, UI, FUTMINNA, FUTA, UNILORIN, OOU, CU,
  FUNAAB, ABU, UNN, UNIZIK)
- 4 subject combinations
- 30 demo students with full bio data + NoK + biometric markers

### 0.4 Start the server

```bash
npm run dev
```

The API listens on `http://localhost:5269` by default (per `PORT` in
`.env.example`). Throughout this doc the `$BASE` shell variable is used
so every command stays portable:

```bash
export BASE="http://localhost:${PORT:-5269}"
```

If you run on a different port, just `export BASE=http://localhost:<your-port>`
once at the top of the run.

### 0.5 Get an admin access token

```bash
ADMIN=$(curl -s -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin@example.com","password":"Admin@12"}' \
  | jq -r '.data.access_token')
echo $ADMIN
```

Keep `$ADMIN` set for the registrar / institution-side scenarios.

### 0.6 Smoke check

```bash
curl -s $BASE/health | jq
# → { "success": true, "message": "API is running", ... }

curl -s $BASE/ | jq '.endpoints'
# → confirm "ocr": "/ocr" is in the list
```

**Pass criteria for §0:** all four steps succeed, `npm install` exits 0,
migrations log "Successfully executed N migration(s)" or "No new
migrations to run", and `/health` returns 200.

---

## 1. Registrar — catalog setup (sanity)

### TC-1.1 — List the seeded universities

```bash
curl -s $BASE/catalog/universities/public | jq '.data | length'
# Expected: ≥ 12
```

**Pass:** at least the 12 demo universities are returned.

### TC-1.2 — Filter by `university_type`

```bash
curl -s "$BASE/catalog/universities/public?type=federal" | jq '.data | length'
# Expected: ≥ 9 (the federal subset of the demo seed)
```

### TC-1.3 — Public subject combinations list

```bash
curl -s $BASE/catalog/subject-combinations/public | jq '.data | length'
# Expected: ≥ 4
```

### TC-1.4 — Sessions

```bash
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/sessions?status=open&limit=10" | jq '.data | length'
# Expected: ≥ 1 (the 2025/2026 session)
```

**Pass criteria for §1:** all four lists return non-empty data.

---

## 2. Institution — generate a registration code via NIN verify

### TC-2.1 — Verify a candidate's NIN

```bash
NIN_VERIFY=$(curl -s -X POST $BASE/identity/nin/verify \
  -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{
    "nin":"12345678901",
    "idempotency_key":"uat-'"$(date +%s)"'",
    "intake_payload":{"name":"Adunni Yusuf","phone":"+2348011112222"}
  }')
echo $NIN_VERIFY | jq
NIN_ID=$(echo $NIN_VERIFY | jq -r '.data.verification_id')
```

**Expected:** `data.status === "verified"` (mock adapter, default
behavior). Body carries `data.profile.{first_name,last_name,date_of_birth,gender,address,state_of_origin,lga,place_of_birth,phone,next_of_kin}`.

**Pass:** `verified` status + a UUID `verification_id`.

### TC-2.2 — Create a registration linked to that NIN

Pick the open session and any active university:

```bash
SESSION_ID=$(curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/sessions?status=open&limit=1" \
  | jq -r '.data[0].id')

UNIVERSITY_ID=$(curl -s "$BASE/catalog/universities/public?limit=1" \
  | jq -r '.data[0].id')

COMBO_ID=$(curl -s "$BASE/catalog/subject-combinations/public?limit=1" \
  | jq -r '.data[0].id')

REG=$(curl -s -X POST $BASE/registration/institution/registrations \
  -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{
    "session_id":"'"$SESSION_ID"'",
    "university_id":"'"$UNIVERSITY_ID"'",
    "subject_combination_id":"'"$COMBO_ID"'",
    "nin_verification_id":"'"$NIN_ID"'"
  }')
echo $REG | jq
CODE=$(echo $REG | jq -r '.data.institution_issued_code')
REG_ID=$(echo $REG | jq -r '.data.id')
echo "code=$CODE  reg=$REG_ID"
```

**Expected:**
- `status === "code_issued"`
- `institution_issued_code` is **6 characters** (per F.1; configurable)
- `provisional_candidate_code` is 9 digits matching the regex
  `^[0-9]{2}[0-9]{3}[0-9]{4}$`

**Pass:** code length is 6, and the NIN write-through (M.12) has run —
verify by querying the `jupeb_next_of_kin` table:

```bash
uatpsql -c \
  "SELECT name, source FROM jupeb_next_of_kin WHERE registration_id = '$REG_ID' AND deleted_at IS NULL"
# Expected: 1 row, source='nin'
```

### TC-2.3 — Public code-status (figma `log in 11` pre-validation)

```bash
curl -s "$BASE/auth/code-status?code=$CODE" | jq
```

**Expected:** `data.valid === true`, `data.university.{id,name,short_name}` populated. **No `Authorization` header required.**

### TC-2.4 — Negative: unknown code

```bash
curl -s "$BASE/auth/code-status?code=ZZZZZZ" | jq '.data'
# Expected: { valid: false, error_code: "code_not_found" }
```

### TC-2.5 — Negative: missing code parameter

```bash
curl -s -i "$BASE/auth/code-status" | head -1
# Expected: HTTP/1.1 400
```

### TC-2.6 — NIN cache hit on a repeat verify

The NIN result is cached against `nin_hash` while the linked registration
is still in-flight. Re-running TC-2.1 with the **same NIN** must return
the **same `verification_id`** without calling the upstream provider.

```bash
# Re-verify the same NIN (note: omit idempotency_key to prove the cache
# layer — not the idempotency check — is what's reusing the row).
REPEAT=$(curl -s -X POST $BASE/identity/nin/verify \
  -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"nin":"12345678901"}')
echo $REPEAT | jq '.data | {verification_id, status}'

# Confirm the returned id is identical to the one minted in TC-2.1
test "$(echo $REPEAT | jq -r '.data.verification_id')" = "$NIN_ID" \
  && echo "✅ cache hit" || echo "❌ cache miss"
```

**Pass:** the second call returns `status: verified` AND the same
`verification_id` as TC-2.1. Inspect the DB to confirm only one row
exists for the NIN hash:

```bash
uatpsql -c "SELECT COUNT(*) FROM jupeb_nin_verifications
            WHERE nin_last4 = RIGHT('12345678901', 4) AND cleared_at IS NULL"
# Expected: 1
```

### TC-2.7 — Switch NIN provider via env

The registry resolves `JUPEB_NIN_PROVIDER` at request time. Two
providers ship: `mock` (default) and `speedysms`. The mock is sufficient
for UAT — this case just proves the switch is wired up.

```bash
# Stop the server. In .env, change:
#   JUPEB_NIN_PROVIDER=speedysms
#   SPEEDYSMS_API_KEY=<your sandbox key>
# Then restart and verify a fresh NIN:
SS_NIN=$(printf '9%010d\n' $(($(date +%s) % 10000000000)))
SS=$(curl -s -X POST $BASE/identity/nin/verify \
  -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"nin":"'"$SS_NIN"'","idempotency_key":"uat-ss-'"$(date +%s)"'"}')
echo $SS | jq '.data | {status, verification_id}'

uatpsql -c "SELECT provider FROM jupeb_nin_verifications
            WHERE id = '$(echo $SS | jq -r '.data.verification_id')'"
# Expected: provider = 'speedysms'
```

**Pass:** the audit row's `provider` column is `speedysms`. Without a
live key, expect `status: pending` with `last_error_code` indicating
provider_unavailable / provider_misconfigured — also a valid outcome
proving the switch worked. Reset `JUPEB_NIN_PROVIDER=mock` before
continuing the rest of the run-book.

**Pass criteria for §2:** TC-2.1 returns verified, TC-2.2 returns a 6-char
code AND a NoK row appears in the table, TC-2.3/2.4/2.5 each match the
expected error codes, TC-2.6 reuses the cached row (same id, no second
DB row), TC-2.7 routes through the selected provider.

---

## 3. Student — single-shot signup with code (M.3 / M.9)

### TC-3.1 — Register with code

```bash
RWC=$(curl -s -X POST $BASE/auth/register-with-code \
  -H 'Content-Type: application/json' \
  -d '{
    "code":"'"$CODE"'",
    "password":"Strong@Password1",
    "email":"uat-student-'"$(date +%s)"'@example.com",
    "first_name":"Adunni",
    "last_name":"Yusuf"
  }')
echo $RWC | jq
STUDENT=$(echo $RWC | jq -r '.data.access_token')
```

**Expected:**
- `status` 201
- `data.access_token` and `data.refresh_token` present
- `data.registration.status === "claimed"`
- `data.registration.claimed_at` populated

### TC-3.2 — Same code now reports claimed

```bash
curl -s "$BASE/auth/code-status?code=$CODE" | jq '.data'
# Expected: { valid: false, error_code: "code_already_claimed" }
```

### TC-3.3 — Negative: weak password

```bash
curl -s -i -X POST $BASE/auth/register-with-code \
  -H 'Content-Type: application/json' \
  -d '{"code":"BOGUS1","password":"short"}' | head -1
# Expected: HTTP/1.1 422
```

### TC-3.4 — Negative: expired code

```bash
# Re-issue a fresh code, then expire it via direct SQL
# (or set JUPEB_INSTITUTION_CODE_TTL_HOURS to '1' BEFORE creating the
#  registration, then wait 1 hour — the SQL approach is faster)
uatpsql -c \
  "UPDATE jupeb_registrations
     SET institution_code_expires_at = NOW() - INTERVAL '1 minute'
   WHERE id = '<some_unclaimed_registration_id>'"

curl -s -i -X POST $BASE/auth/register-with-code \
  -H 'Content-Type: application/json' \
  -d '{"code":"<that-code>","password":"Strong@Password1"}' \
  | head -1
# Expected: HTTP/1.1 410

# Body should include details.error_code === 'code_expired' and details.expires_at
```

**Pass criteria for §3:** TC-3.1 returns a tokenized session, TC-3.2 flips
the code-status to claimed, TC-3.3 returns 422, TC-3.4 returns 410 with
structured `error_code: code_expired`.

---

## 4. Student — view validated profile (figma `log in 12`)

### TC-4.1 — Composite profile

```bash
curl -s -H "Authorization: Bearer $STUDENT" \
  $BASE/registration/me/profile | jq
```

**Expected response shape (key fields):**

```jsonc
{
  "data": {
    "candidate": { "id": "...", "full_name": "Adunni Yusuf", "provisional_candidate_code": "..." },
    "basic_information": {
      "date_of_birth": "1999-01-01",
      "gender": "male",
      "residential_address": "123 Main Street, Lagos, Nigeria",
      "state_of_origin": "Ondo State",
      "lga": "Ondo West",
      "place_of_birth": "Lagos State"
    },
    "contact_information": { "email": "...", "phone": "+2348011112222" },
    "next_of_kin": { "name": "Jane Yusuf", "relationship": "...", "phone": "...", "source": "nin" },
    "subject_combination": { "id": "...", "code": "...", "title": "..." },
    "university": { "id": "...", "name": "...", "short_name": "..." },
    "session": { "id": "...", "academic_year": "2025/2026" },
    "nin_verification": { "id": "...", "status": "verified" }
  }
}
```

**Pass:** all five sections (`candidate`, `basic_information`,
`contact_information`, `next_of_kin`, `subject_combination` /
`university` / `session`) are populated. NoK `source` is `nin` because
of the M.12 write-through.

---

## 5. Student — bio data update (M.2, figma `log in 13`)

### TC-5.1 — Patch editable fields

```bash
curl -s -X PATCH $BASE/registration/me/profile \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{
    "residential_address":"22 Allen Avenue, Ikeja, Lagos",
    "state_of_origin":"Lagos",
    "lga":"Ikeja",
    "place_of_birth":"Lagos",
    "phone":"+2348022223333"
  }' | jq '.data.basic_information'
```

**Expected:** the response carries the new values, AND a follow-up `GET
/registration/me/profile` reflects them.

### TC-5.2 — Negative: NIN-immutable fields rejected

The `nin_verification` payload sets a particular `gender`. Try to
overwrite it:

```bash
ON_FILE_GENDER=$(curl -s -H "Authorization: Bearer $STUDENT" \
  $BASE/registration/me/profile \
  | jq -r '.data.basic_information.gender')

OPPOSITE=$([ "$ON_FILE_GENDER" = "male" ] && echo "female" || echo "male")

curl -s -i -X PATCH $BASE/registration/me/profile \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{"gender":"'"$OPPOSITE"'"}' | head -1
# Expected: HTTP/1.1 422
```

The body carries `details.errors[]` with one entry `{ field: "gender",
error_code: "nin_field_immutable" }`.

### TC-5.3 — Negative: invalid email

```bash
curl -s -X PATCH $BASE/registration/me/profile \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{"email":"not-an-email"}' | jq '.details.errors'
# Expected: array containing { field: "email", error_code: "invalid_email" }
```

**Pass criteria for §5:** TC-5.1 persists, TC-5.2 returns 422 with
`nin_field_immutable`, TC-5.3 returns 422 with `invalid_email`.

---

## 6. Student — Next of kin (M.1)

### TC-6.1 — GET when none exists (only if NIN write-through didn't seed it)

If TC-4.1 already showed a NoK from NIN, skip — the row exists. Otherwise:

```bash
curl -s -H "Authorization: Bearer $STUDENT" \
  $BASE/registration/me/next-of-kin | jq
# 200 with row, OR 404 with message "No next-of-kin recorded yet"
```

### TC-6.2 — Replace NoK (PUT)

```bash
curl -s -X PUT $BASE/registration/me/next-of-kin \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Bola Yusuf",
    "relationship":"mother",
    "phone":"+2348033334444",
    "address":"22 Allen Avenue, Ikeja, Lagos"
  }' | jq '.data | {name, relationship, source}'
# Expected: { "name": "Bola Yusuf", "relationship": "mother", "source": "student" }
```

### TC-6.3 — History shows the prior soft-deleted row

```bash
curl -s -H "Authorization: Bearer $STUDENT" \
  $BASE/registration/me/next-of-kin/history \
  | jq '.data.history | length, .data.history[].deleted_at'
# Expected: count ≥ 2; at least one row has a non-null deleted_at
```

### TC-6.4 — Negative: invalid relationship

```bash
curl -s -i -X PUT $BASE/registration/me/next-of-kin \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{"name":"X","relationship":"pet","phone":"+1"}' | head -1
# Expected: HTTP/1.1 422
```

**Pass criteria for §6:** TC-6.2 returns `source: "student"`, TC-6.3
shows soft-deleted history, TC-6.4 returns 422.

---

## 7. Student — academic intake + document upload (M.4 + M.5 + M.6)

### TC-7.1 — Patch sittings + result types

```bash
curl -s -X PATCH $BASE/registration/me/academic-intake \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{"sittings_count":2,"result_types":["waec","neco"]}' | jq '.data | {sittings_count, result_types}'
# Expected: { "sittings_count": 2, "result_types": ["waec","neco"] }
```

### TC-7.2 — Confirm canonical requirements are seeded (M.5)

```bash
curl -s -H "Authorization: Bearer $STUDENT" \
  $BASE/submission/me/requirements \
  | jq '.data[] | .key' | sort
# Expected (at minimum): "neco_result", "waec_result", "signed_registration_form"
```

### TC-7.3 — Upload a fake WAEC result PDF

```bash
# Create a tiny stub PDF
echo '%PDF-1.4 fake' > /tmp/waec.pdf
WAEC_FILE=$(curl -s -X POST $BASE/files/upload-base64 \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{
    "file_data":"data:application/pdf;base64,'"$(base64 < /tmp/waec.pdf | tr -d '\n')"'",
    "context":"submission_uat",
    "file_name":"waec.pdf"
  }' | jq -r '.data.file_id // .data.id')

WAEC_REQ=$(curl -s -H "Authorization: Bearer $STUDENT" \
  $BASE/submission/me/requirements \
  | jq -r '.data[] | select(.key=="waec_result") | .id')

ATTACH=$(curl -s -X POST $BASE/submission/me/documents \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{
    "requirement_id":"'"$WAEC_REQ"'",
    "file_id":"'"$WAEC_FILE"'",
    "source":"waec",
    "sitting":1
  }')
echo $ATTACH | jq
DOC_ID=$(echo $ATTACH | jq -r '.data.id')
JOB_ID=$(echo $ATTACH | jq -r '.data.ocr_job.id')
```

**Expected:**
- `status` 201
- `data.source === "waec"`, `data.sitting === 1`
- `data.ocr_job.id` is a UUID, `data.ocr_job.status === "queued"` (or
  `"processing"`/`"completed"` if the worker has run by then)

### TC-7.4 — Negative: missing source/sitting on a result requirement

```bash
curl -s -i -X POST $BASE/submission/me/documents \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{"requirement_id":"'"$WAEC_REQ"'","file_id":"'"$WAEC_FILE"'"}' \
  | head -1
# Expected: HTTP/1.1 422

# Body details.errors[] should include error_code=sitting_required (and possibly source_required)
```

### TC-7.5 — Negative: duplicate (source, sitting)

```bash
# Attempt the same source+sitting again with a different file
WAEC_FILE2=$(curl -s -X POST $BASE/files/upload-base64 \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{"file_data":"data:application/pdf;base64,JVBERi0xLjQK","file_name":"waec2.pdf"}' \
  | jq -r '.data.file_id // .data.id')

curl -s -i -X POST $BASE/submission/me/documents \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{
    "requirement_id":"'"$WAEC_REQ"'",
    "file_id":"'"$WAEC_FILE2"'",
    "source":"waec",
    "sitting":1
  }' | head -1
# Expected: HTTP/1.1 409
# Body details.error_code === 'duplicate_source_sitting',
# details.existing_document_id === DOC_ID
```

### TC-7.6 — OCR job is reachable

```bash
curl -s -H "Authorization: Bearer $STUDENT" \
  "$BASE/ocr/jobs/$JOB_ID" | jq '.data | {status, exam_type, exam_type_detected, confidence}'
# Expected: status ∈ {queued, processing, completed, failed}
# (failed is OK — the stub PDF has no text. We're verifying the row was created.)
```

### TC-7.7 — Disable feature flag (M.6 negative)

```bash
# Stop the server, set FEATURE_OCR_ENABLED=false, restart, then:
curl -s -X POST $BASE/submission/me/documents \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{
    "requirement_id":"'"$WAEC_REQ"'",
    "file_id":"<other-fresh-file-id>",
    "source":"neco",
    "sitting":2
  }' | jq '.data | has("ocr_job")'
# Expected: false
# Restore FEATURE_OCR_ENABLED=true after.
```

**Pass criteria for §7:** TC-7.1 persists intake fields, TC-7.2 lists the
seeded requirements, TC-7.3 returns 201 + `ocr_job` object, TC-7.4
returns 422 with `sitting_required`, TC-7.5 returns 409 with
`duplicate_source_sitting`, TC-7.6 returns a job row, TC-7.7 omits
`ocr_job` when the flag is off.

---

## 8. Student — manual result entries (M.7 + M.8c)

### TC-8.1 — Bulk upsert grades manually

```bash
curl -s -X POST $BASE/submission/me/result-entries \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{
    "entries":[
      {"source":"waec","sitting":1,"serial":0,"subject":"English Language","grade":"B3"},
      {"source":"waec","sitting":1,"serial":1,"subject":"Mathematics","grade":"A1"},
      {"source":"waec","sitting":1,"serial":2,"subject":"Physics","grade":"C5","score":65}
    ]
  }' | jq '.data | {upserted_count, sample: .entries[0]}'
```

**Expected:**
- `upserted_count: 3`
- Each entry has `grade_normalized`: B3→B, A1→A, C5→C
- `origin: "manual"`

### TC-8.2 — Negative: invalid payload

```bash
curl -s -i -X POST $BASE/submission/me/result-entries \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{"entries":[{"source":"pet","sitting":7,"serial":0,"subject":"","grade":"XYZ","score":200}]}' \
  | head -1
# Expected: HTTP/1.1 422
# Body details.errors[] contains source_invalid, sitting_invalid, subject_required, grade_invalid, score_invalid
```

### TC-8.3 — Result entries appear on submission preview (M.8d)

```bash
curl -s -H "Authorization: Bearer $STUDENT" \
  $BASE/registration/me/submission-preview \
  | jq '.data.academic_details'
```

**Expected:** array of `{ source, sitting, origins, subjects: [{subject, grade, grade_normalized, score, origin}, ...] }` containing the WAEC sitting-1 group.

**Pass criteria for §8:** TC-8.1 normalizes the 3 grades, TC-8.2 returns
422 with all 5 error codes, TC-8.3 carries the rows on the preview.

---

## 9. Student — biometric capture (existing + B.4)

### TC-9.1 — Capture face biometric

```bash
# We use external_reference instead of file_id so we don't need a real file
curl -s -X POST $BASE/identity/biometrics \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{
    "registration_id":"'"$REG_ID"'",
    "capture_type":"face",
    "external_reference":"uat://face/'"$(date +%s)"'",
    "quality_score":0.85,
    "captured_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
    "device_metadata":{"device":"uat-script"}
  }' | jq '.data | {capture_type, quality_score}'
# Expected: { "capture_type": "face", "quality_score": 0.85 }
```

### TC-9.2 — Server-side quality threshold (B.4)

```bash
# Stop server, set JUPEB_FACE_MIN_QUALITY=0.6, restart, then:
curl -s -i -X POST $BASE/identity/biometrics \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{
    "registration_id":"'"$REG_ID"'",
    "capture_type":"face",
    "external_reference":"uat://low-q/'"$(date +%s)"'",
    "quality_score":0.4,
    "captured_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
  }' | head -1
# Expected: HTTP/1.1 422
# Body details.error_code === 'quality_too_low',
# details.minimum === 0.6, details.quality_score === 0.4
# Restore JUPEB_FACE_MIN_QUALITY=0 after.
```

### TC-9.3 — Skip fingerprint (existing B.2)

```bash
curl -s -X POST "$BASE/identity/registrations/$REG_ID/biometrics/skip" \
  -H "Authorization: Bearer $STUDENT" \
  -H 'Content-Type: application/json' \
  -d '{"capture_type":"fingerprint"}' | jq
# Expected: 200; subsequent /identity/biometrics with capture_type=fingerprint from
# this student returns 403 self_service_locked.
```

**Pass criteria for §9:** TC-9.1 succeeds, TC-9.2 returns 422 with
`quality_too_low`, TC-9.3 marks the skip and locks self-service.

---

## 10. Student — final preview + submit + downloads (M.10 + M.11)

### TC-10.1 — Submit the registration

The registration must transition through `pending_documents` and have
its mandatory requirements met. For UAT shortcut, you can ALSO move it
manually:

```bash
uatpsql -c \
  "UPDATE jupeb_registrations
     SET status='pending_institution_review', submitted_at=NOW()
   WHERE id='$REG_ID'"
```

(Or follow the natural flow: upload `signed_registration_form`, then
`POST /registration/me/submit`.)

### TC-10.2 — Download registration form PDF (M.10)

```bash
curl -s -o /tmp/reg-form.pdf -D - \
  -H "Authorization: Bearer $STUDENT" \
  $BASE/registration/me/registration-form.pdf | head -5

file /tmp/reg-form.pdf
# Expected: "PDF document, version 1.x"

# First 4 bytes:
head -c 4 /tmp/reg-form.pdf
# Expected: %PDF
```

**Expected response headers:**

```
Content-Type: application/pdf
Content-Disposition: inline; filename="registration-form-...pdf"
Content-Length: <some integer >500>
```

### TC-10.3 — Negative: PDF when not ready

Roll the registration back to `claimed`:

```bash
uatpsql -c "UPDATE jupeb_registrations SET status='claimed' WHERE id='$REG_ID'"

curl -s -i -H "Authorization: Bearer $STUDENT" \
  $BASE/registration/me/registration-form.pdf | head -1
# Expected: HTTP/1.1 422
# Body details.error_code === 'not_ready', details.current_status === 'claimed'

# Restore status:
uatpsql -c \
  "UPDATE jupeb_registrations SET status='pending_institution_review' WHERE id='$REG_ID'"
```

### TC-10.4 — Per-document signed download URL (M.11)

```bash
curl -s -H "Authorization: Bearer $STUDENT" \
  "$BASE/submission/me/documents/$DOC_ID/download-url" | jq '.data | {url: (.url | length > 0), expires_at}'
# Expected: { "url": true, "expires_at": "<~5 minutes from now>" }
```

### TC-10.5 — Negative: another student cannot download

```bash
# Spin up a second student under a different code (skip if no second code handy):
curl -s -i \
  -H "Authorization: Bearer $OTHER_STUDENT" \
  "$BASE/submission/me/documents/$DOC_ID/download-url" | head -1
# Expected: HTTP/1.1 403
```

**Pass criteria for §10:** TC-10.2 starts with `%PDF`, TC-10.3 returns
422 with `not_ready`, TC-10.4 returns a URL with a future
`expires_at`, TC-10.5 returns 403.

---

## 11. Institution — review the candidate (existing + M.13)

### TC-11.1 — List all candidates with enriched joins (E.1)

```bash
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/registration/institution/registrations?limit=20" \
  | jq '.data[0] | {candidate, university, biometric_status, status}'
```

**Expected:** each row includes `candidate.{id,name,email,candidate_id}`,
`university.{id,name,short_name}`, and `biometric_status` ∈
`{yes, partial, no}`.

### TC-11.2 — Search by name (E.2)

```bash
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/registration/institution/registrations?q=adunni&limit=5" \
  | jq '.data | length'
# Expected: ≥ 1 (the test student we just registered)
```

### TC-11.3 — Bucket filter (E.3)

```bash
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/registration/institution/registrations?bucket=pending&limit=20" \
  | jq '.data | map(.status) | unique'
# Expected: subset of [code_issued, claimed, pending_student_confirm, pending_documents, pending_institution_review]
```

### TC-11.4 — KPI stats (E.4)

```bash
curl -s -H "Authorization: Bearer $ADMIN" \
  $BASE/registration/institution/overview/stats | jq
# Expected: { total, approved, pending, rejected, with_biometrics } — all integers
```

### TC-11.5 — Top-12 institutions chart (E.5)

```bash
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/registration/institution/overview/by-university?limit=12" \
  | jq 'length, .[0]'
# Expected: array length ≤ 12; each row { university_id, university_name, short_name, registered_count }
```

### TC-11.6 — CSV export (E.6)

```bash
curl -s -D - -o /tmp/candidates.csv \
  -H "Authorization: Bearer $ADMIN" \
  "$BASE/registration/institution/registrations/export" | head -10
head -3 /tmp/candidates.csv
```

**Expected:**
- Headers: `Content-Type: text/csv; charset=utf-8`,
  `Content-Disposition: attachment; filename="candidates-YYYY-MM-DD.csv"`
- First line of body matches:
  `candidate_id,name,email,university,subject_combination,sittings_count,status,biometric_status,institution_issued_code,jupeb_candidate_number,provisional_candidate_code,created_at,submitted_at,approved_at`

### TC-11.7 — OCR review for a registration (M.13)

```bash
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/submission/institution/registrations/$REG_ID/result-entries" \
  | jq '.data.groups[] | {source, sitting, origins: (.subjects | map(.origin) | unique)}'
# Expected: at least one group with origins containing "manual" (from §8.1)
```

### TC-11.8 — Override an entry (M.13)

```bash
ENTRY_ID=$(curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/submission/institution/registrations/$REG_ID/result-entries" \
  | jq -r '.data.groups[0].subjects[0].id')

curl -s -X PATCH "$BASE/submission/institution/result-entries/$ENTRY_ID" \
  -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"grade":"A1"}' | jq '.data | {grade, grade_normalized, origin}'
# Expected: { "grade": "A1", "grade_normalized": "A", "origin": "manual" }
```

**Pass criteria for §11:** TC-11.1 returns enriched rows, TC-11.2/11.3
filters work, TC-11.4 returns 5 integers, TC-11.5 returns up to 12 rows
with counts, TC-11.6 returns valid CSV, TC-11.7/11.8 list and override
entries.

---

## 12. Institution — approve / reject / withdraw (E.7 + E.8)

### TC-12.1 — Single-row approve (existing)

```bash
curl -s -X POST "$BASE/registration/institution/registrations/$REG_ID/approve" \
  -H "Authorization: Bearer $ADMIN" | jq '.data | {status, approved_at, approved_by}'
# Expected: status === "approved", approved_at + approved_by populated
```

### TC-12.1a — Approval clears the cached NIN profile (PII purge)

The NIN cache is "live" while the linked registration is in-flight and
must be purged the moment the registration reaches a terminal status
(approved / rejected / withdrawn). Confirm by reading the
verification row directly:

```bash
uatpsql -c "SELECT status, cleared_at, response_payload = '{}'::jsonb AS payload_purged
              FROM jupeb_nin_verifications WHERE id = '$NIN_ID'"
# Expected: status='verified', cleared_at IS NOT NULL, payload_purged = true
```

A subsequent verify of the same NIN must now MISS the cache and create
a fresh row (different `verification_id`):

```bash
FRESH=$(curl -s -X POST $BASE/identity/nin/verify \
  -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"nin":"12345678901"}' | jq -r '.data.verification_id')
test "$FRESH" != "$NIN_ID" && echo "✅ cache cleared" || echo "❌ stale cache"
```

**Pass:** `cleared_at` is non-null, `response_payload` equals `{}`, and
the post-approval verify returns a brand-new `verification_id`.

### TC-12.2 — Single-row withdraw (E.8)

Pre-condition: pick a `pending_*` registration via `?bucket=pending`.

```bash
PENDING_ID=$(curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/registration/institution/registrations?bucket=pending&limit=1" \
  | jq -r '.data[0].id')

curl -s -X POST "$BASE/registration/institution/registrations/$PENDING_ID/withdraw" \
  -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"reason":"Candidate requested withdrawal"}' | jq '.data | {status, status_reason}'
# Expected: { "status": "withdrawn", "status_reason": "Candidate requested withdrawal" }
```

### TC-12.3 — Withdraw on terminal state returns 422

```bash
curl -s -i -X POST "$BASE/registration/institution/registrations/$REG_ID/withdraw" \
  -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"reason":"again"}' | head -1
# Expected: HTTP/1.1 422 (REG_ID is now approved → cannot withdraw)
```

### TC-12.4 — Batch reject with reason (E.7)

```bash
# Pick 3 pending ids
IDS=$(curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/registration/institution/registrations?bucket=pending&limit=3" \
  | jq -r '[.data[].id]')

curl -s -X POST $BASE/registration/institution/registrations/batch \
  -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"ids":'"$IDS"',"action":"reject","reason":"Incomplete docs (UAT batch)"}' \
  | jq '.data | {accepted_count: (.accepted | length), rejected_count: (.rejected | length), action}'
```

**Expected:** `accepted_count + rejected_count === 3`, `action ===
"reject"`, every accepted row's status is now `rejected`.

### TC-12.5 — Batch with invalid action

```bash
curl -s -i -X POST $BASE/registration/institution/registrations/batch \
  -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"ids":["00000000-0000-1000-8000-000000000000"],"action":"archive"}' | head -1
# Expected: HTTP/1.1 422
```

### TC-12.6 — Batch reject without reason

```bash
curl -s -i -X POST $BASE/registration/institution/registrations/batch \
  -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"ids":["00000000-0000-1000-8000-000000000000"],"action":"reject"}' | head -1
# Expected: HTTP/1.1 422
```

**Pass criteria for §12:** TC-12.1 returns approved, TC-12.2 returns
withdrawn, TC-12.3 returns 422, TC-12.4 returns paired
accepted/rejected arrays summing to 3, TC-12.5/12.6 return 422.

---

## 13. Demo data sanity (using the `005_seed_jupeb_demo_data.sql` payload)

### TC-13.1 — Log in as a demo student

```bash
DEMO=$(curl -s -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"demo.adebayo.salami@example.com","password":"Student@12"}' \
  | jq -r '.data.access_token')

curl -s -H "Authorization: Bearer $DEMO" \
  $BASE/registration/me/profile | jq '.data | {candidate, university, basic_information}'
```

**Expected:** the candidate is John... err, **Adebayo Salami**, with
`provisional_candidate_code` `261010001` (or similar — `yearShort + uniPrefix + serial`), `basic_information` populated, `university` set.

### TC-13.2 — Demo data shows up on the dashboard

```bash
curl -s -H "Authorization: Bearer $ADMIN" \
  $BASE/registration/institution/overview/stats \
  | jq '.data'
# Expected after a fresh seed: total ≥ 30; approved ~17; rejected ~4; pending ~9; with_biometrics ~12.
```

### TC-13.3 — Demo data drives the bar chart

```bash
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/registration/institution/overview/by-university?limit=12" \
  | jq 'sort_by(-.registered_count) | .[0:5]'
```

**Expected:** the top universities (UNILAG, OAU, ABU, UNN, …) appear with
non-zero counts.

**Pass criteria for §13:** TC-13.1 returns full bio data, TC-13.2 stats
match the seed shape (`total ≥ 30`), TC-13.3 returns ranked counts.

---

## 14. Notifications (013 §I.1)

### TC-14.1 — Unread count

```bash
curl -s -H "Authorization: Bearer $STUDENT" \
  $BASE/notifications/unread-count | jq
# Expected: { success: true, data: { count: <int> } }
```

---

## 15. Negative auth + RBAC sweep

### TC-15.1 — Unauthenticated calls return 401

```bash
for ep in \
  /registration/me/profile \
  /registration/me/next-of-kin \
  /submission/me/result-entries \
  /registration/me/registration-form.pdf \
  /registration/institution/registrations \
  /registration/institution/overview/stats; do
  echo -n "$ep → "
  curl -s -o /dev/null -w '%{http_code}\n' $BASE$ep
done
# Expected: every line returns 401
```

### TC-15.2 — Student token cannot call institution endpoints (strict mode)

Set `JUPEB_STUDENT_ROUTES_STRICT=true` and restart, then:

```bash
curl -s -i -H "Authorization: Bearer $DEMO" \
  $BASE/registration/institution/registrations | head -1
# Expected: HTTP/1.1 403
```

(Without strict mode, admins-and-students share access — by design,
documented in `jupeb-student.middleware.js`.)

---

## 16. Test matrix at a glance

| # | Module | Endpoint(s) | Personas | Expected outcome |
|---|---|---|---|---|
| §1 | Catalog | `/catalog/*/public`, `/sessions` | Registrar | Seeded data visible |
| §2 | Identity + Registration | `/identity/nin/verify`, `/registration/institution/registrations`, `/auth/code-status` | Registrar | NIN verified + 6-char code issued + NoK seeded via M.12; cache hit on repeat verify; provider switchable via `JUPEB_NIN_PROVIDER` |
| §3 | Auth | `/auth/register-with-code` | New student | Single-shot signup; tokens; claimed status |
| §4 | Registration | `/registration/me/profile` | Student | Composite profile populated |
| §5 | Registration | `PATCH /me/profile` | Student | Editable fields persist; NIN-immutable rejected |
| §6 | Registration | `/registration/me/next-of-kin` | Student | CRUD + history |
| §7 | Submission + OCR | `/submission/me/documents` | Student | Upload + auto-OCR; duplicate guard |
| §8 | Submission | `/submission/me/result-entries` | Student | Bulk upsert + grade normalization |
| §9 | Identity | `/identity/biometrics` + skip | Student | Quality threshold + skip lock |
| §10 | Registration | `/me/registration-form.pdf`, `/me/documents/:id/download-url` | Student | PDF stream + 5-min URL |
| §11 | Registration + Submission | `/institution/registrations`, `/overview/*`, `/institution/result-entries/*` | Registrar | Joins, search, bucket, stats, chart, CSV, OCR review/override |
| §12 | Registration | `/institution/registrations/{batch,:id/{approve,reject,withdraw}}` | Registrar | Single + batch state changes; terminal status purges cached NIN profile |
| §13 | Demo | (above) | All | Seed dataset is queryable |
| §14 | Notifications | `/notifications/unread-count` | Any auth user | Count returned |
| §15 | RBAC | many | Anonymous + Student | 401 / 403 enforcement |

## 17. Sign-off checklist

- [ ] §0 environment up; migrations + seeds run
- [ ] §1 catalog smoke
- [ ] §2 NIN verify + code generate (6 chars) + cache hit on repeat + provider switch
- [ ] §3 register-with-code happy + 3 negatives
- [ ] §4 composite profile populated
- [ ] §5 PATCH happy + 2 negatives
- [ ] §6 NoK CRUD + history + 1 negative
- [ ] §7 doc upload + OCR auto-trigger + 4 negatives
- [ ] §8 manual entries + 1 negative
- [ ] §9 biometrics + B.4 + skip
- [ ] §10 PDF + per-doc URL + 2 negatives
- [ ] §11 institution list / stats / chart / export / OCR review
- [ ] §12 single + batch approve/reject/withdraw + 3 negatives + cache cleared on approval
- [ ] §13 demo data smoke
- [ ] §14 notifications unread-count
- [ ] §15 401 + 403 sweep

When every box is checked, the registration end-to-end can be
considered ready for stakeholder demo.

## Appendix A — common diagnostic queries

```sql
-- Latest registration by user email
SELECT r.id, r.status, r.institution_issued_code, r.created_at
  FROM jupeb_registrations r
  JOIN users u ON u.id = r.user_id
 WHERE u.email = 'uat-student-...@example.com'
 ORDER BY r.created_at DESC LIMIT 1;

-- OCR jobs for a registration
SELECT j.id, j.status, j.exam_type, j.metadata
  FROM ocr_jobs j
 WHERE j.metadata->>'registration_id' = '<reg-id>'
 ORDER BY j.created_at DESC;

-- Result entries for a registration
SELECT source, sitting, serial, subject, grade, grade_normalized, origin
  FROM jupeb_result_entries
 WHERE registration_id = '<reg-id>'
 ORDER BY source, sitting, serial;

-- Biometric capture progress
SELECT capture_type, quality_score, captured_at
  FROM jupeb_biometric_captures
 WHERE registration_id = '<reg-id>';

-- NoK history
SELECT source, name, relationship, created_at, deleted_at
  FROM jupeb_next_of_kin
 WHERE registration_id = '<reg-id>'
 ORDER BY created_at DESC;

-- NIN cache state for a registration (response_payload is the cached
-- profile, cleared_at marks PII purge after the registration terminates)
SELECT v.id, v.status, v.provider, v.cleared_at,
       v.response_payload = '{}'::jsonb AS payload_purged
  FROM jupeb_nin_verifications v
  JOIN jupeb_registrations r ON r.nin_verification_id = v.id
 WHERE r.id = '<reg-id>';

-- Which provider answered a given verification
SELECT id, provider, status, provider_reference, verified_at, cleared_at
  FROM jupeb_nin_verifications
 WHERE id = '<verification-id>';
```

## Appendix B — quick reset between runs

To wipe just the UAT-created data without touching the demo seed:

```sql
DELETE FROM users WHERE email LIKE 'uat-student-%@example.com';
DELETE FROM jupeb_registrations
 WHERE institution_issued_code NOT LIKE 'DEMO%'
   AND created_at >= NOW() - INTERVAL '1 day';
```

To wipe everything (use with caution):

```bash
# Drop and re-create the test database, then:
npm run migrate
npm run seed
```
