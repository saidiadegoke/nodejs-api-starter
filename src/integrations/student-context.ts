import { DataSource } from 'typeorm';

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
  roles?: string[];
}

export async function resolveStudentContext(
  dataSource: DataSource,
  userIdOrOptions: string | StudentContextOptions,
  maybeOptions: StudentContextOptions = {},
) {
  let userId: string | null = null;
  let candidateCode: string | null = null;

  if (typeof userIdOrOptions === 'object' && userIdOrOptions !== null) {
    userId = userIdOrOptions.userId || userIdOrOptions.user_id || null;
    candidateCode = userIdOrOptions.candidateCode || userIdOrOptions.candidate_code || null;
  } else {
    userId = typeof userIdOrOptions === 'string' ? userIdOrOptions : null;
    candidateCode = maybeOptions.candidateCode || maybeOptions.candidate_code || null;
  }

  if (candidateCode) {
    candidateCode = String(candidateCode).trim();
  }

  if (!userId && !candidateCode) {
    throw httpError(401, 'Authentication required');
  }

  let reg: any = null;

  if (candidateCode) {
    const rows = await dataSource.query(
      `SELECT * FROM jupeb_registrations
       WHERE provisional_candidate_code = $1 OR institution_issued_code = $1 OR jupeb_candidate_number = $1
       ORDER BY created_at DESC LIMIT 1`,
      [candidateCode],
    );
    reg = rows[0] || null;

    if (!reg) {
      throw httpError(404, `No registration found for candidate code: ${candidateCode}`, {
        error_code: 'registration_not_found',
      });
    }
  } else {
    const rows = await dataSource.query(
      `SELECT * FROM jupeb_registrations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
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
      reg.jupeb_candidate_number ||
      reg.provisional_candidate_code ||
      reg.institution_issued_code ||
      null,
    attendance_registration_code: reg.attendance_registration_code || null,
    student_id: reg.attendance_student_id || null,
    is_result_released: Boolean(reg.is_result_released),
  };
}
