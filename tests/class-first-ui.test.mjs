import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// 반 개설 — 반 먼저, 과정·도구는 나중에. 선생님은 반(sb:cls)을 먼저 만들고 과정(프로그램마다 연 수업)과 도구를 넣는다.
// 아이들은 반 코드 하나로 들어와 과정·도구 목록에서 고른다. 화면의 묶기·아이들 화면 함수만 떼어 시험한다.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const board = readFileSync(new URL('../public/student-board.js', import.meta.url), 'utf8');
const escSource = app.slice(app.indexOf('function esc(s)'), app.indexOf('function isAdmin()'));
const source = app.slice(app.indexOf('/* ---- 반별로 묶기 (#/myclass)'), app.indexOf('/* ---- 반 먼저 끝 ---- */'));
const ui = {};
vm.createContext(ui);
vm.runInContext(`${escSource}\n${source}\nObject.assign(globalThis, { classNameOf, classHeading, groupClassesAndBoards, searchClassGroups, classGroupsBoardCount, rosterText, classLandingHtml, classLandingCurricula });`, ui);
const plain = (v) => JSON.parse(JSON.stringify(v));

const B = (id, school, grade, room, over = {}) => ({
  id, title: `수업${id}`, programTitle: `프로그램${id}`, isOpen: true, classDate: null, code: `c${id}`,
  classInfo: school === null ? null : { school, grade, room }, ...over,
});
const C = (id, school, grade, room, over = {}) => ({ id, school, grade, room, name: '', label: `${grade}학년 ${room}반`, code: `k${id}`, isOpen: true, tools: [], mine: true, ...over });

test('반 이름표: label → name → 학년·반, 머리 제목은 학교 · 반', () => {
  assert.equal(ui.classNameOf({ label: '별빛반', grade: 2, room: '3' }), '별빛반');
  assert.equal(ui.classNameOf({ name: '방과후', grade: 2 }), '방과후');
  assert.equal(ui.classNameOf({ grade: 2, room: '3' }), '2학년 3반');
  assert.equal(ui.classHeading({ school: '보성초', grade: 2, room: '3' }), '보성초 · 2학년 3반');
  assert.equal(ui.classHeading({ name: '토요반' }), '토요반', '학교가 없으면 반 이름만');
});

test('반 카드: classId 가 맞는 수업은 과정, 반 개설 전 수업은 학교|학년|반이 같은 반 아래에', () => {
  const classes = [C('aaaaaaaaaaaa', '보성초', 2, '3'), C('bbbbbbbbbbbb', '보성초', 1, '1')];
  const boards = [
    B(1, '보성초', 2, '3', { classInfo: { school: '보성초', grade: 2, room: '3', classId: 'aaaaaaaaaaaa' } }),
    B(2, '보성초', 2, '3'), // 반 개설 전 같은 반
    B(3, '다른초', 2, '3'), // 같은 2학년 3반이라도 학교가 다르면 섞이지 않는다
    B(4, null),
  ];
  const g = ui.groupClassesAndBoards(classes, boards);
  assert.deepEqual(plain(g.classes.map((x) => x.cls.id)), ['bbbbbbbbbbbb', 'aaaaaaaaaaaa'], '학년 차례');
  const a = g.classes[1];
  assert.deepEqual(plain(a.curricula.map((b) => b.id)), [1]);
  assert.deepEqual(plain(a.legacy.map((b) => b.id)), [2]);
  assert.deepEqual(plain(g.classes[0].curricula), []);
  assert.deepEqual(plain(g.legacy.map((x) => x.label)), ['다른초 · 2학년 3반'], '맞는 반이 없는 묶음은 예전 모양');
  assert.equal(g.legacy[0].canCreate, true, '[이 반 개설하기]');
  assert.deepEqual(plain(g.unassigned.boards.map((b) => b.id)), [4], '반 미지정은 맨 뒤 따로');
  assert.equal(ui.classGroupsBoardCount(g), 4);
});

test('함께 보는 수업만 있는 묶음에는 안내·개설 단추가 없다(#57 리뷰)', () => {
  const g = ui.groupClassesAndBoards([], [
    B(1, '보성초', 2, '3', { shared: true }),
    B(2, null, null, null, { shared: true }),
    B(3, '보성초', null, '', {}),
  ]);
  const shared = g.legacy.find((x) => x.label === '보성초 · 2학년 3반');
  assert.equal(shared.canEdit, false);
  assert.equal(shared.canCreate, false);
  assert.equal(g.unassigned.canEdit, false, '반 미지정 안내도 고칠 수 있는 줄이 있을 때만');
  const schoolOnly = g.legacy.find((x) => x.label === '보성초');
  assert.equal(schoolOnly.canEdit, true);
  assert.equal(schoolOnly.canCreate, false, '학년·반이 없으면 반 이름이 안 나오므로 개설 단추를 숨긴다');
  const mixed = ui.groupClassesAndBoards([], [B(5, null), B(6, null, null, null, { shared: true })]);
  assert.equal(mixed.unassigned.canEdit, true);
});

test('이 화면에 없는 반에 붙은 수업은 학교|학년|반으로 묶는다', () => {
  const g = ui.groupClassesAndBoards([C('aaaaaaaaaaaa', '보성초', 2, '3')], [
    B(1, '보성초', 2, '3', { classInfo: { school: '보성초', grade: 2, room: '3', classId: 'ffffffffffff' } }),
  ]);
  assert.deepEqual(plain(g.classes[0].legacy.map((b) => b.id)), [1]);
});

test('찾기: 반 이름·반 코드가 맞으면 반을 통째로, 아니면 맞는 수업만', () => {
  const classes = [C('aaaaaaaaaaaa', '보성초', 2, '3', { code: 'bs23' }), C('bbbbbbbbbbbb', '보성초', 1, '1', { code: 'bs11' })];
  const boards = [
    B(1, '보성초', 2, '3', { classInfo: { school: '보성초', grade: 2, room: '3', classId: 'aaaaaaaaaaaa' }, programTitle: 'AI 교재' }),
    B(2, '보성초', 2, '3', { classInfo: { school: '보성초', grade: 2, room: '3', classId: 'aaaaaaaaaaaa' }, programTitle: '과학 진로' }),
    B(3, null, null, null, { programTitle: '과학 실험' }),
  ];
  const g = ui.groupClassesAndBoards(classes, boards);
  const byCode = ui.searchClassGroups(g, 'bs23');
  assert.deepEqual(plain(byCode.classes.map((x) => x.cls.id)), ['aaaaaaaaaaaa']);
  assert.equal(byCode.classes[0].curricula.length, 2, '반 코드가 맞으면 과정 전부');
  assert.equal(byCode.unassigned, null);
  const byProgram = ui.searchClassGroups(g, '과학');
  assert.deepEqual(plain(byProgram.classes[0].curricula.map((b) => b.id)), [2]);
  assert.deepEqual(plain(byProgram.unassigned.boards.map((b) => b.id)), [3]);
  const byLabel = ui.searchClassGroups(g, '1학년 1반');
  assert.deepEqual(plain(byLabel.classes.map((x) => x.cls.id)), ['bbbbbbbbbbbb'], '과정이 없는 반도 이름으로 찾는다');
  assert.equal(ui.searchClassGroups(g, ''), g);
});

test('명단 칸: 글자·배열 모두 한 줄에 한 명', () => {
  assert.equal(ui.rosterText('가\n나'), '가\n나');
  assert.equal(ui.rosterText(['가', '나']), '가\n나');
  assert.equal(ui.rosterText({ total: 3 }), '');
});

test('아이들 반 코드 화면: 과정은 #/board/<과정 코드>, 웹사이트는 새 창, 웹앱은 반 코드 학생 경로', () => {
  const html = ui.classLandingHtml('bs23', {
    class: { label: '2학년 3반', school: '보성초<b>', grade: 2, room: '3' },
    curricula: [{ title: 'AI 교재 "2학년"', code: 'AB12CD' }, { title: '나쁜 코드', code: '../x' }],
    tools: [
      { id: 7, title: '패들렛', kind: 'site', url: 'https://padlet.com/a?b=1&c=2' },
      { id: 8, title: '그림 웹앱', kind: 'app' },
      { id: 9, title: '위험', kind: 'site', url: 'javascript:alert(1)' },
    ],
  });
  assert.ok(html.includes('보성초&lt;b&gt; · 2학년 3반'), '반 이름도 이스케이프');
  assert.ok(!html.includes('<b>2학년'), '날 글자가 태그로 들어가지 않는다');
  assert.ok(html.includes('href="#/board/ab12cd"'), '과정 코드는 소문자로');
  assert.ok(html.includes('AI 교재 &quot;2학년&quot;'));
  assert.ok(!html.includes('../x') && !html.includes('나쁜 코드'), '코드 규칙에 맞지 않는 과정은 뺀다');
  assert.match(html, /href="https:\/\/padlet\.com\/a\?b=1&amp;c=2" target="_blank" rel="noopener"/);
  assert.match(html, /href="\/api\/join-class\/bs23\/tool\/8\/open" target="_blank" rel="noopener"/);
  assert.ok(!html.includes('javascript:'), 'https 가 아닌 주소는 링크로 만들지 않는다');
  assert.ok(!html.includes('/api/tools/'), '교사 경로(로그인 필요)는 아이들 화면에 쓰지 않는다');
  assert.ok(!html.includes('아직 선생님이 과정을 넣지 않았어요'));
});

test('아이들 반 코드 화면: 비었을 때 다정한 안내, 과정 코드만 기억', () => {
  const empty = ui.classLandingHtml('bs23', { class: { label: '별빛반' }, curricula: [], tools: [] });
  assert.ok(empty.includes('아직 선생님이 과정을 넣지 않았어요'));
  assert.ok(empty.includes('href="#/login"'), '다른 코드 넣기');
  assert.deepEqual(plain(ui.classLandingCurricula({ curricula: [{ code: 'ab12' }, { code: 'x' }] })), [{ code: 'ab12' }]);
});

test('화면 연결: 내 수업은 [반 개설], 반 화면 경로, 학생 코드는 과정 다음 반', () => {
  assert.ok(app.includes('id="mc-new-class"') && !app.includes('id="mc-new"'), '내 수업의 첫 단추는 반 개설');
  assert.ok(app.includes("route(/^#\\/class\\/([0-9a-f]{12})$/"), '#/class/:id');
  assert.ok(app.includes("section === 'class'"), '반 화면에서도 내 수업 메뉴가 켜진다');
  const join = app.slice(app.indexOf("route(/^#\\/board\\/([A-Za-z0-9]{4,10})$/"));
  assert.ok(join.indexOf('/api/join-board/') < join.indexOf('/api/join-class/'), '예전 과정 코드를 먼저 본다');
  assert.ok(join.includes('e.status === 403 || e.status === 404'), '로그인이 필요한 수업(401)은 반으로 넘기지 않는다');
  assert.ok(app.includes("sessionStorage.setItem('moakit:class-landing'"), '반 코드는 이 탭에만');
  assert.ok(board.includes('sbClassBackHtml(code)') && board.includes('← 우리 반 목록'));
});

test('반 목록 돌아가기: 그 반의 과정일 때만 보인다', () => {
  const helper = board.slice(board.indexOf('function sbClassBackHtml'), board.indexOf('function sbRecordEnabled'));
  const run = (stored) => {
    const ctx = { esc: (s) => String(s), sbRead: () => stored };
    vm.createContext(ctx);
    vm.runInContext(`${helper}\nglobalThis.out = sbClassBackHtml('ab12');`, ctx);
    return ctx.out;
  };
  assert.ok(run({ code: 'bs23', boards: ['ab12'] }).includes('href="#/board/bs23"'));
  assert.equal(run({ code: 'bs23', boards: ['zz99'] }), '', '다른 반의 과정');
  assert.equal(run({ code: 'ab12', boards: ['ab12'] }), '', '반 코드 자기 자신');
  assert.equal(run({ code: '<x>', boards: ['ab12'] }), '', '코드 규칙');
  assert.equal(run(null), '');
});

test('스타일: 새 클래스는 변수만, 한글 줄바꿈, 좁은 화면', () => {
  const block = css.slice(css.indexOf('/* 반 개설 — 반 먼저'));
  assert.ok(block.length > 100);
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(block), '새 hex 색을 쓰지 않는다');
  assert.ok(block.includes('word-break: keep-all'));
  assert.ok(block.includes('@media (max-width: 560px)'));
  assert.ok(block.includes(':focus-visible'));
  assert.ok(!/\.(mk|lt|mo)-/.test(block), '다른 레이어 접두사와 섞지 않는다');
});
