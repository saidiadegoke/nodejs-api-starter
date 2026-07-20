/**
 * clear-db.js — reset the connected Postgres DB to a clean state, keeping only the ADMIN users.
 *
 * Keeps:
 *   - users / profiles / user_roles / user_permissions  → ONLY for users with an admin role
 *     (ADMIN_ROLES below). All other users and their profiles/mappings are deleted.
 *   - roles, permissions, role_permissions               → RBAC definitions (untouched)
 *   - schema_migrations                                  → migration tracking (untouched)
 *   - reference/config tables (geo, jupeb config, payment config) → untouched
 * Clears:
 *   - every other (transactional) table
 *
 * SAFE BY DEFAULT: dry-run unless confirmed with the exact DB name.
 *   node scripts/clear-db.js                            # dry run
 *   node scripts/clear-db.js --confirm reg_portal_db    # execute
 */

require('dotenv').config();
const pool = require('../src/db/pool');

// Users kept: those holding any ADMIN_ROLES, OR whose email is in ADMIN_EMAILS. Everyone else deleted.
const ADMIN_ROLES = ['super_admin'];
const ADMIN_EMAILS = ['admin@example.com'];

// Fully preserved (untouched entirely).
const FULL_PRESERVE = new Set([
  'roles', 'permissions', 'role_permissions', 'schema_migrations',
  // geo reference
  'countries', 'states', 'lgas',
  // jupeb reference/config (subjects, universities/institutions and combinations now CLEARED)
  'jupeb_courses', 'jupeb_document_requirements',
  // payment / platform config
  'payment_methods', 'payment_structures', 'payment_items', 'platform_settings'
]);

// Admin-scoped: keep only rows belonging to admin users. Map table -> column referencing users(id).
const ADMIN_SCOPED = { users: 'id', profiles: 'user_id', user_roles: 'user_id', user_permissions: 'user_id' };

const args = process.argv.slice(2);
const ci = args.indexOf('--confirm');
const confirmValue = ci >= 0 ? args[ci + 1] : null;

async function main() {
  const client = await pool.connect();
  try {
    const dbName = process.env.DB_NAME;
    console.log(`Target DB: ${dbName} @ ${process.env.DB_HOST}:${process.env.DB_PORT}\n`);

    // Admin user ids to keep (by admin role OR by explicit email).
    const adminRes = await client.query(
      `SELECT DISTINCT u.id, u.email
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
        WHERE r.name = ANY($1) OR u.email = ANY($2)`,
      [ADMIN_ROLES, ADMIN_EMAILS]
    );
    const adminIds = adminRes.rows.map(r => r.id);
    console.log(`ADMIN users kept (${adminIds.length}) [roles: ${ADMIN_ROLES.join(', ') || 'none'}; emails: ${ADMIN_EMAILS.join(', ') || 'none'}]:`);
    adminRes.rows.forEach(r => console.log(`  ★ ${r.email}`));
    if (adminIds.length === 0) {
      console.error('\n❌ No admin users found — refusing to run (would delete every user). Check ADMIN_ROLES.');
      process.exitCode = 1;
      return;
    }

    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
    const allTables = rows.map(r => r.table_name);
    const toClear = allTables.filter(t => !FULL_PRESERVE.has(t) && !ADMIN_SCOPED[t]);

    const count = async (t, where) => {
      try { const r = await client.query(`SELECT COUNT(*)::int AS c FROM "${t}"${where ? ' WHERE ' + where : ''}`); return r.rows[0].c; }
      catch { return '?'; }
    };
    const idsSql = `('${adminIds.join("','")}')::text[]`; // for readability only; params used in queries

    console.log(`\nFULL PRESERVE (${[...FULL_PRESERVE].filter(t => allTables.includes(t)).length}): roles/permissions, migrations, reference + config (untouched)`);

    console.log('\nADMIN-SCOPED (keep admin rows only):');
    for (const [t, col] of Object.entries(ADMIN_SCOPED)) {
      if (!allTables.includes(t)) continue;
      const total = await count(t);
      const keep = (await client.query(`SELECT COUNT(*)::int c FROM "${t}" WHERE "${col}" = ANY($1)`, [adminIds])).rows[0].c;
      console.log(`  • ${t.padEnd(18)} total ${total}  keep ${keep}  delete ${typeof total === 'number' ? total - keep : '?'}`);
    }

    console.log(`\nCLEAR (${toClear.length}) — transactional tables:`);
    let totalRows = 0;
    for (const t of toClear) { const c = await count(t); if (typeof c === 'number') totalRows += c; console.log(`  ✗ ${t.padEnd(30)} ${c} rows`); }
    console.log(`\nTotal transactional rows to delete: ${totalRows} (plus non-admin users/profiles/mappings)`);

    if (confirmValue == null) {
      console.log(`\nDRY RUN — nothing changed.\nTo execute:  node scripts/clear-db.js --confirm ${dbName}`);
      return;
    }
    if (confirmValue !== dbName) {
      console.error(`\n❌ --confirm "${confirmValue}" does not match DB_NAME "${dbName}". Aborting.`);
      process.exitCode = 1;
      return;
    }

    console.log('\nExecuting...');
    await client.query('BEGIN');
    await client.query(`SET session_replication_role = 'replica'`);

    // 0) Delete institution-scoped roles (owner_jupeb_university_id IS NOT NULL)
    //    and their mappings. These belong to institutions being wiped, and
    //    nulling owner_jupeb_university_id (step 1) would move them into the
    //    global scope and collide with the ux_roles_global_scope_name_lower
    //    partial unique index (migration 026). role_permissions is otherwise
    //    fully preserved, so its rows for these roles must be removed here.
    const instRoles = await client.query(
      `SELECT id FROM roles WHERE owner_jupeb_university_id IS NOT NULL`);
    const instRoleIds = instRoles.rows.map(r => r.id);
    if (instRoleIds.length) {
      await client.query(`DELETE FROM role_permissions WHERE role_id = ANY($1)`, [instRoleIds]);
      await client.query(`DELETE FROM user_roles WHERE role_id = ANY($1)`, [instRoleIds]);
      await client.query(`DELETE FROM roles WHERE id = ANY($1)`, [instRoleIds]);
      console.log(`  deleted institution-scoped roles (+ mappings): ${instRoleIds.length}`);
    }

    // 1) Null preserved-table FK columns that point at soon-to-be-cleared tables (avoid dangling refs).
    const fk = await client.query(`
      SELECT tc.table_name AS referencing, ccu.table_name AS referenced, kcu.column_name AS col
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`);
    const clearedSet = new Set(toClear);
    for (const d of fk.rows.filter(r => !clearedSet.has(r.referencing) && clearedSet.has(r.referenced))) {
      try {
        const r = await client.query(`UPDATE "${d.referencing}" SET "${d.col}" = NULL WHERE "${d.col}" IS NOT NULL`);
        if (r.rowCount) console.log(`  nulled ${d.referencing}.${d.col} -> ${d.referenced}: ${r.rowCount}`);
      } catch (e) { console.warn(`  ⚠️  ${d.referencing}.${d.col}: ${e.message}`); }
    }

    // 2) Clear transactional tables.
    let deleted = 0;
    for (const t of toClear) { const r = await client.query(`DELETE FROM "${t}"`); deleted += r.rowCount || 0; }

    // 3) Delete non-admin rows from admin-scoped tables (mappings first, then profiles, then users).
    for (const t of ['user_roles', 'user_permissions', 'profiles', 'users']) {
      if (!ADMIN_SCOPED[t] || !allTables.includes(t)) continue;
      const r = await client.query(`DELETE FROM "${t}" WHERE "${ADMIN_SCOPED[t]}" <> ALL($1)`, [adminIds]);
      console.log(`  deleted non-admin ${t}: ${r.rowCount}`);
      deleted += r.rowCount || 0;
    }

    // 4) Null any remaining FK columns that point at users but reference a now-deleted (non-admin) user.
    for (const d of fk.rows.filter(r => r.referenced === 'users' && !clearedSet.has(r.referencing) && r.referencing !== 'users')) {
      try {
        const r = await client.query(`UPDATE "${d.referencing}" SET "${d.col}" = NULL WHERE "${d.col}" IS NOT NULL AND "${d.col}" <> ALL($1)`, [adminIds]);
        if (r.rowCount) console.log(`  nulled ${d.referencing}.${d.col} (deleted-user ref): ${r.rowCount}`);
      } catch (e) { console.warn(`  ⚠️  ${d.referencing}.${d.col}: ${e.message}`); }
    }

    await client.query(`SET session_replication_role = 'origin'`);
    await client.query('COMMIT');
    console.log(`\n✅ Done. Kept ${adminIds.length} admin user(s) + RBAC + reference/config; cleared everything else.`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
