const { Pool } = require('pg');
const dbConfig = require('../config/db.config');

const pool = new Pool(dbConfig);

pool.on('connect', () => console.log('✅ Connected to PostgreSQL'));
pool.on('error', (err) => console.error('❌ PostgreSQL error', err));

module.exports = pool;


