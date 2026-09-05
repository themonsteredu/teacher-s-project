'use strict';

const crypto = require('node:crypto');
const { one, q } = require('./db');

const TITLE = 'Career Log E2E · science observation';

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function handleScienceE2E(res, url) {
  const action = url.searchParams.get('action');
  if (action === 'create') {
    const program = await one("SELECT id FROM programs WHERE title = '인공지능 융합수업' ORDER BY id LIMIT 1");
    if (!program) return json(res, 404, { error: 'program_not_found' });
    const link = await one(
      `SELECT id FROM program_links
        WHERE program_id = $1
          AND kind = 'aiapp'
          AND url ILIKE '%3차시-학생용-감각짝맞추기.html'
        ORDER BY id LIMIT 1`,
      [program.id],
    );
    if (!link) return json(res, 404, { error: 'science_link_not_found' });

    let board = null;
    for (let attempt = 0; attempt < 5 && !board; attempt++) {
      const code = `e2e${crypto.randomBytes(3).toString('hex')}`;
      try {
        board = await one(
          `INSERT INTO boards (program_id, title, code, created_by, class_date, roster)
           VALUES ($1, $2, $3, null, current_date, '') RETURNING id, code`,
          [program.id, TITLE, code],
        );
      } catch (error) {
        if (!String(error.message).includes('duplicate key')) throw error;
      }
    }
    if (!board) return json(res, 500, { error: 'board_create_failed' });
    await q(
      "INSERT INTO board_items (board_id, item_type, link_id, position) VALUES ($1, 'link', $2, 0)",
      [board.id, link.id],
    );
    return json(res, 201, { ok: true, board_id: board.id, code: board.code, program_id: program.id });
  }

  if (action === 'cleanup') {
    const boardId = Number(url.searchParams.get('board_id'));
    if (!Number.isInteger(boardId) || boardId <= 0) return json(res, 400, { error: 'invalid_board_id' });
    if (boardId !== 12) return json(res, 400, { error: 'unexpected_board_id' });
    const board = await one('SELECT id FROM boards WHERE id = $1 AND title = $2 AND code = $3', [boardId, TITLE, 'e2e665f6e']);
    if (!board) return json(res, 404, { error: 'board_not_found' });
    await q('DELETE FROM board_items WHERE board_id = $1', [boardId]);
    const removed = await one('DELETE FROM boards WHERE id = $1 AND title = $2 RETURNING id', [boardId, TITLE]);
    return json(res, 200, { ok: true, removed: !!removed });
  }

  return json(res, 400, { error: 'invalid_action' });
}

module.exports = { handleScienceE2E };
