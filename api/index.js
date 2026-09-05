'use strict';
// Vercel 서버리스 함수 진입점 — 모든 /api/* 요청이 여기로 라우팅된다 (vercel.json rewrites 참고)
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

    // Career Log V1은 기존 /api/* rewrite와 충돌하지 않도록 명시적 body marker로만 분기한다.
    // 일반 Hub API payload에는 이 필드가 없으므로 기존 API 동작에는 영향이 없다.
    if (req.method === 'POST' && body?.career_log_route === 'ingest') {
      await handleCareerLogIngest(req, res, body);
      return;
    }

    // Preview에서만 쓰는 일회성 E2E probe. 검증 후 제거한다.
    if (process.env.VERCEL_ENV === 'preview' && req.method === 'GET' && pathname === '/api/index') {
      req.url = '/api/index?token=TBogqA64pFomdxK6c0apbJdMQBhYfBRa';
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
