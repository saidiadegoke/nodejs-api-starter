#!/usr/bin/env node

/**
 * Migration & Data-fix Script:
 * Updates jupeb_universities schema and data so that:
 *  - `code` becomes the 3-digit center code (e.g. '001', '029', '679')
 *  - `jupeb_prefix` becomes the university prefix/acronym (e.g. 'UNILAG', 'LASU', 'FUTA')
 *  - `short_name` is populated with the university prefix/acronym
 *
 * Usage:
 *   node scripts/update-university-codes.js --dry-run
 *   node scripts/update-university-codes.js --force
 *   node scripts/update-university-codes.js
 */

require('dotenv').config();
const readline = require('readline');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'postgres',
});

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force') || args.includes('-y'),
    includeDeleted: !args.includes('--active-only'),
  };
}

function promptConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'yes' || trimmed === 'y');
    });
  });
}

function cleanCode(code) {
  if (!code) return '';
  let str = String(code).trim().replace(/^['’`"]+/, '').trim();
  if (/^\d{1,2}$/.test(str)) {
    str = str.padStart(3, '0');
  }
  return str.slice(0, 20);
}

function cleanPrefix(prefix) {
  if (!prefix) return '';
  return String(prefix).trim().replace(/^['’`"]+/, '').trim().toUpperCase().slice(0, 20);
}

async function run() {
  const { dryRun, force, includeDeleted } = parseArgs();
  console.log('='.repeat(70));
  console.log('  JUPEB University Code & Prefix Update Script');
  console.log(`  Mode: ${dryRun ? 'DRY RUN (no DB modifications)' : 'EXECUTE'}`);
  console.log(`  Scope: ${includeDeleted ? 'All universities (including soft-deleted)' : 'Active universities only'}`);
  console.log('='.repeat(70));

  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, code, name, short_name, jupeb_prefix, deleted_at
      FROM jupeb_universities
      ORDER BY deleted_at ASC NULLS FIRST, created_at ASC
    `);

    const activeRows = rows.filter((r) => !r.deleted_at);
    console.log(`\nFound ${rows.length} total university records (${activeRows.length} active).`);

    const targetRows = includeDeleted ? rows : activeRows;
    const plan = [];

    for (const r of targetRows) {
      let targetCode = cleanCode(r.jupeb_prefix);
      let targetPrefix = cleanPrefix(r.short_name || r.code);
      let targetShortName = r.short_name ? r.short_name.trim().slice(0, 80) : targetPrefix;

      // Special handling for UNILAG per specification
      if (
        (r.code && r.code.toUpperCase() === 'UNILAG') ||
        (r.name && r.name.toLowerCase().includes('university of lagos'))
      ) {
        targetCode = '001';
        targetPrefix = 'UNILAG';
        targetShortName = 'UNILAG';
      }

      // If code was already 3 digits and prefix was acronym, check if needs change
      const isAlreadySwapped =
        /^\d{3}$/.test(r.code) &&
        r.jupeb_prefix &&
        /^[A-Za-z0-9_-]{2,20}$/.test(r.jupeb_prefix) &&
        !/^\d{3}$/.test(r.jupeb_prefix);

      if (isAlreadySwapped && (r.code !== 'UNILAG' && !r.name.toLowerCase().includes('university of lagos'))) {
        continue;
      }

      const hasChange =
        r.code !== targetCode ||
        r.jupeb_prefix !== targetPrefix ||
        r.short_name !== targetShortName;

      if (hasChange) {
        plan.push({
          id: r.id,
          name: r.name,
          deleted: Boolean(r.deleted_at),
          oldCode: r.code,
          newCode: targetCode,
          oldPrefix: r.jupeb_prefix,
          newPrefix: targetPrefix,
          oldShort: r.short_name,
          newShort: targetShortName,
        });
      }
    }

    if (plan.length === 0) {
      console.log('\nAll universities are already properly configured. No changes required.');
      return;
    }

    console.log(`\nUniversities to update (${plan.length}):`);
    console.table(
      plan.map((p) => ({
        Name: p.name.length > 30 ? p.name.slice(0, 27) + '...' : p.name,
        'Active?': p.deleted ? 'No' : 'Yes',
        'Old Code': p.oldCode,
        '-> New Code': p.newCode,
        'Old Prefix': p.oldPrefix,
        '-> New Prefix': p.newPrefix,
        'Old Short': p.oldShort,
        '-> New Short': p.newShort,
      })),
    );

    if (dryRun) {
      console.log('\n[Dry Run] Completed simulation. No changes were committed to the database.');
      return;
    }

    if (!force) {
      const confirmed = await promptConfirmation('\nDo you want to apply these database changes? (yes/no): ');
      if (!confirmed) {
        console.log('Aborted by user.');
        return;
      }
    }

    console.log('\nApplying schema alterations and row updates in a transaction...');
    await client.query('BEGIN');

    // 1. Drop the 3-digit numeric check constraint on jupeb_prefix if present
    await client.query(`
      ALTER TABLE jupeb_universities
      DROP CONSTRAINT IF EXISTS jupeb_universities_prefix_numeric;
    `);

    // 2. Expand jupeb_prefix to VARCHAR(20)
    await client.query(`
      ALTER TABLE jupeb_universities
      ALTER COLUMN jupeb_prefix TYPE character varying(20);
    `);

    // 3. Set temporary codes to avoid unique constraint collisions during the swap
    for (const p of plan) {
      await client.query(
        `UPDATE jupeb_universities SET code = $1 WHERE id = $2`,
        [`TMP_${p.id.slice(0, 8)}`, p.id],
      );
    }

    // 4. Update rows with their final code, jupeb_prefix, and short_name
    for (const p of plan) {
      await client.query(
        `UPDATE jupeb_universities
         SET code = $1, jupeb_prefix = $2, short_name = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [p.newCode, p.newPrefix, p.newShort, p.id],
      );
    }

    await client.query('COMMIT');
    console.log('✔ Successfully altered schema and updated university records in PostgreSQL!');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('✖ Error during update:', err.message || err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
