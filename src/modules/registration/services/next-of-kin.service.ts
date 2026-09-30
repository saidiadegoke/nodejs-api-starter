import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { NextOfKinRepository } from '../repositories/next-of-kin.repository';
import { RegistrationRepository } from '../repositories/registration.repository';
import { NextOfKinEntity, NextOfKinSource } from '../entities/next-of-kin.entity';
import { CreateNextOfKinDto } from '../dto/list-registrations-query.dto';
import { NextOfKinResponseDto } from '../dto/next-of-kin-response.dto';

const ALLOWED_RELATIONSHIPS = new Set([
  'mother',
  'father',
  'parent',
  'guardian',
  'spouse',
  'sibling',
  'child',
  'relative',
  'friend',
  'other',
]);

@Injectable()
export class NextOfKinService {
  constructor(
    private readonly nokRepo: NextOfKinRepository,
    private readonly registrationRepo: RegistrationRepository,
  ) {}

  private validatePayload(body: CreateNextOfKinDto) {
    if (!body || typeof body !== 'object') {
      throw new UnprocessableEntityException('Body is required');
    }
    if (!body.name || body.name.trim().length < 2) {
      throw new UnprocessableEntityException('name must be at least 2 characters');
    }
    const rel = String(body.relationship || '').toLowerCase();
    if (!ALLOWED_RELATIONSHIPS.has(rel)) {
      throw new UnprocessableEntityException(
        `relationship must be one of: ${Array.from(ALLOWED_RELATIONSHIPS).join(', ')}`,
      );
    }
    const phone = body.phone ? String(body.phone).trim() : null;
    const email = body.email ? String(body.email).trim() : null;
    if (!phone && !email) {
      throw new UnprocessableEntityException('phone or email is required');
    }
    return {
      name: body.name.trim(),
      relationship: rel,
      phone,
      email,
      address: body.address ? String(body.address).trim() : null,
    };
  }

  private async loadStudentRegistration(userId: string) {
    const reg = await this.registrationRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found for current user');
    return reg;
  }

  private sanitizeNok(entity: NextOfKinEntity): NextOfKinResponseDto {
    return {
      id: entity.id,
      registration_id: entity.registrationId,
      name: entity.name,
      relationship: entity.relationship,
      phone: entity.phone,
      email: entity.email,
      address: entity.address,
      source: entity.source,
      created_at: entity.createdAt ? entity.createdAt.toISOString() : new Date().toISOString(),
      updated_at: entity.updatedAt ? entity.updatedAt.toISOString() : new Date().toISOString(),
    };
  }

  async getMine(userId: string): Promise<NextOfKinResponseDto> {
    const reg = await this.loadStudentRegistration(userId);
    const row = await this.nokRepo.findActiveByRegistration(reg.id);
    if (!row) throw new NotFoundException('No next-of-kin recorded yet');
    return this.sanitizeNok(row);
  }

  async createMine(userId: string, body: CreateNextOfKinDto): Promise<NextOfKinResponseDto> {
    const reg = await this.loadStudentRegistration(userId);
    const existing = await this.nokRepo.findActiveByRegistration(reg.id);
    if (existing) {
      throw new ConflictException('A next-of-kin already exists. Use PUT to replace it.');
    }
    const payload = this.validatePayload(body);
    const row = await this.nokRepo.create({
      registrationId: reg.id,
      name: payload.name,
      relationship: payload.relationship,
      phone: payload.phone,
      email: payload.email,
      address: payload.address,
      source: NextOfKinSource.STUDENT,
      createdBy: userId,
    });
    return this.sanitizeNok(row);
  }

  async replaceMine(userId: string, body: CreateNextOfKinDto): Promise<NextOfKinResponseDto> {
    const reg = await this.loadStudentRegistration(userId);
    const payload = this.validatePayload(body);

    await this.nokRepo.softDeleteByRegistration(reg.id);

    const row = await this.nokRepo.create({
      registrationId: reg.id,
      name: payload.name,
      relationship: payload.relationship,
      phone: payload.phone,
      email: payload.email,
      address: payload.address,
      source: NextOfKinSource.STUDENT,
      createdBy: userId,
    });
    return this.sanitizeNok(row);
  }

  async listHistoryMine(userId: string): Promise<{ registration_id: string; history: NextOfKinResponseDto[] }> {
    const reg = await this.loadStudentRegistration(userId);
    const rows = await this.nokRepo.findHistoryByRegistration(reg.id);
    return {
      registration_id: reg.id,
      history: rows.map((r) => this.sanitizeNok(r)),
    };
  }
}
