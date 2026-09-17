const assert = require('assert');
const { validateProductionEnv } = require('../config/validateEnv');

const validEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://conta:secret@db.example.com:5432/contapanama?sslmode=require',
  JWT_SECRET: require('node:crypto').randomBytes(32).toString('hex'),
  FRONTEND_URL: 'https://contapanama.example.com',
  CONTAPANAMA_INTEGRATION_TOKEN: process.env.CONTAPANAMA_INTEGRATION_TOKEN /* historical credential redacted */,
};

assert.deepStrictEqual(validateProductionEnv({ NODE_ENV: 'development' }), { ok: true, errors: [] });

const missing = validateProductionEnv({ NODE_ENV: 'production' });
assert.strictEqual(missing.ok, false);
assert.ok(missing.errors.some(error => error.includes('DATABASE_URL')));
assert.ok(missing.errors.some(error => error.includes('JWT_SECRET')));
assert.ok(missing.errors.some(error => error.includes('FRONTEND_URL')));
assert.ok(missing.errors.some(error => error.includes('CONTAPANAMA_INTEGRATION_TOKEN')));

const localUrl = validateProductionEnv({ ...validEnv, FRONTEND_URL: 'http://localhost:5173' });
assert.strictEqual(localUrl.ok, false);
assert.ok(localUrl.errors.some(error => error.includes('FRONTEND_URL')));

const placeholders = validateProductionEnv({
  ...validEnv,
  DATABASE_URL: 'postgresql://USUARIO:PASSWORD@HOST:5432/BASE?sslmode=require',
});
assert.strictEqual(placeholders.ok, false);
assert.ok(placeholders.errors.some(error => error.includes('DATABASE_URL')));

const sameSecret = validateProductionEnv({
  ...validEnv,
  CONTAPANAMA_INTEGRATION_TOKEN: validEnv.JWT_SECRET,
});
assert.strictEqual(sameSecret.ok, false);
assert.ok(sameSecret.errors.some(error => error.includes('deben ser distintos')));

const valid = validateProductionEnv(validEnv);
assert.strictEqual(valid.ok, true);
assert.deepStrictEqual(valid.errors, []);

console.log('Environment validation tests passed');
