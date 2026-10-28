import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// 반 자료 — 선생님이 반에 파일(활동지 PDF·한글·PPT·사진·zip)을 올리면 아이들이 반 코드로 바로 내려받는다.
// 파일마다 settings 한 줄 sb:clsfile:<반>:<파일>(동시에 두 개를 올려도 서로 덮어쓰지 않게).
// 올리기는 프로그램 첨부와 같은 서명 업로드 3단계(file-sign → 브라우저 PUT → files).
const require = createRequire(import.meta.url);
const realCrypto = require('node:crypto');
const source = readFileSync(new URL('../lib/api.js', import.meta.url), 'utf8');
const OWNER = 3, OTHER = 4, ADMIN = 1;
const CID = 'aaaaaaaaaaaa', CID2 = 'bbbbbbbbbbbb';
const FID = '111111111111', FID2 = '222222222222', FID3 = '333333333333';
const PATH = `class-files/${CID}/1761600000000-0123456789abcdef.pdf`;

const classRow = (o = {}) => JSON.stringify({
  id: CID, school: '보성초', grade: 2, room: '3', name: '', code: 'bs23', roster: '김하나\n이두리',
  tools: [], isOpen: true, createdBy: OWNER, createdAt: '2026-10-28T01:00:00.000Z', ...o,
});
const fileRow = (o = {}) => JSON.stringify({
  id: FID, name: '3차시 활동지.pdf', mime: 'application/pdf', size: 2048, path: PATH,
  createdBy: OWNER, createdAt: '2026-10-28T02:00:00.000Z', ...o,
});

function harness({ role = 'teacher', userId = OWNER, academy = null, siteOpen = true, storageEnabled = true, settings: initial = {}, boards: initialBoards = [], posts: initialPosts = [] } = {}) {
  const settings = new Map(Object.entries(initial));
  const boards = new Map(initialBoards.map((b) => [String(b.id), { is_open: true, class_date: null, roster: '', created_at: 'x', ...b }]));
  const programs = new Map([['900', { id: 900, title: '반 제출함', published: true }]]);
  const posts = [...initialPosts];
  const seen = { writes: [], logs: [], removed: [], signedUploads: [], signedDownloads: [] };
  const postCount = (id) => posts.filter((p) => String(p.board_id) === String(id)).length;
  const db = {
    ACADEMY_ID: academy, TS: (c) => c, ready: async () => {},
    getSettings: async () => ({ site_open: siteOpen }),
    log: async (u, a, d) => seen.logs.push(`${a} ${d}`),
    one: async (sql, args) => {
      if (/FROM settings WHERE key ?= ?\$1/.test(sql)) { const v = settings.get(args[0]); return v === undefined ? null : { value: v }; }
      if (sql.startsWith('SELECT * FROM boards WHERE id')) return boards.get(String(args[0])) || null;
      if (sql.startsWith('SELECT id FROM boards WHERE id=$1 FOR UPDATE')) return boards.get(String(args[0])) || null;
      if (sql.startsWith('WITH career_posts')) return { pending: 0 };
      if (sql.startsWith('SELECT * FROM programs')) return programs.get(String(args[0])) || null;
      throw new Error(`one: ${sql}`);
    },
    q: async (sql, args) => {
      if (sql.startsWith('INSERT INTO settings')) { seen.writes.push({ sql, key: args[0] }); settings.set(args[0], args[1]); return []; }
      if (sql.startsWith('DELETE FROM settings WHERE key = $1')) { settings.delete(args[0]); return []; }
      const rowsWhere = (fn) => [...settings].filter(([k, v]) => fn(k, v)).map(([key, value]) => ({ key, value }));
      // 반 목록: 반 줄 + 반 자료 줄을 한 번에
      if (sql.includes("key LIKE 'sb:cls:%' OR key LIKE 'sb:clsfile:%'")) return rowsWhere((k) => k.startsWith('sb:cls:') || k.startsWith('sb:clsfile:'));
      // 반 화면·학생 반 입장·반 지우기: 그 반의 수업 + 그 반의 자료를 한 번에
      if (sql.includes("(key LIKE 'sb:class:%' AND value LIKE $1) OR key LIKE $2")) {
        const needle = args[0].replace(/%/g, ''), prefix = args[1].replace(/%$/, '');
        return rowsWhere((k, v) => (k.startsWith('sb:class:') && v.includes(needle)) || k.startsWith(prefix));
      }
      if (sql.includes("LIKE 'sb:class:%' AND value LIKE $1")) {
        const needle = args[0].replace(/%/g, '');
        return rowsWhere((k, v) => k.startsWith('sb:class:') && v.includes(needle));
      }
      if (sql.startsWith('SELECT key, value FROM settings WHERE key LIKE $1')) { const prefix = args[0].replace(/%$/, ''); return rowsWhere((k) => k.startsWith(prefix)); }
      if (sql.includes("LIKE 'sb:class:%' AND value LIKE '%classId%'")) return rowsWhere((k, v) => k.startsWith('sb:class:') && v.includes('classId'));
      if (sql.includes('FROM tools WHERE id = ANY')) return [];
      if (sql.startsWith('SELECT id, name FROM users')) return args[0].map((id) => ({ id, name: `선생님${id}` }));
      if (sql.includes('FROM boards b JOIN programs p')) {
        return args[0].map((id) => boards.get(String(id))).filter(Boolean).map((b) => {
          const p = programs.get(String(b.program_id));
          return { ...b, program_title: p.title, program_published: p.published, post_count: postCount(b.id) };
        });
      }
      if (sql.includes('FROM boards b WHERE b.id = ANY')) return args[0].map((id) => boards.get(String(id))).filter(Boolean).map((b) => ({ ...b, post_count: postCount(b.id) }));
      if (sql.startsWith('SELECT board_id, student_name')) return [];
      // 반 제출함 지우기(removeBoard)
      if (sql.includes('FROM board_posts p LEFT JOIN settings m')) return [];
      if (sql.startsWith("DELETE FROM settings WHERE key IN (SELECT 'sb:post:'")) {
        for (const p of posts.filter((x) => args[0].includes(String(x.board_id)))) settings.delete(`sb:post:${p.id}`);
        return [];
      }
      if (sql.startsWith('DELETE FROM settings WHERE key = ANY')) {
        for (const k of [...settings.keys()]) if (args[0].includes(k) || args[1].some((pre) => k.startsWith(pre.replace(/%$/, '')))) settings.delete(k);
        return [];
      }
      if (sql.startsWith('DELETE FROM boards WHERE id')) { boards.delete(String(args[0])); return []; }
      throw new Error(`q: ${sql}`);
    },
  };
  db.transaction = async (fn) => fn(db);
  const storage = {
    storageEnabled,
    createSignedUpload: async (path) => { seen.signedUploads.push(path); return { uploadUrl: `https://storage.test/upload/${path}?token=t`, path }; },
    createSignedDownload: async (path, opts = {}) => {
      seen.signedDownloads.push({ path, ...opts });
      return `https://storage.test/sign/${path}?token=t${opts.downloadName ? `&download=${encodeURIComponent(opts.downloadName)}` : ''}`;
    },
    removeObject: async (path) => { seen.removed.push(path); },
  };
  const deps = {
    'node:crypto': realCrypto, './db': db, './password': {}, './cookies': { parseCookies: () => ({}) },
    './worksheet-headers': require('../lib/worksheet-headers'), './student-board': require('../lib/student-board'),
    './auth': { getSessionUser: async () => ({ user: { id: userId, role } }), roleLevel: (r) => (r === 'admin' ? 2 : 1) },
    './storage': storage,
  };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, require: (id) => { if (!(id in deps)) throw new Error(`Unexpected module ${id}`); return deps[id]; }, process: { env: {} }, Buffer, URL, console });
  return {
    seen, settings, boards, posts,
    fileKeys: (cid = CID) => [...settings.keys()].filter((k) => k.startsWith(`sb:clsfile:${cid}:`)),
    async call(method, path, body = {}) {
      let status, headers = {}, raw = '';
      const res = {
        setHeader(k, v) { headers[k] = v; },
        writeHead(s, h = {}) { status = s; headers = { ...headers, ...h }; },
        end(v) { raw = v ? String(v) : ''; },
      };
      await module.exports.handleApi({ method, url: path, headers: { host: 'hub.test', origin: 'https://hub.test' } }, res, path.split('?')[0], body);
      let result = null;
      try { result = raw ? JSON.parse(raw) : null; } catch { result = null; }
      return { status, headers, result, raw };
    },
  };
}

// 반 하나(CID, 코드 bs23) + 자료 한 개(FID). 다른 선생님의 반(CID2, 코드 zz99) + 그 반 자료(FID3)
function withClass(opts = {}) {
  return harness({
    ...opts,
    settings: {
      [`sb:cls:${CID}`]: classRow(), 'sb:clscode:bs23': CID,
      [`sb:clsfile:${CID}:${FID}`]: fileRow(),
      [`sb:cls:${CID2}`]: classRow({ id: CID2, code: 'zz99', createdBy: OTHER, grade: 4 }), 'sb:clscode:zz99': CID2,
      [`sb:clsfile:${CID2}:${FID3}`]: fileRow({ id: FID3, name: '다른 반.pdf', path: `class-files/${CID2}/1761600000000-fedcba9876543210.pdf` }),
      ...(opts.settings || {}),
    },
  });
}

test('file-sign: 허용 형식(html 은 뺀다)·100MB·반 주인만, 경로는 class-files/<반>/', async () => {
  const h = withClass();
  for (const name of ['활동지.pdf', '안내문.HWP', '발표.pptx', '명단.xlsx', '자료 모음.zip', '그림.jpg']) {
    const r = await h.call('POST', `/api/classes/${CID}/file-sign`, { name, size: 1000 });
    assert.equal(r.status, 200, name);
    assert.match(r.result.path, new RegExp(`^class-files/${CID}/\\d{13}-[0-9a-f]{16}\\.[a-z]+$`), name);
    assert.equal(r.result.path.split('.').pop(), name.split('.').pop().toLowerCase(), '확장자는 소문자로');
    assert.equal(r.result.uploadUrl, `https://storage.test/upload/${r.result.path}?token=t`);
  }
  for (const name of ['웹앱.html', '웹앱.htm', '실행.exe', '이름없음', '']) {
    const r = await h.call('POST', `/api/classes/${CID}/file-sign`, { name, size: 1000 });
    assert.equal(r.status, 400, `거부: ${name}`);
    assert.match(r.result.error, /형식/);
  }
  for (const size of [0, 100 * 1024 * 1024 + 1, 'abc']) {
    const r = await h.call('POST', `/api/classes/${CID}/file-sign`, { name: '활동지.pdf', size });
    assert.equal(r.status, 400, `크기 ${size}`);
    assert.match(r.result.error, /100MB/);
  }
  assert.equal((await h.call('POST', `/api/classes/${CID}/file-sign`, { name: 'a.pdf', size: 100 * 1024 * 1024 })).status, 200, '딱 100MB 는 된다');
  assert.equal((await h.call('POST', `/api/classes/${CID2}/file-sign`, { name: 'a.pdf', size: 10 })).status, 403, '남의 반');
  assert.equal((await withClass({ role: 'admin', userId: ADMIN }).call('POST', `/api/classes/${CID2}/file-sign`, { name: 'a.pdf', size: 10 })).status, 200, '관리자는 된다');
  assert.equal((await h.call('POST', '/api/classes/cccccccccccc/file-sign', { name: 'a.pdf', size: 10 })).status, 404);
  const off = await withClass({ storageEnabled: false }).call('POST', `/api/classes/${CID}/file-sign`, { name: 'a.pdf', size: 10 });
  assert.equal(off.status, 400);
  assert.match(off.result.error, /파일 저장소가 설정되지 않았습니다/);
});

test('한 반에 자료는 30개까지 — 서명에서도, 등록에서도 막는다', async () => {
  const many = {};
  for (let i = 0; i < 30; i++) {
    const id = (0x100000000000 + i).toString(16);
    many[`sb:clsfile:${CID}:${id}`] = fileRow({ id, path: `class-files/${CID}/1761600000000-${String(i).padStart(16, '0')}.pdf` });
  }
  const h = harness({ settings: { [`sb:cls:${CID}`]: classRow(), 'sb:clscode:bs23': CID, ...many } });
  const sign = await h.call('POST', `/api/classes/${CID}/file-sign`, { name: 'a.pdf', size: 10 });
  assert.equal(sign.status, 400);
  assert.match(sign.result.error, /30개까지/);
  assert.equal(h.seen.signedUploads.length, 0);
  const confirm = await h.call('POST', `/api/classes/${CID}/files`, { path: PATH, name: 'a.pdf', size: 10, mime: 'application/pdf' });
  assert.equal(confirm.status, 400);
  assert.match(confirm.result.error, /30개까지/);
  assert.equal(h.fileKeys().length, 30);
  assert.deepEqual(h.seen.removed, [PATH], '등록하지 못한 파일은 저장소에서 거둔다');
  // 29개면 하나 더 된다
  delete many[Object.keys(many)[0]];
  const ok = harness({ settings: { [`sb:cls:${CID}`]: classRow(), 'sb:clscode:bs23': CID, ...many } });
  assert.equal((await ok.call('POST', `/api/classes/${CID}/file-sign`, { name: 'a.pdf', size: 10 })).status, 200);
  assert.equal((await ok.call('POST', `/api/classes/${CID}/files`, { path: PATH, name: 'a.pdf', size: 10 })).status, 200);
  assert.equal(ok.fileKeys().length, 30);
});

test('등록(files): 반 접두사 밖 경로는 거부, 맞으면 파일마다 한 줄 + class_file_added, 같은 경로 다시 보내면 그대로', async () => {
  const h = harness({ settings: { [`sb:cls:${CID}`]: classRow(), 'sb:clscode:bs23': CID } });
  for (const path of [
    `class-files/${CID2}/1761600000000-0123456789abcdef.pdf`, // 다른 반
    'program5/1761600000000-0123456789abcdef.pdf',          // 프로그램 첨부
    `class-files/${CID}/../program5/x.pdf`,                  // 빠져나가기
    `class-files/${CID}/1761600000000-0123456789abcdef.html`, // html
    `xclass-files/${CID}/1761600000000-0123456789abcdef.pdf`,
    '',
  ]) {
    const r = await h.call('POST', `/api/classes/${CID}/files`, { path, name: '활동지.pdf', size: 10, mime: 'application/pdf' });
    assert.equal(r.status, 400, path);
  }
  assert.equal((await h.call('POST', `/api/classes/${CID}/files`, { path: PATH, name: '웹앱.html', size: 10 })).status, 400, '이름이 html');
  assert.equal((await h.call('POST', `/api/classes/${CID}/files`, { path: PATH, name: '', size: 10 })).status, 400);
  assert.equal((await h.call('POST', `/api/classes/${CID}/files`, { path: PATH, name: 'a.pdf', size: 200 * 1024 * 1024 })).status, 400);
  assert.equal(h.fileKeys().length, 0, '아무것도 안 생긴다');

  const r = await h.call('POST', `/api/classes/${CID}/files`, { path: PATH, name: '3차시 활동지.pdf', size: 2048, mime: 'application/pdf' });
  assert.equal(r.status, 200);
  assert.equal(r.result.ok, true);
  const { id } = r.result.file;
  assert.match(id, /^[0-9a-f]{12}$/);
  assert.deepEqual(Object.keys(r.result.file).sort(), ['createdAt', 'id', 'mime', 'name', 'size']);
  assert.equal(r.result.file.name, '3차시 활동지.pdf');
  const row = JSON.parse(h.settings.get(`sb:clsfile:${CID}:${id}`));
  assert.deepEqual({ ...row, createdAt: 'x' }, { id, name: '3차시 활동지.pdf', mime: 'application/pdf', size: 2048, path: PATH, createdBy: OWNER, createdAt: 'x' });
  assert.ok(h.seen.logs.some((l) => l.startsWith('class_file_added ') && l.includes(id)));
  // 응답이 끊겨 같은 경로로 다시 보내면 새 줄을 만들지 않는다
  const again = await h.call('POST', `/api/classes/${CID}/files`, { path: PATH, name: '3차시 활동지.pdf', size: 2048, mime: 'application/pdf' });
  assert.equal(again.status, 200);
  assert.equal(again.result.file.id, id);
  assert.equal(h.fileKeys().length, 1);
  // 두 번째 파일은 따로 한 줄 — 반 줄은 건드리지 않는다
  const before = h.settings.get(`sb:cls:${CID}`);
  await h.call('POST', `/api/classes/${CID}/files`, { path: `class-files/${CID}/1761600000001-abcdefabcdefabcd.hwp`, name: '안내.hwp', size: 99 });
  assert.equal(h.fileKeys().length, 2);
  assert.equal(h.settings.get(`sb:cls:${CID}`), before);
  // 남의 반에는 등록하지 못한다
  assert.equal((await harness({ userId: OTHER, settings: { [`sb:cls:${CID}`]: classRow() } }).call('POST', `/api/classes/${CID}/files`, { path: PATH, name: 'a.pdf', size: 10 })).status, 403);
});

test('전환 모드(ACADEMY_ID): 자료 줄도 ON CONFLICT 없이 넣는다', async () => {
  const h = harness({ academy: 'academy-1', settings: { [`sb:cls:${CID}`]: classRow() } });
  assert.equal((await h.call('POST', `/api/classes/${CID}/files`, { path: PATH, name: 'a.pdf', size: 10 })).status, 200);
  const w = h.seen.writes.find((x) => x.key.startsWith('sb:clsfile:'));
  assert.ok(w);
  assert.doesNotMatch(w.sql, /ON CONFLICT/);
});

test('반 목록 fileCount, 반 화면 files(새것부터) — 저장소 경로는 어디에도 없다', async () => {
  const h = withClass({ settings: { [`sb:clsfile:${CID}:${FID2}`]: fileRow({ id: FID2, name: '새 자료.hwp', mime: 'application/x-hwp', size: 99, createdAt: '2026-10-28T03:00:00.000Z', path: `class-files/${CID}/1761600000002-aaaaaaaaaaaaaaaa.hwp` }) } });
  const list = await h.call('GET', '/api/classes');
  assert.equal(list.status, 200);
  assert.equal(list.result.classes.length, 1, '자료 줄을 반으로 읽지 않는다(남의 반도 안 보인다)');
  assert.equal(list.result.classes[0].fileCount, 2);
  assert.doesNotMatch(list.raw, /class-files\//);
  const admin = await withClass({ role: 'admin', userId: ADMIN }).call('GET', '/api/classes');
  assert.deepEqual(admin.result.classes.map((c) => [c.id, c.fileCount]).sort(), [[CID, 1], [CID2, 1]]);
  const detail = await h.call('GET', `/api/classes/${CID}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.result.files, [
    { id: FID2, name: '새 자료.hwp', mime: 'application/x-hwp', size: 99, createdAt: '2026-10-28T03:00:00.000Z' },
    { id: FID, name: '3차시 활동지.pdf', mime: 'application/pdf', size: 2048, createdAt: '2026-10-28T02:00:00.000Z' },
  ]);
  assert.doesNotMatch(detail.raw, /class-files\//);
  assert.deepEqual((await withClass().call('GET', `/api/classes/${CID2}`)).status, 403);
});

test('선생님 받기: 원래 이름으로 저장되는 서명 주소로 302, 남의 반·없는 자료는 막는다', async () => {
  const h = withClass();
  const r = await h.call('GET', `/api/classes/${CID}/files/${FID}/download`);
  assert.equal(r.status, 302);
  assert.equal(r.headers.Location, `https://storage.test/sign/${PATH}?token=t&download=${encodeURIComponent('3차시 활동지.pdf')}`);
  assert.match(r.headers['Cache-Control'], /no-store/);
  assert.deepEqual(h.seen.signedDownloads, [{ path: PATH, downloadName: '3차시 활동지.pdf' }]);
  assert.equal((await h.call('GET', `/api/classes/${CID}/files/${FID2}/download`)).status, 404);
  assert.equal((await h.call('GET', `/api/classes/${CID}/files/${FID3}/download`)).status, 404, '다른 반 자료 번호');
  assert.equal((await h.call('GET', `/api/classes/${CID2}/files/${FID3}/download`)).status, 403, '남의 반');
  assert.equal((await withClass({ role: 'admin', userId: ADMIN }).call('GET', `/api/classes/${CID2}/files/${FID3}/download`)).status, 302);
});

test('학생 반 입장: files 에 id·이름·형식·크기만, 받기는 2분짜리 서명 주소로 302(원래 이름)', async () => {
  const h = withClass();
  const join = await h.call('GET', '/api/join-class/BS23');
  assert.equal(join.status, 200);
  assert.deepEqual(join.result.files, [{ id: FID, name: '3차시 활동지.pdf', mime: 'application/pdf', size: 2048 }]);
  assert.doesNotMatch(join.raw, /class-files\//);
  const r = await h.call('GET', `/api/join-class/bs23/file/${FID}`);
  assert.equal(r.status, 302);
  assert.equal(r.headers['Cache-Control'], 'no-store');
  assert.match(r.headers.Location, /&download=3%EC%B0%A8%EC%8B%9C/);
  assert.deepEqual(h.seen.signedDownloads, [{ path: PATH, ttl: 120, downloadName: '3차시 활동지.pdf' }]);
  // 자료가 없는 반은 빈 목록
  const empty = harness({ settings: { [`sb:cls:${CID}`]: classRow(), 'sb:clscode:bs23': CID } });
  assert.deepEqual((await empty.call('GET', '/api/join-class/bs23')).result.files, []);
});

test('학생 받기 거부: 닫힌 반·다른 반 자료·없는 코드·사이트 닫힘·저장소 없음', async () => {
  const closed = withClass({ settings: { [`sb:cls:${CID}`]: classRow({ isOpen: false }) } });
  const c = await closed.call('GET', `/api/join-class/bs23/file/${FID}`);
  assert.equal(c.status, 403);
  assert.equal(c.result.error, 'class_closed');
  assert.equal(closed.seen.signedDownloads.length, 0);

  const h = withClass();
  const other = await h.call('GET', `/api/join-class/bs23/file/${FID3}`);
  assert.equal(other.status, 404, '다른 반 자료 번호는 이 반에서 찾히지 않는다');
  assert.equal(other.result.error, 'file_not_found');
  assert.equal(other.headers['Cache-Control'], 'no-store');
  assert.equal((await h.call('GET', `/api/join-class/bs23/file/${FID2}`)).status, 404);
  assert.equal((await h.call('GET', `/api/join-class/nope99/file/${FID}`)).status, 404);
  assert.equal(h.seen.signedDownloads.length, 0);
  // 자료 줄의 경로가 반 접두사 밖이면(손상된 줄) 내주지 않는다
  const bad = withClass({ settings: { [`sb:clsfile:${CID}:${FID}`]: fileRow({ path: 'program5/secret.pdf' }) } });
  assert.equal((await bad.call('GET', `/api/join-class/bs23/file/${FID}`)).status, 404);
  assert.deepEqual((await bad.call('GET', '/api/join-class/bs23')).result.files, []);

  const shut = await withClass({ siteOpen: false }).call('GET', `/api/join-class/bs23/file/${FID}`);
  assert.equal(shut.status, 403);
  assert.equal(shut.result.error, 'site_closed');
  assert.equal((await withClass({ storageEnabled: false }).call('GET', `/api/join-class/bs23/file/${FID}`)).status, 502);
});

test('자료 지우기: 저장소 파일을 먼저 지우고 줄을 지운다, 남의 반은 막는다', async () => {
  const h = withClass();
  assert.equal((await h.call('DELETE', `/api/classes/${CID2}/files/${FID3}`)).status, 403);
  assert.equal((await h.call('DELETE', `/api/classes/${CID}/files/${FID3}`)).status, 404, '다른 반 자료 번호');
  assert.deepEqual(h.seen.removed, []);
  const r = await h.call('DELETE', `/api/classes/${CID}/files/${FID}`);
  assert.equal(r.status, 200);
  assert.deepEqual(h.seen.removed, [PATH]);
  assert.equal(h.settings.has(`sb:clsfile:${CID}:${FID}`), false);
  assert.ok(h.settings.has(`sb:clsfile:${CID2}:${FID3}`), '다른 반 자료는 그대로');
  assert.ok(h.seen.logs.some((l) => l.startsWith('class_file_deleted ')));
  assert.equal((await h.call('DELETE', `/api/classes/${CID}/files/${FID}`)).status, 404);
});

test('반 지우기: 반 자료 파일·줄을 모두 지운다(제출함 없는 반, ?force=true 로 제출함까지 지우는 반)', async () => {
  const second = { [`sb:clsfile:${CID}:${FID2}`]: fileRow({ id: FID2, path: `class-files/${CID}/1761600000002-aaaaaaaaaaaaaaaa.hwp` }) };
  const h = withClass({ settings: second });
  const r = await h.call('DELETE', `/api/classes/${CID}`);
  assert.equal(r.status, 200);
  assert.deepEqual(h.seen.removed.sort(), [PATH, `class-files/${CID}/1761600000002-aaaaaaaaaaaaaaaa.hwp`].sort());
  assert.deepEqual(h.fileKeys(), []);
  assert.equal(h.settings.has(`sb:cls:${CID}`), false);
  assert.ok(h.settings.has(`sb:clsfile:${CID2}:${FID3}`), '다른 반 자료는 그대로');

  // 제출함에 제출물이 있는 반: 처음엔 409(자료도 그대로), force 면 제출함과 자료를 함께 지운다
  const f = withClass({
    settings: { ...second, 'sb:class:60': JSON.stringify({ school: '보성초', grade: 2, room: '3', classId: CID, inbox: true }), 'sb:post:1': '{}' },
    boards: [{ id: 60, program_id: 900, title: '2학년 3반 · 반 제출함', code: '600600', created_by: OWNER }],
    posts: [{ id: 1, board_id: 60 }],
  });
  const refused = await f.call('DELETE', `/api/classes/${CID}`);
  assert.equal(refused.status, 409);
  assert.equal(refused.result.code, 'inbox_has_posts');
  assert.equal(f.fileKeys().length, 2, '거절하면 자료도 그대로');
  assert.deepEqual(f.seen.removed, []);
  const forced = await f.call('DELETE', `/api/classes/${CID}?force=true`);
  assert.equal(forced.status, 200);
  assert.deepEqual(f.fileKeys(), []);
  assert.ok(f.seen.removed.includes(PATH));
  assert.equal(f.boards.has('60'), false);
  assert.equal(f.settings.has(`sb:cls:${CID}`), false);
  assert.ok(f.seen.logs.some((l) => l.startsWith('class_files_deleted ') && l.includes('count=2')));

  // 과정이 남은 반은 예전처럼 409 — 자료도 지우지 않는다
  const blocked = withClass({ settings: { 'sb:class:41': JSON.stringify({ school: '보성초', grade: 2, room: '3', classId: CID }) } });
  assert.equal((await blocked.call('DELETE', `/api/classes/${CID}`)).status, 409);
  assert.equal(blocked.fileKeys().length, 1);
  assert.deepEqual(blocked.seen.removed, []);
});
