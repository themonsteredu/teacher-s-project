'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function passwordInput(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) fail(400, '비밀번호는 8~128자로 입력하세요.');
  return value;
}
async function passwordHash(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(passwordInput(value), salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt1:${salt}:${key.toString('hex')}`;
}
async function passwordMatches(value, stored) {
  if (typeof value !== 'string' || value.length > 128) return false;
  const match = /^scrypt1:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored || '');
  if (!match) return false;
  const key = await scrypt(value, match[1], 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(key, Buffer.from(match[2], 'hex'));
}
function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, '입력 내용을 확인해 주세요.');
  return value.trim();
}
function roster(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) fail(400, '한 번에 1~100명을 등록할 수 있습니다.');
  return value.map(row => ({ displayName: text(row?.displayName, 80), className: text(row?.className, 80) }));
}
function sameOrigin(req, origin) {
  if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') fail(403, '허용되지 않은 요청입니다.');
}
function cookie(token, secure, maxAge = 8 * 3600) {
  return `${secure ? '__Host-' : ''}moakit_student_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
module.exports = { hash, uuid, fail, passwordHash, passwordMatches, passwordInput, text, roster, sameOrigin, cookie };
