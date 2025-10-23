const fs = require('fs');
const path = require('path');
const pool = require('./pool');

/**
 * Migration runner with version tracking
 * Ensures migrations run only once
 */
(async () => {
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
      'SELECT migration_name FROM schema_migrations ORDER BY migration_name'
    );
    const executedMigrations = new Set(
      executedResult.rows.map(row => row.migration_name)
    );

    console.log(`📊 Found ${executedMigrations.size} previously executed migration(s)\n`);

    // Get all migration files
    const migrationsPath = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsPath)
      .filter(file => file.endsWith('.sql'))
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
          [file]
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
    
    console.log(`\n📈 Total migrations in database: ${executedMigrations.size + newMigrationsCount}`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nDetails:', error);
    process.exit(1);
  } finally {
    client.release();
  }
})();

