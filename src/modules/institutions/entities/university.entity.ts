import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export type UniversityStatus = 'active' | 'inactive';
export type UniversityType = 'federal' | 'state' | 'private';

@Entity({ name: 'jupeb_universities' })
export class UniversityEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 80, nullable: true, name: 'short_name' })
  shortName: string | null;

  @Column({ type: 'char', length: 3, name: 'jupeb_prefix' })
  jupebPrefix: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'active',
  })
  status: UniversityStatus;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    name: 'university_type',
  })
  universityType: UniversityType | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({
    type: 'int',
    nullable: true,
    name: 'expected_candidate_count',
  })
  expectedCandidateCount: number | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true, name: 'deleted_at' })
  deletedAt: Date | null;
}
