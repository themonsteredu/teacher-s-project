import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// 반 제출함 — 과정을 열지 않아도 반마다 아이들이 반 코드로 들어와 활동지·사진을 올리는 곳.
// 서버는 반마다 보드를 하나 만들고 sb:class 에 inbox: true 를 붙인다. 화면은 그 보드를 과정 줄에 섞지 않고
// 반 카드의 한 줄 · 반 화면 카드 · 아이들 화면 첫 카드로만 보인다. 화면 함수만 떼어 시험한다.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const escSource = app.slice(app.indexOf('function esc(s)'), app.indexOf('function isAdmin()'));
const source = app.slice(app.indexOf('/* ---- 반별로 묶기 (#/myclass)'), app.indexOf('/* ---- 반 먼저 끝 ---- */'));
const ui = {};
vm.createContext(ui);
vm.runInContext(`${escSource}\n${source}\nObject.assign(globalThis, { groupClassesAndBoards, searchClassGroups, classGroupsBoardCount, classLandingHtml, classInboxLineHtml, classInboxCardHtml, boardClassActionHtml, classInboxOf, isInboxBoard, classLandingInboxCode });`, ui);
const plain = (v) => JSON.parse(JSON.stringify(v));

const CID = 'aaaaaaaaaaaa';
const C = (over = {}) => ({ id: CID, school: '보성초', grade: 3, room: '1', name: '', label: '3학년 1반', code: 'bs31', isOpen: true, tools: [], mine: true, inbox: null, ...over });
const B = (id, over = {}) => ({
  id, title: `수업${id}`, programTitle: `프로그램${id}`, isOpen: true, classDate: null, code: `c${id}`, postCount: 0,
  classInfo: { school: '보성초', grade: 3, room: '1', classId: CID }, ...over,
});
const INBOX = (id, over = {}) => B(id, {
  title: '3학년 1반 · 반 제출함', programTitle: '반 제출함', postCount: 4,
  classInfo: { school: '보성초', grade: 3, room: '1', classId: CID, inbox: true }, ...over,
});

test('내 수업 반 카드: 반 제출함은 과정 줄에 섞이지 않고 반 카드의 한 줄로만', () => {
  const g = ui.groupClassesAndBoards([C()], [B(1), INBOX(2)]);
  assert.deepEqual(plain(g.classes[0].curricula.map((b) => b.id)), [1], '제출함은 과정이 아니다');
  assert.deepEqual(plain(g.classes[0].legacy), []);
  assert.equal(g.classes[0].inboxBoard.id, 2);
  assert.equal(ui.classGroupsBoardCount(g), 1, '수업 수에도 세지 않는다');
  // 반 카드가 없으면(다른 선생님 반을 걸러 냄 등) 반 미지정·[반에 넣기] 줄로 새지 않는다
  const orphan = ui.groupClassesAndBoards([], [INBOX(3)]);
  assert.equal(orphan.unassigned, null);
  assert.deepEqual(plain(orphan.legacy), []);
  // 찾기로 걸러도 반 카드의 제출함은 남는다
  const found = ui.searchClassGroups(g, '프로그램1');
  assert.equal(found.classes[0].inboxBoard.id, 2);
});

test('반 카드의 한 줄: 📷 반 제출함 · 제출 n개 [보기] → #/boardview/<제출함>', () => {
  const line = ui.classInboxLineHtml(C({ inbox: { boardId: 77, code: 'IB77XY', postCount: 5 } }), null);
  assert.ok(line.includes('반 제출함 · 제출 5개'));
  assert.ok(line.includes('href="#/boardview/77"'));
  assert.ok(line.includes('보성초 · 3학년 1반 반 제출함'), '같은 [보기]가 여러 개라 화면 읽기에 대상을 붙인다');
  // 반 목록에 inbox 가 아직 없으면 내 수업 목록의 제출함 보드로
  const fallback = ui.classInboxLineHtml(C(), INBOX(9, { postCount: 2 }));
  assert.ok(fallback.includes('href="#/boardview/9"') && fallback.includes('제출 2개'));
  assert.equal(ui.classInboxLineHtml(C(), null), '', '제출함이 없으면 아무것도 안 그린다');
  assert.equal(ui.classInboxLineHtml(C({ inbox: { boardId: '1;x', code: 'ab12' } }), null), '', '이상한 번호는 링크로 만들지 않는다');
});

test('반 화면 카드: 과정을 열지 않아도 된다는 안내 + [제출물 보기], 못 만들었으면 [다시 만들기]', () => {
  const card = ui.classInboxCardHtml(ui.classInboxOf({ inbox: { boardId: 12, code: 'ab12', postCount: 3 } }));
  assert.ok(card.includes('과정을 열지 않아도 돼요'));
  assert.ok(card.includes('제출 3개'));
  assert.ok(card.includes('href="#/boardview/12"') && card.includes('제출물 보기'));
  const failed = ui.classInboxCardHtml(null, '<오류>');
  assert.ok(failed.includes('id="kc-inbox-make"'));
  assert.ok(failed.includes('&lt;오류&gt;') && !failed.includes('<오류>'), '오류 문구도 이스케이프');
  assert.deepEqual(plain(ui.classInboxOf({ inbox: { boardId: '5', code: '../x', postCount: 'a' } })), { boardId: 5, code: '', postCount: 0 });
  assert.equal(ui.classInboxOf({ inbox: null }), null);
});

test('아이들 반 코드 화면: [활동지·사진 올리기]가 첫 카드 → #/board/<제출함 코드>, 그다음 과정·도구', () => {
  const html = ui.classLandingHtml('bs31', {
    class: { label: '3학년 1반', school: '보성초' },
    inbox: { code: 'IB31QZ' },
    curricula: [{ title: '인공지능', code: 'ai3101' }],
    tools: [{ id: 7, title: '패들렛', kind: 'site', url: 'https://padlet.com/x' }],
  });
  const inboxAt = html.indexOf('href="#/board/ib31qz"');
  assert.ok(inboxAt > 0, '제출함 코드는 소문자로');
  assert.ok(html.includes('활동지·사진 올리기'));
  assert.ok(inboxAt < html.indexOf('href="#/board/ai3101"'), '과정보다 먼저');
  assert.ok(html.indexOf('href="#/board/ai3101"') < html.indexOf('padlet.com'), '도구는 맨 뒤');
  // 과정·도구가 없어도 제출함이 있으면 '아직 과정을 넣지 않았어요' 대신 올리기 카드
  const onlyInbox = ui.classLandingHtml('bs31', { class: { label: '3학년 1반' }, inbox: { code: 'ib31qz' }, curricula: [], tools: [] });
  assert.ok(onlyInbox.includes('href="#/board/ib31qz"'));
  assert.ok(!onlyInbox.includes('아직 선생님이 과정을 넣지 않았어요'));
  // 제출함이 없거나(닫힘) 코드가 이상하면 카드도 없다
  const none = ui.classLandingHtml('bs31', { class: { label: '3학년 1반' }, curricula: [], tools: [] });
  assert.ok(!none.includes('활동지·사진 올리기'));
  assert.equal(ui.classLandingInboxCode({ inbox: { code: 'javascript:x' } }), '');
});

test('수업 화면 머리: [반 화면 · 도구 추가]는 반에 붙은 수업을 고칠 수 있는 선생님에게만', () => {
  const board = { classInfo: { school: '보성초', grade: 3, room: '1', classId: CID } };
  const btn = ui.boardClassActionHtml(board, true);
  assert.ok(btn.includes(`href="#/class/${CID}"`) && btn.includes('반 화면 · 도구 추가'));
  assert.equal(ui.boardClassActionHtml(board, false), '', '함께 보는 선생님(보기 전용)에게는 없다');
  assert.equal(ui.boardClassActionHtml(board, undefined), '');
  const loose = ui.boardClassActionHtml({ classInfo: { school: '보성초', grade: 3, room: '1' } }, true);
  assert.ok(loose.includes('id="board-attach"') && loose.includes('반에 넣기'), '반에 안 붙은 수업은 [반에 넣기]');
  assert.ok(ui.boardClassActionHtml({ classInfo: null }, true).includes('반에 넣기'));
  assert.ok(!ui.boardClassActionHtml({ classInfo: { classId: '"><x' } }, true).includes('#/class/'), '반 번호 모양이 아니면 링크로 만들지 않는다');
  // 반 제출함은 반 화면 단추가 나온다(제출함은 늘 반에 붙어 있다)
  assert.ok(ui.boardClassActionHtml({ classInfo: { classId: CID, inbox: true } }, true).includes(`#/class/${CID}`));
});

test('화면 연결: 반 화면은 제출함을 한 번 만들고, 수업 화면은 제출함에서 과정 전용 카드를 뺀다', () => {
  const classPage = app.slice(app.indexOf("route(/^#\\/class\\/([0-9a-f]{12})$/"), app.indexOf('function renderClassLanding('));
  assert.ok(classPage.includes("api('POST', `/api/classes/${id}/inbox`)"), '제출함이 없는 옛 반은 처음 열 때 만든다');
  assert.ok(classPage.includes('classInboxTried'), '실패해도 화면을 되풀이해 그리지 않는다');
  assert.ok(classPage.indexOf('kc-codepanel') < classPage.indexOf('classInboxCardHtml(inbox, inboxError)'), '코드판 바로 아래');
  assert.ok(classPage.includes('도구함의 웹사이트·웹앱을 골라 넣으면 아이들 반 화면에 바로 보여요'));
  assert.ok(classPage.includes("'?force=true'"), '제출함에 아이들 것이 있으면 한 번 더 묻고 force');
  const view = app.slice(app.indexOf("route(/^#\\/boardview\\/(\\d+)$/"), app.indexOf('function viewerCardHtml('));
  assert.ok(view.includes('boardClassActionHtml(b, data.manageable)'));
  assert.ok(view.includes("inbox ? '' : '<div class=\"card\" id=\"share-card\">"), '제출함에는 프로그램 자료 고르기가 없다');
  assert.ok(view.includes('openPickClassModal('), '[반에 넣기]는 내 수업과 같은 창');
  const landing = app.slice(app.indexOf('function renderClassLanding('));
  assert.ok(landing.slice(0, 600).includes('inboxCode'), '제출함 화면에서도 ← 우리 반 목록');
  assert.match(css, /\.kc-inboxline\s*\{/);
  assert.match(css, /\.kcl-inbox\s*\{/);
});
