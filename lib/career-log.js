'use strict';

const { one } = require('./db');

const EDGE_URL = 'https://vypnobpmyadtcvxhtagn.supabase.co/functions/v1/career-log-ingest';
const ALLOWED_HISTORY_ORIGINS = [
  /^https:\/\/ai-history-ar\.vercel\.app$/,
  /^https:\/\/ai-history-[a-z0-9-]+-themonsteredu\.vercel\.app$/,
];

function send(res, status, body, origin = '') {
  if (origin && ALLOWED_HISTORY_ORIGINS.some((pattern) => pattern.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function allowedOrigin(origin) {
  return ALLOWED_HISTORY_ORIGINS.some((pattern) => pattern.test(origin));
}

function validUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanText(value, max) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

async function handleCareerLogIngest(req, res, body) {
  const origin = String(req.headers.origin || '');
  if (req.method === 'OPTIONS') {
    if (!allowedOrigin(origin)) return send(res, 403, { error: 'origin_not_allowed' });
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Vary', 'Origin');
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' }, origin);
  if (!allowedOrigin(origin)) return send(res, 403, { error: 'origin_not_allowed' });

  const boardCode = String(body?.board_code || '').trim();
  if (!/^\d{6}$/.test(boardCode)) return send(res, 400, { error: 'invalid_board_code' }, origin);
  if (!validUuid(body?.student_id)) return send(res, 400, { error: 'invalid_student_id' }, origin);

  // 공개된 수업 코드만으로 아무 MOAKIT 프로그램에 기록을 만들 수 없도록,
  // 현재 열려 있는 보드 + 그 프로그램에 연결된 AI HISTORY AR 링크를 함께 확인한다.
  const board = await one(
    `SELECT b.id, b.program_id, b.is_open, b.class_date, p.title
       FROM boards b
       JOIN programs p ON p.id = b.program_id
      WHERE b.code = $1`,
    [boardCode],
  );
  if (!board || !board.is_open) return send(res, 404, { error: 'board_not_open' }, origin);

  const historyLink = await one(
    `SELECT id FROM program_links
      WHERE program_id = $1
        AND (url ILIKE '%ai-history-ar%' OR label ILIKE '%역사%AI%')
      LIMIT 1`,
    [board.program_id],
  );
  if (!historyLink) return send(res, 403, { error: 'history_ai_not_assigned' }, origin);

  const process = cleanText(body?.process, 1000);
  if (!process) return send(res, 400, { error: 'process_required' }, origin);
  const reflection = cleanText(body?.reflection, 1000);
  const artifact = cleanText(body?.artifact, 1000);
  const sourceEventId = cleanText(body?.source_event_id, 300);
  if (!sourceEventId) return send(res, 400, { error: 'source_event_id_required' }, origin);

  let rawData = body?.raw_data ?? {};
  try {
    if (JSON.stringify(rawData).length > 50000) return send(res, 413, { error: 'raw_data_too_large' }, origin);
  } catch {
    return send(res, 400, { error: 'invalid_raw_data' }, origin);
  }

  // Vercel Functions 런타임이 주입한 단기 OIDC 토큰만 downstream으로 전달한다.
  // 장기 service-role key나 Supabase DB 비밀값은 Hub에 두지 않는다.
  const oidc = String(req.headers['x-vercel-oidc-token'] || '');
  if (!oidc) return send(res, 503, { error: 'vercel_oidc_not_available' }, origin);

  const record = {
    student_id: body.student_id,
    session_ref: `hub-board:${board.id}`,
    program_ref: 'history-ai-01',
    occurred_at: new Date().toISOString(),
    process,
    artifact,
    reflection,
    source: 'hub',
    verification_status: null,
    verified_by: null,
    verified_at: null,
    raw_data: {
      ...rawData,
      hub: {
        board_id: board.id,
        program_id: board.program_id,
        class_date: board.class_date || null,
      },
    },
    source_event_id: sourceEventId,
    supersedes_id: null,
  };

  let upstream;
  try {
    upstream = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${oidc}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    console.error('Career Log Edge Function unreachable', error);
    return send(res, 502, { error: 'career_log_unreachable' }, origin);
  }

  const result = await upstream.json().catch(() => ({ error: 'invalid_edge_response' }));
  return send(res, upstream.status, result, origin);
}

module.exports = { handleCareerLogIngest };
