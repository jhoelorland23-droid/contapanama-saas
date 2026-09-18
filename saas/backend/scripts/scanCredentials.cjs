const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const mode = process.argv[2] || 'head';
if (!['head', 'history', 'bundle'].includes(mode)) throw new Error('Expected head, history or bundle');
const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const rules = {
  demo_password: /(?:Admin\d{3}!|ReviewOnly\d{3}!|OnlyTest\d{3}!|QA-Auxiliar-\d+!|QA-bank-subledger-\d+!)/g,
  signed_jwt: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  provider: /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}|AIza[A-Za-z0-9_-]{30,}|GOCSPX-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{20,})/g,
  private_key: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g,
  jwt_literal: /JWT_SECRET\s*[:=]\s*['"][^'"]+['"]/g,
  jwt_fallback: /process\.env\.JWT_SECRET\s*(?:\|\||\?\?)\s*['"][^'"]+['"]/g,
  database_default: /postgresql:\/\/postgres:postgres@|POSTGRES_PASSWORD[=:]\s*postgres\b|PGADMIN_DEFAULT_PASSWORD:\s*admin\d+/g,
};
const findings = [], review = [], seen = new Set();
function scan(data, file, object, commits = []) {
  const text = data.toString('utf8');
  for (const [rule, regex] of Object.entries(rules)) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) findings.push({ rule, path: file, object, commits,
      line: text.slice(0, match.index).split('\n').length });
  }
  text.split(/\r?\n/).forEach((line, index) => {
    if (/(?:password|passwd|secret|bearer|cookie|api[_-]?key|oauth|postgres(?:ql)?:\/\/|token)/i.test(line)) {
      // Values are deliberately excluded from the report, including false positives.
      review.push({ path: file, object, line: index + 1 });
    }
  });
}
let commits = [];
if (mode === 'history') {
  commits = git(['rev-list', '--all']).toString().trim().split('\n');
  const objects = new Map();
  for (const commit of commits) {
    for (const row of git(['ls-tree', '-rz', commit]).toString().split('\0').filter(Boolean)) {
      const [meta, file] = row.split('\t'); const [, type, object] = meta.split(' ');
      if (type !== 'blob') continue;
      if (!objects.has(object)) objects.set(object, { path: file, commits: [] });
      objects.get(object).commits.push(commit);
    }
    scan(git(['cat-file', 'commit', commit]), '[commit metadata]', commit, [commit]);
  }
  for (const [object, entry] of objects) { scan(git(['cat-file', 'blob', object]), entry.path, object, [...new Set(entry.commits)]); seen.add(object); }
} else if (mode === 'bundle') {
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else { scan(fs.readFileSync(file), path.relative(root, file)); seen.add(file); }
    }
  };
  walk(path.join(root, 'saas/frontend/dist'));
} else {
  for (const file of git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).toString().split('\0').filter(Boolean)) {
    scan(fs.readFileSync(path.join(root, file)), file); seen.add(file);
  }
}
const report = { mode, head: git(['rev-parse', 'HEAD']).toString().trim(), checked: seen.size,
  commits: commits.length, status: findings.length ? 'FAIL' : 'PASS_PATTERN_SCAN', findings,
  broad_context_count: review.length, broad_contexts: review,
  limitation: 'Pattern scan plus manual review required; not proof of absence of all possible secrets.' };
const out = path.join(root, 'saas/outputs/dynamic-credentials'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, `${mode}-scan.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ mode, status: report.status, checked: report.checked, commits: report.commits, findings: findings.length, broad_contexts: review.length }));
process.exitCode = findings.length ? 2 : 0;
