// Build the portal mini-app into a standalone index-portal.html
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const REACT = fs.readFileSync(path.join(__dirname, 'node_modules/react/umd/react.production.min.js'), 'utf8');
const REACT_DOM = fs.readFileSync(path.join(__dirname, 'node_modules/react-dom/umd/react-dom.production.min.js'), 'utf8');

const raw = fs.readFileSync(path.join(__dirname, 'portal', 'portal.jsx'), 'utf8')
  .replace('__API_BASE__', 'http://localhost:4000/api');

const { code } = esbuild.transformSync(raw, {
  loader: 'jsx',
  format: 'iife',
  target: 'es2018',
});
const safe = code.replace(/<\/script>/gi, '<\\/script>');

const CSS = `
  :root{
    --teal:#0F4C4A; --teal-700:#0B3937; --teal-50:#E6F0EF;
    --gold:#C9A75C; --gold-soft:#E8D9AE;
    --ink:#0B1318; --ink-2:#1B252B;
    --muted:#5E6A73; --muted-2:#8A949B;
    --line:#E5E2D8; --line-2:#EFEDE4;
    --bg:#FAF8F3; --paper:#FFFFFF; --surface:#F4F1E8;
    --green:#1E7F5C; --green-bg:#E2F1EA;
    --red:#B23A2F; --red-bg:#F6E3DF;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:var(--bg);color:var(--ink);
    font-family:"Inter Tight","Helvetica Neue",Arial,sans-serif;
    -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}
  .serif{font-family:"Instrument Serif",Georgia,serif;font-weight:400;letter-spacing:-0.01em;
    font-size:34px;line-height:1.05;margin:0 0 8px}
  .lede{color:var(--muted);font-size:14px;line-height:1.55;margin:0}
  .num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
  .mono{font-family:"JetBrains Mono",ui-monospace,monospace}
  .xs{font-size:10.5px;color:var(--muted-2);letter-spacing:.06em;text-transform:uppercase;font-weight:600}
  .lbl{display:block;font-size:11px;font-weight:600;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em}
  .inp{width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:8px;font-size:14px;color:var(--ink);background:var(--paper);outline:none;font-family:inherit;transition:border-color 120ms ease}
  .inp:focus{border-color:var(--teal)}
  .btn{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:8px;font-size:13px;font-weight:600;border:1px solid var(--line);background:var(--paper);color:var(--ink);cursor:pointer;font-family:inherit;transition:all 120ms ease;user-select:none}
  .btn:hover{background:var(--surface)}
  .btn.teal{background:var(--teal);color:#FAF8F3;border-color:var(--teal)}
  .btn.teal:hover{background:var(--teal-700)}
  .btn.ghost{background:transparent}
  .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 18px;border-radius:9px;font-size:13px;font-weight:600;box-shadow:0 12px 32px rgba(0,0,0,.2);z-index:500;max-width:90vw;text-align:center}

  /* ── Móvil ───────────────────────────────────────────────────────── */
  @media (max-width: 560px) {
    .serif{font-size:28px}
    .num.serif, .serif.num{font-size:34px !important}
  }
`;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Portal — ContaPanamá</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script>${REACT}</script>
<script>${REACT_DOM}</script>
<style>${CSS}</style>
</head>
<body>
<div id="root"></div>
<script>
${safe}
</script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'index-portal.html'), html, 'utf8');
console.log(`OK -> index-portal.html (${(html.length / 1024).toFixed(0)} KB)`);
