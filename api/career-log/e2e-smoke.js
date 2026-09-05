'use strict';

const crypto = require('node:crypto');
const { q } = require('../../lib/db');

module.exports = async (req, res) => {
  if (process.env.VERCEL_ENV !== 'preview') { res.statusCode = 404; return res.end('not found'); }

  const studentId = crypto.randomUUID();
  const sourceEventId = `history-ai-01:e2e:${crypto.randomUUID()}`;
  const boardCode = String(900000 + Math.floor(Math.random() * 99999)).slice(0, 6);
  let programId = null;

  try {
    const programs = await q(`INSERT INTO programs (title, category, grade, description, published, sort_order) VALUES ($1, $2, $3, $4, true, 9999) RETURNING id`, ['Career Log E2E · 역사 AI 1차시', 'AI 역사', '초5', 'E2E 검증 후 자동 삭제되는 임시 프로그램']);
    programId = programs[0].id;
    await q(`INSERT INTO program_links (program_id, position, kind, label, url) VALUES ($1, 0, 'aiapp', $2, $3)`, [programId, '역사 AI 1차시', 'https://ai-history-ar.vercel.app/three-kingdoms/lesson/1']);
    const boards = await q(`INSERT INTO boards (program_id, title, code, is_open, class_date, roster, created_by) VALUES ($1, $2, $3, true, CURRENT_DATE, '', NULL) RETURNING id`, [programId, 'Career Log E2E', boardCode]);

    const host = process.env.VERCEL_URL;
    if (!host) throw new Error('VERCEL_URL missing');
    const response = await fetch(`https://${host}/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://ai-history-ar.vercel.app' },
      body: JSON.stringify({
        career_log_route: 'ingest', board_code: boardCode, student_id: studentId,
        process: '삼국·가야 문화유산을 관찰하고 모둠에서 조사할 데이터 질문을 정함',
        artifact: '모둠 데이터 질문 · 첨성대: 문화유산을 서로 비교하려면 어떤 정보를 모아야 할까?',
        reflection: '사진을 관찰한 뒤 자료로 확인할 질문을 정했다.', source_event_id: sourceEventId,
        raw_data: { lesson: 1, era: 'three-kingdoms', selected_heritage: '첨성대', data_question: '문화유산을 서로 비교하려면 어떤 정보를 모아야 할까?', activity: 'heritage-question-card', e2e: true },
      }),
    });
    const result = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = response.status;
    return res.end(JSON.stringify({ ok: response.ok, student_id: studentId, source_event_id: sourceEventId, board_id: boards[0].id, ingest: result }));
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: String(error?.message || error), student_id: studentId, source_event_id: sourceEventId }));
  } finally {
    if (programId != null) await q('DELETE FROM programs WHERE id = $1', [programId]).catch((error) => console.error('E2E cleanup failed', error));
  }
};
