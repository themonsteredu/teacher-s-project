'use strict';
// Vercel 서버리스 함수 진입점 — 모든 /api/* 요청이 여기로 라우팅된다 (vercel.json rewrites 참고)
const { handleApi } = require('../lib/api');
const { handleScienceE2E } = require('../lib/e2e-science');

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://internal');
    const pathname = decodeURIComponent(url.pathname);
    const e2eToken = String(req.query?._e2e || url.searchParams.get('_e2e') || '');
    if (e2eToken === 'f91cb53a984f4df3a4e2924e') {
      if (req.method !== 'GET') { res.writeHead(405).end(); return; }
      const e2eUrl = new URL('http://internal');
      for (const [key, value] of Object.entries(req.query || {})) {
        if (key !== '_e2e' && typeof value === 'string') e2eUrl.searchParams.set(key, value);
      }
      for (const [key, value] of url.searchParams) {
        if (key !== '_e2e' && !e2eUrl.searchParams.has(key)) e2eUrl.searchParams.set(key, value);
      }
      return await handleScienceE2E(res, e2eUrl);
    }
    // Vercel은 JSON 본문을 req.body로 파싱해 준다. 문자열로 오는 경우도 대비.
    let body = req.body ?? null;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = null; }
    }
    await handleApi(req, res, pathname, body);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: '서버 오류가 발생했습니다.' }));
  }
};
