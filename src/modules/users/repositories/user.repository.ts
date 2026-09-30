import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';

export interface UserListOptions {
  q?: string;
  role?: string;
  universityId?: string;
  excludeGlobalRoleNames?: string[];
  excludeRoleNames?: string[];
  excludeInstitutionRoles?: boolean;
}

const USER_LIST_COLUMNS = `
    u.id,
    u.email,
    u.phone,
    u.status,
    u.email_verified,
    u.phone_verified,
    u.last_login_at,
    u.created_at,
    u.updated_at,
    p.first_name,
    p.last_name,
    p.display_name,
    p.jupeb_university_id,
    ju.code AS jupeb_university_code,
    ju.short_name AS jupeb_university_short_name,
    ju.name AS jupeb_university_name,
    COALESCE(
      (
        SELECT array_agg(r.name ORDER BY r.name)
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = u.id
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      ),
      ARRAY[]::text[]
    ) AS roles`;

const USER_LIST_FROM = `
  FROM users u
  LEFT JOIN profiles p ON u.id = p.user_id
  LEFT JOIN jupeb_universities ju ON p.jupeb_university_id = ju.id AND ju.deleted_at IS NULL`;

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
    private readonly dataSource: DataSource,
  ) {}

  private _buildListFilters(options: UserListOptions = {}) {
    const {
      q = null,
      universityId = null,
      excludeGlobalRoleNames = [],
      excludeRoleNames = [],
      excludeInstitutionRoles = false,
      role = null,
    } = options;

    const values: any[] = [];
    const conditions: string[] = ['u.deleted_at IS NULL'];
    let idx = 1;

    if (q) {
      const pattern = `%${q}%`;
      conditions.push(`(
        u.email ILIKE $${idx}
        OR u.phone ILIKE $${idx}
        OR p.first_name ILIKE $${idx}
        OR p.last_name ILIKE $${idx}
        OR p.display_name ILIKE $${idx}
      )`);
      values.push(pattern);
      idx++;
    }

    if (universityId) {
      conditions.push(`p.jupeb_university_id = $${idx}`);
      values.push(universityId);
      idx++;
    }

    if (excludeGlobalRoleNames.length > 0) {
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM user_roles ur_ex
        JOIN roles r_ex ON ur_ex.role_id = r_ex.id
        WHERE ur_ex.user_id = u.id
          AND r_ex.name = ANY($${idx}::text[])
          AND r_ex.owner_jupeb_university_id IS NULL
          AND (ur_ex.expires_at IS NULL OR ur_ex.expires_at > NOW())
      )`);
      values.push(excludeGlobalRoleNames);
      idx++;
    }

    if (excludeRoleNames.length > 0) {
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM user_roles ur_ex2
        JOIN roles r_ex2 ON ur_ex2.role_id = r_ex2.id
        WHERE ur_ex2.user_id = u.id
          AND r_ex2.name = ANY($${idx}::text[])
          AND (ur_ex2.expires_at IS NULL OR ur_ex2.expires_at > NOW())
      )`);
      values.push(excludeRoleNames);
      idx++;
    }

    if (excludeInstitutionRoles) {
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM user_roles ur_inst
        JOIN roles r_inst ON ur_inst.role_id = r_inst.id
        WHERE ur_inst.user_id = u.id
          AND r_inst.owner_jupeb_university_id IS NOT NULL
          AND (ur_inst.expires_at IS NULL OR ur_inst.expires_at > NOW())
      )`);
    }

    if (role) {
      conditions.push(`EXISTS (
        SELECT 1 FROM user_roles ur_role
        JOIN roles r_role ON ur_role.role_id = r_role.id
        WHERE ur_role.user_id = u.id
          AND r_role.name = $${idx}
          AND (ur_role.expires_at IS NULL OR ur_role.expires_at > NOW())
      )`);
      values.push(role);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, values, nextIdx: idx };
  }

  async findAll(limit = 10, offset = 0, q?: string, filters: UserListOptions = {}) {
    const { where, values, nextIdx } = this._buildListFilters({ ...filters, q });
    const query = `
      SELECT ${USER_LIST_COLUMNS}
      ${USER_LIST_FROM}
      ${where}
      ORDER BY u.created_at DESC
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
    `;
    const finalValues = [...values, limit, offset];
    return await this.dataSource.query(query, finalValues);
  }

  async count(q?: string, filters: UserListOptions = {}): Promise<number> {
    const { where, values } = this._buildListFilters({ ...filters, q });
    const query = `
      SELECT COUNT(DISTINCT u.id) as total
      ${USER_LIST_FROM}
      ${where}
    `;
    const res = await this.dataSource.query(query, values);
    return parseInt(res[0]?.total || '0', 10);
  }

  async findById(id: string) {
    const query = `
      SELECT ${USER_LIST_COLUMNS}
      ${USER_LIST_FROM}
      WHERE u.id = $1 AND u.deleted_at IS NULL
    `;
    const res = await this.dataSource.query(query, [id]);
    return res[0] || null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return await this.repo.findOne({
      where: { email },
    });
  }

  async findByPhone(phone: string): Promise<UserEntity | null> {
    return await this.repo.findOne({
      where: { phone },
    });
  }

  async findByEmailOrPhone(identifier: string): Promise<UserEntity | null> {
    const query = `
      SELECT * FROM users
      WHERE (email = $1 OR phone = $1)
        AND deleted_at IS NULL
      LIMIT 1
    `;
    const res = await this.dataSource.query(query, [identifier]);
    return res[0] || null;
  }

  async create(userData: Partial<UserEntity>): Promise<UserEntity> {
    const entity = this.repo.create(userData);
    return await this.repo.save(entity);
  }

  async update(id: string, updateData: Partial<UserEntity>): Promise<void> {
    await this.repo.update(id, updateData);
  }

  async updateStatus(id: string, status: string): Promise<UserEntity | null> {
    await this.repo.update(id, { status });
    return await this.repo.findOne({ where: { id } });
  }

  async softDelete(id: string): Promise<boolean> {
    const res = await this.repo.update(id, {
      status: 'deleted',
      deletedAt: new Date(),
    });
    return (res.affected || 0) > 0;
  }

  async findUserRoles(userId: string): Promise<Array<{ role: string }>> {
    const query = `
      SELECT r.name as role
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    `;
    return await this.dataSource.query(query, [userId]);
  }

  async getStats(userId: string) {
    const query = `
      SELECT
        u.created_at,
        u.last_login_at,
        (SELECT COUNT(*) FROM user_activities WHERE user_id = $1) as activity_count
      FROM users u
      WHERE u.id = $1
    `;
    const res = await this.dataSource.query(query, [userId]);
    return res[0] || null;
  }
}
