#!/usr/bin/env node

/**
 * CLI Script to clear database records.
 *
 * Usage:
 *   node scripts/clear-db.js --all                      # Clear all non-critical tables and non-admin users
 *   node scripts/clear-db.js --session-id=<uuid>        # Clear registrations and data for a specific session
 *   node scripts/clear-db.js --all --dry-run            # Preview records to be deleted without deleting
 *   node scripts/clear-db.js --list-tables              # View configured tables
 */

require('dotenv').config();
const readline = require('readline');
const DbCleanerService = require('../src/modules/admin/services/db-cleaner.service');
const pool = require('../src/db/pool');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    all: false,
    sessionId: null,
    dryRun: false,
    listTables: false,
    force: false,
  };

  for (const arg of args) {
    if (arg === '--all') options.all = true;
    else if (arg.startsWith('--session-id=')) options.sessionId = arg.split('=')[1];
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--list-tables') options.listTables = true;
    else if (arg === '--force' || arg === '-y') options.force = true;
  }

  return options;
}

function promptConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes' || answer.trim().toLowerCase() === 'y');
    });
  });
}

async function main() {
  const options = parseArgs();

  if (options.listTables) {
    console.log('\n--- Configured Tables in DbCleanerService ---');
    console.log(JSON.stringify(DbCleanerService.getConfiguredTables(), null, 2));
    process.exit(0);
  }

  if (!options.all && !options.sessionId) {
    console.log(`
Usage:
  node scripts/clear-db.js --all                      Clear all non-critical tables and non-admin users
  node scripts/clear-db.js --session-id=<UUID>        Clear data for a specific session
  node scripts/clear-db.js --all --dry-run            Preview count of records without deleting
  node scripts/clear-db.js --list-tables              List all clearable tables
    `);
    process.exit(1);
  }

  try {
    if (options.sessionId) {
      console.log(`\nTarget: Session ID -> ${options.sessionId}`);
      if (!options.dryRun && !options.force) {
        const confirmed = await promptConfirmation(
          `Are you sure you want to clear all registrations and student data for session ${options.sessionId}? (y/N): `
        );
        if (!confirmed) {
          console.log('Aborted.');
          process.exit(0);
        }
      }

      console.log('Running session cleanup...');
      const stats = await DbCleanerService.clearBySession(options.sessionId, { dryRun: options.dryRun });
      console.log('\n--- Cleanup Results ---');
      console.table(stats);
    } else if (options.all) {
      console.log('\nTarget: ALL non-critical tables (Admin accounts, Sessions, Roles & Permissions PRESERVED)');
      if (!options.dryRun && !options.force) {
        const confirmed = await promptConfirmation(
          'WARNING: This will delete all candidates, registrations, biometrics, documents, and non-admin users across ALL sessions.\nType "yes" to proceed: '
        );
        if (!confirmed) {
          console.log('Aborted.');
          process.exit(0);
        }
      }

      console.log('Running full cleanup...');
      const stats = await DbCleanerService.clearAll({ dryRun: options.dryRun });
      console.log('\n--- Cleanup Results ---');
      console.table(stats);
    }
  } catch (err) {
    console.error('\n❌ Cleanup error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
