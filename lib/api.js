'use strict';
const crypto = require('node:crypto');
const { q, one, ready, log, getSettings, setSetting, clientIp, TS } = require('./db');
const { hashPassword, verifyPassword } = require('./password');
const { createSession, destroySession, getSessionUser, cleanupSessions, roleLevel } = require('./auth');
const storage = require('./storage');

const ROLE_LABELS = { admin: '관리자', teacher: '교사' };

// HTTPS 뒤에서 운영할 때 COOKIE_SECURE=1 (Vercel에서는 자동) 설정 시 세션 쿠키에 Secure 속성이 붙는다.
const COOKIE_SECURE = (process.env.COOKIE_SECURE === '1' || process.env.VERCEL) ? '; Secure' : '';

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    roleLabel: ROLE_LABELS[u.role],
    active: !!u.active,
    mustChangePassword: !!u.must_change_password,
    createdAt: u.created_at,
  };
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(data);
}

function badRequest(res, message) { json(res, 400, { error: message }); }
function forbidden(res, message = '권한이 없습니다.') { json(res, 403, { error: message }); }
function notFound(res) { json(res, 404, { error: '찾을 수 없습니다.' }); }

// ---- 검증 헬퍼 ----
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;
const URL_RE = /^https:\/\/[^\s<>"']+$/;
function validPassword(pw) { return typeof pw === 'string' && pw.length >= 8 && pw.length <= 100; }

// ---- 라우트 테이블 ----
const routes = [];
function route(method, pattern, minRole, handler) {
  routes.push({ method, pattern, minRole, handler });
}

// 사이트 킬스위치(회수 스위치 3) 예외 경로: 폐쇄 중에도 로그인·내정보·비번변경은 허용
const SITE_EXEMPT = [/^\/api\/login$/, /^\/api\/logout$/, /^\/api\/me$/, /^\/api\/password$/];

// 사용자 조회용 공통 SELECT (생성일을 표시 시간대 문자열로)
const USER_SELECT = `SELECT *, ${TS('created_at')} AS created_at FROM users`;

// ================= 인증 =================
route('POST', /^\/api\/login$/, null, async (req, res, ctx) => {
  const { username, password } = ctx.body || {};
  if (!username || !password) return badRequest(res, '아이디와 비밀번호를 입력하세요.');
  const user = await one(`${USER_SELECT} WHERE username = $1`, [String(username).trim()]);
  if (!user || !verifyPassword(String(password), user.password_hash)) {
    await log(user || null, 'login_failed', `username=${String(username).slice(0, 50)}`, req);
    return json(res, 401, { error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }
  if (!user.active) {
    await log(user, 'login_blocked', '비활성 계정', req);
    return json(res, 403, { error: '정지된 계정입니다. 관리자에게 문의하세요.' });
  }
  await cleanupSessions();
  const token = await createSession(user.id);
  await log(user, 'login', '', req);
  const settings = await getSettings();
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Set-Cookie': `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${12 * 3600}${COOKIE_SECURE}`,
  });
  res.end(JSON.stringify({ user: publicUser(user), settings }));
});

route('POST', /^\/api\/logout$/, 'teacher', async (req, res, ctx) => {
  await destroySession(ctx.token);
  await log(ctx.user, 'logout', '');
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Set-Cookie': `session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${COOKIE_SECURE}`,
  });
  res.end(JSON.stringify({ ok: true }));
});

route('GET', /^\/api\/me$/, 'teacher', async (req, res, ctx) => {
  json(res, 200, { user: publicUser(ctx.user), settings: await getSettings() });
});

route('POST', /^\/api\/password$/, 'teacher', async (req, res, ctx) => {
  const { current, next } = ctx.body || {};
  if (!verifyPassword(String(current || ''), ctx.user.password_hash)) {
    return badRequest(res, '현재 비밀번호가 올바르지 않습니다.');
  }
  if (!validPassword(next)) return badRequest(res, '새 비밀번호는 8자 이상이어야 합니다.');
  await q('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [hashPassword(next), ctx.user.id]);
  await log(ctx.user, 'password_changed', '');
  json(res, 200, { ok: true });
});

// ================= 프로그램 =================
// 프로그램 + 링크/파일 수를 한 번에 조회
const PROGRAM_SELECT = `
  SELECT p.*, ${TS('p.created_at')} AS created_at, ${TS('p.updated_at')} AS updated_at,
    (SELECT count(*)::int FROM program_links l WHERE l.program_id = p.id AND l.kind = 'link') AS link_count,
    (SELECT count(*)::int FROM program_links l WHERE l.program_id = p.id AND l.kind = 'aiapp') AS aiapp_count,
    (SELECT count(*)::int FROM program_links l WHERE l.program_id = p.id AND l.kind = 'video') AS video_count,
    (SELECT count(*)::int FROM program_files f WHERE f.program_id = p.id) AS file_count
  FROM programs p`;

function programWithMeta(p) {
  return {
    ...p,
    published: !!p.published,
    linkCount: p.link_count, aiappCount: p.aiapp_count, videoCount: p.video_count, fileCount: p.file_count,
  };
}

route('GET', /^\/api\/programs$/, 'teacher', async (req, res, ctx) => {
  // 교사는 공개 중인 프로그램만, 관리자는 전체
  const where = ctx.user.role === 'admin' ? '' : 'WHERE p.published = true';
  const rows = await q(`${PROGRAM_SELECT} ${where} ORDER BY p.sort_order, p.id DESC`);
  json(res, 200, { programs: rows.map(programWithMeta) });
});

route('GET', /^\/api\/programs\/(\d+)$/, 'teacher', async (req, res, ctx) => {
  const program = await one(`${PROGRAM_SELECT} WHERE p.id = $1`, [Number(ctx.params[0])]);
  if (!program) return notFound(res);
  // 회수 스위치 1: 비공개 프로그램은 교사에게 즉시 차단
  if (ctx.user.role !== 'admin' && !program.published) return forbidden(res, '비공개 처리된 프로그램입니다.');
  const links = await q('SELECT * FROM program_links WHERE program_id = $1 ORDER BY position, id', [program.id]);
  const files = await q(`SELECT id, program_id, name, mime, size, downloadable, ${TS('created_at')} AS created_at FROM program_files WHERE program_id = $1 ORDER BY id`, [program.id]);
  const boards = await q(
    `SELECT b.id, b.title, b.code, b.is_open, b.created_by, ${TS('b.created_at')} AS created_at,
       (SELECT count(*)::int FROM board_posts p WHERE p.board_id = b.id AND p.hidden = false) AS post_count
     FROM boards b WHERE b.program_id = $1 ORDER BY b.id DESC`, [program.id]);
  json(res, 200, { program: programWithMeta(program), links, files, boards });
});

route('POST', /^\/api\/programs$/, 'admin', async (req, res, ctx) => {
  const { title, category, description } = ctx.body || {};
  if (!title || !String(title).trim()) return badRequest(res, '제목을 입력하세요.');
  const r = await one(
    'INSERT INTO programs (title, category, description) VALUES ($1, $2, $3) RETURNING id',
    [String(title).trim(), String(category || '').trim().slice(0, 50), String(description || '').trim()]
  );
  await log(ctx.user, 'program_created', `id=${r.id} title=${title}`, req);
  json(res, 200, { ok: true, id: r.id });
});

route('PATCH', /^\/api\/programs\/(\d+)$/, 'admin', async (req, res, ctx) => {
  const program = await one('SELECT * FROM programs WHERE id = $1', [Number(ctx.params[0])]);
  if (!program) return notFound(res);
  const { title, category, description, published, sort_order } = ctx.body || {};
  if (title !== undefined && String(title).trim()) {
    await q('UPDATE programs SET title = $1 WHERE id = $2', [String(title).trim(), program.id]);
  }
  if (category !== undefined) {
    await q('UPDATE programs SET category = $1 WHERE id = $2', [String(category).trim().slice(0, 50), program.id]);
  }
  if (description !== undefined) {
    await q('UPDATE programs SET description = $1 WHERE id = $2', [String(description).trim(), program.id]);
  }
  if (published !== undefined) {
    // 회수 스위치 1: 즉시 비공개 — 다음 요청부터 교사 목록·상세·다운로드가 모두 차단된다
    await q('UPDATE programs SET published = $1 WHERE id = $2', [!!published, program.id]);
  }
  if (sort_order !== undefined && Number.isInteger(Number(sort_order))) {
    await q('UPDATE programs SET sort_order = $1 WHERE id = $2', [Number(sort_order), program.id]);
  }
  await q('UPDATE programs SET updated_at = now() WHERE id = $1', [program.id]);
  await log(ctx.user, 'program_updated', `id=${program.id} ${JSON.stringify(ctx.body).slice(0, 200)}`, req);
  json(res, 200, { ok: true });
});

route('DELETE', /^\/api\/programs\/(\d+)$/, 'admin', async (req, res, ctx) => {
  const program = await one('SELECT * FROM programs WHERE id = $1', [Number(ctx.params[0])]);
  if (!program) return notFound(res);
  // 첨부 원본까지 소멸: Supabase 버킷 객체 삭제 후 row 삭제 (links/files는 CASCADE)
  if (storage.storageEnabled) {
    const files = await q('SELECT storage_path FROM program_files WHERE program_id = $1', [program.id]);
    for (const f of files) await storage.removeObject(f.storage_path);
  }
  await q('DELETE FROM programs WHERE id = $1', [program.id]);
  await log(ctx.user, 'program_deleted', `id=${program.id} title=${program.title}`, req);
  json(res, 200, { ok: true });
});

// 링크 배열 전체 교체 (kind: link=외부 링크, aiapp=웹앱, video=유튜브 임베드)
route('PUT', /^\/api\/programs\/(\d+)\/links$/, 'admin', async (req, res, ctx) => {
  const program = await one('SELECT * FROM programs WHERE id = $1', [Number(ctx.params[0])]);
  if (!program) return notFound(res);
  const links = Array.isArray(ctx.body?.links) ? ctx.body.links : null;
  if (!links) return badRequest(res, 'links 배열이 필요합니다.');
  if (links.length > 50) return badRequest(res, '링크는 프로그램당 50개 이하로 등록하세요.');
  const cleaned = [];
  for (const [i, l] of links.entries()) {
    const kind = ['link', 'aiapp', 'video'].includes(l.kind) ? l.kind : 'link';
    const url = String(l.url || '').trim();
    if (!URL_RE.test(url)) return badRequest(res, `${i + 1}번째 링크 주소는 https:// 로 시작해야 합니다.`);
    cleaned.push({ kind, url, label: String(l.label || '').trim().slice(0, 100) });
  }
  await q('DELETE FROM program_links WHERE program_id = $1', [program.id]);
  for (const [i, l] of cleaned.entries()) {
    await q('INSERT INTO program_links (program_id, position, kind, label, url) VALUES ($1, $2, $3, $4, $5)',
      [program.id, i, l.kind, l.label, l.url]);
  }
  await q('UPDATE programs SET updated_at = now() WHERE id = $1', [program.id]);
  await log(ctx.user, 'program_links_updated', `id=${program.id} 링크 ${cleaned.length}개`, req);
  json(res, 200, { ok: true, count: cleaned.length });
});

// ================= 첨부파일 (Supabase 서명 업로드 3단계) =================
// 확장자 허용 목록 — 파일명에서 판별 (브라우저 mime은 hwp 등에서 부정확)
const FILE_EXT_RE = /\.(pdf|ppt|pptx|doc|docx|xls|xlsx|hwp|hwpx|zip|png|jpg|jpeg|webp|gif)$/i;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// 1) 서명 업로드 URL 발급 — 브라우저가 이 URL로 파일을 직접 PUT (Vercel 4.5MB 한도 우회)
route('POST', /^\/api\/programs\/(\d+)\/file-sign$/, 'admin', async (req, res, ctx) => {
  if (!storage.storageEnabled) return badRequest(res, '파일 저장소가 설정되지 않았습니다. (SUPABASE_URL/SERVICE_KEY)');
  const program = await one('SELECT * FROM programs WHERE id = $1', [Number(ctx.params[0])]);
  if (!program) return notFound(res);
  const name = String(ctx.body?.name || '').trim();
  const ext = FILE_EXT_RE.exec(name);
  if (!name || !ext) return badRequest(res, '허용되지 않는 파일 형식입니다. (pdf/ppt/doc/hwp/zip/이미지)');
  const size = Number(ctx.body?.size || 0);
  if (!size || size > MAX_FILE_SIZE) return badRequest(res, '파일은 100MB 이하여야 합니다.');
  const rand = crypto.randomBytes(8).toString('hex');
  const path = `program${program.id}/${Date.now()}-${rand}.${ext[1].toLowerCase()}`;
  try {
    const { uploadUrl } = await storage.createSignedUpload(path);
    json(res, 200, { uploadUrl, path });
  } catch (e) {
    json(res, 502, { error: String(e.message).slice(0, 200) });
  }
});

// 2) 업로드 완료 확인 → 파일 등록
route('POST', /^\/api\/programs\/(\d+)\/file-confirm$/, 'admin', async (req, res, ctx) => {
  if (!storage.storageEnabled) return badRequest(res, '파일 저장소가 설정되지 않았습니다.');
  const program = await one('SELECT * FROM programs WHERE id = $1', [Number(ctx.params[0])]);
  if (!program) return notFound(res);
  const path = String(ctx.body?.path || '');
  const name = String(ctx.body?.name || '').trim().slice(0, 200);
  const mime = String(ctx.body?.mime || 'application/octet-stream').slice(0, 100);
  const size = Number(ctx.body?.size || 0);
  if (!path.startsWith(`program${program.id}/`) || !name) return badRequest(res, '잘못된 요청입니다.');
  const f = await one(
    'INSERT INTO program_files (program_id, name, mime, size, storage_path, downloadable) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [program.id, name, mime, size, path, !!ctx.body?.downloadable] // 기본 보기 전용
  );
  await q('UPDATE programs SET updated_at = now() WHERE id = $1', [program.id]);
  await log(ctx.user, 'file_uploaded', `program=${program.id} name=${name}`, req);
  json(res, 200, { ok: true, id: f.id });
});

// 파일 접근 공통 확인: 존재 + (교사면) 소속 프로그램 공개 여부
async function fileForViewer(ctx) {
  const f = await one('SELECT * FROM program_files WHERE id = $1', [Number(ctx.params[0])]);
  if (!f) return { error: 404 };
  const program = await one('SELECT * FROM programs WHERE id = $1', [f.program_id]);
  if (!program) return { error: 404 };
  if (ctx.user.role !== 'admin' && !program.published) return { error: 403 };
  return { f };
}

// 3) 다운로드: 공개 확인 + 보기 전용 차단 → 단기(10분) 서명 URL로 302
route('GET', /^\/api\/files\/(\d+)\/download$/, 'teacher', async (req, res, ctx) => {
  const { f, error } = await fileForViewer(ctx);
  if (error === 404) return notFound(res);
  if (error === 403) return forbidden(res, '비공개 처리된 프로그램의 자료입니다.');
  // 보기 전용 파일은 교사 다운로드 차단 (관리자는 원본 관리 주체라 항상 허용)
  if (ctx.user.role !== 'admin' && !f.downloadable) return forbidden(res, '보기 전용 자료입니다. 화면에서 열람만 할 수 있습니다.');
  if (!storage.storageEnabled) return json(res, 502, { error: '파일 저장소가 설정되지 않았습니다.' });
  try {
    const url = await storage.createSignedDownload(f.storage_path, { downloadName: f.name });
    await log(ctx.user, 'file_downloaded', `id=${f.id} name=${f.name}`, req);
    res.writeHead(302, { Location: url, 'Cache-Control': 'private, no-store' });
    res.end();
  } catch {
    json(res, 502, { error: '파일을 불러올 수 없습니다.' });
  }
});

// 4) 열람(보기 전용): 60초짜리 inline 서명 URL을 JSON으로 — 뷰어가 iframe/img로 표시
route('GET', /^\/api\/files\/(\d+)\/view$/, 'teacher', async (req, res, ctx) => {
  const { f, error } = await fileForViewer(ctx);
  if (error === 404) return notFound(res);
  if (error === 403) return forbidden(res, '비공개 처리된 프로그램의 자료입니다.');
  if (!storage.storageEnabled) return json(res, 502, { error: '파일 저장소가 설정되지 않았습니다.' });
  try {
    const url = await storage.createSignedDownload(f.storage_path, { ttl: 60 });
    await log(ctx.user, 'file_viewed', `id=${f.id} name=${f.name}`, req);
    json(res, 200, { url, mime: f.mime, name: f.name });
  } catch {
    json(res, 502, { error: '파일을 불러올 수 없습니다.' });
  }
});

// 파일별 다운로드 허용 토글
route('PATCH', /^\/api\/files\/(\d+)$/, 'admin', async (req, res, ctx) => {
  const f = await one('SELECT * FROM program_files WHERE id = $1', [Number(ctx.params[0])]);
  if (!f) return notFound(res);
  if (ctx.body?.downloadable !== undefined) {
    await q('UPDATE program_files SET downloadable = $1 WHERE id = $2', [!!ctx.body.downloadable, f.id]);
  }
  await log(ctx.user, 'file_updated', `id=${f.id} downloadable=${!!ctx.body?.downloadable}`, req);
  json(res, 200, { ok: true });
});

route('DELETE', /^\/api\/files\/(\d+)$/, 'admin', async (req, res, ctx) => {
  const f = await one('SELECT * FROM program_files WHERE id = $1', [Number(ctx.params[0])]);
  if (!f) return notFound(res);
  await storage.removeObject(f.storage_path); // 원본 소멸 — 버킷에서 즉시 삭제
  await q('DELETE FROM program_files WHERE id = $1', [f.id]);
  await log(ctx.user, 'file_deleted', `id=${f.id} name=${f.name}`, req);
  json(res, 200, { ok: true });
});

// ================= 학생 활동 보드 (패들렛형) =================
// 학생은 계정 없이 6자리 참여 코드로 접근. 파일 실체는 관리자 소유 비공개 버킷.
const POST_FILE_EXT_RE = /\.(pdf|ppt|pptx|doc|docx|xls|xlsx|hwp|hwpx|png|jpg|jpeg|webp|gif)$/i;
const MAX_POST_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// 로그인 없는 학생 라우트는 디스패처의 킬스위치 게이트를 타지 않으므로 직접 확인
async function siteClosed(res) {
  const s = await getSettings();
  if (!s.site_open) { json(res, 403, { error: 'site_closed', notice: s.site_notice || '' }); return true; }
  return false;
}

function canManageBoard(user, board) {
  return user.role === 'admin' || board.created_by === user.id;
}

// 열린 보드 + 소속 프로그램 공개 확인 (학생 접근용 — 마감·비공개·삭제 모두 즉시 차단)
async function openBoardByCode(code) {
  const board = await one('SELECT * FROM boards WHERE code = $1', [String(code)]);
  if (!board || !board.is_open) return null;
  const program = await one('SELECT * FROM programs WHERE id = $1', [board.program_id]);
  if (!program || !program.published) return null;
  return { board, program };
}

// 이미지 게시물에 미리보기 URL(10분 inline)을 붙인다
async function withPreviews(posts) {
  return Promise.all(posts.map(async (p) => {
    let previewUrl = null;
    if (p.storage_path && /^image\//.test(p.mime || '') && storage.storageEnabled) {
      try { previewUrl = await storage.createSignedDownload(p.storage_path, { ttl: 600 }); } catch {}
    }
    return { ...p, previewUrl };
  }));
}

// 보드 생성 (교사도 가능 — 수업 진행자)
route('POST', /^\/api\/programs\/(\d+)\/boards$/, 'teacher', async (req, res, ctx) => {
  const program = await one('SELECT * FROM programs WHERE id = $1', [Number(ctx.params[0])]);
  if (!program) return notFound(res);
  if (ctx.user.role !== 'admin' && !program.published) return forbidden(res, '비공개 프로그램에는 보드를 만들 수 없습니다.');
  const title = String(ctx.body?.title || '').trim().slice(0, 100);
  if (!title) return badRequest(res, '보드 제목을 입력하세요.');
  // 6자리 코드 (중복 시 재시도)
  let board = null;
  for (let i = 0; i < 5 && !board; i++) {
    const code = String(crypto.randomInt(100000, 1000000));
    try {
      board = await one(
        'INSERT INTO boards (program_id, title, code, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
        [program.id, title, code, ctx.user.id]);
    } catch (e) {
      if (!String(e.message).includes('duplicate key')) throw e;
    }
  }
  if (!board) return json(res, 500, { error: '코드 생성에 실패했습니다. 다시 시도하세요.' });
  await log(ctx.user, 'board_created', `id=${board.id} program=${program.id} title=${title}`, req);
  json(res, 200, { ok: true, id: board.id, code: board.code });
});

// 보드 마감/재개·제목 변경 (만든 교사 또는 관리자)
route('PATCH', /^\/api\/boards\/(\d+)$/, 'teacher', async (req, res, ctx) => {
  const board = await one('SELECT * FROM boards WHERE id = $1', [Number(ctx.params[0])]);
  if (!board) return notFound(res);
  if (!canManageBoard(ctx.user, board)) return forbidden(res, '이 보드를 관리할 권한이 없습니다.');
  if (ctx.body?.is_open !== undefined) {
    // 회수: 마감 즉시 학생 제출·열람 차단 (결과물은 교사·관리자 열람 유지)
    await q('UPDATE boards SET is_open = $1 WHERE id = $2', [!!ctx.body.is_open, board.id]);
  }
  if (ctx.body?.title !== undefined && String(ctx.body.title).trim()) {
    await q('UPDATE boards SET title = $1 WHERE id = $2', [String(ctx.body.title).trim().slice(0, 100), board.id]);
  }
  await log(ctx.user, 'board_updated', `id=${board.id} ${JSON.stringify(ctx.body).slice(0, 100)}`, req);
  json(res, 200, { ok: true });
});

// 보드 삭제 (관리자) — 게시물 첨부 원본까지 소멸
route('DELETE', /^\/api\/boards\/(\d+)$/, 'admin', async (req, res, ctx) => {
  const board = await one('SELECT * FROM boards WHERE id = $1', [Number(ctx.params[0])]);
  if (!board) return notFound(res);
  if (storage.storageEnabled) {
    const files = await q('SELECT storage_path FROM board_posts WHERE board_id = $1 AND storage_path IS NOT NULL', [board.id]);
    for (const f of files) await storage.removeObject(f.storage_path);
  }
  await q('DELETE FROM boards WHERE id = $1', [board.id]);
  await log(ctx.user, 'board_deleted', `id=${board.id} title=${board.title}`, req);
  json(res, 200, { ok: true });
});

// 게시물 열람 (교사·관리자 — 마감 후에도 보관물 열람 가능)
route('GET', /^\/api\/boards\/(\d+)\/posts$/, 'teacher', async (req, res, ctx) => {
  const board = await one('SELECT * FROM boards WHERE id = $1', [Number(ctx.params[0])]);
  if (!board) return notFound(res);
  const program = await one('SELECT * FROM programs WHERE id = $1', [board.program_id]);
  if (ctx.user.role !== 'admin' && !program.published) return forbidden(res, '비공개 처리된 프로그램입니다.');
  const posts = await q(`SELECT *, ${TS('created_at')} AS created_at FROM board_posts WHERE board_id = $1 ORDER BY id DESC`, [board.id]);
  json(res, 200, {
    board: { id: board.id, title: board.title, code: board.code, isOpen: !!board.is_open, createdBy: board.created_by },
    program: { id: program.id, title: program.title },
    manageable: canManageBoard(ctx.user, board),
    posts: await withPreviews(posts),
  });
});

// 게시물 숨김 토글 (보드 관리자)
route('PATCH', /^\/api\/posts\/(\d+)$/, 'teacher', async (req, res, ctx) => {
  const post = await one('SELECT * FROM board_posts WHERE id = $1', [Number(ctx.params[0])]);
  if (!post) return notFound(res);
  const board = await one('SELECT * FROM boards WHERE id = $1', [post.board_id]);
  if (!canManageBoard(ctx.user, board)) return forbidden(res);
  if (ctx.body?.hidden !== undefined) {
    await q('UPDATE board_posts SET hidden = $1 WHERE id = $2', [!!ctx.body.hidden, post.id]);
  }
  json(res, 200, { ok: true });
});

// 게시물 삭제 (보드 관리자) — 첨부 원본 소멸
route('DELETE', /^\/api\/posts\/(\d+)$/, 'teacher', async (req, res, ctx) => {
  const post = await one('SELECT * FROM board_posts WHERE id = $1', [Number(ctx.params[0])]);
  if (!post) return notFound(res);
  const board = await one('SELECT * FROM boards WHERE id = $1', [post.board_id]);
  if (!canManageBoard(ctx.user, board)) return forbidden(res);
  if (post.storage_path) await storage.removeObject(post.storage_path);
  await q('DELETE FROM board_posts WHERE id = $1', [post.id]);
  await log(ctx.user, 'post_deleted', `id=${post.id} board=${post.board_id} name=${post.student_name}`, req);
  json(res, 200, { ok: true });
});

// 학생 결과물 다운로드 (교사 — 수합 목적이므로 항상 허용, 원본 파일명 유지)
route('GET', /^\/api\/posts\/(\d+)\/download$/, 'teacher', async (req, res, ctx) => {
  const post = await one('SELECT * FROM board_posts WHERE id = $1', [Number(ctx.params[0])]);
  if (!post || !post.storage_path) return notFound(res);
  if (!storage.storageEnabled) return json(res, 502, { error: '파일 저장소가 설정되지 않았습니다.' });
  try {
    const url = await storage.createSignedDownload(post.storage_path, { downloadName: post.file_name || 'file' });
    await log(ctx.user, 'post_downloaded', `id=${post.id} name=${post.file_name}`, req);
    res.writeHead(302, { Location: url, 'Cache-Control': 'private, no-store' });
    res.end();
  } catch {
    json(res, 502, { error: '파일을 불러올 수 없습니다.' });
  }
});

// ---- 학생용 (로그인 불필요 — 참여 코드가 인증) ----

// 보드 입장: 보드 정보 + 공개 게시물
route('GET', /^\/api\/join-board\/(\d{6})$/, null, async (req, res, ctx) => {
  if (await siteClosed(res)) return;
  const found = await openBoardByCode(ctx.params[0]);
  if (!found) return json(res, 403, { error: 'board_closed', message: '마감되었거나 없는 보드입니다.' });
  const posts = await q(
    `SELECT id, student_name, content, file_name, mime, ${TS('created_at')} AS created_at, storage_path
     FROM board_posts WHERE board_id = $1 AND hidden = false ORDER BY id DESC LIMIT 200`,
    [found.board.id]);
  const withUrls = (await withPreviews(posts)).map(({ storage_path, ...p }) => p); // 경로는 노출 안 함
  json(res, 200, {
    board: { title: found.board.title, code: found.board.code },
    programTitle: found.program.title,
    posts: withUrls,
  });
});

// 학생 첨부 서명 업로드 (활동지·사진)
route('POST', /^\/api\/join-board\/(\d{6})\/file-sign$/, null, async (req, res, ctx) => {
  if (await siteClosed(res)) return;
  const found = await openBoardByCode(ctx.params[0]);
  if (!found) return json(res, 403, { error: 'board_closed', message: '마감되었거나 없는 보드입니다.' });
  if (!storage.storageEnabled) return badRequest(res, '파일 저장소가 설정되지 않았습니다.');
  const name = String(ctx.body?.name || '').trim();
  const ext = POST_FILE_EXT_RE.exec(name);
  if (!name || !ext) return badRequest(res, '허용되지 않는 파일 형식입니다. (pdf/한글/오피스/이미지)');
  const size = Number(ctx.body?.size || 0);
  if (!size || size > MAX_POST_FILE_SIZE) return badRequest(res, '파일은 20MB 이하여야 합니다.');
  const rand = crypto.randomBytes(8).toString('hex');
  const path = `board${found.board.id}/${Date.now()}-${rand}.${ext[1].toLowerCase()}`;
  try {
    const { uploadUrl } = await storage.createSignedUpload(path);
    json(res, 200, { uploadUrl, path });
  } catch (e) {
    json(res, 502, { error: String(e.message).slice(0, 200) });
  }
});

// 게시물 등록 (글 또는 글+첨부)
route('POST', /^\/api\/join-board\/(\d{6})\/posts$/, null, async (req, res, ctx) => {
  if (await siteClosed(res)) return;
  const found = await openBoardByCode(ctx.params[0]);
  if (!found) return json(res, 403, { error: 'board_closed', message: '마감되었거나 없는 보드입니다.' });
  const studentName = String(ctx.body?.student_name || '').trim().slice(0, 20);
  const content = String(ctx.body?.content || '').trim().slice(0, 2000);
  const path = ctx.body?.path ? String(ctx.body.path) : null;
  const fileName = String(ctx.body?.file_name || '').trim().slice(0, 200) || null;
  if (!studentName) return badRequest(res, '이름을 입력하세요.');
  if (!content && !path) return badRequest(res, '내용을 쓰거나 파일을 첨부하세요.');
  if (path && !path.startsWith(`board${found.board.id}/`)) return badRequest(res, '잘못된 요청입니다.');
  if (path && !fileName) return badRequest(res, '파일 이름이 필요합니다.');
  // 도배 방지: 같은 IP 분당 3건
  const ip = clientIp(req);
  const recent = await one(
    "SELECT count(*)::int AS c FROM board_posts WHERE ip = $1 AND created_at > now() - interval '1 minute'", [ip]);
  if (recent.c >= 3) return json(res, 429, { error: '너무 자주 올리고 있어요. 잠시 후 다시 시도하세요.' });
  const r = await one(
    `INSERT INTO board_posts (board_id, student_name, content, file_name, storage_path, mime, size, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [found.board.id, studentName, content, fileName, path,
      path ? String(ctx.body?.mime || 'application/octet-stream').slice(0, 100) : null,
      path ? Number(ctx.body?.size || 0) : null, ip]);
  await log(null, 'post_created', `board=${found.board.id} name=${studentName}${fileName ? ` file=${fileName}` : ''}`, req);
  json(res, 200, { ok: true, id: r.id });
});

// ================= 사용자 관리 =================
route('GET', /^\/api\/users$/, 'admin', async (req, res, ctx) => {
  const all = await q(`${USER_SELECT} ORDER BY role, username`);
  json(res, 200, { users: all.map((u) => ({ ...publicUser(u), manageable: u.id !== ctx.user.id })) });
});

route('POST', /^\/api\/users$/, 'admin', async (req, res, ctx) => {
  const { username, name, role, password } = ctx.body || {};
  if (!USERNAME_RE.test(String(username || ''))) {
    return badRequest(res, '아이디는 3~30자의 영문/숫자/._- 만 가능합니다.');
  }
  if (!name || String(name).trim().length === 0) return badRequest(res, '이름을 입력하세요.');
  if (!ROLE_LABELS[role]) return badRequest(res, '올바르지 않은 역할입니다.');
  if (!validPassword(password)) return badRequest(res, '비밀번호는 8자 이상이어야 합니다.');
  try {
    const r = await one(
      `INSERT INTO users (username, password_hash, name, role, must_change_password)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [String(username).trim(), hashPassword(String(password)), String(name).trim(), role]
    );
    await log(ctx.user, 'user_created', `id=${r.id} username=${username} role=${role}`, req);
    json(res, 200, { ok: true, id: r.id });
  } catch (e) {
    if (String(e.message).includes('duplicate key')) return badRequest(res, '이미 존재하는 아이디입니다.');
    throw e;
  }
});

route('PATCH', /^\/api\/users\/(\d+)$/, 'admin', async (req, res, ctx) => {
  const target = await one('SELECT * FROM users WHERE id = $1', [Number(ctx.params[0])]);
  if (!target) return notFound(res);
  if (target.id === ctx.user.id) return badRequest(res, '본인 계정은 여기서 변경할 수 없습니다.');
  const { active, name } = ctx.body || {};
  if (active !== undefined) {
    await q('UPDATE users SET active = $1 WHERE id = $2', [!!active, target.id]);
    // 회수 스위치 2: 정지 즉시 세션 삭제 → 다음 요청부터 강퇴 (auth.js가 매 요청 active=true 확인)
    if (!active) await q('DELETE FROM sessions WHERE user_id = $1', [target.id]);
  }
  if (name !== undefined && String(name).trim()) {
    await q('UPDATE users SET name = $1 WHERE id = $2', [String(name).trim(), target.id]);
  }
  await log(ctx.user, 'user_updated', `id=${target.id} ${JSON.stringify(ctx.body).slice(0, 200)}`, req);
  json(res, 200, { ok: true });
});

route('POST', /^\/api\/users\/(\d+)\/reset-password$/, 'admin', async (req, res, ctx) => {
  const target = await one('SELECT * FROM users WHERE id = $1', [Number(ctx.params[0])]);
  if (!target) return notFound(res);
  const { password } = ctx.body || {};
  if (!validPassword(password)) return badRequest(res, '비밀번호는 8자 이상이어야 합니다.');
  await q('UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2', [hashPassword(String(password)), target.id]);
  await q('DELETE FROM sessions WHERE user_id = $1', [target.id]);
  await log(ctx.user, 'password_reset', `target=${target.username}`, req);
  json(res, 200, { ok: true });
});

route('DELETE', /^\/api\/users\/(\d+)$/, 'admin', async (req, res, ctx) => {
  const target = await one('SELECT * FROM users WHERE id = $1', [Number(ctx.params[0])]);
  if (!target) return notFound(res);
  if (target.id === ctx.user.id) return badRequest(res, '본인 계정은 삭제할 수 없습니다.');
  await q('DELETE FROM sessions WHERE user_id = $1', [target.id]);
  await q('DELETE FROM users WHERE id = $1', [target.id]);
  await log(ctx.user, 'user_deleted', `target=${target.username}`, req);
  json(res, 200, { ok: true });
});

// ================= 사이트 설정 (킬스위치) =================
route('GET', /^\/api\/settings$/, 'teacher', async (req, res) => {
  json(res, 200, { settings: await getSettings() });
});

route('PATCH', /^\/api\/settings$/, 'admin', async (req, res, ctx) => {
  const b = ctx.body || {};
  // 회수 스위치 3: site_open=false → 관리자를 제외한 모든 API가 즉시 403 site_closed
  if (b.site_open !== undefined) await setSetting('site_open', !!b.site_open);
  if (b.site_notice !== undefined) await setSetting('site_notice', String(b.site_notice ?? '').slice(0, 500));
  await log(ctx.user, 'settings_updated', JSON.stringify(b).slice(0, 200), req);
  json(res, 200, { settings: await getSettings() });
});

// ================= 감사 로그 =================
route('GET', /^\/api\/logs$/, 'admin', async (req, res) => {
  const rows = await q(`SELECT *, ${TS('created_at')} AS created_at FROM audit_logs ORDER BY id DESC LIMIT 300`);
  json(res, 200, { logs: rows });
});

// ================= 디스패처 =================
async function handleApi(req, res, pathname, body) {
  await ready(); // 스키마·시드 초기화 (인스턴스당 1회)
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.pattern.exec(pathname);
    if (!m) continue;

    // 인증
    let user = null;
    let token = null;
    if (r.minRole !== null) {
      const session = await getSessionUser(req);
      if (!session) return json(res, 401, { error: '로그인이 필요합니다.' });
      user = session.user;
      token = session.token;
      if (roleLevel(user.role) < roleLevel(r.minRole)) return forbidden(res);

      // 사이트 킬스위치: 관리자가 아니면 폐쇄 중 모든 API 차단 (예외 경로 제외)
      if (user.role !== 'admin' && !SITE_EXEMPT.some((re) => re.test(pathname))) {
        const s = await getSettings();
        if (!s.site_open) return json(res, 403, { error: 'site_closed', notice: s.site_notice || '' });
      }
    }
    return r.handler(req, res, { user, token, params: m.slice(1), body });
  }
  notFound(res);
}

module.exports = { handleApi };
