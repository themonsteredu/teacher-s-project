import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const shellSource = source.slice(0, source.indexOf('/* ---------------- 로그인 ---------------- */'));
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

function ui({ mobile = false, role = 'admin', hash = '#/', overflow = '' } = {}) {
  const nodes = new Map(), resizeListeners = new Set(), calls = [];
  const document = {
    activeElement: null, body: { style: { overflow } },
    addEventListener() {},
    getElementById: id => node(id),
  };
  function node(id) {
    if (!nodes.has(id)) {
      const attributes = new Map(), classes = new Set();
      nodes.set(id, {
        id, innerHTML: '', inert: false, hidden: false,
        classList: {
          toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
          contains: name => classes.has(name),
        },
        setAttribute: (name, value) => attributes.set(name, value),
        getAttribute: name => attributes.get(name) ?? null,
        removeAttribute: name => attributes.delete(name),
        focus() { document.activeElement = this; },
      });
    }
    return nodes.get(id);
  }
  const focusable = [node('brand-link'), node('btn-menu-close'), node('active-link'), node('moakit-link')];
  node('hub-sidebar').querySelectorAll = () => focusable;
  node('hub-sidebar').querySelector = () => node('active-link');
  node('hub-sidebar').contains = el => focusable.includes(el);
  const media = {
    matches: mobile,
    addEventListener: (type, fn) => resizeListeners.add(fn),
    removeEventListener: (type, fn) => resizeListeners.delete(fn),
  };
  const context = vm.createContext({
    document, location: { hash }, console,
    window: { addEventListener() {}, matchMedia: () => media },
  });
  vm.runInContext(shellSource, context);
  context.mockApi = async (...args) => { calls.push(args); return {}; };
  vm.runInContext(`api = mockApi; state.me = {name: '화면 검증', role: '${role}', roleLabel: '${role === 'admin' ? '관리자' : '교사'}'};`, context);
  const render = title => {
    context.fixtureTitle = title;
    vm.runInContext('shell(fixtureTitle, "<h1>수업 자료</h1>")', context);
  };
  render('프로그램');
  return {
    node, document, calls, media, resizeListeners, context, render,
    get html() { return node('app').innerHTML; },
    state: () => vm.runInContext('state', context),
    open: () => node('btn-hamburger').onclick(),
    key(key, shiftKey = false) {
      let prevented = false;
      node('hub-layout').onkeydown({ key, shiftKey, preventDefault() { prevented = true; } });
      return prevented;
    },
    resize(matches) { media.matches = matches; for (const listener of [...resizeListeners]) listener(); },
    navigate: () => vm.runInContext('navigate()', context),
  };
}

test('admin navigation lives in the left sidebar, not the top bar', () => {
  const u = ui();
  const sidebar = u.html.match(/<aside[\s\S]*?<\/aside>/)[0];
  const topbar = u.html.match(/<header[\s\S]*?<\/header>/)[0];
  for (const label of ['프로그램', '내 수업', '프로그램 관리', '내 도구함', '교사 계정', '사이트 설정', '이용 기록', '내 설정']) {
    assert.ok(sidebar.includes(`<span>${label}</span>`));
  }
  assert.doesNotMatch(topbar, /<nav/);
  assert.match(topbar, /id="global-search"/);
  assert.match(topbar, /id="btn-logout"/);
  assert.equal(u.node('hub-sidebar').inert, false);
  assert.equal(u.node('hub-workspace').inert, false);
});

test('teacher permissions keep the original three menu destinations', () => {
  const nav = ui({ role: 'teacher' }).html.match(/<nav[\s\S]*?<\/nav>/)[0];
  assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(m => m[1]), ['#/', '#/myclass', '#/settings']);
  assert.doesNotMatch(nav, /교사 계정|사이트 설정|프로그램 관리/);
});

test('detail and curriculum editor routes highlight the correct parent menu', () => {
  for (const [hash, parent] of [
    ['#/program/3', '#/'], ['#/boardview/6', '#/myclass'], ['#/manage/3', '#/manage'],
    ['#/resources/3', '#/manage'], ['#/tools', '#/tools'], ['#/password', '#/settings'],
  ]) {
    const html = ui({ hash }).html;
    assert.ok(html.includes(`href="${parent}" class="active" aria-current="page"`), hash);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  }
});

test('mobile drawer opens with modal semantics and Escape restores focus and scrolling', () => {
  const u = ui({ mobile: true, overflow: 'auto' });
  assert.equal(u.node('hub-sidebar').inert, true);
  u.open();
  assert.equal(u.node('btn-hamburger').getAttribute('aria-expanded'), 'true');
  assert.equal(u.node('hub-sidebar').getAttribute('role'), 'dialog');
  assert.equal(u.node('hub-sidebar').getAttribute('aria-modal'), 'true');
  assert.equal(u.node('hub-sidebar').inert, false);
  assert.equal(u.node('hub-workspace').inert, true);
  assert.equal(u.node('hub-menu-backdrop').hidden, false);
  assert.equal(u.document.body.style.overflow, 'hidden');
  assert.equal(u.document.activeElement.id, 'btn-menu-close');
  assert.equal(u.key('Escape'), true);
  assert.equal(u.node('btn-hamburger').getAttribute('aria-expanded'), 'false');
  assert.equal(u.node('hub-sidebar').getAttribute('aria-modal'), null);
  assert.equal(u.node('hub-workspace').inert, false);
  assert.equal(u.node('hub-menu-backdrop').hidden, true);
  assert.equal(u.document.body.style.overflow, 'auto');
  assert.equal(u.document.activeElement.id, 'btn-hamburger');
});

test('drawer close button and backdrop both restore the trigger focus', () => {
  for (const id of ['btn-menu-close', 'hub-menu-backdrop']) {
    const u = ui({ mobile: true });
    u.open(); u.node(id).onclick();
    assert.equal(u.node('hub-sidebar').inert, true);
    assert.equal(u.document.activeElement.id, 'btn-hamburger');
  }
});

test('keyboard Tab remains inside the mobile menu without trapping desktop navigation', () => {
  const u = ui({ mobile: true }); u.open();
  u.node('moakit-link').focus();
  assert.equal(u.key('Tab'), true);
  assert.equal(u.document.activeElement.id, 'brand-link');
  assert.equal(u.key('Tab', true), true);
  assert.equal(u.document.activeElement.id, 'moakit-link');
  u.key('Escape');
  assert.equal(u.key('Tab'), false);
});

test('crossing the mobile breakpoint releases inert state and moves focus out of hidden controls', () => {
  const u = ui({ mobile: true }); u.open(); u.resize(false);
  assert.equal(u.node('hub-sidebar').inert, false);
  assert.equal(u.node('hub-workspace').inert, false);
  assert.equal(u.document.body.style.overflow, '');
  assert.equal(u.document.activeElement.id, 'active-link');
  u.node('active-link').focus(); u.resize(true);
  assert.equal(u.node('hub-sidebar').inert, true);
  assert.equal(u.document.activeElement.id, 'btn-hamburger');
  u.resize(false);
  assert.equal(u.document.activeElement.id, 'active-link');
});

test('navigation and repeated shell redraws dispose menu listeners and scroll locks', async () => {
  const u = ui({ mobile: true });
  u.open(); u.render('수업 등록');
  assert.equal(u.document.body.style.overflow, '');
  assert.equal(u.resizeListeners.size, 1);
  u.open(); u.context.location.hash = '#/login'; await u.navigate();
  assert.equal(u.document.body.style.overflow, '');
  assert.equal(u.resizeListeners.size, 0);
  assert.equal(u.node('hub-layout').onkeydown, null);
});

test('program search preserves its original query and navigation behavior', async () => {
  const u = ui({ hash: '#/myclass' });
  u.node('global-search').onkeydown({ key: 'Enter', target: { value: '  인공지능  ' } });
  assert.equal(u.state().search, '인공지능');
  assert.equal(u.context.location.hash, '#/');
  u.render('프로그램');
  assert.match(u.html, /value="인공지능"/);
  await u.node('btn-logout').onclick();
  assert.deepEqual(u.calls, [['POST', '/api/logout']]);
  assert.equal(u.state().me, null);
  assert.equal(u.context.location.hash, '#/login');
});

test('shell escapes page title, account labels and the search value', () => {
  const u = ui();
  vm.runInContext(`state.me.name = '<img onerror="bad">'; state.search = '\" autofocus onfocus=bad';`, u.context);
  u.render('<script>bad</script>');
  assert.doesNotMatch(u.html, /<script>bad|<img onerror/);
  assert.match(u.html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(u.html, /value="&quot; autofocus onfocus=bad"/);
});

test('sidebar styles include responsive width, visible mobile search, keyboard focus and reduced motion', () => {
  assert.match(css, /grid-template-columns: 232px minmax\(0, 1fr\)/);
  assert.match(css, /\.hub-sidebar[\s\S]*?height: 100dvh/);
  assert.match(css, /@media \(max-width: 920px\)/);
  assert.match(css, /width: min\(288px, calc\(100vw - 48px\)\)/);
  assert.match(css, /\.topbar \.search-box \{ order: 1; flex: 1 0 100%; width: 100%; max-width: none; \}/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /word-break: keep-all/);
  assert.match(css, /SCDreamRegular\.woff2/);
  assert.doesNotMatch(css, /\.topbar\.nav-open \.tb-nav/);
});
