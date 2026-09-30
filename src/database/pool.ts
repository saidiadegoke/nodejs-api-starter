import { AppDataSource } from './data-source';

async function ensureConnected() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
}

export async function query(text: string, params?: any[]) {
  await ensureConnected();
  const rows = await AppDataSource.query(text, params);
  return {
    rows: Array.isArray(rows) ? rows : [],
    rowCount: Array.isArray(rows) ? rows.length : 0,
  };
}

export async function connect() {
  await ensureConnected();
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  return {
    query: async (text: string, params?: any[]) => {
      const rows = await queryRunner.query(text, params);
      return {
        rows: Array.isArray(rows) ? rows : [],
        rowCount: Array.isArray(rows) ? rows.length : 0,
      };
    },
    release: async () => {
      await queryRunner.release();
    },
  };
}

const pool = { query, connect, on: () => {}, end: () => {} };
export default pool;
module.exports = pool;
