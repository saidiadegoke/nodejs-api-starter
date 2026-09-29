import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables (handling .env.test if in test environment)
if (process.env.NODE_ENV === 'test') {
  const testEnvPath = path.resolve(__dirname, '../../.env.test');
  if (fs.existsSync(testEnvPath)) {
    dotenv.config({ path: testEnvPath, override: true });
  } else {
    dotenv.config();
  }
} else {
  dotenv.config();
}

export async function runMigrations(): Promise<{ executed: number; total: number }> {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'postgres',
  });

  const client = await pool.connect();

  try {
    console.log('🔄 Starting migrations...\n');

    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get list of already executed migrations
    const executedResult = await client.query(
      'SELECT migration_name FROM schema_migrations ORDER BY migration_name',
    );
    const executedMigrations = new Set(
      executedResult.rows.map((row: any) => row.migration_name),
    );

    console.log(`📊 Found ${executedMigrations.size} previously executed migration(s)\n`);

    // Get all migration files from src/db/migrations (existing 37 migrations untouched)
    const migrationsPath = path.join(__dirname, '../db/migrations');
    const files = fs
      .readdirSync(migrationsPath)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    let newMigrationsCount = 0;

    // Run pending migrations
    for (const file of files) {
      if (executedMigrations.has(file)) {
        console.log(`⏭️  Skipping (already executed): ${file}`);
        continue;
      }

      console.log(`🔨 Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsPath, file), 'utf8');

      // Run migration in a transaction
      await client.query('BEGIN');
      try {
        await client.query(sql);

        // Record successful migration
        await client.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
          [file],
        );

        await client.query('COMMIT');
        console.log(`✅ Completed: ${file}\n`);
        newMigrationsCount++;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    if (newMigrationsCount === 0) {
      console.log('✨ No new migrations to run. Database is up to date!');
    } else {
      console.log(`\n🎉 Successfully executed ${newMigrationsCount} new migration(s)`);
    }

    const total = executedMigrations.size + newMigrationsCount;
    console.log(`\n📈 Total migrations in database: ${total}`);

    return { executed: newMigrationsCount, total };
  } finally {
    client.release();
    await pool.end();
  }
}

// Direct execution from CLI
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('\n❌ Migration failed:', error.message);
      console.error('\nDetails:', error);
      process.exit(1);
    });
}
