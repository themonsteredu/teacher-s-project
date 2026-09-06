import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../lib/api.js', import.meta.url), 'utf8');

async function request(role = 'admin', { settings, programs = [
  { id: 1, title: '실제 수업', published: true, lesson_count: 10 },
  { id: 2, title: '준비 중인 수업', published: false, lesson_count: 1 },
] } = {}) {
  const queries = [], module = { exports: {} };
  const saved = settings || [
    { key: 'course_plan:1', value: JSON.stringify({ published: false, plan: { variants: [10, 5, 3].map(n => ({ name: `${n}차시 구성`, sessions: Array.from({ length: n }, () => ({ reflection: 'PRIVATE', assets: {} })) })) } }) },
    { key: 'course_plan:2', value: JSON.stringify({ published: true, plan: { variants: [{ name: '단독', sessions: [{}] }] } }) },
  ];
  const deps = {
    'node:crypto': require('node:crypto'), './password': {}, './cookies': {}, './storage': {},
    './auth': { getSessionUser: async () => role ? { user: { id: 1, role } } : null, roleLevel: r => ({ teacher: 1, admin: 2 }[r] || 0) },
    './db': {
      TS: c => c, ready: async () => {}, getSettings: async () => ({ site_open: true }),
      q: async (sql, params) => {
        queries.push({ sql, params });
        if (sql.includes('FROM programs p')) return sql.includes('WHERE p.published = true') ? programs.filter(p => p.published) : programs;
        if (sql === 'SELECT key,value FROM settings WHERE key = ANY($1::text[])') return saved.filter(s => params[0].includes(s.key));
        throw new Error(`Unexpected database access: ${sql}`);
      },
    },
  };
  vm.runInNewContext(source, { module, exports: module.exports, require: id => { if (id in deps) return deps[id]; throw new Error(id); }, process: { env: {} }, console });
  let status, body;
  await module.exports.handleApi({ method: 'GET', headers: {} }, { writeHead: s => { status = s; }, end: text => { body = JSON.parse(text); } }, '/api/programs', null);
  return { status, body, queries };
}

test('admin list summarizes actual configurations in one bounded read without exposing their contents', async () => {
  const r = await request();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.programs[0].courseSummary, { status: 'draft', variants: [{ name: '10차시 구성', lessonCount: 10 }, { name: '5차시 구성', lessonCount: 5 }, { name: '3차시 구성', lessonCount: 3 }] });
  assert.equal(r.body.programs[1].courseSummary.variants[0].lessonCount, 1);
  assert.equal(r.queries.length, 2);
  assert.deepEqual(Array.from(r.queries[1].params[0]), ['course_plan:1', 'course_plan:2']);
  assert.doesNotMatch(JSON.stringify(r.body), /PRIVATE|reflection|assets|sessions/);
  assert.ok(r.queries.every(q => q.sql.trim().startsWith('SELECT')));
});

test('teacher list preserves publication scope and never reads or returns draft summaries', async () => {
  const r = await request('teacher');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.programs.map(p => p.id), [1]);
  assert.equal(r.queries.length, 1);
  assert.equal('courseSummary' in r.body.programs[0], false);
  assert.match(r.queries[0].sql, /WHERE p.published = true/);
});

test('missing and malformed configurations remain distinguishable without breaking the list', async () => {
  const missing = await request('admin', { settings: [] });
  assert.equal(missing.body.programs[0].courseSummary.status, 'none');
  for (const value of ['{', JSON.stringify({ plan: { variants: [] } }), JSON.stringify({ plan: { variants: [{ sessions: null }] } })]) {
    const r = await request('admin', { settings: [{ key: 'course_plan:1', value }] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.programs[0].courseSummary, { status: 'invalid', variants: [] });
    assert.equal(r.body.programs[1].courseSummary.status, 'none');
  }
});

test('unauthenticated and empty-list requests do not query configuration data', async () => {
  const denied = await request(null);
  assert.equal(denied.status, 401);
  assert.equal(denied.queries.length, 0);
  const empty = await request('admin', { programs: [] });
  assert.deepEqual(empty.body.programs, []);
  assert.equal(empty.queries.length, 1);
});
