import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
// 교사 화면의 제출물 카드와 학생별 묶기만 떼어 확인한다.
const source = app.slice(app.indexOf('// 한 제출에 사진이 여러 장 붙는다'), app.indexOf('function careerMaterialUrl'));
const ctx = {
  esc: (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])),
  icon: () => '<svg></svg>',
};
vm.createContext(ctx);
vm.runInContext(source, ctx);

const post = (over = {}) => ({ id: 1, student_name: '김하늘', created_at: '2026-09-15T01:00:00Z', submission: true, title: '활동지', sessionTitle: '1차시', hidden: true, ...over });

test('사진이 여러 장이면 모두 그리고 장마다 제 번호로 받는다', () => {
  const html = ctx.postCardHtml(post({ attachments: [
    { index: 0, name: '앞면.png', previewUrl: 'https://s/0' },
    { index: 1, name: '뒷면.png', previewUrl: 'https://s/1' },
  ] }), { forTeacher: true, manageable: true });
  assert.ok(html.includes('https://s/0') && html.includes('https://s/1'));
  assert.ok(html.includes('사진 2장'));
  assert.ok(html.includes('/api/posts/1/download/0') && html.includes('/api/posts/1/download/1'));
  assert.ok(html.includes('1번째') && html.includes('2번째'));
});

test('이 기능 이전의 제출도 한 장짜리로 그려지고 받기 주소가 살아 있다', () => {
  const html = ctx.postCardHtml(post({ file_name: 'old.jpg', previewUrl: 'https://s/old' }), { forTeacher: true });
  assert.ok(html.includes('https://s/old'));
  assert.ok(html.includes('/api/posts/1/download/0'));
  assert.ok(html.includes('> 받기'), '한 장일 때는 장 번호 대신 받기');
  assert.ok(!html.includes('사진 1장'));
});

test('학생별 보기는 같은 학생 것을 모으고, 계정이 있으면 동명이인을 가른다', () => {
  const posts = [
    post({ id: 3, student_name: '김하늘', studentKey: 'acc-1' }),
    post({ id: 1, student_name: '김하늘', studentKey: 'acc-2' }),
    post({ id: 2, student_name: '김하늘', studentKey: 'acc-1' }),
  ];
  const { list } = ctx.groupPostsByStudent(posts, null);
  assert.equal(list.length, 2, '계정이 다르면 이름이 같아도 갈라야 한다');
  const first = list.find((g) => g.key === 'acc-1');
  assert.equal(first.posts.map((p) => p.id).join(','), '2,3', '한 학생 안에서는 낸 차례대로');
});

test('계정 없이 낸 옛 제출은 이름으로 묶는다', () => {
  const { list } = ctx.groupPostsByStudent([post({ id: 1, student_name: '박서준' }), post({ id: 2, student_name: '박서준' })], null);
  assert.equal(list.length, 1);
  assert.equal(list[0].key, 'name:박서준');
  assert.equal(list[0].posts.length, 2);
});

test('명단에 있는데 한 장도 안 낸 학생은 뒤에 따로 보인다', () => {
  const html = ctx.boardPostsHtml({ posts: [post({ student_name: '김하늘' })], manageable: true, roster: { missing: ['이도윤'] } }, 'student');
  assert.ok(html.indexOf('김하늘') < html.indexOf('이도윤'), '제출한 학생이 먼저');
  assert.ok(html.includes('아직 제출 없음'));
  assert.ok(html.includes('제출 1개'));
});

test('시간순 보기는 서버가 준 차례 그대로 한 바둑판에 둔다', () => {
  const html = ctx.boardPostsHtml({ posts: [post({ id: 2, student_name: '나' }), post({ id: 1, student_name: '가' })], manageable: true, roster: { missing: [] } }, 'time');
  assert.ok(!html.includes('sb-student'));
  assert.ok(html.indexOf('>나<') < html.indexOf('>가<'));
});

test('학생 이름과 제목은 이스케이프된다', () => {
  const html = ctx.boardPostsHtml({ posts: [post({ student_name: '<script>x</script>', title: '<img src=x onerror=y>' })], manageable: true, roster: { missing: ['<b>명단</b>'] } }, 'student');
  assert.ok(!html.includes('<script>') && !html.includes('<img src=x'));
  assert.ok(!html.includes('<b>명단</b>'));
});

test('학생별 보기에 쓰는 스타일이 실제로 있다', () => {
  for (const selector of ['.sb-student', '.sbs-head', '.sb-tabs', '.pc-photos', '.pc-count']) {
    assert.ok(css.includes(selector), `${selector} 규칙이 style.css 에 있어야 한다`);
  }
});

test('사진 모아 인쇄: 이름순으로 사진만, 차시를 고르면 그 차시만', () => {
  const posts = [
    post({ id: 1, student_name: '이도윤', sessionTitle: '8차시', attachments: [{ index: 0, name: 'a.png', previewUrl: 'https://s/a' }] }),
    post({ id: 2, student_name: '김하늘', sessionTitle: '8차시', attachments: [{ index: 0, name: 'b.png', previewUrl: 'https://s/b' }, { index: 1, name: 'c.pdf', previewUrl: null }] }),
    post({ id: 3, student_name: '김하늘', sessionTitle: '9차시', attachments: [{ index: 0, name: 'd.png', previewUrl: 'https://s/d' }] }),
    post({ id: 4, student_name: '박서준', sessionTitle: '8차시', attachments: [{ index: 0, name: 'e.pdf', previewUrl: null }] }),
  ];
  assert.deepEqual([...ctx.photoLessons(posts)], ['8차시', '9차시'], '사진이 있는 차시만');
  const all = ctx.photoPrintHtml(posts, null);
  assert.equal(all.count, 3, '문서는 빼고 사진만');
  assert.ok(all.html.indexOf('https://s/b') < all.html.indexOf('https://s/d'), '같은 학생은 낸 차례대로');
  assert.ok(all.html.indexOf('https://s/d') < all.html.indexOf('https://s/a'), '김하늘이 이도윤보다 먼저(이름순)');
  const eight = ctx.photoPrintHtml(posts, '8차시');
  assert.equal(eight.count, 2);
  assert.ok(!eight.html.includes('https://s/d'));
  assert.ok(eight.html.includes('김하늘 · 8차시'));
});

test('사진 모아 인쇄: 이름은 이스케이프되고 인쇄 스타일이 있다', () => {
  const { html } = ctx.photoPrintHtml([post({ student_name: '<b>x</b>', attachments: [{ index: 0, name: 'a.png', previewUrl: 'https://s/a"onerror="y' }] })], null);
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(!html.includes('"onerror="'));
  for (const selector of ['#photo-print', 'body.photo-print', '.pp-item']) assert.ok(css.includes(selector), `${selector} 규칙이 있어야 한다`);
});
