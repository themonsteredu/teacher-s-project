import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// 아이들 자료 — 선생님이 반 화면에서 올린 파일을 아이들이 반 코드로 들어와 로그인 없이 받는다.
// 서버는 파일마다 sb:clsfile:<반>:<파일> 한 줄을 쓰고, 화면에는 저장소 경로를 주지 않는다.
// 화면 함수(형식 검사·크기 표기·반 화면 줄·아이들 카드)만 떼어 시험한다.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const escSource = app.slice(app.indexOf('function esc(s)'), app.indexOf('function isAdmin()'));
const source = app.slice(app.indexOf('/* ---- 반별로 묶기 (#/myclass)'), app.indexOf('/* ---- 반 먼저 끝 ---- */'));
const ui = {};
vm.createContext(ui);
vm.runInContext(`${escSource}\n${source}\nObject.assign(globalThis, { classFileProblem, fileSizeLabel, classFileEmoji, classFileDate, classFilesOf, classFileRowHtml, classFilesCardHtml, classSumText, classLandingHtml, CLASS_FILE_ACCEPT, CLASS_FILE_LIMIT });`, ui);
const plain = (v) => JSON.parse(JSON.stringify(v));

const CID = 'aaaaaaaaaaaa';
const FID = '0123456789ab';
const MB = 1024 * 1024;

test('올리기 전 검사: 프로그램 첨부 형식에서 html 만 뺀 것, 100MB 이하, 빈 파일 안 됨', () => {
  for (const name of ['활동지.pdf', 'a.PPTX', 'b.ppt', 'c.docx', 'd.doc', 'e.xlsx', 'f.xls', '한글.hwp', 'g.hwpx', 'h.zip', 'i.png', 'j.JPG', 'k.jpeg', 'l.webp', 'm.gif']) {
    assert.equal(ui.classFileProblem({ name, size: 10 }), '', name);
  }
  assert.match(ui.classFileProblem({ name: '웹앱.html', size: 10 }), /형식/, 'HTML 은 아이들이 받아도 헷갈리기만 한다');
  assert.match(ui.classFileProblem({ name: 'x.htm', size: 10 }), /형식/);
  assert.match(ui.classFileProblem({ name: 'run.exe', size: 10 }), /형식/);
  assert.match(ui.classFileProblem({ name: 'pdf', size: 10 }), /형식/, '확장자가 없으면 안 된다');
  assert.match(ui.classFileProblem({ name: '', size: 10 }), /형식/);
  assert.match(ui.classFileProblem({ name: 'a.pdf', size: 0 }), /빈 파일/);
  assert.equal(ui.classFileProblem({ name: 'a.pdf', size: 100 * MB }), '', '딱 100MB 는 된다');
  assert.match(ui.classFileProblem({ name: 'a.pdf', size: 100 * MB + 1 }), /100MB/);
  assert.ok(!ui.CLASS_FILE_ACCEPT.includes('htm'), '파일 고르기 창에도 html 이 없다');
  assert.ok(ui.CLASS_FILE_ACCEPT.includes('.hwp') && ui.CLASS_FILE_ACCEPT.includes('.zip'));
  assert.equal(ui.CLASS_FILE_LIMIT, 30);
});

test('크기 표기: 1MB 아래는 KB, 위는 MB(10MB 아래는 소수 한 자리)', () => {
  assert.equal(ui.fileSizeLabel(100), '1KB', '아주 작아도 0KB 로 보이지 않게');
  assert.equal(ui.fileSizeLabel(512 * 1024), '512KB');
  assert.equal(ui.fileSizeLabel(1.5 * MB), '1.5MB');
  assert.equal(ui.fileSizeLabel(23.4 * MB), '23MB');
  assert.equal(ui.fileSizeLabel('abc'), '1KB');
  assert.equal(ui.classFileEmoji('a.PDF'), '📄');
  assert.equal(ui.classFileEmoji('a.jpg'), '🖼️');
  assert.equal(ui.classFileEmoji('a.hwp'), '📝');
  assert.equal(ui.classFileEmoji('a.pptx'), '📊');
  assert.equal(ui.classFileEmoji('a.zip'), '🗜️');
});

test('목록 정리: 번호 모양이 맞고 이름이 있는 것만, 저장소 경로는 담지 않는다', () => {
  const list = ui.classFilesOf({ files: [
    { id: FID, name: ' 활동지.pdf ', mime: 'application/pdf', size: '2048', createdAt: '2026-10-28T03:00:00Z', path: 'class-files/x/y.pdf' },
    { id: '../etc', name: 'x.pdf', size: 1 },
    { id: 'bbbbbbbbbbbb', name: '   ', size: 1 },
    null,
  ] });
  assert.deepEqual(plain(list), [{ id: FID, name: '활동지.pdf', size: 2048, mime: 'application/pdf', createdAt: '2026-10-28T03:00:00Z' }]);
  assert.deepEqual(plain(ui.classFilesOf({})), []);
  assert.deepEqual(plain(ui.classFilesOf(null)), []);
  // 날짜: ISO 글자·밀리초 모두, 못 읽으면 빈칸
  const at = new Date(2026, 9, 28, 12).getTime();
  assert.equal(ui.classFileDate(new Date(at).toISOString()), '2026. 10. 28');
  assert.equal(ui.classFileDate(at), '2026. 10. 28');
  assert.equal(ui.classFileDate(String(at)), '2026. 10. 28');
  assert.equal(ui.classFileDate('엉뚱'), '');
  assert.equal(ui.classFileDate(null), '');
});

test('반 화면 줄: 이름 이스케이프 · [받기]는 선생님 경로 · [삭제]는 파일 번호', () => {
  const row = ui.classFileRowHtml(CID, { id: FID, name: '<b>활동지</b>".pdf', size: 1.5 * MB, createdAt: new Date(2026, 9, 28, 12).toISOString() });
  assert.ok(!row.includes('<b>활동지'), '이름은 이스케이프');
  assert.ok(row.includes('&lt;b&gt;활동지&lt;/b&gt;&quot;.pdf'));
  assert.ok(row.includes(`href="/api/classes/${CID}/files/${FID}/download" download`));
  assert.ok(row.includes(`data-kc-fdel="${FID}"`));
  assert.ok(row.includes('1.5MB') && row.includes('2026. 10. 28'));
  assert.ok(row.includes('class="kc-file-name" title="'), '긴 이름은 말줄임 + 마우스를 대면 전체');
  assert.ok(row.includes('mcg-sr'), '같은 [받기]·[삭제]가 여러 개라 화면 읽기에 대상을 붙인다');
});

test('반 화면 카드: 안내 문구 · 여러 파일 고르기 · 빈 상태 · 다 차면 [자료 올리기] 막기 · 실패 안내 이스케이프', () => {
  const empty = ui.classFilesCardHtml(CID, []);
  assert.ok(empty.includes('여기 올린 파일은 아이들이 반 코드로 들어와 바로 내려받을 수 있어요.'));
  assert.ok(empty.includes('아이들 자료'));
  assert.ok(empty.includes('id="kc-file-add"') && !empty.includes('id="kc-file-add" disabled'));
  assert.match(empty, /<input type="file" id="kc-file-input" multiple accept="[^"]*\.pdf[^"]*"/);
  assert.ok(empty.includes('아직 올린 자료가 없어요'));
  const files = ui.classFilesOf({ files: [{ id: FID, name: 'a.pdf', size: 10 }] });
  const one = ui.classFilesCardHtml(CID, files, ['<x>.exe: 올릴 수 없는 파일 형식이에요.']);
  assert.ok(one.includes('1개') && one.includes('kc-files-list') && !one.includes('아직 올린 자료가 없어요'));
  assert.ok(one.includes('&lt;x&gt;.exe') && !one.includes('<x>'), '실패 안내도 이스케이프');
  assert.ok(one.includes('kc-filemsg is-err'));
  const full = ui.classFilesCardHtml(CID, Array.from({ length: 30 }, (_, i) => ({ id: FID, name: `${i}.pdf`, size: 1 })));
  assert.ok(full.includes('id="kc-file-add" disabled') && full.includes('다 찼어요'));
});

test('아이들 반 코드 화면: 받을 자료는 과정 다음·도구 앞, 보통 <a download> → 학생 경로', () => {
  const html = ui.classLandingHtml('BS31', {
    class: { label: '3학년 1반', school: '보성초' },
    curricula: [{ title: '인공지능', code: 'ai3101' }],
    files: [{ id: FID, name: '<i>그림</i>.png', size: 512 * 1024, path: 'class-files/secret.png' }, { id: 'nope', name: 'x.pdf', size: 1 }],
    tools: [{ id: 7, title: '패들렛', kind: 'site', url: 'https://padlet.com/x' }],
  });
  const fileAt = html.indexOf(`href="/api/join-class/bs31/file/${FID}" download`);
  assert.ok(fileAt > 0, '반 코드는 소문자로, download 속성');
  assert.ok(html.includes('받을 자료') && html.includes('받기 ↓') && html.includes('512KB'));
  assert.ok(html.includes('&lt;i&gt;그림&lt;/i&gt;.png') && !html.includes('<i>그림'), '이름은 이스케이프');
  assert.ok(!html.includes('secret') && !html.includes('class-files'), '저장소 경로는 쓰지 않는다');
  assert.ok(!html.includes('/file/nope'), '번호 모양이 아니면 링크로 만들지 않는다');
  assert.ok(html.indexOf('href="#/board/ai3101"') < fileAt, '과정 다음');
  assert.ok(fileAt < html.indexOf('padlet.com'), '도구 앞');
  // 자료가 없으면 칸이 없다
  const none = ui.classLandingHtml('bs31', { class: { label: '3학년 1반' }, curricula: [{ title: '인공지능', code: 'ai3101' }], tools: [] });
  assert.ok(!none.includes('받을 자료'));
  // 자료만 있어도 '아직 과정을 넣지 않았어요' 대신 자료 카드
  const onlyFiles = ui.classLandingHtml('bs31', { class: { label: '3학년 1반' }, curricula: [], tools: [], files: [{ id: FID, name: 'a.pdf', size: 1 }] });
  assert.ok(onlyFiles.includes('받을 자료') && !onlyFiles.includes('아직 선생님이 과정을 넣지 않았어요'));
  // 이상한 반 코드면 자료 링크를 만들지 않는다
  assert.ok(!ui.classLandingHtml('"><x', { class: {}, files: [{ id: FID, name: 'a.pdf', size: 1 }] }).includes('/file/'));
});

test('내 수업 반 카드 머리: 자료가 있을 때만 "자료 n"', () => {
  assert.equal(ui.classSumText({ curriculumCount: 2, tools: [1], fileCount: 3 }, 0), '과정 2 · 도구 1 · 자료 3');
  assert.equal(ui.classSumText({ curriculumCount: 2, tools: [], fileCount: 0 }, 0), '과정 2 · 도구 0');
  assert.equal(ui.classSumText({ tools: [] }, 4), '과정 4 · 도구 0', 'curriculumCount 가 없으면 묶은 과정 수');
});

test('화면 연결: 반 화면은 제출함 카드 바로 다음에 자료 카드, 3단계 올리기, 지우기 확인', () => {
  const classPage = app.slice(app.indexOf("route(/^#\\/class\\/([0-9a-f]{12})$/"), app.indexOf('function renderClassLanding('));
  const inboxAt = classPage.indexOf('classInboxCardHtml(inbox, inboxError)');
  const filesAt = classPage.indexOf('classFilesCardHtml(id, files, fileNotice)');
  assert.ok(inboxAt > 0 && filesAt > inboxAt && filesAt < classPage.indexOf('<div class="kc-cards">'), '반 제출함 카드 바로 다음');
  assert.ok(classPage.includes("api('POST', `/api/classes/${id}/file-sign`"));
  assert.ok(classPage.includes("'x-upsert': 'true'"));
  assert.ok(classPage.includes("api('POST', `/api/classes/${id}/files`, { path: sign.path"));
  assert.ok(classPage.includes('올리는 중 (${i + 1}/${picked.length})…'));
  assert.ok(classPage.includes('아이들 화면에서도 사라져요'));
  assert.ok(classPage.includes("api('DELETE', `/api/classes/${id}/files/${b.dataset.kcFdel}`)"));
  assert.ok(app.includes('classSumText(c, g.curricula.length)'), '내 수업 반 카드 머리');
  assert.match(css, /\.kc-file-name\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.match(css, /\.kc-files\s*\{/);
});
