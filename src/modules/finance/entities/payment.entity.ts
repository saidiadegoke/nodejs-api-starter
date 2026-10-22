import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('payments')
@Index('idx_payments_payment_id', ['paymentId'], { unique: true })
@Index('idx_payments_registration_id', ['registrationId'])
@Index('idx_payments_user_id', ['userId'])
@Index('idx_payments_status', ['status'])
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payment_id', type: 'varchar', length: 100, unique: true })
  paymentId: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'NGN' })
  currency: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  type: string | null;

  @Column({ name: 'payment_type', type: 'varchar', length: 50, nullable: true })
  paymentType: string | null;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: string;

  @Column({ name: 'payment_method', type: 'varchar', length: 50, nullable: true })
  paymentMethod: string | null;

  @Column({ name: 'payment_method_id', type: 'uuid', nullable: true })
  paymentMethodId: string | null;

  @Column({ name: 'transaction_ref', type: 'varchar', length: 120, nullable: true })
  transactionRef: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'registration_id', type: 'uuid', nullable: true })
  registrationId: string | null;

  @Column({ name: 'payment_item_id', type: 'uuid', nullable: true })
  paymentItemId: string | null;

  @Column({ name: 'payment_structure_id', type: 'uuid', nullable: true })
  paymentStructureId: string | null;

  @Column({ name: 'jupeb_university_id', type: 'uuid', nullable: true })
  jupebUniversityId: string | null;

  @Column({ name: 'jupeb_session_id', type: 'uuid', nullable: true })
  jupebSessionId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'receipt_url', type: 'text', nullable: true })
  receiptUrl: string | null;

  @Column({ name: 'receipt_file_id', type: 'uuid', nullable: true })
  receiptFileId: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp without time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp without time zone' })
  updatedAt: Date;
}
