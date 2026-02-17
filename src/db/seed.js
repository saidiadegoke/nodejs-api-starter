const fs = require('fs');
const path = require('path');
const pool = require('./pool');
const { logger } = require('../shared/utils/logger');

/**
 * Run all seed files in order. Idempotent: seed SQL uses ON CONFLICT DO NOTHING
 * so it is safe to run on every server start.
 * @returns {Promise<void>}
 */
async function runSeeds() {
  const seedsPath = path.join(__dirname, 'seeds');
  const files = fs.readdirSync(seedsPath).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(seedsPath, file), 'utf8');
    logger.debug(`[Seed] Running ${file}`);
    await pool.query(sql);
  }

  logger.info(`[Seed] Completed ${files.length} seed file(s)`);
}

/**
 * CLI entry: run seeds then exit
 */
async function main() {
  try {
    await runSeeds();
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
