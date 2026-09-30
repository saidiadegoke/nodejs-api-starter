import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionEventEntity } from '../entities/session-event.entity';

@Injectable()
export class SessionEventRepository {
  constructor(
    @InjectRepository(SessionEventEntity)
    private readonly repo: Repository<SessionEventEntity>,
  ) {}

  async insertEvent(
    sessionId: string,
    eventType: string,
    payload: Record<string, unknown> = {},
    createdBy?: string | null,
  ): Promise<SessionEventEntity> {
    const event = this.repo.create({
      sessionId,
      eventType,
      payload,
      createdBy: createdBy || null,
    });
    return this.repo.save(event);
  }

  async findBySessionId(sessionId: string): Promise<SessionEventEntity[]> {
    return this.repo.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });
  }
}
