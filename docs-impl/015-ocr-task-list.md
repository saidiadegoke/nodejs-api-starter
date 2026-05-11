---
name: OCR module task list
description: TDD-ordered implementation plan for the OCR module described in 015-ocr-technical-design.md. Default chain is free (pdf-parse + tesseract.js); paid providers are optional fallbacks.
type: project
---

# OCR module task list (TDD)

Scope: implement `src/modules/ocr/` so the API can accept a PDF or image
(WAEC / NECO / NABTEB / GCE) and return a normalized JSON result.

Pairs with:
- Design: `docs-impl/015-ocr-technical-design.md`
- Swagger: `docs/ocr-swagger.yaml`

## Conventions

- TDD red → green → refactor for every code task.
- New columns / tables in their own migration (additive, `IF NOT EXISTS`).
- Schema tests use the `information_schema` probe pattern (see
  `jupeb.identity.nin-pending.schema.test.js`).
- API tests assert on `res.body`, never on raw `SELECT`s.
- Direct `pool.query` in tests only as fixture setup for state no API
  produces.
- Mock provider is `NODE_ENV==='test'`-gated. Provider selector throws
  `OCR_PROVIDER_UNAVAILABLE` if anything tries to use it in prod.

---

## Initiative A — Foundation: schema, module skeleton, RBAC

Unblocks everything else. Lands an empty but wired module.

### A.1 — Migration: `ocr_jobs` + `ocr_results`

- [ ] Red: `ocr.schema.test.js` — `information_schema` probe asserts both
      tables exist with the columns/constraints from
      `015-ocr-technical-design.md` § Database Tables.
- [ ] Green: `src/db/migrations/003_ocr_schema.sql` — creates tables,
      indexes, and RBAC seed rows for `ocr.create`, `ocr.read`,
      `ocr.read.any`, `ocr.requirement.bind`. Default permission grants:
      - `student` → `ocr.create`, `ocr.read`
      - `registrar`, `admin`, `super_admin` → all four
- [ ] Refactor: nothing yet.

### A.2 — Module skeleton

- [ ] Create `src/modules/ocr/` with empty `controllers/`, `services/`,
      `providers/`, `parsers/`, `models/`, `pipelines/`, `utils/`.
- [ ] `routes.js` returning `Router()` with no routes (smoke test only).
- [ ] Mount at `/ocr` in `src/routes/index.js` and add to
      `src/modules/index.js`.
- [ ] Add `ocr-swagger.yaml` to the swagger registry in `routes/index.js`.
- [ ] Smoke test `ocr.api.test.js` — `GET /ocr/health` returns `200` (add a
      tiny health route under the module so we can detect mount issues).

### A.3 — `ocr-job.model.js` + `ocr-result.model.js`

- [ ] Red: `ocr.model.test.js` — exercises `OcrJobModel.create`,
      `findById`, `findLatestCompletedByFile`, `markStarted`,
      `markCompleted`, `markFailed`, plus `OcrResultModel.create`.
- [ ] Green: implement both models against `pool`.
- [ ] Refactor: extract a tiny `serializeMetadata` helper if needed.

---

## Initiative B — Provider abstraction (free-tier defaults)

### B.1 — `BaseProvider` interface + selector

- [ ] Red: `ocr.providers.selector.test.js` —
      - returns `pdf-text` for `application/pdf` first
      - returns `tesseract` for images
      - falls back to next provider when first throws `LOW_CONFIDENCE`
      - throws `OCR_PROVIDER_UNAVAILABLE` when chain includes `mock` and
        `NODE_ENV !== 'test'`
- [ ] Green: `providers/base.provider.js` (abstract — throws), 
      `pipelines/extraction.pipeline.js` reading
      `OCR_DEFAULT_CHAIN=pdf-text,tesseract`.

### B.2 — `pdf-text` provider (pdf-parse)

- [ ] Add `pdf-parse` to `package.json`.
- [ ] Red: `ocr.providers.pdf-text.test.js` — fixture
      `tests/fixtures/ocr/sample-text-layer.pdf` returns text + confidence
      ≥ 95; `tests/fixtures/ocr/sample-no-text-layer.pdf` returns
      `confidence === 0` (so the chain advances to Tesseract).
- [ ] Green: `providers/pdf-text.provider.js`.

### B.3 — `tesseract` provider (tesseract.js)

- [ ] Add `tesseract.js`, `pdfjs-dist`, `sharp` to `package.json`.
- [ ] Red: `ocr.providers.tesseract.test.js` — fixture image
      `tests/fixtures/ocr/sample-waec.png` returns text containing
      `WEST AFRICAN EXAMINATIONS COUNCIL`. (Slow test; gated behind
      `OCR_RUN_SLOW_TESTS=1` env var.)
- [ ] Green: `providers/tesseract.provider.js` —
      - For images: pass buffer through `sharp` (grayscale + threshold) →
        Tesseract worker → return text + average word confidence.
      - For PDFs without text layer: `pipelines/pdf-rasterizer.js`
        renders pages to PNG with `pdfjs-dist`, then OCRs each page.
      - Worker reuse: pool of N workers (default 2) with a tiny semaphore.
- [ ] Refactor: factor the rasterizer out so OCR.space can reuse it.

### B.4 — `mock` provider (tests only)

- [ ] Red: `ocr.providers.mock.test.js` — `mock` returns fixture text for
      `original_name=waec_sample_2023.pdf`, throws when env is not test.
- [ ] Green: `providers/mock.provider.js` — fixture map keyed by
      `original_name`. Hard guard: `if (process.env.NODE_ENV !== 'test') throw`.

### B.5 — `ocr_space` provider (optional fallback, free 25k/mo)

- [ ] Red: `ocr.providers.ocr-space.test.js` — uses `nock` (or axios mock)
      to stub the API. Verifies request shape and that `confidence` is
      mapped from `OCRExitCode`.
- [ ] Green: `providers/ocr-space.provider.js` — gated by
      `OCR_SPACE_API_KEY`. If missing, selector skips it silently.

---

## Initiative C — Parsers

Parsers receive `{ text, structuredTables? }` and return the normalized
`result_json` per the design.

### C.1 — `grade-normalizer.js`

- [ ] Red: `ocr.grade-normalizer.test.js` — table-driven cases for WAEC
      (`A1→A`, `B2→B`, … `F9→F`), GCE A-Level (`A→A`, `U→F`), unknown
      grade returns `null` + warning.
- [ ] Green: implement.

### C.2 — `classify-exam-type.js`

- [ ] Red: `ocr.classify.test.js` — feeds first-500-chars excerpts and
      asserts classification: WAEC header → `waec`, NECO → `neco`,
      NABTEB → `nabteb`, GCE / Cambridge → `gce`, anything else →
      `generic`.
- [ ] Green: keyword-based classifier.

### C.3 — `waec.parser.js`

- [ ] Red: `ocr.parsers.waec.test.js` — pairs of
      `tests/fixtures/ocr/waec/<n>.txt` (raw OCR text) +
      `tests/fixtures/ocr/waec/<n>.json` (expected `result_json`).
      Cover at least: clean typed PDF, scanned with mild OCR errors,
      result without DOB.
- [ ] Green: anchor-based parser — `EXAM. NO.`, `CENTRE NO.`, subject
      table parser tolerant to `O₁` / `01` confusion etc.

### C.4 — `neco.parser.js`

- [ ] Red/Green: same fixture pattern, NECO-specific.

### C.5 — `nabteb.parser.js` (Phase 2)

- [ ] Red/Green: defer behind `FEATURE_OCR_NABTEB`.

### C.6 — `gce.parser.js` (Phase 2)

- [ ] Red/Green: handles WAEC GCE + Cambridge layouts.

### C.7 — `generic.parser.js`

- [ ] Red: passes for arbitrary `Subject — Grade` lines, low confidence
      floor, returns `exam_type: "generic"`.
- [ ] Green: regex on `^([A-Z][A-Z .]+)\s+([A-F][1-9]?|U)\s*$` per line.

---

## Initiative D — Service + worker + controller

### D.1 — `OcrService.create()`

- [ ] Red: `ocr.service.create.test.js` —
      - validates file ownership (or `ocr.read.any`)
      - validates MIME against allow-list
      - validates size against `OCR_MAX_FILE_SIZE_MB`
      - inserts an `ocr_jobs` row in `queued`
      - schedules the worker (returns the job — does not await)
      - sync mode (`wait=true`) awaits up to 30s and returns the
        completed job
- [ ] Green: `services/ocr.service.js` + thin `services/ocr.worker.js`
      (in-process queue using a Promise-based semaphore, capacity =
      `OCR_TESSERACT_WORKER_COUNT`).

### D.2 — Worker pipeline

- [ ] Red: `ocr.worker.test.js` —
      - happy path: `queued → processing → completed` with `ocr_results`
        row populated
      - provider throws transient error → retries up to `max_attempts`
      - permanent error → `failed` with stable `error_code`
      - emits `ocr.job.completed` / `ocr.job.failed` via the existing
        `websocket` module's event bus
- [ ] Green: implement worker. Reuse `FileService.getFile()` to fetch
      buffer from S3 (add a `FileService.getFileBuffer(fileId)` helper if
      it doesn't exist).

### D.3 — `OcrService.get / list / retry / latestForFile`

- [ ] Red: `ocr.service.read.test.js` — owner vs. staff visibility,
      `raw_text_excerpt` (≤500 chars) for owner, full `raw_text` for
      `ocr.read.any`.
- [ ] Green: implement.

### D.4 — `OcrService.bindRequirement()`

- [ ] Red: `ocr.service.bind.test.js` —
      - rejects when job not `completed`
      - rejects when caller is neither registration owner nor has
        `ocr.requirement.bind`
      - on success, persists `metadata.binding = { registration_id, requirement_id }`
        and returns the updated job
- [ ] Green: implement.

### D.5 — Controller + routes

- [ ] Red: `ocr.api.test.js` (full HTTP surface) —
      - `POST /ocr/jobs` multipart with image → 202 + `job_id`
      - `POST /ocr/jobs` JSON with `file_id` → 202
      - `POST /ocr/jobs?wait=true` with mock provider → 200 + result
      - `GET /ocr/jobs/:jobId` → status / result
      - `GET /ocr/jobs` paginated, owner-scoped
      - `POST /ocr/jobs/:jobId/retry` happy + 409 paths
      - `POST /ocr/jobs/:jobId/bind-requirement` happy + RBAC negatives
      - `GET /ocr/files/:fileId/latest` 200 / 404
      - 415 on unsupported MIME, 413 on oversize, 403 on non-owner
- [ ] Green: `controllers/ocr.controller.js`, `routes.js`,
      `validations/ocr.validation.js`.
- [ ] Refactor: collapse duplicated job-projection logic into a single
      `serializeJob(job, viewerRoles)` helper.

---

## Initiative E — Integration polish

### E.1 — Submission auto-bind hook (Phase 2)

- [ ] On `ocr.job.completed` for `metadata.requirement_id`, emit a
      `submission` module event so the registrar UI can offer
      "Pre-fill subjects from OCR".
- [ ] Test: `ocr.submission.integration.test.js`.

### E.2 — Academic prefill (Phase 3)

- [ ] On accept-bind, optionally upsert
      `jupeb_registration_results` from `result_json.subjects` (behind
      `FEATURE_OCR_ACADEMIC_PREFILL`).

### E.3 — Retention purge job

- [ ] Cron-style job (reuse `src/modules/jupeb/jobs/` runner pattern):
      after 90 days, NULL out `ocr_results.raw_text` and
      `ocr_results.provider_payload` for jobs not bound to an active
      registration.

### E.4 — Per-institution provider override (Phase 3)

- [ ] Add optional `institution_id` → provider chain mapping in
      `jupeb_universities.metadata.ocr_chain`. Selector reads this when
      caller is institution-scoped.

---

## Initiative F — Docs + scripts

- [ ] Add `npm run test:ocr` to `package.json`, mirroring `test:jupeb`.
- [ ] Add OCR section to top-level `README.md` (one paragraph + link to
      design).
- [ ] Append `ocr` to `src/routes/index.js` documentation block.
- [ ] Update `MEMORY.md` index if needed (memory only — not required).

---

## Test fixtures to gather

Place under `src/tests/fixtures/ocr/`:

- `sample-text-layer.pdf` — typed PDF (any source) with embedded text
  layer.
- `sample-no-text-layer.pdf` — scanned PDF without text layer.
- `waec/<n>.txt` + `waec/<n>.json` pairs — at least 3.
- `neco/<n>.txt` + `neco/<n>.json` pairs — at least 2.
- `gce/<n>.txt` + `gce/<n>.json` pairs — Phase 2.
- `sample-waec.png` — single-page rendered WAEC for tesseract slow test
  (≤200KB).

Real result documents are PII; **only use synthetic / redacted samples in
the repo**.

---

## Out of scope (explicit)

- Anti-fraud / signature validation.
- Live verification with WAEC / NECO / Cambridge upstream APIs (separate
  module, future).
- GPU-accelerated OCR (PaddleOCR, EasyOCR) — revisit only if Tesseract
  accuracy becomes a sustained complaint.
- Bulk batch upload (registrar uploading 200 PDFs at once) — single-doc
  workflow only for Phase 1–2.
