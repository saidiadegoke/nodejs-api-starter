import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class InstitutionUserScopeService {
  constructor(private readonly dataSource: DataSource) {}

  async setProfileJupebUniversityId(
    targetUserId: string,
    jupebUniversityId?: string | null,
    _actorUserId?: string | null,
  ) {
    if (!UUID_REGEX.test(targetUserId)) {
      throw new UnprocessableEntityException('user_id must be a valid UUID');
    }

    let nextVal: string | null = null;
    if (jupebUniversityId !== null && jupebUniversityId !== undefined && jupebUniversityId !== '') {
      if (!UUID_REGEX.test(jupebUniversityId)) {
        throw new UnprocessableEntityException('jupeb_university_id must be a valid UUID or null');
      }
      const uniRows = await this.dataSource.query(
        `SELECT id, status FROM jupeb_universities WHERE id = $1 AND deleted_at IS NULL`,
        [jupebUniversityId],
      );
      if (!uniRows.length || uniRows[0].status !== 'active') {
        throw new NotFoundException('JUPEB university not found or inactive');
      }
      nextVal = jupebUniversityId;
    }

    const userRows = await this.dataSource.query(`SELECT id FROM users WHERE id = $1`, [targetUserId]);
    if (!userRows.length) throw new NotFoundException('User not found');

    await this.dataSource.query(
      `INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [targetUserId],
    );

    await this.dataSource.query(
      `UPDATE profiles SET jupeb_university_id = $2, updated_at = NOW() WHERE user_id = $1`,
      [targetUserId, nextVal],
    );

    return {
      user_id: targetUserId,
      jupeb_university_id: nextVal,
    };
  }

  async getProfileJupebUniversityId(userId: string): Promise<string | null> {
    const rows = await this.dataSource.query(
      `SELECT jupeb_university_id FROM profiles WHERE user_id = $1`,
      [userId],
    );
    return rows[0]?.jupeb_university_id || null;
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const rows = await this.dataSource.query(
      `SELECT r.name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1 AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
      [userId],
    );
    return rows.map((r: any) => r.name);
  }

  async assertUniversityAccess(userId: string, universityId: string): Promise<void> {
    const roles = await this.getUserRoles(userId);
    if (roles.includes('admin') || roles.includes('super_admin')) return;
    if (!roles.includes('program_director') && !roles.includes('institution_admin')) return;
    const scoped = await this.getProfileJupebUniversityId(userId);
    if (!scoped) {
      throw new ForbiddenException(
        'Institution users must have profiles.jupeb_university_id set for JUPEB actions',
      );
    }
    if (String(scoped) !== String(universityId)) {
      throw new ForbiddenException('University is outside your institution scope');
    }
  }

  async effectiveUniversityId(
    userId: string,
    queryUniversityId?: string | null,
  ): Promise<string | null> {
    const roles = await this.getUserRoles(userId);
    if (roles.includes('admin') || roles.includes('super_admin')) {
      return queryUniversityId || null;
    }
    if (!roles.includes('program_director') && !roles.includes('institution_admin')) {
      return queryUniversityId || null;
    }
    const scoped = await this.getProfileJupebUniversityId(userId);
    if (!scoped) {
      throw new ForbiddenException(
        'Institution users must have profiles.jupeb_university_id set for JUPEB actions',
      );
    }
    if (queryUniversityId && String(queryUniversityId) !== String(scoped)) {
      throw new ForbiddenException('Cannot list registrations for a university outside your scope');
    }
    return scoped;
  }
}
