import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('function curriculumFilterKey'), app.indexOf('/* ---------------- 카탈로그')) + app.slice(app.indexOf('const programManagerView ='), app.indexOf('/* ---------------- 프로그램 편집'));
const curriculumSource = readFileSync(new URL('../public/curriculum.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const fixture = () => [
  { id: 1, title: 'AI로 탐구하는 삼국시대 — 전체 제목 표시', grade: '초5', category: '역사', published: true, courseSummary: { status: 'published', variants: [10, 5, 3].map(n => ({ lessonCount: n })) } },
  { id: 2, title: '식물 관찰', grade: '초3', category: '과학', published: false, lessonCount: 1 },
];

function ui({ role = 'admin', programs = fixture() } = {}) {
  const routes = [], calls = [], alerts = [], notices = [], nodes = new Map(), clickListeners = new Set();
  let html = '', data = programs, fail = false, confirm = true, disposeCount = 0;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '', textContent: '', disabled: false, isConnected: true, dataset: {}, querySelectorAll() { return []; }, querySelector() { return null; }, classList: { toggle() { return true; } }, setAttribute(k, v) { this[k] = v; }, focus() { this.focused = true; } });
    return nodes.get(id);
  };
  const statuses = ['all', 'published', 'private'].map(v => { const el = node(`status-${v}`); el.dataset.pmStatus = v; return el; });
  const counts = ['all', 'published', 'private'].map(v => { const el = node(`count-${v}`); el.dataset.pmCount = v; return el; });
  const manager = node('program-manager'), list = node('pm-list');
  manager.querySelectorAll = selector => selector === '[data-pm-status]' ? statuses : selector === '[data-pm-count]' ? counts : [];
  manager.querySelector = () => null;
  list.querySelectorAll = selector => {
    if (!['[data-pub]', '[data-del]'].includes(selector)) return [];
    const action = selector === '[data-pub]' ? 'pub' : 'del';
    return [...list.innerHTML.matchAll(new RegExp(`data-${action}="(\\d+)"(?: data-val="(\\d)")?`, 'g'))].map(match => {
      const el = node(`${action}-${match[1]}`); el.dataset[action] = match[1]; el.dataset.val = match[2]; return el;
    });
  };
  const tree = node('manager-tree');
  tree.querySelectorAll = selector => selector === '[data-ct-filter]' ? [...(node('pm-tree-host').innerHTML || html).matchAll(/data-ct-filter="([^"]+)"/g)].map(match => {
    const key = match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&');
    const button = node(`tree:${key}`); button.dataset.ctFilter = key; return button;
  }) : [];
  tree.querySelector = selector => selector === '[data-ct-current]' ? node('tree-current') : selector === '.ct-mobile-toggle' ? node('tree-toggle') : null;
  const context = vm.createContext({
    isAdmin: () => role === 'admin', location: { hash: '#/manage' },
    esc: v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
    icon: name => `<svg data-icon="${name}"></svg>`, GRADES: [],
    route: (pattern, fn) => routes.push({ pattern, fn }),
    shell: (title, content, options) => { html = content; context.shellOptions = options; },
    disposeShell: () => { disposeCount++; },
    document: { getElementById: node, addEventListener: (name, fn) => clickListeners.add(fn), removeEventListener: (name, fn) => clickListeners.delete(fn) },
    confirm: message => { alerts.push(message); return confirm; },
    toast: message => notices.push(message),
    openModal: content => { const modal = node('new-modal'); modal.innerHTML = content; modal.querySelector = selector => node(selector.slice(1)); modal.remove = () => { modal.removed = true; }; return modal; },
    api: async (method, url, body) => { calls.push({ method, url, body }); if (method === 'GET') return { programs: structuredClone(data) }; if (fail) throw new Error('저장 실패'); return method === 'POST' ? { id: 99 } : {}; },
  });
  vm.runInContext(curriculumSource, context);
  vm.runInContext(source, context);
  return {
    open: () => routes[0].fn(), node, calls, alerts, notices, context, clickListeners,
    get html() { return html; }, get rows() { return list.innerHTML; },
    search(value) { node('pm-search').value = value; node('pm-search').oninput(); },
    filter: value => node(`status-${value}`).onclick(),
    treeFilter: filter => node(`tree:${JSON.stringify(filter)}`).onclick(),
    fail: value => { fail = value; }, confirm: value => { confirm = value; },
    get disposeCount() { return disposeCount; },
  };
}

test('list presents full titles, saved lesson counts and protected actions inside more details', async () => {
  const u = ui(); await u.open();
  assert.match(u.rows, /AI로 탐구하는 삼국시대 — 전체 제목 표시/);
  assert.match(u.rows, /10차시 \/ 5차시 \/ 3차시/);
  assert.match(u.rows, /원본 1차시 · 구성 미설정/);
  assert.match(u.rows, /class="btn btn-soft pm-configure" href="#\/manage\/1"/);
  assert.match(u.rows, /<details class="pm-more">[\s\S]*?기본정보 편집[\s\S]*?data-pub="1"[\s\S]*?data-del="1"[\s\S]*?<\/details>/);
  assert.doesNotMatch(u.rows, /🟢|⚪|dl-title|dl-actions/);
  assert.equal(u.context.shellOptions.showSearch, false);
});

test('search and publication filters combine, survive returning from edit, and reset together', async () => {
  const u = ui(); await u.open();
  u.search('  과학 '); assert.match(u.rows, /식물 관찰/); assert.doesNotMatch(u.rows, /삼국시대/);
  u.filter('published'); assert.match(u.rows, /조건에 맞는 수업이 없습니다/);
  u.node('pm-reset').onclick(); assert.match(u.rows, /삼국시대/); assert.match(u.rows, /식물 관찰/);
  u.search('초3'); u.context.disposeShell(); await u.open();
  assert.match(u.html, /value="초3"/); assert.doesNotMatch(u.rows, /삼국시대/);
  assert.equal(u.clickListeners.size, 1);
  assert.equal(u.disposeCount, 1);
});

test('publication failure preserves state and successful retry updates the active filter and counts', async () => {
  const u = ui(); await u.open(); u.filter('private'); u.fail(true);
  await u.node('pub-2').onclick();
  assert.match(u.rows, /식물 관찰/); assert.equal(u.node('pub-2').disabled, false); assert.equal(u.notices.at(-1), '저장 실패');
  u.fail(false); await u.node('pub-2').onclick();
  assert.match(u.rows, /조건에 맞는 수업이 없습니다/);
  assert.equal(u.node('count-private').textContent, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(u.calls.at(-1))), { method: 'PATCH', url: '/api/programs/2', body: { published: true } });
});

test('deletion shows the full target name, cancellation sends nothing, and success removes only that item', async () => {
  const u = ui(); await u.open(); u.confirm(false);
  await u.node('del-2').onclick();
  assert.match(u.alerts[0], /“식물 관찰”/);
  assert.equal(u.calls.filter(c => c.method === 'DELETE').length, 0);
  u.confirm(true); await u.node('del-2').onclick();
  assert.deepEqual(u.calls.filter(c => c.method === 'DELETE').map(c => c.url), ['/api/programs/2']);
  assert.match(u.rows, /삼국시대/); assert.doesNotMatch(u.rows, /식물 관찰/);
});

test('non-admins cannot fetch the manager list and titles remain escaped', async () => {
  const teacher = ui({ role: 'teacher' }); await teacher.open(); assert.equal(teacher.calls.length, 0); assert.equal(teacher.context.location.hash, '#/');
  const u = ui();
  const html = vm.runInContext(`programManagerRow({id: 1, title: '<img src=x onerror=bad>', published: true, category: '<script>bad</script>'})`, u.context);
  assert.doesNotMatch(html, /<img|<script>/); assert.match(html, /&lt;img/);
});

test('unknown configurations are not labeled as a one-lesson course and mobile titles can wrap', () => {
  const u = ui();
  assert.equal(vm.runInContext('programLessonLabel({})', u.context), '차시 구성 미설정');
  assert.equal(vm.runInContext('programLessonLabel({courseSummary:{status:"invalid"}})', u.context), '수업 구성 확인 필요');
  assert.match(css, /\.pm-heading h2 \{[^}]*white-space: normal;[^}]*word-break: keep-all;[^}]*overflow-wrap: anywhere/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.pm-item \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.pm-more > summary \{[^}]*width: 44px; height: 44px/);
});


test('tree selection combines with publication/search filters without duplicating multigrade programs', async () => {
  const programs = [...fixture(), { id: 3, title: 'AI 이야기 탐구', published: true, curriculum: { links: [{ school: 'elementary', grade: 2, subject: '국어' }, { school: 'elementary', grade: 3, subject: '과학' }], topic: '이야기와 관찰', purpose: 'teaching' } }];
  const u = ui({ programs }); await u.open();
  u.treeFilter({ school: 'elementary' });
  assert.equal([...u.rows.matchAll(/data-program="3"/g)].length, 1);
  u.treeFilter({ school: 'elementary', grade: 2, subject: '국어' });
  assert.match(u.rows, /AI 이야기 탐구/); assert.doesNotMatch(u.rows, /식물 관찰|삼국시대/);
  assert.match(u.rows, /초등학교 2학년 · 국어/); assert.match(u.rows, /초등학교 3학년 · 과학/);
  u.filter('private'); assert.match(u.rows, /조건에 맞는 수업이 없습니다/);
  u.node('pm-reset').onclick(); assert.match(u.rows, /식물 관찰/); assert.match(u.rows, /삼국시대/);
  u.treeFilter({ school: 'elementary', grade: 3, subject: '' }); assert.match(u.rows, /식물 관찰/); assert.doesNotMatch(u.rows, /AI 이야기 탐구/);
  u.search('과학'); assert.match(u.rows, /식물 관찰/);
});

test('unclassified and explicitly marked test programs remain reachable with no name guessing', async () => {
  const programs = [
    { id: 1, title: 'Career Log E2E', published: true },
    { id: 2, title: '관리자 검증', published: false, curriculum: { links: [{ school: 'middle', grade: 1, subject: '국어' }], purpose: 'test' } },
  ];
  const u = ui({ programs }); await u.open();
  u.treeFilter({ kind: 'test' }); assert.match(u.rows, /관리자 검증/); assert.doesNotMatch(u.rows, /Career Log E2E/);
  assert.match(u.rows, /class="ct-test">테스트·검증용/);
  u.treeFilter({ kind: 'unclassified' }); assert.match(u.rows, /Career Log E2E/); assert.doesNotMatch(u.rows, /관리자 검증/);
  u.treeFilter({ school: 'middle', grade: 1, subject: '국어' }); assert.match(u.rows, /관리자 검증/);
});


test('new program form leads into classification and guards double creation while allowing failed retry', async () => {
  const u = ui(); await u.open(); u.node('btn-new').onclick();
  assert.match(u.node('new-modal').innerHTML, /만들고 학년·교과 설정/);
  assert.doesNotMatch(u.node('new-modal').innerHTML, /id="np-grade"|id="np-cat"/);
  u.node('np-title').value = '우리 이야기'; u.node('np-desc').value = '수업 안내'; u.fail(true);
  await u.node('np-save').onclick();
  assert.equal(u.node('np-save').disabled, false); assert.equal(u.node('np-title').value, '우리 이야기');
  u.fail(false);
  const first = u.node('np-save').onclick(), second = u.node('np-save').onclick();
  await Promise.all([first, second]);
  assert.equal(u.calls.filter(call => call.method === 'POST').length, 2, 'failed attempt + one successful retry');
  assert.deepEqual(JSON.parse(JSON.stringify(u.calls.at(-1).body)), { title: '우리 이야기', description: '수업 안내' });
  assert.equal(u.node('new-modal').removed, true); assert.equal(u.context.location.hash, '#/manage/99');
});
