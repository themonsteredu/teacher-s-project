import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../lib/api.js', import.meta.url), 'utf8');

// 도구함은 관리자끼리 공용이 됐다. 다만 삭제는 저장소 원본까지 지워 남의 수업 링크를
// 죽이므로 좁게 남겨야 한다 — 두 방향을 모두 고정한다.
function harness({ userId = 1, tool = { id: 9, title: '웹앱', storage_path: 'tools/2/x.html', created_by: 2, description: '' } } = {}) {
  const calls = { sql: [], params: [], removed: [], logs: [] };
  const module = { exports: {} };
  const deps = {
    'node:crypto': require('node:crypto'), './password': {}, './cookies': {},
    './worksheet-headers': require('../lib/worksheet-headers'),
    './student-board': require('../lib/student-board'),
    './auth': { getSessionUser: async () => ({ user: { id: userId, role: 'admin' } }), roleLevel: (r) => ({ admin: 2, teacher: 1 }[r] || 0) },
    './storage': { storageEnabled: true, removeObject: async (p) => calls.removed.push(p) },
    './db': {
      TS: (c) => c, ready: async () => {}, getSettings: async () => ({ site_open: true }),
      log: async (u, a, d) => calls.logs.push(`${a} ${d}`),
      one: async (sql, params) => {
        calls.sql.push(sql); calls.params.push(params);
        if (!sql.includes('FROM tools')) return null;
        // 실제 SQL 의 소유자 조건을 흉내 낸다
        if (sql.includes('created_by = $2')) {
          const owns = String(tool.created_by) === String(params[1]);
          const orphan = sql.includes('created_by IS NULL') && tool.created_by === null;
          return owns || orphan ? tool : null;
        }
        return tool;
      },
      q: async (sql, params) => { calls.sql.push(sql); calls.params.push(params); return []; },
    },
  };
  vm.runInNewContext(source, { module, require: (id) => deps[id], process: { env: {} }, Buffer, URL });
  return {
    calls,
    async call(method, path, body) {
      let status, result;
      await module.exports.handleApi(
        { method, url: path, headers: { host: 'h', origin: 'https://h' } },
        { setHeader() {}, writeHead(s) { status = s; }, end(v) { result = v ? JSON.parse(v) : null; } },
        path, body);
      return { status, result };
    },
  };
}

test('도구 목록은 올린 사람과 무관하게 전부 나오고 누구 것인지 함께 온다', async () => {
  const h = harness({ userId: 1 });
  await h.call('GET', '/api/tools');
  const sql = h.calls.sql.find((s) => s.includes('FROM tools'));
  assert.ok(!/WHERE\s+created_by/.test(sql), '소유자로 목록을 좁히면 안 된다');
  assert.ok(sql.includes('LEFT JOIN users'), 'INNER JOIN 이면 계정이 지워진 웹앱이 사라진다');
  assert.ok(sql.includes('owner_name') && sql.includes('mine'), '누구 것인지 함께 내려야 한다');
});

test('다른 관리자의 웹앱도 이름은 고칠 수 있다', async () => {
  const h = harness({ userId: 1 }); // 웹앱 주인은 2번
  const { status } = await h.call('PATCH', '/api/tools/9', { title: '새 이름' });
  assert.equal(status, 200);
});

test('다른 관리자의 웹앱은 지울 수 없다 — 저장소 원본이 사라져 남의 수업 링크가 죽는다', async () => {
  const h = harness({ userId: 1 }); // 웹앱 주인은 2번
  const { status } = await h.call('DELETE', '/api/tools/9');
  assert.equal(status, 404);
  assert.deepEqual(h.calls.removed, [], '원본을 지우면 안 된다');
});

test('내가 올린 웹앱은 지울 수 있다', async () => {
  const h = harness({ userId: 2 });
  const { status } = await h.call('DELETE', '/api/tools/9');
  assert.equal(status, 200);
  assert.equal(h.calls.removed.length, 1);
});

test('올린 계정이 지워진 웹앱은 아무 관리자나 정리할 수 있다', async () => {
  const h = harness({ userId: 1, tool: { id: 9, title: '주인 없는 웹앱', storage_path: 'tools/2/x.html', created_by: null, description: '' } });
  const { status } = await h.call('DELETE', '/api/tools/9');
  assert.equal(status, 200, '예전에는 누구에게도 안 보이면서 지울 수도 없었다');
  assert.ok(h.calls.logs.some((l) => l.includes('owner=')), '이용 기록에 누구 것이었는지 남긴다');
});
