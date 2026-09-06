import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
const db = require('../lib/db');

function response() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    end(body) { this.body = JSON.parse(body); },
  };
}

const request = { method: 'POST', headers: { origin: 'https://ai-history-ar.vercel.app' } };
const body = {
  program_ref: 'history-ai-01',
  board_code: 'bs2622',
  student_id: '2d743c29-3483-46b6-89fb-086db077367f',
  process: '실제 활동',
  source_event_id: 'history-ai-01:access-switch-test',
};

async function loadHandler({ settings = true, board = null }) {
  db.getSettings = async () => ({ site_open: settings });
  db.one = async () => board;
  db.q = async () => [];
  delete require.cache[require.resolve('../lib/career-log')];
  return require('../lib/career-log').handleCareerLogIngest;
}

test('site_open=false blocks Career Log ingest before board lookup', async () => {
  const handle = await loadHandler({ settings: false });
  const res = response();
  await handle(request, res, body);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'site_closed');
});

test('a closed board blocks Career Log ingest', async () => {
  const handle = await loadHandler({ board: { id: 1, is_open: false, published: true } });
  const res = response();
  await handle(request, res, body);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, 'board_not_open');
});

test('an unpublished program blocks Career Log ingest', async () => {
  const handle = await loadHandler({ board: { id: 1, is_open: true, published: false } });
  const res = response();
  await handle(request, res, body);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'program_not_published');
});
