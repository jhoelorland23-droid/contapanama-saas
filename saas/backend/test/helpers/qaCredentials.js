const { randomBytes } = require('node:crypto');
const randomPassword = () => 'Aa1!' + randomBytes(32).toString('hex');
// Test-only setup: children inherit the same ephemeral credential, never the frontend bundle.
const password = process.env.CONTAPANAMA_QA_PASSWORD || randomPassword();
process.env.CONTAPANAMA_QA_PASSWORD = password;
process.env.ALLOW_DEMO_SEED = 'true';
module.exports = { password, randomPassword };
