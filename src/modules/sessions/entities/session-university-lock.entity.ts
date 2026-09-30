import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('jupeb_session_university_locks')
@Unique('uq_session_university_lock', ['sessionId', 'universityId'])
@Index('idx_session_uni_locks_session', ['sessionId'])
@Index('idx_session_uni_locks_lookup', ['sessionId', 'universityId', 'locked'])
export class SessionUniversityLockEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'university_id', type: 'uuid' })
  universityId: string;

  @Column({ type: 'boolean', default: true })
  locked: boolean;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({
    name: 'locked_at',
    type: 'timestamptz',
    nullable: true,
  })
  lockedAt: Date | null;

  @Column({ name: 'locked_by', type: 'uuid', nullable: true })
  lockedBy: string | null;

  @CreateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}
