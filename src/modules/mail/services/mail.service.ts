import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

import { SendMailDto } from '../dto';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASSWORD');
    const port = Number(this.configService.get('SMTP_PORT', 465));

    if (host && user) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
      });
    }
  }

  /**
   * Generic method to send an email using HTML templates and placeholders.
   */
  async sendMail(dto: SendMailDto): Promise<string | null> {
    if (!dto.to) {
      this.logger.warn('Skipping email send: no recipient provided');
      return null;
    }

    const isTestEnv = this.configService.get('NODE_ENV') === 'test';
    const forceSend = this.configService.get('JUPEB_EMAIL_FORCE') === '1';
    if (isTestEnv && !forceSend) {
      return 'mock-test-message-id';
    }

    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    if (!host || !user) {
      this.logger.warn('Skipping email send: SMTP_HOST or SMTP_USER is not configured');
      return null;
    }

    if (!this.transporter) {
      this.initTransporter();
      if (!this.transporter) return null;
    }

    try {
      this.logger.log(`Dispatching email to: ${dto.to} (subject: "${dto.subject}")`);

      const candidatePaths = [
        path.join(__dirname, '../mail-templates', dto.templateFile),
        path.join(process.cwd(), 'src/modules/mail/mail-templates', dto.templateFile),
        path.join(process.cwd(), 'dist/modules/mail/mail-templates', dto.templateFile),
        path.join(__dirname, '../../modules/mail/mail-templates', dto.templateFile),
        path.join(__dirname, '../../../src/modules/mail/mail-templates', dto.templateFile),
      ];
      const templatePath = candidatePaths.find((p) => fs.existsSync(p)) || candidatePaths[0];
      if (!fs.existsSync(templatePath)) {
        this.logger.error(`Email template file not found: ${dto.templateFile}`);
        return null;
      }

      let htmlContent = fs.readFileSync(templatePath, 'utf-8');

      if (Array.isArray(dto.placeholders)) {
        let placeholderIndex = 0;
        htmlContent = htmlContent.replace(/%s/g, (match) => {
          if (placeholderIndex < (dto.placeholders as any[]).length) {
            return (dto.placeholders as any[])[placeholderIndex++];
          }
          return match;
        });
      } else if (typeof dto.placeholders === 'object' && dto.placeholders !== null) {
        const ph = dto.placeholders as Record<string, any>;
        htmlContent = htmlContent.replace(/\{\{(\w+)\}\}/g, (match, key) => {
          return ph[key] !== undefined && ph[key] !== null ? String(ph[key]) : match;
        });
        if (htmlContent.includes('%s')) {
          const fallbackList = [
            ph.name || ph.firstName || 'User',
            ph.resetUrl || ph.verifyUrl || ph.url || '',
            ph.resetUrl || ph.verifyUrl || ph.url || '',
            ph.email || dto.to,
          ];
          let idx = 0;
          htmlContent = htmlContent.replace(/%s/g, (match) => {
            if (idx < fallbackList.length) {
              return fallbackList[idx++];
            }
            return match;
          });
        }
      }

      const logoLocations = [
        path.join(__dirname, '../mail-templates/assets/logo.png'),
        path.join(process.cwd(), 'src/modules/mail/mail-templates/assets/logo.png'),
        path.join(process.cwd(), 'src/utils/assets/logo.png'),
        path.join(process.cwd(), 'logo.png'),
      ];
      const resolvedLogoPath = logoLocations.find((p) => fs.existsSync(p));

      const attachments: any[] = [];
      if (resolvedLogoPath) {
        attachments.push({
          filename: 'logo.png',
          path: resolvedLogoPath,
          cid: 'jupeb-logo',
        });
      }

      const appName = this.configService.get('APP_NAME', 'Registration Portal');
      const fromEmail = dto.fromEmail || this.configService.get('FROM_EMAIL') || user;

      const mailOptions = {
        from: `"${appName}" <${fromEmail}>`,
        to: dto.to,
        subject: dto.subject,
        html: htmlContent,
        ...(attachments.length > 0 && { attachments }),
        ...(dto.replyTo && { replyTo: dto.replyTo }),
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email successfully sent to ${dto.to} [messageId: ${info.messageId}]`);
      return info.messageId;
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${dto.to}: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Send Welcome Email
   */
  async sendWelcomeEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    return this.sendMail({
      to,
      subject: `Welcome to ${this.configService.get('APP_NAME', 'Registration Portal')}`,
      templateFile: 'welcome.html',
      placeholders,
    });
  }

  /**
   * Send Forgot Password Email
   */
  async sendForgotPasswordEmail(to: string, placeholders: Record<string, any> | any[]): Promise<string | null> {
    const ph = Array.isArray(placeholders)
      ? placeholders
      : [
          placeholders.name || placeholders.firstName || 'User',
          placeholders.resetUrl || '',
          placeholders.resetUrl || '',
          placeholders.email || to,
        ];
    return this.sendMail({
      to,
      subject: 'Password Reset Instructions',
      templateFile: 'forgot-password.html',
      placeholders: ph,
    });
  }

  /**
   * Send OTP Code Email
   */
  async sendOtpEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    return this.sendMail({
      to,
      subject: 'Your Verification Code',
      templateFile: 'otp-code.html',
      placeholders,
    });
  }

  /**
   * Send Password Reset Success Email
   */
  async sendPasswordResetSuccessEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    return this.sendMail({
      to,
      subject: 'Password Changed Successfully',
      templateFile: 'password-reset-success.html',
      placeholders,
    });
  }

  /**
   * Send Email Verification Email
   */
  async sendEmailVerificationEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    return this.sendMail({
      to,
      subject: 'Verify Your Email Address',
      templateFile: 'email-verification.html',
      placeholders,
    });
  }

  /**
   * Send Resend Verification Email
   */
  async sendResendVerificationEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    return this.sendMail({
      to,
      subject: 'Email Verification Link',
      templateFile: 'resend-verification.html',
      placeholders,
    });
  }

  /**
   * Send Support Ticket Created Email
   */
  async sendSupportTicketCreatedEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    return this.sendMail({
      to,
      subject: 'Support Ticket Created',
      templateFile: 'support-ticket-created.html',
      placeholders,
    });
  }

  /**
   * Send Support Ticket Reply Email
   */
  async sendSupportTicketReplyEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    return this.sendMail({
      to,
      subject: 'New Reply to Your Support Ticket',
      templateFile: 'support-ticket-reply.html',
      placeholders,
    });
  }

  /**
   * Send Institution Admin Credentials Email
   */
  async sendInstitutionAdminCredentialsEmail(
    to: string,
    placeholders: {
      firstName?: string;
      universityName?: string;
      email: string;
      password?: string | null;
      loginUrl?: string;
      appName?: string;
      year?: number;
    },
  ): Promise<string | null> {
    const appName = placeholders.appName || this.configService.get('APP_NAME', 'Registration Portal');
    const loginUrl =
      placeholders.loginUrl ||
      this.configService.get('INSTITUTION_FRONTEND_URL') ||
      this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    return this.sendMail({
      to,
      subject: `${appName} — your institution account is ready`,
      templateFile: 'jupeb-institution-admin-credentials.html',
      placeholders: {
        ...placeholders,
        appName,
        loginUrl,
        year: placeholders.year || new Date().getUTCFullYear(),
      },
    });
  }

  /**
   * Send User Credentials Email
   */
  async sendUserCredentialsEmail(
    to: string,
    placeholders: {
      firstName?: string;
      role?: string;
      universityName?: string;
      email: string;
      password?: string | null;
      loginUrl?: string;
      appName?: string;
      year?: number;
    },
  ): Promise<string | null> {
    const appName = placeholders.appName || this.configService.get('APP_NAME', 'Registration Portal');
    const loginUrl =
      placeholders.loginUrl ||
      `${this.configService.get('FRONTEND_URL', 'http://localhost:3000')}/auth/login`;
    return this.sendMail({
      to,
      subject: `${appName} — your account is ready`,
      templateFile: 'jupeb-user-credentials.html',
      placeholders: {
        ...placeholders,
        appName,
        loginUrl,
        year: placeholders.year || new Date().getUTCFullYear(),
      },
    });
  }

  /**
   * Send Welcome Student Email
   */
  async sendWelcomeStudentEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    const appName = this.configService.get('APP_NAME', 'Registration Portal');
    return this.sendMail({
      to,
      subject: `Welcome to ${appName}`,
      templateFile: 'jupeb-welcome-student.html',
      placeholders: {
        ...placeholders,
        appName,
        year: placeholders.year || new Date().getUTCFullYear(),
      },
    });
  }

  /**
   * Send Registration Approved Email
   */
  async sendRegistrationApprovedEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    const appName = this.configService.get('APP_NAME', 'Registration Portal');
    return this.sendMail({
      to,
      subject: `${appName} — your registration has been approved`,
      templateFile: 'jupeb-registration-approved.html',
      placeholders: {
        ...placeholders,
        appName,
        year: placeholders.year || new Date().getUTCFullYear(),
      },
    });
  }

  /**
   * Send Registration Rejected Email
   */
  async sendRegistrationRejectedEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    const appName = this.configService.get('APP_NAME', 'Registration Portal');
    return this.sendMail({
      to,
      subject: `${appName} — update needed on your registration`,
      templateFile: 'jupeb-registration-rejected.html',
      placeholders: {
        ...placeholders,
        appName,
        year: placeholders.year || new Date().getUTCFullYear(),
      },
    });
  }

  /**
   * Send Registration Withdrawn Email
   */
  async sendRegistrationWithdrawnEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    const appName = this.configService.get('APP_NAME', 'Registration Portal');
    return this.sendMail({
      to,
      subject: `${appName} — candidate registration withdrawn`,
      templateFile: 'jupeb-registration-withdrawn.html',
      placeholders: {
        ...placeholders,
        appName,
        year: placeholders.year || new Date().getUTCFullYear(),
      },
    });
  }

  /**
   * Send Registration Locked Email
   */
  async sendRegistrationLockedEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    const appName = this.configService.get('APP_NAME', 'Registration Portal');
    return this.sendMail({
      to,
      subject: `${appName} — your registration dashboard has been locked`,
      templateFile: 'jupeb-registration-locked.html',
      placeholders: {
        ...placeholders,
        appName,
        year: placeholders.year || new Date().getUTCFullYear(),
      },
    });
  }

  /**
   * Send Registration Unlocked Email
   */
  async sendRegistrationUnlockedEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    const appName = this.configService.get('APP_NAME', 'Registration Portal');
    return this.sendMail({
      to,
      subject: `${appName} — your registration dashboard has been unlocked`,
      templateFile: 'jupeb-registration-unlocked.html',
      placeholders: {
        ...placeholders,
        appName,
        year: placeholders.year || new Date().getUTCFullYear(),
      },
    });
  }

  /**
   * Send Registration Deleted Email
   */
  async sendRegistrationDeletedEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    const appName = this.configService.get('APP_NAME', 'Registration Portal');
    return this.sendMail({
      to,
      subject: `${appName} — candidate registration record deleted`,
      templateFile: 'jupeb-registration-deleted.html',
      placeholders: {
        ...placeholders,
        appName,
        year: placeholders.year || new Date().getUTCFullYear(),
      },
    });
  }

  /**
   * Send Registration Code Issued Email
   */
  async sendCodeIssuedEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    const appName = this.configService.get('APP_NAME', 'Registration Portal');
    return this.sendMail({
      to,
      subject: `${appName} — your registration code is ready`,
      templateFile: 'jupeb-code-issued.html',
      placeholders: {
        ...placeholders,
        appName,
        year: placeholders.year || new Date().getUTCFullYear(),
      },
    });
  }

  /**
   * Send Matric / Candidate Number Assigned Email
   */
  async sendMatricAssignedEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    const appName = this.configService.get('APP_NAME', 'Registration Portal');
    return this.sendMail({
      to,
      subject: `${appName} — your JUPEB candidate number is ${placeholders.candidateNumber || ''}`,
      templateFile: 'jupeb-matric-assigned.html',
      placeholders: {
        ...placeholders,
        appName,
        year: placeholders.year || new Date().getUTCFullYear(),
      },
    });
  }

  /**
   * Send Direct Bank Transfer Instructions Email
   */
  async sendDirectTransferInstructionsEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    const appName = this.configService.get('APP_NAME', 'Registration Portal');
    return this.sendMail({
      to,
      subject: `${appName} — Bank Transfer Payment Instructions`,
      templateFile: 'direct-transfer-instructions.html',
      placeholders: {
        ...placeholders,
        appName,
        year: placeholders.year || new Date().getUTCFullYear(),
      },
    });
  }
}
