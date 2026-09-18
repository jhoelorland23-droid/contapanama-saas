const { createHash } = require('node:crypto');
const parser = require('../../frontend/node_modules/@babel/parser');
const sensitive = /password|passwd|secret|token|api.?key|signing|credential|authorization|oauth|webhook|session.?key/i;
const placeholder = value => /^(?:<[^>]+>|\$\{[^}]+\}|REEMPLAZAR.*|cree_una.*|YOUR_.*|TU_.*|USUARIO|PASSWORD)$/.test(value);

function analyze(source, filename = 'input.js') {
  const findings = [], seen = new Set();
  const add = (rule, severity, line, value = '') => {
    const key = [rule, line, createHash('sha256').update(value).digest('hex')].join(':');
    if (!seen.has(key)) findings.push({ rule, severity, line, value_fingerprint: key.split(':').at(-1) });
    seen.add(key);
  };
  const pattern = (rule, regex) => {
    for (const m of source.matchAll(regex)) add(rule, 'ERROR', source.slice(0, m.index).split('\n').length, m[0]);
  };
  pattern('signed_jwt', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g);
  pattern('private_key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g);
  pattern('literal_bearer', /\bBearer [A-Za-z0-9_.~+\/-]{16,}/g);
  for (const m of source.matchAll(/\b(?:Cookie|Set-Cookie)[\s'"]*:[\s'"]*[^=;\s]+=(?!\$\{|<)([^;\s'"]{12,})/gi)) {
    add('cookie_literal', 'REVIEW', source.slice(0, m.index).split('\n').length, m[1]);
  }
  pattern('provider_key', /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}|AIza[A-Za-z0-9_-]{30,}|GOCSPX-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{20,}|vcp_[A-Za-z0-9]{24,})/g);
  for (const m of source.matchAll(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^:\s/'"]+:([^@\s'"]+)@/g)) {
    if (!placeholder(m[1]) && !m[1].includes('${')) add('connection_credential', 'REVIEW', source.slice(0, m.index).split('\n').length, m[1]);
  }
  if (/\.html$/.test(filename)) {
    for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      if (!match[1].trim()) continue;
      const offset = source.slice(0, match.index + match[0].indexOf('>') + 1).split('\n').length - 1;
      for (const finding of analyze(match[1], 'inline.jsx')) findings.push({ ...finding, line: finding.line + offset });
    }
  }
  if (!/\.(?:[cm]?js|jsx)(?:\.bak)?$/.test(filename)) {
    for (const m of source.matchAll(/\b([A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD)[A-Z0-9_]*)\s*[:=]\s*([^\s#]+)/g)) {
      const value = m[2].replace(/^['"]|['"]$/g, '');
      if (!placeholder(value) && value.length > 3) add('configuration_literal', 'REVIEW', source.slice(0, m.index).split('\n').length, value);
    }
    return findings;
  }
  let ast;
  try { ast = parser.parse(source, { sourceType: 'unambiguous', plugins: ['jsx'], errorRecovery: false }); }
  catch { add('parse_failure', 'REVIEW', 1); return findings; }
  const nodes = [], definitions = new Map();
  function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type) nodes.push(n);
    for (const [key, v] of Object.entries(n)) {
      if (['loc','start','end','extra','comments','tokens'].includes(key)) continue;
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v);
    }
  }
  walk(ast);
  for (const n of nodes) if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') {
    const defs = definitions.get(n.id.name) || []; defs.push(n.init); definitions.set(n.id.name, defs);
  }
  const text = n => n ? source.slice(n.start, n.end) : '';
  let resolutionSteps = 0;
  const bounded = visited => {
    if (++resolutionSteps <= 20000 && visited.size <= 24) return true;
    add('analysis_limit', 'REVIEW', 1);
    return false;
  };
  function values(n, visited = new Set()) {
    if (!n) return [];
    if (!bounded(visited)) return [];
    if (n.type === 'StringLiteral') return [n.value];
    if (n.type === 'TemplateLiteral' && !n.expressions.length) return [n.quasis.map(q => q.value.cooked).join('')];
    if (n.type === 'Identifier' && !visited.has(n.name)) {
      return (definitions.get(n.name) || []).flatMap(d => values(d, new Set([...visited, n.name]))).slice(0,32);
    }
    if (n.type === 'LogicalExpression') return values(n.right, visited);
    if (n.type === 'BinaryExpression' && n.operator === '+') return values(n.left, visited).flatMap(a => values(n.right, visited).map(b => a + b)).slice(0,32);
    if (n.type === 'CallExpression' && /Buffer\.from$/.test(text(n.callee))) return values(n.arguments[0], visited);
    return [];
  }
  function authSource(n, visited = new Set()) {
    if (!n) return false;
    if (!bounded(visited)) return false;
    const s = text(n);
    if (sensitive.test(s) || /(?:req|request)\.(?:get|header|headers|cookies)\b/.test(s)) return true;
    if (n.type === 'Identifier' && !visited.has(n.name)) return (definitions.get(n.name) || []).some(d => authSource(d, new Set([...visited,n.name])));
    return false;
  }
  const checkValues = (rule, severity, n, origin = n) => {
    for (const v of values(n)) if (v && (severity === 'ERROR' || !placeholder(v))) add(rule, severity, origin.loc.start.line, v);
  };
  for (const n of nodes) {
    if (n.type === 'LogicalExpression' && ['||','??'].includes(n.operator) && /process\.env(?:\?\.|\.|\[)/.test(text(n.left).replace(/\s+/g,''))) {
      checkValues('environment_fallback', sensitive.test(text(n.left)) ? 'ERROR' : 'REVIEW', n.right, n);
    }
    if (n.type === 'VariableDeclarator' && sensitive.test(text(n.id))) checkValues('credential_constant', 'REVIEW', n.init, n);
    if (n.type === 'ObjectProperty' && sensitive.test(text(n.key))) checkValues('credential_property', 'REVIEW', n.value, n);
    if (n.type === 'BinaryExpression' && ['===','!==','==','!='].includes(n.operator)) {
      if ([n.left,n.right].some(v => v.type === 'UnaryExpression' && v.operator === 'typeof')) continue;
      if (authSource(n.left)) checkValues('auth_comparison', 'ERROR', n.right, n);
      if (authSource(n.right)) checkValues('auth_comparison', 'ERROR', n.left, n);
      if (n.left.type === 'Identifier' && !authSource(n.left)) checkValues('unclassified_comparison', 'REVIEW', n.right, n);
      if (n.right.type === 'Identifier' && !authSource(n.right)) checkValues('unclassified_comparison', 'REVIEW', n.left, n);
      if (/(?:req|request)\.(?:body|query|params)\b/.test(text(n.left))) checkValues('request_comparison', 'REVIEW', n.right, n);
      if (/(?:req|request)\.(?:body|query|params)\b/.test(text(n.right))) checkValues('request_comparison', 'REVIEW', n.left, n);
    }
    if (n.type === 'CallExpression') {
      const callee = text(n.callee);
      if (/(?:jwt|jsonwebtoken)\.(?:sign|verify)$|createHmac$/.test(callee)) checkValues('signing_key', 'ERROR', n.arguments[1], n);
      if (/bcrypt(?:js)?\.hash(?:Sync)?$/.test(callee)) checkValues('password_hash_input', 'ERROR', n.arguments[0], n);
      if (/timingSafeEqual$/.test(callee)) n.arguments.forEach(arg => checkValues('auth_comparison', 'ERROR', arg, n));
      if (/(?:session|cookieSession)$/.test(callee)) {
        for (const property of n.arguments[0]?.properties || []) if (/secret|keys/i.test(text(property.key))) checkValues('session_secret', 'ERROR', property.value, n);
      }
    }
  }
  return findings;
}
module.exports = { analyze };
