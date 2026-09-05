'use strict';

const crypto = require('node:crypto');
const { one, q } = require('./db');

const BOARD_TITLE = 'Career Log E2E · normal join session';
const PROGRAM_TITLE = 'Career Log E2E · unpublished access check';

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function createBoard(programId, linkId, title = BOARD_TITLE) {
  let board = null;
  for (let attempt = 0; attempt < 5 && !board; attempt++) {
    const code = `v1${crypto.randomBytes(3).toString('hex')}`;
    try {
      board = await one(
        `INSERT INTO boards (program_id, title, code, created_by, class_date, roster)
         VALUES ($1, $2, $3, null, current_date, '') RETURNING id, code`,
        [programId, title, code],
      );
    } catch (error) {
      if (!String(error.message).includes('duplicate key')) throw error;
    }
  }
  if (!board) throw new Error('board_create_failed');
  await q("INSERT INTO board_items (board_id, item_type, link_id, position) VALUES ($1, 'link', $2, 0)", [board.id, linkId]);
  return board;
}

async function scienceProgram() {
  const program = await one("SELECT id FROM programs WHERE title = '인공지능 융합수업' AND published = true ORDER BY id LIMIT 1");
  if (!program) return null;
  const link = await one(
    `SELECT id, label, url FROM program_links
      WHERE program_id = $1 AND kind = 'aiapp'
        AND url ILIKE '%3차시-학생용-감각짝맞추기.html'
      ORDER BY id LIMIT 1`,
    [program.id],
  );
  return link ? { program, link } : null;
}

async function handleCareerSessionE2E(res, url) {
  const action = url.searchParams.get('action');
  if (action === 'create') {
    const science = await scienceProgram();
    if (!science) return json(res, 404, { error: 'science_program_not_found' });
    const first = await createBoard(science.program.id, science.link.id);
    const second = await createBoard(science.program.id, science.link.id);
    return json(res, 201, { ok: true, boards: [first, second], program_id: science.program.id });
  }

  if (action === 'create_unpublished') {
    const science = await scienceProgram();
    if (!science) return json(res, 404, { error: 'science_program_not_found' });
    const program = await one(
      `INSERT INTO programs (title, category, grade, description, published, sort_order)
       VALUES ($1, 'e2e', '', '', false, 0) RETURNING id`,
      [PROGRAM_TITLE],
    );
    const link = await one(
      `INSERT INTO program_links (program_id, kind, label, url, position)
       VALUES ($1, 'aiapp', $2, $3, 0) RETURNING id`,
      [program.id, science.link.label, science.link.url],
    );
    const board = await createBoard(program.id, link.id, PROGRAM_TITLE);
    return json(res, 201, { ok: true, board, program_id: program.id });
  }

  if (action === 'close') {
    const boardId = Number(url.searchParams.get('board_id'));
    const board = await one('UPDATE boards SET is_open = false WHERE id = $1 AND title = $2 RETURNING id, code', [boardId, BOARD_TITLE]);
    return json(res, board ? 200 : 404, { ok: !!board, board });
  }

  if (action === 'cleanup') {
    const ids = String(url.searchParams.get('board_ids') || '').split(',').map(Number).filter(Number.isInteger);
    if (!ids.length) return json(res, 400, { error: 'invalid_board_ids' });
    await q('DELETE FROM board_items WHERE board_id = ANY($1::bigint[])', [ids]);
    const removedBoards = await q('DELETE FROM boards WHERE id = ANY($1::bigint[]) AND title IN ($2, $3) RETURNING id', [ids, BOARD_TITLE, PROGRAM_TITLE]);
    const removedPrograms = await q('DELETE FROM programs WHERE title = $1 AND NOT EXISTS (SELECT 1 FROM boards WHERE program_id = programs.id) RETURNING id', [PROGRAM_TITLE]);
    return json(res, 200, { ok: true, removed_boards: removedBoards.map((row) => row.id), removed_programs: removedPrograms.map((row) => row.id) });
  }

  return json(res, 400, { error: 'invalid_action' });
}

module.exports = { handleCareerSessionE2E };
