# OCR Module Technical Design

## Purpose

`ocr` extracts structured data from uploaded examination result documents
(WAEC, NECO, NABTEB, GCE — and a generic catch-all) supplied as **PDF** or
**image** (`png`, `jpg`, `jpeg`, `webp`, `tiff`).

It returns a normalized JSON payload (candidate identity, exam metadata, and
per-subject grades) plus a confidence score and the raw OCR text.

Consumers:
- `submission` module — auto-fill candidate result subjects from an uploaded
  WAEC/NECO/GCE document attached to a `jupeb_document_requirements` entry.
- `academic` module — pre-populate `jupeb_registration_results` for review.
- Registrar/admin verification flows — surface OCR vs. self-reported diffs.

## Boundaries

- In scope:
  - Document ingestion (multipart upload, base64, or existing `file_id`)
  - OCR provider abstraction (cloud + on-prem fallback)
  - Result parsing & normalization for WAEC / NECO / NABTEB / GCE
  - Async job lifecycle, retries, and status polling
  - Persisting raw extraction + normalized result for audit
- Out of scope:
  - Validating that the result is genuine (no anti-fraud / signature checks)
  - Cross-referencing with examination boards (`waec-verify`, `neco-verify`)
    is a separate, future module
  - Decision-making (accept / reject) — caller (registrar UI / submission
    review) owns that

## High-level Flow

```
client ──► POST /ocr/jobs (file | file_id | base64)
            │
            ▼
   ┌──────────────────────┐    enqueue
   │ ocr.controller       │ ──────────────► job queue (in-process worker)
   │ ocr.service.create() │
   └──────────────────────┘
            │
            ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ ocr.worker                                                  │
   │   1. fetch file from S3 (via files.service)                 │
   │   2. provider.extractText(file)        ◄── AWS Textract /   │
   │   3. parser.parse(text, exam_type)         Google DocAI /   │
   │   4. persist ocr_jobs row + ocr_results    Tesseract / Mock │
   │   5. emit websocket event 'ocr.job.completed'               │
   └──────────────────────────────────────────────────────────────┘
            │
            ▼
   GET /ocr/jobs/:jobId  ──► { status, result_json, confidence, raw_text }
```

Synchronous mode (`?wait=true`, capped at 30s) is offered for small images
where the caller wants a single round-trip. Internally still goes through the
same worker pipeline, just with an awaited promise.

## Database Tables

### `ocr_jobs`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `file_id` | UUID | FK -> `files.id`, NOT NULL | Source document |
| `exam_type` | VARCHAR(20) | NOT NULL | `waec`, `neco`, `nabteb`, `gce`, `auto`, `generic` |
| `provider` | VARCHAR(40) | NOT NULL | `pdf_text`, `tesseract`, `ocr_space`, `aws_textract`, `google_doc_ai`, `mock` |
| `status` | VARCHAR(20) | NOT NULL default `queued` | `queued`, `processing`, `completed`, `failed` |
| `attempt_count` | INTEGER | NOT NULL default `0` | |
| `max_attempts` | INTEGER | NOT NULL default `3` | |
| `error_code` | VARCHAR(60) | NULL | Stable error key (`PROVIDER_TIMEOUT`, `UNREADABLE`, ...) |
| `error_message` | TEXT | NULL | |
| `requested_by` | UUID | FK -> `users.id`, NOT NULL | |
| `requested_for` | UUID | FK -> `users.id`, NULL | When admin runs OCR on behalf of a student |
| `context` | VARCHAR(40) | NULL | Free-form caller context, e.g. `submission`, `registrar_review` |
| `metadata` | JSONB | NOT NULL default `{}` | Caller hints (`registration_id`, `requirement_id`) |
| `started_at` | TIMESTAMPTZ | NULL | |
| `completed_at` | TIMESTAMPTZ | NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL default `now()` | |

Indexes:
- `idx_ocr_jobs_status_created_at`
- `idx_ocr_jobs_file_id`
- `idx_ocr_jobs_requested_by`

### `ocr_results`

One row per **completed** OCR job. Failed jobs do not produce a row.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `job_id` | UUID | FK -> `ocr_jobs.id`, UNIQUE, NOT NULL | One result per job |
| `exam_type_detected` | VARCHAR(20) | NOT NULL | Final classification (may differ from request when `auto`) |
| `confidence` | NUMERIC(5,2) | NOT NULL | Overall `0.00`–`100.00` |
| `result_json` | JSONB | NOT NULL | Normalized result, schema below |
| `raw_text` | TEXT | NOT NULL | Full OCR text (for audit / re-parsing) |
| `provider_payload` | JSONB | NOT NULL default `{}` | Provider-native response (Textract blocks etc.) |
| `page_count` | INTEGER | NOT NULL default `1` | |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` | |

Indexes:
- `idx_ocr_results_job_id` (covered by UNIQUE)
- `idx_ocr_results_exam_type_detected`

Retention: `provider_payload` and `raw_text` may be purged after 90 days by a
scheduled job; `result_json` is kept for the lifetime of the linked
registration so candidate diffs remain auditable.

## Normalized `result_json` Schema

```jsonc
{
  "exam_type": "waec",                  // waec | neco | nabteb | gce | generic
  "exam_body": "WEST AFRICAN EXAMINATIONS COUNCIL",
  "exam_year": 2023,
  "exam_diet": "May/June",              // May/June | November/December | Private | null
  "candidate": {
    "name": "ADEGOKE RASHEED OLUWASEUN",
    "exam_number": "4250101234",
    "centre_number": "4250101",
    "centre_name": "GOVERNMENT COLLEGE IBADAN",
    "date_of_birth": "2002-07-15"       // ISO 8601 or null
  },
  "subjects": [
    {
      "name": "ENGLISH LANGUAGE",
      "code": "001",                    // null when not present on certificate
      "grade": "B3",                    // exactly as printed on the certificate
      "grade_normalized": "B",          // A..F collapse for academic scoring
      "score": null                     // numeric score when present (NECO, GCE)
    },
    {
      "name": "MATHEMATICS",
      "code": "002",
      "grade": "A1",
      "grade_normalized": "A",
      "score": null
    }
  ],
  "summary": {
    "subject_count": 9,
    "credits": 8,                       // grades A1..C6 for WAEC; A..C for GCE
    "passes": 9
  },
  "confidence": 92.4,                   // duplicate of ocr_results.confidence
  "warnings": [
    "low_confidence_field:candidate.date_of_birth"
  ]
}
```

### Grade normalization

The primary `grade` field carries the certificate notation **as printed**:

- **WAEC / NECO / NABTEB / WAEC-GCE (O-Level):** `A1`, `B2`, `B3`, `C4`,
  `C5`, `C6`, `D7`, `E8`, `F9`.
- **GCE A-Level (Cambridge / WAEC-A):** `A`, `B`, `C`, `D`, `E`, `U`.

A second field `grade_normalized` collapses the grade to **A–F** so
downstream `academic` scoring (the `+1` / `0` rule in
`007-jupeb-academic-technical-design.md`) is provider-agnostic.

| Exam | `grade` (printed) | `grade_normalized` |
|---|---|---|
| WAEC / NECO / NABTEB | `A1` | `A` |
| WAEC / NECO / NABTEB | `B2`, `B3` | `B` |
| WAEC / NECO / NABTEB | `C4`, `C5`, `C6` | `C` |
| WAEC / NECO / NABTEB | `D7` | `D` |
| WAEC / NECO / NABTEB | `E8` | `E` |
| WAEC / NECO / NABTEB | `F9` | `F` |
| GCE A-Level | `A` … `E` | as-is |
| GCE A-Level | `U` | `F` |

Unknown grades surface as `grade_normalized: null` with a `warnings` entry
`unknown_grade:<subject>:<raw>`. `grade` is always populated when a token
was extracted from the line — even when it can't be normalized.

## Provider Abstraction

The default production stack is **fully free** — no third-party billing, no
GPU. Quality is good enough for typed PDFs (perfect, via `pdf-parse`) and
acceptable for scanned/photographed images (via `tesseract.js`); a paid
upgrade path exists for institutions that need higher accuracy on
hand-photographed certificates.

```
src/modules/ocr/providers/
  base.provider.js           // interface: extractText(buffer, mime_type)
  pdf-text.provider.js       // pdf-parse — extracts embedded text layer (free, instant)
  tesseract.provider.js      // tesseract.js — in-process raster OCR (free, no GPU)
  ocr-space.provider.js      // ocr.space cloud OCR (free tier: 25k/month)
  aws-textract.provider.js   // optional paid upgrade: AnalyzeDocument w/ TABLES + FORMS
  google-doc-ai.provider.js  // optional paid upgrade: Document AI form parser
  mock.provider.js           // tests only — never selected at runtime
```

### Default extraction chain

The service runs providers as a **chain**, not a single call. Each step
short-circuits on success:

```
1. PDF input?
     └── pdf-text.provider     (pdf-parse)
           ├── text layer found  → return text, confidence ≈ 100
           └── no text layer     → rasterize page → step 2

2. Image input (or rasterized PDF page)
     └── tesseract.provider    (tesseract.js)
           ├── confidence ≥ OCR_CONFIDENCE_FLOOR (default 60) → return
           └── below floor                                    → step 3 (optional)

3. (Optional) OCR_FALLBACK_PROVIDER set?
     └── ocr-space.provider | aws-textract | google-doc-ai
```

PDF rasterization uses `pdfjs-dist` (pure JS, no native deps) at 200 DPI per
page, so PDFs flow into the same image OCR path as photographs.

### Configuration

```
# Required (free, default)
OCR_DEFAULT_CHAIN=pdf-text,tesseract
OCR_CONFIDENCE_FLOOR=60
OCR_PROVIDER_TIMEOUT_MS=25000
OCR_MAX_FILE_SIZE_MB=15
OCR_TESSERACT_LANGS=eng                     # add 'eng+fra' if francophone GCE needed
OCR_TESSERACT_WORKER_COUNT=2

# Optional cloud fallback (free tier: 25k/month with API key)
# OCR_FALLBACK_PROVIDER=ocr_space
# OCR_SPACE_API_KEY=...
# OCR_SPACE_ENGINE=2                        # engine 2 handles tables better

# Optional paid upgrades (NOT enabled by default)
# OCR_FALLBACK_PROVIDER=aws_textract
# OCR_AWS_TEXTRACT_REGION=eu-west-1
# OCR_FALLBACK_PROVIDER=google_doc_ai
# OCR_GOOGLE_PROJECT_ID=...
```

Each provider returns:
```js
{ text: string, pages: number, providerPayload: object, providerConfidence: number }
```

The `parser` (per `exam_type`) is independent of the provider — it operates on
plain text (+ optional structured tables) and produces `result_json`. This
means switching from `tesseract` to `aws_textract` later is purely an env
change; no parser rewrite.

### Cost / quality summary

| Provider | Cost | Use case |
|---|---|---|
| `pdf-text` | Free | Typed PDFs (board portals, official downloads) — ~100% accuracy when text layer exists |
| `tesseract` | Free, in-process | Default for images and scanned PDFs — ~70–85% on clean scans |
| `ocr_space` | Free up to 25k/month | Recommended free fallback for low-confidence Tesseract results |
| `aws_textract` | ~$1.50/1k pages | Paid upgrade — best for messy phone photos and table extraction |
| `google_doc_ai` | ~$1.50/1k pages | Paid upgrade — alternative to Textract |
| `mock` | n/a | **Tests only.** Never selectable at runtime; guarded by `NODE_ENV==='test'`. |

## Parsers

`src/modules/ocr/parsers/`
- `waec.parser.js` — anchors: "WEST AFRICAN EXAMINATIONS COUNCIL", "EXAM. NO.",
  "CENTRE NO.", subject-grade table parsing.
- `neco.parser.js` — anchors: "NATIONAL EXAMINATIONS COUNCIL", "REG. NO.",
  per-subject score columns.
- `nabteb.parser.js`
- `gce.parser.js` — handles both WAEC GCE and Cambridge GCE A-level layouts.
- `generic.parser.js` — best-effort regex on `Subject — Grade` patterns;
  returns `exam_type: "generic"` and a low confidence floor.

Detection (`exam_type=auto`): the controller runs a lightweight classifier
over the first 500 chars of OCR text (header keyword match) before dispatching
to a parser.

## API Endpoints

Base path: `/ocr`

All endpoints require `BearerAuth`. RBAC:
- `ocr.create` — students (own files), staff
- `ocr.read` — owner of the source file, or staff
- `ocr.read.any` — admin / registrar
- `ocr.requirement.bind` — staff (associate result with a submission requirement)

### Create job

`POST /ocr/jobs`

Multipart **or** JSON. Exactly one of `file`, `file_id`, or `data` must be
supplied.

```jsonc
// JSON variant
{
  "file_id": "8a7e...-uuid",            // existing files.id
  "exam_type": "auto",                  // optional, default "auto"
  "wait": false,                        // optional, sync mode (≤30s)
  "context": "submission",              // optional caller tag
  "metadata": {
    "registration_id": "...",
    "requirement_id": "..."
  }
}
```

Response `202 Accepted` (async) or `200 OK` (sync, when `wait=true` and the
job completes in time):

```jsonc
{
  "job_id": "f0c1...-uuid",
  "status": "queued",                   // or "completed" in sync mode
  "result": null                        // populated in sync mode
}
```

### Get job

`GET /ocr/jobs/:jobId`

```jsonc
{
  "job_id": "...",
  "file_id": "...",
  "exam_type": "waec",
  "provider": "aws_textract",
  "status": "completed",
  "attempt_count": 1,
  "started_at": "2026-05-09T14:01:22Z",
  "completed_at": "2026-05-09T14:01:38Z",
  "result": { /* normalized result_json, only when status=completed */ },
  "raw_text_excerpt": "WEST AFRICAN EXAMINATIONS COUNCIL ...",
  "error": null
}
```

### List jobs

`GET /ocr/jobs?status=&exam_type=&file_id=&page=&limit=`

Owner-scoped by default; staff with `ocr.read.any` see everything.

### Re-run

`POST /ocr/jobs/:jobId/retry`

Allowed when `status` is `failed`. Creates a **new** job row referencing the
same `file_id`, with `metadata.retry_of = <jobId>` for traceability.

### Direct fetch by file

`GET /ocr/files/:fileId/latest`

Convenience: returns the most recent `completed` job's result for a file, or
`404` if none exists. Useful for the registrar UI which already holds a
`file_id`.

### Bind result to submission requirement

`POST /ocr/jobs/:jobId/bind-requirement`

```jsonc
{
  "registration_id": "...",
  "requirement_id": "..."
}
```

Records the linkage on `ocr_jobs.metadata` and emits an event the
`submission` / `academic` modules can subscribe to (auto-prefill grades).
Authorization: requester must own the registration **or** have
`ocr.requirement.bind`.

## Validation

`src/shared/validations/` adds an `ocr.validation.js`:
- `file_id` must exist and be owned by the requester (or requester has
  `ocr.read.any`).
- File MIME must be in `allowed_mime_types`:
  `application/pdf`, `image/png`, `image/jpeg`, `image/webp`, `image/tiff`.
- File size ≤ `OCR_MAX_FILE_SIZE_MB` (default 15MB).
- `exam_type` ∈ {`auto`,`waec`,`neco`,`nabteb`,`gce`,`generic`}.
- `metadata.registration_id` / `metadata.requirement_id`, if supplied, must
  exist and the requester must have access.

## Errors

Stable `error_code` values returned in the response body and persisted to
`ocr_jobs.error_code`:

| Code | HTTP | Meaning |
|---|---|---|
| `OCR_FILE_NOT_FOUND` | 404 | `file_id` unknown / not accessible |
| `OCR_UNSUPPORTED_MIME` | 415 | MIME outside the allow-list |
| `OCR_FILE_TOO_LARGE` | 413 | Exceeds `OCR_MAX_FILE_SIZE_MB` |
| `OCR_PROVIDER_TIMEOUT` | 504 | Provider exceeded `OCR_PROVIDER_TIMEOUT_MS` |
| `OCR_PROVIDER_FAILED` | 502 | Non-recoverable provider error |
| `OCR_UNREADABLE` | 422 | Provider returned no usable text after retries |
| `OCR_PARSER_FAILED` | 422 | Text extracted but parser couldn't structure it |
| `OCR_LOW_CONFIDENCE` | 200 (warning) | Job completes but `confidence < 60`; flagged in `warnings` |
| `OCR_NOT_OWNER` | 403 | Caller does not own the file and lacks staff RBAC |

## Async / Worker

For Phase 1, the worker is in-process (`setImmediate` queue) inside the API
container — sufficient for the expected volume (single-document
registrations). The service is structured so the queue can be swapped to BullMQ
or SQS without changing the controller surface.

WebSocket events (consumed by registrar/student dashboards):
- `ocr.job.created`
- `ocr.job.completed`  → payload: `{ job_id, file_id, exam_type_detected, confidence }`
- `ocr.job.failed`     → payload: `{ job_id, file_id, error_code }`

## Security & Privacy

- Result documents contain PII (DOB, candidate names, exam numbers). The
  `raw_text` column is encrypted at rest via the same column-encryption
  helper used by `jupeb_nin_verifications.response_payload`.
- `provider_payload` is restricted to `ocr.read.any`; standard `ocr.read`
  responses redact it.
- All OCR job creation is logged via the existing `audit_logs` table:
  `actor_id`, `action=ocr.job.create`, `target_type=files`, `target_id=file_id`.
- Outbound provider calls are subject to per-provider egress allow-lists.

## File Layout

```
src/modules/ocr/
  controllers/
    ocr.controller.js
  services/
    ocr.service.js          // create/get/list/retry/bind
    ocr.worker.js           // queue runner
    ocr.events.service.js   // websocket emitters
  providers/
    base.provider.js
    pdf-text.provider.js        // pdf-parse — default, free
    tesseract.provider.js       // tesseract.js — default, free
    ocr-space.provider.js       // optional free-tier cloud fallback
    aws-textract.provider.js    // optional paid upgrade
    google-doc-ai.provider.js   // optional paid upgrade
    mock.provider.js            // tests only (NODE_ENV=test)
  pipelines/
    extraction.pipeline.js      // chains providers per OCR_DEFAULT_CHAIN
    pdf-rasterizer.js           // pdfjs-dist → png buffers
  parsers/
    waec.parser.js
    neco.parser.js
    nabteb.parser.js
    gce.parser.js
    generic.parser.js
    grade-normalizer.js
  models/
    ocr-job.model.js
    ocr-result.model.js
  utils/
    classify-exam-type.js
    text-cleanup.js
  routes.js
```

## Testing Plan

Test files (mirroring `src/tests/jupeb.*.test.js`):
- `src/tests/ocr.parsers.waec.test.js` — fixture-driven unit tests
  (`tests/fixtures/ocr/waec/*.txt` with expected JSON pairs)
- `src/tests/ocr.parsers.neco.test.js`
- `src/tests/ocr.parsers.gce.test.js`
- `src/tests/ocr.classify.test.js`
- `src/tests/ocr.api.test.js` — uses `mock` provider, end-to-end through
  controller → worker → completion
- `src/tests/ocr.rbac.test.js` — owner vs. staff vs. unrelated user

The mock provider reads from a fixture map keyed by `file.metadata.original_name`
(e.g. `waec_sample_2023.pdf`) so tests stay deterministic. The runtime
provider selector throws `OCR_PROVIDER_UNAVAILABLE` if any code path tries to
use the mock outside `NODE_ENV==='test'`.

### New runtime dependencies

| Package | Purpose | Native deps |
|---|---|---|
| `pdf-parse` | Extract text layer from PDFs | None |
| `tesseract.js` | In-process OCR | None (WASM) |
| `pdfjs-dist` | Rasterize PDFs → PNG for Tesseract | None |
| `sharp` | Image preprocessing (deskew, grayscale, threshold) before Tesseract | Prebuilt binaries |
| `axios` | Already a dependency — used for ocr.space when enabled | — |

`npm run test:ocr` is added to `package.json` mirroring the `test:jupeb`
pattern.

## Migration

New migration `src/db/migrations/NNN_create_ocr_tables.sql`:
- `ocr_jobs`, `ocr_results`, indexes listed above
- RBAC seed for `ocr.create`, `ocr.read`, `ocr.read.any`, `ocr.requirement.bind`
- Default permissions: `student` → `ocr.create`, `ocr.read`;
  `registrar`, `admin` → all four.

## Phased Rollout

1. **Phase 1 (free, fully working)** — `pdf-text` + `tesseract` chain,
   WAEC + NECO parsers, async-only API. Ships behind feature flag
   `FEATURE_OCR_ENABLED`. Mock provider exists in code but is
   `NODE_ENV==='test'`-gated and never selectable in prod.
2. **Phase 2 (still free)** — Add `ocr_space` as low-confidence fallback,
   GCE + NABTEB parsers, sync mode, websocket events, registrar UI
   integration.
3. **Phase 3 (optional, paid)** — Add `aws_textract` / `google_doc_ai` as
   per-institution overrides for institutions willing to pay for higher
   accuracy on phone-photographed certificates. Auto-bind to
   `jupeb_registration_results` via `academic` module on student
   confirmation; retention purge job.

## Open Questions

- Should low-confidence (`< 60`) results auto-create a registrar review task
  in `submission` instead of returning to the student?
- Do we need a per-institution provider override (some institutions may
  forbid sending PII to non-region-locked providers)?
- Pricing model — Textract per-page cost is non-trivial; do we cap per-user
  per-day OCR jobs?
