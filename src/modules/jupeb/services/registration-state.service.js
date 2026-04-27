/**
 * Allowed registration status transitions (see docs/005-jupeb-registration-technical-design.md).
 */
const TRANSITIONS = {
  provisional: ['code_issued', 'withdrawn'],
  code_issued: ['claimed', 'withdrawn'],
  claimed: ['pending_student_confirm', 'pending_documents', 'withdrawn'],
  pending_student_confirm: ['pending_documents', 'withdrawn'],
  pending_documents: ['pending_institution_review', 'withdrawn'],
  pending_institution_review: ['approved', 'rejected', 'withdrawn'],
  approved: [],
  rejected: [],
  withdrawn: [],
};

function canTransition(from, to) {
  const next = TRANSITIONS[from];
  return Array.isArray(next) && next.includes(to);
}

module.exports = {
  canTransition,
  TRANSITIONS,
};
