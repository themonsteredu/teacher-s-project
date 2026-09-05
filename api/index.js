'use strict';
// 레거시 함수 진입점. 현재 Vercel Node 런타임의 공개 API 진입점은 server.js다.
const { handleApi } = require('../lib/api');

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://internal');
    const pathname = decodeURIComponent(url.pathname);
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
