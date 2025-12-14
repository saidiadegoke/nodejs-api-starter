const fs = require('fs');
const path = require('path');
const pool = require('./pool');

(async () => {
  try {
    const seedsPath = path.join(__dirname, 'seeds');
    const files = fs.readdirSync(seedsPath);
    
    for (const file of files.sort()) {
      if (!file.endsWith('.sql')) continue;
      
      const sql = fs.readFileSync(path.join(seedsPath, file), 'utf8');
      console.log(`Seeding: ${file}`);
      await pool.query(sql);
    }
    
    console.log('✅ Seeding complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
})();


