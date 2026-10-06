import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { MailService } from '../../mail';
import { RegistrationEvent, CodeIssuedEvent } from '../constants/registration-events.enum';

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
   * candidate (single or bulk). Pre-claim the candidate has no user account,
   * so the recipient is the email captured on the NIN intake payload.
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
      // Mail is best-effort; never surface a delivery failure to the caller.
      this.logger.warn(
        `[Event: ${RegistrationEvent.CODE_ISSUED}] Failed to send code email for ${event.registrationId}: ${err?.message}`,
      );
    }
  }

  private async loadRecipient(registrationId: string): Promise<{
    email: string | null;
    firstName: string;
    universityName: string;
    institutionIssuedCode: string | null;
    institutionCodeExpiresAt: Date | null;
  } | null> {
    const rows = await this.dataSource.query(
      `SELECT r.id,
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
    if (!row) return null;

    const intake = row.nin_intake || {};
    const nin = row.nin_payload || {};
    const email = row.user_email || intake.email || null;

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

    const firstName = (fullName && fullName.split(/\s+/)[0]) || 'Candidate';

    return {
      email,
      firstName,
      universityName: row.university_name || 'your institution',
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
    // The claim page lives on the candidate-facing frontend, matching legacy
    // `jupeb-mailer.service.js` (`FRONTEND_URL`), not the institution portal.
    const base = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    return `${base.replace(/\/$/, '')}/auth/claim?code=${encodeURIComponent(code || '')}`;
  }
}
