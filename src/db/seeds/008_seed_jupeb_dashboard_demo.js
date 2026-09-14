/**
 * Dashboard demo correctness seed.
 *
 * The base demo seed (005) puts all its registrations in the current
 * session and leaves the prior session empty — so the stat-card deltas
 * have nothing to compare against and read `null`. It also leaves the
 * "current" session resolvable only if it is the open one.
 *
 * This seed makes the dashboard demonstrate correctly:
 *   1. ensures 2025/2026 is THE open session (so /dashboard/* resolves
 *      to it when no session_id is passed),
 *   2. backfills the prior session (2024/2025) with a spread of
 *      registrations so total / approved / pending / rejected deltas
 *      compute against a real baseline.
 *
 * Idempotent: the open-session step is a no-op once 2025/2026 is open,
 * and the backfill is skipped once the prior session is populated.
 */

async function run(pool) {
  // const sess = await pool.query(
  //   `SELECT id, academic_year, status
  //      FROM jupeb_registration_sessions
  //     WHERE academic_year IN ('2024/2025', '2025/2026')`
  // );
  // const prior = sess.rows.find((r) => r.academic_year === '2024/2025');
  // const current = sess.rows.find((r) => r.academic_year === '2025/2026');
  // if (!prior || !current) {
  //   console.log('[seed:dashboard-demo] demo sessions absent — skipping');
  //   return;
  // }

  // // 1. Make 2025/2026 the single open session.
  // if (current.status !== 'open') {
  //   await pool.query(
  //     `UPDATE jupeb_registration_sessions SET status = 'closed', updated_at = NOW()
  //       WHERE status = 'open' AND id <> $1`,
  //     [current.id]
  //   );
  //   await pool.query(
  //     `UPDATE jupeb_registration_sessions SET status = 'open', updated_at = NOW()
  //       WHERE id = $1`,
  //     [current.id]
  //   );
  //   console.log('[seed:dashboard-demo] 2025/2026 set as the open session');
  // }

  // // 2. Backfill the prior session so stat-card deltas have a baseline.
  // const existing = await pool.query(
  //   `SELECT COUNT(*)::int AS n FROM jupeb_registrations WHERE session_id = $1`,
  //   [prior.id]
  // );
  // if (existing.rows[0].n >= 5) {
  //   console.log(
  //     `[seed:dashboard-demo] 2024/2025 already has ${existing.rows[0].n} registrations — backfill skipped`
  //   );
  // } else {
  //   const uni = await pool.query(
  //     `SELECT id FROM jupeb_universities WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`
  //   );
  //   if (uni.rows[0]) {
  //     // A believable prior-year spread (22 total) so every status card
  //     // has something to compare the current session against.
  //     const spread = [
  //       ...Array(15).fill('approved'),
  //       ...Array(5).fill('pending_institution_review'),
  //       ...Array(2).fill('rejected'),
  //     ];
  //     for (const status of spread) {
  //       // eslint-disable-next-line no-await-in-loop
  //       await pool.query(
  //         `INSERT INTO jupeb_registrations (session_id, university_id, status)
  //          VALUES ($1, $2, $3)`,
  //         [prior.id, uni.rows[0].id, status]
  //       );
  //     }
  //     console.log(`[seed:dashboard-demo] backfilled ${spread.length} registrations into 2024/2025`);
  //   } else {
  //     console.log('[seed:dashboard-demo] no university available — backfill skipped');
  //   }
  // }

  // // 3. Backfill the honorific title on demo profiles. profiles.title is a
  // //    newer column the base demo seed predates; derive a default from
  // //    gender. Idempotent — only fills profiles that have no title yet.
  // const titled = await pool.query(
  //   `UPDATE profiles
  //       SET title = CASE WHEN LOWER(gender) = 'female' THEN 'Ms' ELSE 'Mr' END,
  //           updated_at = NOW()
  //     WHERE title IS NULL AND gender IS NOT NULL`
  // );
  // if (titled.rowCount) {
  //   console.log(`[seed:dashboard-demo] set a default title on ${titled.rowCount} profile(s)`);
  // }

  // // 4. Backfill subject items for the demo combinations. The base demo
  // //    seed creates the JUPEB SC-xxx combinations but not their
  // //    relational jupeb_subject_combination_items, so the enrollment /
  // //    distribution charts can't list the constituent subjects. Derive
  // //    them from each combination's comma-separated title. Idempotent —
  // //    only touches combinations that have no items yet.
  // const combos = await pool.query(
  //   `SELECT c.id, c.title
  //      FROM jupeb_subject_combinations c
  //     WHERE c.deleted_at IS NULL
  //       AND c.code LIKE 'JUPEB SC-%'
  //       AND NOT EXISTS (
  //         SELECT 1 FROM jupeb_subject_combination_items i WHERE i.combination_id = c.id
  //       )`
  // );
  // for (const combo of combos.rows) {
  //   const names = String(combo.title || '')
  //     .split(',')
  //     .map((s) => s.trim())
  //     .filter(Boolean);
  //   let position = 0;
  //   for (const name of names) {
  //     // Resolve the subject by name; create it (auto-coded) when absent.
  //     // eslint-disable-next-line no-await-in-loop
  //     let sub = await pool.query(
  //       `SELECT id FROM jupeb_subjects WHERE deleted_at IS NULL AND LOWER(name) = LOWER($1) LIMIT 1`,
  //       [name]
  //     );
  //     let subjectId = sub.rows[0] && sub.rows[0].id;
  //     if (!subjectId) {
  //       const code = name.toUpperCase().slice(0, 20);
  //       // eslint-disable-next-line no-await-in-loop
  //       const ins = await pool.query(
  //         `INSERT INTO jupeb_subjects (code, name) VALUES ($1, $2)
  //          ON CONFLICT DO NOTHING RETURNING id`,
  //         [code, name]
  //       );
  //       subjectId = ins.rows[0] && ins.rows[0].id;
  //       if (!subjectId) {
  //         // eslint-disable-next-line no-await-in-loop
  //         const re = await pool.query(
  //           `SELECT id FROM jupeb_subjects WHERE deleted_at IS NULL AND LOWER(code) = LOWER($1) LIMIT 1`,
  //           [code]
  //         );
  //         subjectId = re.rows[0] && re.rows[0].id;
  //       }
  //     }
  //     if (subjectId) {
  //       // eslint-disable-next-line no-await-in-loop
  //       await pool.query(
  //         `INSERT INTO jupeb_subject_combination_items (combination_id, subject_id, position)
  //          VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
  //         [combo.id, subjectId, position]
  //       );
  //       position += 1;
  //     }
  //   }
  // }
  // if (combos.rows.length) {
  //   console.log(`[seed:dashboard-demo] backfilled subject items for ${combos.rows.length} combination(s)`);
  // }
}

module.exports = { run };
