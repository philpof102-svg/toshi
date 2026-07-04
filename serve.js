// Tiny static server for the browser panel (no Electron needed). GPL-3.0.
// ESM on purpose — package.json sets "type":"module", so a CommonJS serve.js crashes at require().
import http from 'node:http';
import { readFile } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.riv': 'application/octet-stream', '.css': 'text/css', '.png': 'image/png' };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/panel/';
  if (p.endsWith('/')) p += 'index.html';
  readFile(join(root, p), (e, b) => {
    if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'content-type': types[extname(p)] || 'text/plain', 'access-control-allow-origin': '*' });
    res.end(b);
  });
}).listen(4821, () => console.log('toshi panel on http://127.0.0.1:4821/panel/'));
