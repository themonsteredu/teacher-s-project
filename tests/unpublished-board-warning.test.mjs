import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../lib/api.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

// 비공개 프로그램으로 연 수업은 참여 코드를 띄워도 학생이 못 들어온다.
// 학생 쪽 게이트(회수 스위치)는 그대로 두고, 선생님에게 그 사실을 알려 주는 것이 이 수정이다.
test('학생 입장 게이트는 그대로다 — 우회로 뚫지 않았다', () => {
  assert.ok(api.includes('if (!program || !program.published) return null;'),
    'openBoardByCode 의 published 요구는 회수 스위치라 유지해야 한다');
  const board = readFileSync(new URL('../lib/student-board.js', import.meta.url), 'utf8');
  assert.ok(board.includes('p.published=true'), '제출 트랜잭션의 published 잠금도 유지해야 한다');
});

test('수업 화면이 공개 여부를 알 수 있게 서버가 값을 내려준다', () => {
  assert.ok(api.includes('published: !!program.published'), 'GET /api/boards/:id/posts 의 program 에 published 가 있어야 한다');
  // 학생 응답에는 넣지 않는다
  const studentJoin = api.slice(api.indexOf("route('GET', /^\\/api\\/join-board\\/([A-Za-z0-9]{4,10})$/"));
  const untilNext = studentJoin.slice(0, studentJoin.indexOf('// 학생용: 공유된 파일 열람'));
  assert.ok(!untilNext.includes('published'), '학생 응답에 공개 여부를 실을 이유가 없다');
});

test('수업 화면에 경고가 뜨고, 공개 버튼은 관리자에게만 보인다', () => {
  const banner = app.slice(app.indexOf('bv-blocked'), app.indexOf('bv-blocked') + 900);
  assert.ok(banner.includes('학생이 이 수업에 들어올 수 없습니다'));
  assert.ok(banner.includes("isAdmin() ?"), '공개 버튼은 isAdmin() 으로 감싸야 한다 — 교사에게는 눌러도 403 인 버튼이 보이면 안 된다');
  assert.ok(banner.includes('관리자에게 프로그램 공개를 요청하세요'), '교사에게는 대신 안내가 필요하다');
  assert.ok(app.includes("data.program.published === false"), '공개일 때는 배너가 나오지 않아야 한다');
  assert.ok(css.includes('.bv-blocked'), '배너 스타일이 있어야 한다');
});

test('새 수업 모달이 비공개 프로그램을 고르는 순간 알려 준다', () => {
  assert.ok(app.includes('비공개 · 학생 입장 불가'), '목록 라벨에 표시');
  assert.ok(app.includes('참여 코드를 띄워도 학생이 들어오지 못합니다'), '고른 뒤 경고 문구');
  assert.ok(app.includes("querySelector('#nc-prog').addEventListener('change', ncWarn)"), '고를 때마다 갱신');
});
