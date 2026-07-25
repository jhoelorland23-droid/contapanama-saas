const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname;
const PORT = Number(process.argv[2]) || 5601;
const INDEX = process.argv[3] || 'index.html';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.jsx': 'text/javascript', '.css': 'text/css' };
http.createServer((req, res) => {
  let f = req.url === '/' ? '/' + INDEX : req.url;
  f = decodeURIComponent(f.split('?')[0]);
  // Rutea /portal y cualquier sub-ruta al index-portal.html (SPA del cliente)
  if (f === '/portal' || f.startsWith('/portal/')) f = '/index-portal.html';
  const p = path.join(root, f);
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'text/plain' });
    res.end(d);
  });
}).listen(PORT, () => console.log('serving ' + INDEX + ' on http://localhost:' + PORT));
