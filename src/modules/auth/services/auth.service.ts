import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { DataSource } from 'typeorm';
import { AuthRepository } from '../repositories/auth.repository';
import { UserSessionRepository } from '../repositories/user-session.repository';
import { jwtConfig } from '../../../config/jwt.config';

const sendEmail = require('../../../utils/utils/sendEmail');
const { resolveCandidateDisplayName } = require('../../jupeb/utils/candidate-name');

function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly sessionRepo: UserSessionRepository,
    private readonly dataSource: DataSource
  ) {}

  static async formatPhoneNumber(phone?: string | null, countryId?: number): Promise<string | null> {
    if (!phone) return null;
    if (phone.startsWith('+')) return phone;

    let phoneCode = '+234'; // Default to Nigeria
    if (countryId) {
      try {
        const { AppDataSource } = require('../../../database/data-source');
        if (!AppDataSource.isInitialized) {
          await AppDataSource.initialize();
        }
        const rows = await AppDataSource.query(`SELECT phone_code FROM countries WHERE id = $1 LIMIT 1`, [countryId]);
        if (rows[0]?.phone_code) {
          phoneCode = rows[0].phone_code;
        }
      } catch {
        // fallback
      }
    }

    const cleanPhone = phone.replace(/^0+/, '');
    return `${phoneCode}${cleanPhone}`;
  }

  async formatPhoneNumber(phone?: string | null, countryId?: number): Promise<string | null> {
    return AuthService.formatPhoneNumber(phone, countryId);
  }

  /**
   * Register new user
   */
  async register(userData: any): Promise<any> {
    const { email, phone, password, role, country_id } = userData;

    if (!email && !phone) {
      const err: any = new HttpException('Either email or phone is required', HttpStatus.UNPROCESSABLE_ENTITY);
      throw err;
    }

    if (!password || password.length < 8) {
      const err: any = new HttpException('Password must be at least 8 characters', HttpStatus.UNPROCESSABLE_ENTITY);
      throw err;
    }

    const validRoles = [
      'super_admin',
      'admin',
      'agent',
      'user',
      'registrar',
      'program_director',
      'institution_admin',
    ];
    if (!role || !validRoles.includes(role)) {
      const err: any = new HttpException(
        'Valid role is required (super_admin, admin, agent, user, registrar, program_director, institution_admin)',
        HttpStatus.UNPROCESSABLE_ENTITY
      );
      throw err;
    }

    const formattedPhone = await this.formatPhoneNumber(phone, country_id);

    if (email || formattedPhone) {
      const existing = await this.authRepo.findByIdentifier(email || formattedPhone);
      if (existing) {
        const err: any = new HttpException('User with this email or phone already exists', HttpStatus.CONFLICT);
        throw err;
      }
    }

    const user = await this.authRepo.createUser({
      ...userData,
      phone: formattedPhone,
    });

    const roles = await this.authRepo.getUserRoles(user.id);
    const roleNames = roles.map((r) => r.name);

    const accessToken = this.generateAccessToken(user.id, roleNames);
    const refreshToken = this.generateRefreshToken(user.id);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.sessionRepo.createSession(user.id, refreshTokenHash, {
      source: 'registration',
      user_agent: 'web',
    });

    return {
      ...user,
      roles: roleNames,
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  /**
   * Preview candidate behind a code without claiming it
   */
  async previewByCode(code?: string): Promise<any> {
    const value = code ? String(code).trim() : '';
    if (!value) {
      const err: any = new HttpException('code is required', HttpStatus.UNPROCESSABLE_ENTITY);
      err.error_code = 'code_required';
      throw err;
    }

    const regs = await this.dataSource.query(
      `SELECT * FROM jupeb_registrations WHERE institution_issued_code = $1 LIMIT 1`,
      [value]
    );
    const reg = regs[0];
    if (!reg) {
      const err: any = new HttpException('Registration code not found', HttpStatus.NOT_FOUND);
      err.error_code = 'code_not_found';
      throw err;
    }

    if (
      reg.institution_code_expires_at &&
      new Date(reg.institution_code_expires_at).getTime() < Date.now()
    ) {
      const err: any = new HttpException('This institution code has expired', HttpStatus.GONE);
      err.error_code = 'code_expired';
      err.details = { expires_at: reg.institution_code_expires_at };
      throw err;
    }

    if (reg.status !== 'code_issued' || reg.user_id) {
      const err: any = new HttpException('This code is no longer available', HttpStatus.CONFLICT);
      err.error_code = reg.user_id ? 'code_already_claimed' : 'code_unavailable';
      throw err;
    }

    let combo: any = null;
    let university: any = null;
    let session: any = null;
    let ninRow: any = null;

    try {
      const subjectCombinationModel = require('../../jupeb/models/subject-combination.model');
      const universityModel = require('../../jupeb/models/university.model');
      const sessionModel = require('../../jupeb/models/session.model');
      const ninVerificationModel = require('../../jupeb/models/nin-verification.model');

      [combo, university, session, ninRow] = await Promise.all([
        reg.subject_combination_id ? subjectCombinationModel.findById(reg.subject_combination_id) : null,
        reg.university_id ? universityModel.findById(reg.university_id) : null,
        reg.session_id ? sessionModel.findById(reg.session_id) : null,
        reg.nin_verification_id ? ninVerificationModel.findById(reg.nin_verification_id) : null,
      ]);
    } catch {
      // jupeb models fallback
    }

    let subjectItems: any[] = [];
    if (combo) {
      try {
        const subjectCombinationModel = require('../../jupeb/models/subject-combination.model');
        subjectItems = await subjectCombinationModel.listItems(combo.id);
      } catch {
        // non-fatal
      }
    }

    const intake = (ninRow && ninRow.intake_payload) || {};
    const ninPayload = (ninRow && ninRow.response_payload) || {};

    const fullName = resolveCandidateDisplayName({
      ninPayload,
      intake,
      ninStatus: ninRow ? ninRow.status : null,
    });

    let facePhotoUrl: string | null = null;
    try {
      const faceRes = await this.dataSource.query(
        `SELECT b.file_id, b.external_reference, f.file_url
           FROM jupeb_biometric_captures b
           LEFT JOIN files f ON f.id = b.file_id OR f.id::text = b.external_reference
          WHERE b.registration_id = $1
            AND b.capture_type = 'face'
            AND b.replaced_at IS NULL
          ORDER BY b.created_at DESC
          LIMIT 1`,
        [reg.id]
      );
      if (faceRes[0]) {
        const row = faceRes[0];
        facePhotoUrl =
          row.file_url ||
          (row.external_reference &&
          (row.external_reference.startsWith('http://') || row.external_reference.startsWith('https://'))
            ? row.external_reference
            : null);
      }
    } catch {
      // non-fatal
    }

    return {
      candidate: {
        registration_id: reg.id,
        full_name: fullName,
        provisional_candidate_code: reg.provisional_candidate_code,
        photo_url: facePhotoUrl || ninPayload.photo_url || null,
        face_photo_url: facePhotoUrl,
        nin_photo_url: ninPayload.photo_url || null,
        status: reg.status,
      },
      basic_information: {
        date_of_birth: ninPayload.date_of_birth || null,
        gender: ninPayload.gender || null,
        residential_address:
          intake.residential_address || intake.address || ninPayload.address || null,
        state_of_origin: ninPayload.state_of_origin || null,
        lga: ninPayload.lga || null,
        place_of_birth: ninPayload.place_of_birth || null,
      },
      contact_information: {
        email: intake.email || null,
        phone: intake.phone || ninPayload.phone || null,
      },
      next_of_kin: ninPayload.next_of_kin || null,
      subject_combination: combo
        ? { ...combo, subject_items: subjectItems }
        : null,
      university: university
        ? {
            id: university.id,
            name: university.name,
            short_name: university.short_name,
            jupeb_prefix: university.jupeb_prefix,
          }
        : null,
      session: session
        ? { id: session.id, academic_year: session.academic_year, year_short: session.year_short }
        : null,
      code: {
        expires_at: reg.institution_code_expires_at || null,
      },
      editable_fields: ['password', 'residential_address', 'phone', 'email'],
      nin_verification: ninRow
        ? { id: ninRow.id, status: ninRow.status }
        : null,
    };
  }

  /**
   * Complete registration wizard
   */
  async completeRegistration(body: any): Promise<any> {
    if (!body || typeof body !== 'object') {
      const err: any = new HttpException('Body is required', HttpStatus.UNPROCESSABLE_ENTITY);
      throw err;
    }
    const code = body.code ? String(body.code).trim() : '';
    const password = body.password ? String(body.password).trim() : '';
    if (!code) {
      const err: any = new HttpException('code is required', HttpStatus.UNPROCESSABLE_ENTITY);
      err.error_code = 'code_required';
      throw err;
    }
    if (!password || password.length < 8) {
      const err: any = new HttpException('Password must be at least 8 characters', HttpStatus.UNPROCESSABLE_ENTITY);
      err.error_code = 'weak_password';
      throw err;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const lock = await queryRunner.query(
        `SELECT * FROM jupeb_registrations WHERE institution_issued_code = $1 FOR UPDATE`,
        [code]
      );
      const reg = lock[0];
      if (!reg) {
        await queryRunner.rollbackTransaction();
        const err: any = new HttpException('Registration code not found', HttpStatus.NOT_FOUND);
        err.error_code = 'code_not_found';
        throw err;
      }
      if (
        reg.institution_code_expires_at &&
        new Date(reg.institution_code_expires_at).getTime() < Date.now()
      ) {
        await queryRunner.rollbackTransaction();
        const err: any = new HttpException('This institution code has expired', HttpStatus.GONE);
        err.error_code = 'code_expired';
        err.details = { expires_at: reg.institution_code_expires_at };
        throw err;
      }
      if (reg.status !== 'code_issued' || reg.user_id) {
        await queryRunner.rollbackTransaction();
        const err: any = new HttpException('This code is no longer available', HttpStatus.CONFLICT);
        err.error_code = reg.user_id ? 'code_already_claimed' : 'code_unavailable';
        throw err;
      }

      let intakePayload: any = {};
      let ninResponse: any = {};
      let ninStatus: any = null;
      if (reg.nin_verification_id) {
        const ninRes = await queryRunner.query(
          `SELECT response_payload, intake_payload, status FROM jupeb_nin_verifications WHERE id = $1`,
          [reg.nin_verification_id]
        );
        if (ninRes[0]) {
          intakePayload = ninRes[0].intake_payload || {};
          ninResponse = ninRes[0].response_payload || {};
          ninStatus = ninRes[0].status || null;
        }
      }

      const email = (body.email && String(body.email).trim().toLowerCase())
        || (intakePayload.email && String(intakePayload.email).trim().toLowerCase())
        || null;
      const phone = (body.phone && String(body.phone).trim())
        || (intakePayload.phone && String(intakePayload.phone).trim())
        || (ninResponse.phone && String(ninResponse.phone).trim())
        || null;

      if (!email && !phone) {
        await queryRunner.rollbackTransaction();
        const err: any = new HttpException('email or phone is required', HttpStatus.UNPROCESSABLE_ENTITY);
        err.error_code = 'identifier_required';
        throw err;
      }

      const fullName = resolveCandidateDisplayName({
        ninPayload: ninResponse,
        intake: intakePayload,
        ninStatus,
      });
      const [first_name, ...rest] = (body.first_name
        ? [String(body.first_name).trim(), String(body.last_name || '').trim()]
        : (fullName ? fullName.split(/\s+/) : ['Candidate', '']));
      const last_name = body.last_name ? String(body.last_name).trim() : rest.join(' ').trim() || '';

      if (email) {
        const dup = await queryRunner.query(
          `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1`,
          [email]
        );
        if (dup.length) {
          await queryRunner.rollbackTransaction();
          const err: any = new HttpException('Email already in use', HttpStatus.CONFLICT);
          err.error_code = 'email_in_use';
          throw err;
        }
      }
      if (phone) {
        const dup = await queryRunner.query(
          `SELECT id FROM users WHERE phone = $1 AND deleted_at IS NULL LIMIT 1`,
          [phone]
        );
        if (dup.length) {
          await queryRunner.rollbackTransaction();
          const err: any = new HttpException('Phone already in use', HttpStatus.CONFLICT);
          err.error_code = 'phone_in_use';
          throw err;
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const userInsert = await queryRunner.query(
        `INSERT INTO users (email, phone, password_hash, status)
         VALUES ($1, $2, $3, 'active')
         RETURNING id, email, phone, status, created_at`,
        [email, phone, passwordHash]
      );
      const user = userInsert[0];

      const displayName = [first_name, last_name].filter(Boolean).join(' ').trim() || null;
      const residentialAddress = (body.residential_address && String(body.residential_address).trim())
        || (intakePayload.residential_address && String(intakePayload.residential_address).trim())
        || (intakePayload.address && String(intakePayload.address).trim())
        || (ninResponse.address && String(ninResponse.address).trim())
        || null;

      const fileId = body.file_id || (body.id && isUuid(body.id) ? body.id : null);
      let facePhotoUrl = body.photo_url || body.image_url || body.profile_photo_url || body.face_photo_url || null;
      if (fileId) {
        const fileRow = await queryRunner.query(`SELECT file_url FROM files WHERE id = $1`, [fileId]);
        if (fileRow.length) {
          facePhotoUrl = fileRow[0].file_url;
        }
      }
      if (!facePhotoUrl) {
        const faceRes = await queryRunner.query(
          `SELECT b.file_id, b.external_reference, f.file_url
             FROM jupeb_biometric_captures b
             LEFT JOIN files f ON f.id = b.file_id OR f.id::text = b.external_reference
            WHERE b.registration_id = $1
              AND b.capture_type = 'face'
              AND b.replaced_at IS NULL
            ORDER BY b.created_at DESC
            LIMIT 1`,
          [reg.id]
        );
        if (faceRes[0]) {
          const row = faceRes[0];
          facePhotoUrl =
            row.file_url ||
            (row.external_reference &&
            (row.external_reference.startsWith('http://') || row.external_reference.startsWith('https://'))
              ? row.external_reference
              : null);
        }
      }

      await queryRunner.query(
        `INSERT INTO profiles (
           user_id, first_name, last_name, display_name,
           gender, date_of_birth, residential_address, profile_photo_url
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          user.id,
          first_name,
          last_name,
          displayName,
          ninResponse.gender || null,
          ninResponse.date_of_birth || null,
          residentialAddress,
          facePhotoUrl || ninResponse.photo_url || null,
        ]
      );

      await queryRunner.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id
           FROM roles
          WHERE name = 'user'
            AND owner_jupeb_university_id IS NULL
          ORDER BY is_system DESC, created_at ASC
          LIMIT 1
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [user.id]
      );

      const nextStatus = 'claimed';
      await queryRunner.query(
        `UPDATE jupeb_registrations
            SET user_id = $1,
                status = $2,
                claimed_at = NOW(),
                updated_at = NOW()
          WHERE id = $3`,
        [user.id, nextStatus, reg.id]
      );

      await queryRunner.query(
        `INSERT INTO jupeb_registration_status_history
           (registration_id, from_status, to_status, changed_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          reg.id,
          reg.status,
          nextStatus,
          user.id,
          'Claimed institution code via complete-registration wizard',
        ]
      );

      await queryRunner.commitTransaction();

      const roles = ['user'];
      const accessToken = this.generateAccessToken(user.id, roles);
      const refreshToken = this.generateRefreshToken(user.id);
      const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
      await this.sessionRepo.createSession(user.id, refreshTokenHash, {
        source: 'registration_wizard',
        user_agent: 'web',
      });

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: 3600,
        user: {
          user_id: user.id,
          first_name,
          last_name,
          phone: user.phone,
          email: user.email,
          role: 'user',
          roles,
          permissions: [],
          profile_photo: facePhotoUrl || ninResponse.photo_url || null,
          rating: null,
          verified: false,
          created_at: user.created_at,
        },
        registration: {
          id: reg.id,
          status: nextStatus,
          provisional_candidate_code: reg.provisional_candidate_code,
          jupeb_candidate_number: reg.jupeb_candidate_number,
          claimed_at: new Date(),
          next_step: 'confirm_subjects',
        },
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Login user
   */
  async login(identifier: string, password: string, deviceInfo: Record<string, unknown> = {}): Promise<any> {
    const user = await this.authRepo.findByIdentifier(identifier);
    if (!user || !user.password_hash) {
      const err: any = new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      throw err;
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      const err: any = new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      throw err;
    }

    if (user.status !== 'active') {
      const err: any = new HttpException('Account is not active', HttpStatus.FORBIDDEN);
      throw err;
    }

    const roles = await this.authRepo.getUserRoles(user.id);
    const roleNames = roles.map((r) => r.name);

    const accessToken = this.generateAccessToken(user.id, roleNames);
    const refreshToken = this.generateRefreshToken(user.id);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.sessionRepo.createSession(user.id, refreshTokenHash, deviceInfo);

    await this.dataSource.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    let registration: any = null;
    try {
      const regRes = await this.dataSource.query(
        `SELECT id, status, provisional_candidate_code, jupeb_candidate_number,
                claimed_at, submitted_at, approved_at, dashboard_unlocked_at,
                university_id
           FROM jupeb_registrations
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [user.id]
      );
      if (regRes[0]) {
        const r = regRes[0];
        let docsStats: any = null;
        let bioStats: any = null;
        if (r.status === 'pending_documents') {
          const [docsRes, bioRes, reqRes] = await Promise.all([
            this.dataSource.query(
              `SELECT COUNT(*)::int AS uploaded
                 FROM jupeb_registration_documents
                WHERE registration_id = $1`,
              [r.id]
            ),
            this.dataSource.query(
              `SELECT COUNT(*)::int AS captured
                 FROM jupeb_biometric_captures
                WHERE registration_id = $1
                  AND replaced_at IS NULL`,
              [r.id]
            ),
            this.dataSource.query(
              `SELECT COUNT(*)::int AS required
                 FROM jupeb_document_requirements
                WHERE (university_id = $1 OR is_global = true)
                  AND is_active = true`,
              [r.university_id]
            ),
          ]);
          docsStats = {
            uploaded: docsRes[0]?.uploaded ?? 0,
            required: reqRes[0]?.required ?? 0,
          };
          bioStats = { captured: bioRes[0]?.captured ?? 0 };
        }

        registration = {
          id: r.id,
          status: r.status,
          provisional_candidate_code: r.provisional_candidate_code,
          jupeb_candidate_number: r.jupeb_candidate_number,
          claimed_at: r.claimed_at,
          submitted_at: r.submitted_at,
          approved_at: r.approved_at,
          dashboard_unlocked: Boolean(r.dashboard_unlocked_at),
          next_step: this._computeNextStep(r, docsStats, bioStats),
        };
      }
    } catch {
      // jupeb absent
    }

    let university: any = null;
    try {
      const universityModel = require('../../jupeb/models/university.model');
      university = await universityModel.resolveForUser(user.id);
    } catch {
      // jupeb absent
    }

    const permissions = await this.getUserPermissions(user.id);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 3600,
      user: {
        user_id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        email: user.email,
        role: roleNames[0] || null,
        roles: roleNames,
        permissions,
        profile_photo: user.profile_photo_url || null,
        rating: null,
        verified: user.email_verified && user.phone_verified,
        created_at: user.created_at,
      },
      university,
      registration,
    };
  }

  static _computeNextStep(reg: any, docs: any = null, bio: any = null): string | null {
    const status = reg && reg.status;
    switch (status) {
      case 'code_issued':
        return 'claim_code';
      case 'claimed':
        return 'confirm_subjects';
      case 'pending_student_confirm':
        return 'confirm_subjects';
      case 'pending_documents': {
        if (docs !== null && bio !== null) {
          const docsComplete = docs.required === 0 || docs.uploaded >= docs.required;
          const bioComplete = bio.captured > 0;
          if (docsComplete && bioComplete) return 'submit_for_review';
          if (docsComplete) return 'upload_biometrics';
        }
        return 'upload_documents';
      }
      case 'pending_institution_review':
        return 'await_review';
      case 'approved':
        return 'view_dashboard';
      case 'rejected':
        return 'view_rejection';
      case 'withdrawn':
        return 'restart';
      default:
        return null;
    }
  }

  _computeNextStep(reg: any, docs: any = null, bio: any = null): string | null {
    return AuthService._computeNextStep(reg, docs, bio);
  }

  static rolesClaimForToken(roles: any[]): string[] {
    if (!Array.isArray(roles)) return [];
    const names = roles
      .map((r) => {
        if (typeof r === 'string' && r.length > 0) return r;
        if (r && typeof r === 'object' && typeof r.name === 'string' && r.name.length > 0) return r.name;
        return null;
      })
      .filter(Boolean) as string[];
    return [...new Set(names)];
  }

  rolesClaimForToken(roles: any[]): string[] {
    return AuthService.rolesClaimForToken(roles);
  }

  static generateAccessToken(userId: string, roles: any[] = []): string {
    const config = (jwtConfig as any)();
    return jwt.sign(
      {
        user_id: userId,
        roles: this.rolesClaimForToken(roles),
        type: 'access',
      },
      config.secret,
      { expiresIn: config.expiresIn as jwt.SignOptions['expiresIn'] }
    );
  }

  generateAccessToken(userId: string, roles: any[] = []): string {
    return AuthService.generateAccessToken(userId, roles);
  }

  static generateRefreshToken(userId: string): string {
    const config = (jwtConfig as any)();
    return jwt.sign(
      {
        user_id: userId,
        type: 'refresh',
        session_id: uuidv4(),
      },
      config.refreshSecret,
      { expiresIn: config.refreshExpiresIn as jwt.SignOptions['expiresIn'] }
    );
  }

  generateRefreshToken(userId: string): string {
    return AuthService.generateRefreshToken(userId);
  }

  static verifyAccessToken(token: string): any {
    try {
      const config = (jwtConfig as any)();
      return jwt.verify(token, config.secret);
    } catch {
      throw new HttpException('Invalid or expired token', HttpStatus.UNAUTHORIZED);
    }
  }

  verifyAccessToken(token: string): any {
    return AuthService.verifyAccessToken(token);
  }

  async refreshToken(refreshToken: string): Promise<any> {
    try {
      const config = (jwtConfig as any)();
      const payload: any = jwt.verify(refreshToken, config.refreshSecret);

      if (payload.type !== 'refresh') {
        throw new HttpException('Invalid token type', HttpStatus.UNAUTHORIZED);
      }

      const roles = await this.authRepo.getUserRoles(payload.user_id);
      const roleNames = roles.map((r) => r.name);

      const accessToken = this.generateAccessToken(payload.user_id, roleNames);

      return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
      };
    } catch {
      throw new HttpException('Invalid or expired refresh token', HttpStatus.UNAUTHORIZED);
    }
  }

  async logout(_userId: string, sessionId?: string): Promise<boolean> {
    if (sessionId) {
      await this.sessionRepo.revokeSession(sessionId);
    }
    return true;
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    try {
      const res = await this.dataSource.query(
        `SELECT DISTINCT p.name FROM (
          SELECT p.id, p.name FROM user_permissions up
          JOIN permissions p ON up.permission_id = p.id
          WHERE up.user_id = $1 AND up.granted = true
          AND (up.expires_at IS NULL OR up.expires_at > NOW())
          UNION
          SELECT p.id, p.name FROM user_roles ur
          JOIN role_permissions rp ON ur.role_id = rp.role_id
          JOIN permissions p ON rp.permission_id = p.id
          WHERE ur.user_id = $1
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          AND NOT EXISTS (
            SELECT 1 FROM user_permissions up2
            WHERE up2.user_id = $1 
            AND up2.permission_id = p.id
            AND up2.granted = false
          )
        ) p
        ORDER BY p.name ASC`,
        [userId],
      );
      return res.map((r: any) => r.name);
    } catch {
      return [];
    }
  }

  static _verificationTtlMs(): number {
    const hours = Number(process.env.EMAIL_VERIFICATION_TTL_HOURS) || 24;
    return Math.max(1, hours) * 60 * 60 * 1000;
  }

  _verificationTtlMs(): number {
    return AuthService._verificationTtlMs();
  }

  static _hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  _hashToken(token: string): string {
    return AuthService._hashToken(token);
  }

  static _verifyUrl(token: string): string {
    const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    return `${base}/auth/verify-email?token=${encodeURIComponent(token)}`;
  }

  _verifyUrl(token: string): string {
    return AuthService._verifyUrl(token);
  }

  static async sendVerificationEmail(
    userId: string,
    { templateFile = 'email-verification.html' }: { templateFile?: string } = {}
  ): Promise<{ token?: string }> {
    const { AppDataSource } = require('../../../database/data-source');
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const rows = await AppDataSource.query(
      `SELECT u.id, u.email, u.email_verified, p.first_name
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id
        WHERE u.id = $1 LIMIT 1`,
      [userId]
    );
    const user = rows[0];
    if (!user) {
      const err: any = new HttpException('User not found', HttpStatus.NOT_FOUND);
      err.error_code = 'user_not_found';
      throw err;
    }
    if (!user.email) {
      const err: any = new HttpException('User has no email address', HttpStatus.UNPROCESSABLE_ENTITY);
      err.error_code = 'email_required';
      throw err;
    }
    if (user.email_verified) {
      const err: any = new HttpException('Email already verified', HttpStatus.CONFLICT);
      err.error_code = 'email_already_verified';
      throw err;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = AuthService._hashToken(rawToken);
    const expiresAt = new Date(Date.now() + AuthService._verificationTtlMs());

    await AppDataSource.query(
      `UPDATE users
          SET email_verification_token_hash = $1,
              email_verification_expires_at = $2,
              updated_at = NOW()
        WHERE id = $3`,
      [tokenHash, expiresAt.toISOString(), user.id]
    );

    const verifyUrl = AuthService._verifyUrl(rawToken);
    const appName = process.env.APP_NAME || 'Registration Portal';

    setImmediate(() => {
      sendEmail({
        to: user.email,
        subject: `Verify your email for ${appName}`,
        templateFile,
        placeholders: {
          appName,
          firstName: user.first_name || 'there',
          verifyUrl,
          ttlHours: Math.round(AuthService._verificationTtlMs() / 3600000),
          email: user.email,
          year: new Date().getUTCFullYear(),
        },
      }).catch((err: any) => {
        // eslint-disable-next-line no-console
        console.warn('[auth.sendVerificationEmail] send failed:', err && err.message);
      });
    });

    return process.env.NODE_ENV === 'test' ? { token: rawToken } : {};
  }

  async sendVerificationEmail(
    userId: string,
    options?: { templateFile?: string }
  ): Promise<{ token?: string }> {
    return AuthService.sendVerificationEmail(userId, options);
  }

  static async resendVerificationEmail(userId: string): Promise<{ token?: string }> {
    return AuthService.sendVerificationEmail(userId, { templateFile: 'resend-verification.html' });
  }

  async resendVerificationEmail(userId: string): Promise<{ token?: string }> {
    return AuthService.resendVerificationEmail(userId);
  }

  static async verifyEmailToken(rawToken?: string): Promise<{ id: string; email: string; email_verified: boolean }> {
    if (!rawToken || typeof rawToken !== 'string') {
      const err: any = new HttpException('Token is required', HttpStatus.UNPROCESSABLE_ENTITY);
      err.error_code = 'token_required';
      throw err;
    }

    const tokenHash = AuthService._hashToken(rawToken.trim());
    const { AppDataSource } = require('../../../database/data-source');
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const rows = await AppDataSource.query(
      `SELECT id, email, email_verified, email_verification_expires_at
         FROM users
        WHERE email_verification_token_hash = $1
        LIMIT 1`,
      [tokenHash]
    );
    const user = rows[0];
    if (!user) {
      const err: any = new HttpException('Invalid verification token', HttpStatus.BAD_REQUEST);
      err.error_code = 'invalid_token';
      throw err;
    }
    if (user.email_verified) {
      return { id: user.id, email: user.email, email_verified: true };
    }
    if (
      user.email_verification_expires_at &&
      new Date(user.email_verification_expires_at).getTime() < Date.now()
    ) {
      const err: any = new HttpException('Verification link has expired. Request a new one.', HttpStatus.GONE);
      err.error_code = 'token_expired';
      throw err;
    }

    await AppDataSource.query(
      `UPDATE users
          SET email_verified = TRUE,
              email_verified_at = NOW(),
              email_verification_token_hash = NULL,
              email_verification_expires_at = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [user.id]
    );

    return { id: user.id, email: user.email, email_verified: true };
  }

  async verifyEmailToken(rawToken?: string): Promise<{ id: string; email: string; email_verified: boolean }> {
    return AuthService.verifyEmailToken(rawToken);
  }
}

module.exports = AuthService;
module.exports.AuthService = AuthService;
module.exports.default = AuthService;

