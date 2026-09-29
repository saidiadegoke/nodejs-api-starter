import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from '@modules/users';

export interface UserWithProfile extends Partial<UserEntity> {
  id: string;
  email?: string | null;
  phone?: string | null;
  password_hash?: string;
  passwordHash?: string;
  status?: string;
  email_verified?: boolean;
  emailVerified?: boolean;
  phone_verified?: boolean;
  phoneVerified?: boolean;
  created_at?: Date;
  createdAt?: Date;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  profile_photo_url?: string;
  roles?: string[];
  jupeb_university_id?: string | null;
  jupeb_university_code?: string | null;
  jupeb_university_short_name?: string | null;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Create user with profile and role assignment in a transaction
   */
  async createUser(userData: {
    email?: string | null;
    phone?: string | null;
    password: string;
    first_name: string;
    last_name: string;
    role: string;
    role_id?: string;
  }): Promise<UserEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { email, phone, password, first_name, last_name, role, role_id } = userData;
      const passwordHash = await bcrypt.hash(password, 10);

      const userInsert = await queryRunner.query(
        `INSERT INTO users (email, phone, password_hash, status) 
         VALUES ($1, $2, $3, 'active') 
         RETURNING id, email, phone, email_verified, phone_verified, status, created_at`,
        [email || null, phone || null, passwordHash]
      );
      const user = userInsert[0];

      await queryRunner.query(
        `INSERT INTO profiles (user_id, first_name, last_name, display_name)
         VALUES ($1, $2, $3, $4)`,
        [user.id, first_name, last_name, `${first_name} ${last_name}`]
      );

      if (!role) {
        throw new Error('Role is required');
      }

      if (role_id) {
        await queryRunner.query(
          `INSERT INTO user_roles (user_id, role_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, role_id) DO NOTHING`,
          [user.id, role_id]
        );
      } else {
        await queryRunner.query(
          `INSERT INTO user_roles (user_id, role_id)
           SELECT $1, id
             FROM roles
            WHERE name = $2
              AND owner_jupeb_university_id IS NULL
            ORDER BY is_system DESC, created_at ASC
            LIMIT 1
           ON CONFLICT (user_id, role_id) DO NOTHING`,
          [user.id, role]
        );
      }

      await queryRunner.commitTransaction();
      return user;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Find a user by email, phone, provisional_candidate_code, or jupeb_candidate_number
   * Supports matric lockdown and re-entry exceptions
   */
  async findByIdentifier(identifier: string | null | undefined): Promise<UserWithProfile | null> {
    if (identifier === undefined || identifier === null || identifier === '') return null;
    const value = String(identifier).trim();

    try {
      const rows = await this.dataSource.query(
        `WITH candidates AS (
           SELECT u.id AS user_id,
                  EXISTS (
                    SELECT 1 FROM user_roles ur
                      JOIN roles ro ON ro.id = ur.role_id
                     WHERE ur.user_id = u.id
                       AND ro.name NOT IN ('student', 'user')
                  ) AS has_admin_role,
                  EXISTS (
                    SELECT 1 FROM jupeb_registrations rm
                     WHERE rm.user_id = u.id
                       AND rm.jupeb_candidate_number IS NOT NULL
                  ) AS has_matric,
                  EXISTS (
                    SELECT 1 FROM jupeb_registrations rip
                     WHERE rip.user_id = u.id
                       AND rip.jupeb_candidate_number IS NULL
                       AND rip.status NOT IN ('approved', 'rejected', 'withdrawn')
                  ) AS in_progress_no_matric,
                  EXISTS (
                    SELECT 1 FROM jupeb_registrations rmx
                     WHERE rmx.user_id = u.id
                       AND rmx.jupeb_candidate_number IS NOT NULL
                       AND UPPER(rmx.jupeb_candidate_number) = UPPER($1)
                  ) AS matric_match,
                  EXISTS (
                    SELECT 1 FROM jupeb_registrations rp
                     WHERE rp.user_id = u.id
                       AND UPPER(rp.provisional_candidate_code) = UPPER($1)
                  ) AS provisional_match
             FROM users u
            WHERE u.deleted_at IS NULL
              AND (
                    LOWER(u.email) = LOWER($1)
                 OR u.phone = $1
                 OR EXISTS (
                      SELECT 1 FROM jupeb_registrations rr
                       WHERE rr.user_id = u.id
                         AND (
                               UPPER(rr.provisional_candidate_code) = UPPER($1)
                            OR UPPER(rr.jupeb_candidate_number)    = UPPER($1)
                         )
                    )
              )
         )
         SELECT u.*, p.first_name, p.last_name, p.display_name, p.profile_photo_url
           FROM candidates c
           JOIN users u ON u.id = c.user_id
           LEFT JOIN profiles p ON u.id = p.user_id
          WHERE
              c.has_admin_role = TRUE
           OR
              (c.has_matric = TRUE AND c.in_progress_no_matric = TRUE AND (
                    LOWER(u.email) = LOWER($1)
                 OR u.phone = $1
                 OR c.provisional_match = TRUE
                 OR c.matric_match = TRUE
              ))
           OR
              (c.has_matric = TRUE AND c.in_progress_no_matric = FALSE AND c.matric_match = TRUE)
           OR
              (c.has_matric = FALSE AND (
                    LOWER(u.email) = LOWER($1)
                 OR u.phone = $1
                 OR c.provisional_match = TRUE
              ))
          LIMIT 1`,
        [value]
      );
      return rows[0] || null;
    } catch (err: any) {
      if (err && err.code === '42P01') {
        const rows = await this.dataSource.query(
          `SELECT u.*, p.first_name, p.last_name, p.display_name, p.profile_photo_url
             FROM users u
             LEFT JOIN profiles p ON u.id = p.user_id
            WHERE u.deleted_at IS NULL
              AND (LOWER(u.email) = LOWER($1) OR u.phone = $1)
            LIMIT 1`,
          [value]
        );
        return rows[0] || null;
      }
      throw err;
    }
  }

  /**
   * Get user roles
   */
  async getUserRoles(userId: string): Promise<Array<{ name: string; display_name: string }>> {
    return this.dataSource.query(
      `SELECT r.name, r.display_name 
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1 
       AND r.owner_jupeb_university_id IS NULL
       AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
      [userId]
    );
  }
}
