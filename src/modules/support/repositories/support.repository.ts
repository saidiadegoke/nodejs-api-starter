import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicketEntity } from '../entities/support-ticket.entity';
import { SupportTicketMessageEntity } from '../entities/support-ticket-message.entity';
import { ListTicketsQueryDto } from '../dto/support.dto';

@Injectable()
export class SupportRepository {
  constructor(
    @InjectRepository(SupportTicketEntity)
    private readonly ticketRepo: Repository<SupportTicketEntity>,
    @InjectRepository(SupportTicketMessageEntity)
    private readonly messageRepo: Repository<SupportTicketMessageEntity>,
  ) {}

  async createTicket(data: Partial<SupportTicketEntity>): Promise<SupportTicketEntity> {
    const ticket = this.ticketRepo.create(data);
    return this.ticketRepo.save(ticket);
  }

  async findTicketById(id: string): Promise<any | null> {
    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .leftJoin('users', 'u', 'u.id = t.user_id')
      .leftJoin('profiles', 'p', 'p.user_id = t.user_id')
      .leftJoin('jupeb_universities', 'uni', 'uni.id = t.university_id')
      .leftJoin('jupeb_registrations', 'r', 'r.id = t.registration_id')
      .select([
        't.id AS id',
        't.ticket_number AS ticket_number',
        't.user_id AS user_id',
        't.university_id AS university_id',
        't.registration_id AS registration_id',
        't.category AS category',
        't.subject AS subject',
        't.message AS message',
        't.priority AS priority',
        't.status AS status',
        't.assigned_to AS assigned_to',
        't.resolved_at AS resolved_at',
        't.created_at AS created_at',
        't.updated_at AS updated_at',
        'u.email AS user_email',
        'u.phone AS user_phone',
        'p.first_name AS first_name',
        'p.last_name AS last_name',
        'p.display_name AS display_name',
        'p.profile_photo_url AS profile_photo_url',
        'uni.name AS university_name',
        'uni.code AS university_code',
        'r.provisional_candidate_code AS provisional_candidate_code',
        'r.jupeb_candidate_number AS jupeb_candidate_number',
      ])
      .where('t.id = :id', { id });

    return qb.getRawOne();
  }

  async findTicketEntityById(id: string): Promise<SupportTicketEntity | null> {
    return this.ticketRepo.findOne({ where: { id } });
  }

  async listTickets(query: ListTicketsQueryDto, scopedUniversityId?: string | null, userId?: string | null) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .leftJoin('users', 'u', 'u.id = t.user_id')
      .leftJoin('profiles', 'p', 'p.user_id = t.user_id')
      .leftJoin('jupeb_universities', 'uni', 'uni.id = t.university_id')
      .select([
        't.id AS id',
        't.ticket_number AS ticket_number',
        't.user_id AS user_id',
        't.university_id AS university_id',
        't.registration_id AS registration_id',
        't.category AS category',
        't.subject AS subject',
        't.message AS message',
        't.priority AS priority',
        't.status AS status',
        't.created_at AS created_at',
        't.updated_at AS updated_at',
        'u.email AS user_email',
        'p.first_name AS first_name',
        'p.last_name AS last_name',
        'p.display_name AS display_name',
        'uni.name AS university_name',
      ]);

    if (userId) {
      qb.andWhere('t.user_id = :userId', { userId });
    }

    if (scopedUniversityId) {
      qb.andWhere('t.university_id = :scopedUniversityId', { scopedUniversityId });
    } else if (query.university_id) {
      qb.andWhere('t.university_id = :universityId', { universityId: query.university_id });
    }

    if (query.status) {
      qb.andWhere('t.status = :status', { status: query.status });
    }

    if (query.priority) {
      qb.andWhere('t.priority = :priority', { priority: query.priority });
    }

    if (query.category) {
      qb.andWhere('t.category = :category', { category: query.category });
    }

    if (query.q) {
      qb.andWhere(
        '(t.ticket_number ILIKE :q OR t.subject ILIKE :q OR t.message ILIKE :q OR u.email ILIKE :q)',
        { q: `%${query.q}%` },
      );
    }

    qb.orderBy('t.created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await qb.getRawMany();
    const countQb = this.ticketRepo.createQueryBuilder('t');

    if (userId) countQb.andWhere('t.user_id = :userId', { userId });
    if (scopedUniversityId) countQb.andWhere('t.university_id = :scopedUniversityId', { scopedUniversityId });
    else if (query.university_id) countQb.andWhere('t.university_id = :universityId', { universityId: query.university_id });
    if (query.status) countQb.andWhere('t.status = :status', { status: query.status });
    if (query.priority) countQb.andWhere('t.priority = :priority', { priority: query.priority });
    if (query.category) countQb.andWhere('t.category = :category', { category: query.category });
    if (query.q) {
      countQb.andWhere(
        '(t.ticket_number ILIKE :q OR t.subject ILIKE :q OR t.message ILIKE :q)',
        { q: `%${query.q}%` },
      );
    }

    const total = await countQb.getCount();
    return { rows, total, page, limit };
  }

  async getStats(universityId?: string | null) {
    const qb = this.ticketRepo.createQueryBuilder('t');
    if (universityId) {
      qb.where('t.university_id = :universityId', { universityId });
    }

    qb.select([
      'COUNT(*)::int AS total',
      "COUNT(*) FILTER (WHERE t.status = 'open')::int AS open",
      "COUNT(*) FILTER (WHERE t.status = 'in_progress')::int AS in_progress",
      "COUNT(*) FILTER (WHERE t.status = 'resolved')::int AS resolved",
      "COUNT(*) FILTER (WHERE t.status = 'closed')::int AS closed",
    ]);

    const res = await qb.getRawOne();
    return {
      total: Number(res?.total) || 0,
      open: Number(res?.open) || 0,
      in_progress: Number(res?.in_progress) || 0,
      resolved: Number(res?.resolved) || 0,
      closed: Number(res?.closed) || 0,
    };
  }

  async updateTicket(id: string, updates: Partial<SupportTicketEntity>): Promise<SupportTicketEntity | null> {
    await this.ticketRepo.update(id, updates);
    return this.ticketRepo.findOne({ where: { id } });
  }

  async createMessage(data: Partial<SupportTicketMessageEntity>): Promise<SupportTicketMessageEntity> {
    const message = this.messageRepo.create({
      ...data,
      attachments: data.attachments || [],
    });
    return this.messageRepo.save(message);
  }

  async listMessagesByTicketId(ticketId: string) {
    const qb = this.messageRepo
      .createQueryBuilder('m')
      .leftJoin('users', 'u', 'u.id = m.sender_id')
      .leftJoin('profiles', 'p', 'p.user_id = m.sender_id')
      .select([
        'm.id AS id',
        'm.ticket_id AS ticket_id',
        'm.sender_id AS sender_id',
        'm.sender_role AS sender_role',
        'm.message AS message',
        'm.attachments AS attachments',
        'm.created_at AS created_at',
        'u.email AS sender_email',
        'p.first_name AS sender_first_name',
        'p.last_name AS sender_last_name',
        'p.display_name AS sender_display_name',
        'p.profile_photo_url AS sender_photo_url',
      ])
      .where('m.ticket_id = :ticketId', { ticketId })
      .orderBy('m.created_at', 'ASC');

    return qb.getRawMany();
  }
}
