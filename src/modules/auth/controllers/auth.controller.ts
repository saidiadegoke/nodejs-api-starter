import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpStatus,
  HttpCode,
  UseGuards,
  HttpException,
  Ip,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../services/auth.service';
import { OtpService } from '../services/otp.service';
import { PasswordResetService } from '../services/password-reset.service';
import { RegisterDto } from '../dto/register.dto';
import { RegisterWithCodeDto } from '../dto/register-with-code.dto';
import { CompleteRegistrationDto } from '../dto/complete-registration.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { VerifyPhoneDto } from '../dto/verify-phone.dto';
import { ResendOtpDto } from '../dto/resend-otp.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import {
  LoginResponseDto,
  RefreshTokenResponseDto,
  CodeStatusResponseDto,
  RegisterWithCodePreviewResponseDto,
  CompleteRegistrationResponseDto,
  OtpIssuedResponseDto,
  VerifyPhoneResponseDto,
  ForgotPasswordResponseDto,
} from '../dto/auth-responses.dto';
import { UserProfileResponseDto } from '../../users/dto/user-responses.dto';
import { JwtAuthGuard, CurrentUser } from '../../../shared';

const sendEmail = require('../../../shared/utils/sendEmail');
const GeoModel = require('../../../shared/models/geo.model');

function maskRecipient(value?: string | null): string {
  if (!value) return '***';
  const s = String(value);
  if (s.includes('@')) return s.replace(/^(.{1,2})[^@]*(@.*)$/, '$1***$2');
  if (s.length > 6) return `${s.slice(0, 4)}***${s.slice(-2)}`;
  return '***';
}

function normalizeNextOfKin(jupebRow: any, ninPayload: any): any {
  if (jupebRow) {
    return {
      name: jupebRow.name || null,
      relationship: jupebRow.relationship || null,
      phone: jupebRow.phone || null,
      email: jupebRow.email || null,
      residential_address: jupebRow.residential_address || null,
    };
  }
  if (ninPayload && typeof ninPayload === 'object') {
    return {
      name:
        ninPayload.name ||
        [ninPayload.first_name, ninPayload.middle_name, ninPayload.surname]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        null,
      relationship: ninPayload.relationship || null,
      phone: ninPayload.phone || null,
      email: ninPayload.email || null,
      residential_address: ninPayload.residential_address || null,
    };
  }
  return null;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly passwordResetService: PasswordResetService,
    private readonly dataSource: DataSource
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register new user account',
    description: 'Registers a new user with email/phone, password, profile info, and role assignment.',
  })
  @ApiCreatedResponse({ type: UserProfileResponseDto, description: 'User account created successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed or email/phone already in use' })
  async register(@Body() body: RegisterDto) {
    if (body.website || body.url || body.homepage) {
      throw new HttpException('Registration failed. Please try again later.', HttpStatus.BAD_REQUEST);
    }

    const user = await this.authService.register(body);

    if (user.email && body.first_name) {
      const appName = process.env.APP_NAME || 'our app';
      const welcomeUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/`;

      setImmediate(() => {
        sendEmail({
          to: user.email,
          subject: `Welcome to ${appName}!`,
          templateFile: 'welcome.html',
          placeholders: [body.first_name || 'User', welcomeUrl, user.email],
        }).catch((err: any) => {
          // eslint-disable-next-line no-console
          console.warn('[auth.register] welcome email failed:', err && err.message);
        });
      });
    }

    return user;
  }

  @Post('register-with-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview registration with institution code',
    description: 'Validates an institution issued code and returns candidate/subject preview without claiming the code.',
  })
  @ApiOkResponse({ type: RegisterWithCodePreviewResponseDto, description: 'Preview candidate details' })
  @ApiBadRequestResponse({ description: 'Invalid or missing code' })
  async registerWithCode(@Body() body: RegisterWithCodeDto, @Query('code') queryCode?: string) {
    if (body && (body.website || body.url || body.homepage)) {
      throw new HttpException('Registration failed. Please try again later.', HttpStatus.BAD_REQUEST);
    }
    const code = body?.code || queryCode;
    return this.authService.previewByCode(code);
  }

  @Post('complete-registration')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Complete registration and claim institution code',
    description: 'Mints the candidate student account, claims the institution registration code, and issues JWT tokens.',
  })
  @ApiCreatedResponse({ type: CompleteRegistrationResponseDto, description: 'Registration completed and tokens minted' })
  @ApiBadRequestResponse({ description: 'Code already claimed, invalid, or expired' })
  async completeRegistration(@Body() body: CompleteRegistrationDto) {
    if (body && (body.website || body.url || body.homepage)) {
      throw new HttpException('Registration failed. Please try again later.', HttpStatus.BAD_REQUEST);
    }
    return this.authService.completeRegistration(body);
  }

  @Get('code-status')
  @ApiOperation({
    summary: 'Check status of institution code',
    description: 'Inspects whether an institution issued code is valid, claimed, expired, or available.',
  })
  @ApiQuery({ name: 'code', required: true, description: 'Institution issued registration code' })
  @ApiOkResponse({ type: CodeStatusResponseDto, description: 'Code validation status summary' })
  async codeStatus(@Query('code') rawCode?: string) {
    const code = String(rawCode || '').trim();
    if (!code) {
      const err: any = new HttpException('code query parameter is required', HttpStatus.BAD_REQUEST);
      err.details = { error_code: 'code_required' };
      throw err;
    }

    const rows = await this.dataSource.query(
      `SELECT r.id, r.status, r.user_id, r.institution_code_expires_at,
              u.id AS university_id, u.name AS university_name, u.short_name,
              acc.email AS account_email,
              acc.phone AS account_phone,
              acc.status AS account_status,
              acc.email_verified AS account_email_verified,
              acc.phone_verified AS account_phone_verified
       FROM jupeb_registrations r
       JOIN jupeb_universities u  ON u.id = r.university_id
       LEFT JOIN users acc        ON acc.id = r.user_id
       WHERE r.institution_issued_code = $1
       LIMIT 1`,
      [code]
    );
    const row = rows[0];
    if (!row) {
      return { valid: false, error_code: 'code_not_found' };
    }

    const university = {
      id: row.university_id,
      name: row.university_name,
      short_name: row.short_name,
    };

    if (
      row.institution_code_expires_at &&
      new Date(row.institution_code_expires_at).getTime() < Date.now()
    ) {
      return {
        valid: false,
        error_code: 'code_expired',
        expires_at: row.institution_code_expires_at,
        university,
      };
    }

    if (row.status !== 'code_issued' || row.user_id) {
      const claimed = !!row.user_id;
      const out: any = {
        valid: false,
        error_code: claimed ? 'code_already_claimed' : 'code_unavailable',
        expires_at: row.institution_code_expires_at,
        university,
      };
      if (claimed) {
        const active = row.account_status === 'active';
        out.account = {
          exists: true,
          active,
          email_masked: maskRecipient(row.account_email),
          phone_masked: maskRecipient(row.account_phone),
          email_verified: !!row.account_email_verified,
          phone_verified: !!row.account_phone_verified,
          can_login: active,
        };
      }
      return out;
    }

    const preview = await this.authService.previewByCode(code);
    let geo: any = { country: 'Nigeria', state_of_origin: null, lga: null };
    try {
      geo = await GeoModel.resolveBundle({
        country: 'Nigeria',
        stateOfOrigin: preview.basic_information && preview.basic_information.state_of_origin,
        lga: preview.basic_information && preview.basic_information.lga,
      });
    } catch {
      // non-fatal
    }

    const regExtra = await this.dataSource.query(
      `SELECT jupeb_candidate_number FROM jupeb_registrations WHERE id = $1`,
      [row.id]
    );

    let nokRow: any = null;
    try {
      const NextOfKinModel = require('../../jupeb/models/next-of-kin.model');
      nokRow = await NextOfKinModel.findActiveByRegistration(row.id);
    } catch {
      // fallback
    }
    const nextOfKin = normalizeNextOfKin(nokRow, preview.next_of_kin);

    return {
      valid: true,
      expires_at: row.institution_code_expires_at,
      university,
      candidate: {
        ...preview.candidate,
        jupeb_reg_no:
          (regExtra[0] && regExtra[0].jupeb_candidate_number) ||
          preview.candidate.provisional_candidate_code ||
          null,
      },
      basic_information: {
        ...preview.basic_information,
        country: geo.country,
        state_of_origin: geo.state_of_origin,
        lga: geo.lga,
      },
      contact_information: preview.contact_information,
      next_of_kin: nextOfKin,
      subject_combination: preview.subject_combination,
      session: preview.session,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User login',
    description: 'Authenticates a user via email, phone, provisional registration code, or matric number, returning JWT tokens.',
  })
  @ApiOkResponse({ type: LoginResponseDto, description: 'Authentication successful with tokens and user profile' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials or inactive account' })
  async login(@Body() body: LoginDto, @Ip() ip: string, @Headers('user-agent') userAgent: string) {
    const deviceInfo = {
      ip_address: ip,
      user_agent: userAgent,
      ...(body.device_info || {}),
    };
    return this.authService.login(body.identifier, body.password, deviceInfo);
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Exchanges a valid refresh token for a newly minted access token.',
  })
  @ApiOkResponse({ type: RefreshTokenResponseDto, description: 'New access token minted' })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired refresh token' })
  async refreshToken(@Body() body: RefreshTokenDto) {
    return this.authService.refreshToken(body.refresh_token);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'User logout',
    description: 'Revokes the current user session and invalidates the active refresh token.',
  })
  @ApiOkResponse({ description: 'Successfully logged out' })
  async logout(@CurrentUser() user: any) {
    await this.authService.logout(user.user_id, user.session_id);
    return null;
  }

  @Post('send-verification')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Send email verification',
    description: 'Sends an email verification link to the logged-in user.',
  })
  @ApiOkResponse({ description: 'Verification email dispatched' })
  async sendVerification(@CurrentUser() user: any) {
    const result = await this.authService.sendVerificationEmail(user.user_id);
    const safe: any = { sent: true };
    if (process.env.NODE_ENV === 'test') safe.token = result.token;
    return safe;
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Resend email verification',
    description: 'Resends a fresh email verification link to the logged-in user.',
  })
  @ApiOkResponse({ description: 'Verification email resent' })
  async resendVerification(@CurrentUser() user: any) {
    const result = await this.authService.resendVerificationEmail(user.user_id);
    const safe: any = { sent: true };
    if (process.env.NODE_ENV === 'test') safe.token = result.token;
    return safe;
  }

  @Get('verify-email')
  @ApiOperation({
    summary: 'Verify email token via GET',
    description: 'Redeems an email verification token supplied via query parameters.',
  })
  @ApiQuery({ name: 'token', required: true, description: 'Email verification token' })
  @ApiOkResponse({ description: 'Email successfully verified' })
  async verifyEmailGet(@Query('token') token?: string) {
    return this.authService.verifyEmailToken(token);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email token via POST',
    description: 'Redeems an email verification token supplied via request body.',
  })
  @ApiOkResponse({ description: 'Email successfully verified' })
  async verifyEmailPost(@Body('token') token?: string, @Query('token') queryToken?: string) {
    return this.authService.verifyEmailToken(token || queryToken);
  }

  @Post('verify-phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify phone OTP code',
    description: 'Verifies a 6-digit OTP code sent via SMS/Email to verify the user phone/email.',
  })
  @ApiOkResponse({ type: VerifyPhoneResponseDto, description: 'Phone/email successfully verified' })
  @ApiBadRequestResponse({ description: 'Invalid OTP code' })
  async verifyPhone(@Body() body: VerifyPhoneDto) {
    const identifier = body.identifier || body.phone;
    if (!identifier) {
      throw new HttpException('identifier (email or phone) is required', HttpStatus.BAD_REQUEST);
    }
    const user = await this.dataSource.query(
      `SELECT id FROM users WHERE deleted_at IS NULL AND (LOWER(email) = LOWER($1) OR phone = $1) LIMIT 1`,
      [identifier]
    );
    if (!user[0]) {
      throw new HttpException('Invalid verification code', HttpStatus.BAD_REQUEST);
    }
    const result = await this.otpService.verifyOtp(user[0].id, body.otp);
    return { verified: true, user_id: user[0].id, channel: result.channel };
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend OTP code',
    description: 'Generates and dispatches a fresh 6-digit OTP to the user email or SMS channel.',
  })
  @ApiOkResponse({ type: OtpIssuedResponseDto, description: 'OTP successfully dispatched' })
  @ApiBadRequestResponse({ description: 'Identifier required' })
  async resendOtp(
    @Body() body: ResendOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string
  ) {
    const identifier = body.identifier || body.phone;
    if (!identifier) {
      throw new HttpException('identifier (email or phone) is required', HttpStatus.BAD_REQUEST);
    }

    const rows = await this.dataSource.query(
      `SELECT id, email, phone FROM users WHERE deleted_at IS NULL AND (LOWER(email) = LOWER($1) OR phone = $1) LIMIT 1`,
      [identifier]
    );
    const user = rows[0];
    if (!user) {
      const ttlMs = (Number(process.env.OTP_TTL_MINUTES) || 10) * 60 * 1000;
      return {
        sent: true,
        channels: [body.channel || process.env.OTP_CHANNEL || 'email'],
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
        masked_recipient: maskRecipient(identifier),
      };
    }

    const issued = await this.otpService.issueOtp(user.id, {
      channel: body.channel,
      ipAddress: ip,
      userAgent,
    });

    return {
      sent: true,
      channels: issued.channels,
      expires_at: issued.expires_at,
      masked_recipient: maskRecipient(issued.channels.includes('email') ? user.email : user.phone),
      ...(issued.code ? { code: issued.code } : {}),
    };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate password recovery',
    description: 'Sends a password reset token or OTP code to the registered email or phone.',
  })
  @ApiOkResponse({ type: ForgotPasswordResponseDto, description: 'Password reset initiated' })
  async forgotPassword(
    @Body() body: ForgotPasswordDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string
  ) {
    const { identifier, delivery, channel } = body;
    const requestedDelivery = delivery === 'otp' ? 'otp' : 'token';

    const user = await this.passwordResetService.loadUserForReset(identifier);
    if (!user) {
      const fakeChannels = requestedDelivery === 'otp' ? (channel ? [channel] : ['email']) : ['email'];
      const ttlMs = (Number(process.env.OTP_TTL_MINUTES) || 15) * 60 * 1000;
      return {
        reset_initiated: true,
        delivery: requestedDelivery,
        method: requestedDelivery,
        channels: fakeChannels,
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
        masked_recipient: maskRecipient(identifier),
      };
    }

    const issued = await this.passwordResetService.issueReset({
      user,
      delivery: requestedDelivery,
      channel,
      ipAddress: ip,
      userAgent,
    });

    return {
      reset_initiated: true,
      delivery: issued.delivery,
      method: issued.delivery,
      channels: issued.channels,
      expires_at: issued.expires_at,
      masked_recipient: issued.masked_recipient,
      ...(issued.token ? { token: issued.token } : {}),
      ...(issued.code ? { code: issued.code } : {}),
    };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Redeem password reset token or OTP',
    description: 'Sets a new user password after verifying the reset token or OTP code.',
  })
  @ApiOkResponse({ description: 'Password reset successfully' })
  @ApiBadRequestResponse({ description: 'Invalid token or OTP code' })
  async resetPassword(@Body() body: ResetPasswordDto) {
    const { token, code, identifier, new_password } = body;
    if (!token && !code) {
      throw new HttpException('Either `token` or `code` (with identifier) is required', HttpStatus.BAD_REQUEST);
    }

    let result: { user_id: string; email: string; first_name?: string };
    if (token) {
      result = await this.passwordResetService.redeemToken(token, new_password);
    } else {
      if (!identifier) {
        throw new HttpException('identifier is required when redeeming with `code`', HttpStatus.UNPROCESSABLE_ENTITY);
      }
      result = await this.passwordResetService.redeemOtp({ identifier, code: code!, newPassword: new_password });
    }

    if (result.email) {
      const appName = process.env.APP_NAME || 'our app';
      const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const loginUrl = `${frontendUrl}/auth/login`;
      const resetDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      setImmediate(() => {
        sendEmail({
          to: result.email,
          subject: `Password Reset Successful - ${appName}`,
          templateFile: 'password-reset-success.html',
          placeholders: [result.first_name || 'User', resetDate, loginUrl, resetDate, result.email],
        }).catch((err: any) => {
          // eslint-disable-next-line no-console
          console.warn('[auth.resetPassword] success email failed:', err && err.message);
        });
      });
    }

    return null;
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Change password for authenticated user',
    description: 'Updates password after verifying the existing current password.',
  })
  @ApiOkResponse({ description: 'Password successfully changed' })
  @ApiUnauthorizedResponse({ description: 'Current password is incorrect' })
  async changePassword(@CurrentUser() currentUser: any, @Body() body: ChangePasswordDto) {
    const userId = currentUser.user_id;
    const rows = await this.dataSource.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user) {
      throw new HttpException('User not found', HttpStatus.BAD_REQUEST);
    }

    const isValid = await bcrypt.compare(body.current_password, user.password_hash);
    if (!isValid) {
      throw new HttpException('Current password is incorrect', HttpStatus.UNAUTHORIZED);
    }

    const newHash = await bcrypt.hash(body.new_password, 10);
    await this.dataSource.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
      newHash,
      userId,
    ]);

    return null;
  }

  @Post('admin/delete-user')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin deep delete user by email', description: 'Cascading purge of all records for a user' })
  async deleteUser(@Body('email') email: string) {
    if (!email) throw new HttpException('email is required', HttpStatus.BAD_REQUEST);
    const result = await this.deepDeleteByEmail(email);
    return { email, ...result };
  }

  @Post('admin/delete-institution')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin deep delete institution by email', description: 'Cascading purge of all records for an institution' })
  async deleteInstitution(@Body('email') email: string) {
    if (!email) throw new HttpException('email is required', HttpStatus.BAD_REQUEST);
    const result = await this.deepDeleteByEmail(email);
    return { email, ...result };
  }

  @Post('resend-institution-credentials')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend institution admin credentials', description: 'Re-issues and emails credentials' })
  async resendInstitutionCredentials(@Body('email') email: string) {
    if (!email) throw new HttpException('email is required', HttpStatus.BAD_REQUEST);
    try {
      const { resendInstitutionAdminCredentials } = require('../../jupeb/services/institution-admin-provision.service');
      return await resendInstitutionAdminCredentials(email);
    } catch (err: any) {
      throw new HttpException(err.message, err.status || HttpStatus.BAD_REQUEST);
    }
  }

  @Post('admin/resend-institution-credentials')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin endpoint to resend institution credentials' })
  async adminResendInstitutionCredentials(@Body('email') email: string) {
    return this.resendInstitutionCredentials(email);
  }

  private async deepDeleteByEmail(email: string) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return { usersDeleted: 0, institutionsDeleted: 0 };

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userRes = await queryRunner.query(`SELECT id, phone FROM users WHERE LOWER(email) = $1`, [
        normalizedEmail,
      ]);
      const userIds = userRes.map((r: any) => r.id);
      const phoneNumbers = userRes.map((r: any) => r.phone).filter(Boolean);

      const uniRes = await queryRunner.query(
        `SELECT id FROM jupeb_universities WHERE LOWER(email) = $1`,
        [normalizedEmail]
      );
      const uniIds = uniRes.map((r: any) => r.id);

      const regRes = await queryRunner.query(
        `SELECT id FROM jupeb_registrations 
          WHERE (user_id = ANY($1::uuid[]) OR university_id = ANY($2::uuid[]))`,
        [userIds.length ? userIds : [null], uniIds.length ? uniIds : [null]]
      );
      const regIds = regRes.map((r: any) => r.id);

      if (regIds.length) {
        await queryRunner.query(`DELETE FROM jupeb_biometric_captures WHERE registration_id = ANY($1::uuid[])`, [regIds]);
        await queryRunner.query(`DELETE FROM jupeb_registration_documents WHERE registration_id = ANY($1::uuid[])`, [regIds]);
        await queryRunner.query(`DELETE FROM jupeb_registration_status_history WHERE registration_id = ANY($1::uuid[])`, [regIds]);
        await queryRunner.query(`DELETE FROM jupeb_registration_results WHERE registration_id = ANY($1::uuid[])`, [regIds]);
        await queryRunner.query(`DELETE FROM jupeb_registration_scores WHERE registration_id = ANY($1::uuid[])`, [regIds]);
        await queryRunner.query(`DELETE FROM jupeb_result_entries WHERE registration_id = ANY($1::uuid[])`, [regIds]);
        await queryRunner.query(`DELETE FROM jupeb_next_of_kin WHERE registration_id = ANY($1::uuid[])`, [regIds]);
        await queryRunner.query(
          `DELETE FROM ocr_results WHERE job_id IN (SELECT id FROM ocr_jobs WHERE metadata->>'registration_id' = ANY($1::text[]))`,
          [regIds.map(String)]
        );
        await queryRunner.query(
          `DELETE FROM ocr_jobs WHERE metadata->>'registration_id' = ANY($1::text[])`,
          [regIds.map(String)]
        );
        await queryRunner.query(`DELETE FROM jupeb_registrations WHERE id = ANY($1::uuid[])`, [regIds]);
      }

      if (userIds.length) {
        await queryRunner.query(`DELETE FROM jupeb_registration_status_history WHERE changed_by = ANY($1::uuid[])`, [userIds]);
        await queryRunner.query(`DELETE FROM jupeb_nin_verifications WHERE requested_by = ANY($1::uuid[])`, [userIds]);
        await queryRunner.query(`DELETE FROM user_universities WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await queryRunner.query(`DELETE FROM user_roles WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await queryRunner.query(`DELETE FROM user_permissions WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await queryRunner.query(`DELETE FROM user_sessions WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await queryRunner.query(`DELETE FROM user_preferences WHERE user_id = ANY($1::uuid[])`, [userIds]).catch(() => {});
        await queryRunner.query(`DELETE FROM social_accounts WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await queryRunner.query(`DELETE FROM password_resets WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await queryRunner.query(`DELETE FROM verification_tokens WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await queryRunner.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await queryRunner.query(`DELETE FROM api_keys WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await queryRunner.query(`DELETE FROM webhooks WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await queryRunner.query(`DELETE FROM admin_audit_logs WHERE admin_user_id = ANY($1::uuid[])`, [userIds]);
        await queryRunner.query(`DELETE FROM posts WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await queryRunner.query(`DELETE FROM profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await queryRunner.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
      }

      await queryRunner.query(`DELETE FROM users WHERE LOWER(email) = $1`, [normalizedEmail]);
      await queryRunner.query(`DELETE FROM otp_codes WHERE LOWER(email) = $1 OR phone = ANY($2::text[])`, [
        normalizedEmail,
        phoneNumbers,
      ]).catch(() => {});
      await queryRunner.query(
        `DELETE FROM jupeb_nin_verifications 
          WHERE LOWER(intake_payload->>'email') = $1 
             OR LOWER(response_payload->>'email') = $1`,
        [normalizedEmail]
      ).catch(() => {});

      if (uniIds.length) {
        await queryRunner.query(
          `DELETE FROM jupeb_subject_combination_items 
            WHERE combination_id IN (SELECT id FROM jupeb_subject_combinations WHERE university_id = ANY($1::uuid[]))`,
          [uniIds]
        );
        await queryRunner.query(`DELETE FROM jupeb_subject_combinations WHERE university_id = ANY($1::uuid[])`, [uniIds]);
        await queryRunner.query(`DELETE FROM jupeb_document_requirements WHERE university_id = ANY($1::uuid[])`, [uniIds]);
        await queryRunner.query(`DELETE FROM jupeb_courses WHERE university_id = ANY($1::uuid[])`, [uniIds]);
        await queryRunner.query(`DELETE FROM user_universities WHERE university_id = ANY($1::uuid[])`, [uniIds]);
        await queryRunner.query(`UPDATE profiles SET jupeb_university_id = NULL WHERE jupeb_university_id = ANY($1::uuid[])`, [uniIds]);

        const uniRoles = await queryRunner.query(
          `SELECT id FROM roles WHERE owner_jupeb_university_id = ANY($1::uuid[])`,
          [uniIds]
        );
        const uniRoleIds = uniRoles.map((r: any) => r.id);
        if (uniRoleIds.length) {
          await queryRunner.query(`DELETE FROM user_roles WHERE role_id = ANY($1::uuid[])`, [uniRoleIds]);
          await queryRunner.query(`DELETE FROM role_permissions WHERE role_id = ANY($1::uuid[])`, [uniRoleIds]);
          await queryRunner.query(`DELETE FROM roles WHERE id = ANY($1::uuid[])`, [uniRoleIds]);
        }
        await queryRunner.query(`DELETE FROM jupeb_universities WHERE id = ANY($1::uuid[])`, [uniIds]);
      }

      await queryRunner.query(`DELETE FROM jupeb_universities WHERE LOWER(email) = $1`, [normalizedEmail]);

      await queryRunner.commitTransaction();
      return {
        usersDeleted: userIds.length,
        institutionsDeleted: uniIds.length,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
