import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProfileEntity } from '../entities/profile.entity';

const PROFILE_SELECT = `
  u.id as user_id,
  u.email,
  u.phone,
  u.email_verified,
  u.phone_verified,
  u.status as account_status,
  u.created_at,
  u.updated_at,
  p.first_name,
  p.last_name,
  p.display_name,
  p.title,
  p.profile_photo_url as profile_photo,
  p.bio,
  p.date_of_birth,
  p.gender,
  p.country_id,
  c.name as country_name,
  c.iso_code_2 as country_code,
  p.state_province,
  p.educational_level,
  p.employment_status,
  p.profile_completed,
  p.jupeb_university_id
`;

@Injectable()
export class ProfileRepository {
  constructor(
    @InjectRepository(ProfileEntity)
    private readonly repo: Repository<ProfileEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findByUserId(userId: string) {
    const query = `
      SELECT ${PROFILE_SELECT}
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      LEFT JOIN countries c ON p.country_id = c.id
      WHERE u.id = $1
    `;
    const res = await this.dataSource.query(query, [userId]);
    return res[0] || null;
  }

  async upsert(userId: string, data: Partial<ProfileEntity>): Promise<ProfileEntity> {
    let profile = await this.repo.findOne({ where: { userId } });
    if (!profile) {
      profile = this.repo.create({ ...data, userId });
    } else {
      Object.assign(profile, data);
    }
    return await this.repo.save(profile);
  }

  async getCountries() {
    return await this.dataSource.query(`
      SELECT id, name, iso_code_2, phone_code
      FROM countries
      WHERE is_active = true
      ORDER BY name ASC
    `);
  }
}
