import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('jupeb_payment_reconciliations')
@Index('idx_jupeb_pay_recon_registration_id', ['registrationId'])
@Index('idx_jupeb_pay_recon_payment_id', ['paymentId'])
export class PaymentReconciliationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'registration_id', type: 'uuid' })
  registrationId: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId: string;

  @Column({ name: 'status_snapshot', type: 'varchar', length: 20 })
  statusSnapshot: string;

  @Column({ name: 'captured_amount', type: 'numeric', precision: 12, scale: 2 })
  capturedAmount: number;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ name: 'gateway_reference', type: 'varchar', length: 120, nullable: true })
  gatewayReference: string | null;

  @Column({ name: 'reconciled_by', type: 'uuid', nullable: true })
  reconciledBy: string | null;

  @Column({ name: 'reconciled_at', type: 'timestamp without time zone', nullable: true })
  reconciledAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp without time zone' })
  createdAt: Date;
}
