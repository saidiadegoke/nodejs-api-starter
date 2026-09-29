import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('jupeb_institution_session_results')
@Index('idx_institution_session_results_unique', ['sessionId', 'universityId'], { unique: true })
export class InstitutionSessionResultEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'university_id', type: 'uuid' })
  universityId: string;

  @Column({ name: 'results_released_to_students', type: 'boolean', default: false })
  resultsReleasedToStudents: boolean;

  @Column({ name: 'students_results_released_at', type: 'timestamp without time zone', nullable: true })
  studentsResultsReleasedAt: Date | null;

  @Column({ name: 'released_by', type: 'uuid', nullable: true })
  releasedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp without time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp without time zone' })
  updatedAt: Date;
}
