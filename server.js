const fs = require('fs');
const path = require('path');

const distMain = path.join(__dirname, 'dist', 'main.js');

if (fs.existsSync(distMain)) {
  require(distMain);
} else {
  try {
    require('ts-node/register');
    require('./src/main.ts');
  } catch (err) {
    require('./src/app.js');
  }
}
