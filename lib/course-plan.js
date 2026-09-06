'use strict';
// Authoring metadata only. Never grants app access or writes Career Log records.
const SLOTS = ['app', 'ppt', 'worksheet', 'guide'];
function fail(message) { const e = new Error(message); e.status = 400; throw e; }
function text(value, max = 2000) {
  if (typeof value !== 'string' || value.length > max) fail('입력 내용의 길이와 형식을 확인하세요.');
  return value.trim();
}
function safeUrl(value) {
  const s = text(value, 2000);
  if (!s) return '';
  if (/[\s<>"'\\]/.test(s)) fail('안전한 자료 주소를 입력하세요.');
  if (/^\/lessons\/[\w./-]+(?:[?#][^<>"'\\\s]*)?$/.test(s) && !s.includes('..') && !s.includes('%')) return s;
  if (/^\/api\/tools\/[1-9]\d*\/open$/.test(s)) return s;
  let u; try { u = new URL(s); } catch { fail('https:// 자료 주소를 입력하세요.'); }
  if (u.protocol !== 'https:' || u.username || u.password) fail('https:// 자료 주소를 입력하세요.');
  return s;
}
function normalize(input, { lessonIds = [], fileIds = [] } = {}) {
  if (!input || input.version !== 1 || !Array.isArray(input.variants) || input.variants.length < 1 || input.variants.length > 12) fail('수업 구성을 1~12개 등록하세요.');
  if (JSON.stringify(input).length > 200000) fail('등록 내용이 너무 큽니다.');
  const lessons = new Set(lessonIds.map(String)), files = new Set(fileIds.map(String)), seen = new Set();
  const variants = input.variants.map(v => {
    if(!v || typeof v!=='object') fail('운영 구성 형식을 확인하세요.');
    const id = text(v.id, 80), name = text(v.name, 80);
    if (!/^[\w-]+$/.test(id) || seen.has(id) || !name) fail('구성 이름과 식별자를 확인하세요.');
    seen.add(id);
    if (!Array.isArray(v.sessions) || !v.sessions.length || v.sessions.length > 50) fail('구성마다 1~50차시를 등록하세요.');
    return { id, name, sessions: v.sessions.map(s => {
      if(!s || typeof s!=='object') fail('차시 형식을 확인하세요.');
      if (!Array.isArray(s.sourceLessons) || s.sourceLessons.some(id => !lessons.has(String(id)))) fail('이 수업에 포함된 원본 차시를 선택하세요.');
      if (!Number.isInteger(s.minutes) || s.minutes < 5 || s.minutes > 240) fail('수업 시간은 5~240분으로 입력하세요.');
      const assets = {};
      for (const slot of SLOTS) {
        const a = s.assets?.[slot] || {};
        if (a.fileId && !files.has(String(a.fileId))) fail('다른 수업의 파일이나 삭제된 파일은 연결할 수 없습니다.');
        if (a.fileId && a.url) fail('자료는 파일 또는 주소 중 하나를 연결하세요.');
        assets[slot] = { fileId: a.fileId ? String(a.fileId) : '', url: safeUrl(a.url || '') };
      }
      if (!['none', 'submission'].includes(s.record?.mode)) fail('기록 방식을 확인하세요.');
      return { title: text(s.title, 120), minutes: s.minutes, sourceLessons: [...new Set(s.sourceLessons.map(String))], bridge: text(s.bridge || ''), assets,
        record: { mode: s.record.mode, completion: text(s.record.completion || '', 500), original: text(s.record.original || '', 1000), process: text(s.record.process || '', 300) } };
    }) };
  });
  return { version: 1, appUrl: safeUrl(input.appUrl || ''), variants };
}
function issues(plan) {
  const out = [];
  for (const v of plan.variants) v.sessions.forEach((s, i) => {
    const label = `${v.name} · ${i + 1}차시`;
    if (!s.title) out.push(`${label}: 활동 제목을 입력하세요.`);
    for (const slot of SLOTS) if (!s.assets[slot].url && !s.assets[slot].fileId) out.push(`${label}: ${ { app:'학생 웹앱', ppt:'PPT', worksheet:'활동지', guide:'교안' }[slot]} 자료를 연결하세요.`);
    if (s.record.mode === 'submission' && (!s.record.completion || !s.record.original || !s.record.process)) out.push(`${label}: 제출 조건·학생 원본·기록 설명을 입력하세요.`);
  });
  return out;
}
module.exports = { normalize, issues, safeUrl };
