import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('profiles')
@Index('idx_profiles_user_id', ['userId'])
@Index('idx_profiles_display_name', ['displayName'])
export class ProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 200, nullable: true })
  displayName: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Column({ name: 'profile_photo_url', type: 'text', nullable: true })
  profilePhotoUrl: string | null;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  @Column({ name: 'preferred_language', type: 'varchar', length: 10, default: 'en' })
  preferredLanguage: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  timezone: string | null;

  @Column({ name: 'country_id', type: 'int', nullable: true })
  countryId: number | null;

  @Column({ name: 'state_province', type: 'varchar', length: 100, nullable: true })
  stateProvince: string | null;

  @Column({ name: 'educational_level', type: 'varchar', length: 50, nullable: true })
  educationalLevel: string | null;

  @Column({ name: 'employment_status', type: 'varchar', length: 50, nullable: true })
  employmentStatus: string | null;

  @Column({ name: 'profile_completed', type: 'boolean', default: false })
  profileCompleted: boolean;

  @Column({ name: 'jupeb_university_id', type: 'uuid', nullable: true })
  jupebUniversityId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
