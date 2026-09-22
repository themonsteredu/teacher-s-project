import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../lib/api.js', import.meta.url), 'utf8');

// 관리자에게는 전 교사의 수업이 한 목록에 나온다. 누구 반인지가 응답에 실리는지 본다.
function harness({ role = 'admin', userId = 99 } = {}) {
  const seen = { sql: [], params: [] };
  const rows = [
    { id: 1, title: '2학년 2반', code: 'aa11', is_open: true, program_id: 5, class_date: null, roster: '', created_by: 3, created_at: 'x', program_title: '분수', program_published: true, teacher_name: '김선생', post_count: 2, item_count: 1 },
    { id: 2, title: '3학년 1반', code: 'bb22', is_open: true, program_id: 5, class_date: null, roster: '', created_by: 99, created_at: 'x', program_title: '분수', program_published: true, teacher_name: '원장', post_count: 0, item_count: 0 },
  ];
  const module = { exports: {} };
  const deps = {
    'node:crypto': require('node:crypto'), './password': {}, './cookies': {},
    './worksheet-headers': require('../lib/worksheet-headers'),
    './student-board': require('../lib/student-board'),
    './auth': { getSessionUser: async () => ({ user: { id: userId, role } }), roleLevel: (r) => ({ admin: 2, teacher: 1 }[r] || 0) },
    './storage': { storageEnabled: false },
    './db': {
      TS: (c) => c, ready: async () => {}, getSettings: async () => ({ site_open: true }), log: async () => {},
      one: async () => null,
      q: async (sql, params) => {
        seen.sql.push(sql); seen.params.push(params);
        if (sql.includes('FROM boards b JOIN programs p')) {
          return sql.includes('WHERE b.created_by') ? rows.filter((r) => String(r.created_by) === String(params[0])) : rows;
        }
        return [];
      },
    },
  };
  vm.runInNewContext(source, { module, require: (id) => deps[id], process: { env: {} }, Buffer, URL });
  return {
    seen,
    async call() {
      let status, result;
      await module.exports.handleApi(
        { method: 'GET', url: '/api/my-boards', headers: { host: 'hub.test', origin: 'https://hub.test' } },
        { setHeader() {}, writeHead(s) { status = s; }, end(v) { result = v ? JSON.parse(v) : null; } },
        '/api/my-boards');
      return { status, result };
    },
  };
}

test('관리자 목록에는 모든 수업이 담당 선생님 이름과 함께 실린다', async () => {
  const h = harness({ role: 'admin', userId: 99 });
  const { status, result } = await h.call();
  assert.equal(status, 200);
  assert.equal(result.boards.length, 2, '관리자는 전 교사의 수업을 본다');
  const other = result.boards.find((b) => b.id === 1);
  assert.equal(other.teacherName, '김선생');
  assert.equal(other.mine, false);
  const own = result.boards.find((b) => b.id === 2);
  assert.equal(own.mine, true, '본인 수업은 mine 으로 구분된다');
});

test('교사 목록은 예전 그대로 자기 수업뿐이라 새로 새는 정보가 없다', async () => {
  const h = harness({ role: 'teacher', userId: 3 });
  const { result } = await h.call();
  assert.equal(result.boards.length, 1);
  assert.equal(result.boards[0].id, 1);
  assert.equal(result.boards[0].mine, true);
  const boardSql = h.seen.sql.find((s) => s.includes('FROM boards b JOIN programs p'));
  assert.ok(boardSql.includes('WHERE b.created_by'), '교사 쿼리는 여전히 본인으로 좁힌다');
});

test('담당 교사가 지워진 수업도 목록에서 빠지지 않는다', async () => {
  const h = harness({ role: 'admin', userId: 99 });
  const boardSql = (await h.call(), h.seen.sql.find((s) => s.includes('FROM boards b JOIN programs p')));
  assert.ok(boardSql.includes('LEFT JOIN users u'), 'INNER JOIN 이면 created_by 가 NULL 인 수업이 사라진다');
});
