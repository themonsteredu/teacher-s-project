'use strict';

const { one, q, getSettings } = require('./db');
const { originAllowed, resolveIntegration } = require('./career-log-integrations');
const { validAviationSubmission } = require('./aviation-record');

function send(res, status, body, origin = '') {
  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = status;
  res.end(JSON.stringify(body));
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
    if (!originAllowed(origin)) return send(res, 403, { error: 'origin_not_allowed' });
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Vary', 'Origin');
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' }, origin);

  const integration = resolveIntegration(body?.program_ref);
  if (!integration || !originAllowed(origin, integration)) return send(res, 403, { error: 'origin_not_allowed' }, origin);

  const settings = await getSettings();
  if (!settings.site_open) return send(res, 403, { error: 'site_closed' }, origin);

  const boardCode = String(body?.board_code || '').trim().toLowerCase();
  if (!/^[a-z0-9]{4,10}$/i.test(boardCode)) return send(res, 400, { error: 'invalid_board_code' }, origin);

  // 공개된 수업 코드만으로 아무 MOAKIT 프로그램에 기록을 만들 수 없도록,
  // 현재 열려 있는 보드와 요청한 교과 앱 링크가 같은 프로그램에 있는지 함께 확인한다.
  const board = await one(
    `SELECT b.id, b.program_id, b.is_open, b.class_date, p.title, p.published
       FROM boards b
       JOIN programs p ON p.id = b.program_id
      WHERE b.code = $1`,
    [boardCode],
  );
  if (!board || !board.is_open) return send(res, 404, { error: 'board_not_open' }, origin);
  if (!board.published) return send(res, 403, { error: 'program_not_published' }, origin);

  // A public code and a UUID in the request are not proof of student identity.
  // This applies to legacy app callers too, so they cannot forge account records.
  let studentId;
  try {
    const saved = await one('SELECT value FROM settings WHERE key=$1', [`sb:config:${board.id}`]);
    const career = saved ? JSON.parse(saved.value).career : null;
    if (!career?.enabled || !validUuid(career.schoolId)) return send(res, 403, {error:'career_class_not_connected'}, origin);
    const account = await require('./student-accounts/http').authorizeStudent(req,career.schoolId);
    studentId = account.careerStudentId;
    if (!validUuid(studentId)) return send(res,503,{error:'student_identity_unavailable'},origin);
    if (body?.student_id != null && String(body.student_id).toLowerCase() !== studentId.toLowerCase()) {
      return send(res,409,{error:'student_identity_mismatch'},origin);
    }
  } catch (error) {
    return send(res,error.status||503,{error:error.status?error.message:'student_identity_unavailable'},origin);
  }

  const links = await q(
    `SELECT pl.label, pl.url
       FROM board_items bi
       JOIN program_links pl ON pl.id = bi.link_id
      WHERE bi.board_id = $1 AND bi.item_type = 'link'`,
    [board.id],
  );
  if (!links.some(integration.linkMatches)) return send(res, 403, { error: 'career_program_not_assigned' }, origin);

  const activityProcess = cleanText(body?.process, 1000);
  if (!activityProcess) return send(res, 400, { error: 'process_required' }, origin);
  const reflection = cleanText(body?.reflection, 1000);
  const artifact = cleanText(body?.artifact, 1000);
  const sourceEventId = cleanText(body?.source_event_id, 300);
  if (!sourceEventId) return send(res, 400, { error: 'source_event_id_required' }, origin);
  // program_ref가 없던 기존 History AI 호출은 기존 source_event_id 형식을 유지한다.
  // 명시적으로 V1 통합을 선택한 신규 호출에는 프로그램별 prefix를 강제한다.
  if (body?.program_ref && !sourceEventId.startsWith(integration.sourceEventPrefix)) {
    return send(res, 400, { error: 'invalid_source_event_id' }, origin);
  }

  let rawData = body?.raw_data ?? {};
  try {
    if (JSON.stringify(rawData).length > 50000) return send(res, 413, { error: 'raw_data_too_large' }, origin);
  } catch {
    return send(res, 400, { error: 'invalid_raw_data' }, origin);
  }
  if (integration.programRef === 'aviation-mobility-01' && !validAviationSubmission(body, {
    boardCode, studentId, sourceEventId,
  })) return send(res, 400, { error: 'invalid_career_record' }, origin);

  // Vercel Functions 런타임이 주입한 단기 OIDC 토큰만 downstream으로 전달한다.
  // 장기 service-role key나 Supabase DB 비밀값은 Hub에 두지 않는다.
  const oidc = String(req.headers['x-vercel-oidc-token'] || '');
  if (!oidc) return send(res, 503, { error: 'vercel_oidc_not_available' }, origin);
  const edgeUrl = process.env.CAREER_LOG_INGEST_URL || '';
  try {
    const url = new URL(edgeUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/functions/v1/career-log-ingest') throw new Error('invalid target');
  } catch { return send(res,503,{error:'career_log_not_configured'},origin); }

  const record = {
    student_id: studentId,
    session_ref: `hub-board:${board.id}`,
    program_ref: integration.programRef,
    occurred_at: new Date().toISOString(),
    process:activityProcess,
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
    upstream = await fetch(edgeUrl, {
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
