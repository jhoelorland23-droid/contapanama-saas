const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { analyze } = require('../scripts/credentialAnalysis.cjs');
const q = () => JSON.stringify(randomBytes(32).toString('hex'));
const error = code => analyze(code).some(f => f.severity === 'ERROR');

test('finds arbitrary env fallbacks, nullish defaults and auth constants through aliases', () => {
  for (const op of ['||', '??']) {
    const s = q();
    assert(error('const a = process.env.X ' + op + ' ' + s + '; const b=a; if(req.get("X-Custom")!==b) deny();'));
    assert(analyze('const a = process.env.X ' + op + ' ' + s).some(f => f.rule === 'environment_fallback'));
  }
  assert(error('if (req.cookies.sid === ' + q() + ') allow();'));
  assert(error('const arbitrary = ' + q() + '; const other=arbitrary; if(req.headers.authorization===other) allow();'));
  assert(error('if (req.get("X-Webhook") === ' + q() + ') allow();'));
  assert(error('if(req.get("X") === "<REPLACE_ME>") allow();'));
  assert(analyze('function check(x){const y=' + q() + ';return x===y}').some(f => f.rule === 'unclassified_comparison'));
  assert(analyze('const k=process.env [ "X" ] ?? ' + q()).some(f => f.rule === 'environment_fallback'));
  assert(analyze('const k=process.env?.X ?? ' + q()).some(f => f.rule === 'environment_fallback'));
  assert(analyze('if(req.query.x === ' + q() + ') allow();').some(f => f.rule === 'request_comparison'));
  assert(analyze('<script>if(req.get("X") === ' + q() + ') allow()</script>', 'page.html').some(f => f.rule === 'auth_comparison'));
});

test('finds signing, session, password, OAuth, API and bearer secrets without exposing values', () => {
  const value = randomBytes(32).toString('hex'), literal = JSON.stringify(value);
  for (const code of [
    'jwt.sign(payload,' + literal + ')', 'jwt.verify(token,' + literal + ')',
    'crypto.createHmac("sha256",' + literal + ')', 'bcrypt.hash(' + literal + ',10)',
    'session({secret:' + literal + '})', 'if(req.get("Authorization")==="Bearer " + ' + literal + ') allow()',
  ]) {
    const findings = analyze(code); assert(findings.some(f => f.severity === 'ERROR'), code.split('(')[0]);
    assert(!JSON.stringify(findings).includes(value));
  }
  for (const name of ['oauth_client_secret','webhook_key','apiKey','session_secret']) {
    assert(analyze('const ' + name + '=' + literal).some(f => f.severity === 'REVIEW'));
  }
  assert(analyze('DATABASE_URL=postgresql://qa:' + value + '@localhost/db', '.env').some(f => f.rule === 'connection_credential'));
  assert(analyze('Cookie: sid=' + value, 'example.txt').some(f => f.rule === 'cookie_literal'));
});

test('runtime integration and JWT configuration have no literal fallback', () => {
  const fs = require('node:fs'), path = require('node:path');
  for (const file of ['server.js','server.local.js','routes/integracion.js']) {
    const findings = analyze(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'),file);
    assert.equal(findings.filter(f => f.rule === 'environment_fallback' && f.severity === 'ERROR').length, 0, file);
  }
});

test('provider/private key fixtures are generated only in memory', () => {
  for (const value of ['gh' + 'p_' + randomBytes(24).toString('hex'), 'sk-' + randomBytes(24).toString('hex'),
    '-----BEGIN ' + 'PRIVATE KEY-----']) assert(analyze(value, 'fixture.txt').some(f => f.severity === 'ERROR'));
});

test('dynamic secrets and placeholders do not become false secret errors; parse failures cannot pass', () => {
  assert.deepEqual(analyze('const jwtKey = randomBytes(32).toString("hex"); jwt.sign(payload,jwtKey);'), []);
  assert.deepEqual(analyze('const value=process.env.AUTH_KEY; if(!value) deny(); if(req.get("X")!==value) deny();'), []);
  assert.deepEqual(analyze('if(typeof password !== "string") deny();'), []);
  assert(!error('const PORT=process.env.PORT || "4000";'));
  assert.deepEqual(analyze('OAUTH_SECRET=<REPLACE_ME>', '.env.example'), []);
  assert(analyze('const = broken').some(f => f.rule === 'parse_failure' && f.severity === 'REVIEW'));
});
