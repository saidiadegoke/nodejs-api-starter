import type { DataSource } from 'typeorm';

function httpError(status: number, message: string, details: any = null) {
  const err = new Error(message) as any;
  err.status = status;
  if (details) err.details = details;
  return err;
}

export interface StudentContextOptions {
  userId?: string;
  user_id?: string;
  candidateCode?: string;
  candidate_code?: string;
  candidateNumber?: string;
  candidate_number?: string;
  candidate_reg_number?: string;
  registration_number?: string;
  roles?: string[];
  [key: string]: any;
}

function extractCandidateIdentifier(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const raw =
    obj.candidate_code ??
    obj.candidate_number ??
    obj.candidateCode ??
    obj.candidateNumber ??
    obj.candidate_reg_number ??
    obj.registration_number;
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function executeQuery(db: any, text: string, params: any[]): Promise<any[]> {
  const res = await db.query(text, params);
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.rows)) return res.rows;
  return [];
}

export async function resolveStudentContext(
  dataSourceOrUserId: DataSource | any,
  userIdOrOptions?: string | StudentContextOptions,
  maybeOptions: StudentContextOptions = {},
) {
  let db: any = null;
  let userId: string | null = null;
  let candidateCode: string | null = null;

  if (dataSourceOrUserId && typeof dataSourceOrUserId.query === 'function') {
    db = dataSourceOrUserId;
    if (typeof userIdOrOptions === 'object' && userIdOrOptions !== null) {
      userId = userIdOrOptions.userId || userIdOrOptions.user_id || null;
      candidateCode = extractCandidateIdentifier(userIdOrOptions);
    } else {
      userId = typeof userIdOrOptions === 'string' ? userIdOrOptions : null;
      candidateCode = extractCandidateIdentifier(maybeOptions);
    }
  } else {
    // Legacy / CommonJS invocation where dataSource wasn't passed as first arg
    db = require('../database/pool');
    if (typeof dataSourceOrUserId === 'object' && dataSourceOrUserId !== null) {
      userId = dataSourceOrUserId.userId || dataSourceOrUserId.user_id || null;
      candidateCode = extractCandidateIdentifier(dataSourceOrUserId);
    } else {
      userId = typeof dataSourceOrUserId === 'string' ? dataSourceOrUserId : null;
      const opts =
        typeof userIdOrOptions === 'object' && userIdOrOptions !== null
          ? userIdOrOptions
          : maybeOptions;
      candidateCode = extractCandidateIdentifier(opts);
    }
  }

  if (candidateCode) {
    candidateCode = String(candidateCode).trim();
  }

  if (!userId && !candidateCode) {
    throw httpError(401, 'Authentication required');
  }

  let reg: any = null;

  if (candidateCode) {
    const rows = await executeQuery(
      db,
      `SELECT r.*
         FROM jupeb_registrations r
         LEFT JOIN jupeb_registration_sessions s ON s.id = r.session_id
        WHERE UPPER(COALESCE(r.jupeb_candidate_number, '')) = UPPER($1)
           OR UPPER(COALESCE(r.provisional_candidate_code, '')) = UPPER($1)
           OR UPPER(COALESCE(r.institution_issued_code, '')) = UPPER($1)
           OR UPPER(COALESCE(r.attendance_registration_code, '')) = UPPER($1)
           OR UPPER(COALESCE(r.attendance_student_id, '')) = UPPER($1)
           OR r.id::text = $1
        ORDER BY (s.status = 'open') DESC,
                 r.updated_at DESC NULLS LAST,
                 r.created_at DESC
        LIMIT 1`,
      [candidateCode],
    );
    reg = rows[0] || null;

    if (!reg) {
      throw httpError(404, `No registration found for candidate code: ${candidateCode}`, {
        error_code: 'registration_not_found',
      });
    }
  } else {
    const rows = await executeQuery(
      db,
      `SELECT r.*
         FROM jupeb_registrations r
         LEFT JOIN jupeb_registration_sessions s ON s.id = r.session_id
        WHERE r.user_id = $1
        ORDER BY (s.status = 'open') DESC,
                 r.updated_at DESC NULLS LAST,
                 r.created_at DESC
        LIMIT 1`,
      [userId],
    );
    reg = rows[0] || null;

    if (!reg) {
      throw httpError(404, 'No registration found for current user', {
        error_code: 'registration_not_found',
      });
    }
  }

  return {
    registration_id: reg.id,
    user_id: reg.user_id || userId,
    session_id: reg.session_id,
    university_id: reg.university_id,
    candidate_code:
      candidateCode ||
      reg.jupeb_candidate_number ||
      reg.provisional_candidate_code ||
      reg.institution_issued_code ||
      null,
    candidate_number: reg.jupeb_candidate_number || candidateCode || null,
    attendance_registration_code: reg.attendance_registration_code || null,
    student_id: reg.attendance_student_id || null,
    is_result_released: Boolean(reg.is_result_released),
  };
}
