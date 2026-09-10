'use strict';
/* ============================================================
 * Supabase Storage 연동 (첨부자료 업로드)
 * 환경변수 SUPABASE_URL + SUPABASE_SERVICE_KEY 가 있을 때만 활성화.
 *
 * 흐름:
 *  1) 브라우저가 서버에 서명 업로드 URL 요청 → 서버가 service key로 발급
 *  2) 브라우저가 그 URL로 파일을 Supabase에 직접 PUT (서버·Vercel 우회)
 *  3) 다운로드 시 서버가 접근 권한 확인 후 짧은 서명 다운로드 URL로 302 리다이렉트
 * ============================================================ */

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'files';
const storageEnabled = !!(SUPABASE_URL && SERVICE_KEY);

// 다운로드 서명 URL 유효 시간 — 회수(비공개 전환) 후 기존 링크가 오래 살지 않도록 짧게 유지
const DOWNLOAD_TTL = 10 * 60;

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, ...extra };
}

const full = (rel) => `${SUPABASE_URL}/storage/v1${rel.startsWith('/') ? rel : '/' + rel}`;

// 최초 1회: 비공개 버킷 생성 (이미 있으면 통과, 실패하면 원인을 드러낸다)
// file_size_limit은 지정하지 않음 — 무료 플랜 한도(파일당 50MB)를 넘는 값을 주면 생성이 거부된다
let bucketReady = false;
async function ensureBucket() {
  if (!storageEnabled || bucketReady) return;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  if (r.ok) { bucketReady = true; return; }
  const text = await r.text().catch(() => '');
  if (r.status === 409 || /already exists|Duplicate/i.test(text)) { bucketReady = true; return; }
  throw new Error(`저장소 버킷(${BUCKET}) 생성 실패: ${text.slice(0, 150)}`);
}

// 서명 업로드 URL 발급 (브라우저가 이 URL로 파일을 PUT)
async function createSignedUpload(path) {
  await ensureBucket();
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(`업로드 URL 발급 실패: ${await r.text()}`);
  const j = await r.json(); // { url: '/object/upload/sign/...?token=...' }
  return { uploadUrl: full(j.url), path };
}

// 서명 다운로드 URL 발급 (단기 유효)
// downloadName을 주면 첨부(다운로드) 처리, 없으면 inline(브라우저 열람) 처리
async function createSignedDownload(path, { ttl = DOWNLOAD_TTL, downloadName = null } = {}) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn: ttl }),
  });
  if (!r.ok) throw new Error(`다운로드 URL 발급 실패: ${await r.text()}`);
  const j = await r.json(); // { signedURL: '/object/sign/...?token=...' }
  let url = full(j.signedURL || j.signedUrl);
  if (downloadName) url += `&download=${encodeURIComponent(downloadName)}`;
  return url;
}

async function removeObject(path) {
  // Career originals have independent retention; ordinary board deletion never removes them.
  if (path?.startsWith('career-originals/')) return;
  if (!storageEnabled || !path) return;
  try {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
      method: 'DELETE', headers: authHeaders(),
    });
  } catch { /* 무시 */ }
}

// Verify the uploaded object itself; never trust the student's posted size or MIME.
async function inspectObject(path) {
  const url = await createSignedDownload(path, { ttl: 60 });
  const r = await fetch(url, { headers: { Range: 'bytes=0-31' }, signal: AbortSignal.timeout(15000) });
  try {
    if (!r.ok) throw new Error('업로드된 파일을 확인할 수 없습니다.');
    const range = r.headers.get('content-range');
    const size = Number(range ? /\/(\d+)$/.exec(range)?.[1] : r.headers.get('content-length'));
    const mime = (r.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!Number.isSafeInteger(size) || size < 1) throw new Error('업로드 크기를 확인할 수 없습니다.');
    return { size, mime };
  } finally { await r.body?.cancel().catch(() => {}); }
}

async function archiveSubmission(upload) {
  const path = `career-originals/${upload.path.split('/').pop()}`;
  const existing = await inspectObject(path).catch(() => null);
  if (!existing) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/copy`, {
      method:'POST', signal:AbortSignal.timeout(20000), headers:authHeaders({'Content-Type':'application/json'}),
      body:JSON.stringify({bucketId:BUCKET,sourceKey:upload.path,destinationKey:path}),
    });
    if (!r.ok) throw new Error('진로기록 첨부 원본을 보관하지 못했습니다. 같은 제출로 다시 시도하세요.');
  }
  const actual = existing || await inspectObject(path);
  if (actual.size !== upload.size || actual.mime !== upload.mime) throw new Error('보관한 첨부 원본의 형식과 크기를 확인하지 못했습니다.');
  return {...upload,path};
}
module.exports = { storageEnabled, ensureBucket, createSignedUpload, createSignedDownload, inspectObject, removeObject, archiveSubmission, BUCKET };
