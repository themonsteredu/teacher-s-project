'use strict';
const { Pool } = require('pg');
const { hashPassword } = require('./password');
const { seedCurriculum } = require('./curriculum');

// Supabase(또는 임의 Postgres) 연결 문자열.
// Vercel 서버리스에서는 Supabase의 Transaction Pooler 주소(포트 6543)를 권장.
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL 환경변수가 필요합니다. (예: Supabase 대시보드 → Connect → Transaction pooler URI)');
  process.exit(1);
}

const isLocal = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || (process.env.VERCEL ? 1 : 5)),
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

// 통합(monster-moakit) 전환 스위치: ACADEMY_ID 가 있으면 hub 호환 레이어 모드.
//  - 미설정(로컬/전환 전): 기존 동작 그대로.
//  - 설정: 매 쿼리를 트랜잭션으로 감싸 SET LOCAL app.academy_id + search_path=hub 주입
//    (6543 transaction pooler 는 세션변수를 txn 마다 리셋하므로 반드시 트랜잭션-로컬).
const ACADEMY_ID = process.env.ACADEMY_ID || null;

async function q(sql, params = []) {
  if (!ACADEMY_ID) {
    const r = await pool.query(sql, params);
    return r.rows;
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.academy_id', $1, true)", [ACADEMY_ID]);
    await client.query('set local search_path = hub, public');
    const r = await client.query(sql, params);
    await client.query('commit');
    return r.rows;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
async function one(sql, params = []) {
  return (await q(sql, params))[0] || null;
}

// 표시용 시간대 (감사 로그·생성일이 이 시간대 문자열로 반환됨)
const TZ = /^[A-Za-z_/+-]{1,60}$/.test(process.env.APP_TIMEZONE || '') ? process.env.APP_TIMEZONE : 'Asia/Seoul';
// SQL 조각: timestamptz → 'YYYY-MM-DD HH:MM:SS' (KST) 텍스트
const TS = (col) => `to_char(${col} AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI:SS')`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','teacher')),
  active BOOLEAN NOT NULL DEFAULT true,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS programs (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',            -- 학년 (예: '초1'~'초6', 추후 '중1' 등 확장)
  description TEXT NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT false, -- 회수 스위치 1: 즉시 비공개
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 차시 (프로그램 안의 회차 — 링크·파일이 차시에 소속될 수 있음. 미소속 = 공통 자료)
CREATE TABLE IF NOT EXISTS lessons (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS program_links (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  lesson_id INT REFERENCES lessons(id) ON DELETE SET NULL, -- 차시 삭제 시 공통 자료로 승격
  position INT NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'link' CHECK (kind IN ('link','aiapp','video')),
  label TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL
);

-- 파일 실체는 Supabase 비공개 버킷에만 존재 — 삭제 시 원본 소멸(회수 스위치 4)
CREATE TABLE IF NOT EXISTS program_files (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  lesson_id INT REFERENCES lessons(id) ON DELETE SET NULL, -- 차시 삭제 시 공통 자료로 승격
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  downloadable BOOLEAN NOT NULL DEFAULT false, -- false = 보기 전용 (교사 다운로드 차단)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 학생 활동 보드 (패들렛형 결과물 수합)
CREATE TABLE IF NOT EXISTS boards (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,               -- 6자리 학생 참여 코드
  is_open BOOLEAN NOT NULL DEFAULT true,   -- 회수 스위치: 마감 = 학생 제출·열람 즉시 차단
  class_date DATE,                         -- 수업 날짜 (대시보드 날짜별 정리)
  roster TEXT NOT NULL DEFAULT '',         -- 기대 학생 명단 (줄바꿈 구분) — 제출/미제출 대조용
  created_by INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 학생 게시물 (계정 없음 — 이름 텍스트만. 첨부 실체는 Supabase 비공개 버킷)
CREATE TABLE IF NOT EXISTS board_posts (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  board_id INT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  file_name TEXT,
  storage_path TEXT,
  mime TEXT,
  size BIGINT,
  hidden BOOLEAN NOT NULL DEFAULT false,   -- 교사가 부적절 게시물 숨김
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 보드에 공유된 수업자료 (교사가 '학생에게 보여줄 자료'로 체크한 링크/파일)
CREATE TABLE IF NOT EXISTS board_items (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  board_id INT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('link','file')),
  link_id INT REFERENCES program_links(id) ON DELETE CASCADE,
  file_id INT REFERENCES program_files(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INT,
  username TEXT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  ip TEXT,
  ua TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_links_program ON program_links(program_id, position);
CREATE INDEX IF NOT EXISTS idx_files_program ON program_files(program_id);
CREATE INDEX IF NOT EXISTS idx_logs_time ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_boards_program ON boards(program_id);
CREATE INDEX IF NOT EXISTS idx_posts_board ON board_posts(board_id, id);
CREATE INDEX IF NOT EXISTS idx_posts_ip_time ON board_posts(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_board_items ON board_items(board_id, position);
`;

// 기존 배포 DB 마이그레이션
const MIGRATIONS = `
ALTER TABLE program_files ADD COLUMN IF NOT EXISTS downloadable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT '';
ALTER TABLE program_links ADD COLUMN IF NOT EXISTS lesson_id INT REFERENCES lessons(id) ON DELETE SET NULL;
ALTER TABLE program_files ADD COLUMN IF NOT EXISTS lesson_id INT REFERENCES lessons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_lessons_program ON lessons(program_id, position);
CREATE TABLE IF NOT EXISTS board_items (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  board_id INT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('link','file')),
  link_id INT REFERENCES program_links(id) ON DELETE CASCADE,
  file_id INT REFERENCES program_files(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_board_items ON board_items(board_id, position);
ALTER TABLE boards ADD COLUMN IF NOT EXISTS class_date DATE;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS roster TEXT NOT NULL DEFAULT '';

-- 내 도구함: 수업(프로그램)과 별개로 보관하는 재사용 웹앱. 수업 편집에서 골라 붙인다.
CREATE TABLE IF NOT EXISTS tools (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT 'text/html',
  size BIGINT NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tools_owner ON tools(created_by, id);
`;

async function init() {
  await pool.query(SCHEMA);
  await pool.query(MIGRATIONS);

  // 관리자 시드: admin 역할 계정이 하나도 없으면 최초 생성
  const su = await one("SELECT count(*)::int AS c FROM users WHERE role = 'admin'");
  if (su.c === 0) {
    const initialPw = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
    await q(
      "INSERT INTO users (username, password_hash, name, role, must_change_password) VALUES ($1, $2, $3, 'admin', true)",
      ['superadmin', hashPassword(initialPw), '관리자']
    );
    console.log('최초 실행: 관리자 계정 생성 — superadmin /', process.env.ADMIN_PASSWORD ? '(ADMIN_PASSWORD 값)' : 'ChangeMe123!');
  }
  // 사이트 킬스위치 기본값: 열림
  const defaults = { site_open: '1', site_notice: '' };
  for (const [k, v] of Object.entries(defaults)) {
    await q('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [k, v]);
  }
  // 레포로 관리하는 교육과정 자동 연결(최초 1회) — 실패해도 서버 기동은 막지 않음
  try {
    await seedCurriculum({ q, one });
  } catch (e) {
    console.error('교육과정 시드 실패(무시하고 계속):', e.message);
  }
}

// 서버리스: 인스턴스(콜드 스타트)당 1회만 초기화
let readyPromise = null;
function ready() {
  // 전환 모드(ACADEMY_ID): monster-moakit 스키마는 hub_compat 로 이미 구성됨.
  // 앱의 자동 스키마/시드 부트스트랩을 실행하면 public 테이블을 다시 만들어 충돌 → 건너뜀.
  if (ACADEMY_ID) return Promise.resolve();
  readyPromise ||= init().catch((e) => { readyPromise = null; throw e; });
  return readyPromise;
}

const STRING_SETTING_KEYS = new Set(['site_notice']);

async function getSettings() {
  const out = {};
  for (const row of await q('SELECT key, value FROM settings')) {
    out[row.key] = STRING_SETTING_KEYS.has(row.key) ? row.value : row.value === '1';
  }
  return out;
}

async function setSetting(key, value) {
  const stored = STRING_SETTING_KEYS.has(key) ? String(value ?? '') : (value ? '1' : '0');
  if (ACADEMY_ID) {
    // 전환 모드: settings 는 hub 뷰 → ON CONFLICT 불가. 뷰 INSTEAD OF INSERT 트리거가 upsert 처리.
    await q('INSERT INTO settings (key, value) VALUES ($1, $2)', [key, stored]);
  } else {
    await q('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, stored]);
  }
}

// req가 주어지면 접속 IP와 브라우저 정보를 함께 기록한다.
async function log(user, action, detail = '', req = null) {
  let ip = null;
  let ua = null;
  if (req) {
    ip = clientIp(req);
    ua = String(req.headers['user-agent'] || '').slice(0, 200);
  }
  await q(
    'INSERT INTO audit_logs (user_id, username, action, detail, ip, ua) VALUES ($1, $2, $3, $4, $5, $6)',
    [user ? user.id : null, user ? user.username : null, action, String(detail).slice(0, 500), ip, ua]
  );
}

function clientIp(req) {
  // Vercel 등 신뢰 가능한 프록시 뒤에서는 X-Forwarded-For의 첫 항목을 사용
  if (process.env.TRUST_PROXY === '1' || process.env.VERCEL) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xff) return xff;
  }
  return String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

module.exports = { q, one, ready, log, getSettings, setSetting, clientIp, TS };
