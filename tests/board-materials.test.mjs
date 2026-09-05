import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../lib/api.js', import.meta.url), 'utf8');
async function save({ links = [], files = [], body, user = { id: 1, role: 'teacher' } }) {
  const inserts = [];
  let deletes = 0;
  const module = { exports: {} };
  const dependencies = {
    'node:crypto': require('node:crypto'),
    './password': {}, './cookies': {}, './storage': {},
    './auth': { getSessionUser: async () => user && ({ user }), roleLevel: () => 1 },
    './db': {
      TS: column => column, ready: async () => {}, getSettings: async () => ({ site_open: true }),
      one: async () => ({ id: 16, program_id: 11, created_by: 1 }),
      q: async (sql, args) => {
        if (sql.startsWith('SELECT id FROM program_links')) return links.map(id => ({ id }));
        if (sql.startsWith('SELECT id FROM program_files')) return files.map(id => ({ id }));
        if (sql.startsWith('DELETE')) { deletes++; return []; }
        if (sql.startsWith('INSERT')) { inserts.push({ type: sql.includes("'link'") ? 'link' : 'file', id: args[1] }); return []; }
        throw new Error(sql);
      }, log: async () => {},
    },
  };
  vm.runInNewContext(source, { module, require: id => dependencies[id], process: { env: {} }, Buffer, URL });
  let status, result;
  await module.exports.handleApi({ method: 'PUT', headers: {} }, {
    writeHead(s) { status = s; }, end(s) { result = JSON.parse(s); },
  }, '/api/boards/16/items', body);
  return { status, result, inserts, deletes };
}
for (const ids of [[27, 28], ['27', '28']]) {
  test(`real handler saves numeric requests with ${typeof ids[0]} database IDs`, async () => {
    const r = await save({ links: ids, files: ['30'], body: { link_ids: [27, 28], file_ids: [30] } });
    assert.equal(r.status, 200);
    assert.equal(r.result.count, 3);
    assert.deepEqual(r.inserts, [{ type: 'link', id: '27' }, { type: 'link', id: '28' }, { type: 'file', id: '30' }]);
  });
}
test('bigint IDs retain precision and duplicates insert once', async () => {
  const id = '9007199254740993';
  const r = await save({ links: [id], body: { link_ids: [id, id] } });
  assert.equal(r.result.count, 1);
  assert.equal(r.inserts[0].id, id);
});
test('foreign-program and malformed IDs cannot be shared', async () => {
  const r = await save({ links: ['27'], body: { link_ids: ['27', 99, true, {}, -1, 1.2, '2e1', '027', '9223372036854775808', 9007199254740992] } });
  assert.equal(r.result.count, 1);
  assert.equal(r.inserts[0].id, '27');
});
test('empty selection clears sharing', async () => {
  const r = await save({ body: { link_ids: [], file_ids: [] } });
  assert.equal(r.result.count, 0);
  assert.equal(r.deletes, 1);
});
test('another teacher cannot replace sharing', async () => {
  const r = await save({ user: { id: 2, role: 'teacher' }, body: { link_ids: [27] } });
  assert.equal(r.status, 403);
  assert.equal(r.deletes, 0);
});
test('unauthenticated requests cannot replace sharing', async () => {
  const r = await save({ user: null, body: { link_ids: [27] } });
  assert.equal(r.status, 401);
  assert.equal(r.deletes, 0);
});

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
test('share UI preserves bigint IDs, restores mixed-type checks and reports actual count', async () => {
  const handlers = {};
  const msg = {};
  const el = { innerHTML: '', querySelectorAll: () => [{ dataset: { share: 'link:9007199254740993' } }] };
  let submitted;
  const context = {
    api: async (method, path, body) => {
      if (method === 'GET') return { links: [{ id: '9007199254740993', kind: 'aiapp', label: 'Activity' }], files: [{ id: 30, name: 'File', size: 0 }], sharedLinkIds: ['9007199254740993'], sharedFileIds: ['30'] };
      submitted = body;
      return { count: 0 };
    },
    document: { getElementById: id => id === 'share-msg' ? msg : (handlers[id] ??= {}) },
    esc: s => s, KIND_TAG: {},
  };
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('async function loadShareCard('), app.indexOf('/* ---- 제출 현황')), context);
  await context.loadShareCard(el, 16);
  assert.match(el.innerHTML, /data-share="file:30" checked/);
  await handlers['share-save'].onclick();
  assert.equal(submitted.link_ids[0], '9007199254740993');
  assert.match(msg.textContent, /1개 중 0개/);
  assert.equal(msg.className, 'msg err');
});
