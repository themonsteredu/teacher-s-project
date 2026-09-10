import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../lib/api.js', import.meta.url), 'utf8');

// 차시 주제(topic): 생성·수정 API가 값을 다듬어 저장하는지 — DB는 기록만 하는 스텁
async function request(method, path, body) {
  const queries = [], module = { exports: {} };
  const deps = {
    'node:crypto': require('node:crypto'), '../public/curriculum': require('../public/curriculum'), './password': {}, './cookies': {}, './storage': {},
    './auth': { getSessionUser: async () => ({ user: { id: 1, role: 'admin' } }), roleLevel: r => ({ teacher: 1, admin: 2 }[r] || 0) },
    './db': {
      TS: c => c, ready: async () => {}, log: async () => {}, getSettings: async () => ({ site_open: true }),
      one: async (sql, params) => {
        queries.push({ sql, params: Array.from(params || []) });
        if (sql.startsWith('SELECT * FROM programs')) return { id: params[0], title: '수업' };
        if (sql.startsWith('SELECT * FROM lessons')) return { id: params[0], title: '1차시', topic: '' };
        if (sql.includes('MAX(position)')) return { p: 3 };
        if (sql.startsWith('INSERT INTO lessons')) return { id: 77 };
        throw new Error(`Unexpected database access: ${sql}`);
      },
      q: async (sql, params) => { queries.push({ sql, params: Array.from(params || []) }); return []; },
    },
  };
  vm.runInNewContext(source, { module, exports: module.exports, require: id => { if (id in deps) return deps[id]; throw new Error(id); }, process: { env: {} }, console });
  let status, out;
  await module.exports.handleApi({ method, headers: {} }, { writeHead: s => { status = s; }, end: text => { out = JSON.parse(text); } }, path, body);
  return { status, body: out, queries };
}

test('새 차시는 주제와 함께 저장되고, 주제는 공백 정리·200자 제한을 거친다', async () => {
  const r = await request('POST', '/api/programs/5/lessons', { title: ' AI 단서를 찾아라! ', topic: '  인공지능이란   무엇일까?\n생활 속 AI ' + 'x'.repeat(300) });
  assert.equal(r.status, 200);
  assert.equal(r.body.id, 77);
  const insert = r.queries.find(q => q.sql.startsWith('INSERT INTO lessons'));
  assert.match(insert.sql, /\(program_id, position, title, topic\)/);
  assert.equal(insert.params[2], 'AI 단서를 찾아라!');
  assert.equal(insert.params[3].length, 200);
  assert.equal(insert.params[3].slice(0, 24), '인공지능이란 무엇일까? 생활 속 AI xxx');
});

test('주제 없이 만든 차시는 빈 주제로 저장된다', async () => {
  const r = await request('POST', '/api/programs/5/lessons', { title: '나를 알아보기' });
  assert.equal(r.queries.find(q => q.sql.startsWith('INSERT INTO lessons')).params[3], '');
});

test('주제만 고치면 이름은 건드리지 않고, 빈 문자열은 주제를 지운다', async () => {
  const r = await request('PATCH', '/api/lessons/9', { topic: ' 규칙과 순서 ' });
  assert.equal(r.status, 200);
  const updates = r.queries.filter(q => q.sql.startsWith('UPDATE lessons'));
  assert.deepEqual(updates.map(q => [q.sql, q.params]), [['UPDATE lessons SET topic = $1 WHERE id = $2', ['규칙과 순서', 9]]]);
  const cleared = await request('PATCH', '/api/lessons/9', { topic: '' });
  assert.deepEqual(cleared.queries.filter(q => q.sql.startsWith('UPDATE lessons')).map(q => q.params), [['', 9]]);
  const renamed = await request('PATCH', '/api/lessons/9', { title: '새 이름' });
  assert.deepEqual(renamed.queries.filter(q => q.sql.startsWith('UPDATE lessons')).map(q => q.sql), ['UPDATE lessons SET title = $1 WHERE id = $2']);
});

test('교사는 차시 주제를 고칠 수 없다', async () => {
  const module = { exports: {} };
  const deps = {
    'node:crypto': require('node:crypto'), '../public/curriculum': require('../public/curriculum'), './password': {}, './cookies': {}, './storage': {},
    './auth': { getSessionUser: async () => ({ user: { id: 2, role: 'teacher' } }), roleLevel: r => ({ teacher: 1, admin: 2 }[r] || 0) },
    './db': { TS: c => c, ready: async () => {}, getSettings: async () => ({ site_open: true }), one: async () => { throw new Error('no db'); }, q: async () => { throw new Error('no db'); } },
  };
  vm.runInNewContext(source, { module, exports: module.exports, require: id => { if (id in deps) return deps[id]; throw new Error(id); }, process: { env: {} }, console });
  let status;
  await module.exports.handleApi({ method: 'PATCH', headers: {} }, { writeHead: s => { status = s; }, end() {} }, '/api/lessons/9', { topic: 'x' });
  assert.equal(status, 403);
});
