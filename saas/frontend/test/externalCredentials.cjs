const { requireDemoCredentials } = require('../../backend/config/demoCredentials');
const { randomBytes } = require('node:crypto');
module.exports = { ...requireDemoCredentials(), randomPassword: () => 'Aa1!' + randomBytes(32).toString('hex') };
