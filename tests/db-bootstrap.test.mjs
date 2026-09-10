import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../lib/db.js', import.meta.url), 'utf8');

// 콜드스타트 부트스트랩: pool.query에 들어오는 SQL을 종류별로 기록하고, 시나리오에 맞는 행을 돌려준다.
function db({ fresh = false, mark = null, admins = 1, seedFails = false } = {}) {
  const trace = [], module = { exports: {} };
  let savedMark = null;
  const kind = (sql, params = []) => {
    if (/AS mark,/.test(sql)) return 'probe';
    if (/CREATE TABLE IF NOT EXISTS users/.test(sql)) return 'schema';
    if (/ADD COLUMN IF NOT EXISTS downloadable/.test(sql)) return 'migrations';
    if (/count\(\*\)::int AS c FROM users/.test(sql)) return 'admin-count';
    if (/INSERT INTO users/.test(sql)) return 'seed-admin';
    if (/INSERT INTO settings/.test(sql)) return params[0] === 'sys:bootstrap' ? 'mark' : `default:${params[0]}`;
    return sql;
  };
  class Pool {
    async query(sql, params = []) {
      const k = kind(sql, params);
      trace.push(k);
      if (k === 'probe') {
        if (fresh) throw new Error('relation "settings" does not exist');
        return { rows: [{ mark, admins }] };
      }
      if (k === 'admin-count') return { rows: [{ c: admins }] };
      if (k === 'mark') savedMark = params[1];
      return { rows: [] };
    }
  }
  const curriculum = {
    CURRICULUM: [{ slug: 'x', title: 'x', lessons: [] }],
    seedCurriculum: async () => { trace.push('seed'); if (seedFails) throw new Error('seed failed'); },
  };
  vm.runInNewContext(source, {
    module,
    require: id => id === 'pg' ? { Pool } : id === './password' ? { hashPassword: () => 'salt:hash' } : id === './curriculum' ? curriculum : null,
    process: { env: { DATABASE_URL: 'postgresql://test@localhost/test' } },
    console: { log() {}, error() {} },
  });
  return { api: module.exports, trace, savedMark: () => savedMark };
}

const FULL = ['schema', 'migrations', 'admin-count', 'default:site_open', 'default:site_notice', 'seed', 'mark'];

test('a fresh database runs the whole bootstrap, seeds the admin and records the fingerprint', async () => {
  const d = db({ fresh: true, admins: 0 });
  await d.api.ready();
  assert.deepEqual(d.trace, ['probe', 'schema', 'migrations', 'admin-count', 'seed-admin', 'default:site_open', 'default:site_notice', 'seed', 'mark']);
  assert.match(d.savedMark(), /^\d+-[0-9a-f]+$/);
});

test('an initialized database with the current fingerprint costs a single round trip and skips seeding', async () => {
  const mark = (async () => { const d = db({ fresh: true, admins: 0 }); await d.api.ready(); return d.savedMark(); })();
  const d = db({ mark: await mark, admins: 1 });
  await d.api.ready();
  await d.api.ready(); // 인스턴스 안에서는 메모이즈
  assert.deepEqual(d.trace, ['probe']);
});

test('a stale fingerprint reruns schema and seeds once, without recreating an existing admin', async () => {
  const d = db({ mark: 'old-fingerprint', admins: 1 });
  await d.api.ready();
  assert.deepEqual(d.trace, ['probe', ...FULL]);
});

test('a missing admin account forces the full path even when the fingerprint matches', async () => {
  const probe = db({ fresh: true, admins: 0 }); await probe.api.ready();
  const d = db({ mark: probe.savedMark(), admins: 0 });
  await d.api.ready();
  assert.ok(d.trace.includes('seed-admin'));
  assert.equal(d.trace.at(-1), 'mark');
});

test('a failed curriculum seed keeps the server booting but leaves no fingerprint so the next cold start retries', async () => {
  const d = db({ fresh: true, admins: 0, seedFails: true });
  await d.api.ready();
  assert.ok(d.trace.includes('seed'));
  assert.ok(!d.trace.includes('mark'));
});

test('bootstrap fingerprint never reaches the frontend settings payload', () => {
  // getSettings()의 SELECT가 sys: 접두사를 걸러야 프런트 settings에 지문이 섞이지 않는다
  assert.match(source, /SELECT key, value FROM settings WHERE[^"]*left\(key,4\) <> 'sys:'/);
});
