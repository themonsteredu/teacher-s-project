'use strict';
const { handleApi } = require('../lib/api');
const { handleCareerLogIngest } = require('../lib/career-log');
const handleCareerLogE2E = require('./career-log/e2e-smoke');

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://internal');
    const pathname = decodeURIComponent(url.pathname);
    let body = req.body ?? null;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = null; }
    }
    if (req.method === 'POST' && body?.career_log_route === 'ingest') {
      await handleCareerLogIngest(req, res, body);
      return;
    }
    // TEMP E2E ONLY: preview GET is invoked once and removed immediately after verification.
    if (process.env.VERCEL_ENV === 'preview' && req.method === 'GET') {
      await handleCareerLogE2E(req, res);
      return;
    }
    await handleApi(req, res, pathname, body);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '서버 오류가 발생했습니다.' }));
  }
};
