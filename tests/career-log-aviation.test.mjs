import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.CAREER_LOG_INGEST_URL = 'https://central.example/functions/v1/career-log-ingest';
const db = require('../lib/db');
const accounts = require('../lib/student-accounts/http');
const { originAllowed, resolveIntegration } = require('../lib/career-log-integrations');
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/aviation-submissions.json', import.meta.url), 'utf8'));
const body = (index = 0) => structuredClone(fixtures[index]);
const origin = 'https://drone-six-smoky.vercel.app';
const request = { method: 'POST', headers: { origin, 'x-vercel-oidc-token': 'runtime-oidc-test' } };
const recordId = '22222222-2222-4222-8222-222222222222';
const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(raw) { this.body = raw ? JSON.parse(raw) : null; } });

function handler({ open = true, boardOpen = true, published = true, links = [{ url: origin }] } = {}) {
  db.getSettings = async () => ({ site_open: open });
  db.one = async sql => sql.includes('SELECT value FROM settings')
    ? {value:JSON.stringify({career:{enabled:true,schoolId:'33333333-3333-4333-8333-333333333333'}})}
    : { id: 42, program_id: 8, is_open: boardOpen, published, class_date: '2026-09-06' };
  accounts.authorizeStudent = async () => ({careerStudentId:fixtures[0].student_id});
  db.q = async () => links;
  delete require.cache[require.resolve('../lib/career-log')];
  return require('../lib/career-log').handleCareerLogIngest;
}

test('drone origins and assigned links reject suffix spoofing and cross-program access', () => {
  const integration = resolveIntegration('aviation-mobility-01');
  for (const allowed of [origin, 'https://drone-preview123-themonsteredu.vercel.app']) {
    assert.equal(originAllowed(allowed, integration), true);
    assert.equal(integration.linkMatches({ url: `${allowed}/?mode=flight` }), true);
  }
  for (const denied of ['https://drone-six-smoky.vercel.app.evil.example', 'https://evil.example/?app=drone-six-smoky.vercel.app', 'https://ai-history-ar.vercel.app', 'http://drone-six-smoky.vercel.app', 'https://drone-preview-anotherteam.vercel.app']) {
    assert.equal(originAllowed(denied, integration), false);
    assert.equal(integration.linkMatches({ url: denied, label: '항공모빌리티 드론' }), false);
  }
});

test('Hub launch carries the existing student and board only to recognized apps', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const source = app.slice(app.indexOf('function careerMaterialUrl('), app.indexOf('\nfunction ', app.indexOf('function careerMaterialUrl(') + 1));
  const launch = runInNewContext(`(${source}\n)`, { URL, location: { origin: 'https://hub.moakit.ai' } });
  const linked = new URL(launch({ kind: 'aiapp', url: `${origin}/?view=flight` }, 'ab1234', fixtures[0].student_id));
  assert.equal(linked.searchParams.get('hub_code'), 'ab1234');
  assert.equal(linked.searchParams.get('student_id'), fixtures[0].student_id);
  assert.equal(linked.searchParams.get('view'), 'flight');
  const unrelated = 'https://evil.example/?app=drone-six-smoky.vercel.app';
  assert.equal(launch({ kind: 'aiapp', url: unrelated }, 'ab1234', fixtures[0].student_id), unrelated);
});

test('aviation respects site/board/program switches and the exact assigned board link', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not reach Edge'); });
  for (const [options, error] of [[{ open: false }, 'site_closed'], [{ boardOpen: false }, 'board_not_open'], [{ published: false }, 'program_not_published'], [{ links: [{ url: 'https://ai-history-ar.vercel.app' }] }, 'career_program_not_assigned']]) {
    const res = response();
    await handler(options)(request, res, body());
    assert.equal(res.body.error, error);
  }
  const res = response();
  await handler()({ ...request, headers: { origin: 'https://hub.moakit.ai' } }, res, body());
  assert.equal(res.statusCode, 403);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('both real drone payloads reach Edge with server-derived session and unverified status', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://central.example/functions/v1/career-log-ingest');
    assert.equal(options.headers.Authorization, 'Bearer runtime-oidc-test');
    const payload = JSON.parse(options.body);
    assert.equal(payload.session_ref, 'hub-board:42');
    assert.equal(payload.raw_data.hub.board_id, 42);
    assert.equal(payload.verification_status, null);
    assert.equal(payload.supersedes_id, null);
    assert.equal(payload.source, 'hub');
    assert.equal(payload.program_ref, 'aviation-mobility-01');
    return Response.json({ ok: true, duplicate: false, record_id: recordId, student_id: payload.student_id }, { status: 201 });
  });
  for (const fixture of fixtures) {
    const res = response();
    await handler()(request, res, { ...fixture, session_ref: 'hub-board:999', verification_status: 'verified' });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.record_id, recordId);
    assert.equal(res.headers['Access-Control-Allow-Origin'], origin);
  }
});

test('practice, unfinished flights, missing checks and mismatched attempt context never reach storage', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not reach Edge'); });
  const invalid = [
    value => { value.raw_data.record.practice = true; },
    value => { value.raw_data.record.outcome.status = 'ACTIVE'; },
    value => { value.raw_data.record.preflight[0].checked = false; },
    value => { value.raw_data.record.plan.reason = ' '; },
    value => { value.raw_data.record.plan.id = 'search-sweep'; },
    value => { value.raw_data.record.outcome.elapsedSeconds = 10; },
    value => { value.raw_data.record.result.totalScore = 200; },
    value => { value.source_event_id = value.source_event_id.replace('ab1234', 'cd3456'); },
    value => { value.student_id = recordId; },
    value => { value.raw_data = null; },
  ];
  for (const change of invalid) {
    const value = body(); change(value);
    const res = response();
    await handler()(request, res, value);
    assert.equal(res.statusCode, value.student_id !== fixtures[0].student_id ? 409 : 400);
    assert.equal(res.body.error, value.student_id !== fixtures[0].student_id ? 'student_identity_mismatch' : 'invalid_career_record');
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('no runtime OIDC fails closed; upstream errors and duplicate receipts are preserved', async t => {
  let upstream = Response.json({ error: 'storage_unavailable' }, { status: 503 });
  t.mock.method(globalThis, 'fetch', async () => upstream);
  const noOidc = response();
  await handler()({ ...request, headers: { origin } }, noOidc, body());
  assert.equal(noOidc.statusCode, 503);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
  const unavailable = response();
  await handler()(request, unavailable, body());
  assert.equal(unavailable.statusCode, 503);
  upstream = Response.json({ ok: true, duplicate: true, record_id: recordId, student_id: fixtures[0].student_id });
  const duplicate = response();
  await handler()(request, duplicate, body());
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(duplicate.body.record_id, recordId);
});
