const http = require('http');
const fs = require('fs');
const path = require('path');
const { scan } = require('./scanner');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

// simple per-IP rate limit: 20 scans / 10 min
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 600_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 20;
}

const cache = new Map(); // url -> {at, result}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/health') return send(res, 200, { ok: true });
  if (u.pathname === '/api/scan') {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (limited(ip)) return send(res, 429, { error: 'Too many scans. Try again in a few minutes.' });
    const target = u.searchParams.get('url');
    try {
      const key = String(target).toLowerCase().replace(/\/$/, '');
      const c = cache.get(key);
      if (c && Date.now() - c.at < 3_600_000) return send(res, 200, c.result);
      const result = await scan(target);
      cache.set(key, { at: Date.now(), result });
      return send(res, 200, result);
    } catch (e) {
      return send(res, 400, { error: e.message || 'Scan failed' });
    }
  }
  let p = u.pathname === '/' ? '/index.html' : u.pathname;
  if (!path.extname(p)) p = p.replace(/\/$/, '') + '.html';
  const file = path.normalize(path.join(PUB, p));
  if (!file.startsWith(PUB)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) {
      return fs.readFile(path.join(PUB, 'index.html'), (e2, d2) => (e2 ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, d2, TYPES['.html'])));
    }
    send(res, 200, data, TYPES[path.extname(file)] || 'application/octet-stream');
  });
}).listen(PORT, () => console.log('FooterCheck on :' + PORT));
