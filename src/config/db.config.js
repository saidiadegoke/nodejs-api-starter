const path = require('path');
const fs = require('fs');

if (process.env.NODE_ENV === 'test') {
  const testEnvPath = path.resolve(__dirname, '../../.env.test');
  if (fs.existsSync(testEnvPath)) {
    require('dotenv').config({ path: testEnvPath, override: true });
  } else {
    require('dotenv').config();
  }
} else {
  require('dotenv').config();
}

module.exports = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};


