import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { MailService } from '../../mail';
import {
  RegistrationEvent,
  CodeIssuedEvent,
  MatricAssignedEvent,
  RegistrationStatusChangeEvent,
} from '../constants/registration-events.enum';

const CONTEXT = 'RegistrationMailListener';

@Injectable()
export class RegistrationMailListener {
  private readonly logger = new Logger(CONTEXT);

  constructor(
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Send the registration-code-issued email after an institution creates a
   * candidate (single or bulk).
   */
  @OnEvent(RegistrationEvent.CODE_ISSUED, { async: true })
  async handleCodeIssued(event: CodeIssuedEvent): Promise<void> {
    try {
      const recipient = await this.loadRecipient(event.registrationId);
      if (!recipient || !recipient.email || !recipient.institutionIssuedCode) return;

      const expiryNotice = recipient.institutionCodeExpiresAt
        ? `<p style="margin: 16px 0 0 0; font-size: 14px; color: #b91c1c;">This code expires on ${this.formatDate(recipient.institutionCodeExpiresAt)}. Claim it before then.</p>`
        : '';

      await this.mailService.sendCodeIssuedEmail(recipient.email, {
        firstName: recipient.firstName,
        universityName: recipient.universityName,
        code: recipient.institutionIssuedCode,
        claimUrl: this.claimUrl(recipient.institutionIssuedCode),
        expiryNotice,
        email: recipient.email,
      });

      this.logger.log(
        `[Event: ${RegistrationEvent.CODE_ISSUED}] Sent registration code email for ${event.registrationId}`,
      );
    } catch (err: any) {
      this.logger.warn(
        `[Event: ${RegistrationEvent.CODE_ISSUED}] Failed to send code email for ${event.registrationId}: ${err?.message}`,
      );
    }
  }

  /**
   * Send permanent JUPEB candidate number assigned email.
   */
  @OnEvent(RegistrationEvent.MATRIC_ASSIGNED, { async: true })
  async handleMatricAssigned(event: MatricAssignedEvent): Promise<void> {
    try {
      const recipient = await this.loadRecipient(event.registrationId);
      if (!recipient || !recipient.email) return;

      await this.mailService.sendMatricAssignedEmail(recipient.email, {
        firstName: recipient.firstName,
        universityName: recipient.universityName,
        candidateNumber: event.candidateNumber,
        dashboardUrl: this.dashboardUrl(),
        email: recipient.email,
      });

      this.logger.log(
        `[Event: ${RegistrationEvent.MATRIC_ASSIGNED}] Sent candidate number email for ${event.registrationId} (${event.candidateNumber})`,
      );
    } catch (err: any) {
      this.logger.warn(
        `[Event: ${RegistrationEvent.MATRIC_ASSIGNED}] Failed to send candidate number email for ${event.registrationId}: ${err?.message}`,
      );
    }
  }

  /**
   * Send candidate registration approved email.
   */
  @OnEvent(RegistrationEvent.APPROVED, { async: true })
  async handleApproved(event: RegistrationStatusChangeEvent): Promise<void> {
    try {
      const recipient = await this.loadRecipient(event.registrationId, event);
      if (!recipient || !recipient.email) return;

      const approvedAt = new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      await this.mailService.sendRegistrationApprovedEmail(recipient.email, {
        firstName: recipient.firstName,
        universityName: recipient.universityName,
        candidateNumber:
          event.candidateNumber ||
          recipient.candidateNumber ||
          recipient.institutionIssuedCode ||
          'Assigned',
        approvedAt,
        dashboardUrl: this.dashboardUrl(),
        email: recipient.email,
      });

      this.logger.log(
        `[Event: ${RegistrationEvent.APPROVED}] Sent registration approved email for ${event.registrationId}`,
      );
    } catch (err: any) {
      this.logger.warn(
        `[Event: ${RegistrationEvent.APPROVED}] Failed to send approved email for ${event.registrationId}: ${err?.message}`,
      );
    }
  }

  /**
   * Send candidate registration rejected email.
   */
  @OnEvent(RegistrationEvent.REJECTED, { async: true })
  async handleRejected(event: RegistrationStatusChangeEvent): Promise<void> {
    try {
      const recipient = await this.loadRecipient(event.registrationId, event);
      if (!recipient || !recipient.email) return;

      const reason =
        event.reason ||
        'Your registration requires updates before it can be approved. Please review the details in your portal.';

      await this.mailService.sendRegistrationRejectedEmail(recipient.email, {
        firstName: recipient.firstName,
        universityName: recipient.universityName,
        reason,
        dashboardUrl: this.dashboardUrl(),
        email: recipient.email,
      });

      this.logger.log(
        `[Event: ${RegistrationEvent.REJECTED}] Sent registration rejected email for ${event.registrationId}`,
      );
    } catch (err: any) {
      this.logger.warn(
        `[Event: ${RegistrationEvent.REJECTED}] Failed to send rejected email for ${event.registrationId}: ${err?.message}`,
      );
    }
  }

  /**
   * Send candidate registration withdrawn email.
   */
  @OnEvent(RegistrationEvent.WITHDRAWN, { async: true })
  async handleWithdrawn(event: RegistrationStatusChangeEvent): Promise<void> {
    try {
      const recipient = await this.loadRecipient(event.registrationId, event);
      if (!recipient || !recipient.email) return;

      const reasonBlock = event.reason
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #64748b; border-radius: 8px; margin: 20px 0;"><tr><td style="padding: 16px 20px;"><p style="margin: 0 0 4px 0; font-size: 12px; color: #475569; font-weight: 600; text-transform: uppercase;">Withdrawal Reason</p><p style="margin: 0; font-size: 14px; color: #1e293b;">${event.reason}</p></td></tr></table>`
        : '';

      await this.mailService.sendRegistrationWithdrawnEmail(recipient.email, {
        firstName: recipient.firstName,
        universityName: recipient.universityName,
        reasonBlock,
        dashboardUrl: this.dashboardUrl(),
        email: recipient.email,
      });

      this.logger.log(
        `[Event: ${RegistrationEvent.WITHDRAWN}] Sent registration withdrawn email for ${event.registrationId}`,
      );
    } catch (err: any) {
      this.logger.warn(
        `[Event: ${RegistrationEvent.WITHDRAWN}] Failed to send withdrawn email for ${event.registrationId}: ${err?.message}`,
      );
    }
  }

  /**
   * Send candidate registration record deleted email.
   */
  @OnEvent(RegistrationEvent.DELETED, { async: true })
  async handleDeleted(event: RegistrationStatusChangeEvent): Promise<void> {
    try {
      const recipient = await this.loadRecipient(event.registrationId, event);
      if (!recipient || !recipient.email) return;

      const reasonBlock = event.reason
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; border-radius: 8px; margin: 20px 0;"><tr><td style="padding: 16px 20px;"><p style="margin: 0 0 4px 0; font-size: 12px; color: #991b1b; font-weight: 600; text-transform: uppercase;">Reason</p><p style="margin: 0; font-size: 14px; color: #1e293b;">${event.reason}</p></td></tr></table>`
        : '';

      const base = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
      const loginUrl = `${base.replace(/\/$/, '')}/auth/login`;

      await this.mailService.sendRegistrationDeletedEmail(recipient.email, {
        firstName: recipient.firstName,
        universityName: recipient.universityName,
        reasonBlock,
        dashboardUrl: loginUrl,
        email: recipient.email,
      });

      this.logger.log(
        `[Event: ${RegistrationEvent.DELETED}] Sent registration deleted email for ${event.registrationId}`,
      );
    } catch (err: any) {
      this.logger.warn(
        `[Event: ${RegistrationEvent.DELETED}] Failed to send deleted email for ${event.registrationId}: ${err?.message}`,
      );
    }
  }

  /**
   * Send candidate dashboard unlocked email.
   */
  @OnEvent(RegistrationEvent.UNLOCKED, { async: true })
  async handleUnlocked(event: RegistrationStatusChangeEvent): Promise<void> {
    try {
      const recipient = await this.loadRecipient(event.registrationId, event);
      if (!recipient || !recipient.email) return;

      await this.mailService.sendRegistrationUnlockedEmail(recipient.email, {
        firstName: recipient.firstName,
        universityName: recipient.universityName,
        dashboardUrl: this.dashboardUrl(),
        email: recipient.email,
      });

      this.logger.log(
        `[Event: ${RegistrationEvent.UNLOCKED}] Sent dashboard unlocked email for ${event.registrationId}`,
      );
    } catch (err: any) {
      this.logger.warn(
        `[Event: ${RegistrationEvent.UNLOCKED}] Failed to send unlocked email for ${event.registrationId}: ${err?.message}`,
      );
    }
  }

  /**
   * Send candidate dashboard locked email.
   */
  @OnEvent(RegistrationEvent.LOCKED, { async: true })
  async handleLocked(event: RegistrationStatusChangeEvent): Promise<void> {
    try {
      const recipient = await this.loadRecipient(event.registrationId, event);
      if (!recipient || !recipient.email) return;

      const reasonBlock = event.reason
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #64748b; border-radius: 8px; margin: 20px 0;"><tr><td style="padding: 16px 20px;"><p style="margin: 0 0 4px 0; font-size: 12px; color: #475569; font-weight: 600; text-transform: uppercase;">Remark / Reason</p><p style="margin: 0; font-size: 14px; color: #1e293b;">${event.reason}</p></td></tr></table>`
        : '';

      await this.mailService.sendRegistrationLockedEmail(recipient.email, {
        firstName: recipient.firstName,
        universityName: recipient.universityName,
        reasonBlock,
        dashboardUrl: this.dashboardUrl(),
        email: recipient.email,
      });

      this.logger.log(
        `[Event: ${RegistrationEvent.LOCKED}] Sent dashboard locked email for ${event.registrationId}`,
      );
    } catch (err: any) {
      this.logger.warn(
        `[Event: ${RegistrationEvent.LOCKED}] Failed to send locked email for ${event.registrationId}: ${err?.message}`,
      );
    }
  }

  private async loadRecipient(
    registrationId: string,
    fallback?: Partial<RegistrationStatusChangeEvent>,
  ): Promise<{
    email: string | null;
    firstName: string;
    universityName: string;
    candidateNumber: string | null;
    institutionIssuedCode: string | null;
    institutionCodeExpiresAt: Date | null;
  } | null> {
    const rows = await this.dataSource.query(
      `SELECT r.id,
              r.jupeb_candidate_number,
              r.institution_issued_code,
              r.institution_code_expires_at,
              u.email AS user_email,
              p.first_name AS profile_first_name,
              p.last_name AS profile_last_name,
              p.display_name AS profile_display_name,
              uni.name AS university_name,
              n.intake_payload AS nin_intake,
              n.response_payload AS nin_payload,
              n.status AS nin_verification_status
         FROM jupeb_registrations r
         LEFT JOIN users u                   ON u.id = r.user_id
         LEFT JOIN profiles p                ON p.user_id = r.user_id
         LEFT JOIN jupeb_universities uni    ON uni.id = r.university_id
         LEFT JOIN jupeb_nin_verifications n ON n.id = r.nin_verification_id
        WHERE r.id = $1`,
      [registrationId],
    );
    const row = rows[0];
    if (!row) {
      if (fallback?.email) {
        return {
          email: fallback.email,
          firstName: fallback.firstName || 'Candidate',
          universityName: fallback.universityName || 'your institution',
          candidateNumber: fallback.candidateNumber || null,
          institutionIssuedCode: null,
          institutionCodeExpiresAt: null,
        };
      }
      return null;
    }

    const intake = row.nin_intake || {};
    const nin = row.nin_payload || {};
    const email = row.user_email || intake.email || fallback?.email || null;

    let fullName: string | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { resolveCandidateDisplayName } = require('../../jupeb/utils/candidate-name');
      fullName = resolveCandidateDisplayName({
        ninPayload: nin,
        intake,
        profile: {
          first_name: row.profile_first_name,
          last_name: row.profile_last_name,
          display_name: row.profile_display_name,
        },
        ninStatus: row.nin_verification_status || null,
      });
    } catch {
      fullName = row.profile_display_name || null;
    }

    const firstName =
      (fullName && fullName.split(/\s+/)[0]) || fallback?.firstName || 'Candidate';

    return {
      email,
      firstName,
      universityName: row.university_name || fallback?.universityName || 'your institution',
      candidateNumber: row.jupeb_candidate_number || fallback?.candidateNumber || null,
      institutionIssuedCode: row.institution_issued_code || null,
      institutionCodeExpiresAt: row.institution_code_expires_at || null,
    };
  }

  private formatDate(value: Date | string): string {
    try {
      return new Date(value).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  }

  private claimUrl(code: string): string {
    const base = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    return `${base.replace(/\/$/, '')}/auth/claim?code=${encodeURIComponent(code || '')}`;
  }

  private dashboardUrl(): string {
    const base = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    return `${base.replace(/\/$/, '')}/dashboard`;
  }
}
