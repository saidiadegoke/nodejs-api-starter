import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('support_tickets')
export class SupportTicketEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ticket_number', type: 'varchar', length: 50, unique: true })
  ticketNumber: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'university_id', type: 'uuid', nullable: true })
  universityId?: string | null;

  @Column({ name: 'registration_id', type: 'uuid', nullable: true })
  registrationId?: string | null;

  @Column({ type: 'varchar', length: 100 })
  category: string;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 20, default: 'normal' })
  priority: string;

  @Column({ type: 'varchar', length: 30, default: 'open' })
  status: string;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo?: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt?: Date | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy?: string | null;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true })
  resolutionNotes?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
