import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// 반 제출함 — 과정(프로그램)을 열지 않아도 반마다 아이들이 반 코드로 들어와 활동지·사진을 올리는 곳.
// 새 업로드 장치를 만들지 않고 수업 보드를 그대로 쓴다: 학원마다 숨은 시스템 프로그램 '반 제출함' 하나
// (settings sys:inbox-program 에 id), 반마다 그 아래 보드 하나(sb:class 에 inbox: true).
const require = createRequire(import.meta.url);
const realCrypto = require('node:crypto');
const source = readFileSync(new URL('../lib/api.js', import.meta.url), 'utf8');
const OWNER = 3, OTHER = 4, ADMIN = 1;
const CID = 'aaaaaaaaaaaa';

const classRow = (o = {}) => JSON.stringify({
  id: CID, school: '보성초', grade: 3, room: '1', name: '', code: 'bs31', roster: '김하나\n이두리',
  tools: [], isOpen: true, createdBy: OWNER, createdAt: '2026-10-28T01:00:00.000Z', ...o,
});

function harness({ role = 'teacher', userId = OWNER, academy = null, settings: initial = {}, boards: initialBoards = [], programs: extraPrograms = [], posts: initialPosts = [], randomInts = [] } = {}) {
  const settings = new Map(Object.entries(initial));
  const boards = new Map(initialBoards.map((b) => [String(b.id), { is_open: true, class_date: null, roster: '', created_at: 'x', ...b }]));
  const programs = new Map([
    ['5', { id: 5, title: 'AI 교재 3학년', published: true }],
    ...extraPrograms.map((p) => [String(p.id), p]),
  ]);
  const lessons = new Map();
  const posts = [...initialPosts];
  const users = new Map([[String(OWNER), { id: OWNER, name: '김선생' }], [String(OTHER), { id: OTHER, name: '박선생' }], [String(ADMIN), { id: ADMIN, name: '원장' }]]);
  const seen = { writes: [], sql: [], programInserts: 0, logs: [] };
  let nextBoard = 40, nextProgram = 900, nextLesson = 70;
  const ints = [...randomInts];
  const crypto = Object.assign(Object.create(realCrypto), {
    randomInt: (a, b) => (ints.length ? ints.shift() : realCrypto.randomInt(a, b)),
    randomBytes: (n) => realCrypto.randomBytes(n),
  });
  const postCount = (id) => posts.filter((p) => String(p.board_id) === String(id)).length;
  const joinRow = (b) => {
    const p = programs.get(String(b.program_id));
    return { ...b, program_title: p.title, program_published: p.published, teacher_name: '', post_count: postCount(b.id), item_count: 0 };
  };
  const db = {
    ACADEMY_ID: academy, TS: (c) => c, ready: async () => {},
    getSettings: async () => ({ site_open: true }),
    log: async (u, a, d) => seen.logs.push(`${a} ${d}`),
    one: async (sql, args) => {
      seen.sql.push(sql);
      if (/FROM settings WHERE key ?= ?\$1/.test(sql)) { const v = settings.get(args[0]); return v === undefined ? null : { value: v }; }
      if (sql.startsWith('SELECT * FROM programs')) return programs.get(String(args[0])) || null;
      if (sql.startsWith('SELECT id FROM programs WHERE id')) return programs.get(String(args[0])) || null;
      if (sql.startsWith('INSERT INTO programs')) {
        seen.programInserts++;
        const p = { id: nextProgram++, title: args[0], category: args[1], grade: args[2], description: args[3], published: false };
        programs.set(String(p.id), p);
        return { id: p.id };
      }
      if (sql.startsWith('INSERT INTO lessons')) {
        const l = { id: nextLesson++, program_id: args[0], position: args[1], title: args[2] };
        lessons.set(String(l.id), l);
        return { id: l.id };
      }
      if (sql.startsWith('SELECT * FROM lessons WHERE id')) return lessons.get(String(args[0])) || null;
      if (sql.startsWith('SELECT id FROM boards WHERE code')) return [...boards.values()].find((b) => b.code === args[0]) || null;
      if (sql.startsWith('INSERT INTO boards')) {
        if ([...boards.values()].some((b) => b.code === args[2])) throw new Error('duplicate key value violates unique constraint');
        const b = { id: nextBoard++, program_id: args[0], title: args[1], code: args[2], created_by: args[3], class_date: args[4], roster: args[5], is_open: true, created_at: 'x' };
        boards.set(String(b.id), b);
        return b;
      }
      if (sql.startsWith('SELECT * FROM boards WHERE id')) return boards.get(String(args[0])) || null;
      if (sql.startsWith('SELECT id FROM boards WHERE id=$1 FOR UPDATE')) return boards.get(String(args[0])) || null;
      if (sql.startsWith('WITH career_posts')) return { pending: 0 };
      if (sql.startsWith('SELECT id FROM users WHERE id')) return users.get(String(args[0])) || null;
      throw new Error(`one: ${sql}`);
    },
    q: async (sql, args) => {
      seen.sql.push(sql);
      if (sql.startsWith('SELECT pg_advisory_xact_lock')) return [];
      if (sql.startsWith('INSERT INTO settings')) { seen.writes.push({ sql, key: args[0] }); settings.set(args[0], args[1]); return []; }
      if (sql.startsWith('DELETE FROM settings WHERE key = $1')) { settings.delete(args[0]); return []; }
      if (sql.startsWith("DELETE FROM settings WHERE key IN (SELECT 'sb:post:'")) {
        for (const p of posts.filter((x) => args[0].includes(String(x.board_id)))) settings.delete(`sb:post:${p.id}`);
        return [];
      }
      if (sql.startsWith('DELETE FROM settings WHERE key = ANY')) {
        for (const k of [...settings.keys()]) {
          if (args[0].includes(k) || args[1].some((pre) => k.startsWith(pre.replace(/%$/, '')))) settings.delete(k);
        }
        return [];
      }
      if (sql.startsWith('DELETE FROM boards WHERE id')) {
        boards.delete(String(args[0]));
        for (let i = posts.length - 1; i >= 0; i--) if (String(posts[i].board_id) === String(args[0])) posts.splice(i, 1);
        return [];
      }
      if (sql.startsWith('UPDATE programs SET published = true')) { programs.get(String(args[0])).published = true; return []; }
      if (sql.startsWith('UPDATE programs')) return [];
      if (sql.startsWith('SELECT id, title FROM lessons WHERE program_id')) return [...lessons.values()].filter((l) => String(l.program_id) === String(args[0]));
      if (sql.includes('FROM programs p')) {
        // 반 제출함 시스템 프로그램을 같은 조회 안에서 거르는지 — NOT EXISTS 조각을 흉내 낸다
        let rows = [...programs.values()];
        if (sql.includes('WHERE p.published = true')) rows = rows.filter((p) => p.published);
        if (sql.includes("s.key = 'sys:inbox-program'")) rows = rows.filter((p) => String(p.id) !== settings.get('sys:inbox-program'));
        return rows.map((p) => ({ ...p, link_count: 0, aiapp_count: 0, video_count: 0, file_count: 0, lesson_count: 0 }));
      }
      if (sql.startsWith('SELECT key,value FROM settings WHERE key = ANY') || sql.includes("jsonb_build_object('published', true")) return [];
      if (sql.includes("LIKE 'sb:cls:%'")) return [...settings].filter(([k]) => k.startsWith('sb:cls:')).map(([key, value]) => ({ key, value }));
      if (sql.includes("LIKE 'sb:class:%' AND value LIKE $1")) {
        const needle = args[0].replace(/%/g, '');
        return [...settings].filter(([k, v]) => k.startsWith('sb:class:') && v.includes(needle)).map(([key, value]) => ({ key, value }));
      }
      if (sql.includes("LIKE 'sb:class:%' AND value LIKE '%classId%'")) return [...settings].filter(([k, v]) => k.startsWith('sb:class:') && v.includes('classId')).map(([key, value]) => ({ key, value }));
      if (sql.includes("LIKE 'sb:viewers:%'")) return [];
      if (sql.startsWith('SELECT id, name FROM users')) return args[0].map((id) => users.get(String(id))).filter(Boolean);
      if (sql.includes('FROM tools WHERE id = ANY')) return [];
      if (sql.includes('FROM boards b JOIN programs p')) {
        const rows = Array.isArray(args?.[0]) ? args[0].map((id) => boards.get(String(id))).filter(Boolean)
          : [...boards.values()].filter((b) => !args || String(b.created_by) === String(args[0]));
        return rows.map(joinRow);
      }
      if (sql.includes('FROM boards b WHERE b.id = ANY')) {
        return args[0].map((id) => boards.get(String(id))).filter(Boolean).map((b) => ({ ...b, post_count: postCount(b.id) }));
      }
      if (sql.startsWith('SELECT board_id, student_name')) return [];
      if (sql.includes('FROM board_posts WHERE board_id = $1 ORDER BY id DESC')) return [];
      if (sql.includes('FROM settings WHERE key=ANY')) return args[0].filter((k) => settings.has(k)).map((key) => ({ key, value: settings.get(key) }));
      if (sql.startsWith('UPDATE boards SET title = $1 WHERE id = ANY')) { for (const id of args[1]) boards.get(String(id)).title = args[0]; return []; }
      if (sql.startsWith('UPDATE boards SET roster = $1 WHERE id = ANY')) { for (const id of args[1]) boards.get(String(id)).roster = args[0]; return []; }
      if (sql.startsWith('UPDATE boards') || sql.startsWith('UPDATE lessons')) return [];
      throw new Error(`q: ${sql}`);
    },
  };
  db.transaction = async (fn) => fn(db);
  const deps = {
    'node:crypto': crypto, './db': db, './password': {}, './cookies': { parseCookies: () => ({}) },
    './worksheet-headers': require('../lib/worksheet-headers'), './student-board': require('../lib/student-board'),
    '../public/curriculum': require('../public/curriculum'),
    './auth': { getSessionUser: async () => ({ user: { id: userId, role } }), roleLevel: (r) => (r === 'admin' ? 2 : 1) },
    './storage': { storageEnabled: false, removeObject: async () => {} },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, require: (id) => { if (!(id in deps)) throw new Error(`Unexpected module ${id}`); return deps[id]; }, process: { env: {} }, Buffer, URL, console });
  return {
    seen, settings, boards, programs, posts,
    classInfo: (boardId) => JSON.parse(settings.get(`sb:class:${boardId}`) || 'null'),
    async call(method, path, body = {}) {
      let status, headers = {}, raw = '';
      const res = {
        setHeader(k, v) { headers[k] = v; },
        writeHead(s, h = {}) { status = s; headers = { ...headers, ...h }; },
        end(v) { raw = v ? String(v) : ''; },
      };
      const pathname = path.split('?')[0];
      await module.exports.handleApi({ method, url: path, headers: { host: 'hub.test', origin: 'https://hub.test' } }, res, pathname, body);
      let result = null;
      try { result = raw ? JSON.parse(raw) : null; } catch { result = null; }
      return { status, headers, result };
    },
  };
}

// 반(CID, 코드 bs31) + 그 반의 과정 하나(41) — 반 제출함은 아직 없다(반 제출함 이전에 연 반)
function withClass(opts = {}) {
  return harness({
    ...opts,
    settings: {
      [`sb:cls:${CID}`]: classRow(), 'sb:clscode:bs31': CID,
      'sb:class:41': JSON.stringify({ school: '보성초', grade: 3, room: '1', classId: CID }),
      ...(opts.settings || {}),
    },
    boards: [{ id: 41, program_id: 5, title: '3학년 1반 · AI 교재 3학년', code: '111111', created_by: OWNER }, ...(opts.boards || [])],
  });
}

test('반을 열면 반 제출함이 함께 생긴다 — 시스템 프로그램 아래 보드, sb:class 에 inbox: true', async () => {
  const h = harness({ randomInts: [345678, 222333] });
  const { status, result } = await h.call('POST', '/api/classes', { school: '보성초', grade: 3, room: 1, roster: '김하나\n이두리' });
  assert.equal(status, 200);
  assert.equal(result.code, '345678');
  assert.equal(result.inbox.code, '222333');
  const board = h.boards.get(String(result.inbox.boardId));
  assert.equal(board.title, '3학년 1반 · 반 제출함');
  assert.equal(board.roster, '김하나\n이두리', '명단은 반 명단');
  assert.equal(board.created_by, OWNER);
  const programId = h.settings.get('sys:inbox-program');
  assert.equal(String(board.program_id), programId, '시스템 프로그램 id 를 sys:inbox-program 에 기억한다');
  const program = h.programs.get(programId);
  assert.equal(program.title, '반 제출함');
  assert.equal(program.published, true, '학생 관문(openBoardByCode)이 공개를 요구한다');
  assert.deepEqual(h.classInfo(board.id), { school: '보성초', grade: 3, room: '1', classId: result.id, inbox: true });
  // 선생님이 설정하지 않아도 사진을 받는다 — 차시 하나, 제출 열림, 학교 연결 없음
  const cfg = JSON.parse(h.settings.get(`sb:config:${board.id}`));
  assert.equal(cfg.name, '반 제출함');
  assert.equal(cfg.sessions.length, 1);
  assert.equal(cfg.sessions[0].title, '활동지·사진');
  assert.equal(cfg.sessions[0].submissions.enabled, true);
  assert.ok(cfg.sessions[0].submissions.types.includes('photo'));
  assert.deepEqual(cfg.career, { enabled: false, schoolId: null });
  assert.equal(cfg.activeSession, cfg.sessions[0].id);
});

test('시스템 프로그램은 한 번만 만들고 기억한다 — 두 번째 반, 새 인스턴스도 같은 것을 쓴다', async () => {
  const h = harness();
  const a = await h.call('POST', '/api/classes', { grade: 3, room: 1 });
  const b = await h.call('POST', '/api/classes', { grade: 3, room: 2 });
  assert.equal(h.seen.programInserts, 1);
  const pa = h.boards.get(String(a.result.inbox.boardId)).program_id;
  assert.equal(h.boards.get(String(b.result.inbox.boardId)).program_id, pa);
  // 새 인스턴스(기억 없음) — settings 에 적힌 id 를 읽어 쓴다
  const fresh = harness({ settings: { 'sys:inbox-program': '777' }, programs: [{ id: 777, title: '반 제출함', published: true }] });
  const c = await fresh.call('POST', '/api/classes', { grade: 4, room: 1 });
  assert.equal(fresh.seen.programInserts, 0);
  assert.equal(fresh.boards.get(String(c.result.inbox.boardId)).program_id, 777);
});

test('전환 모드(ACADEMY_ID)에서도 ON CONFLICT 없이 넣고, 프로그램은 화면과 같은 칸 조합으로 넣는다', async () => {
  const h = harness({ academy: 'academy-1' });
  const { status, result } = await h.call('POST', '/api/classes', { grade: 3, room: 1 });
  assert.equal(status, 200);
  assert.ok(result.inbox);
  assert.ok(h.seen.writes.every((w) => !/ON CONFLICT/.test(w.sql)));
  const insert = h.seen.sql.find((s) => s.startsWith('INSERT INTO programs'));
  assert.match(insert, /\(title, category, grade, description\)/);
  assert.ok(h.seen.sql.some((s) => s.startsWith('UPDATE programs SET published = true')), '공개는 뒤에 UPDATE');
});

test('반 제출함을 못 만들어도 반은 열린다(inbox: null)', async () => {
  const h = harness();
  // 시스템 프로그램 넣기가 실패하는 DB
  h.programs.set = () => { throw new Error('view rejected'); };
  const { status, result } = await h.call('POST', '/api/classes', { grade: 3, room: 1 });
  assert.equal(status, 200);
  assert.equal(result.inbox, null);
  assert.ok([...h.settings.keys()].some((k) => k.startsWith('sb:cls:')));
});

test('시스템 프로그램은 프로그램 목록(관리자·교사) 어디에도 안 나온다', async () => {
  for (const role of ['admin', 'teacher']) {
    const h = harness({ role, userId: role === 'admin' ? ADMIN : OWNER, settings: { 'sys:inbox-program': '900' }, programs: [{ id: 900, title: '반 제출함', published: true }] });
    const { status, result } = await h.call('GET', '/api/programs');
    assert.equal(status, 200);
    assert.deepEqual(result.programs.map((p) => p.id), [5], role);
    const listSql = h.seen.sql.find((s) => s.includes('FROM programs p'));
    assert.match(listSql, /NOT EXISTS \(SELECT 1 FROM settings s WHERE s\.key = 'sys:inbox-program' AND s\.value = p\.id::text\)/);
  }
});

test('시스템 프로그램은 프로그램 경로로 고치거나 지울 수 없다(403)', async () => {
  const h = harness({ role: 'admin', userId: ADMIN, settings: { 'sys:inbox-program': '900' }, programs: [{ id: 900, title: '반 제출함', published: true }] });
  for (const [method, path, body] of [
    ['PATCH', '/api/programs/900', { title: '바꿈', published: false }],
    ['DELETE', '/api/programs/900', {}],
    ['POST', '/api/programs/900/lessons', { title: '2차시' }],
    ['PUT', '/api/programs/900/lessons-order', { ids: [] }],
    ['PUT', '/api/programs/900/links', { links: [] }],
    ['PUT', '/api/programs/900/course-plan', { revision: null }],
    ['POST', '/api/programs/900/boards', { title: '따로 만든 제출함' }],
  ]) {
    const r = await h.call(method, path, body);
    assert.equal(r.status, 403, `${method} ${path}`);
    assert.match(r.result.error, /반 제출함/);
  }
  assert.equal(h.programs.get('900').title, '반 제출함');
  assert.equal(h.seen.sql.filter((s) => /^(UPDATE|DELETE) /.test(s) && s.includes('programs')).length, 0, '아무것도 바꾸지 않는다');
  // 다른 프로그램은 예전처럼 고친다
  assert.equal((await h.call('PATCH', '/api/programs/5', { title: '새 이름' })).status, 200);
  // 반에 과정으로 넣는 것도 막는다
  const c = withClass({ settings: { 'sys:inbox-program': '900' }, programs: [{ id: 900, title: '반 제출함', published: true }] });
  const added = await c.call('POST', `/api/classes/${CID}/curricula`, { programId: 900 });
  assert.equal(added.status, 403);
});

test('반 제출함 이전에 연 반: POST /api/classes/:id/inbox 가 만들고, 다시 불러도 같은 것을 준다', async () => {
  const h = withClass({ randomInts: [555666] });
  const first = await h.call('POST', `/api/classes/${CID}/inbox`);
  assert.equal(first.status, 200);
  assert.equal(first.result.created, true);
  assert.deepEqual(first.result.inbox, { boardId: first.result.inbox.boardId, code: '555666', postCount: 0, isOpen: true, title: '3학년 1반 · 반 제출함' });
  const again = await h.call('POST', `/api/classes/${CID}/inbox`);
  assert.equal(again.status, 200);
  assert.equal(again.result.created, false);
  assert.equal(again.result.inbox.boardId, first.result.inbox.boardId);
  assert.equal([...h.boards.values()].filter((b) => String(b.program_id) === h.settings.get('sys:inbox-program')).length, 1);
  assert.equal((await withClass({ userId: OTHER }).call('POST', `/api/classes/${CID}/inbox`)).status, 403, '남의 반');
});

test('반 제출함은 과정이 아니다 — 반 목록 과정 수·반 화면 과정 목록에서 빠지고 inbox 로 따로 나온다', async () => {
  const h = withClass({ randomInts: [555666] });
  const made = await h.call('POST', `/api/classes/${CID}/inbox`);
  const inboxId = made.result.inbox.boardId;
  h.posts.push({ id: 1, board_id: inboxId }, { id: 2, board_id: inboxId });
  const list = await h.call('GET', '/api/classes');
  assert.equal(list.status, 200);
  assert.equal(list.result.classes[0].curriculumCount, 1, '과정 41 하나만');
  assert.deepEqual(list.result.classes[0].inbox, { boardId: inboxId, code: '555666', postCount: 2, isOpen: true, title: '3학년 1반 · 반 제출함' });
  const detail = await h.call('GET', `/api/classes/${CID}`);
  assert.deepEqual(detail.result.curricula.map((b) => b.id), [41]);
  assert.equal(detail.result.inbox.boardId, inboxId);
  assert.equal(detail.result.inbox.postCount, 2);
  // 반 제출함이 없는 반은 null
  const none = await withClass().call('GET', `/api/classes/${CID}`);
  assert.equal(none.result.inbox, null);
  assert.equal((await withClass().call('GET', '/api/classes')).result.classes[0].inbox, null);
});

test('학생 반 입장: inbox 코드를 주고, 과정 목록에는 섞지 않는다 — 제출함이 마감되면 null', async () => {
  const h = withClass({ randomInts: [555666] });
  await h.call('POST', `/api/classes/${CID}/inbox`);
  const { status, result } = await h.call('GET', '/api/join-class/BS31');
  assert.equal(status, 200);
  assert.deepEqual(result.inbox, { code: '555666' });
  assert.deepEqual(result.curricula, [{ title: 'AI 교재 3학년', code: '111111' }]);
  const inbox = [...h.boards.values()].find((b) => b.code === '555666');
  inbox.is_open = false;
  assert.equal((await h.call('GET', '/api/join-class/bs31')).result.inbox, null);
  assert.equal((await withClass().call('GET', '/api/join-class/bs31')).result.inbox, null, '아직 없는 반');
});

test('반 명단·학교·학년·반·이름을 고치면 반 제출함도 따라가고 inbox 표시는 남는다', async () => {
  const h = withClass({ randomInts: [555666] });
  const inboxId = (await h.call('POST', `/api/classes/${CID}/inbox`)).result.inbox.boardId;
  const r = await h.call('PATCH', `/api/classes/${CID}`, { grade: 4, roster: '김하나\n이두리\n박세나' });
  assert.equal(r.status, 200);
  assert.deepEqual(h.classInfo(inboxId), { school: '보성초', grade: 4, room: '1', classId: CID, inbox: true });
  assert.deepEqual(h.classInfo(41), { school: '보성초', grade: 4, room: '1', classId: CID }, '과정에는 inbox 가 붙지 않는다');
  assert.equal(h.boards.get(String(inboxId)).roster, '김하나\n이두리\n박세나');
  assert.equal(h.boards.get('41').roster, '김하나\n이두리\n박세나');
  assert.equal(h.boards.get(String(inboxId)).title, '4학년 1반 · 반 제출함', '반 이름표를 따라 이름이 바뀐다');
  assert.equal(h.boards.get('41').title, '3학년 1반 · AI 교재 3학년', '과정 이름은 그대로');
  // 수업 칸 고치기(PATCH /api/boards/:id)도 inbox 를 지우지 않고, 다른 반으로 옮기거나 떼지는 못한다
  await h.call('PATCH', `/api/boards/${inboxId}`, { room: '2' });
  assert.equal(h.classInfo(inboxId).inbox, true);
  const detach = await h.call('PATCH', `/api/boards/${inboxId}`, { classId: null });
  assert.equal(detach.status, 400);
  assert.equal(h.classInfo(inboxId).classId, CID);
});

test('반 지우기: 반 제출함에 제출물이 있으면 409, ?force=true 면 제출함까지 지운다', async () => {
  const h = withClass({ randomInts: [555666] });
  h.settings.delete('sb:class:41'); // 과정이 없는 반
  const inboxId = (await h.call('POST', `/api/classes/${CID}/inbox`)).result.inbox.boardId;
  h.posts.push({ id: 1, board_id: inboxId });
  h.settings.set('sb:post:1', '{}');
  const refused = await h.call('DELETE', `/api/classes/${CID}`);
  assert.equal(refused.status, 409);
  assert.equal(refused.result.code, 'inbox_has_posts');
  assert.equal(refused.result.postCount, 1);
  assert.match(refused.result.error, /반 제출함/);
  assert.ok(h.boards.has(String(inboxId)) && h.settings.has(`sb:cls:${CID}`), '아무것도 지우지 않는다');
  const forced = await h.call('DELETE', `/api/classes/${CID}?force=true`);
  assert.equal(forced.status, 200);
  assert.equal(h.boards.has(String(inboxId)), false);
  for (const k of [`sb:cls:${CID}`, 'sb:clscode:bs31', `sb:class:${inboxId}`, `sb:config:${inboxId}`, 'sb:post:1']) assert.equal(h.settings.has(k), false, k);
});

test('반 지우기: 제출물이 없으면 반 제출함을 조용히 함께 지운다, 과정이 남으면 예전처럼 409(제출함은 세지 않는다)', async () => {
  const h = withClass({ randomInts: [555666] });
  const inboxId = (await h.call('POST', `/api/classes/${CID}/inbox`)).result.inbox.boardId;
  const blocked = await h.call('DELETE', `/api/classes/${CID}`);
  assert.equal(blocked.status, 409);
  assert.match(blocked.result.error, /과정이 1개 남아/);
  h.settings.delete('sb:class:41');
  const ok = await h.call('DELETE', `/api/classes/${CID}`);
  assert.equal(ok.status, 200);
  assert.equal(h.boards.has(String(inboxId)), false);
  assert.equal(h.settings.has(`sb:cls:${CID}`), false);
});

test('[내 수업]: 반 제출함은 classInfo.inbox = true 로 실린다, 수업 화면 응답에도 classId·inbox', async () => {
  const h = withClass({ randomInts: [555666] });
  const inboxId = (await h.call('POST', `/api/classes/${CID}/inbox`)).result.inbox.boardId;
  const { status, result } = await h.call('GET', '/api/my-boards');
  assert.equal(status, 200);
  const byId = Object.fromEntries(result.boards.map((b) => [b.id, b]));
  assert.equal(byId[inboxId].classInfo.inbox, true);
  assert.equal(byId[inboxId].classInfo.classId, CID);
  assert.equal(byId[inboxId].programTitle, '반 제출함');
  assert.equal(byId[41].classInfo.inbox, undefined, '과정에는 없다');
  const view = await h.call('GET', `/api/boards/${inboxId}/posts`);
  assert.equal(view.status, 200);
  assert.deepEqual(view.result.board.classInfo, { school: '보성초', grade: 3, room: '1', classId: CID, inbox: true });
  assert.equal(view.result.board.inbox, true);
  const course = await h.call('GET', '/api/boards/41/posts');
  assert.equal(course.result.board.inbox, false);
  assert.equal(course.result.board.classInfo.classId, CID);
});
