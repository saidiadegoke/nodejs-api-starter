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
