'use strict';
// Submission snapshots and receipts use existing Hub settings. Career originals are append-only through the Edge API.
const career = require('./submission-career');
const crypto = require('node:crypto');
const { submissionSettings } = require('./course-plan');
const TTL = 8 * 3600 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[a-f0-9]{64}$/;
const MIME = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', pdf:'application/pdf', ppt:'application/vnd.ms-powerpoint', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation', doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', hwp:'application/x-hwp', hwpx:'application/hwp+zip' };
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
const parse = row => row ? JSON.parse(row.value) : null;
const short = (v, max, required = false) => {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim())) fail(400,'입력 내용을 확인하세요.');
  return v.trim();
};
function fileSpec(body) {
  const name = short(body?.name, 200, true), ext = name.split('.').pop().toLowerCase();
  if (!MIME[ext] || /[\\/\x00-\x1f]/.test(name)) fail(400,'사진·PDF·한글·오피스 파일을 선택하세요.');
  const size = body.size;
  if (!Number.isSafeInteger(size) || size < 1 || size > 20 * 1024 * 1024) fail(400,'파일은 0MB 초과 20MB 이하여야 합니다.');
  return { name, ext, size, mime: MIME[ext], type: MIME[ext].startsWith('image/') ? 'photo' : 'document' };
}
function sameOrigin(req) {
  // Browsers always send Origin on these JSON writes. Do not accept cross-site cookies.
  let origin; try { origin = new URL(req.headers.origin); } catch { fail(403,'수업 화면에서 다시 시도하세요.'); }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== req.headers.host || req.headers['sec-fetch-site'] === 'cross-site') fail(403,'수업 화면에서 다시 시도하세요.');
}
function createService({ db, storage, openBoardByCode, sharedMaterials, parseCookies, secure = false, clientIp, deliverCareer = career.deliver, resolveStudent = async () => null, authorizeStudent = async () => fail(503,'학생 계정 연결을 확인하세요.'), authorizeSchool = async () => fail(503,'학생 계정 연결을 확인하세요.'), logoutStudent = async () => {}, careerAvailable = () => false }) {
  const cfgKey = id => `sb:config:${id}`;
  const get = async (key, c = db) => parse(await c.one('SELECT value FROM settings WHERE key = $1', [key]));
  // The tenant view upserts in its INSERT trigger; ON CONFLICT only works on the legacy table.
  const put = async (key, value, c = db) => c.q('INSERT INTO settings (key,value) VALUES ($1,$2)' + (db.ACADEMY_ID ? '' : ' ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value'), [key, JSON.stringify(value)]);
  const lock = (c, key) => c.q('SELECT pg_advisory_xact_lock($1::bigint)', [BigInt.asIntN(64, BigInt('0x' + hash(key).slice(0,16))).toString()]);
  // hub.boards includes an outer join to the creator. Lock the actual tenant rows so
  // closing a class/unpublishing its program remains atomic with a submission.
  const lockOpenBoard = (c, id) => db.ACADEMY_ID
    ? c.one(`SELECT b.hub_id AS id FROM edu.sessions b
        JOIN edu.lesson_plans p ON p.id=b.lesson_plan_id AND p.academy_id=b.academy_id
        WHERE b.academy_id=hub.current_academy() AND b.hub_id=$1
          AND b.is_open=true AND p.published=true FOR SHARE OF b,p`, [id])
    : c.one('SELECT b.id FROM boards b JOIN programs p ON p.id=b.program_id WHERE b.id=$1 AND b.is_open=true AND p.published=true FOR SHARE OF b,p', [id]);
  async function board(code) {
    const found = await openBoardByCode(code);
    if (!found) fail(403,'마감되었거나 없는 수업입니다.');
    return found;
  }
  async function ownerBoard(id, user) {
    const b = await db.one('SELECT * FROM boards WHERE id = $1', [id]);
    if (!b) fail(404,'수업을 찾을 수 없습니다.');
    if (!user || (user.role !== 'admin' && (user.role !== 'teacher' || String(b.created_by) !== String(user.id)))) fail(403,'이 수업을 관리할 권한이 없습니다.');
    const cfg = await config(b);
    if (cfg.career?.schoolId) await authorizeSchool(user,cfg.career.schoolId);
    return b;
  }
  function cookie(res, id, token, maxAge = TTL / 1000) {
    const value = `moakit_submission_${id}=${token}; HttpOnly; SameSite=Strict; Path=/api/join-board/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
    const previous = res.getHeader?.('Set-Cookie');
    res.setHeader('Set-Cookie', previous ? [...(Array.isArray(previous) ? previous : [previous]), value] : value);
  }
  function binding(account) {
    return account ? {accountId:account.accountId, sessionHash:account.sessionHash, careerStudentId:account.careerStudentId} : null;
  }
  function sameBinding(left,right) {
    return !left && !right || !!left && !!right && left.accountId === right.accountId && left.sessionHash === right.sessionHash && left.careerStudentId === right.careerStudentId;
  }
  function owns(meta,who) {
    // Account ownership survives a fresh login, but can never fall back to an old guest cookie.
    return meta?.accountId ? meta.accountId === who.account?.accountId : !who.account && meta?.owner === who.owner;
  }
  async function accountFor(req,cfg) {
    const account = cfg.career?.schoolId ? await authorizeStudent(req,cfg.career.schoolId) : await resolveStudent(req);
    if (account && (!UUID.test(account.careerStudentId || '') || !account.accountId || !account.sessionHash || !Number.isFinite(new Date(account.expiresAt).getTime()) || new Date(account.expiresAt).getTime() <= Date.now())) fail(401,'학생 로그인을 다시 확인하세요.');
    if (cfg.career?.schoolId && !account) fail(401,'학생 계정으로 로그인하세요.');
    return account;
  }
  async function session(req, res, b, create = false) {
    const cfg = await config(b), account = await accountFor(req,cfg), accountBinding = binding(account);
    const token = parseCookies(req)[`moakit_submission_${b.id}`] || '';
    const owner = TOKEN.test(token) ? hash(token) : '';
    const key = `sb:session:${b.id}:${owner}`;
    const current = owner ? await get(key) : null;
    if (current && UUID.test(current.draftScope || '') && current.expires > Date.now() && sameBinding(current.account || null,accountBinding)) {
      return {owner,draftScope:current.draftScope,expires:Math.min(current.expires,account ? new Date(account.expiresAt).getTime() : Infinity),account,careerStudentId:account?.careerStudentId || null};
    }
    // A shared tablet must not keep A's submission cookie after logout or account switching.
    if (current) { await db.q('DELETE FROM settings WHERE key=$1',[key]); cookie(res,b.id,'',0); }
    if (!create) fail(401,'학생 입장을 다시 확인해 주세요. 작성 내용은 화면에 남아 있습니다.');
    const next = crypto.randomBytes(32).toString('hex'), nextOwner = hash(next);
    const expires = Math.min(Date.now() + TTL,account ? new Date(account.expiresAt).getTime() : Infinity);
    const draftScope = crypto.randomUUID();
    await put(`sb:session:${b.id}:${nextOwner}`, {expires,account:accountBinding,draftScope});
    cookie(res,b.id,next,Math.max(1,Math.floor((expires-Date.now())/1000)));
    return {owner:nextOwner,expires,draftScope,account,careerStudentId:account?.careerStudentId || null};
  }
  function assertDraft(who,body) {
    if ((who.account || body?.draftScope !== undefined) && body?.draftScope !== who.draftScope) fail(409,'학생이 바뀌었거나 수업에 다시 입장했습니다. 화면을 새로고침한 뒤 새 제출을 작성하세요.');
  }
  function publicSession(who) { return {accountLinked:!!who.account,draftScope:who.draftScope}; }
  async function joinContext(req,res,code) {
    const {board:b} = await board(code), who = await session(req,res,b,true);
    return {careerStudentId:null,...publicSession(who)};
  }
  async function authorizeAccess(req,res,code) {
    const {board:b} = await board(code);
    return session(req,res,b);
  }
  async function activityAccount(req,res,code,sessionId) {
    const {board:b} = await board(code), cfg = await config(b);
    if (!cfg.career?.enabled || !UUID.test(cfg.career.schoolId || '')) fail(403,'이 수업은 진로기록에 연결되어 있지 않습니다.');
    // Reads never create a board session. The student must first enter through the normal Hub flow.
    const who = await authorizeAccess(req,res,code);
    if (!who.account) fail(401,'학생 계정으로 로그인하세요.');
    const selected = findSession(cfg,sessionId);
    allowed(selected,'text');
    if (selected.record?.mode !== 'submission') fail(403,'이 차시는 진로기록 저장이 꺼져 있습니다.');
    if (!selected.record.process?.trim() || !selected.record.completion?.trim() || !selected.record.original?.trim()) fail(400,'선생님이 차시의 기록 설정을 확인해야 합니다.');
    const course = await studentCourse(b,cfg), lesson = course.sessions.find(s => s.id === selected.id);
    const origin = `${secure ? 'https' : 'http'}://${req.headers.host}`;
    const assigned = lesson.materials.links.some(link => {
      try { const url = new URL(link.url,origin); return url.origin === origin && /3차시-학생용-감각짝맞추기\.html$/i.test(decodeURIComponent(url.pathname)); } catch { return false; }
    });
    if (!assigned) fail(403,'이 차시에 공유된 식물 관찰 자료가 아닙니다.');
    return {...who,activitySessionId:selected.id};
  }
  async function activityContext(req,res,code) {
    const sessionId = new URL(req.url || '/', 'http://internal').searchParams.get('session_id');
    const who = await activityAccount(req,res,code,sessionId);
    return {...publicSession(who),sessionId:who.activitySessionId};
  }
  async function authorizeActivity(req,res,code,body) {
    sameOrigin(req);
    const who = await activityAccount(req,res,code,body?.session_id);
    assertDraft(who,body);
    return who;
  }
  async function identity(req,res,code) {
    await joinContext(req,res,code);
    return null; // A Career UUID is never sent to an external app or adopted from the browser.
  }
  async function config(b) {
    const saved = await get(cfgKey(b.id));
    if (saved) return saved;
    const lessons = await db.q('SELECT id,title FROM lessons WHERE program_id = $1 ORDER BY position,id', [b.program_id]);
    const sessions = (lessons.length ? lessons : [{ id:'common', title:'오늘의 활동' }]).map(l => ({ id:`lesson-${l.id}`, title:l.title || '오늘의 활동', minutes:40, bridge:'', sourceLessons:l.id === 'common' ? [] : [String(l.id)], assets:{}, submissions:submissionSettings() }));
    return { revision:null, variantId:'', name:'기본 수업', career:{enabled:false,schoolId:null}, sessions, activeSession:sessions[0].id };
  }
  function findSession(cfg, id) {
    const s = cfg.sessions.find(s => s.id === id);
    if (!s) fail(400,'수업 차시를 다시 선택하세요.');
    return s;
  }
  function allowed(s, type) {
    if (!s.submissions.enabled) fail(403,'이 차시는 제출이 닫혀 있습니다.');
    if (!s.submissions.types.includes(type)) fail(400,'이 차시에서 허용한 제출 형식을 선택하세요.');
  }
  async function studentCourse(b, cfg) {
    const shared = await sharedMaterials(b.id);
    const plannedUrls = new Set(cfg.sessions.flatMap(s => Object.values(s.assets || {}).map(a => a.url).filter(Boolean)));
    const plannedFiles = new Set(cfg.sessions.flatMap(s => Object.values(s.assets || {}).map(a => a.fileId && String(a.fileId)).filter(Boolean)));
    return { name:cfg.name, activeSession:cfg.activeSession, careerEnabled:cfg.career?.enabled === true, sessions:cfg.sessions.map(s => {
      const belongs = x => !x.lesson_id || s.sourceLessons.includes(String(x.lesson_id));
      // Only the teacher's board_items are exposed. A course plan does not grant file access.
      const links = shared.links.filter(l => plannedUrls.has(l.url) ? ['app','worksheet','ppt'].some(k => s.assets?.[k]?.url === l.url) : belongs(l));
      const files = shared.files.filter(f => plannedFiles.has(String(f.id)) ? ['app','worksheet','ppt'].some(k => String(s.assets?.[k]?.fileId) === String(f.id)) : belongs(f));
      return { id:s.id, title:s.title, minutes:s.minutes, bridge:s.bridge, submissions:s.submissions, record:{enabled:cfg.career?.enabled === true && s.record?.mode === 'submission',completion:s.record?.completion || ''}, materials:{
        links:links.map(l => s.assets?.app?.url === l.url ? {...l,kind:'aiapp'} : l),
        files:files.map(f => ({...f,purpose:String(s.assets?.app?.fileId) === String(f.id) ? 'app' : 'material'})),
      } };
    }) };
  }
  async function list(req, res, code) {
    const {board:b} = await board(code), who = await session(req,res,b,true), cfg = await config(b);
    await accountFor(req,cfg);
    const params = new URL(req.url || '/', 'http://internal').searchParams;
    const lesson = params.get('lesson') || '', mine = params.get('scope') === 'mine';
    // Archived session IDs remain browsable through 'my submissions'.
    if (lesson && !cfg.sessions.some(s => s.id === lesson)) fail(400,'차시를 다시 선택하세요.');
    const before = params.get('before');
    if (before && !/^[1-9]\d{0,18}$/.test(before)) fail(400,'목록 위치를 확인하세요.');
    const publicIds = cfg.sessions.filter(s => s.submissions.sharing === 'class').map(s => s.id);
    const rows = await db.q(`SELECT p.*, m.value AS submission_meta FROM board_posts p
      LEFT JOIN settings m ON m.key = 'sb:post:' || p.id::text
      WHERE p.board_id=$1 AND ((p.hidden=false AND (m.value IS NULL OR m.value::jsonb->>'sessionId'=ANY($6::text[]))) OR (m.value::jsonb->>'accountId'=$7 AND $7<>'') OR (m.value::jsonb->>'accountId' IS NULL AND $7='' AND m.value::jsonb->>'owner'=$2))
      AND ($3='' OR m.value::jsonb->>'sessionId'=$3) AND ($4=false OR (m.value::jsonb->>'accountId'=$7 AND $7<>'') OR (m.value::jsonb->>'accountId' IS NULL AND $7='' AND m.value::jsonb->>'owner'=$2))
      AND ($5::bigint IS NULL OR p.id<$5::bigint) ORDER BY p.id DESC LIMIT 61`, [b.id,who.owner,lesson,mine,before,publicIds,who.account?.accountId || '']);
    const posts = await Promise.all(rows.slice(0,60).map(async p => {
      const m = p.submission_meta ? JSON.parse(p.submission_meta) : null;
      return { id:p.id, student_name:p.student_name, title:m?.title || '활동 제출물', content:p.content, created_at:p.created_at, file_name:p.file_name, mime:p.mime, size:p.size,
        sessionId:m?.sessionId || '', sessionTitle:m?.sessionTitle || '이전 제출', mine:owns(m,who),
        visibility:!p.hidden && (!m || publicIds.includes(m.sessionId)) ? 'class' : 'teacher', careerStatus:career.receipt(m).state, career: owns(m,who) ? career.receipt(m) : undefined,
        previewUrl:p.storage_path && MIME[p.file_name?.split('.').pop().toLowerCase()]?.startsWith('image/') && storage.storageEnabled ? await storage.createSignedDownload(p.storage_path,{ttl:60}).catch(() => null) : null };
    }));
    return { course:await studentCourse(b,cfg), posts, next:rows.length > 60 ? String(rows[59].id) : null, sessionExpiresAt:who.expires, studentSession:publicSession(who) };
  }
  async function sign(req,res,code,body) {
    sameOrigin(req);
    const {board:b} = await board(code), who = await session(req,res,b), cfg = await config(b), s = findSession(cfg,body?.sessionId), spec = fileSpec(body);
    await accountFor(req,cfg);
    assertDraft(who,body);
    allowed(s,spec.type);
    if (!storage.storageEnabled) fail(503,'파일 저장소가 설정되지 않았습니다.');
    const uploadId = crypto.randomUUID(), path = `board${b.id}/${uploadId}.${spec.ext}`;
    // The upload receipt is bound to this session, class and lesson; paths from the browser are ignored.
    const {uploadUrl} = await storage.createSignedUpload(path);
    await put(`sb:upload:${b.id}:${uploadId}`, { ...spec, owner:who.owner, sessionId:s.id, path, expires:Date.now()+30*60*1000 });
    return { uploadId, uploadUrl, mime:spec.mime };
  }
  async function submit(req,res,code,body) {
    sameOrigin(req);
    const {board:b} = await board(code), who = await session(req,res,b);
    assertDraft(who,body);
    if (!UUID.test(body?.requestId || '')) fail(400,'제출 요청을 다시 시작하세요.');
    const data = { requestId:body.requestId.toLowerCase(), sessionId:short(body.sessionId,80,true), title:short(body.title,120,true), name:short(body.student_name,20,true), content:short(body.content || '',2000), uploadId:body.uploadId || null };
    if (data.uploadId && !UUID.test(data.uploadId)) fail(400,'첨부 파일을 다시 선택하세요.');
    if (!data.uploadId && !data.content) fail(400,'활동 내용을 쓰거나 파일을 첨부하세요.');
    const digest = hash(JSON.stringify(data)), eventKey = `sb:event:${b.id}:${who.account ? `account-${who.account.accountId}` : who.owner}:${data.requestId}`;
    const fallback = await config(b);
    const result = await db.transaction(async c => {
      await lock(c,eventKey);
      // Recheck access inside the transaction and hold shared row locks until INSERT commits.
      const current = await lockOpenBoard(c,b.id);
      const site = await c.one("SELECT value FROM settings WHERE key='site_open' FOR SHARE");
      const currentSession = await c.one('SELECT value FROM settings WHERE key=$1 FOR UPDATE',[`sb:session:${b.id}:${who.owner}`]);
      if (!current || site?.value !== '1') fail(403,'지금은 제출할 수 없는 수업입니다.');
      if (!currentSession || JSON.parse(currentSession.value).expires <= Date.now()) fail(401,'학생 입장을 다시 확인해 주세요.');
      await lock(c,cfgKey(b.id));
      const cfg = await get(cfgKey(b.id),c) || fallback;
      const s = findSession(cfg,data.sessionId);
      const account = await accountFor(req,cfg);
      if (!sameBinding(JSON.parse(currentSession.value).account || null,binding(account))) fail(401,'학생 로그인을 다시 확인하세요.');
      const previous = await get(eventKey,c);
      if (previous) {
        if (previous.digest !== digest) fail(409,'확인 중인 제출 내용은 바꿀 수 없습니다. 먼저 같은 내용으로 다시 확인하세요.');
        const existing = await c.one('SELECT id FROM board_posts WHERE id=$1 AND board_id=$2',[previous.id,b.id]);
        if (!existing) fail(410,'선생님이 삭제한 제출물입니다. 새 제출을 작성하세요.');
        const meta = await get(`sb:post:${previous.id}`,c);
        return {ok:true,id:previous.id,replayed:true,careerRequested:!!meta?.career};
      }
      let upload = null;
      if (data.uploadId) {
        const key = `sb:upload:${b.id}:${data.uploadId}`;
        const row = await c.one('SELECT value FROM settings WHERE key=$1 FOR UPDATE',[key]);
        upload = parse(row);
        if (!upload || upload.owner !== who.owner || upload.sessionId !== s.id || upload.expires <= Date.now() || upload.used) fail(400,'이 학생의 첨부 파일을 다시 올려주세요.');
        allowed(s,upload.type);
        const actual = await storage.inspectObject(upload.path).catch(() => fail(502,'업로드된 파일을 확인하지 못했습니다. 같은 제출로 다시 시도하세요.'));
        if (actual.size !== upload.size || actual.mime !== upload.mime) fail(400,'업로드한 파일의 형식이나 크기가 달라졌습니다. 파일을 다시 선택하세요.');
        await put(key,{...upload,used:true},c);
      } else allowed(s,'text');
      let careerSnapshot = null;
      if (cfg.career?.enabled === true && s.record?.mode === 'submission') {
        if (!cfg.career.schoolId || !account) fail(403,'진로기록을 저장하려면 학교와 학생 계정을 연결하세요.');
        if (!s.record.process?.trim() || !s.record.completion?.trim() || !s.record.original?.trim()) fail(400,'선생님이 차시의 기록 설정을 확인해야 합니다.');
        const attachment = upload ? await storage.archiveSubmission(upload).catch(() => fail(502,'첨부 원본 보관에 실패했습니다. 같은 제출로 다시 시도하세요.')) : null;
        careerSnapshot = career.snapshot({studentId:account.careerStudentId,board:b,session:s,data,attachment});
      }
      const ip = clientIp(req);
      await lock(c,`sb:rate:${ip}`);
      const recent = await c.one("SELECT count(*)::int AS c FROM board_posts WHERE ip=$1 AND created_at>now()-interval '1 minute'",[ip]);
      if (recent.c >= 120) fail(429,'잠시 후 같은 제출로 다시 시도해 주세요.');
      const row = await c.one(`INSERT INTO board_posts (board_id,student_name,content,file_name,storage_path,mime,size,ip,hidden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id`,[b.id,data.name,data.content,upload?.name || null,upload?.path || null,upload?.mime || null,upload?.size || null,ip]);
      await put(`sb:post:${row.id}`,{owner:who.owner,...(account ? {accountId:account.accountId,schoolId:cfg.career?.schoolId || null} : {}),studentName:data.name,title:data.title,sessionId:s.id,sessionTitle:s.title,requestId:data.requestId,...(careerSnapshot ? {career:{state:'pending',payload:careerSnapshot}} : {})},c);
      await put(eventKey,{id:row.id,digest},c);
      return {ok:true,id:row.id,replayed:false,careerRequested:!!careerSnapshot};
    });
    const {careerRequested,...response} = result;
    return {...response,career:careerRequested ? await saveCareer(req,res,code,result.id,body) : {state:'not_requested'}};
  }
  async function saveCareer(req,res,code,id,body) {
    sameOrigin(req);
    const {board:b} = await board(code), who = await session(req,res,b);
    assertDraft(who,body);
    const key = `sb:post:${id}`;
    // Retry only a committed snapshot owned by this authenticated opaque session.
    // A failed downstream write never rolls back a successfully submitted board post.
    return db.transaction(async c => {
      await lock(c,key);
      const m = await get(key,c);
      if (!m || !owns(m,who)) fail(403,'내 제출물의 기록만 저장할 수 있습니다.');
      if (!m.career) return career.receipt(m);
      if (m.career.payload.session_ref !== `hub-board:${b.id}`) fail(403,'수업 정보를 확인하세요.');
      const current = await lockOpenBoard(c,b.id);
      const site = await c.one("SELECT value FROM settings WHERE key='site_open' FOR SHARE");
      const identity = parse(await c.one('SELECT value FROM settings WHERE key=$1 FOR SHARE',[`sb:session:${b.id}:${who.owner}`]));
      if (!current || site?.value !== '1') fail(403,'지금은 기록을 저장할 수 없는 수업입니다.');
      await lock(c,cfgKey(b.id));
      const cfg = await get(cfgKey(b.id),c);
      if (!cfg?.career?.enabled || !cfg.career.schoolId || cfg.career.schoolId !== m.schoolId) fail(403,'이 수업의 진로기록 저장이 닫혀 있습니다.');
      const account = await accountFor(req,cfg);
      if (!identity || identity.expires <= Date.now() || !sameBinding(identity.account,binding(account)) || account.accountId !== m.accountId || account.careerStudentId !== m.career.payload.student_id) fail(401,'학생 입장을 다시 확인하세요.');
      if (m.career.state === 'saved') return career.receipt(m);
      try {
        const result = await deliverCareer(req,m.career.payload);
        m.career = {...m.career,...result,state:'saved'};
      } catch {
        m.career.state = 'pending';
      }
      await put(key,m,c);
      return career.receipt(m);
    });
  }
  async function records(req,res,code) {
    const {board:b} = await board(code), who = await session(req,res,b);
    if (!who.account) fail(401,'학생 계정으로 로그인하세요.');
    const before = new URL(req.url || '/', 'http://internal').searchParams.get('before');
    if (before && !/^[1-9]\d{0,18}$/.test(before)) fail(400,'목록 위치를 확인하세요.');
    const rows = await db.q("WITH career_posts AS MATERIALIZED (SELECT key,value FROM settings WHERE key ~ '^sb:post:[1-9][0-9]*$') SELECT key,value FROM career_posts WHERE value::jsonb->>'accountId'=$1 AND value::jsonb->'career'->'payload'->>'session_ref'=$2 AND ($3::bigint IS NULL OR substring(key from 9)::bigint<$3::bigint) ORDER BY substring(key from 9)::bigint DESC LIMIT 61",[who.account.accountId,`hub-board:${b.id}`,before]);
    return {scope:'current_student_account',studentSession:publicSession(who),records:rows.slice(0,60).map(row => {const m=JSON.parse(row.value);return {postId:row.key.slice(8),...career.receipt(m,true)};}),next:rows.length>60?rows[59].key.slice(8):null};
  }
  async function teacherRecords(id,user) {
    const b = await ownerBoard(id,user), cfg = await config(b);
    if (!cfg.career?.schoolId) return {records:[]};
    const rows = await db.q("WITH career_posts AS MATERIALIZED (SELECT key,value FROM settings WHERE key ~ '^sb:post:[1-9][0-9]*$') SELECT key,value FROM career_posts WHERE value::jsonb->'career'->'payload'->>'session_ref'=$1 ORDER BY substring(key from 9)::bigint DESC LIMIT 200",[`hub-board:${b.id}`]);
    return {records:rows.map(row=>{const m=JSON.parse(row.value);return {postId:row.key.slice(8),studentName:m.studentName||'이전 제출',...career.receipt(m,true)};})};
  }
  async function recordFile(req,res,code,id) {
    const {board:b} = await board(code), who = await session(req,res,b);
    const m = await get(`sb:post:${id}`), attachment = m?.career?.payload?.raw_data?.submission?.attachment;
    if (!m || !who.account || !owns(m,who) || m.career?.payload.session_ref !== `hub-board:${b.id}`) fail(403,'내 기록만 열람할 수 있습니다.');
    if (!attachment?.storage_path?.startsWith('career-originals/')) fail(404,'보관된 첨부가 없습니다.');
    return {url:await storage.createSignedDownload(attachment.storage_path,{ttl:60,downloadName:attachment.name})};
  }
  async function file(req,res,code,id) {
    const {board:b} = await board(code), who = await session(req,res,b), cfg = await config(b);
    await accountFor(req,cfg);
    const p = await db.one('SELECT * FROM board_posts WHERE id=$1 AND board_id=$2',[id,b.id]);
    if (!p?.storage_path) fail(404,'첨부 파일을 찾을 수 없습니다.');
    const meta = await get(`sb:post:${p.id}`);
    const shared = !p.hidden && (!meta || cfg.sessions.some(s => s.id === meta.sessionId && s.submissions.sharing === 'class'));
    if (!shared && !owns(meta,who)) fail(403,'이 제출물을 볼 수 없습니다.');
    if (!storage.storageEnabled) fail(503,'파일 저장소가 설정되지 않았습니다.');
    return { url:await storage.createSignedDownload(p.storage_path,{ttl:60,downloadName:p.file_name}), name:p.file_name };
  }
  async function leave(req,res,code) {
    sameOrigin(req);
    // Logout is allowed even after the teacher closes the class.
    const b = await db.one('SELECT * FROM boards WHERE code=$1',[code.toLowerCase()]);
    if (b) {
      const token = parseCookies(req)[`moakit_submission_${b.id}`];
      if (TOKEN.test(token || '')) await db.q('DELETE FROM settings WHERE key=$1',[`sb:session:${b.id}:${hash(token)}`]);
      cookie(res,b.id,'',0);
    }
    await logoutStudent(req,res);
    return {ok:true};
  }
  async function settings(id,user) {
    const b = await ownerBoard(id,user), cfg = await config(b), plan = await get(`course_plan:${b.program_id}`);
    return {config:{...cfg,career:cfg.career || {enabled:false,schoolId:null}}, careerAvailable:careerAvailable() === true, variants:plan?.published ? plan.plan.variants.map(v => ({id:v.id,name:v.name,count:v.sessions.length})) : []};
  }
  async function saveSettings(id,user,body) {
    const b = await ownerBoard(id,user);
    // Avoid borrowing another pool connection from inside the transaction (Vercel pool max=1).
    const fallback = await config(b);
    return db.transaction(async c => {
      await lock(c,cfgKey(b.id));
      let cfg = await get(cfgKey(b.id),c) || fallback;
      if (body?.revision !== cfg.revision) fail(409,'다른 화면에서 변경되었습니다. 새로고침 후 다시 설정하세요.');
      const priorCareer = cfg.career || {enabled:false,schoolId:null};
      const requestedCareer = body.career === undefined ? priorCareer : body.career;
      if (!requestedCareer || typeof requestedCareer.enabled !== 'boolean' || (requestedCareer.schoolId != null && !UUID.test(requestedCareer.schoolId))) fail(400,'학교와 진로기록 설정을 확인하세요.');
      const schoolId = requestedCareer.schoolId || priorCareer.schoolId || null;
      if (priorCareer.schoolId && schoolId !== priorCareer.schoolId) fail(409,'학교가 연결된 수업은 다른 학교로 변경할 수 없습니다. 새 수업을 만드세요.');
      if (requestedCareer.enabled && careerAvailable() !== true) fail(503,'진로기록 저장 연결을 먼저 확인하세요.');
      if (requestedCareer.enabled && !schoolId) fail(400,'진로기록을 저장할 학교를 선택하세요.');
      if (schoolId) await authorizeSchool(user,schoolId);
      const careerConfig = {enabled:requestedCareer.enabled,schoolId};
      if (body.variantId !== cfg.variantId) {
        if (typeof body.variantId !== 'string' || !body.variantId) fail(400,'등록된 운영 구성을 선택하세요.');
        const plan = await get(`course_plan:${b.program_id}`,c), v = plan?.published && plan.plan.variants.find(v => v.id === body.variantId);
        if (!v) fail(400,'공개된 운영 구성을 선택하세요.');
        cfg = { revision:cfg.revision, variantId:v.id, planRevision:plan.revision, name:v.name, sessions:v.sessions.map(s => ({...s,id:crypto.randomUUID(),submissions:submissionSettings(s.submissions)})) };
        cfg.activeSession = cfg.sessions[0].id;
      } else {
        if (!Array.isArray(body.sessions) || body.sessions.length !== cfg.sessions.length || new Set(body.sessions.map(s => s?.id)).size !== cfg.sessions.length) fail(400,'차시별 제출 설정을 확인하세요.');
        cfg.sessions = cfg.sessions.map(s => { const input = body.sessions.find(x => x?.id === s.id); if (!input) fail(400,'차시를 확인하세요.'); return {...s,submissions:submissionSettings(input.submissions)}; });
        findSession(cfg,body.activeSession); cfg.activeSession = body.activeSession;
      }
      if (body.shareStudentMaterials === true) {
        // Explicit teacher action: share only the published plan's app and worksheet.
        // PPT/guide require separate selection in the existing sharing control.
        for (const s of cfg.sessions) for (const slot of ['app','worksheet']) {
          const asset = s.assets?.[slot];
          let linkId = null, fileId = null;
          if (asset?.fileId) {
            const f = await c.one('SELECT id FROM program_files WHERE id=$1 AND program_id=$2',[asset.fileId,b.program_id]);
            if (!f) fail(400,'연결된 파일이 삭제되었습니다. 수업 자료를 확인하세요.');
            fileId = f.id;
          } else if (asset?.url) {
            let l = await c.one('SELECT id FROM program_links WHERE program_id=$1 AND url=$2 ORDER BY id LIMIT 1',[b.program_id,asset.url]);
            if (!l) l = await c.one('INSERT INTO program_links (program_id,kind,label,url,position) VALUES ($1,$2,$3,$4,0) RETURNING id',[b.program_id,slot === 'app' ? 'aiapp' : 'link',`${s.title} · ${slot === 'app' ? '웹앱' : '활동지'}`,asset.url]);
            linkId = l.id;
          }
          if (linkId || fileId) await c.q(`INSERT INTO board_items (board_id,item_type,link_id,file_id,position)
            SELECT $1,$2,$3,$4,0 WHERE NOT EXISTS (SELECT 1 FROM board_items WHERE board_id=$1 AND (link_id=$3 OR file_id=$4))`,[b.id,linkId ? 'link' : 'file',linkId,fileId]);
        }
      }
      cfg.career = careerConfig;
      cfg.revision = crypto.randomUUID();
      await put(cfgKey(b.id),cfg,c);
      return {config:cfg};
    });
  }
  async function moderate(id,user,hidden) {
    const p = await db.one('SELECT * FROM board_posts WHERE id=$1',[id]);
    if (!p) fail(404,'제출물을 찾을 수 없습니다.');
    const b = await ownerBoard(p.board_id,user), meta = await get(`sb:post:${p.id}`);
    if (!meta) return false;
    if (typeof hidden !== 'boolean') fail(400,'공개 설정을 확인하세요.');
    const fallback = await config(b);
    await db.transaction(async c => {
      await lock(c,cfgKey(b.id));
      const cfg = await get(cfgKey(b.id),c) || fallback;
      if (!hidden && !cfg.sessions.some(s => s.id === meta.sessionId && s.submissions.sharing === 'class')) fail(403,'이 차시는 선생님에게만 제출하도록 설정되어 있습니다.');
      await c.q('UPDATE board_posts SET hidden=$1 WHERE id=$2',[hidden,id]);
    });
    return true;
  }
  async function teacherPosts(posts,user) {
    if (!posts.length) return posts;
    const rows = await db.q('SELECT key,value FROM settings WHERE key=ANY($1::text[])',[posts.map(p => `sb:post:${p.id}`)]);
    const metas = new Map(rows.map(r => [r.key,JSON.parse(r.value)]));
    const configs = new Map();
    for (const id of new Set(posts.map(p => p.board_id))) {
      const cfg = await get(cfgKey(id));
      if (cfg?.career?.schoolId) await authorizeSchool(user,cfg.career.schoolId);
      configs.set(String(id), cfg);
    }
    return posts.map(p => {
      const m = metas.get(`sb:post:${p.id}`), cfg = configs.get(String(p.board_id));
      const canShare = cfg?.sessions.some(s => s.id === m?.sessionId && s.submissions.sharing === 'class');
      return {...p,...(m ? {hidden:p.hidden || !canShare,submission:true,title:m.title,sessionTitle:m.sessionTitle,careerStatus:career.receipt(m).state,career:career.receipt(m)} : {})};
    });
  }
  return {list,sign,submit,file,leave,settings,saveSettings,moderate,teacherPosts,saveCareer,records,recordFile,identity,joinContext,authorizeAccess,activityContext,authorizeActivity,teacherRecords};
}
module.exports = {createService,fileSpec,sameOrigin};
