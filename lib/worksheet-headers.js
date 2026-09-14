'use strict';
// 학교별 활동지 머리글(로고·상단 문구) 저장소.
// 활동지(/lessons/**.html)는 `?school=<slug>` 로 열리면 /api/worksheet-headers/<slug> 를 읽어
// 인쇄 상단을 그 학교 양식(왼쪽·오른쪽 문구, 로고, 굵은 선, 교육영역·학습주제 표)으로 바꾼다.
// 값은 settings 테이블에 `ws:school:<slug>` 키(JSON 문자열)로 둔다. 코드에 내장된 기본 학교(보성초)는
// DB에 같은 slug 가 저장되면 그 값이 우선한다.

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const KEY = (slug) => `ws:school:${slug}`;
const LOGO_MAX = 600 * 1024; // data URL 기준 약 600KB (readBody 한도 4MB 안)
const DATA_URL_RE = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const PATH_RE = /^\/lessons\/[^\s<>"'?#]+\.(png|jpe?g|webp|gif|svg)$/i;

// 내장 기본값 — 관리 화면에서 고치면 DB 값으로 덮인다.
const BUILTIN = [
  {
    slug: 'boseong',
    name: '보성초등학교',
    left: '2026.AI연구학교',
    right: '보성초등학교(3학년)',
    title: 'AI-L.E.A.P. 활동지',
    logo: '/lessons/_shared/schools/boseong-logo.png',
    note: '',
  },
];

function text(v, max) { return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }

// 입력 검증. 잘못되면 { error } 를 돌려준다.
function normalize(slug, input) {
  if (!SLUG_RE.test(String(slug || ''))) return { error: '학교 코드는 영문 소문자·숫자·하이픈 2~40자여야 합니다. (예: boseong)' };
  const b = input && typeof input === 'object' ? input : {};
  const name = text(b.name, 60);
  if (!name) return { error: '학교 이름을 입력하세요.' };
  let logo = typeof b.logo === 'string' ? b.logo.trim() : '';
  if (logo && !PATH_RE.test(logo)) {
    if (!DATA_URL_RE.test(logo)) return { error: '로고는 PNG·JPG·WEBP·GIF·SVG 이미지 파일이어야 합니다.' };
    if (logo.length > LOGO_MAX) return { error: '로고 파일이 너무 큽니다. 450KB 이하 이미지로 올려 주세요.' };
  }
  return {
    value: {
      slug,
      name,
      left: text(b.left, 60),
      right: text(b.right, 60),
      title: text(b.title, 60) || `${name} 활동지`,
      logo,
      note: text(b.note, 200),
    },
  };
}

function parseRow(row) {
  try {
    const v = JSON.parse(row.value);
    const slug = row.key.slice(KEY('').length);
    const n = normalize(slug, v);
    return n.error ? null : n.value;
  } catch { return null; }
}

// 목록: 내장 + DB (같은 slug 는 DB 우선), 이름순
function createWorksheetHeaders({ q, one, academyMode = false }) {
  async function list() {
    const map = new Map(BUILTIN.map(s => [s.slug, { ...s, builtin: true }]));
    for (const row of await q("SELECT key, value FROM settings WHERE left(key, 10) = 'ws:school:' ORDER BY key")) {
      const v = parseRow(row);
      if (v) map.set(v.slug, { ...v, saved: true, builtin: BUILTIN.some(b => b.slug === v.slug) });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }
  async function get(slug) {
    if (!SLUG_RE.test(String(slug || ''))) return null;
    const row = await one('SELECT key, value FROM settings WHERE key = $1', [KEY(slug)]);
    const saved = row ? parseRow(row) : null;
    if (saved) return { ...saved, saved: true, builtin: BUILTIN.some(b => b.slug === slug) };
    const b = BUILTIN.find(x => x.slug === slug);
    return b ? { ...b, builtin: true } : null;
  }
  async function save(slug, input) {
    const n = normalize(slug, input);
    if (n.error) return n;
    const stored = JSON.stringify(n.value);
    if (academyMode) await q('INSERT INTO settings (key, value) VALUES ($1, $2)', [KEY(slug), stored]);
    else await q('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [KEY(slug), stored]);
    return { value: await get(slug) };
  }
  // 삭제: DB 값만 지운다. 내장 학교는 기본값으로 돌아간다.
  async function remove(slug) {
    if (!SLUG_RE.test(String(slug || ''))) return false;
    await q('DELETE FROM settings WHERE key = $1', [KEY(slug)]);
    return true;
  }
  return { list, get, save, remove };
}

module.exports = { createWorksheetHeaders, normalize, BUILTIN, SLUG_RE };
