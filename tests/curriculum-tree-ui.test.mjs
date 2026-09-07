import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('function curriculumFilterKey'), app.indexOf('/* ---------------- 프로그램 상세'));
const classification = readFileSync(new URL('../public/curriculum.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/curriculum-tree.css', import.meta.url), 'utf8');
const fixture = [
  { id: 1, title: '이야기와 관찰', published: true, curriculum: { links: [{ school: 'elementary', grade: 2, subject: '국어' }, { school: 'elementary', grade: 3, subject: '과학' }], topic: '탐구', purpose: 'teaching' } },
  { id: 2, title: 'Legacy test label', grade: '초2', category: '기존 분류', published: true },
  { id: 3, title: '검증 자료', published: true, curriculum: { links: [], purpose: 'test' } },
  { id: 4, title: '<img src=x onerror=bad>', description: '<script>bad</script>', published: true, curriculum: { links: [{ school: 'middle', grade: 1, subject: '국어' }], topic: '<b>원문</b>' } },
];

function ui() {
  let html = '', callback;
  const nodes = new Map(), calls = [];
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      innerHTML: '', textContent: '', dataset: {}, attributes: {},
      setAttribute(key, value) { this.attributes[key] = value; },
      classList: { collapsed: true, toggle() { this.collapsed = !this.collapsed; return this.collapsed; } },
    });
    return nodes.get(id);
  }
  const tree = node('catalog-tree');
  tree.querySelectorAll = () => [...html.matchAll(/data-ct-filter="([^"]+)"/g)].map(match => {
    const key = match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&');
    const button = node(`filter:${key}`); button.dataset.ctFilter = key; return button;
  });
  tree.querySelector = selector => selector === '[data-ct-current]' ? node('current') : node('toggle');
  const context = vm.createContext({
    document: { getElementById: node }, state: { search: '' },
    isAdmin: () => false,
    esc: v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
    icon: () => '<svg aria-hidden="true"></svg>', route: (pattern, fn) => { callback = fn; },
    shell: (title, content) => { html = content; },
    api: async (method, path) => { calls.push({ method, path }); return { programs: structuredClone(fixture) }; },
  });
  vm.runInContext(classification, context);
  vm.runInContext(source, context);
  return {
    open: () => callback(), node, context, calls, get html() { return html; },
    select: filter => node(`filter:${JSON.stringify(filter)}`).onclick(),
    get rows() { return node('catalog-list').innerHTML; },
  };
}

test('tree counts unique programs rather than associations, with legacy unknown subject and zero groups accessible', async () => {
  const u = ui(); await u.open();
  const filters = [...u.html.matchAll(/data-ct-filter="([^"]+)"[^>]*><span>([^<]+)<\/span><span class="ct-count">(\d+)<\/span>/g)].map(match => ({ filter: JSON.parse(match[1].replaceAll('&quot;', '"')), label: match[2], count: Number(match[3]) }));
  const count = filter => filters.find(item => JSON.stringify(item.filter) === JSON.stringify(filter))?.count;
  assert.equal(count({}), 4);
  assert.equal(count({ school: 'elementary' }), 2);
  assert.equal(count({ school: 'elementary', grade: 2 }), 2);
  assert.equal(count({ school: 'elementary', grade: 2, subject: '국어' }), 1);
  assert.equal(count({ school: 'elementary', grade: 2, subject: '' }), 1);
  assert.equal(count({ school: 'elementary', grade: 2, subject: '과학' }), undefined);
  assert.equal(count({ school: 'high' }), 0);
  assert.equal(count({ kind: 'unclassified' }), 1);
  assert.equal(count({ kind: 'test' }), 1);
  assert.match(u.html, /<details class="ct-school"/); assert.match(u.html, /<details class="ct-grade"/);
});

test('teacher catalog tree handlers update current filter and program list without additional requests', async () => {
  const u = ui(); await u.open();
  u.select({ school: 'elementary' });
  assert.equal([...u.rows.matchAll(/이야기와 관찰/g)].length, 1);
  assert.match(u.rows, /Legacy test label/); assert.doesNotMatch(u.rows, /검증 자료/);
  u.select({ school: 'elementary', grade: 3, subject: '과학' });
  assert.match(u.rows, /이야기와 관찰/); assert.doesNotMatch(u.rows, /Legacy test label/);
  assert.equal(u.node('current').textContent, '초등학교 › 3학년 › 과학');
  assert.equal(u.node('catalog-result-count').textContent, '초등학교 › 3학년 › 과학 · 1개 수업');
  assert.equal(u.node('filter:{"school":"elementary","grade":3,"subject":"과학"}').attributes['aria-pressed'], 'true');
  u.select({ kind: 'test' }); assert.match(u.rows, /검증 자료/); assert.doesNotMatch(u.rows, /Legacy test label/);
  assert.deepEqual(u.calls, [{ method: 'GET', path: '/api/programs' }]);
  assert.doesNotMatch(u.html, /프로그램 관리|\/manage/);
});

test('teacher search includes taxonomy and topic while source content remains escaped', async () => {
  const u = ui();
  vm.runInContext('state.search = "탐구"', u.context); await u.open();
  assert.match(u.rows, /이야기와 관찰/); assert.doesNotMatch(u.rows, /Legacy test label/);
  vm.runInContext('state.search = ""', u.context); await u.open();
  assert.match(u.rows, /&lt;img/); assert.match(u.rows, /&lt;script/); assert.match(u.rows, /&lt;b&gt;원문/);
  assert.doesNotMatch(u.rows, /<img|<script>|<b>원문/);
  assert.match(u.rows, /기존 분류/);
});

test('mobile tree is collapsible with accurate expanded state and preserves selection', async () => {
  const u = ui(); await u.open();
  u.node('toggle').onclick(); assert.equal(u.node('toggle').attributes['aria-expanded'], 'true');
  u.select({ kind: 'unclassified' }); assert.match(u.rows, /검증 자료/);
  u.node('toggle').onclick(); assert.equal(u.node('toggle').attributes['aria-expanded'], 'false');
  assert.equal(u.node('current').textContent, '미분류');
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.ct-layout \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.ct-panel\.is-collapsed \.ct-tree \{ display: none/);
});
