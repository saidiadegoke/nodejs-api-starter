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

---

### Changed
- Replaced custom logger with `CommodLogger` across all interceptors, filters, middlewares, and bootstrap routines.
- Enhanced `AllExceptionsFilter` to handle nested validation errors and custom error codes (`details: { error_code }`).
- Updated `package.json` with `@nestjs/swagger` and `@nestjs/axios`.
