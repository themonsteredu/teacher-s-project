import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// 내 수업 — 반별로 묶기. 한 반(보성초 2학년 3반)이 프로그램마다 수업을 따로 열고, 수업마다 참여 코드가 다르다.
// 반 정보는 settings 의 sb:class:<보드> 에 둔다(전환 모드에서는 boards 에 칸을 늘릴 수 없다).
// 다른 학교의 2학년 3반과 섞이지 않게 묶음 열쇠에 학교가 들어간다.
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../lib/api.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const OWNER = 3, STRANGER = 9;

function harness({ role = 'teacher', userId = OWNER, academy = null, settings: initial = {}, boards: boardRows = null } = {}) {
  const settings = new Map(Object.entries(initial));
  const seen = { sql: [], writes: [], deletes: [], purge: [], inserts: [] };
  const program = { id: 5, title: 'AI 교재 2학년', published: true };
  const board = { id: 16, program_id: 5, title: '2학년 3반 · AI 교재 2학년', code: 'bs23a', created_by: OWNER, is_open: true, class_date: null, roster: '', created_at: 'x' };
  const listRows = boardRows || [
    { ...board, program_title: program.title, program_published: true, teacher_name: '김선생', post_count: 0, item_count: 0 },
    { ...board, id: 17, code: 'bs23b', title: '과학 진로', program_id: 6, program_title: '과학 진로', program_published: true, teacher_name: '김선생', post_count: 0, item_count: 0 },
  ];
  const db = {
    ACADEMY_ID: academy, TS: (c) => c, ready: async () => {}, getSettings: async () => ({ site_open: true }), log: async () => {},
    one: async (sql, args) => {
      seen.sql.push(sql);
      if (/FROM settings WHERE key ?= ?\$1/.test(sql)) { const v = settings.get(args[0]); return v === undefined ? null : { value: v }; }
      if (sql.startsWith('SELECT * FROM programs')) return program;
      if (sql.startsWith('SELECT id FROM boards WHERE code')) return null;
      if (sql.startsWith('INSERT INTO boards')) { seen.inserts.push(args); return { ...board, id: 31, title: args[1], code: args[2] }; }
      if (sql.startsWith('SELECT * FROM boards')) return board;
      if (sql.startsWith('SELECT id FROM boards WHERE id=$1 FOR UPDATE')) return { id: board.id };
      if (sql.startsWith('WITH career_posts')) return { pending: 0 };
      throw new Error(sql);
    },
    q: async (sql, args) => {
      seen.sql.push(sql);
      if (sql.startsWith('INSERT INTO settings')) { seen.writes.push({ sql, args }); settings.set(args[0], args[1]); return []; }
      if (sql.startsWith('DELETE FROM settings WHERE key = $1')) { seen.deletes.push(args[0]); settings.delete(args[0]); return []; }
      if (sql.startsWith('DELETE FROM settings')) { seen.purge.push({ sql, args }); return []; }
      if (/^(UPDATE|DELETE) /.test(sql)) return [];
      if (sql.includes("LIKE 'sb:viewers:%'")) return [];
      if (sql.includes('FROM boards b JOIN programs p')) return listRows;
      if (sql.startsWith('SELECT board_id, student_name')) return [];
      if (sql.includes('FROM settings WHERE key=ANY')) return args[0].filter((k) => settings.has(k)).map((key) => ({ key, value: settings.get(key) }));
      if (sql.includes('FROM board_posts')) return [];
      throw new Error(sql);
    },
  };
  db.transaction = async (fn) => fn(db);
  const deps = {
    'node:crypto': require('node:crypto'), './db': db, './password': {}, './cookies': {},
    './worksheet-headers': require('../lib/worksheet-headers'), './student-board': require('../lib/student-board'),
    './auth': { getSessionUser: async () => ({ user: { id: userId, role } }), roleLevel: (r) => (r === 'admin' ? 2 : 1) },
    './storage': { storageEnabled: false },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, require: (id) => { if (!(id in deps)) throw new Error(`Unexpected module ${id}`); return deps[id]; }, process: { env: {} }, Buffer, URL });
  return {
    seen, settings,
    async call(method, path, body = {}) {
      let status, result;
      await module.exports.handleApi({ method, headers: { host: 'hub.test', origin: 'https://hub.test' } },
        { setHeader() {}, writeHead(s) { status = s; }, end(v) { result = v ? JSON.parse(v) : null; } }, path, body);
      return { status, result };
    },
  };
}

test('새 수업: 이름을 비우고 학년·반만 고르면 이름이 붙고 반 정보는 sb:class 에 정리돼 남는다', async () => {
  const h = harness();
  const { status, result } = await h.call('POST', '/api/programs/5/boards', { school: '  보성초   ', grade: '2학년', room: '3반', code: 'bs23a' });
  assert.equal(status, 200);
  assert.equal(result.id, 31);
  assert.equal(result.classSaved, undefined, '저장이 되면 따로 알리지 않는다');
  assert.equal(h.seen.inserts[0][1], '2학년 3반 · AI 교재 2학년', '자동 이름에는 학교를 넣지 않는다');
  assert.deepEqual(JSON.parse(h.settings.get('sb:class:31')), { school: '보성초', grade: 2, room: '3' });
  assert.match(h.seen.writes[0].sql, /ON CONFLICT/, '일반 모드는 upsert');
});

test('전환 모드(ACADEMY_ID)에서는 settings 뷰라 ON CONFLICT 없이 넣는다', async () => {
  const h = harness({ academy: 'academy-1' });
  await h.call('POST', '/api/programs/5/boards', { grade: 2, room: '3' });
  assert.equal(h.seen.writes.length, 1);
  assert.doesNotMatch(h.seen.writes[0].sql, /ON CONFLICT/);
  assert.equal(h.seen.writes[0].args[0], 'sb:class:31');
});

test('반 정보 정리: 학년은 1~6만, 학교 40자·반 10자, 반 끝의 "반"은 뗀다', async () => {
  const cases = [
    [{ title: 'x', grade: '초2', room: '사랑반' }, { school: '', grade: 2, room: '사랑' }],
    [{ title: 'x', grade: 7, room: '12345678901234반', school: '가'.repeat(50) }, { school: '가'.repeat(40), grade: null, room: '1234567890' }],
    [{ title: 'x', grade: '  4 학년 ', room: ' 1 반 ', school: '보성\n초' }, { school: '보성 초', grade: 4, room: '1' }],
    [{ title: 'x', grade: '2.5', room: '반' , school: '○○초' }, { school: '○○초', grade: null, room: '' }],
  ];
  for (const [body, expected] of cases) {
    const h = harness();
    await h.call('POST', '/api/programs/5/boards', body);
    assert.deepEqual(JSON.parse(h.settings.get('sb:class:31')), expected, JSON.stringify(body));
  }
});

test('이름도 학년·반도 없으면 예전처럼 400 이고 아무것도 만들지 않는다', async () => {
  const h = harness();
  const { status, result } = await h.call('POST', '/api/programs/5/boards', { school: '보성초' });
  assert.equal(status, 400);
  assert.match(result.error, /학년·반/);
  assert.equal(h.seen.inserts.length, 0);
  assert.equal(h.seen.writes.length, 0);
});

test('이름만 주고 반을 안 고르면 sb:class 줄을 만들지 않는다', async () => {
  const h = harness();
  await h.call('POST', '/api/programs/5/boards', { title: '분수의 덧셈', grade: '', room: '  ' });
  assert.equal(h.seen.inserts[0][1], '분수의 덧셈');
  assert.equal(h.seen.writes.length, 0);
  assert.equal(h.seen.deletes.length, 0);
});

test('반 정보 저장이 실패해도 수업은 열리고 화면에 알린다(같은 수업을 또 만들지 않게)', async () => {
  const h = harness();
  h.settings.set = () => { throw new Error('settings down'); }; // sb:class 쓰기만 실패
  const { status, result } = await h.call('POST', '/api/programs/5/boards', { grade: 2, room: 3 });
  assert.equal(status, 200);
  assert.equal(result.id, 31);
  assert.equal(result.classSaved, false);
  assert.equal(h.seen.inserts.length, 1);
});

test('수업 정보 수정: 보낸 칸만 바꾸고, 세 칸을 모두 비우면 줄을 지운다', async () => {
  const saved = { 'sb:class:16': JSON.stringify({ school: '보성초', grade: 2, room: '3' }) };
  const h = harness({ settings: saved });
  const r = await h.call('PATCH', '/api/boards/16', { room: '4반' });
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(h.settings.get('sb:class:16')), { school: '보성초', grade: 2, room: '4' }, '학교·학년은 그대로');
  const cleared = await h.call('PATCH', '/api/boards/16', { school: '', grade: null, room: '' });
  assert.equal(cleared.status, 200);
  assert.deepEqual(h.seen.deletes, ['sb:class:16']);
  assert.equal(h.settings.has('sb:class:16'), false);
});

test('반 칸이 없는 PATCH(마감 등)는 반 정보를 건드리지 않는다', async () => {
  const h = harness({ settings: { 'sb:class:16': JSON.stringify({ school: '보성초', grade: 2, room: '3' }) } });
  await h.call('PATCH', '/api/boards/16', { is_open: false });
  assert.equal(h.seen.writes.length, 0);
  assert.equal(h.seen.deletes.length, 0);
});

test('남의 수업 반 정보는 고칠 수 없다', async () => {
  const h = harness({ userId: STRANGER });
  const r = await h.call('PATCH', '/api/boards/16', { school: '○○초', grade: 2, room: '3' });
  assert.equal(r.status, 403);
  assert.equal(h.seen.writes.length, 0);
});

test('내 수업 목록은 반 정보를 한 번의 settings 조회로 붙인다', async () => {
  const h = harness({ settings: { 'sb:class:16': JSON.stringify({ school: '보성초', grade: 2, room: '3' }), 'sb:class:99': '{"school":"남의 수업"}' } });
  const { status, result } = await h.call('GET', '/api/my-boards');
  assert.equal(status, 200);
  const lookups = h.seen.sql.filter((s) => s.includes('FROM settings WHERE key=ANY'));
  assert.equal(lookups.length, 1, '수업마다 따로 읽지 않는다');
  assert.deepEqual(result.boards.map((b) => [b.id, b.classInfo]), [
    [16, { school: '보성초', grade: 2, room: '3' }],
    [17, null],
  ]);
  // 예전 응답 칸은 그대로
  const first = result.boards[0];
  for (const key of ['title', 'code', 'isOpen', 'programTitle', 'mine', 'shared', 'teacherName', 'roster']) assert.ok(key in first, key);
});

test('수업이 없으면 반 정보도 읽지 않는다', async () => {
  const h = harness({ boards: [] });
  const { result } = await h.call('GET', '/api/my-boards');
  assert.deepEqual(result.boards, []);
  assert.ok(!h.seen.sql.some((s) => s.includes('FROM settings WHERE key=ANY')));
});

test('수업 화면 응답에 반 정보가 실린다', async () => {
  const h = harness({ settings: { 'sb:class:16': JSON.stringify({ school: '보성초', grade: 2, room: '3' }) } });
  const { status, result } = await h.call('GET', '/api/boards/16/posts');
  assert.equal(status, 200);
  assert.deepEqual(result.board.classInfo, { school: '보성초', grade: 2, room: '3' });
  const none = await harness().call('GET', '/api/boards/16/posts');
  assert.equal(none.result.board.classInfo, null);
});

test('수업을 지우면 sb:class 줄도 함께 지운다', async () => {
  const h = harness();
  const { status } = await h.call('DELETE', '/api/boards/16');
  assert.equal(status, 200);
  const exact = h.seen.purge.find((p) => /key = ANY\(\$1::text\[\]\)/.test(p.sql));
  assert.ok(exact, 'sb: 정리 쿼리가 돈다');
  assert.ok(exact.args[0].includes('sb:class:16'));
  assert.ok(exact.args[0].includes('sb:viewers:16') && exact.args[0].includes('sb:config:16'), '예전 대상도 그대로');
});

// ---------------- 화면: 묶기 함수만 떼어 시험한다 ----------------
const groupSource = app.slice(app.indexOf('/* ---- 반별로 묶기 (#/myclass)'), app.indexOf('/* ---- 반별로 묶기 끝 ---- */'));
const ui = {};
vm.createContext(ui);
vm.runInContext(`${groupSource}\nObject.assign(globalThis, { koCompare, hasClassInfo, normClassFields, classLabel, autoClassTitle, classGroupKey, showBoardTitle, groupBoardsByClass, classSchools, classSchoolChips, boardInSchoolChip });`, ui);
// 서버 쪽 정리·자동 이름 함수도 떼어 와서 화면과 같은 답을 내는지 맞춰 본다
const serverSource = source.slice(source.indexOf('const CLASS_FIELDS'), source.indexOf('// 함께 보기는 넘겨준 선생님의 권한을 빌린 것이다.'));
const server = {};
vm.createContext(server);
vm.runInContext(`${serverSource}\nObject.assign(globalThis, { normClassInfo, autoBoardTitle });`, server);

const B = (id, school, grade, room, over = {}) => ({
  id, title: `수업${id}`, programTitle: 'AI 교재 2학년', isOpen: true, classDate: null, code: `c${id}`,
  classInfo: school === null ? null : { school, grade, room }, ...over,
});
const plain = (v) => JSON.parse(JSON.stringify(v));

test('다른 학교의 같은 2학년 3반은 서로 다른 묶음이다', () => {
  const groups = ui.groupBoardsByClass([B(1, '보성초', 2, '3'), B(2, '○○초', 2, '3')]);
  assert.equal(groups.length, 2);
  assert.deepEqual(plain(groups.map((g) => g.label)).sort(), ['○○초 · 2학년 3반', '보성초 · 2학년 3반'].sort());
  assert.notEqual(ui.classGroupKey(B(1, '보성초', 2, '3')), ui.classGroupKey(B(2, '○○초', 2, '3')));
});

test('같은 반이 두 프로그램을 열면 한 묶음에 두 줄 — 진행 중 먼저, 그다음 프로그램 이름', () => {
  const groups = ui.groupBoardsByClass([
    B(1, '보성초', 2, '3', { programTitle: '인공지능 교재' }),
    B(2, '보성초', 2, '3', { programTitle: '과학 진로' }),
    B(3, '보성초', 2, '3', { programTitle: '가을 체험', isOpen: false }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, '보성초 · 2학년 3반');
  assert.deepEqual(plain(groups[0].boards.map((b) => b.id)), [2, 1, 3]);
});

test('같은 프로그램을 다시 연 수업은 최근 날짜가 먼저다(날짜 미정은 뒤)', () => {
  const [g] = ui.groupBoardsByClass([
    B(1, '보성초', 2, '3', { classDate: '2026-09-01' }),
    B(2, '보성초', 2, '3', { classDate: null }),
    B(3, '보성초', 2, '3', { classDate: '2026-10-20' }),
  ]);
  assert.deepEqual(plain(g.boards.map((b) => b.id)), [3, 1, 2]);
});

test('묶음 차례: 학교 가나다 → 학년 숫자 → 반(숫자면 숫자 차례), 학교 미지정 뒤, 반 미지정 맨 뒤', () => {
  const groups = ui.groupBoardsByClass([
    B(1, null),
    B(2, '', 3, '1'),
    B(3, '보성초', 2, '10'),
    B(4, '보성초', 2, '9'),
    B(5, '보성초', 1, '2'),
    B(6, '가람초', 6, '1'),
    B(7, '보성초', 2, '사랑'),
  ]);
  assert.deepEqual(plain(groups.map((g) => g.label)), [
    '가람초 · 6학년 1반',
    '보성초 · 1학년 2반',
    '보성초 · 2학년 9반',
    '보성초 · 2학년 10반',
    '보성초 · 2학년 사랑반',
    '3학년 1반',
    '반 미지정',
  ]);
  assert.equal(groups.at(-1).key, '', '반 미지정은 열쇠가 비어 있다');
});

test('묶음 이름은 없는 칸을 뺀다', () => {
  assert.equal(ui.classLabel({ school: '보성초', grade: 2, room: '' }), '보성초 · 2학년');
  assert.equal(ui.classLabel({ school: '', grade: null, room: '3' }), '3반');
  assert.equal(ui.classLabel({ school: '보성초', grade: null, room: '' }), '보성초');
  assert.equal(ui.classLabel(null), '');
});

test('줄에는 수업 이름이 자동 이름과 다를 때만 작게 나온다', () => {
  const info = { school: '보성초', grade: 2, room: '3' };
  assert.equal(ui.showBoardTitle({ title: '2학년 3반 · AI 교재 2학년', programTitle: 'AI 교재 2학년', classInfo: info }), false);
  assert.equal(ui.showBoardTitle({ title: 'AI 교재 2학년', programTitle: 'AI 교재 2학년', classInfo: null }), false);
  assert.equal(ui.showBoardTitle({ title: '2학년 2반 · 분수', programTitle: '분수', classInfo: null }), true);
});

test('화면의 자동 이름·반 정리는 서버와 같은 답을 낸다', () => {
  const samples = [
    { school: '  보성초   ', grade: '2학년', room: '3반' },
    { grade: 7, room: '12345678901234반', school: '가'.repeat(50) },
    { grade: '초 5', room: ' 사랑반 ' },
    { grade: 2 },
    { room: '3' },
    {},
  ];
  for (const v of samples) {
    assert.deepEqual(plain(ui.normClassFields(v)), plain(server.normClassInfo(v)), JSON.stringify(v));
    const info = server.normClassInfo(v);
    assert.equal(ui.autoClassTitle(info, 'AI 교재 2학년'), server.autoBoardTitle(info, 'AI 교재 2학년'), JSON.stringify(v));
  }
  assert.equal(ui.autoClassTitle({ grade: 2, room: '3' }, '가'.repeat(120)).length, 100, '100자로 자른다');
});

test('학교 칩은 학교가 둘 이상일 때만, 학교 미지정 칩은 반만 정한 수업이 있을 때만', () => {
  assert.deepEqual(plain(ui.classSchoolChips([B(1, '보성초', 2, '3'), B(2, '보성초', 2, '4'), B(3, null)])), []);
  const two = [B(1, '보성초', 2, '3'), B(2, '○○초', 2, '3'), B(3, null)];
  assert.deepEqual(plain(ui.classSchoolChips(two)).map((c) => c.label), ['전체', ...['○○초', '보성초'].sort((a, b) => a.localeCompare(b, 'ko'))]);
  assert.ok(!plain(ui.classSchoolChips(two)).some((c) => c.label === '학교 미지정'));
  const withBlank = [...two, B(4, '', 1, '2')];
  const chips = ui.classSchoolChips(withBlank);
  assert.equal(chips.at(-1).label, '학교 미지정');
  // 칩으로 거르기: 학교 → 그 학교만, 학교 미지정 → 반은 있고 학교가 빈 수업, 반 미지정은 '전체'에서만
  const pick = (id) => withBlank.filter((b) => ui.boardInSchoolChip(b, id)).map((b) => b.id);
  assert.deepEqual(pick('all'), [1, 2, 3, 4]);
  assert.deepEqual(pick('school:보성초'), [1]);
  assert.deepEqual(pick('none'), [4]);
});

test('반별 화면이 쓰는 스타일과 저장 키가 있다', () => {
  for (const selector of ['.mcg-group', '.mcg-head', '.mcg-row', '.mcg-actions', '.mcg-full', '.mcg-sr', '.mcg-schools[hidden]']) {
    assert.ok(css.includes(selector), `${selector} 규칙이 style.css 에 있어야 한다`);
  }
  const block = css.slice(css.indexOf('/* ===== 내 수업: 반별로 묶기'), css.indexOf('/* 비공개 프로그램으로 연 수업'));
  assert.doesNotMatch(block, /#[0-9a-f]{3,8}\b/i, '새 색을 만들지 않는다');
  assert.match(app, /localStorage\.getItem\('moakit:myclass'\)/);
  assert.match(app, /localStorage\.setItem\('moakit:lastSchool'/);
  assert.match(app, /data-mc-view[\s\S]{0,400}aria-pressed/);
});
