import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../../logger';
import { SupportRepository } from '../repositories/support.repository';
import { InstitutionUserScopeService } from '../../registration/services/institution-user-scope.service';
import {
  CreateSupportTicketDto,
  AddTicketMessageDto,
  UpdateTicketStatusDto,
  AdminUpdateTicketDto,
  ListTicketsQueryDto,
  SupportTicketResponseDto,
  SupportTicketListResponseDto,
  SupportStatsResponseDto,
  SupportMessageResponseDto,
} from '../dto';

export const SUPPORT_CATEGORIES = [
  'Registration',
  'Account & Profile',
  'Email Address',
  'Subject combinations',
  'Result issue',
  'Attendance issue',
  'Something else',
];

function generateTicketNumber(): string {
  const d = new Date();
  const yearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TKT-${yearMonth}-${randomSuffix}`;
}

@Injectable()
export class SupportService {
  private readonly logger;

  constructor(
    private readonly supportRepo: SupportRepository,
    private readonly institutionUserScopeService: InstitutionUserScopeService,
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(SupportService.name);
  }

  getCategories(): any {
    return SUPPORT_CATEGORIES;
  }

  private mapTicketRow(r: any): SupportTicketResponseDto {
    const subjectCombination = (r.subject_combination_id || r.subject_combination_code || r.subject_combination_title)
      ? {
          id: r.subject_combination_id || null,
          code: r.subject_combination_code || '-',
          title: r.subject_combination_title || r.subject_combination_code || '-',
          subject_items: r.subject_items || [],
          items: r.subject_items || [],
        }
      : null;

    return {
      id: r.id,
      ticket_number: r.ticket_number,
      user_id: r.user_id,
      university_id: r.university_id,
      registration_id: r.registration_id,
      category: r.category,
      subject: r.subject,
      message: r.message,
      priority: r.priority,
      status: r.status,
      assigned_to: r.assigned_to || null,
      resolved_at: r.resolved_at || null,
      resolved_by: r.resolved_by || null,
      resolution_notes: r.resolution_notes || null,
      university_name: r.university_name || null,
      user_name: r.display_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || null,
      user_first_name: r.first_name || null,
      user_last_name: r.last_name || null,
      user_email: r.user_email || null,
      user_phone: r.user_phone || null,
      candidate_code: r.jupeb_candidate_number || r.provisional_candidate_code || r.institution_issued_code || null,
      jupeb_candidate_number: r.jupeb_candidate_number || null,
      provisional_candidate_code: r.provisional_candidate_code || null,
      institution_issued_code: r.institution_issued_code || null,
      subject_combination: subjectCombination,
      subjectCombination,
      subject_combination_id: r.subject_combination_id || null,
      subject_combination_code: r.subject_combination_code || null,
      subject_combination_title: r.subject_combination_title || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }

  private async enrichRowsWithSubjectItems(rows: any[]): Promise<void> {
    if (!rows || rows.length === 0) return;
    const comboIds = Array.from(
      new Set(rows.map((r: any) => r.subject_combination_id).filter(Boolean)),
    );
    if (comboIds.length === 0) return;

    try {
      const items = await this.dataSource.query(
        `SELECT i.id, i.position, i.combination_id, i.subject_id, s.code, s.name
           FROM jupeb_subject_combination_items i
           JOIN jupeb_subjects s ON s.id = i.subject_id
          WHERE i.combination_id = ANY($1)
          ORDER BY i.position ASC`,
        [comboIds],
      );

      const itemsByCombo = new Map<string, any[]>();
      for (const item of items) {
        const list = itemsByCombo.get(item.combination_id) || [];
        list.push({
          id: item.id,
          position: item.position,
          subject_id: item.subject_id,
          code: item.code,
          name: item.name,
        });
        itemsByCombo.set(item.combination_id, list);
      }

      for (const r of rows) {
        if (r.subject_combination_id) {
          r.subject_items = itemsByCombo.get(r.subject_combination_id) || [];
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to enrich subject items: ${err?.message || err}`);
    }
  }

  private async buildPaginatedTicketsResult(res: any): Promise<SupportTicketListResponseDto> {
    await this.enrichRowsWithSubjectItems(res.rows);
    const tickets = res.rows.map((r: any) => this.mapTicketRow(r));
    const page = res.page;
    const limit = res.limit;
    const total = res.total;
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

    return {
      success: true,
      data: tickets,
      rows: tickets,
      tickets,
      page,
      limit,
      total,
      totalPages,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async createStudentTicket(userId: string, dto: CreateSupportTicketDto): Promise<SupportTicketResponseDto> {
    const validCategory = SUPPORT_CATEGORIES.some(
      (c) => c.toLowerCase() === (dto.category || '').toLowerCase().trim(),
    );
    if (!validCategory) {
      throw new UnprocessableEntityException(
        `Invalid category. Must be one of: ${SUPPORT_CATEGORIES.join(', ')}`,
      );
    }

    const regRows = await this.dataSource.query(
      `SELECT id, university_id FROM jupeb_registrations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    const reg = regRows[0] || null;

    let universityId = reg?.university_id || null;
    if (!universityId) {
      const profRows = await this.dataSource.query(
        `SELECT jupeb_university_id FROM profiles WHERE user_id = $1`,
        [userId],
      );
      universityId = profRows[0]?.jupeb_university_id || null;
    }

    const ticketNumber = generateTicketNumber();
    const ticket = await this.supportRepo.createTicket({
      ticketNumber,
      userId,
      universityId,
      registrationId: reg?.id || null,
      category: dto.category,
      subject: dto.subject,
      message: dto.message,
      priority: dto.priority || 'normal',
      status: 'open',
    });

    await this.supportRepo.createMessage({
      ticketId: ticket.id,
      senderId: userId,
      senderRole: 'student',
      message: dto.message,
      attachments: dto.attachments || [],
    });

    return this.getMyTicketDetail(userId, ticket.id);
  }

  async getMyTickets(userId: string, query: ListTicketsQueryDto): Promise<SupportTicketListResponseDto> {
    const res = await this.supportRepo.listTickets(query, null, userId);
    return this.buildPaginatedTicketsResult(res);
  }

  async getMyTicketDetail(userId: string, ticketId: string): Promise<SupportTicketResponseDto> {
    const raw = await this.supportRepo.findTicketById(ticketId);
    if (!raw) {
      throw new NotFoundException('Support ticket not found');
    }
    if (raw.user_id !== userId) {
      throw new NotFoundException('Support ticket not found');
    }

    const messages = await this.supportRepo.listMessagesByTicketId(ticketId);
    await this.enrichRowsWithSubjectItems([raw]);

    const mapped = this.mapTicketRow(raw);
    return {
      ...mapped,
      messages: messages.map((m: any) => ({
        id: m.id,
        ticket_id: m.ticket_id,
        sender_id: m.sender_id,
        sender_role: m.sender_role,
        message: m.message,
        attachments: typeof m.attachments === 'string' ? JSON.parse(m.attachments) : m.attachments || [],
        sender: {
          email: m.sender_email,
          name: m.sender_display_name || [m.sender_first_name, m.sender_last_name].filter(Boolean).join(' ') || null,
          avatar_url: m.sender_photo_url || null,
        },
        created_at: m.created_at,
      })),
    };
  }

  private mapMessageEntity(msg: any): SupportMessageResponseDto {
    return {
      id: msg.id,
      ticket_id: msg.ticketId || msg.ticket_id,
      sender_id: msg.senderId || msg.sender_id,
      sender_role: msg.senderRole || msg.sender_role,
      message: msg.message,
      attachments: typeof msg.attachments === 'string' ? JSON.parse(msg.attachments) : msg.attachments || [],
      created_at: msg.createdAt || msg.created_at,
    };
  }

  async addStudentReply(userId: string, ticketId: string, dto: AddTicketMessageDto) {
    const raw = await this.supportRepo.findTicketById(ticketId);
    if (!raw) throw new NotFoundException('Support ticket not found');
    if (raw.user_id !== userId) throw new ForbiddenException('Access denied');

    const msg = await this.supportRepo.createMessage({
      ticketId,
      senderId: userId,
      senderRole: 'student',
      message: dto.message,
      attachments: dto.attachments || [],
    });

    if (raw.status === 'resolved' || raw.status === 'closed') {
      await this.supportRepo.updateTicket(ticketId, { status: 'open' });
    }

    return this.mapMessageEntity(msg);
  }

  async institutionListTickets(userId: string, query: ListTicketsQueryDto): Promise<SupportTicketListResponseDto> {
    const scopedUniId = await this.institutionUserScopeService.effectiveUniversityId(userId, query.university_id);
    if (!scopedUniId) {
      throw new ForbiddenException('Institution scope required');
    }

    const res = await this.supportRepo.listTickets(query, scopedUniId);
    return this.buildPaginatedTicketsResult(res);
  }

  async institutionStats(userId: string): Promise<SupportStatsResponseDto> {
    const scopedUniId = await this.institutionUserScopeService.effectiveUniversityId(userId);
    return this.supportRepo.getStats(scopedUniId);
  }

  async institutionGetTicket(userId: string, ticketId: string): Promise<SupportTicketResponseDto> {
    const raw = await this.supportRepo.findTicketById(ticketId);
    if (!raw) throw new NotFoundException('Support ticket not found');

    if (raw.university_id) {
      await this.institutionUserScopeService.assertUniversityAccess(userId, raw.university_id);
    }

    const messages = await this.supportRepo.listMessagesByTicketId(ticketId);
    await this.enrichRowsWithSubjectItems([raw]);
    const mapped = this.mapTicketRow(raw);
    return {
      ...mapped,
      messages: messages.map((m: any) => ({
        id: m.id,
        ticket_id: m.ticket_id,
        sender_id: m.sender_id,
        sender_role: m.sender_role,
        message: m.message,
        attachments: typeof m.attachments === 'string' ? JSON.parse(m.attachments) : m.attachments || [],
        sender: {
          email: m.sender_email,
          name: m.sender_display_name || [m.sender_first_name, m.sender_last_name].filter(Boolean).join(' ') || null,
          avatar_url: m.sender_photo_url || null,
        },
        created_at: m.created_at,
      })),
    };
  }

  async institutionReply(userId: string, ticketId: string, dto: AddTicketMessageDto) {
    const raw = await this.supportRepo.findTicketById(ticketId);
    if (!raw) throw new NotFoundException('Support ticket not found');

    if (raw.university_id) {
      await this.institutionUserScopeService.assertUniversityAccess(userId, raw.university_id);
    }

    const msg = await this.supportRepo.createMessage({
      ticketId,
      senderId: userId,
      senderRole: 'institution',
      message: dto.message,
      attachments: dto.attachments || [],
    });

    if (raw.status === 'open') {
      await this.supportRepo.updateTicket(ticketId, { status: 'in_progress' });
    }

    return this.mapMessageEntity(msg);
  }

  async institutionUpdateStatus(userId: string, ticketId: string, dto: UpdateTicketStatusDto) {
    const raw = await this.supportRepo.findTicketById(ticketId);
    if (!raw) throw new NotFoundException('Support ticket not found');

    if (raw.university_id) {
      await this.institutionUserScopeService.assertUniversityAccess(userId, raw.university_id);
    }

    const note = dto.resolution_notes || dto.resolutionNotes || dto.comment;
    const updates: any = { status: dto.status };
    if (note) {
      updates.resolutionNotes = note;
    }
    if (dto.status === 'resolved' || dto.status === 'closed') {
      updates.resolvedAt = new Date();
      updates.resolvedBy = userId;
    }

    await this.supportRepo.updateTicket(ticketId, updates);
    if (dto.comment) {
      await this.supportRepo.createMessage({
        ticketId,
        senderId: userId,
        senderRole: 'institution',
        message: `Status updated to ${dto.status}: ${dto.comment}`,
      });
    }

    return this.institutionGetTicket(userId, ticketId);
  }

  async adminListTickets(query: ListTicketsQueryDto): Promise<SupportTicketListResponseDto> {
    const res = await this.supportRepo.listTickets(query);
    return this.buildPaginatedTicketsResult(res);
  }

  async adminStats(): Promise<SupportStatsResponseDto> {
    return this.supportRepo.getStats();
  }

  async adminGetTicket(ticketId: string): Promise<SupportTicketResponseDto> {
    const raw = await this.supportRepo.findTicketById(ticketId);
    if (!raw) throw new NotFoundException('Support ticket not found');

    const messages = await this.supportRepo.listMessagesByTicketId(ticketId);
    await this.enrichRowsWithSubjectItems([raw]);
    const mapped = this.mapTicketRow(raw);
    return {
      ...mapped,
      messages: messages.map((m: any) => ({
        id: m.id,
        ticket_id: m.ticket_id,
        sender_id: m.sender_id,
        sender_role: m.sender_role,
        message: m.message,
        attachments: typeof m.attachments === 'string' ? JSON.parse(m.attachments) : m.attachments || [],
        sender: {
          email: m.sender_email,
          name: m.sender_display_name || [m.sender_first_name, m.sender_last_name].filter(Boolean).join(' ') || null,
          avatar_url: m.sender_photo_url || null,
        },
        created_at: m.created_at,
      })),
    };
  }

  async adminReply(userId: string, ticketId: string, dto: AddTicketMessageDto) {
    const raw = await this.supportRepo.findTicketById(ticketId);
    if (!raw) throw new NotFoundException('Support ticket not found');

    const msg = await this.supportRepo.createMessage({
      ticketId,
      senderId: userId,
      senderRole: 'admin',
      message: dto.message,
      attachments: dto.attachments || [],
    });

    if (raw.status === 'open') {
      await this.supportRepo.updateTicket(ticketId, { status: 'in_progress' });
    }

    return this.mapMessageEntity(msg);
  }

  async adminUpdateTicket(ticketId: string, dto: AdminUpdateTicketDto) {
    const raw = await this.supportRepo.findTicketById(ticketId);
    if (!raw) throw new NotFoundException('Support ticket not found');

    const updates: any = {};
    if (dto.status) {
      updates.status = dto.status;
      if (dto.status === 'resolved' || dto.status === 'closed') {
        updates.resolvedAt = new Date();
      }
    }
    if (dto.priority) updates.priority = dto.priority;
    if (dto.assigned_to !== undefined) updates.assignedTo = dto.assigned_to;
    if (dto.category) updates.category = dto.category;
    const note = dto.resolution_notes || dto.resolutionNotes;
    if (note) {
      updates.resolutionNotes = note;
    }

    await this.supportRepo.updateTicket(ticketId, updates);
    return this.adminGetTicket(ticketId);
  }
}
