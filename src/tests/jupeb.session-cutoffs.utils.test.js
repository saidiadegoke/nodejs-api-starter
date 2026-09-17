const {
  evaluateSessionWindows,
  describeSessionWindowFailure,
} = require('../modules/jupeb/utils/session-validation');

/** Session row shape as node-pg returns it (naive timestamps → local Date). */
function sessionWith(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'open',
    opens_at: new Date('2026-01-01T00:00:00.000Z'),
    closes_at: new Date('2026-12-01T00:00:00.000Z'),
    candidate_info_cutoff_at: null,
    profile_update_cutoff_at: null,
    ca_cutoff_at: null,
    student_submission_deadline: null,
    institution_approval_deadline: null,
    ...overrides,
  };
}

const AFTER = new Date('2026-06-01T00:00:00.000Z');
const BEFORE = new Date('2025-06-01T00:00:00.000Z');

describe('JUPEB session window utils', () => {
  describe('evaluateSessionWindows', () => {
    it('treats null cutoffs and deadlines as no restriction', () => {
      const w = evaluateSessionWindows(sessionWith(), AFTER);
      expect(w.cutoffs.candidate_info.passed).toBe(false);
      expect(w.cutoffs.profile_update.passed).toBe(false);
      expect(w.cutoffs.ca.passed).toBe(false);
      expect(w.deadlines.student_submission.passed).toBe(false);
      expect(w.deadlines.institution_approval.passed).toBe(false);
      expect(w.cutoffs.candidate_info.at).toBeNull();
    });

    it('reports a cutoff as passed once now reaches the bound', () => {
      const w = evaluateSessionWindows(
        sessionWith({ candidate_info_cutoff_at: new Date('2026-05-01T00:00:00.000Z') }),
        AFTER
      );
      expect(w.cutoffs.candidate_info.passed).toBe(true);
      expect(w.cutoffs.candidate_info.field).toBe('candidate_info_cutoff_at');
    });

    it('closes the window exactly at the cutoff instant', () => {
      const bound = new Date('2026-06-01T00:00:00.000Z');
      const w = evaluateSessionWindows(
        sessionWith({ candidate_info_cutoff_at: bound }),
        new Date(bound.getTime())
      );
      expect(w.cutoffs.candidate_info.passed).toBe(true);
    });

    it('marks a future opens_at as not yet open', () => {
      const w = evaluateSessionWindows(
        sessionWith({ opens_at: new Date('2026-09-30T00:00:00.000Z') }),
        new Date('2026-09-17T00:00:00.000Z')
      );
      expect(w.has_opened).toBe(false);
      expect(w.within_window).toBe(false);
      expect(w.is_closed).toBe(false);
    });

    it('marks a past closes_at as closed', () => {
      const w = evaluateSessionWindows(
        sessionWith({ closes_at: new Date('2026-05-01T00:00:00.000Z') }),
        AFTER
      );
      expect(w.is_closed).toBe(true);
      expect(w.within_window).toBe(false);
    });

    it('is within the window between opens_at and closes_at', () => {
      const w = evaluateSessionWindows(sessionWith(), AFTER);
      expect(w.within_window).toBe(true);
    });

    it('parses naive timestamps without applying a UTC offset twice', () => {
      // A naive "2026-05-01 00:00:00" must compare as that local wall-clock
      // instant — NOT as 2026-05-01T00:00:00Z. Two hours before the local
      // bound it is not yet passed; an hour after, it is.
      const w = evaluateSessionWindows(
        sessionWith({ candidate_info_cutoff_at: '2026-05-01T00:00:00.000Z' }),
        new Date('2026-04-30T22:00:00.000Z')
      );
      expect(w.cutoffs.candidate_info.passed).toBe(false);

      const localBound = new Date('2026-05-01T00:00:00.000Z');
      const justAfter = new Date(localBound.getTime() + 60 * 60 * 1000);
      const w2 = evaluateSessionWindows(
        sessionWith({ candidate_info_cutoff_at: localBound }),
        justAfter
      );
      expect(w2.cutoffs.candidate_info.passed).toBe(true);
    });

    it('tolerates a null session', () => {
      const w = evaluateSessionWindows(null, AFTER);
      expect(w.within_window).toBe(true);
      expect(w.cutoffs.candidate_info.passed).toBe(false);
    });
  });

  describe('describeSessionWindowFailure', () => {
    it('returns null when the write is still allowed', () => {
      expect(describeSessionWindowFailure(sessionWith(), 'candidate_info', AFTER)).toBeNull();
      expect(describeSessionWindowFailure(sessionWith(), 'session_window', AFTER)).toBeNull();
    });

    it('names the passed cutoff field and instant', () => {
      const f = describeSessionWindowFailure(
        sessionWith({ candidate_info_cutoff_at: new Date('2026-05-01T00:00:00.000Z') }),
        'candidate_info',
        AFTER
      );
      expect(f.status).toBe(423);
      expect(f.details.error_code).toBe('session_cutoff_passed');
      expect(f.details.cutoff).toBe('candidate_info_cutoff_at');
      expect(f.details.cutoff_at).toBe('2026-05-01T00:00:00.000Z');
      expect(f.message).toMatch(/Candidate information entry closed/);
    });

    it('reports a not-yet-open session distinctly from a passed cutoff', () => {
      const f = describeSessionWindowFailure(
        sessionWith({ opens_at: new Date('2026-09-30T00:00:00.000Z') }),
        'session_window',
        new Date('2026-09-17T00:00:00.000Z')
      );
      expect(f.status).toBe(423);
      expect(f.details.error_code).toBe('session_not_open');
      expect(f.details.opens_at).toBeTruthy();
    });

    it('reports a closed session window', () => {
      const f = describeSessionWindowFailure(
        sessionWith({ closes_at: new Date('2026-05-01T00:00:00.000Z') }),
        'session_window',
        AFTER
      );
      expect(f.status).toBe(423);
      expect(f.details.error_code).toBe('session_window_closed');
      expect(f.details.closes_at).toBeTruthy();
    });

    it('does not gate on the window for a cutoff check and vice versa', () => {
      const notOpen = sessionWith({ opens_at: new Date('2027-01-01T00:00:00.000Z') });
      expect(describeSessionWindowFailure(notOpen, 'candidate_info', AFTER)).toBeNull();
    });
  });
});
