# Changelog

All notable changes to this project during the Express to NestJS + TypeORM migration will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] - Express to NestJS + TypeORM Migration

### Added

#### Infrastructure & Foundation
- **NestJS Runtime Bootstrap**: Migrated from Express 4 standalone to NestJS 11 on `@nestjs/platform-express`.
- **TypeORM Database Layer**: Integrated `@nestjs/typeorm` with PostgreSQL connection pooling. Enforced strict architectural invariant `synchronize: false`.
- **Response Envelope Interceptor**: Standardized all API responses to `{ success: true, message: string, data: T, pagination?: P }` matching Express parity.
- **Global Exception Filter**: Added `AllExceptionsFilter` mapping `HttpException` and standard exceptions to `{ success: false, message: string, details?: any }`.
- **CommodLogger Integration**: Migrated logging infrastructure to `CommodLogger` (transient scope, auto-tagging class context via `INQUIRER`, colorized console output, and optional Grafana Loki HTTP push transport).
- **Swagger OpenAPI Documentation**: Configured `@nestjs/swagger` with OpenAPI 3.0 specs available at `/docs` and `/api/docs`.
- **Middlewares**: `RequestIdMiddleware`, `RequestLogMiddleware` (database counter and audit logging), `SearchAliasMiddleware` (normalizing `q` and `search` query parameters).
- **Guards**: `JwtAuthGuard` and RBAC `PermissionsGuard` with `@RequirePermission()` decorator.

#### Users Module (`src/modules/users/`)
- **TypeORM Entities**:
  - `UserEntity` mapping to `users` table.
  - `ProfileEntity` mapping to `profiles` table.
  - `UserPreferenceEntity` mapping to `user_preferences` table.
  - `UserActivityEntity` mapping to `user_activities` table.
- **Repositories**:
  - `UserRepository`: User lookup, filtering, creation, status updates, soft deletes.
  - `ProfileRepository`: Profile retrieval and partial updates.
  - `UserPreferencesRepository`: Preference persistence.
  - `UserActivityRepository`: Audit logging and paginated activity queries.
- **Services**:
  - `UsersService`: Administrative user listing, pagination, and status management.
  - `UserProfileService`: Current user profile retrieval, updates, countries catalog, statistics.
  - `UserActivityService`: Paginated activity audit logging and deletion.
- **Controllers & DTOs**:
  - `UserProfileController`: Routes for `/users/countries`, `/users/me`, `/users/me/stats`, `/users/me/permissions`, `/users/me/preferences`, `/users/:user_id`.
  - `UserActivityController`: Routes for `/users/me/activities`, `/users/:user_id/activities`.
  - `UsersController`: Administrative routes for `/users`, `/users/:userId`, `/users/:userId/activate`, `/users/:userId/deactivate`.
  - Fully typed Swagger DTOs: `UpdateProfileDto`, `UpdatePreferencesDto`, `UserQueryDto`, `UpdateUserDto`, `UserProfileResponseDto`, `UserPreferencesResponseDto`, `UserActivityListResponseDto`.

#### Auth Module (`src/modules/auth/`)
- **TypeORM Entities**:
  - `UserSessionEntity` mapping to `user_sessions` table.
  - `PasswordResetEntity` mapping to `password_resets` table.
  - `OtpCodeEntity` mapping to `otp_codes` table.
  - `SocialAccountEntity` mapping to `social_accounts` table.
- **Repositories**:
  - `AuthRepository`: User creation with profiles and roles, identifier resolution supporting email, phone, provisional registration codes (e.g. 7-digit `1234567`), and final JUPEB matric numbers (`jupeb_candidate_number`), with matric lockdown rules and re-entry exceptions.
  - `UserSessionRepository`: Session creation, refresh token validation, revocation.
  - `PasswordResetRepository`: Password reset tokens and OTP tracking.
  - `OtpCodeRepository`: 6-digit OTP codes with rate limiting and verification status.
  - `SocialAccountRepository`: OAuth provider linkages.
- **Services**:
  - `AuthService`: Authentication, registration, token refresh, password changes, registration wizards (`register-with-code` preview and `complete-registration` claiming), CJS static method backward compatibility.
  - `OtpService`: 6-digit OTP code generation, SHA-256 hashing, rate limiting, and SMS/Email dispatching.
  - `PasswordResetService`: Token and OTP-based password recovery.
  - `SsoTokenService`: RS256 handoff token issuance and JWKS key management.
  - `sms-providers/`: Extensible SMS provider registry.
- **Controllers & DTOs**:
  - `AuthController`: Routes for `/auth/register`, `/auth/register-with-code`, `/auth/complete-registration`, `/auth/code-status`, `/auth/login`, `/auth/refresh-token`, `/auth/logout`, `/auth/send-verification`, `/auth/resend-verification`, `/auth/verify-email`, `/auth/verify-phone`, `/auth/resend-otp`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`.
  - `OAuthController`: Social login routes for Google, Facebook, GitHub, Twitter.
  - `SsoController`: Downstream SSO handoff launch and target listing (`/sso/targets`, `/sso/launch/:targetApp`).
  - `WellKnownController`: Public JWKS key set endpoint (`/.well-known/jwks.json`).
  - Fully typed Swagger DTOs: `LoginDto`, `RegisterDto`, `RefreshTokenDto`, `ChangePasswordDto`, `ForgotPasswordDto`, `ResetPasswordDto`, `VerifyPhoneDto`, `ResendOtpDto`, `RegisterWithCodeDto`, `CompleteRegistrationDto`, `LoginResponseDto`, `RefreshTokenResponseDto`, `CodeStatusResponseDto`, `RegisterWithCodePreviewResponseDto`, `CompleteRegistrationResponseDto`, `OtpIssuedResponseDto`, `VerifyPhoneResponseDto`, `ForgotPasswordResponseDto`, `JwksResponseDto`.

#### API Keys Module (`src/modules/api-keys/`)
- Entities, Repositories, Services, and `ApiKeysController` (`POST /api-keys`, `GET /api-keys`, `DELETE /api-keys/:id`) with Swagger annotations and secure token hashing.

#### Institutions Module (`src/modules/institutions/`)
- **TypeORM Entity**: `UniversityEntity` mapping to `jupeb_universities`.
- **Repository**: `UniversityRepository` (public active list, admin pagination, session enrollment count calculation, contact updates, soft deletes).
- **Services**:
  - `InstitutionsService`: Institution management, activation, deactivation, CSV bulk onboarding, and asynchronous sync triggers to CRMS and Attendance services.
  - `InstitutionAdminProvisionService`: Automatic provisioning of `institution_admin` user accounts, password generation, and welcome email dispatch.
- **Controller & DTOs**:
  - `InstitutionsController`: Routes for `GET /catalog/universities/public`, `GET /catalog/universities`, `GET /catalog/universities/:universityId`, `POST /catalog/universities`, `PATCH /catalog/universities/:universityId`, `POST /catalog/universities/:universityId/activate`, `POST /catalog/universities/:universityId/deactivate`, `DELETE /catalog/universities/:universityId`, `POST /catalog/universities/bulk`, `POST /catalog/universities/resend-credentials`.
  - Swagger documented DTOs: `CreateUniversityDto`, `PatchUniversityDto`, `ListUniversitiesQueryDto`, `ResendCredentialsDto`, `UniversityResponseDto`, `BulkUploadResultDto`.

#### Subjects Module (`src/modules/subjects/`)
- **TypeORM Entities**:
  - `SubjectEntity` mapping to `jupeb_subjects`.
  - `SubjectCombinationEntity` mapping to `jupeb_subject_combinations`.
  - `SubjectCombinationItemEntity` mapping to `jupeb_subject_combination_items`.
- **Repositories**:
  - `SubjectRepository`: CRUD, public listing, candidate enrollment aggregation.
  - `SubjectCombinationRepository`: Subject combination management, ordered item binding, enrolled candidate counting.
- **Services**:
  - `SubjectsService`: Subject creation, modification, CSV bulk creation.
  - `SubjectCombinationsService`: Combination creation with 3–6 subject validation, relational item persistence, CSV bulk creation.
- **Controllers & DTOs**:
  - `SubjectsController`: Routes for `GET /catalog/subjects/public`, `GET /catalog/subjects`, `GET /catalog/subjects/:subjectId`, `POST /catalog/subjects`, `PATCH /catalog/subjects/:subjectId`, `POST /catalog/subjects/:subjectId/activate`, `POST /catalog/subjects/:subjectId/deactivate`, `DELETE /catalog/subjects/:subjectId`, `POST /catalog/subjects/bulk`.
  - `SubjectCombinationsController`: Routes for `GET /catalog/subject-combinations/public`, `GET /catalog/subject-combinations`, `GET /catalog/subject-combinations/:subjectCombinationId`, `POST /catalog/subject-combinations`, `PATCH /catalog/subject-combinations/:subjectCombinationId`, `POST /catalog/subject-combinations/:subjectCombinationId/activate`, `POST /catalog/subject-combinations/:subjectCombinationId/deactivate`, `DELETE /catalog/subject-combinations/:subjectCombinationId`, `POST /catalog/subject-combinations/bulk`.
  - Swagger documented DTOs: `CreateSubjectDto`, `PatchSubjectDto`, `ListSubjectsQueryDto`, `CreateSubjectCombinationDto`, `PatchSubjectCombinationDto`, `ListSubjectCombinationsQueryDto`, `SubjectResponseDto`, `SubjectCombinationResponseDto`, `BulkSubjectResultDto`.

#### Courses Module (`src/modules/courses/`)
- **TypeORM Entity**: `CourseEntity` mapping to `jupeb_courses`.
- **Repository**: `CourseRepository`.
- **Service**: `CoursesService`.
- **Controller & DTOs**: `CoursesController` with routes for `GET /academic/courses` and `POST /academic/courses`, fully typed Swagger DTOs (`CreateCourseDto`, `CourseResponseDto`).

#### Document Requirements Module (`src/modules/document-requirements/`)
- **TypeORM Entity**: `DocumentRequirementEntity` mapping to `jupeb_document_requirements`.
- **Repository**: `DocumentRequirementRepository`.
- **Service**: `DocumentRequirementsService`.
- **Controller & DTOs**: `DocumentRequirementsController` with routes for `GET /submission/me/requirements`, `GET /submission/requirements`, `POST /submission/requirements`, `PATCH /submission/requirements/:requirementId`, `POST /submission/requirements/:requirementId/activate`, `POST /submission/requirements/:requirementId/deactivate`, with rich Swagger OpenAPI schemas (`CreateDocumentRequirementDto`, `PatchDocumentRequirementDto`, `ListDocumentRequirementsQueryDto`, `DocumentRequirementResponseDto`).

#### Payment Catalog Module (`src/modules/payment-catalog/`)
- **TypeORM Entities**:
  - `PaymentItemEntity` mapping to `payment_items`.
  - `PaymentStructureEntity` mapping to `payment_structures`.
- **Repositories**: `PaymentItemRepository`, `PaymentStructureRepository`.
- **Service**: `PaymentCatalogService`.
- **Controller & DTOs**: `PaymentCatalogController` with routes for `GET /finance/payment-items`, `GET /finance/payment-structures`, `GET /finance/admin/payment-items`, `POST /finance/admin/payment-items`, `PATCH /finance/admin/payment-items/:id`, `DELETE /finance/admin/payment-items/:id`, `GET /finance/admin/payment-structures`, `POST /finance/admin/payment-structures`, `PATCH /finance/admin/payment-structures/:id`, `DELETE /finance/admin/payment-structures/:id`, with Swagger schemas (`CreatePaymentItemDto`, `PatchPaymentItemDto`, `CreatePaymentStructureDto`, `PatchPaymentStructureDto`, `ListPaymentCatalogQueryDto`, `PaymentItemResponseDto`, `PaymentStructureResponseDto`).

#### Academic Sessions Module (`src/modules/sessions/`)
- **TypeORM Entities**:
  - `AcademicSessionEntity` mapping to `jupeb_registration_sessions`.
  - `SessionEventEntity` mapping to `jupeb_session_events`.
  - `SessionUniversityLockEntity` mapping to `jupeb_session_university_locks`.
- **Repositories**:
  - `SessionRepository`: Academic year chronological ordering, active session resolution, single open session enforcement, cutoff updates, CSV data loading.
  - `SessionUniversityLockRepository`: Institution selective registration locking and paginated lock inspection.
  - `SessionEventRepository`: Audit event logging (`opened`, `closed`, `reopened`, `registration_locked`, `finalization_triggered`).
- **Services**:
  - `SessionContextService`: Dynamic resolution of user viewing session overrides, active session defaults, and cutoff state evaluations (`candidate_info`, `profile_update`, `ca`).
  - `SessionsService`: Session lifecycle management (create, open, close, reopen), bulk finalization, candidate number assignment, comparative metrics calculation with percentage trends, CSV exports.
- **Controller & DTOs**:
  - `SessionsController`: Routes for `GET /sessions`, `POST /sessions`, `GET /sessions/export`, `GET /sessions/context`, `PUT /sessions/viewing`, `DELETE /sessions/viewing`, `GET /sessions/metrics`, `POST /sessions/finalize-all-closed`, `GET /sessions/:sessionId/stats`, `POST /sessions/:sessionId/open`, `POST /sessions/:sessionId/close`, `POST /sessions/:sessionId/reopen`, `GET /sessions/:sessionId/university-locks`, `PUT /sessions/:sessionId/university-locks`, `POST /sessions/:sessionId/finalize-candidate-numbers`, `GET /sessions/:sessionId`, `PATCH /sessions/:sessionId`.
  - Rich OpenAPI Swagger schemas: `CreateSessionDto`, `PatchSessionDto`, `ListSessionsQueryDto`, `SetRegistrationLockDto`, `SessionMetricsQueryDto`, `SetViewingSessionDto`, `SessionResponseDto`, `SessionContextResponseDto`, `SessionMetricsResponseDto`, `SessionStatsResponseDto`, `UniversityLockItemDto`, `SelectiveLockResultDto`.

#### Identity & Biometrics Module (`src/modules/identity/`)
- **TypeORM Entities**:
  - `NinVerificationEntity` mapping to `jupeb_nin_verifications`.
  - `BiometricCaptureEntity` mapping to `jupeb_biometric_captures`.
- **Repositories**:
  - `NinVerificationRepository`: SHA-256 hashed lookup, idempotency caching, active cache hit reuse, PII purge (`cleared_at`), pending verification polling.
  - `BiometricCaptureRepository`: Modality capture records (`face`, `fingerprint`), live file binding, quality scoring, capture history, and replacement versioning.
- **Providers & Services**:
  - `MockNinProvider`: Test sandbox verifying deterministic mock profiles and strict pool matching.
  - `SpeedySmsNinProvider`: Upstream NIMC gateway integration mapping demographic datasets, tracking references, and handling upstream wallet/pool outages.
  - `NinAdapterService`: Provider resolution and verification multiplexing.
  - `NinWriteThroughService`: Non-destructive write-through of NIM-issued identity data into `profiles` and `jupeb_next_of_kin`.
  - `IdentityService`: Comprehensive identity orchestration for NIN verification, retries, intake merges, biometric captures, skips, and candidate portrait resolution.
- **Controller & DTOs**:
  - `IdentityController`: Routes for `POST /identity/nin/verify`, `POST /identity/nin/verifications/:verificationId/retry`, `GET /identity/nin/verifications/:verificationId`, `PATCH /identity/nin/verifications/:verificationId/intake`, `POST /identity/biometrics`, `GET /identity/registrations/:registrationId/biometrics`, `POST /identity/registrations/:registrationId/biometrics/skip`, `GET /identity/registrations/:registrationId/photo`, `PUT /identity/biometrics/:captureId`, `DELETE /identity/biometrics/:captureId`.
#### Registration Module (`src/modules/registration/`)
- **TypeORM Entities**:
  - `RegistrationEntity` mapping to `jupeb_registrations`.
  - `RegistrationDocumentEntity` mapping to `jupeb_registration_documents`.
  - `RegistrationStatusHistoryEntity` mapping to `jupeb_registration_status_history`.
  - `NextOfKinEntity` mapping to `jupeb_next_of_kin`.
- **Repositories**:
  - `RegistrationRepository`: Dynamic filtering, search across candidates, status tracking, biometric presence filtering, statistics calculation, and paginated query builder execution.
  - `RegistrationDocumentRepository`: Uploaded document binding, verification tracking, deletion.
  - `RegistrationStatusHistoryRepository`: Audit trail of registration lifecycle transitions (`draft`, `pending`, `submitted`, `approved`, `rejected`, `withdrawn`).
  - `NextOfKinRepository`: Candidate emergency contact and guardian information CRUD.
- **Services**:
  - `RegistrationStateService`: Validates workflow transitions and manages status state transitions with reason logging.
  - `RegistrationKpiService`: Aggregates enrollment counts, status breakdowns, and biometric readiness for institutions and administrators.
  - `RegistrationEventsService`: Dispatches domain events on candidate registration activities.
  - `NextOfKinService`: Manages candidate next-of-kin entries with upsert semantics.
  - `BulkRegistrationService`: Processes candidate spreadsheets (Excel / CSV), verifies NINs, assigns unique 7-digit candidate codes, and handles batch onboarding.
  - `InstitutionUserScopeService`: Scopes queries by institution administrator tenancy.
  - `RegistrationFormPdfService`: Generates downloadable candidate registration PDF slips using PDFKit.
  - `RegistrationService`: Coordinates candidate self-registration, subject confirmation, candidate code claiming, institution updates, and batch administrative actions.
- **Controllers & DTOs**:
  - `RegistrationController`: Routes for `GET /registrations`, `POST /registrations`, `GET /registrations/:registrationId`, `PATCH /registrations/:registrationId`, `PATCH /registrations/:registrationId/candidate`, `POST /registrations/batch-action`, `POST /registrations/bulk`, `POST /registrations/claim-code`, `POST /registrations/:registrationId/confirm-subjects`, `GET /registrations/:registrationId/form-pdf`.
  - `NextOfKinController`: Routes for `GET /registrations/:registrationId/next-of-kin`, `PUT /registrations/:registrationId/next-of-kin`.
#### Document Submissions Module (`src/modules/submission/`)
- **Services**:
  - `SubmissionService`: Handles candidate intake document uploads, MIME and file size validation against active requirements, single vs multi-sitting exam certificate tuple validations (`waec`, `neco`, `nabteb`, `gce`, `jamb`), versioning and replacement history, intake completeness checks, short-lived signed download URL generation, and administrative review approval / rejection.
- **Controllers & DTOs**:
  - `SubmissionController`: Routes for `GET /submission/me/requirements`, `GET /submission/me/documents`, `POST /submission/me/documents`, `PATCH /submission/me/documents/:documentId`, `DELETE /submission/me/documents/:documentId`, `GET /submission/me/documents/:documentId/download-url`, `POST /submission/me/validate-completeness`, `GET /submission/institution/registrations/:registrationId/documents`, `POST /submission/institution/documents/:documentId/accept`, `POST /submission/institution/documents/:documentId/reject`.
#### Academic Results & Scoring Module (`src/modules/academic/`)
- **TypeORM Entities**:
  - `RegistrationResultEntity` mapping to `jupeb_registration_results`.
  - `RegistrationScoreEntity` mapping to `jupeb_registration_scores`.
  - `InstitutionSessionResultEntity` mapping to `jupeb_institution_session_results`.
  - `ResultEntryEntity` mapping to `jupeb_result_entries`.
- **Repositories**:
  - `RegistrationResultRepository`: Manages course result grades, +1 points awarded tracking, and course joins.
  - `RegistrationScoreRepository`: Persists snapshots of aggregate passed/failed courses and plus-one score tallies.
  - `InstitutionSessionResultRepository`: Tracks university-level session result release timestamps and administrative actor references.
  - `ResultEntryRepository`: Manages candidate certificate manual subject entries, bulk upsert conflict resolution (`manual` vs `ocr`), and OCR confidence score aggregation for registrar reviews.
- **Services**:
  - `AcademicService`: Calculates cumulative course results, validates A–F grades, and recomputes scoring snapshots.
  - `ResultEntriesService`: Processes certificate subjects/grades (WAEC, NECO, NABTEB, GCE, JAMB), validates 1st/2nd sittings, serial indices, and registrar override capabilities.
  - `ResultsReleaseService`: Manages two-tier results release lifecycle (Tier 1: Central JUPEB registrar release to institutions; Tier 2: University administrator release to enrolled candidates) and enforces clearance status gating.
- **Controllers & DTOs**:
  - `AcademicController`: Routes for `GET /academic/results/:registrationId`, `POST /academic/results/:registrationId`, `GET /academic/score/:registrationId`, `POST /academic/score/:registrationId/recompute`.
  - `ResultEntriesController`: Routes for `GET /submission/me/result-entries`, `POST /submission/me/result-entries`, `PATCH /submission/me/result-entries/:entryId`, `GET /submission/institution/registrations/:registrationId/result-entries`, `PATCH /submission/institution/result-entries/:entryId`.
  - `ResultsReleaseController`: Routes for `POST /results-release/sessions/:sessionId/release-institutions`, `GET /results-release/sessions/:sessionId/institution-results`, `POST /results-release/sessions/:sessionId/release-students`.
#### Finance & Payments Module (`src/modules/finance/`)
- **TypeORM Entities**:
  - `PaymentEntity` mapping to `payments` table.
  - `PaymentReconciliationEntity` mapping to `jupeb_payment_reconciliations` table.
- **Repositories**:
  - `PaymentRepository`: Manages checkout transaction records, unique payment ID generation, transaction references, status transitions, and candidate payment history queries.
  - `PaymentReconciliationRepository`: Persists manual / bank teller payment reconciliation audit records and captured amounts.
- **Services**:
  - `FinanceService`: Handles candidate checkout creation, fee preview calculations (balance due, total fee, amount paid), transaction receipt generation, institution bulk checkout, cancellation of pending payments, manual offline payment reconciliation, and analytics queries (exam fee projections by institution, 30-day payment trends, per-institution fee records, foundation global finance summaries).
- **Controllers & DTOs**:
  - `FinanceController`: Routes for `GET /finance/payment-methods`, `GET /finance/me/fee-preview`, `POST /finance/me/checkout`, `GET /finance/me/payments`, `GET /finance/me/payments/:paymentId/receipt`, `GET /finance/institution/overview`, `GET /finance/institution/fees`, `GET /finance/institution/fee-preview`, `POST /finance/institution/checkout`, `POST /finance/institution/payments/:paymentId/cancel`, `GET /finance/institution/payments`, `GET /finance/institution/payments/:paymentId/receipt`, `GET /finance/payments`, `GET /finance/overview`, `GET /finance/fees`, `GET /finance/registrations/:registrationId/payment-summary`, `POST /finance/registrations/:registrationId/reconcile`, `GET /finance/reports/session/:sessionId`, `GET /finance/analytics/exam-fee-by-institution`, `GET /finance/analytics/payment-trends`, `GET /finance/analytics/institution-fee-records`, `GET /finance/analytics/institutions/:universityId/fees`, `GET /finance/analytics/institutions/:universityId/payments`.
  - Fully typed Swagger DTOs: `CreateCheckoutDto`, `CreateInstitutionCheckoutDto`, `ReconcilePaymentDto`, `ListMyPaymentsQueryDto`, `ListAdminPaymentsQueryDto`, `ListInstitutionPaymentsQueryDto`, `AnalyticsQueryDto`, `CheckoutResponseDto`, `PaymentReceiptResponseDto`, `FeePreviewResponseDto`, `InstitutionFinanceOverviewResponseDto`, `PaymentTrendsResponseDto`, `FoundationFinanceOverviewResponseDto`, `PaymentMethodDto`.
#### Program Analytics & Dashboard Module (`src/modules/dashboard/`)
- **Services**:
  - `DashboardService`: Program analytics engine calculating scope resolution, executive stat cards with delta % changes vs prior sessions, quick stats, registration status breakdowns, monthly intake trends (session-windowed or calendar year comparisons), donut distribution by institution type (federal/state/private), onboarding timeline line charts, subject combination popularity distributions, single subject enrollment aggregates, session intake timelines (open/close countdowns and active window flags), and recent registration feeds.
  - `StudentDashboardService`: Mobile dashboard provider aggregating student attendance statistics, CRMS grades, todays schedule, and unread notification counts.
- **Controllers & DTOs**:
  - `DashboardController`: Routes for `GET /dashboard/scope`, `GET /dashboard/stat-cards`, `GET /dashboard/quick-stats`, `GET /dashboard/students-status`, `GET /dashboard/registration-trends`, `GET /dashboard/institution-distribution`, `GET /dashboard/institution-trends`, `GET /dashboard/subject-combination-distribution`, `GET /dashboard/subject-enrollment`, `GET /dashboard/enrollment-by-subject`, `GET /dashboard/session-timeline`, `GET /dashboard/recent-registrations`, `PATCH /admin/users/:userId/jupeb-university`.
  - `StudentDashboardController`: Routes for `GET /dashboard/student/home`, `GET /dashboard/student/courses`, `GET /dashboard/student/results`, `POST /dashboard/student/check-in/:classId`, `POST /dashboard/student/check-out/:classId`.
  - Fully typed Swagger DTOs: `DashboardQueryDto`, `StudentDashboardQueryDto`, `PatchUserJupebUniversityDto`, `DashboardStatCardsResponseDto`, `DashboardQuickStatsResponseDto`, `DashboardStudentsStatusResponseDto`, `DashboardRegistrationTrendsResponseDto`, `InstitutionDistributionResponseDto`, `InstitutionTrendsResponseDto`, `SubjectCombinationDistributionResponseDto`, `SubjectEnrollmentItemDto`, `SessionTimelineResponseDto`, `RecentRegistrationItemDto`, `StudentHomeResponseDto`.

---

### Changed
- Replaced custom logger with `CommodLogger` across all interceptors, filters, middlewares, and bootstrap routines.
- Enhanced `AllExceptionsFilter` to handle nested validation errors and custom error codes (`details: { error_code }`).
- Updated `package.json` with `@nestjs/swagger` and `@nestjs/axios`.
- Added `viewingJupebSessionId` field to `ProfileEntity`.
- Added `isResultReleased`, `resultReleasedAt`, `resultReleasedBy`, `paymentProjection` to `RegistrationEntity`.
- Added `resultsReleasedToInstitutions`, `resultsReleasedAt`, `resultsReleasedBy` to `AcademicSessionEntity`.
