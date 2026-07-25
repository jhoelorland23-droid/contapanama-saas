// Build a LIVE version of the proto/ prototype that talks to the real backend
// at http://localhost:4000/api. Same pipeline as _build.js but overrides the
// EDITMODE tweaks block in state.jsx to force apiMode=live + absolute apiBase.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const REACT = fs.readFileSync(path.join(__dirname, 'node_modules/react/umd/react.production.min.js'), 'utf8');
const REACT_DOM = fs.readFileSync(path.join(__dirname, 'node_modules/react-dom/umd/react-dom.production.min.js'), 'utf8');

const html = fs.readFileSync(path.join(__dirname, '_srchtml', 'proto.html'), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/i)[1];
const links = (html.match(/<link[^>]*>/gi) || []).filter(l => /fonts\.(googleapis|gstatic)/.test(l)).join('\n');
const order = [...html.matchAll(/<script[^>]*src="proto\/([^"]+\.jsx?)"/gi)].map(m => m[1]);

const blocks = order.map(name => {
  let raw = fs.readFileSync(path.join(__dirname, 'proto', name), 'utf8');
  if (name === 'state.jsx') {
    const before = raw;
    raw = raw
      .replace(/"apiMode":\s*"demo"/, '"apiMode": "live"')
      .replace(/"apiBase":\s*"\/api"/, '"apiBase": "http://localhost:4000/api"');
    if (raw === before) throw new Error('No pude aplicar el override live en state.jsx');
  }
  const { code } = esbuild.transformSync(raw, { loader: 'jsx', format: 'iife', target: 'es2018' });
  const safe = code.replace(/<\/script>/gi, '<\\/script>');
  return `<!-- ===== proto/${name} ===== -->\n<script data-file="${name}">\n${safe}\n</script>`;
}).join('\n\n');

const doc = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ContaPanamá v3 — LIVE (backend real)</title>
${links}
<script>${REACT}</script>
<script>${REACT_DOM}</script>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
${blocks}
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'index-live.html'), doc, 'utf8');
console.log(`OK -> index-live.html (${(doc.length / 1024).toFixed(0)} KB, ${order.length} modulos, apiMode=live)`);
