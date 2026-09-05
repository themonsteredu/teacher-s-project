import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

// Execute the real dispatcher and HTTP entrypoint. Only their external DB,
// authentication and ingest dependencies are isolated; no database is opened.
function loadCommonJs(relativePath, dependencies) {
  const filename = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require(id) {
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      throw new Error(`Unexpected dependency in routing test: ${id}`);
    },
    __dirname: root,
    process: { env: {} },
    Buffer,
    URL,
    console: { log() {}, error(error) { throw error; } },
  };
  vm.runInNewContext(readFileSync(filename, 'utf8'), context, { filename });
  return module.exports;
}

async function fixture(t) {
  const apiCalls = [];
  const careerCalls = [];
  const lookups = [];
  const api = loadCommonJs('lib/api.js', {
    'node:crypto': require('node:crypto'),
    './db': {
      ready: async () => {},
      one: async (sql, params) => { lookups.push({ sql, params }); return null; },
      q: async () => { throw new Error('Unexpected database query'); },
      log: async () => {},
      getSettings: async () => ({ site_open: true }),
      TS: (column) => column,
    },
    './password': require('../lib/password'),
    './auth': { getSessionUser: async () => null },
    './cookies': require('../lib/cookies'),
    './storage': { storageEnabled: false },
  });
  let handler;
  loadCommonJs('server.js', {
    'node:http': {
      createServer(callback) {
        handler = callback;
        return { listen() {} };
      },
    },
    'node:path': require('node:path'),
    'node:fs': require('node:fs'),
    './lib/api': {
      async handleApi(req, res, pathname, body) {
        apiCalls.push({ pathname, url: req.url, method: req.method, headers: req.headers, body });
        return api.handleApi(req, res, pathname, body);
      },
    },
    './lib/career-log': {
      async handleCareerLogIngest(req, res, body) {
        careerCalls.push({ url: req.url, method: req.method, body });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ dedicatedHandler: true }));
      },
    },
  });
  assert.equal(typeof handler, 'function');
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return {
    apiCalls, careerCalls, lookups,
    async request(path, { method = 'GET', body, headers = {} } = {}) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method,
        headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
  };
}

test('Node server routing keeps API paths and the dedicated Career Log rewrite', () => {
  assert.equal(config.framework, 'node');
  assert.deepEqual(config.rewrites.filter((rule) => rule.source.startsWith('/api/')), [
    { source: '/api/career-log/ingest', destination: '/career-log-ingest' },
  ]);
  assert.equal(config.rewrites[0].source, '/api/career-log/ingest');
});

test('POST /api/login reaches the real login route instead of a rewritten 404', async (t) => {
  const f = await fixture(t);
  const body = { username: 'routing-test-user', password: 'deliberately-wrong' };
  const result = await f.request('/api/login', { method: 'POST', body });
  assert.equal(f.apiCalls[0].pathname, '/api/login');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, '아이디 또는 비밀번호가 올바르지 않습니다.');
  assert.deepEqual([...f.lookups[0].params], ['routing-test-user']);
});

test('GET /api/me reaches authentication and returns 401 without a session', async (t) => {
  const f = await fixture(t);
  const result = await f.request('/api/me');
  assert.equal(f.apiCalls[0].pathname, '/api/me');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, '로그인이 필요합니다.');
});

test('alphanumeric board join paths reach the real board access check', async (t) => {
  const f = await fixture(t);
  const result = await f.request('/api/join-board/ABCD12');
  assert.equal(f.apiCalls[0].pathname, '/api/join-board/ABCD12');
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'board_closed');
  assert.equal(f.lookups[0].params[0], 'abcd12');
});

test('nested student file routes retain every path segment', async (t) => {
  const f = await fixture(t);
  const path = '/api/join-board/ABCD12/file/27/view';
  const result = await f.request(path);
  assert.equal(f.apiCalls[0].pathname, path);
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'not_shared');
});

test('query parameters, JSON body, method and cookies survive the HTTP entrypoint', async (t) => {
  const f = await fixture(t);
  const path = '/api/boards/27?filter=recent&tag=a&tag=b&text=%ED%95%9C%EA%B8%80';
  const body = { title: '수업 라우팅 확인', is_open: false };
  const cookie = 'session=opaque-test-session; another=value';
  const result = await f.request(path, { method: 'PATCH', body, headers: { cookie, 'x-test-header': 'preserved' } });
  const observed = f.apiCalls[0];
  assert.equal(observed.pathname, '/api/boards/27');
  assert.equal(observed.url, path);
  assert.equal(observed.method, 'PATCH');
  assert.equal(observed.headers.cookie, cookie);
  assert.equal(observed.headers['x-test-header'], 'preserved');
  assert.deepEqual(JSON.parse(JSON.stringify(observed.body)), body);
  assert.equal(result.status, 401);
});

test('public and rewritten Career Log URLs both use only the dedicated handler', async (t) => {
  const f = await fixture(t);
  const body = { program_ref: 'history-ai-01' };
  for (const path of ['/api/career-log/ingest', '/career-log-ingest']) {
    const result = await f.request(path, { method: 'POST', body });
    assert.equal(result.status, 200);
    assert.equal(result.body.dedicatedHandler, true);
  }
  assert.equal(f.apiCalls.length, 0);
  assert.equal(f.careerCalls.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(f.careerCalls[0].body)), body);
});

test('unknown API paths still return the real dispatcher 404', async (t) => {
  const f = await fixture(t);
  const result = await f.request('/api/does-not-exist/nested');
  assert.equal(result.status, 404);
  assert.equal(result.body.error, '찾을 수 없습니다.');
});

test('direct /api/index and forged path queries cannot impersonate an API route', async (t) => {
  const f = await fixture(t);
  for (const path of ['/api/index', '/api/index?__api_path=me', '/api/index?__api_path=login&__api_path=career-log%2Fingest']) {
    const result = await f.request(path);
    assert.equal(result.status, 404);
    assert.equal(result.body.error, '찾을 수 없습니다.');
    assert.equal(f.apiCalls.at(-1).pathname, '/api/index');
  }
  const forgedLogin = await f.request('/api/index?__api_path=login', {
    method: 'POST', body: { username: 'routing-test-user', password: 'deliberately-wrong' },
  });
  assert.equal(forgedLogin.status, 404);
  assert.equal(f.lookups.length, 0);
  assert.equal(f.careerCalls.length, 0);
});

test('a forged path query cannot change a real API route or its HTTP method', async (t) => {
  const f = await fixture(t);
  const result = await f.request('/api/me?__api_path=login');
  assert.equal(f.apiCalls[0].pathname, '/api/me');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, '로그인이 필요합니다.');
  const wrongMethod = await f.request('/api/login?__api_path=me');
  assert.equal(wrongMethod.status, 404);
});
