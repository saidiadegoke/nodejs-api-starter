import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { SubjectCombinationItemEntity } from './subject-combination-item.entity';

export type SubjectCombinationStatus = 'active' | 'inactive';

@Entity({ name: 'jupeb_subject_combinations' })
export class SubjectCombinationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'active',
  })
  status: SubjectCombinationStatus;

  @Column({ type: 'boolean', default: true, name: 'is_global' })
  isGlobal: boolean;

  @Column({ type: 'uuid', nullable: true, name: 'university_id' })
  universityId: string | null;

  @OneToMany(() => SubjectCombinationItemEntity, (item) => item.combination)
  items?: SubjectCombinationItemEntity[];

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true, name: 'deleted_at' })
  deletedAt: Date | null;
}
