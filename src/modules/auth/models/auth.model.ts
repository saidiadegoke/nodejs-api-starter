import * as bcrypt from 'bcryptjs';
import { Pool, PoolClient } from 'pg';

const defaultPool: Pool = require('../../../database/pool');

export interface AuthUserModel {
  id: string;
  email: string | null;
  phone: string | null;
  password_hash?: string;
  status: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  profile_photo_url?: string;
  jupeb_university_id?: string | null;
  roles?: string[];
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateUserData {
  email?: string | null;
  phone?: string | null;
  password: string;
  first_name?: string;
  last_name?: string;
  role?: string;
}

export class AuthModel {
  static async findByIdentifier(
    identifier: string | null | undefined,
    client: Pool | PoolClient = defaultPool
  ): Promise<AuthUserModel | null> {
    if (identifier === undefined || identifier === null || identifier === '') return null;
    const raw = String(identifier || '').trim();
    const cleanDigits = raw.replace(/\D/g, '');
    let phoneVariations: string[] = [raw, raw.replace(/\s+/g, '')];

    if (cleanDigits.length >= 7) {
      phoneVariations.push(cleanDigits);
      if (cleanDigits.startsWith('234') && cleanDigits.length === 13) {
        phoneVariations.push('+' + cleanDigits);
        phoneVariations.push('0' + cleanDigits.slice(3));
        phoneVariations.push(cleanDigits.slice(3));
      } else if (cleanDigits.startsWith('0') && cleanDigits.length === 11) {
        phoneVariations.push('+234' + cleanDigits.slice(1));
        phoneVariations.push('234' + cleanDigits.slice(1));
        phoneVariations.push(cleanDigits.slice(1));
      } else if (cleanDigits.length === 10) {
        phoneVariations.push('0' + cleanDigits);
        phoneVariations.push('+234' + cleanDigits);
        phoneVariations.push('234' + cleanDigits);
      }
    }
    phoneVariations = Array.from(new Set(phoneVariations.map((p) => p.trim()).filter(Boolean)));

    try {
      const query = `
        SELECT u.*, p.first_name, p.last_name, p.display_name, p.profile_photo_url, p.jupeb_university_id,
               COALESCE(
                 array_agg(r.name) FILTER (WHERE r.name IS NOT NULL),
                 '{}'
               ) AS roles
        FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.deleted_at IS NULL
          AND (
            LOWER(TRIM(u.email)) = LOWER($1)
            OR u.phone = ANY($2::text[])
            OR EXISTS (
              SELECT 1 FROM jupeb_registrations rr
              WHERE rr.user_id = u.id
                AND (
                  UPPER(TRIM(rr.provisional_candidate_code)) = UPPER($1)
                  OR UPPER(TRIM(rr.jupeb_candidate_number)) = UPPER($1)
                  OR UPPER(TRIM(rr.institution_issued_code)) = UPPER($1)
                )
            )
          )
        GROUP BY u.id, p.id
        LIMIT 1
      `;
      const res = await client.query(query, [raw, phoneVariations]);
      return res.rows[0] || null;
    } catch (err: any) {
      if (err && err.code === '42P01') {
        const query = `
          SELECT u.*, p.first_name, p.last_name, p.display_name, p.profile_photo_url, p.jupeb_university_id,
                 COALESCE(
                   array_agg(r.name) FILTER (WHERE r.name IS NOT NULL),
                   '{}'
                 ) AS roles
          FROM users u
          LEFT JOIN profiles p ON p.user_id = u.id
          LEFT JOIN user_roles ur ON ur.user_id = u.id
          LEFT JOIN roles r ON r.id = ur.role_id
          WHERE u.deleted_at IS NULL
            AND (LOWER(TRIM(u.email)) = LOWER($1) OR u.phone = ANY($2::text[]))
          GROUP BY u.id, p.id
          LIMIT 1
        `;
        const res = await client.query(query, [raw, phoneVariations]);
        return res.rows[0] || null;
      }
      throw err;
    }
  }

  static async findById(
    id: string,
    client: Pool | PoolClient = defaultPool
  ): Promise<AuthUserModel | null> {
    const query = `
      SELECT u.*, p.first_name, p.last_name, p.display_name, p.profile_photo_url, p.jupeb_university_id,
             COALESCE(
               array_agg(r.name) FILTER (WHERE r.name IS NOT NULL),
               '{}'
             ) AS roles
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id = $1 AND u.deleted_at IS NULL
      GROUP BY u.id, p.id
      LIMIT 1
    `;
    const res = await client.query(query, [id]);
    return res.rows[0] || null;
  }

  static async createUser(
    { email, phone = null, password, first_name = '', last_name = '', role = 'student' }: CreateUserData,
    client: Pool | PoolClient = defaultPool
  ): Promise<AuthUserModel> {
    const passwordHash = await bcrypt.hash(password, 10);
    const userRes = await client.query(
      `INSERT INTO users (email, phone, password_hash, status, email_verified)
       VALUES ($1, $2, $3, 'active', true)
       RETURNING *`,
      [email ? String(email).trim().toLowerCase() : null, phone, passwordHash]
    );
    const user = userRes.rows[0];

    await client.query(
      `INSERT INTO profiles (user_id, first_name, last_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
       SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name`,
      [user.id, first_name, last_name]
    );

    if (role) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE name = $2
         ON CONFLICT DO NOTHING`,
        [user.id, role]
      );
    }

    return {
      ...user,
      first_name,
      last_name,
      roles: role ? [role] : [],
    };
  }
}

// CommonJS compatibility export for legacy callers
module.exports = AuthModel;
