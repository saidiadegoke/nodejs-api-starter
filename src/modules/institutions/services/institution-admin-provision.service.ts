import { Injectable, ConflictException, UnprocessableEntityException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { CommodLogger, LoggerFactory } from '../../../logger';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGIT = '23456789';
const SPECIAL = '!@#$%&*';

export function generateSecurePassword(length = 12): string {
  const len = Math.max(8, length);
  const pick = (set: string) => set[crypto.randomInt(0, set.length)];
  const pool = UPPER + LOWER + DIGIT + SPECIAL;
  const chars = [pick(UPPER), pick(LOWER), pick(SPECIAL)];
  for (let i = chars.length; i < len; i += 1) {
    chars.push(pick(pool));
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

@Injectable()
export class InstitutionAdminProvisionService {
  private readonly logger: CommodLogger;

  constructor(
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(InstitutionAdminProvisionService.name);
  }

  async provisionOnUniversityCreate(
    body: {
      email?: string;
      admin_first_name?: string;
      admin_last_name?: string;
      [key: string]: any;
    },
    context: {
      universityId: string;
      universityName: string;
      createdBy?: string | null;
    },
  ): Promise<{ provisionedUserId: string; institution_admin: any }> {
    const loginEmail = String(body.email || '').trim();
    if (!loginEmail) {
      throw new UnprocessableEntityException('email is required');
    }
    if (!EMAIL_RE.test(loginEmail)) {
      throw new UnprocessableEntityException('Invalid email address');
    }

    const provisioned = await this.provisionAdmin({
      email: loginEmail,
      firstName: body.admin_first_name,
      lastName: body.admin_last_name,
      universityId: context.universityId,
      createdBy: context.createdBy,
    });

    // Send credentials notification asynchronously
    setImmediate(async () => {
      try {
        const jupebMailer = require('../../jupeb/services/jupeb-mailer.service');
        if (jupebMailer?.sendInstitutionAdminCredentials) {
          await jupebMailer.sendInstitutionAdminCredentials({
            email: provisioned.user.email,
            password: provisioned.passwordPlaintext,
            firstName: provisioned.firstName || 'Admin',
            universityName: context.universityName || 'your institution',
          });
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to send institution admin credentials email: ${err.message}`,
          err.stack,
        );
      }
    });

    return {
      provisionedUserId: provisioned.user.id,
      institution_admin: {
        user_id: provisioned.user.id,
        email: provisioned.user.email,
        first_name: provisioned.firstName,
        last_name: provisioned.lastName,
      },
    };
  }

  async provisionAdmin(params: {
    email: string;
    firstName?: string;
    lastName?: string;
    universityId: string;
    createdBy?: string | null;
  }): Promise<{ user: any; passwordPlaintext: string | null; firstName?: string; lastName?: string }> {
    const normalizedEmail = String(params.email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      throw new UnprocessableEntityException('email is required to provision an institution admin');
    }
    if (!EMAIL_RE.test(normalizedEmail)) {
      throw new UnprocessableEntityException('Invalid email address');
    }

    // Check existing user
    const existingUsers = await this.dataSource.query(
      `SELECT * FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1`,
      [normalizedEmail],
    );
    const existing = existingUsers[0];

    if (existing) {
      const existingBindings = await this.dataSource.query(
        `SELECT * FROM user_universities WHERE user_id = $1 AND is_primary = true AND deleted_at IS NULL LIMIT 1`,
        [existing.id],
      );
      if (!existingBindings[0]) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
          await queryRunner.query(
            `INSERT INTO user_universities (user_id, university_id, role, is_primary, created_by)
             VALUES ($1, $2, 'institution_admin', true, $3)`,
            [existing.id, params.universityId, params.createdBy || null],
          );
          await queryRunner.query(
            `UPDATE profiles SET jupeb_university_id = $2, updated_at = NOW() WHERE user_id = $1`,
            [existing.id, params.universityId],
          );
          await queryRunner.commitTransaction();
          return {
            user: existing,
            passwordPlaintext: null,
            firstName: existing.first_name || null,
            lastName: existing.last_name || null,
          };
        } catch (err) {
          if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
          }
          throw err;
        } finally {
          await queryRunner.release();
        }
      }

      throw new ConflictException({
        message: 'User with this email already exists',
        details: { error_code: 'duplicate', field: 'email', value: normalizedEmail },
      });
    }

    const passwordPlaintext = generateSecurePassword(12);
    const passwordHash = await bcrypt.hash(passwordPlaintext, 10);
    const firstName = params.firstName ? String(params.firstName).trim() : '';
    const lastName = params.lastName ? String(params.lastName).trim() : '';

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userResult = await queryRunner.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, status)
         VALUES ($1, $2, $3, $4, 'institution_admin', 'active')
         RETURNING *`,
        [normalizedEmail, passwordHash, firstName || null, lastName || null],
      );
      const user = userResult[0];

      await queryRunner.query(
        `INSERT INTO profiles (user_id, first_name, last_name, jupeb_university_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE
         SET first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             jupeb_university_id = EXCLUDED.jupeb_university_id,
             updated_at = NOW()`,
        [user.id, firstName || null, lastName || null, params.universityId],
      );

      await queryRunner.query(
        `INSERT INTO user_universities (user_id, university_id, role, is_primary, created_by)
         VALUES ($1, $2, 'institution_admin', true, $3)`,
        [user.id, params.universityId, params.createdBy || null],
      );

      await queryRunner.commitTransaction();

      return {
        user,
        passwordPlaintext,
        firstName,
        lastName,
      };
    } catch (err) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async resendCredentials(email: string): Promise<any> {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      throw new UnprocessableEntityException('email is required');
    }

    const query = `
      SELECT u.id, u.email, p.first_name, p.last_name, p.jupeb_university_id,
             COALESCE(uni.name, uni_by_email.name) AS university_name
        FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        LEFT JOIN user_universities uu ON uu.user_id = u.id AND uu.deleted_at IS NULL
        LEFT JOIN jupeb_universities uni ON uni.id = uu.university_id OR uni.id = p.jupeb_university_id
        LEFT JOIN jupeb_universities uni_by_email ON LOWER(uni_by_email.email) = LOWER(u.email)
       WHERE LOWER(u.email) = $1 AND u.deleted_at IS NULL
       LIMIT 1
    `;
    const rows = await this.dataSource.query(query, [normalizedEmail]);
    if (!rows.length) {
      throw new NotFoundException('Institution admin user not found with this email');
    }

    const user = rows[0];
    const passwordPlaintext = generateSecurePassword(12);
    const passwordHash = await bcrypt.hash(passwordPlaintext, 10);

    await this.dataSource.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, user.id],
    );

    const firstName = user.first_name || 'Admin';
    const universityName = user.university_name || 'your institution';

    try {
      const jupebMailer = require('../../jupeb/services/jupeb-mailer.service');
      if (jupebMailer?.sendInstitutionAdminCredentials) {
        await jupebMailer.sendInstitutionAdminCredentials({
          email: user.email,
          password: passwordPlaintext,
          firstName,
          universityName,
        });
      }
    } catch (err: any) {
      this.logger.error(`Error sending credentials email: ${err.message}`, err.stack);
    }

    return {
      user_id: user.id,
      email: user.email,
      first_name: firstName,
      university_name: universityName,
    };
  }
}
