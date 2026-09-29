import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SendMailDto } from '../dto';

const sendEmailWorker = require('../../../utils/utils/sendEmail');

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Generic method to send an email using HTML templates and placeholders.
   */
  async sendMail(dto: SendMailDto): Promise<string | null> {
    try {
      this.logger.log(`Dispatching email to: ${dto.to} (subject: "${dto.subject}")`);
      const result = await sendEmailWorker({
        to: dto.to,
        subject: dto.subject,
        templateFile: dto.templateFile,
        placeholders: dto.placeholders,
        replyTo: dto.replyTo,
        fromEmail: dto.fromEmail,
      });
      return result;
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${dto.to}: ${error.message}`);
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
  async sendForgotPasswordEmail(to: string, placeholders: Record<string, any>): Promise<string | null> {
    return this.sendMail({
      to,
      subject: 'Password Reset Instructions',
      templateFile: 'forgot-password.html',
      placeholders,
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
}
