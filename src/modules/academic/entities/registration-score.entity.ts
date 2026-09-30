import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('jupeb_registration_scores')
@Index('idx_registration_scores_registration_id', ['registrationId'], { unique: true })
export class RegistrationScoreEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'registration_id', type: 'uuid' })
  registrationId: string;

  @Column({ name: 'passed_courses_count', type: 'integer', default: 0 })
  passedCoursesCount: number;

  @Column({ name: 'failed_courses_count', type: 'integer', default: 0 })
  failedCoursesCount: number;

  @Column({ name: 'plus_one_total', type: 'integer', default: 0 })
  plusOneTotal: number;

  @Column({ name: 'computed_at', type: 'timestamp without time zone', default: () => 'CURRENT_TIMESTAMP' })
  computedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp without time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp without time zone' })
  updatedAt: Date;
}
