import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// 반 개설 — 반(학교·학년·반)을 먼저 열고, 과정(프로그램)과 도구함 도구는 나중에 더한다.
// 반은 settings 의 sb:cls:<id>, 반 코드 색인은 sb:clscode:<코드>(전환 모드에서는 표를 만들 수 없다).
// 반의 과정은 보드의 sb:class 에 classId 가 붙은 수업이다. 학생은 반 코드 하나로 들어와 고른다.
const require = createRequire(import.meta.url);
const realCrypto = require('node:crypto');
const source = readFileSync(new URL('../lib/api.js', import.meta.url), 'utf8');
const OWNER = 3, OTHER = 4, ADMIN = 1;
const CID = 'aaaaaaaaaaaa', CID2 = 'bbbbbbbbbbbb';

const TOOLS = [
  { id: 7, title: '오토드로우', description: '그림', mime: 'text/uri-list', size: 0, storage_path: 'https://www.autodraw.com/', created_by: 1 },
  { id: 8, title: '붓 웹앱', description: '', mime: 'text/html', size: 2048, storage_path: 'tools/1/x.html', created_by: 1 },
  { id: 9, title: '한글 위키', description: '', mime: 'text/uri-list', size: 0, storage_path: 'https://ko.wikipedia.org/wiki/고양이', created_by: 1 },
];
const classRow = (o = {}) => JSON.stringify({
  id: CID, school: '보성초', grade: 2, room: '3', name: '', code: 'bs23', roster: '김하나\n이두리',
  tools: [7, 8], isOpen: true, createdBy: OWNER, createdAt: '2026-10-28T01:00:00.000Z', ...o,
});

function harness({ role = 'teacher', userId = OWNER, academy = null, settings: initial = {}, boards: initialBoards = [], siteOpen = true, randomInts = [], strictHeaders = false, throwOnWriteHead = false } = {}) {
  const settings = new Map(Object.entries(initial));
  const boards = new Map(initialBoards.map((b) => [String(b.id), { is_open: true, class_date: null, roster: '', created_at: 'x', ...b }]));
  const programs = new Map([
    ['5', { id: 5, title: 'AI 교재 2학년', published: true }],
    ['6', { id: 6, title: '준비 중 과정', published: false }],
    ['7', { id: 7, title: '나'.repeat(80), published: true }],
  ]);
  const users = new Map([[String(OWNER), { id: OWNER, name: '김선생' }], [String(OTHER), { id: OTHER, name: '박선생' }], [String(ADMIN), { id: ADMIN, name: '원장' }]]);
  const tools = new Map(TOOLS.map((t) => [String(t.id), t]));
  const seen = { writes: [], deletes: [], logs: [], rosterUpdates: [], inserts: [] };
  let nextBoard = 40;
  const ints = [...randomInts];
  const crypto = Object.assign(Object.create(realCrypto), {
    randomInt: (a, b) => (ints.length ? ints.shift() : realCrypto.randomInt(a, b)),
    randomBytes: (n) => realCrypto.randomBytes(n),
  });
  const joinRow = (b) => {
    const p = programs.get(String(b.program_id));
    return { ...b, program_title: p.title, program_published: p.published, teacher_name: '', post_count: 0, item_count: 0 };
  };
  const db = {
    ACADEMY_ID: academy, TS: (c) => c, ready: async () => {},
    getSettings: async () => ({ site_open: siteOpen }),
    log: async (u, a, d) => seen.logs.push(`${a} ${d}`),
    one: async (sql, args) => {
      if (/FROM settings WHERE key ?= ?\$1/.test(sql)) { const v = settings.get(args[0]); return v === undefined ? null : { value: v }; }
      if (sql.startsWith('SELECT * FROM programs')) return programs.get(String(args[0])) || null;
      if (sql.startsWith('SELECT id FROM boards WHERE code')) return [...boards.values()].find((b) => b.code === args[0]) || null;
      if (sql.startsWith('INSERT INTO boards')) {
        if ([...boards.values()].some((b) => b.code === args[2])) throw new Error('duplicate key value violates unique constraint');
        const b = { id: nextBoard++, program_id: args[0], title: args[1], code: args[2], created_by: args[3], class_date: args[4], roster: args[5], is_open: true, created_at: 'x' };
        boards.set(String(b.id), b); seen.inserts.push(b);
        return b;
      }
      if (sql.startsWith('SELECT * FROM boards WHERE id')) return boards.get(String(args[0])) || null;
      if (sql.startsWith('SELECT id FROM users WHERE id')) return users.get(String(args[0])) || null;
      if (sql.startsWith('SELECT * FROM tools WHERE id')) return tools.get(String(args[0])) || null;
      throw new Error(`one: ${sql}`);
    },
    q: async (sql, args) => {
      if (sql.startsWith('INSERT INTO settings')) { seen.writes.push({ sql, key: args[0] }); settings.set(args[0], args[1]); return []; }
      if (sql.startsWith('DELETE FROM settings WHERE key = $1')) { seen.deletes.push(args[0]); settings.delete(args[0]); return []; }
      if (sql.includes("LIKE 'sb:cls:%'")) return [...settings].filter(([k]) => k.startsWith('sb:cls:')).map(([key, value]) => ({ key, value }));
      if (sql.includes("LIKE 'sb:class:%' AND value LIKE $1")) {
        const needle = args[0].replace(/%/g, '');
        return [...settings].filter(([k, v]) => k.startsWith('sb:class:') && v.includes(needle)).map(([key, value]) => ({ key, value }));
      }
      if (sql.includes("LIKE 'sb:class:%' AND value LIKE '%classId%'")) return [...settings].filter(([k, v]) => k.startsWith('sb:class:') && v.includes('classId')).map(([key, value]) => ({ key, value }));
      if (sql.includes("LIKE 'sb:viewers:%'")) return [];
      if (sql.startsWith('SELECT id, name FROM users')) return args[0].map((id) => users.get(String(id))).filter(Boolean);
      if (sql.includes('FROM tools WHERE id = ANY')) return args[0].map((id) => tools.get(String(id))).filter(Boolean);
      if (sql.includes('FROM tools ORDER BY')) return [...tools.values()];
      if (sql.includes('FROM boards b JOIN programs p')) {
        // 반 화면·학생 반 입장은 보드 id 목록, 교사 [내 수업]은 (교사 id, 함께 보기 id)
        const rows = Array.isArray(args?.[0]) ? args[0].map((id) => boards.get(String(id))).filter(Boolean)
          : [...boards.values()].filter((b) => !args || String(b.created_by) === String(args[0]));
        return rows.map(joinRow);
      }
      if (sql.startsWith('SELECT board_id, student_name')) return [];
      if (sql.includes('FROM settings WHERE key=ANY')) return args[0].filter((k) => settings.has(k)).map((key) => ({ key, value: settings.get(key) }));
      if (sql.startsWith('UPDATE boards SET roster = $1 WHERE id = ANY')) {
        seen.rosterUpdates.push(args);
        for (const id of args[1]) boards.get(String(id)).roster = args[0];
        return [];
      }
      if (sql.startsWith('UPDATE boards')) return [];
      throw new Error(`q: ${sql}`);
    },
  };
  db.transaction = async (fn) => fn(db);
  const deps = {
    'node:crypto': crypto, './db': db, './password': {}, './cookies': { parseCookies: () => ({}) },
    './worksheet-headers': require('../lib/worksheet-headers'), './student-board': require('../lib/student-board'),
    './auth': { getSessionUser: async () => ({ user: { id: userId, role } }), roleLevel: (r) => (r === 'admin' ? 2 : 1) },
    './storage': { storageEnabled: false },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, require: (id) => { if (!(id in deps)) throw new Error(`Unexpected module ${id}`); return deps[id]; }, process: { env: {} }, Buffer, URL });
  return {
    seen, settings, boards,
    cls: (id = CID) => JSON.parse(settings.get(`sb:cls:${id}`) || 'null'),
    async call(method, path, body = {}) {
      let status, headers = {}, raw = '';
      const res = {
        setHeader(k, v) { headers[k] = v; },
        writeHead(s, h = {}) {
          if (throwOnWriteHead) throw new Error('writeHead failed');
          // Node 처럼 머리 값에 ASCII 밖 글자가 있으면 던진다(ERR_INVALID_CHAR)
          if (strictHeaders) for (const v of Object.values(h)) if (/[^\t\x20-\x7e]/.test(String(v))) throw Object.assign(new TypeError('Invalid character in header content'), { code: 'ERR_INVALID_CHAR' });
          status = s; headers = { ...headers, ...h };
        },
        end(v) { raw = v ? String(v) : ''; },
      };
      await module.exports.handleApi({ method, headers: { host: 'hub.test', origin: 'https://hub.test' } }, res, path, body);
      let result = null;
      try { result = raw ? JSON.parse(raw) : null; } catch { result = null; }
      return { status, headers, result };
    },
  };
}

// 반 하나(CID, 코드 bs23) + 그 반의 과정 두 개(41 공개·열림, 42 마감) + 다른 수업 50
function withClass(opts = {}) {
  return harness({
    ...opts,
    settings: {
      [`sb:cls:${CID}`]: classRow(), [`sb:clscode:bs23`]: CID,
      'sb:class:41': JSON.stringify({ school: '보성초', grade: 2, room: '3', classId: CID }),
      'sb:class:42': JSON.stringify({ school: '보성초', grade: 2, room: '3', classId: CID }),
      ...(opts.settings || {}),
    },
    boards: [
      { id: 41, program_id: 5, title: '2학년 3반 · AI 교재 2학년', code: '111111', created_by: OWNER, roster: '김하나\n이두리' },
      { id: 42, program_id: 5, title: '2학년 3반 · 지난 과정', code: '222222', created_by: OWNER, is_open: false },
      { id: 50, program_id: 5, title: '혼자 수업', code: 'solo50', created_by: OWNER },
      { id: 60, program_id: 5, title: '박선생 수업', code: 'park60', created_by: OTHER },
      ...(opts.boards || []),
    ],
  });
}

test('반 개설: sb:cls 와 코드 색인이 생기고, 칸은 normClassInfo 로 정리된다', async () => {
  const h = harness({ randomInts: [345678] });
  const { status, result } = await h.call('POST', '/api/classes', { school: '  보성초 ', grade: '2학년', room: '3반', roster: '김하나, 이두리\n김하나' });
  assert.equal(status, 200);
  assert.match(result.id, /^[0-9a-f]{12}$/);
  assert.equal(result.code, '345678', '코드를 비우면 6자리 숫자');
  assert.equal(h.settings.get('sb:clscode:345678'), result.id);
  const c = h.cls(result.id);
  assert.deepEqual([c.school, c.grade, c.room, c.name, c.roster, c.isOpen, c.createdBy], ['보성초', 2, '3', '', '김하나\n이두리', true, OWNER]);
  assert.deepEqual(c.tools, []);
  assert.ok(h.seen.writes.every((w) => /ON CONFLICT/.test(w.sql)), '일반 모드는 upsert');
  assert.ok(h.seen.logs.some((l) => l.startsWith('class_created')));
});

test('전환 모드(ACADEMY_ID)에서는 ON CONFLICT 없이 넣는다', async () => {
  const h = harness({ academy: 'academy-1' });
  const { status } = await h.call('POST', '/api/classes', { grade: 3, room: 1, code: 'Bs31' });
  assert.equal(status, 200);
  assert.ok(h.seen.writes.length >= 2);
  assert.ok(h.seen.writes.every((w) => !/ON CONFLICT/.test(w.sql)));
  assert.ok(h.settings.has('sb:clscode:bs31'), '코드는 소문자로');
});

test('학년·반·반 이름이 모두 없으면 400 이고 아무것도 쓰지 않는다', async () => {
  const h = harness();
  const { status, result } = await h.call('POST', '/api/classes', { school: '보성초' });
  assert.equal(status, 400);
  assert.match(result.error, /[가-힣]/);
  assert.equal(h.seen.writes.length, 0);
  const named = await h.call('POST', '/api/classes', { name: '방과후 미술반' });
  assert.equal(named.status, 200, '반 이름만 있어도 된다');
});

test('코드 중복 — 반 코드는 수업 코드·다른 반 코드와 겹치면 안 되고, 모양이 틀려도 막는다', async () => {
  for (const [code, why] of [['111111', '수업 코드'], ['bs23', '다른 반 코드'], ['ab', '너무 짧음'], ['가나다라', '한글']]) {
    const h = withClass();
    const before = h.seen.writes.length;
    const { status, result } = await h.call('POST', '/api/classes', { grade: 4, room: 2, code });
    assert.equal(status, 400, why);
    assert.match(result.error, /[가-힣]/);
    assert.equal(h.seen.writes.length, before, `${why}: 아무것도 쓰지 않는다`);
  }
});

test('코드 중복 — 수업을 만들 때도 반 코드를 피한다(직접 넣은 코드·자동 코드 모두)', async () => {
  const h = withClass({ settings: { 'sb:clscode:777777': CID2, [`sb:cls:${CID2}`]: classRow({ id: CID2, code: '777777' }) }, randomInts: [777777, 888888] });
  const custom = await h.call('POST', '/api/programs/5/boards', { title: '분수', code: 'BS23' });
  assert.equal(custom.status, 400, '반 코드와 같은 수업 코드는 안 된다');
  assert.match(custom.result.error, /이미 사용 중/);
  const auto = await h.call('POST', '/api/programs/5/boards', { title: '분수' });
  assert.equal(auto.status, 200);
  assert.equal(auto.result.code, '888888', '반 코드 777777 은 건너뛴다');
});

test('색인만 남고 반이 없으면 그 코드는 막히지 않는다(반 줄 쓰기가 끊긴 경우)', async () => {
  const h = harness({ settings: { 'sb:clscode:lost1': CID2 } });
  const { status } = await h.call('POST', '/api/classes', { grade: 1, room: 1, code: 'lost1' });
  assert.equal(status, 200);
});

test('반 목록: 교사는 자기 반만, 지운 도구는 빠지고 과정 수가 붙는다', async () => {
  const h = withClass({ settings: { [`sb:cls:${CID2}`]: classRow({ id: CID2, code: 'park1', createdBy: OTHER, tools: [] }), 'sb:clscode:park1': CID2 } });
  h.settings.set(`sb:cls:${CID}`, classRow({ tools: [7, 999, 8] }));
  const { status, result } = await h.call('GET', '/api/classes');
  assert.equal(status, 200);
  assert.equal(result.classes.length, 1);
  const c = result.classes[0];
  assert.equal(c.label, '2학년 3반');
  assert.equal(c.curriculumCount, 2);
  assert.equal(c.rosterCount, 2);
  assert.deepEqual(c.tools, [
    { id: 7, title: '오토드로우', kind: 'site', url: 'https://www.autodraw.com/' },
    { id: 8, title: '붓 웹앱', kind: 'app' },
  ]);
  assert.equal(c.ownerName, undefined, '교사 응답에는 주인 이름이 없다');
  assert.equal(c.mine, true);
});

test('반 목록: 관리자는 모든 반 + 주인 이름', async () => {
  const h = withClass({ role: 'admin', userId: ADMIN, settings: { [`sb:cls:${CID2}`]: classRow({ id: CID2, code: 'park1', createdBy: OTHER, name: '방과후반' }), 'sb:clscode:park1': CID2 } });
  const { result } = await h.call('GET', '/api/classes');
  assert.equal(result.classes.length, 2);
  const park = result.classes.find((c) => c.id === CID2);
  assert.equal(park.ownerName, '박선생');
  assert.equal(park.label, '방과후반', '반 이름이 있으면 그것이 이름표');
});

test('반 화면: 과정(연결된 수업)과 도구 — 남의 반은 403, 없는 반은 404', async () => {
  const h = withClass();
  const { status, result } = await h.call('GET', `/api/classes/${CID}`);
  assert.equal(status, 200);
  assert.deepEqual(result.curricula.map((b) => [b.id, b.code, b.isOpen, b.programTitle]), [[41, '111111', true, 'AI 교재 2학년'], [42, '222222', false, 'AI 교재 2학년']]);
  assert.equal(result.curricula[0].roster.total, 2);
  assert.equal(result.class.code, 'bs23');
  assert.equal(result.tools.length, 2);
  assert.equal((await withClass({ userId: OTHER }).call('GET', `/api/classes/${CID}`)).status, 403);
  assert.equal((await withClass().call('GET', `/api/classes/${CID2}`)).status, 404);
  assert.equal((await withClass({ role: 'admin', userId: ADMIN }).call('GET', `/api/classes/${CID}`)).status, 200);
});

test('반 고치기: 학교·학년·반을 바꾸면 과정들의 sb:class 도 따라가고 classId 는 남는다', async () => {
  const h = withClass();
  const { status } = await h.call('PATCH', `/api/classes/${CID}`, { grade: '3', room: '1반' });
  assert.equal(status, 200);
  const c = h.cls();
  assert.deepEqual([c.school, c.grade, c.room], ['보성초', 3, '1'], '안 보낸 학교는 그대로');
  for (const id of [41, 42]) assert.deepEqual(JSON.parse(h.settings.get(`sb:class:${id}`)), { school: '보성초', grade: 3, room: '1', classId: CID });
  assert.equal(h.settings.get('sb:class:50'), undefined, '다른 수업은 건드리지 않는다');
  assert.equal(h.seen.rosterUpdates.length, 0, '명단을 안 보냈으면 수업 명단도 그대로');
});

test('반 고치기: 명단을 바꾸면 그 반 과정들의 명단도 함께 바뀐다', async () => {
  const h = withClass();
  await h.call('PATCH', `/api/classes/${CID}`, { roster: '김하나\n이두리\n박세나' });
  assert.equal(h.cls().roster, '김하나\n이두리\n박세나');
  // vm 안에서 만든 배열이라 JSON 으로 옮겨 비교한다
  assert.deepEqual(JSON.parse(JSON.stringify(h.seen.rosterUpdates)), [['김하나\n이두리\n박세나', ['41', '42']]]);
  assert.equal(h.boards.get('50').roster, '', '반에 안 속한 수업은 그대로');
});

test('반 고치기: 코드를 바꾸면 색인이 옮겨 가고, 겹치는 코드는 아무것도 안 바꾼다', async () => {
  const h = withClass();
  const taken = await h.call('PATCH', `/api/classes/${CID}`, { code: 'solo50', name: '바뀌면 안 됨' });
  assert.equal(taken.status, 400);
  assert.equal(h.cls().name, '', '실패하면 다른 칸도 그대로');
  const ok = await h.call('PATCH', `/api/classes/${CID}`, { code: 'BS23NEW' });
  assert.equal(ok.status, 200);
  assert.equal(h.cls().code, 'bs23new');
  assert.equal(h.settings.get('sb:clscode:bs23new'), CID);
  assert.equal(h.settings.has('sb:clscode:bs23'), false, '옛 색인은 지운다');
  assert.equal((await h.call('PATCH', `/api/classes/${CID}`, { grade: '', room: '', name: '' })).status, 400, '이름표가 사라지면 안 된다');
});

test('반 지우기: 과정이 남아 있으면 409, 비면 반 줄과 색인을 지운다', async () => {
  const h = withClass();
  const refused = await h.call('DELETE', `/api/classes/${CID}`);
  assert.equal(refused.status, 409);
  assert.match(refused.result.error, /과정을 먼저 지우거나 다른 반으로 옮기세요/);
  assert.ok(h.settings.has(`sb:cls:${CID}`));
  h.settings.delete('sb:class:41'); h.settings.delete('sb:class:42');
  assert.equal((await withClass({ userId: OTHER }).call('DELETE', `/api/classes/${CID}`)).status, 403);
  const ok = await h.call('DELETE', `/api/classes/${CID}`);
  assert.equal(ok.status, 200);
  assert.equal(h.settings.has(`sb:cls:${CID}`), false);
  assert.equal(h.settings.has('sb:clscode:bs23'), false, '색인이 남지 않는다');
});

test('과정 더하기: 이름은 "<반 이름> · <과정>", 명단은 반 명단, sb:class 에 classId', async () => {
  const h = withClass({ randomInts: [123456] });
  const { status, result } = await h.call('POST', `/api/classes/${CID}/curricula`, { programId: 5 });
  assert.equal(status, 200);
  assert.equal(result.code, '123456');
  const b = h.boards.get(String(result.id));
  assert.equal(b.title, '2학년 3반 · AI 교재 2학년');
  assert.equal(b.roster, '김하나\n이두리');
  assert.equal(b.created_by, OWNER);
  assert.deepEqual(JSON.parse(h.settings.get(`sb:class:${result.id}`)), { school: '보성초', grade: 2, room: '3', classId: CID });
});

test('과정 더하기: 교사는 비공개 과정을 못 넣고, 관리자는 넣되 수업 주인은 반을 연 선생님이다', async () => {
  const t = withClass();
  const refused = await t.call('POST', `/api/classes/${CID}/curricula`, { programId: 6 });
  assert.equal(refused.status, 403);
  assert.equal(t.seen.inserts.length, 0);
  assert.equal((await t.call('POST', `/api/classes/${CID}/curricula`, { programId: 'x' })).status, 400);
  assert.equal((await withClass({ userId: OTHER }).call('POST', `/api/classes/${CID}/curricula`, { programId: 5 })).status, 403);
  const a = withClass({ role: 'admin', userId: ADMIN });
  const { status, result } = await a.call('POST', `/api/classes/${CID}/curricula`, { programId: 6 });
  assert.equal(status, 200);
  assert.equal(a.boards.get(String(result.id)).created_by, OWNER);
});

test('과정 이름은 100자에서 자른다', async () => {
  const h = withClass();
  h.settings.set(`sb:cls:${CID}`, classRow({ name: '가'.repeat(60) }));
  const { result } = await h.call('POST', `/api/classes/${CID}/curricula`, { programId: 7 });
  const title = h.boards.get(String(result.id)).title;
  assert.equal(title.length, 100);
  assert.ok(title.startsWith(`${'가'.repeat(60)} · 나`));
});

test('수업을 반에 붙이기(PATCH /api/boards/:id classId) — 수업과 반 모두 내 것이어야 한다', async () => {
  const h = withClass({ settings: { [`sb:cls:${CID2}`]: classRow({ id: CID2, code: 'park1', createdBy: OTHER, school: '다른초', grade: 5, room: '2' }), 'sb:clscode:park1': CID2 } });
  const ok = await h.call('PATCH', '/api/boards/50', { classId: CID });
  assert.equal(ok.status, 200);
  assert.deepEqual(JSON.parse(h.settings.get('sb:class:50')), { school: '보성초', grade: 2, room: '3', classId: CID });
  const foreign = await h.call('PATCH', '/api/boards/41', { classId: CID2, title: '바뀌면 안 됨' });
  assert.equal(foreign.status, 403, '남의 반에는 못 붙인다');
  assert.equal(JSON.parse(h.settings.get('sb:class:41')).classId, CID);
  assert.equal((await h.call('PATCH', '/api/boards/60', { classId: CID })).status, 403, '남의 수업은 못 붙인다');
  assert.equal((await h.call('PATCH', '/api/boards/50', { classId: 'cccccccccccc' })).status, 404);
  const admin = withClass({ role: 'admin', userId: ADMIN, settings: { [`sb:cls:${CID2}`]: classRow({ id: CID2, code: 'park1', createdBy: OTHER, school: '다른초', grade: 5, room: '2' }) } });
  assert.equal((await admin.call('PATCH', '/api/boards/60', { classId: CID2 })).status, 200);
  assert.equal(JSON.parse(admin.settings.get('sb:class:60')).classId, CID2);
});

test('반에서 떼기(classId null) — classId 만 빼고 학교·학년·반은 남긴다, 반 칸만 고쳐도 classId 는 남는다', async () => {
  const h = withClass();
  await h.call('PATCH', '/api/boards/41', { room: '4' });
  assert.deepEqual(JSON.parse(h.settings.get('sb:class:41')), { school: '보성초', grade: 2, room: '4', classId: CID });
  await h.call('PATCH', '/api/boards/41', { classId: null });
  assert.deepEqual(JSON.parse(h.settings.get('sb:class:41')), { school: '보성초', grade: 2, room: '4' });
  const detail = await h.call('GET', `/api/classes/${CID}`);
  assert.deepEqual(detail.result.curricula.map((b) => b.id), [42]);
});

test('[내 수업] classInfo 에 classId 가 실린다', async () => {
  const h = withClass();
  const { status, result } = await h.call('GET', '/api/my-boards');
  assert.equal(status, 200);
  const byId = Object.fromEntries(result.boards.map((b) => [b.id, b.classInfo]));
  assert.equal(byId[41].classId, CID);
  assert.equal(byId[50], null);
});

test('반 도구 고르기: 숫자만, 같은 것은 한 번, 30개까지, 도구함에 있는 것만 — 차례는 그대로', async () => {
  const h = withClass();
  for (const bad of [{ toolIds: 'x' }, { toolIds: [7, 'abc'] }, { toolIds: [7, -1] }, { toolIds: [7, 1.5] }, { toolIds: [7, 999] }, { toolIds: Array.from({ length: 31 }, (_, i) => i + 1) }]) {
    const { status, result } = await h.call('PUT', `/api/classes/${CID}/tools`, bad);
    assert.equal(status, 400, JSON.stringify(bad));
    assert.match(result.error, /[가-힣]/);
  }
  assert.deepEqual(h.cls().tools, [7, 8], '실패하면 그대로');
  const ok = await h.call('PUT', `/api/classes/${CID}/tools`, { toolIds: [9, '7', 9] });
  assert.equal(ok.status, 200);
  assert.deepEqual(h.cls().tools, [9, 7]);
  assert.equal((await withClass({ userId: OTHER }).call('PUT', `/api/classes/${CID}/tools`, { toolIds: [7] })).status, 403);
});

test('도구 고르기 목록(GET /api/tool-library)은 교사도 보고, 저장소 경로를 싣지 않는다', async () => {
  const h = harness();
  const { status, result } = await h.call('GET', '/api/tool-library');
  assert.equal(status, 200);
  assert.equal(result.tools.length, 3);
  for (const t of result.tools) {
    assert.ok(!('storage_path' in t) && !('created_by' in t));
    assert.equal('url' in t, t.kind === 'site');
  }
  assert.ok(!JSON.stringify(result).includes('tools/1/x.html'));
});

test('학생 반 입장: 열린 과정 + 공개 프로그램만, 이름·명단·주인·내부 번호는 없다', async () => {
  const h = withClass({ boards: [{ id: 43, program_id: 6, title: '비공개', code: '333333', created_by: OWNER }], settings: { 'sb:class:43': JSON.stringify({ classId: CID }) } });
  const { status, headers, result } = await h.call('GET', '/api/join-class/BS23');
  assert.equal(status, 200);
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.deepEqual(result.class, { label: '2학년 3반', school: '보성초', grade: 2, room: '3' });
  assert.deepEqual(result.curricula, [{ title: 'AI 교재 2학년', code: '111111' }], '마감(42)·비공개(43)는 빠진다');
  assert.deepEqual(result.tools.map((t) => t.id), [7, 8]);
  const text = JSON.stringify(result);
  for (const secret of ['김하나', CID, 'createdBy', 'roster', '김선생', 'tools/1/x.html']) assert.ok(!text.includes(secret), secret);
});

test('학생 반 입장: 없는 코드 404, 닫힌 반 403, 사이트가 닫히면 403', async () => {
  assert.equal((await withClass().call('GET', '/api/join-class/nope99')).status, 404);
  const closed = withClass();
  closed.settings.set(`sb:cls:${CID}`, classRow({ isOpen: false }));
  const r = await closed.call('GET', '/api/join-class/bs23');
  assert.equal(r.status, 403);
  assert.equal(r.result.error, 'class_closed');
  const site = await withClass({ siteOpen: false }).call('GET', '/api/join-class/bs23');
  assert.equal(site.status, 403);
  assert.equal(site.result.error, 'site_closed');
});

test('학생 반 도구 열기: 반에 넣은 도구만 열린다', async () => {
  const h = withClass();
  const ok = await h.call('GET', '/api/join-class/bs23/tool/7/open');
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.Location, 'https://www.autodraw.com/');
  const notShared = await h.call('GET', '/api/join-class/bs23/tool/9/open');
  assert.equal(notShared.status, 403, '도구함에는 있어도 이 반에 안 넣은 도구');
  assert.equal(notShared.result.error, 'not_shared');
  const closed = withClass();
  closed.settings.set(`sb:cls:${CID}`, classRow({ isOpen: false }));
  assert.equal((await closed.call('GET', '/api/join-class/bs23/tool/7/open')).status, 403);
});

test('sendTool: 한글 주소는 %인코딩해서 Location 에 넣는다(머리에 한글을 넣으면 500)', async () => {
  const h = withClass({ strictHeaders: true });
  h.settings.set(`sb:cls:${CID}`, classRow({ tools: [9] }));
  const student = await h.call('GET', '/api/join-class/bs23/tool/9/open');
  assert.equal(student.status, 302);
  assert.equal(student.headers.Location, 'https://ko.wikipedia.org/wiki/%EA%B3%A0%EC%96%91%EC%9D%B4');
  const teacher = await h.call('GET', '/api/tools/9/open');
  assert.equal(teacher.status, 302);
  assert.equal(teacher.headers.Location, 'https://ko.wikipedia.org/wiki/%EA%B3%A0%EC%96%91%EC%9D%B4');
  assert.equal(h.seen.logs.filter((l) => l.startsWith('tool_opened')).length, 1);
});

test('sendTool: 응답 머리 쓰기가 실패하면 tool_opened 를 남기지 않는다', async () => {
  const h = harness({ throwOnWriteHead: true });
  await assert.rejects(h.call('GET', '/api/tools/7/open'));
  assert.equal(h.seen.logs.filter((l) => l.startsWith('tool_opened')).length, 0);
});
