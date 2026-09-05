'use strict';
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { handleApi } = require('./lib/api');
const { handleCareerLogIngest } = require('./lib/career-log');
const handleCareerLogE2E = require('./api/career-log/e2e-smoke');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(res, pathname) {
  const isApp = pathname === '/app' || pathname.startsWith('/app/');
  let file = pathname === '/' ? '/index.html' : isApp ? '/app.html' : pathname;
  const full = path.join(PUBLIC_DIR, path.normalize(file));
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    const index = path.join(PUBLIC_DIR, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
    return res.end(fs.readFileSync(index));
  }
  const ext = path.extname(full).toLowerCase();
  const frameOpt = pathname.startsWith('/lessons/') ? 'SAMEORIGIN' : 'DENY';
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': frameOpt,
  });
  res.end(fs.readFileSync(full));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 4 * 1024 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
      catch { resolve(null); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);
  try {
    if (pathname === '/api/career-log/ingest') {
      const body = req.method === 'POST' ? await readBody(req) : null;
      return await handleCareerLogIngest(req, res, body);
    }
    // TEMP E2E ONLY: branch smoke endpoint, removed immediately after one verified run.
    if (pathname === '/api/career-log/e2e-smoke' && req.method === 'GET') {
      return await handleCareerLogE2E(req, res);
    }
    if (pathname.startsWith('/api/')) {
      const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : null;
      return await handleApi(req, res, pathname, body);
    }
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }
    serveStatic(res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '서버 오류가 발생했습니다.' }));
  }
});

server.listen(PORT, () => {
  console.log(`모아허브 실행 중: http://localhost:${PORT}`);
});
