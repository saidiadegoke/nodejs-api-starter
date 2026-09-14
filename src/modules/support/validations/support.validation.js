const SUPPORT_CATEGORIES = [
  'Registration',
  'Account & Profile',
  'Email Address',
  'Subject combinations',
  'Result issue',
  'Attendance issue',
  'Something else',
];

const SUPPORT_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const SUPPORT_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

function validateCreateTicket(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body is required' };
  }

  const { category, subject, message, priority } = body;

  if (!category || typeof category !== 'string' || !category.trim()) {
    return { ok: false, error: 'category is required' };
  }

  const normalizedCategory = SUPPORT_CATEGORIES.find(
    (c) => c.toLowerCase() === category.trim().toLowerCase()
  );
  if (!normalizedCategory) {
    return {
      ok: false,
      error: `Invalid category. Must be one of: ${SUPPORT_CATEGORIES.join(', ')}`,
    };
  }

  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    return { ok: false, error: 'subject is required' };
  }
  if (subject.trim().length > 255) {
    return { ok: false, error: 'subject must not exceed 255 characters' };
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return { ok: false, error: 'message is required' };
  }

  let normalizedPriority = 'normal';
  if (priority) {
    if (typeof priority !== 'string' || !SUPPORT_PRIORITIES.includes(priority.toLowerCase())) {
      return {
        ok: false,
        error: `Invalid priority. Must be one of: ${SUPPORT_PRIORITIES.join(', ')}`,
      };
    }
    normalizedPriority = priority.toLowerCase();
  }

  return {
    ok: true,
    data: {
      category: normalizedCategory,
      subject: subject.trim(),
      message: message.trim(),
      priority: normalizedPriority,
    },
  };
}

function validateReplyMessage(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body is required' };
  }

  const { message, attachments } = body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return { ok: false, error: 'message is required' };
  }

  if (attachments !== undefined && !Array.isArray(attachments)) {
    return { ok: false, error: 'attachments must be an array' };
  }

  return {
    ok: true,
    data: {
      message: message.trim(),
      attachments: attachments || [],
    },
  };
}

function validateUpdateStatus(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body is required' };
  }

  const { status, resolution_notes } = body;

  if (!status || typeof status !== 'string' || !SUPPORT_STATUSES.includes(status.toLowerCase())) {
    return {
      ok: false,
      error: `status is required and must be one of: ${SUPPORT_STATUSES.join(', ')}`,
    };
  }

  return {
    ok: true,
    data: {
      status: status.toLowerCase(),
      resolution_notes: resolution_notes ? String(resolution_notes).trim() : null,
    },
  };
}

module.exports = {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUSES,
  SUPPORT_PRIORITIES,
  validateCreateTicket,
  validateReplyMessage,
  validateUpdateStatus,
};
