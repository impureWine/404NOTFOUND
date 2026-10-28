// Dependency-free local static server for the classroom demo. Never proxies APIs.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const port = Number(process.env.UX_DEMO_PORT || 5190);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid UX_DEMO_PORT');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end('Static demo only'); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end('Invalid path'); return; }
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) { res.writeHead(403); res.end('Forbidden'); return; }
  const relative = pathname === '/' ? '演示导航.html' : pathname.slice(1);
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.setHeader('Content-Type', types[path.extname(target).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.writeHead(200);
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(target).on('error', () => res.destroy()).pipe(res);
  });
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Port 5190 is busy. Set UX_DEMO_PORT to another port and retry.' : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`404NOTFOUND UX demo: http://127.0.0.1:${port}/\nSynthetic/in-memory data; no backend. Press Ctrl+C to stop.`));
