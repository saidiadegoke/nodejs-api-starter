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
  SupportCategoryItemDto,
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

  getCategories(): SupportCategoryItemDto[] {
    return SUPPORT_CATEGORIES.map((cat) => ({
      id: cat.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      name: cat,
      description: `Support requests relating to ${cat}.`,
    }));
  }

  async createStudentTicket(userId: string, dto: CreateSupportTicketDto): Promise<SupportTicketResponseDto> {
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

    if (dto.attachments && dto.attachments.length) {
      await this.supportRepo.createMessage({
        ticketId: ticket.id,
        senderId: userId,
        senderRole: 'student',
        message: dto.message,
        attachments: dto.attachments,
      });
    }

    return this.getMyTicketDetail(userId, ticket.id);
  }

  async getMyTickets(userId: string, query: ListTicketsQueryDto): Promise<SupportTicketListResponseDto> {
    const res = await this.supportRepo.listTickets(query, null, userId);
    return {
      tickets: res.rows.map((r: any) => ({
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
        university_name: r.university_name,
        user_name: r.display_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || null,
        user_email: r.user_email,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
      page: res.page,
      limit: res.limit,
      total: res.total,
    };
  }

  async getMyTicketDetail(userId: string, ticketId: string): Promise<SupportTicketResponseDto> {
    const raw = await this.supportRepo.findTicketById(ticketId);
    if (!raw) {
      throw new NotFoundException('Support ticket not found');
    }
    if (raw.user_id !== userId) {
      throw new ForbiddenException('You are not authorized to view this ticket');
    }

    const messages = await this.supportRepo.listMessagesByTicketId(ticketId);

    return {
      id: raw.id,
      ticket_number: raw.ticket_number,
      user_id: raw.user_id,
      university_id: raw.university_id,
      registration_id: raw.registration_id,
      category: raw.category,
      subject: raw.subject,
      message: raw.message,
      priority: raw.priority,
      status: raw.status,
      university_name: raw.university_name,
      user_name: raw.display_name || [raw.first_name, raw.last_name].filter(Boolean).join(' ') || null,
      user_email: raw.user_email,
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
      created_at: raw.created_at,
      updated_at: raw.updated_at,
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

    return msg;
  }

  async institutionListTickets(userId: string, query: ListTicketsQueryDto): Promise<SupportTicketListResponseDto> {
    const scopedUniId = await this.institutionUserScopeService.effectiveUniversityId(userId, query.university_id);
    if (!scopedUniId) {
      throw new ForbiddenException('Institution scope required');
    }

    const res = await this.supportRepo.listTickets(query, scopedUniId);
    return {
      tickets: res.rows.map((r: any) => ({
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
        university_name: r.university_name,
        user_name: r.display_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || null,
        user_email: r.user_email,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
      page: res.page,
      limit: res.limit,
      total: res.total,
    };
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
    return {
      id: raw.id,
      ticket_number: raw.ticket_number,
      user_id: raw.user_id,
      university_id: raw.university_id,
      registration_id: raw.registration_id,
      category: raw.category,
      subject: raw.subject,
      message: raw.message,
      priority: raw.priority,
      status: raw.status,
      university_name: raw.university_name,
      user_name: raw.display_name || [raw.first_name, raw.last_name].filter(Boolean).join(' ') || null,
      user_email: raw.user_email,
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
      created_at: raw.created_at,
      updated_at: raw.updated_at,
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
      senderRole: 'institution_staff',
      message: dto.message,
      attachments: dto.attachments || [],
    });

    if (raw.status === 'open') {
      await this.supportRepo.updateTicket(ticketId, { status: 'in_progress' });
    }

    return msg;
  }

  async institutionUpdateStatus(userId: string, ticketId: string, dto: UpdateTicketStatusDto) {
    const raw = await this.supportRepo.findTicketById(ticketId);
    if (!raw) throw new NotFoundException('Support ticket not found');

    if (raw.university_id) {
      await this.institutionUserScopeService.assertUniversityAccess(userId, raw.university_id);
    }

    const updates: any = { status: dto.status };
    if (dto.status === 'resolved' || dto.status === 'closed') {
      updates.resolvedAt = new Date();
    }

    const updated = await this.supportRepo.updateTicket(ticketId, updates);
    if (dto.comment) {
      await this.supportRepo.createMessage({
        ticketId,
        senderId: userId,
        senderRole: 'institution_staff',
        message: `Status updated to ${dto.status}: ${dto.comment}`,
      });
    }

    return updated;
  }

  async adminListTickets(query: ListTicketsQueryDto): Promise<SupportTicketListResponseDto> {
    const res = await this.supportRepo.listTickets(query);
    return {
      tickets: res.rows.map((r: any) => ({
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
        university_name: r.university_name,
        user_name: r.display_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || null,
        user_email: r.user_email,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
      page: res.page,
      limit: res.limit,
      total: res.total,
    };
  }

  async adminStats(): Promise<SupportStatsResponseDto> {
    return this.supportRepo.getStats();
  }

  async adminGetTicket(ticketId: string): Promise<SupportTicketResponseDto> {
    const raw = await this.supportRepo.findTicketById(ticketId);
    if (!raw) throw new NotFoundException('Support ticket not found');

    const messages = await this.supportRepo.listMessagesByTicketId(ticketId);
    return {
      id: raw.id,
      ticket_number: raw.ticket_number,
      user_id: raw.user_id,
      university_id: raw.university_id,
      registration_id: raw.registration_id,
      category: raw.category,
      subject: raw.subject,
      message: raw.message,
      priority: raw.priority,
      status: raw.status,
      university_name: raw.university_name,
      user_name: raw.display_name || [raw.first_name, raw.last_name].filter(Boolean).join(' ') || null,
      user_email: raw.user_email,
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
      created_at: raw.created_at,
      updated_at: raw.updated_at,
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

    return msg;
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

    return this.supportRepo.updateTicket(ticketId, updates);
  }
}
