/**
 * Map PostgreSQL unique-violation (23505) to API-friendly field + message.
 */

const CONSTRAINT_MAP = {
  idx_jupeb_universities_code_lower: { field: 'code', message: 'University code already exists' },
  idx_jupeb_universities_prefix_active: {
    field: 'jupeb_prefix',
    message: 'JUPEB prefix is already assigned to another institution',
  },
  idx_jupeb_sc_code_lower: {
    field: 'code',
    message: 'Subject combination code already exists',
  },
  idx_payment_items_code_lower: { field: 'code', message: 'Payment item code already exists' },
  idx_payment_structures_code_lower: {
    field: 'code',
    message: 'Payment structure code already exists',
  },
  users_email_key: { field: 'email', message: 'Email address is already registered' },
  users_phone_key: { field: 'phone', message: 'Phone number is already registered' },
};

const FIELD_MESSAGES = {
  code: 'This code is already in use',
  jupeb_prefix: 'This JUPEB prefix is already assigned to another institution',
  email: 'This email is already registered',
  phone: 'This phone number is already registered',
  academic_year: 'An academic session with this year already exists',
};

/**
 * @param {Error & { code?: string, constraint?: string, detail?: string }} err
 * @returns {{ status: number, message: string, details: object } | null}
 */
function mapUniqueViolation(err) {
  if (!err || err.code !== '23505') {
    return null;
  }

  const constraint = err.constraint || '';
  const mapped = CONSTRAINT_MAP[constraint];

  let field = mapped && mapped.field;
  let value;

  const detail = err.detail || '';
  const keyMatch = detail.match(/^Key \(([^)]+)\)=\((.*)\) already exists\.$/);
  if (keyMatch) {
    field = field || keyMatch[1];
    value = keyMatch[2];
  }

  const message =
    (mapped && mapped.message) ||
    (field && FIELD_MESSAGES[field]) ||
    (field ? `Duplicate value for ${field}` : 'Duplicate value violates unique constraint');

  return {
    status: 409,
    message,
    details: {
      error_code: 'duplicate',
      field: field || 'unknown',
      ...(value !== undefined ? { value } : {}),
      ...(constraint ? { constraint } : {}),
    },
  };
}

/**
 * Attach mapped details to an Error for controller sendError().
 * @param {Error} err
 * @returns {Error}
 */
function enrichUniqueViolationError(err) {
  const mapped = mapUniqueViolation(err);
  if (!mapped) {
    return err;
  }
  const out = new Error(mapped.message);
  out.status = mapped.status;
  out.details = mapped.details;
  out.code = err.code;
  return out;
}

module.exports = {
  mapUniqueViolation,
  enrichUniqueViolationError,
};
