import { registerAs } from '@nestjs/config';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { IntegrationsConfig } from './config.type';
import { validateConfig } from './validate-config';

class EnvironmentVariablesValidator {
  // SpeedySMS
  @IsString()
  @IsOptional()
  SPEEDYSMS_API_KEY?: string;

  @IsString()
  @IsOptional()
  SPEEDYSMS_API_BASE_URL?: string;

  @IsInt()
  @IsOptional()
  SPEEDYSMS_NIN_TIMEOUT_MS?: number;

  @IsInt()
  @IsOptional()
  SPEEDYSMS_SMS_TIMEOUT_MS?: number;

  @IsString()
  @IsOptional()
  SPEEDYSMS_SENDER_ID?: string;

  // Attendance
  @IsString()
  @IsOptional()
  ATTENDANCE_SERVICE_BASE_URL?: string;

  @IsString()
  @IsOptional()
  ATTENDANCE_APPLICATION_NAME?: string;

  @IsString()
  @IsOptional()
  ATTENDANCE_ADMIN_SECRET?: string;

  @IsBoolean()
  @IsOptional()
  ATTENDANCE_MOCK_STUDENTS?: boolean;

  // CRMS
  @IsString()
  @IsOptional()
  CRMS_SERVICE_BASE_URL?: string;

  @IsString()
  @IsOptional()
  CRMS_SERVICE_API_KEY?: string;

  @IsInt()
  @IsOptional()
  CRMS_SERVICE_TIMEOUT_MS?: number;

  // Paystack
  @IsString()
  @IsOptional()
  PAYSTACK_SECRET_KEY?: string;

  @IsString()
  @IsOptional()
  PAYSTACK_PUBLIC_KEY?: string;

  // CRP SSO
  @IsString()
  @IsOptional()
  CRP_SSO_ISSUER?: string;

  @IsString()
  @IsOptional()
  CRP_SSO_CURRENT_KID?: string;

  @IsString()
  @IsOptional()
  CRP_SSO_PRIVATE_KEY_PEM?: string;

  @IsString()
  @IsOptional()
  CRP_SSO_JWKS_JSON?: string;

  // JUPEB & OTP
  @IsString()
  @IsOptional()
  JUPEB_NIN_PROVIDER?: string;

  @IsInt()
  @IsOptional()
  JUPEB_NIN_RETRY_AFTER_SECONDS?: number;

  @IsInt()
  @IsOptional()
  JUPEB_INSTITUTION_CODE_TTL_HOURS?: number;

  @IsBoolean()
  @IsOptional()
  JUPEB_STUDENT_ROUTES_STRICT?: boolean;

  @IsString()
  @IsOptional()
  OTP_CHANNEL?: string;

  @IsInt()
  @IsOptional()
  OTP_TTL_MINUTES?: number;

  @IsString()
  @IsOptional()
  OTP_SMS_PROVIDER?: string;

  // OAuth
  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_SECRET?: string;

  @IsString()
  @IsOptional()
  FACEBOOK_APP_ID?: string;

  @IsString()
  @IsOptional()
  FACEBOOK_APP_SECRET?: string;

  @IsString()
  @IsOptional()
  GITHUB_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  GITHUB_CLIENT_SECRET?: string;

  @IsString()
  @IsOptional()
  TWITTER_CONSUMER_KEY?: string;

  @IsString()
  @IsOptional()
  TWITTER_CONSUMER_SECRET?: string;
}

export const integrationsConfig = registerAs<IntegrationsConfig>('integrations', () => {
  const env = validateConfig(process.env, EnvironmentVariablesValidator);
  return {
    speedysms: {
      apiKey: env.SPEEDYSMS_API_KEY || process.env.SPEEDYSMS_API_KEY,
      baseUrl: env.SPEEDYSMS_API_BASE_URL || process.env.SPEEDYSMS_API_BASE_URL || 'https://api.speedysms.com.ng',
      ninTimeoutMs: env.SPEEDYSMS_NIN_TIMEOUT_MS || parseInt(process.env.SPEEDYSMS_NIN_TIMEOUT_MS || '15000', 10),
      smsTimeoutMs: env.SPEEDYSMS_SMS_TIMEOUT_MS || parseInt(process.env.SPEEDYSMS_SMS_TIMEOUT_MS || '15000', 10),
      senderId: env.SPEEDYSMS_SENDER_ID || process.env.SPEEDYSMS_SENDER_ID || 'OTP',
      provider: env.JUPEB_NIN_PROVIDER || process.env.JUPEB_NIN_PROVIDER || 'speedysms',
    },
    attendance: {
      baseUrl: env.ATTENDANCE_SERVICE_BASE_URL || process.env.ATTENDANCE_SERVICE_BASE_URL,
      applicationName: env.ATTENDANCE_APPLICATION_NAME || process.env.ATTENDANCE_APPLICATION_NAME,
      adminSecret: env.ATTENDANCE_ADMIN_SECRET || process.env.ATTENDANCE_ADMIN_SECRET,
      mockStudents: env.ATTENDANCE_MOCK_STUDENTS ?? (process.env.ATTENDANCE_MOCK_STUDENTS === 'true'),
    },
    crms: {
      baseUrl: env.CRMS_SERVICE_BASE_URL || process.env.CRMS_SERVICE_BASE_URL,
      apiKey: env.CRMS_SERVICE_API_KEY || process.env.CRMS_SERVICE_API_KEY,
      timeoutMs: env.CRMS_SERVICE_TIMEOUT_MS || parseInt(process.env.CRMS_SERVICE_TIMEOUT_MS || '15000', 10),
    },
    paystack: {
      secretKey: env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY,
      publicKey: env.PAYSTACK_PUBLIC_KEY || process.env.PAYSTACK_PUBLIC_KEY,
    },
    sso: {
      issuer: env.CRP_SSO_ISSUER || process.env.CRP_SSO_ISSUER,
      currentKid: env.CRP_SSO_CURRENT_KID || process.env.CRP_SSO_CURRENT_KID,
      privateKeyPem: env.CRP_SSO_PRIVATE_KEY_PEM || process.env.CRP_SSO_PRIVATE_KEY_PEM,
      jwksJson: env.CRP_SSO_JWKS_JSON || process.env.CRP_SSO_JWKS_JSON,
    },
    jupeb: {
      ninProvider: env.JUPEB_NIN_PROVIDER || process.env.JUPEB_NIN_PROVIDER || 'speedysms',
      ninRetryAfterSeconds: env.JUPEB_NIN_RETRY_AFTER_SECONDS || parseInt(process.env.JUPEB_NIN_RETRY_AFTER_SECONDS || '300', 10),
      institutionCodeTtlHours: env.JUPEB_INSTITUTION_CODE_TTL_HOURS || parseInt(process.env.JUPEB_INSTITUTION_CODE_TTL_HOURS || '24', 10),
      studentRoutesStrict: env.JUPEB_STUDENT_ROUTES_STRICT ?? (process.env.JUPEB_STUDENT_ROUTES_STRICT === 'true'),
    },
    otp: {
      channel: env.OTP_CHANNEL || process.env.OTP_CHANNEL || 'email',
      ttlMinutes: env.OTP_TTL_MINUTES || parseInt(process.env.OTP_TTL_MINUTES || '10', 10),
      smsProvider: env.OTP_SMS_PROVIDER || process.env.OTP_SMS_PROVIDER || 'mock',
    },
    oauth: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
      },
      facebook: {
        appId: env.FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID,
        appSecret: env.FACEBOOK_APP_SECRET || process.env.FACEBOOK_APP_SECRET,
      },
      github: {
        clientId: env.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET,
      },
      twitter: {
        consumerKey: env.TWITTER_CONSUMER_KEY || process.env.TWITTER_CONSUMER_KEY,
        consumerSecret: env.TWITTER_CONSUMER_SECRET || process.env.TWITTER_CONSUMER_SECRET,
      },
    },
  };
});
