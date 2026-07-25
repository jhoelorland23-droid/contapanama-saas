// Build self-contained, offline, double-clickable HTML for each ContaPanamá
// prototype (proto / proto-os / proto-so). For each one we read its rendered
// canvas export (_srchtml/<key>.html) to recover, verbatim and faithfully:
//   - the real design CSS (<style> block)
//   - the Google Fonts <link>s
//   - the exact module load order (<script type="text/babel" src="...">)
// then we PRECOMPILE every .jsx with esbuild and INLINE React, so the result
// needs no server, no internet, and no in-browser Babel.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const REACT = fs.readFileSync(path.join(__dirname, 'node_modules/react/umd/react.production.min.js'), 'utf8');
const REACT_DOM = fs.readFileSync(path.join(__dirname, 'node_modules/react-dom/umd/react-dom.production.min.js'), 'utf8');

const PROTOS = [
  { key: 'proto',    title: 'ContaPanamá v3 — Prototipo (demo)',           out: 'index.html' },
  { key: 'proto-os', title: 'ContaPanamá OS — Prototipo (demo)',           out: 'index-os.html' },
  { key: 'proto-so', title: 'ContaPanamá SO Financiero — Prototipo (demo)', out: 'index-so.html' },
];

function build({ key, title, out }) {
  const html = fs.readFileSync(path.join(__dirname, '_srchtml', `${key}.html`), 'utf8');

  // 1) real CSS
  const css = html.match(/<style>([\s\S]*?)<\/style>/i)[1];

  // 2) font + preconnect links (keep faithful typography; degrades gracefully offline)
  const links = (html.match(/<link[^>]*>/gi) || [])
    .filter(l => /fonts\.(googleapis|gstatic)/.test(l)).join('\n');

  // 3) exact load order from the rendered host (only this prototype's own modules)
  const re = new RegExp(`<script[^>]*src="${key}/([^"]+\\.jsx?)"`, 'gi');
  const order = [...html.matchAll(re)].map(m => m[1]);
  if (!order.length) throw new Error(`No module order found for ${key}`);

  // 4) preserve <html ...> attributes (data-theme/data-mode/lang defaults)
  const htmlAttrs = (html.match(/<html([^>]*)>/i) || [, ' lang="es"'])[1];

  // 5) precompile + inline each module (IIFE => per-file scope, window.X escapes)
  const blocks = order.map(name => {
    const raw = fs.readFileSync(path.join(__dirname, key, name), 'utf8');
    const { code } = esbuild.transformSync(raw, { loader: 'jsx', format: 'iife', target: 'es2018' });
    const safe = code.replace(/<\/script>/gi, '<\\/script>');
    return `<!-- ===== ${key}/${name} ===== -->\n<script data-file="${name}">\n${safe}\n</script>`;
  }).join('\n\n');

  const doc = `<!doctype html>
<html${htmlAttrs}>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
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

  fs.writeFileSync(path.join(__dirname, out), doc, 'utf8');
  console.log(`OK -> ${out}  (${(doc.length / 1024).toFixed(0)} KB, ${order.length} modulos)`);
}

PROTOS.forEach(build);
