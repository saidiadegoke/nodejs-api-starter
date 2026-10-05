import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { OtpCodeRepository } from '../repositories/otp-code.repository';
import { resolveName, getProvider } from './sms-providers';

import { MailService } from '../../mail';

const OTP_LENGTH = 6;
const MAX_ATTEMPTS = 5;

function appName(): string {
  return process.env.APP_NAME || 'Registration Portal';
}

function ttlMs(): number {
  const mins = Number(process.env.OTP_TTL_MINUTES) || 10;
  return Math.max(1, mins) * 60 * 1000;
}

function resolveChannel(explicit?: string): string {
  const raw = (explicit || process.env.OTP_CHANNEL || 'email').toLowerCase();
  return ['email', 'sms', 'both'].includes(raw) ? raw : 'email';
}

function generateCode(): string {
  const n = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return String(n).padStart(OTP_LENGTH, '0');
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

@Injectable()
export class OtpService {
  constructor(
    private readonly otpCodeRepo: OtpCodeRepository,
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
  ) {}

  private async loadUser(userId: string): Promise<any | null> {
    const rows = await this.dataSource.query(
      `SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified,
              p.first_name
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id
        WHERE u.id = $1 LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  }

  private dispatchEmail({ user, code }: { user: any; code: string }): void {
    if (!user.email) return;
    const ttlMinutes = Math.round(ttlMs() / 60000);
    this.mailService.sendOtpEmail(user.email, {
      appName: appName(),
      firstName: user.first_name || 'there',
      code,
      ttlMinutes,
      email: user.email,
      year: new Date().getUTCFullYear(),
    }).catch((err: any) => {
      // eslint-disable-next-line no-console
      console.warn('[otp.dispatchEmail] send failed:', err && err.message);
    });
  }

  private dispatchSms({ user, code }: { user: any; code: string }): void {
    if (!user.phone) return;
    const providerName = resolveName();
    const provider = getProvider(providerName);
    const ttlMinutes = Math.round(ttlMs() / 60000);
    const message = `${appName()}: your verification code is ${code}. Expires in ${ttlMinutes} minutes.`;
    Promise.resolve(provider.sendSms({ phone: user.phone, message }))
      .then((result) => {
        if (result && result.outcome !== 'sent') {
          // eslint-disable-next-line no-console
          console.warn(
            `[otp.dispatchSms:${providerName}] outcome=${result.outcome} error=${result.error_message || result.error_code || 'unknown'}`
          );
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`[otp.dispatchSms:${providerName}] send failed:`, err && err.message);
      });
  }

  async issueOtp(
    userId: string,
    { channel, ipAddress, userAgent }: { channel?: string; ipAddress?: string; userAgent?: string } = {}
  ): Promise<{ otp_id: string; channels: string[]; expires_at: Date; code?: string }> {
    const user = await this.loadUser(userId);
    if (!user) {
      const err: any = new HttpException('User not found', HttpStatus.NOT_FOUND);
      err.error_code = 'user_not_found';
      throw err;
    }

    const resolved = resolveChannel(channel);
    if (resolved === 'email' && !user.email) {
      const err: any = new HttpException('User has no email on file', HttpStatus.UNPROCESSABLE_ENTITY);
      err.error_code = 'email_required';
      throw err;
    }
    if (resolved === 'sms' && !user.phone) {
      const err: any = new HttpException('User has no phone on file', HttpStatus.UNPROCESSABLE_ENTITY);
      err.error_code = 'phone_required';
      throw err;
    }
    if (resolved === 'both' && !user.email && !user.phone) {
      const err: any = new HttpException(
        'User has neither email nor phone on file',
        HttpStatus.UNPROCESSABLE_ENTITY
      );
      err.error_code = 'identifier_required';
      throw err;
    }

    const code = generateCode();
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + ttlMs());

    const saved = await this.otpCodeRepo.purgeAndCreate({
      userId,
      codeHash,
      channel: resolved,
      email: user.email || null,
      phone: user.phone || null,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt,
    });

    const targets: string[] = [];
    if (resolved === 'email' || resolved === 'both') targets.push('email');
    if (resolved === 'sms' || resolved === 'both') targets.push('sms');

    setImmediate(() => {
      for (const t of targets) {
        if (t === 'email') this.dispatchEmail({ user, code });
        else this.dispatchSms({ user, code });
      }
    });

    const out: any = {
      otp_id: saved.id,
      channels: targets,
      expires_at: saved.expiresAt,
    };
    if (process.env.NODE_ENV === 'test') out.code = code;
    return out;
  }

  async verifyOtp(userId: string, rawCode: string): Promise<{ verified: boolean; channel: string }> {
    if (!rawCode || typeof rawCode !== 'string') {
      const err: any = new HttpException('OTP is required', HttpStatus.UNPROCESSABLE_ENTITY);
      err.error_code = 'otp_required';
      throw err;
    }
    const trimmed = rawCode.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      const err: any = new HttpException('OTP must be a 6-digit number', HttpStatus.UNPROCESSABLE_ENTITY);
      err.error_code = 'otp_invalid_format';
      throw err;
    }

    const row = await this.otpCodeRepo.findLatestActiveOtp(userId);
    if (!row) {
      const err: any = new HttpException(
        'No active verification code. Request a new one.',
        HttpStatus.GONE
      );
      err.error_code = 'otp_expired_or_missing';
      throw err;
    }

    if (new Date(row.expiresAt).getTime() < Date.now()) {
      const err: any = new HttpException('Verification code expired. Request a new one.', HttpStatus.GONE);
      err.error_code = 'otp_expired';
      throw err;
    }

    if (row.attemptCount >= MAX_ATTEMPTS) {
      const err: any = new HttpException('Too many attempts. Request a new code.', HttpStatus.TOO_MANY_REQUESTS);
      err.error_code = 'too_many_attempts';
      throw err;
    }

    if (row.codeHash !== hashCode(trimmed)) {
      await this.otpCodeRepo.incrementAttemptCount(row.id);
      const err: any = new HttpException('Invalid verification code', HttpStatus.BAD_REQUEST);
      err.error_code = 'invalid_otp';
      throw err;
    }

    await this.otpCodeRepo.markVerified(row.id);

    const flips: string[] = [];
    if (row.channel === 'email' || row.channel === 'both') {
      flips.push('email_verified = TRUE, email_verified_at = COALESCE(email_verified_at, NOW())');
    }
    if (row.channel === 'sms' || row.channel === 'both') {
      flips.push('phone_verified = TRUE');
    }
    if (flips.length) {
      await this.dataSource.query(
        `UPDATE users SET ${flips.join(', ')}, updated_at = NOW() WHERE id = $1`,
        [userId]
      );
    }

    return { verified: true, channel: row.channel };
  }

  static _hashCode(code: string): string {
    return hashCode(code);
  }

  static _generateCode(): string {
    return generateCode();
  }
}

const otpServiceExport: any = {
  OtpService,
  default: OtpService,
  _hashCode: hashCode,
  _generateCode: generateCode,
};

module.exports = otpServiceExport;
module.exports.OtpService = OtpService;
module.exports.default = OtpService;
module.exports._hashCode = hashCode;
module.exports._generateCode = generateCode;

