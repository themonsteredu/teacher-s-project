'use strict';
const crypto = require('node:crypto');
const { q, one } = require('./db');
const { parseCookies } = require('./cookies');

// 역할 서열: 숫자가 클수록 상위 권한
const ROLE_LEVEL = { teacher: 0, admin: 1 };

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await q("INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + interval '12 hours')", [token, userId]);
  return token;
}

async function destroySession(token) {
  await q('DELETE FROM sessions WHERE token = $1', [token]);
}

// 세션 토큰으로 사용자 조회. 만료/비활성 계정이면 null — 계정 정지(강퇴)가 매 요청 즉시 반영된다.
async function getSessionUser(req) {
  const token = parseCookies(req).session;
  if (!token) return null;
  const s = await one('SELECT * FROM sessions WHERE token = $1 AND expires_at > now()', [token]);
  if (!s) return null;
  const user = await one('SELECT * FROM users WHERE id = $1 AND active = true', [s.user_id]);
  if (!user) return null;
  return { user, token };
}

// 만료 세션 정리 (로그인 시마다 호출 — 서버리스 환경 대응)
async function cleanupSessions() {
  await q('DELETE FROM sessions WHERE expires_at < now()');
}

function roleLevel(role) {
  return ROLE_LEVEL[role] ?? -1;
}

module.exports = { createSession, destroySession, getSessionUser, cleanupSessions, roleLevel, ROLE_LEVEL };
