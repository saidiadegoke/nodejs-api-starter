import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SubjectCombinationEntity } from './subject-combination.entity';
import { SubjectEntity } from './subject.entity';

@Entity({ name: 'jupeb_subject_combination_items' })
export class SubjectCombinationItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'combination_id' })
  combinationId: string;

  @Column({ type: 'uuid', name: 'subject_id' })
  subjectId: string;

  @Column({ type: 'int' })
  position: number;

  @ManyToOne(() => SubjectCombinationEntity, (combo) => combo.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'combination_id' })
  combination?: SubjectCombinationEntity;

  @ManyToOne(() => SubjectEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subject_id' })
  subject?: SubjectEntity;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;
}
