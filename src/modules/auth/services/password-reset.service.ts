import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { PasswordResetRepository } from '../repositories/password-reset.repository';
import { AuthRepository, UserWithProfile } from '../repositories/auth.repository';
import { resolveName, getProvider } from './sms-providers';

const sendEmail = require('../../../shared/utils/sendEmail');

const TOKEN_TTL_MS = 15 * 60 * 1000;
const OTP_LENGTH = 6;
const OTP_MAX_ATTEMPTS = 5;

function appName(): string {
  return process.env.APP_NAME || 'Registration Portal';
}

function frontendUrl(): string {
  return process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

function otpTtlMs(): number {
  const mins = Number(process.env.OTP_TTL_MINUTES) || 10;
  return Math.max(1, mins) * 60 * 1000;
}

function hashSha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function generateOtp(): string {
  return String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

function resolveOtpChannel(explicit: string | undefined, user: any): string {
  const raw = (explicit || process.env.OTP_CHANNEL || '').toLowerCase();
  if (['email', 'sms', 'both'].includes(raw)) return raw;
  if (user.email && user.phone) return 'both';
  if (user.phone) return 'sms';
  return 'email';
}

function maskRecipient(value: string | null | undefined): string {
  if (!value) return '***';
  const s = String(value);
  if (s.includes('@')) return s.replace(/^(.{1,2})[^@]*(@.*)$/, '$1***$2');
  if (s.length > 6) return `${s.slice(0, 4)}***${s.slice(-2)}`;
  return '***';
}

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly passwordResetRepo: PasswordResetRepository,
    private readonly authRepo: AuthRepository,
    private readonly dataSource: DataSource
  ) {}

  private dispatchOtpEmail({ user, code }: { user: any; code: string }): void {
    if (!user.email) return;
    const ttlMinutes = Math.round(otpTtlMs() / 60000);
    sendEmail({
      to: user.email,
      subject: `${appName()} — your password reset code: ${code}`,
      templateFile: 'otp-code.html',
      placeholders: {
        appName: appName(),
        firstName: user.first_name || 'there',
        code,
        ttlMinutes,
        email: user.email,
        year: new Date().getUTCFullYear(),
      },
    }).catch((err: any) => {
      // eslint-disable-next-line no-console
      console.warn('[password-reset.email] send failed:', err && err.message);
    });
  }

  private dispatchOtpSms({ user, code }: { user: any; code: string }): void {
    if (!user.phone) return;
    const providerName = resolveName();
    const provider = getProvider(providerName);
    const ttlMinutes = Math.round(otpTtlMs() / 60000);
    const message = `${appName()}: your password reset code is ${code}. Expires in ${ttlMinutes} minutes.`;
    Promise.resolve(provider.sendSms({ phone: user.phone, message }))
      .then((result) => {
        if (result && result.outcome !== 'sent') {
          // eslint-disable-next-line no-console
          console.warn(
            `[password-reset.sms:${providerName}] outcome=${result.outcome} error=${result.error_message || result.error_code || 'unknown'}`
          );
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`[password-reset.sms:${providerName}] send failed:`, err && err.message);
      });
  }

  private dispatchTokenEmail({ user, rawToken }: { user: any; rawToken: string }): void {
    if (!user.email) return;
    const resetUrl = `${frontendUrl()}/reset-password?token=${rawToken}`;
    sendEmail({
      to: user.email,
      subject: `Reset Your ${appName()} Password`,
      templateFile: 'forgot-password.html',
      placeholders: [
        user.first_name || user.display_name || 'User',
        resetUrl,
        resetUrl,
        user.email,
      ],
    }).catch((err: any) => {
      // eslint-disable-next-line no-console
      console.warn('[password-reset.tokenEmail] send failed:', err && err.message);
    });
  }

  async loadUserForReset(identifier: string): Promise<UserWithProfile | null> {
    let user = await this.authRepo.findByIdentifier(identifier);
    if (!user && typeof identifier === 'string' && identifier.includes('@')) {
      const normalizedEmail = identifier.trim().toLowerCase();
      try {
        const uniRows = await this.dataSource.query(
          `SELECT id, name, email FROM jupeb_universities WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1`,
          [normalizedEmail]
        );
        if (uniRows[0]) {
          const university = uniRows[0];
          // Try to dynamically provision institution admin if service exists
          try {
            const { provisionInstitutionAdmin } = require('../../jupeb/services/institution-admin-provision.service');
            await provisionInstitutionAdmin({
              email: university.email,
              university_id: university.id,
            });
          } catch {
            // ignore if not available
          }
          user = await this.authRepo.findByIdentifier(normalizedEmail);
        }
      } catch {
        user = await this.authRepo.findByIdentifier(normalizedEmail);
      }
    }

    if (!user) return null;

    const r = await this.dataSource.query(
      `SELECT first_name FROM profiles WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );
    user.first_name = (r[0] && r[0].first_name) || null;
    return user;
  }

  async issueReset({
    user,
    delivery = 'token',
    channel,
    ipAddress,
    userAgent,
  }: {
    user: any;
    delivery?: string;
    channel?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    delivery: string;
    channels: string[];
    expires_at: string;
    masked_recipient: string;
    token?: string;
    code?: string;
  }> {
    if (delivery !== 'token' && delivery !== 'otp') {
      const err: any = new HttpException("delivery must be 'token' or 'otp'", HttpStatus.UNPROCESSABLE_ENTITY);
      throw err;
    }

    if (delivery === 'token') {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashSha256(rawToken);
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

      await this.passwordResetRepo.createReset({
        userId: user.id,
        tokenHash,
        email: user.email || null,
        phone: user.phone || null,
        method: user.email ? 'email' : 'sms',
        kind: 'token',
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        expiresAt,
      });

      if (user.email) {
        setImmediate(() => this.dispatchTokenEmail({ user, rawToken }));
      }

      const out: any = {
        delivery: 'token',
        channels: user.email ? ['email'] : ['sms'],
        expires_at: expiresAt.toISOString(),
        masked_recipient: maskRecipient(user.email || user.phone),
      };
      if (process.env.NODE_ENV === 'test') out.token = rawToken;
      return out;
    }

    // delivery === 'otp'
    const resolvedChannel = resolveOtpChannel(channel, user);
    if (resolvedChannel === 'email' && !user.email) {
      const err: any = new HttpException('User has no email on file for OTP delivery', HttpStatus.UNPROCESSABLE_ENTITY);
      err.error_code = 'email_required';
      throw err;
    }
    if (resolvedChannel === 'sms' && !user.phone) {
      const err: any = new HttpException('User has no phone on file for OTP delivery', HttpStatus.UNPROCESSABLE_ENTITY);
      err.error_code = 'phone_required';
      throw err;
    }

    const code = generateOtp();
    const codeHash = hashSha256(code);
    const expiresAt = new Date(Date.now() + otpTtlMs());

    await this.passwordResetRepo.invalidateActiveOtpResets(user.id);
    await this.passwordResetRepo.createReset({
      userId: user.id,
      tokenHash: codeHash,
      email: user.email || null,
      phone: user.phone || null,
      method: resolvedChannel === 'sms' ? 'sms' : 'email',
      kind: 'otp',
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt,
    });

    setImmediate(() => {
      if (resolvedChannel === 'email' || resolvedChannel === 'both') {
        this.dispatchOtpEmail({ user, code });
      }
      if (resolvedChannel === 'sms' || resolvedChannel === 'both') {
        this.dispatchOtpSms({ user, code });
      }
    });

    const channels: string[] = [];
    if (resolvedChannel === 'email' || resolvedChannel === 'both') channels.push('email');
    if (resolvedChannel === 'sms' || resolvedChannel === 'both') channels.push('sms');

    const out: any = {
      delivery: 'otp',
      channels,
      expires_at: expiresAt.toISOString(),
      masked_recipient: maskRecipient(channels.includes('email') ? user.email : user.phone),
    };
    if (process.env.NODE_ENV === 'test') out.code = code;
    return out;
  }

  async redeemToken(rawToken: string, newPassword: string): Promise<{ user_id: string; email: string; first_name?: string }> {
    if (!rawToken) {
      const err: any = new HttpException('Reset token is required', HttpStatus.BAD_REQUEST);
      err.error_code = 'token_required';
      throw err;
    }
    if (!newPassword || newPassword.length < 8) {
      const err: any = new HttpException('Password must be at least 8 characters', HttpStatus.UNPROCESSABLE_ENTITY);
      err.error_code = 'weak_password';
      throw err;
    }
    const tokenHash = hashSha256(rawToken);
    const reset = await this.passwordResetRepo.findActiveTokenReset(tokenHash);
    if (!reset) {
      const err: any = new HttpException(
        'Invalid or expired reset link. Please request a new one.',
        HttpStatus.BAD_REQUEST
      );
      err.error_code = 'invalid_or_expired_token';
      throw err;
    }

    await this.applyPasswordChange(reset.userId, reset.id, newPassword);
    const email = reset.email || reset.user?.email || '';
    return { user_id: reset.userId, email };
  }

  async redeemOtp({
    identifier,
    code,
    newPassword,
  }: {
    identifier: string;
    code: string;
    newPassword: string;
  }): Promise<{ user_id: string; email: string; first_name?: string }> {
    if (!identifier) {
      const err: any = new HttpException('identifier (email or phone) is required', HttpStatus.UNPROCESSABLE_ENTITY);
      err.error_code = 'identifier_required';
      throw err;
    }
    if (!code || !/^\d{6}$/.test(String(code).trim())) {
      const err: any = new HttpException('A 6-digit code is required', HttpStatus.UNPROCESSABLE_ENTITY);
      err.error_code = 'otp_invalid_format';
      throw err;
    }
    if (!newPassword || newPassword.length < 8) {
      const err: any = new HttpException('Password must be at least 8 characters', HttpStatus.UNPROCESSABLE_ENTITY);
      err.error_code = 'weak_password';
      throw err;
    }

    const user = await this.loadUserForReset(identifier);
    if (!user) {
      const err: any = new HttpException('Invalid or expired reset code', HttpStatus.BAD_REQUEST);
      err.error_code = 'invalid_or_expired_otp';
      throw err;
    }

    const row = await this.passwordResetRepo.findLatestActiveOtpReset(user.id);
    if (!row) {
      const err: any = new HttpException('No active reset code. Request a new one.', HttpStatus.GONE);
      err.error_code = 'otp_expired_or_missing';
      throw err;
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      const err: any = new HttpException('Reset code expired. Request a new one.', HttpStatus.GONE);
      err.error_code = 'otp_expired';
      throw err;
    }
    if (row.attemptCount >= OTP_MAX_ATTEMPTS) {
      await this.passwordResetRepo.markUsed(row.id);
      const err: any = new HttpException('Too many attempts. Request a new code.', HttpStatus.TOO_MANY_REQUESTS);
      err.error_code = 'too_many_attempts';
      throw err;
    }
    if (row.tokenHash !== hashSha256(String(code).trim())) {
      await this.passwordResetRepo.incrementAttemptCount(row.id);
      const err: any = new HttpException('Invalid or expired reset code', HttpStatus.BAD_REQUEST);
      err.error_code = 'invalid_or_expired_otp';
      throw err;
    }

    await this.applyPasswordChange(user.id, row.id, newPassword);
    return { user_id: user.id, email: user.email || '', first_name: user.first_name || undefined };
  }

  private async applyPasswordChange(userId: string, resetId: string, newPassword: string): Promise<void> {
    const newHash = await bcrypt.hash(newPassword, 10);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [newHash, userId]
      );
      await queryRunner.query(
        `UPDATE password_resets SET used_at = NOW() WHERE id = $1`,
        [resetId]
      );
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
