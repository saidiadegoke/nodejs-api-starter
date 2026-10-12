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
        't.resolved_by AS resolved_by',
        't.resolution_notes AS resolution_notes',
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
        'r.institution_issued_code AS institution_issued_code',
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
        't.resolved_by AS resolved_by',
        't.resolution_notes AS resolution_notes',
        't.created_at AS created_at',
        't.updated_at AS updated_at',
        'u.email AS user_email',
        'u.phone AS user_phone',
        'p.first_name AS first_name',
        'p.last_name AS last_name',
        'p.display_name AS display_name',
        'uni.name AS university_name',
        'r.jupeb_candidate_number AS jupeb_candidate_number',
        'r.provisional_candidate_code AS provisional_candidate_code',
        'r.institution_issued_code AS institution_issued_code',
      ]);

    if (userId) {
      qb.andWhere('t.user_id = :userId', { userId });
    }

    if (scopedUniversityId) {
      qb.andWhere('t.university_id = :scopedUniversityId', { scopedUniversityId });
    } else if (query.university_id) {
      qb.andWhere('t.university_id = :universityId', { universityId: query.university_id });
    }

    // Status filter (single or multiple comma-separated / array, e.g. open,closed)
    const rawStatus = (query as any).status ?? (query as any).statuses;
    if (rawStatus !== undefined && rawStatus !== null && rawStatus !== '') {
      const statusList = (Array.isArray(rawStatus) ? rawStatus : String(rawStatus).split(','))
        .map((s: any) => String(s).trim())
        .filter((s: string) => Boolean(s) && s.toLowerCase() !== 'all');

      if (statusList.length === 1) {
        qb.andWhere('t.status = :status', { status: statusList[0] });
      } else if (statusList.length > 1) {
        qb.andWhere('t.status IN (:...statuses)', { statuses: statusList });
      }
    }

    // Priority filter (single or multiple comma-separated / array, e.g. high,urgent)
    const rawPriority = (query as any).priority ?? (query as any).priorities;
    if (rawPriority !== undefined && rawPriority !== null && rawPriority !== '') {
      const priorityList = (Array.isArray(rawPriority) ? rawPriority : String(rawPriority).split(','))
        .map((p: any) => String(p).trim())
        .filter(Boolean);

      if (priorityList.length === 1) {
        qb.andWhere('t.priority = :priority', { priority: priorityList[0] });
      } else if (priorityList.length > 1) {
        qb.andWhere('t.priority IN (:...priorities)', { priorities: priorityList });
      }
    }

    // Category filter (single or multiple comma-separated / array)
    const rawCategory = (query as any).category ?? (query as any).categories;
    if (rawCategory !== undefined && rawCategory !== null && rawCategory !== '') {
      const categoryList = (Array.isArray(rawCategory) ? rawCategory : String(rawCategory).split(','))
        .map((c: any) => String(c).trim())
        .filter(Boolean);

      if (categoryList.length === 1) {
        qb.andWhere('t.category = :category', { category: categoryList[0] });
      } else if (categoryList.length > 1) {
        qb.andWhere('t.category IN (:...categories)', { categories: categoryList });
      }
    }

    // 1. Date range filters (start_date / end_date + aliases)
    const startDateRaw = (
      query.start_date ||
      query.startDate ||
      query.from ||
      query.from_date ||
      ''
    ).toString().trim();

    if (startDateRaw) {
      const parsedStart = /^\d{4}-\d{2}-\d{2}$/.test(startDateRaw)
        ? new Date(`${startDateRaw}T00:00:00.000Z`)
        : new Date(startDateRaw);
      if (!isNaN(parsedStart.getTime())) {
        qb.andWhere('t.created_at >= :startDate', { startDate: parsedStart });
      }
    }

    const endDateRaw = (
      query.end_date ||
      query.endDate ||
      query.to ||
      query.to_date ||
      ''
    ).toString().trim();

    if (endDateRaw) {
      const parsedEnd = /^\d{4}-\d{2}-\d{2}$/.test(endDateRaw)
        ? new Date(`${endDateRaw}T23:59:59.999Z`)
        : new Date(endDateRaw);
      if (!isNaN(parsedEnd.getTime())) {
        qb.andWhere('t.created_at <= :endDate', { endDate: parsedEnd });
      }
    }

    // 2. Search query filter (q, search, query, keyword)
    const searchTerm = (
      query.q ||
      query.search ||
      query.query ||
      query.keyword ||
      ''
    ).toString().trim();

    if (searchTerm) {
      const term = `%${searchTerm}%`;
      qb.andWhere(
        `(
          t.ticket_number ILIKE :term OR
          t.subject ILIKE :term OR
          t.message ILIKE :term OR
          t.category ILIKE :term OR
          u.email ILIKE :term OR
          u.phone ILIKE :term OR
          p.first_name ILIKE :term OR
          p.last_name ILIKE :term OR
          p.display_name ILIKE :term OR
          CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, '')) ILIKE :term OR
          CONCAT(COALESCE(p.last_name, ''), ' ', COALESCE(p.first_name, '')) ILIKE :term OR
          r.provisional_candidate_code ILIKE :term OR
          r.jupeb_candidate_number ILIKE :term OR
          r.institution_issued_code ILIKE :term OR
          EXISTS (
            SELECT 1 FROM jupeb_registrations cr
            WHERE cr.user_id = t.user_id
              AND (
                cr.provisional_candidate_code ILIKE :term OR
                cr.jupeb_candidate_number ILIKE :term OR
                cr.institution_issued_code ILIKE :term
              )
          )
        )`,
        { term },
      );
    }

    const total = await qb.clone().getCount();
    const rows = await qb
      .orderBy('t.created_at', 'DESC')
      .limit(limit)
      .offset(offset)
      .getRawMany();

    return { rows, total: Number(total) || 0, page, limit };
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

    let by_university: any[] = [];
    let by_category: any[] = [];

    if (!universityId) {
      by_university = await this.ticketRepo
        .createQueryBuilder('t')
        .leftJoin('jupeb_universities', 'uni', 'uni.id = t.university_id')
        .select([
          't.university_id AS university_id',
          'uni.name AS university_name',
          'COUNT(*)::int AS count',
        ])
        .groupBy('t.university_id, uni.name')
        .getRawMany();

      by_category = await this.ticketRepo
        .createQueryBuilder('t')
        .select(['t.category AS category', 'COUNT(*)::int AS count'])
        .groupBy('t.category')
        .getRawMany();
    }

    return {
      total: Number(res?.total) || 0,
      open: Number(res?.open) || 0,
      in_progress: Number(res?.in_progress) || 0,
      resolved: Number(res?.resolved) || 0,
      closed: Number(res?.closed) || 0,
      by_university,
      by_category,
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
