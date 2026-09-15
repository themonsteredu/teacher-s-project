'use strict';
const crypto = require('node:crypto');
const PROGRAM = 'hub-submission-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fileSpec = f => ({name:f.name,mime:f.mime,size:f.size,storage_path:f.path});
// 한 제출에 사진이 여러 장 붙는다. attachment(첫 장)는 모아랩 쪽 표시가 읽는 칸이라
// 그대로 두고, 전체는 attachments 로 함께 남긴다 — 한쪽만 바꾸면 기록이 갈린다.
function snapshot({studentId, board, session, data, attachment, attachments}) {
  if (!UUID.test(studentId)) throw new Error('A server-bound student identity is required');
  const files = (attachments || (attachment ? [attachment] : [])).filter(Boolean);
  return {
    student_id:studentId, session_ref:`hub-board:${board.id}`, program_ref:PROGRAM,
    occurred_at:new Date().toISOString(), process:session.record.process,
    artifact:data.title, reflection:null, source:'hub',
    verification_status:null, verified_by:null, verified_at:null, supersedes_id:null,
    source_event_id:`${PROGRAM}:${crypto.randomUUID()}`,
    raw_data:{hub:{board_id:String(board.id),program_id:String(board.program_id)},
      submission:{session_id:session.id,session_title:session.title,title:data.title,content:data.content,
        attachment:files[0] ? fileSpec(files[0]) : null, attachments:files.map(fileSpec)}},
  };
}
async function deliver(req, payload, fetcher = fetch) {
  const token = req.headers['x-vercel-oidc-token'];
  if (!token) throw new Error('진로기록 저장 연결을 사용할 수 없습니다. 제출물은 보관되었습니다.');
  const endpoint = process.env.CAREER_LOG_INGEST_URL;
  if (!endpoint || !/^https:\/\/[^/]+\/functions\/v1\/career-log-ingest$/.test(endpoint)) throw new Error('진로기록 저장 주소가 설정되지 않았습니다.');
  const r = await fetcher(endpoint, {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
  const result = await r.json();
  if (!r.ok || result.ok !== true || !UUID.test(result.record_id || '') || result.student_id !== payload.student_id) throw new Error('진로기록 저장을 확인하지 못했습니다. 같은 기록으로 다시 시도할 수 있습니다.');
  return {recordId:result.record_id,storedAt:new Date().toISOString()};
}
function receipt(meta, includeOriginal = false) {
  const c = meta?.career;
  if (!c) return {state:'not_requested'};
  return {state:c.state,recordId:c.recordId || null,storedAt:c.storedAt || null,
    ...(includeOriginal ? {record:c.payload} : {})};
}
module.exports = {PROGRAM,snapshot,deliver,receipt};
