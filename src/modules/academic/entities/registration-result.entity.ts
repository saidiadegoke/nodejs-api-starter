import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CourseEntity } from '../../courses/entities/course.entity';

@Entity('jupeb_registration_results')
@Index('idx_registration_results_reg_course', ['registrationId', 'courseId'], { unique: true })
export class RegistrationResultEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'registration_id', type: 'uuid' })
  registrationId: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @Column({ type: 'varchar', length: 4 })
  grade: string;

  @Column({ name: 'plus_one_awarded', type: 'boolean', default: false })
  plusOneAwarded: boolean;

  @Column({ name: 'entered_by', type: 'uuid', nullable: true })
  enteredBy: string | null;

  @Column({ name: 'entered_at', type: 'timestamp without time zone', default: () => 'CURRENT_TIMESTAMP' })
  enteredAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp without time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp without time zone' })
  updatedAt: Date;

  @ManyToOne(() => CourseEntity, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course?: CourseEntity;
}
