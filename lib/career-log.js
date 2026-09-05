'use strict';

const CAREER_LOG_API_URL = 'https://vypnobpmyadtcvxhtagn.supabase.co/functions/v1/career-log-ingest';
const HISTORY_ORIGINS = new Set([
  'https://ai-history-ar.vercel.app',
  'https://ai-history-ar-themonsteredu.vercel.app',
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HERITAGES = new Map([
  [1, '무령왕릉'],
  [2, '백제 금동대향로'],
  [3, '첨성대'],
  [4, '신라 금관'],
  [5, '고구려 고분벽화'],
  [6, '가야 고분군'],
]);
const DATA_FIELDS = new Set(['시기', '지역', '재료', '모양', '발견 장소', '출처']);

function isAllowedOrigin(origin) {
  return HISTORY_ORIGINS.has(origin)
    || /^https:\/\/ai-history-[a-z0-9-]+-themonsteredu\.vercel\.app$/i.test(origin);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'private, no-store',
    Vary: 'Origin',
  };
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

function cleanStrings(value, allowed, maxItems) {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) return null;
  const items = value.map((item) => String(item || '').trim());
  if (items.some((item) => !item || item.length > 50 || (allowed && !allowed.has(item)))) return null;
  return [...new Set(items)];
}

function normalizeHistoryLessonOneEvent(body) {
  if (!body || typeof body !== 'object') return null;
  const studentId = String(body.student_id || '');
  const sessionId = String(body.session_id || '');
  const sourceEventId = String(body.source_event_id || '');
  const occurredAt = new Date(String(body.occurred_at || ''));
  const group = Number(body.group);
  const heritageId = Number(body.heritage_id);
  const heritage = String(body.heritage || '').trim();
  const observation = String(body.observation || '').trim();
  const question = String(body.question || '').trim();
  const clues = cleanStrings(body.clues, null, 3);
  const dataFields = cleanStrings(body.data_fields, DATA_FIELDS, 6);
  const now = Date.now();

  if (!UUID_RE.test(studentId) || !UUID_RE.test(sessionId) || !UUID_RE.test(sourceEventId)) return null;
  if (!Number.isFinite(occurredAt.getTime()) || Math.abs(now - occurredAt.getTime()) > 24 * 60 * 60 * 1000) return null;
  if (!Number.isInteger(group) || group < 1 || group > 6) return null;
  if (HERITAGES.get(heritageId) !== heritage) return null;
  if (observation.length < 5 || observation.length > 100) return null;
  if (question.length < 10 || question.length > 140 || !question.endsWith('?')) return null;
  if (!clues || !dataFields) return null;

  return {
    student_id: studentId.toLowerCase(),
    session_id: sessionId.toLowerCase(),
    source_event_id: sourceEventId.toLowerCase(),
    occurred_at: occurredAt.toISOString(),
    group,
    heritage_id: heritageId,
    heritage,
    observation,
    question,
    clues,
    data_fields: dataFields,
  };
}

async function handleCareerLogApi(req, res, pathname, body) {
  if (pathname !== '/api/career-log/records') return false;
  const origin = String(req.headers.origin || '');
  if (!isAllowedOrigin(origin)) {
    json(res, 403, { error: '허용되지 않은 수업 출처입니다.' });
    return true;
  }
  const headers = corsHeaders(origin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return true;
  }
  if (req.method !== 'POST') {
    json(res, 405, { error: '허용되지 않은 요청입니다.' }, headers);
    return true;
  }
  const event = normalizeHistoryLessonOneEvent(body);
  if (!event) {
    json(res, 400, { error: '수업 완료 기록 형식이 올바르지 않습니다.' }, headers);
    return true;
  }
  const oidcToken = String(req.headers['x-vercel-oidc-token'] || '');
  if (!oidcToken) {
    json(res, 503, { error: '중앙 기록 연결 인증을 사용할 수 없습니다.' }, headers);
    return true;
  }

  try {
    const upstream = await fetch(process.env.CAREER_LOG_API_URL || CAREER_LOG_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${oidcToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error('Career Log ingest failed', upstream.status, result?.error || 'unknown');
      json(res, 502, { error: '중앙 활동 기록을 저장하지 못했습니다.' }, headers);
      return true;
    }
    json(res, upstream.status === 201 ? 201 : 200, {
      ok: true,
      record_id: result.record_id,
      student_id: result.student_id,
      duplicate: Boolean(result.duplicate),
    }, headers);
  } catch (error) {
    console.error('Career Log ingest unavailable', error instanceof Error ? error.message : String(error));
    json(res, 502, { error: '중앙 활동 기록에 연결할 수 없습니다.' }, headers);
  }
  return true;
}

module.exports = { handleCareerLogApi, isAllowedOrigin, normalizeHistoryLessonOneEvent };
