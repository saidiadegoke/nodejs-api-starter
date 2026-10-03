# Technical Roadmap & Items to Revisit

This document tracks architectural enhancements, migrations, and technical debt items scheduled for future iterations.

---

## 1. Test Suite Modernization (TypeScript & NestJS Testing)
- **Current State**: 50+ integration tests in `src/tests/**/*.test.js` import the legacy Express adapter via `require('../app')` with `supertest`.
- **Target State**: 
  - Migrate all `.test.js` files to `.spec.ts` / `.e2e-spec.ts`.
  - Use `@nestjs/testing` (`Test.createTestingModule({ imports: [AppModule] }).compile()`).
  - Standardize on Jest TypeScript runner (`ts-jest`).
- **Benefit**: Removes dependency on CommonJS `src/app.js`, making the codebase 100% native TypeScript end-to-end.

---

## 2. Deprecate Legacy Express Routers & JS Models
- **Current State**: A few legacy modules and routes remain in `src/routes/index.js` and `src/modules/*/routes/`.
- **Target State**:
  - Fully migrate all routes to NestJS `@Controller()` and `@Injectable()` service classes.
  - Remove `src/routes/index.js` once all endpoints are handled by NestJS controllers with DTOs and decorators.
- **Benefit**: Unified request lifecycle, class-validator DTO validation, interceptors, and guards across 100% of endpoints.

---

## 3. Standardize Production Process Management
- **Current State**: Fallback runner files (`index.js`, `server.js`, `src/app.js`, `ecosystem.config.js`, `Procfile`) are maintained to guarantee startup across any hosting environment.
- **Target State**:
  - Audit the production server and confirm whether PM2, Docker, or systemd is used.
  - Lock production strictly to `dist/main.js` via `npm start`.
  - Prune fallback shim files once all deployment environments are verified.
- **Benefit**: Simplified root folder and uniform runtime entry point.

---

## 4. Automated OpenAPI Specification Generation
- **Current State**: Static YAML OpenAPI specs in `docs/` alongside NestJS `SwaggerModule` in `src/main.ts`.
- **Target State**:
  - Add a CLI script / build hook that uses NestJS `@nestjs/swagger` CLI plugin or a programmatic generator to export `dist/openapi.json` automatically on build.
  - Feed the auto-generated `openapi.json` to documentation portals and Postman collections.
- **Benefit**: Eliminates manual documentation drift between code and docs.

---

## 5. Automated CI/CD Deployment Pipeline
- **Current State**: `.github/workflows/ci.yml` runs typechecking, builds TypeScript, runs migrations, and executes test suites on push/PR.
- **Target State**:
  - Add automated CD deployment stages (e.g., SSH deploy, Webhook trigger, or Docker container push to DigitalOcean/AWS).
  - Add Slack / Discord / Email webhook notifications on deployment success or failure.
- **Benefit**: Zero-touch, reliable continuous deployment to production.

---

## 6. Centralized Secrets & Configuration Management
- **Current State**: Configuration loaded via `.env` and validated through `validateConfig()` and class-validator classes in `src/config/`.
- **Target State**:
  - Integrate secret management (e.g., AWS Secrets Manager, Doppler, or HashiCorp Vault) for multi-environment deployments.
  - Add strict runtime environment auditing for production secrets.
- **Benefit**: Enhanced security and credential rotation without redeploying code.

---

## 7. External Integrations: Synchronization Status & Prompts (CRMS & Attendance)

This section tracks the implementation and verification status of synchronization endpoints between Registration Portal, Attendance System, and CRMS (RMS).

### 📊 Integration Status Matrix

| Integration Domain | Attendance System | CRMS / RMS System | Current Status |
| :--- | :--- | :--- | :--- |
| **Candidates (Students)** | `POST /api/auth/sync-students` | `POST /api/candidates/sync` | ✅ **Fully Live & Verified** |
| **Institutions (Centres)** | `POST /api/auth/sync-institutions` | `POST /api/institutions/sync` | ✅ **Fully Live & Verified** |
| **Subjects (Catalog)** | `POST /api/auth/sync-subjects` | `POST /api/subjects/sync` | ✅ **Fully Live & Verified** |

---

### 7.1 ✅ Live Endpoints Reference (Implemented & Active)

#### 1. Attendance System — Subjects (`POST /api/auth/sync-subjects`)
- **Request Payload**:
```json
{
  "subjects": [
    { "subjectCode": "MUS", "subjectName": "Music" },
    { "subjectCode": "LIT", "subjectName": "Literature" }
  ]
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Subject sync completed.",
  "summary": { "created": 2, "updated": 0, "failed": 0, "total": 2 },
  "results": [
    { "subjectCode": "MUS", "status": "created", "subject_id": "..." }
  ]
}
```

#### 2. Attendance System — Institutions (`POST /api/auth/sync-institutions`)
- **Payload**:
```json
{
  "institutions": [
    {
      "institutionCode": "001",
      "institutionName": "University of Lagos",
      "address": "Akoka, Yaba, Lagos State, Nigeria",
      "coordinates": { "latitude": 6.5173, "longitude": 3.3869 },
      "lectureRadius": 100
    }
  ]
}
```

#### 2. CRMS System — Subjects (`POST /api/subjects/sync`)
- **Payload**:
```json
[
  {
    "code": "MTH",
    "name": "Mathematics",
    "category": "Sciences",
    "hasPractical": false,
    "isActive": true
  },
  {
    "code": "PHY",
    "name": "Physics",
    "category": "Sciences",
    "hasPractical": true,
    "isActive": true
  }
]
```

#### 3. CRMS System — Institutions (`POST /api/institutions/sync`)
- **Payload**:
```json
[
  {
    "code": "001",
    "name": "University of Lagos",
    "shortCode": "UNILAG",
    "category": "Federal",
    "state": "Lagos",
    "city": "Akoka",
    "isActive": true
  }
]
```

#### 4. CRMS System — Candidates (`POST /api/candidates/sync`)
- **Payload**:
```json
[
  {
    "candidateNumber": "280010001",
    "jupebNumber": "280010001",
    "firstName": "John",
    "lastName": "Doe",
    "middleName": "Emeka",
    "institutionCode": "001",
    "academicYear": "2028",
    "subjects": ["MTH", "PHY", "CHM"],
    "stdInstNumber": "DEMO/2026/0001",
    "isActive": true
  }
]
```

---

### 7.3 Additional Integration Items (Future Enhancements)

| Gap / Future Endpoint | Target System | HTTP Method & Path | Rationale & Impact |
| :--- | :--- | :--- | :--- |
| **Candidate Invalidation / Deactivation** | **Attendance** | `DELETE /api/auth/sync-students/:id`<br>or `POST /api/auth/deactivate-student` | When a candidate registration is withdrawn, cancelled, or disqualified in Registration Portal, Attendance can revoke biometric/scanner access. |
| **Batch Sync Status Verification** | **Attendance** | `GET /api/auth/sync/status/:batchId` | After bulk syncing candidate records, inspect individual barcode/biometric errors. |
| **Institution / Subject Invalidation** | **Attendance** | `DELETE /api/auth/sync-institutions/:id`<br>`DELETE /api/auth/sync-subjects/:id` | Archiving endpoint for retired universities or deprecated subject syllabi. |
| **Admin Bulk Results Query** | **CRMS** | `GET /api/results/session/:sessionId`<br>or `GET /api/results/institution/:universityId` | Administrative bulk export endpoint for portal result publication workflows. |
| **Candidate Invalidation / Deletion** | **CRMS** | `DELETE /api/candidates/:candidateNumber` | Flag candidate as withdrawn if registration is cancelled prior to examinations. |




