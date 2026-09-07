import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../lib/api.js', import.meta.url), 'utf8');

async function request(role = 'admin', { settings, path = '/api/programs', siteOpen = true, programs = [
  { id: 1, title: '실제 수업', published: true, lesson_count: 10 },
  { id: 2, title: '준비 중인 수업', published: false, lesson_count: 1 },
] } = {}) {
  const queries = [], module = { exports: {} };
  const saved = settings || [
    { key: 'course_plan:1', value: JSON.stringify({ published: false, plan: { variants: [10, 5, 3].map(n => ({ name: `${n}차시 구성`, sessions: Array.from({ length: n }, () => ({ reflection: 'PRIVATE', assets: {} })) })) } }) },
    { key: 'course_plan:2', value: JSON.stringify({ published: true, plan: { variants: [{ name: '단독', sessions: [{}] }] } }) },
  ];
  const deps = {
    'node:crypto': require('node:crypto'), '../public/curriculum': require('../public/curriculum'), './password': {}, './cookies': {}, './storage': {},
    './auth': { getSessionUser: async () => role ? { user: { id: 1, role } } : null, roleLevel: r => ({ teacher: 1, admin: 2 }[r] || 0) },
    './db': {
      TS: c => c, ready: async () => {}, getSettings: async () => ({ site_open: siteOpen }),
      one: async (sql, params) => {
        queries.push({ sql, params });
        if (sql.includes('FROM programs p')) return programs.find(p => p.id === params[0]) || null;
        if (sql === 'SELECT value FROM settings WHERE key=$1') return saved.find(s => s.key === params[0]) || null;
        throw new Error(`Unexpected database access: ${sql}`);
      },
      q: async (sql, params) => {
        queries.push({ sql, params });
        if (sql.includes('FROM programs p')) return sql.includes('WHERE p.published = true') ? programs.filter(p => p.published) : programs;
        if (sql === 'SELECT key,value FROM settings WHERE key = ANY($1::text[])') return saved.filter(s => params[0].includes(s.key));
        if (/FROM (program_links|program_files|lessons|boards b) WHERE/.test(sql)) return [];
        throw new Error(`Unexpected database access: ${sql}`);
      },
    },
  };
  vm.runInNewContext(source, { module, exports: module.exports, require: id => { if (id in deps) return deps[id]; throw new Error(id); }, process: { env: {} }, console });
  let status, body;
  await module.exports.handleApi({ method: 'GET', headers: {} }, { writeHead: s => { status = s; }, end: text => { body = JSON.parse(text); } }, path, null);
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

test('teacher list preserves publication scope and never returns draft summaries', async () => {
  const r = await request('teacher');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.programs.map(p => p.id), [1]);
  assert.equal(r.queries.length, 2);
  assert.deepEqual(Array.from(r.queries[1].params[0]), ['course_plan:1']);
  assert.equal('courseSummary' in r.body.programs[0], false);
  assert.match(r.queries[0].sql, /WHERE p.published = true/);
});

test('classification is returned only from permitted saved plans, never from a teacher-invisible draft', async () => {
  const curriculum = { links: [{ school: 'elementary', grade: 2, subject: '국어' }], topic: '이야기 만들기', purpose: 'teaching' };
  const value = published => JSON.stringify({ published, plan: { curriculum, variants: [{ name: '전체 과정', sessions: [{}] }] } });
  const settings = [{ key: 'course_plan:1', value: value(false) }];
  const draftAdmin = await request('admin', { settings });
  assert.deepEqual(draftAdmin.body.programs[0].curriculum, curriculum);
  const draftTeacher = await request('teacher', { settings });
  assert.equal(Object.hasOwn(draftTeacher.body.programs[0], 'curriculum'), false);
  assert.doesNotMatch(JSON.stringify(draftTeacher.body), /이야기 만들기|국어|전체 과정/);
  settings[0].value = value(true);
  const publishedTeacher = await request('teacher', { settings });
  assert.deepEqual(publishedTeacher.body.programs[0].curriculum, curriculum);
  assert.equal(Object.hasOwn(publishedTeacher.body.programs[0], 'courseSummary'), false);
  assert.equal(publishedTeacher.queries.length, 2);
});

test('an explicit cleared classification overrides legacy grade while omitted metadata preserves fallback', async () => {
  const curriculum = { links: [], topic: '', purpose: 'teaching' };
  const result = await request('admin', { programs: [{ id: 1, grade: '초2', published: true }, { id: 2, grade: '초3', published: true }], settings: [
    { key: 'course_plan:1', value: JSON.stringify({ published: true, plan: { curriculum, variants: [{ sessions: [{}] }] } }) },
  ] });
  const C = require('../public/curriculum');
  assert.deepEqual(result.body.programs[0].curriculum, curriculum);
  assert.deepEqual(C.forProgram(result.body.programs[0]).links, []);
  assert.equal(Object.hasOwn(result.body.programs[1], 'curriculum'), false);
  assert.equal(C.forProgram(result.body.programs[1]).links[0].grade, 3);
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

test('detail classification follows the same publication scope as the list and retains board ownership filters', async () => {
  const curriculum = { links: [{ school: 'middle', grade: 2, subject: '정보' }], topic: '자료 탐구', purpose: 'teaching' };
  const settings = [{ key: 'course_plan:1', value: JSON.stringify({ published: true, plan: { curriculum, variants: [{ sessions: [{}] }] } }) }];
  const published = await request('teacher', { settings, path: '/api/programs/1' });
  assert.equal(published.status, 200);
  assert.deepEqual(published.body.program.curriculum, curriculum);
  const reads = published.queries.filter(q => q.sql.includes('FROM settings'));
  assert.equal(reads.length, 1);
  assert.deepEqual(Array.from(reads[0].params), ['course_plan:1']);
  const boardRead = published.queries.find(q => q.sql.includes('FROM boards b'));
  assert.match(boardRead.sql, /AND b.created_by = \$2/);
  assert.deepEqual(Array.from(boardRead.params), [1, 1]);
  assert.equal('plan' in published.body, false);
  settings[0].value = JSON.stringify({ published: false, plan: { curriculum, variants: [{ sessions: [{}] }] } });
  const draftTeacher = await request('teacher', { settings, path: '/api/programs/1' });
  assert.equal(Object.hasOwn(draftTeacher.body.program, 'curriculum'), false);
  assert.doesNotMatch(JSON.stringify(draftTeacher.body), /자료 탐구|정보/);
  const draftAdmin = await request('admin', { settings, path: '/api/programs/1' });
  assert.deepEqual(draftAdmin.body.program.curriculum, curriculum);
});

test('detail denial happens before reading classification or program materials', async () => {
  for (const [role, options, status, queryCount] of [
    ['teacher', { path: '/api/programs/2' }, 403, 1],
    ['teacher', { path: '/api/programs/1', siteOpen: false }, 403, 0],
    [null, { path: '/api/programs/1' }, 401, 0],
    ['admin', { path: '/api/programs/99' }, 404, 1],
  ]) {
    const r = await request(role, options);
    assert.equal(r.status, status);
    assert.equal(r.queries.length, queryCount);
    assert.equal(r.queries.some(q => q.sql.includes('FROM settings')), false);
  }
});

test('detail legacy omission and explicit empty classification match list behavior', async () => {
  const programs = [{ id: 1, grade: '초2', published: true }], path = '/api/programs/1';
  const legacy = await request('teacher', { programs, path, settings: [] });
  assert.equal(Object.hasOwn(legacy.body.program, 'curriculum'), false);
  const curriculum = { links: [], topic: '', purpose: 'teaching' };
  const cleared = await request('teacher', { programs, path, settings: [{ key: 'course_plan:1', value: JSON.stringify({ published: true, plan: { curriculum } }) }] });
  assert.deepEqual(cleared.body.program.curriculum, curriculum);
});
