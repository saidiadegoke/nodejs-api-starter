import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NinVerificationRepository } from '../repositories/nin-verification.repository';

@Injectable()
export class NinEventsService {
  constructor(
    private readonly ninRepo: NinVerificationRepository,
    private readonly dataSource: DataSource,
  ) {}

  async findLinkedRegistrationUserIds(verificationId: string): Promise<string[]> {
    try {
      const rows = await this.dataSource.query(
        `SELECT user_id FROM jupeb_registrations WHERE nin_verification_id = $1 AND user_id IS NOT NULL`,
        [verificationId],
      );
      return rows.map((r: { user_id: string }) => r.user_id);
    } catch {
      return [];
    }
  }

  async emitNinResolved(verificationId: string, status: string): Promise<void> {
    if (status !== 'verified' && status !== 'failed') return;
    const row = await this.ninRepo.findById(verificationId);
    if (!row) return;

    // Optional event emission to notifications or webhooks if available
  }
}
