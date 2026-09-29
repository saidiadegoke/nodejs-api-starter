import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { AppDataSource } from './data-source';

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
  try {
    console.log('🔄 Starting TypeORM database migrations...\n');

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const migrations = await AppDataSource.runMigrations({ transaction: 'all' });
    console.log(`✅ Completed ${migrations.length} migration(s).\n`);

    for (const m of migrations) {
      console.log(`  - ${m.name}`);
    }

    return { executed: migrations.length, total: migrations.length };
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

// Direct execution from CLI
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('\n❌ Migration failed:', error.message);
      process.exit(1);
    });
}
