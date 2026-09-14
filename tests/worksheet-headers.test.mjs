import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createWorksheetHeaders, normalize, BUILTIN } = require('../lib/worksheet-headers');

function memoryDb() {
  const rows = new Map();
  return {
    rows,
    async q(sql, params = []) {
      if (sql.startsWith('SELECT')) return [...rows].filter(([k]) => k.startsWith('ws:school:')).sort().map(([key, value]) => ({ key, value }));
      if (sql.startsWith('INSERT')) { rows.set(params[0], params[1]); return []; }
      if (sql.startsWith('DELETE')) { rows.delete(params[0]); return []; }
      throw new Error('unexpected sql ' + sql);
    },
    async one(sql, params) { const v = rows.get(params[0]); return v === undefined ? null : { key: params[0], value: v }; },
  };
}

test('normalize: 학교 코드·이름을 검증하고 문구를 정리한다', () => {
  assert.equal(normalize('Boseong', { name: '보성초' }).error.includes('학교 코드'), true);
  assert.equal(normalize('boseong', { name: '  ' }).error, '학교 이름을 입력하세요.');
  const ok = normalize('boseong', { name: ' 보성초등학교 ', left: '2026.AI연구학교', right: '보성초등학교(3학년) ', logo: '/lessons/_shared/schools/boseong-logo.png' });
  assert.deepEqual(ok.value, { slug: 'boseong', name: '보성초등학교', left: '2026.AI연구학교', right: '보성초등학교(3학년)', title: '보성초등학교 활동지', logo: '/lessons/_shared/schools/boseong-logo.png', note: '' });
  // 로고는 data URL 이미지 또는 /lessons/ 경로만
  assert.match(normalize('a1', { name: 'x', logo: 'https://evil.example/x.png' }).error, /이미지 파일/);
  assert.match(normalize('a1', { name: 'x', logo: 'data:text/html;base64,AAAA' }).error, /이미지 파일/);
  assert.equal(normalize('a1', { name: 'x', logo: 'data:image/png;base64,iVBORw0KGgo=' }).error, undefined);
  assert.match(normalize('a1', { name: 'x', logo: 'data:image/png;base64,' + 'A'.repeat(700 * 1024) }).error, /너무 큽니다/);
});

test('내장 학교(보성초)는 저장 없이도 나오고, 저장하면 DB 값이 우선한다', async () => {
  const db = memoryDb();
  const wh = createWorksheetHeaders(db);
  const before = await wh.list();
  assert.equal(before.length, BUILTIN.length);
  assert.equal(before[0].slug, 'boseong');
  assert.equal(before[0].builtin, true);
  assert.equal((await wh.get('boseong')).left, '2026.AI연구학교');
  assert.equal(await wh.get('nope'), null);
  assert.equal(await wh.get('BAD SLUG'), null);

  const saved = await wh.save('boseong', { name: '보성초등학교', left: '2027.AI연구학교', right: '보성초등학교(4학년)', logo: '' });
  assert.equal(saved.value.left, '2027.AI연구학교');
  assert.equal(saved.value.saved, true);
  assert.equal(saved.value.builtin, true);
  assert.equal((await wh.get('boseong')).right, '보성초등학교(4학년)');
  assert.equal(db.rows.has('ws:school:boseong'), true);

  const added = await wh.save('moa-middle', { name: '모아중학교', title: 'AI 융합 활동지' });
  assert.equal(added.value.title, 'AI 융합 활동지');
  const list = await wh.list();
  assert.deepEqual(list.map(s => s.slug), ['모아중학교', '보성초등학교'].map(n => list.find(s => s.name === n).slug));
  assert.equal(list.length, 2);

  // 잘못된 값은 저장하지 않는다
  assert.equal((await wh.save('moa-middle', { name: '' })).error, '학교 이름을 입력하세요.');
  assert.equal((await wh.save('x y', { name: 'x' })).error.includes('학교 코드'), true);

  // 삭제: 내장 학교는 기본값으로 돌아간다
  await wh.remove('boseong');
  assert.equal((await wh.get('boseong')).left, '2026.AI연구학교');
  await wh.remove('moa-middle');
  assert.equal(await wh.get('moa-middle'), null);
  assert.equal((await wh.list()).length, 1);
});

test('DB에 깨진 JSON이 있어도 목록은 살아 있다', async () => {
  const db = memoryDb();
  db.rows.set('ws:school:broken', '{not json');
  db.rows.set('ws:school:bad-name', JSON.stringify({ name: '' }));
  const wh = createWorksheetHeaders(db);
  assert.equal((await wh.list()).length, BUILTIN.length);
  assert.equal(await wh.get('broken'), null);
});
