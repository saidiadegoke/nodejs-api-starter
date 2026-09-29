/**
<deprecated>
 * Database Pool Bridge.
 * Delegates query execution directly to TypeORM AppDataSource / databaseConfig.
 * Preserves pg Result format { rows, rowCount } for legacy JS compatibility.
 */
const { AppDataSource } = require('../database/data-source');

const pool = {
  async query(text, params) {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const result = await AppDataSource.query(text, params);
    return {
      rows: Array.isArray(result) ? result : [],
      rowCount: Array.isArray(result) ? result.length : result?.affected || 0,
    };
  },
  on: () => {},
};

module.exports = pool;
