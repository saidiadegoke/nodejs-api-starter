'use strict';

/**
 * Statuses that are excluded from student/registration counts across dashboard,
 * institution overview, catalog, and subject enrollment charts.
 * Per specification: rejected and withdrawn registrations must not be counted.
 */
const EXCLUDED_FROM_STUDENT_COUNT_STATUSES = ['withdrawn', 'rejected'];

/**
 * Generates SQL condition to filter for valid/active student registrations
 * (excluding withdrawn and rejected registrations).
 *
 * @param {string} [tableAlias='r'] - The alias of the registrations table, e.g. 'r' or empty string ''.
 * @returns {string} SQL snippet, e.g. "r.status NOT IN ('withdrawn', 'rejected')"
 */
function getActiveStudentStatusCondition(tableAlias = 'r') {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return `${prefix}status NOT IN ('withdrawn', 'rejected')`;
}

module.exports = {
  EXCLUDED_FROM_STUDENT_COUNT_STATUSES,
  getActiveStudentStatusCondition,
};
