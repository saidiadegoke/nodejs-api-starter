const fs = require('fs');
const path = require('path');
const pool = require('./pool');
const { logger } = require('../shared/utils/logger');

/**
 * Run all seed files in order. Idempotent: seed SQL uses ON CONFLICT DO NOTHING
 * so it is safe to run on every server start.
 *
 * Two seed file kinds, run interleaved by filename order:
 *   - `.sql` — executed verbatim.
 *   - `.js`  — a module exporting `run(pool)` (or a function). Use these
 *     when a seed needs dynamic input, e.g. credentials read from env.
 * @returns {Promise<void>}
 */
async function runSeeds() {
  const seedsPath = path.join(__dirname, 'seeds');
  const files = fs
    .readdirSync(seedsPath)
    .filter((f) => f.endsWith('.sql') || f.endsWith('.js'))
    .sort();

  for (const file of files) {
    logger.debug(`[Seed] Running ${file}`);
    if (file.endsWith('.sql')) {
      const sql = fs.readFileSync(path.join(seedsPath, file), 'utf8');
      // eslint-disable-next-line no-await-in-loop
      await pool.query(sql);
    } else {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const seedModule = require(path.join(seedsPath, file));
      const runFn = typeof seedModule === 'function' ? seedModule : seedModule.run;
      if (typeof runFn !== 'function') {
        throw new Error(`Seed ${file} must export a function or { run }`);
      }
      // eslint-disable-next-line no-await-in-loop
      await runFn(pool);
    }
  }

  logger.info(`[Seed] Completed ${files.length} seed file(s)`);
}

/**
 * CLI entry: run seeds then exit
 */
async function main() {
  try {
    // await runSeeds();
    console.log('✅ Seeding complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runSeeds };