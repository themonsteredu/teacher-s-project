import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../lib/api.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

// 도구함에 웹사이트 주소가 들어왔다. 표에 칸을 늘리지 않고(전환 모드는 DDL 이 안 돈다)
// mime='text/uri-list' 를 표식으로, storage_path 에 주소를 담는다.
const SITE = { id: 7, title: '오토드로우', description: '', mime: 'text/uri-list', size: 0, storage_path: 'https://www.autodraw.com/', created_by: 2, created_at: '2026-10-28', owner_name: '원장', mine: false };
const APP = { id: 8, title: '붓 웹앱', description: '', mime: 'text/html', size: 2048, storage_path: 'tools/2/x.html', created_by: 2, created_at: '2026-10-28', owner_name: '원장', mine: false };

function harness({ userId = 2, role = 'admin', loggedIn = true, tools = [SITE, APP], shared = [], boardOpen = true, siteOpen = true, studentGate = null } = {}) {
  const calls = { sql: [], inserts: [], updates: [], deletes: [], removed: [], logs: [] };
  const byId = new Map(tools.map((t) => [String(t.id), t]));
  const module = { exports: {} };
  const realBoard = require('../lib/student-board');
  const deps = {
    'node:crypto': require('node:crypto'), './password': {}, './cookies': { parseCookies: () => ({}) },
    './worksheet-headers': require('../lib/worksheet-headers'),
    // 학생 입장 확인만 바꿔 끼운다. 실제 서비스는 DB·학생 계정을 부르므로 여기서는 결과만 흉내 낸다.
    './student-board': { ...realBoard, createService: () => ({ authorizeAccess: async () => { if (studentGate) throw studentGate; return {}; } }) },
    './auth': { getSessionUser: async () => (loggedIn ? { user: { id: userId, role } } : null), roleLevel: (r) => ({ admin: 2, teacher: 1 }[r] || 0) },
    './storage': {
      storageEnabled: true,
      removeObject: async (p) => calls.removed.push(p),
      createSignedDownload: async (p) => `https://storage.test/signed/${p}`,
    },
    './db': {
      TS: (c) => c, ready: async () => {}, getSettings: async () => ({ site_open: siteOpen }),
      log: async (u, a, d) => calls.logs.push(`${a} ${d}`),
      one: async (sql, params) => {
        calls.sql.push(sql);
        if (sql.startsWith('INSERT INTO tools')) { calls.inserts.push(params); return { id: 99 }; }
        if (sql.includes('FROM tools WHERE id = $1 AND (created_by')) {
          const t = byId.get(String(params[0]));
          return t && (String(t.created_by) === String(params[1]) || t.created_by === null) ? t : null;
        }
        if (sql.includes('FROM tools WHERE id = $1')) return byId.get(String(params[0])) || null;
        if (sql.includes('FROM boards WHERE code')) return params[0] === 'ab12cd' ? { id: 31, code: 'ab12cd', is_open: boardOpen, program_id: 5 } : null;
        if (sql.includes('FROM programs WHERE id')) return { id: 5, title: '그림 수업', published: true };
        if (sql.includes('FROM board_items bi JOIN program_links')) return params[0] === 31 && shared.includes(params[1]) ? { '?column?': 1 } : null;
        return null;
      },
      q: async (sql, params) => {
        calls.sql.push(sql);
        if (sql.includes('FROM tools t LEFT JOIN users')) return tools.map((t) => ({ ...t, mine: String(t.created_by) === String(params[0]) }));
        if (sql.startsWith('UPDATE tools')) calls.updates.push({ sql, params });
        if (sql.startsWith('DELETE FROM tools')) calls.deletes.push(params);
        if (sql.startsWith('SELECT id FROM lessons')) return [];
        return [];
      },
    },
  };
  const fetch = async () => ({ ok: true, arrayBuffer: async () => Buffer.from('<html><body>붓 웹앱</body></html>') });
  vm.runInNewContext(source, { module, require: (id) => deps[id], process: { env: {} }, Buffer, URL, fetch, console });
  return {
    calls,
    async call(method, path, body) {
      let status, headers = {}, raw = '';
      await module.exports.handleApi(
        { method, url: path, headers: { host: 'hub.test', origin: 'https://hub.test' } },
        { setHeader() {}, writeHead(s, h) { status = s; headers = h || {}; }, end(v) { raw = v ? String(v) : ''; } },
        path, body);
      let result = null;
      try { result = raw ? JSON.parse(raw) : null; } catch { result = null; }
      return { status, headers, raw, result };
    },
  };
}

test('https 주소는 웹사이트로 저장된다 — mime 표식, 크기 0, storage_path 에 주소', async () => {
  const h = harness();
  const { status } = await h.call('POST', '/api/tools/site', { title: '  패들렛  ', url: ' https://padlet.com/moakit/board ', description: '모둠 게시판' });
  assert.equal(status, 200);
  const [title, description, mime, size, path, owner] = h.calls.inserts[0];
  assert.equal(title, '패들렛');
  assert.equal(description, '모둠 게시판');
  assert.equal(mime, 'text/uri-list');
  assert.equal(size, 0);
  assert.equal(path, 'https://padlet.com/moakit/board', '앞뒤 빈칸만 지우고 주소는 그대로');
  assert.equal(owner, 2);
  assert.ok(h.calls.logs.some((l) => l.startsWith('tool_site_added')));
});

test('이름을 비우면 사이트 이름(호스트)으로 저장한다', async () => {
  const h = harness();
  await h.call('POST', '/api/tools/site', { title: '', url: 'https://www.canva.com/design/abc' });
  assert.equal(h.calls.inserts[0][0], 'www.canva.com');
});

for (const [why, url] of [
  ['http 는 보안 연결이 아니다', 'http://padlet.com'],
  ['javascript: 주소', 'javascript:alert(1)'],
  ['data: 주소', 'data:text/html,<script>alert(1)</script>'],
  ['주소 안의 빈칸', 'https://padlet .com'],
  ['주소 안의 줄바꿈', 'https://padlet.com/\nevil'],
  ['빈 주소', '   '],
  ['따옴표가 든 주소', 'https://a.com/"onmouseover="x'],
  ['아이디·비밀번호가 든 주소', 'https://user:pw@padlet.com'],
  ['너무 긴 주소', `https://a.com/${'x'.repeat(2000)}`],
]) {
  test(`웹사이트 주소 거부: ${why}`, async () => {
    const h = harness();
    const { status, result } = await h.call('POST', '/api/tools/site', { title: '시험', url });
    assert.equal(status, 400);
    assert.ok(/[가-힣]/.test(result.error), '선생님이 읽을 수 있는 한국어 안내');
    assert.equal(h.calls.inserts.length, 0);
  });
}

test('목록은 종류를 알려 주고, 웹사이트만 주소를 싣고 웹앱의 저장소 경로는 내보내지 않는다', async () => {
  const h = harness({ userId: 1 });
  const { status, result } = await h.call('GET', '/api/tools');
  assert.equal(status, 200);
  const site = result.tools.find((t) => t.id === 7);
  const appRow = result.tools.find((t) => t.id === 8);
  assert.equal(site.kind, 'site');
  assert.equal(site.url, 'https://www.autodraw.com/');
  assert.equal(appRow.kind, 'app');
  assert.equal(appRow.url, undefined);
  assert.ok(!('storage_path' in appRow) && !('storage_path' in site), '저장소 경로는 응답에 싣지 않는다');
  // 관리자 공용 목록의 기존 보장은 그대로
  const sql = h.calls.sql.find((s) => s.includes('FROM tools t'));
  assert.ok(!/WHERE\s+created_by/.test(sql) && sql.includes('LEFT JOIN users') && sql.includes('owner_name') && sql.includes('mine'));
});

test('웹사이트를 지워도 저장소 삭제를 부르지 않는다 — storage_path 가 주소다', async () => {
  const h = harness({ userId: 2 });
  const { status } = await h.call('DELETE', '/api/tools/7');
  assert.equal(status, 200);
  assert.deepEqual(h.calls.removed, []);
  assert.equal(h.calls.deletes.length, 1);
});

test('웹앱 삭제는 예전대로 저장소 원본을 지운다', async () => {
  const h = harness({ userId: 2 });
  await h.call('DELETE', '/api/tools/8');
  assert.deepEqual(h.calls.removed, ['tools/2/x.html']);
});

test('남이 추가한 웹사이트는 지울 수 없다 — 웹앱과 같은 소유 규칙', async () => {
  const h = harness({ userId: 1 });
  const { status } = await h.call('DELETE', '/api/tools/7');
  assert.equal(status, 404);
  assert.equal(h.calls.deletes.length, 0);
});

test('웹사이트 주소 고치기도 같은 검사를 거치고, 웹앱에는 주소를 받지 않는다', async () => {
  const bad = harness({ userId: 1 });
  const rejected = await bad.call('PATCH', '/api/tools/7', { title: '오토드로우', url: 'http://www.autodraw.com' });
  assert.equal(rejected.status, 400);
  assert.equal(bad.calls.updates.length, 0, '거부되면 이름도 바꾸지 않는다');

  const ok = harness({ userId: 1 });
  assert.equal((await ok.call('PATCH', '/api/tools/7', { url: 'https://www.autodraw.com/?lang=ko' })).status, 200);
  assert.ok(ok.calls.updates.some((u) => u.sql.includes('storage_path') && u.params[0] === 'https://www.autodraw.com/?lang=ko'));

  const appEdit = harness({ userId: 1 });
  assert.equal((await appEdit.call('PATCH', '/api/tools/8', { title: '새 이름', url: 'https://evil.example/' })).status, 200);
  assert.ok(!appEdit.calls.updates.some((u) => u.sql.includes('storage_path')), '웹앱의 저장소 경로는 화면에서 못 바꾼다');
});

test('교사 실행 경로에서 웹사이트는 그 주소로 넘어간다', async () => {
  const h = harness({ userId: 3, role: 'teacher' });
  const { status, headers } = await h.call('GET', '/api/tools/7/open');
  assert.equal(status, 302);
  assert.equal(headers.Location, 'https://www.autodraw.com/');
  assert.ok(h.calls.logs.some((l) => l.startsWith('tool_opened')));
});

test('학생 경로는 보드에 공유되지 않은 도구를 열지 않는다', async () => {
  const h = harness({ loggedIn: false, shared: ['/api/tools/7/open'] });
  const { status, result } = await h.call('GET', '/api/join-board/ab12cd/tool/8/open');
  assert.equal(status, 403);
  assert.equal(result.error, 'not_shared');
});

test('학생 경로는 공유된 도구함 웹앱을 로그인 없이 연다', async () => {
  const h = harness({ loggedIn: false, shared: ['/api/tools/8/open'] });
  const { status, headers, raw } = await h.call('GET', '/api/join-board/ab12cd/tool/8/open');
  assert.equal(status, 200, '교사 경로(/api/tools/:id/open)는 401 이라 학생 태블릿에서 안 열렸다');
  assert.match(headers['Content-Type'], /text\/html/);
  assert.ok(raw.includes('붓 웹앱'));
  const check = h.calls.sql.find((s) => s.includes('FROM board_items bi JOIN program_links'));
  assert.ok(check.includes("item_type = 'link'"), '학생에게 보이기로 한 링크만 근거가 된다');
});

test('학생 경로에서 공유된 웹사이트 항목은 그 주소로 넘어간다', async () => {
  const h = harness({ loggedIn: false, shared: ['/api/tools/7/open'] });
  const { status, headers } = await h.call('GET', '/api/join-board/ab12cd/tool/7/open');
  assert.equal(status, 302);
  assert.equal(headers.Location, 'https://www.autodraw.com/');
});

test('학생 경로도 마감된 보드·사이트 폐쇄·학생 입장 실패를 그대로 막는다', async () => {
  const closedBoard = harness({ loggedIn: false, shared: ['/api/tools/8/open'], boardOpen: false });
  assert.equal((await closedBoard.call('GET', '/api/join-board/ab12cd/tool/8/open')).status, 403);
  const closedSite = harness({ loggedIn: false, shared: ['/api/tools/8/open'], siteOpen: false });
  assert.equal((await closedSite.call('GET', '/api/join-board/ab12cd/tool/8/open')).result.error, 'site_closed');
  const gate = harness({ loggedIn: false, shared: ['/api/tools/8/open'], studentGate: Object.assign(new Error('학생 계정으로 로그인하세요.'), { status: 401 }) });
  assert.equal((await gate.call('GET', '/api/join-board/ab12cd/tool/8/open')).status, 401);
});

// ---- 화면 쪽: 피커가 만드는 링크와 학생 화면의 주소 ----
const esc = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
const picker = vm.createContext({ esc, icon: (n) => `<svg data-icon="${n}"></svg>`, URL });
vm.runInContext(app.slice(app.indexOf('/* ---------------- 도구함 피커'), app.indexOf('function openToolPicker(')), picker);
const student = vm.createContext({ esc, URL, location: { origin: 'https://hub.test' }, videoEmbed: () => '' });
vm.runInContext(app.slice(app.indexOf('function careerMaterialUrl('), app.indexOf('// 학생: 공유된 파일 열람')), student);
const address = vm.createContext({});
vm.runInContext(app.slice(app.indexOf('function siteAddress('), app.indexOf('route(/^#\\/tools$/')), address);

test('피커에서 웹사이트를 고르면 주소를 그대로 복사한 보통 링크가 된다', () => {
  const link = picker.toolLink({ id: 7, kind: 'site', title: '오토드로우', url: 'https://www.autodraw.com/' }, 3);
  assert.deepEqual({ ...link }, { kind: 'link', label: '오토드로우', url: 'https://www.autodraw.com/', lesson_id: 3 });
  const appLink = picker.toolLink({ id: 8, kind: 'app', title: '붓 웹앱' });
  assert.equal(appLink.kind, 'aiapp');
  assert.equal(appLink.url, '/api/tools/8/open', '웹앱은 예전대로');
  assert.equal(picker.siteHost('https://padlet.com/moakit/board?x=1'), 'padlet.com');
  assert.ok(picker.toolKindBadge({ kind: 'site' }).includes('웹사이트'));
  assert.ok(picker.toolKindBadge({ kind: 'app' }).includes('웹앱'));
});

test('복사된 웹사이트 주소는 수업 링크 저장 검사를 그대로 통과한다', async () => {
  const h = harness({ userId: 1 });
  const link = picker.toolLink({ id: 7, kind: 'site', title: '오토드로우', url: 'https://www.autodraw.com/' });
  const { status, result } = await h.call('PUT', '/api/programs/5/links', { links: [{ ...link }] });
  assert.equal(status, 200);
  assert.equal(result.count, 1);
});

test('학생 화면에서 도구함 웹앱 링크는 보드 코드로 여는 학생 경로가 된다', () => {
  const html = student.studentMaterialsHtml({ links: [
    { kind: 'aiapp', label: '붓 웹앱', url: '/api/tools/8/open' },
    { kind: 'link', label: '종류를 바꿔 저장한 웹앱', url: '/api/tools/9/open' },
    { kind: 'link', label: '오토드로우', url: 'https://www.autodraw.com/' },
  ], files: [] }, 'ab12cd');
  assert.ok(html.includes('href="/api/join-board/ab12cd/tool/8/open"'));
  assert.ok(html.includes('href="/api/join-board/ab12cd/tool/9/open"'));
  assert.ok(!html.includes('href="/api/tools/'), '교사 로그인이 필요한 주소가 학생 화면에 남으면 401');
  assert.equal((html.match(/🖥 웹앱/g) || []).length, 2);
  assert.ok(html.includes('href="https://www.autodraw.com/"') && html.includes('🔗 링크'), '웹사이트는 보통 링크 그대로');
  assert.equal(student.careerMaterialUrl({ kind: 'aiapp', url: '/api/tools/8/open' }, 'bad code!'), '/api/tools/8/open', '코드가 이상하면 바꾸지 않는다');
});

test('주소 입력 확인: 앞부분이 없으면 https:// 를 붙이고, http·javascript 는 받지 않는다', () => {
  assert.equal(address.siteAddress(' www.autodraw.com ').url, 'https://www.autodraw.com');
  assert.equal(address.siteAddress('https://padlet.com/moakit').url, 'https://padlet.com/moakit');
  for (const bad of ['', 'http://padlet.com', 'javascript:alert(1)', 'data:text/html,x', 'https://pad let.com', '//padlet.com']) {
    assert.ok(address.siteAddress(bad).error, `${JSON.stringify(bad)} 는 거부`);
  }
});

test('도구함 화면: 웹사이트 삭제 안내와 접힌 수정 칸', () => {
  assert.ok(app.includes('이미 이 주소를 붙여 둔 수업은 주소가 복사돼 있어 그대로 열립니다'), '웹사이트 삭제는 이미 붙인 수업을 죽이지 않는다고 알린다');
  assert.ok(app.includes('rel="noopener">${icon(\'link\')} 열기'), '열기는 새 탭 + noopener');
  assert.ok(/aria-expanded="false" aria-controls="tsedit-/.test(app), '수정 칸을 여닫는 단추는 상태를 알린다');
  assert.ok(/\.tool-edit\[hidden\]\s*\{\s*display:\s*none/.test(css), '.form-grid 의 display:grid 가 hidden 을 이기지 않게');
});
