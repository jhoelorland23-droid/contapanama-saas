const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const frontend = path.resolve(__dirname, '..');
const secret = 'Aa1!' + randomBytes(32).toString('hex');
const env = { ...process.env, CONTAPANAMA_QA_PASSWORD: secret, JWT_SECRET: randomBytes(32).toString('hex') };
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { cwd: frontend, env, stdio: 'pipe' });
function check(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) check(file);
    else {
      const data = fs.readFileSync(file);
      for (const value of [secret, env.JWT_SECRET]) assert.equal(data.includes(Buffer.from(value)), false, 'Generated credential leaked into frontend');
      assert.equal(data.includes(Buffer.from('CONTAPANAMA_QA_PASSWORD')), false, 'QA configuration exposed to frontend');
    }
  }
}
check(path.join(frontend, 'dist'));
console.log('PASS frontend build and generated credential isolation');
