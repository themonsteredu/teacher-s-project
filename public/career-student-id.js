(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MoakitCareerStudent = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const STORAGE_KEY = 'moakit-career-student-id-v1';
  const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let memoryId = '';

  function read(storage) {
    try {
      const value = storage && storage.getItem(STORAGE_KEY);
      return UUID_V4_RE.test(value || '') ? value.toLowerCase() : '';
    } catch {
      return '';
    }
  }

  function write(storage, value) {
    try {
      if (storage) storage.setItem(STORAGE_KEY, value);
    } catch {}
  }

  function createUuid(cryptoApi) {
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID().toLowerCase();
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') return '';
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function browserStorage(name) {
    try {
      return root ? root[name] : null;
    } catch {
      return null;
    }
  }

  function getOrCreate(options) {
    const opts = options || {};
    const local = opts.localStorage !== undefined ? opts.localStorage : browserStorage('localStorage');
    const session = opts.sessionStorage !== undefined ? opts.sessionStorage : browserStorage('sessionStorage');
    const cryptoApi = opts.crypto !== undefined ? opts.crypto : (root && root.crypto);
    const candidate = UUID_V4_RE.test(opts.candidate || '') ? opts.candidate.toLowerCase() : '';
    const existing = read(local) || read(session) || memoryId;
    if (existing) return existing;
    const studentId = candidate || createUuid(cryptoApi);
    if (!studentId) return '';
    memoryId = studentId;
    write(local, studentId);
    write(session, studentId);
    return studentId;
  }

  function isStudentId(value) {
    return UUID_V4_RE.test(value || '');
  }

  function resetMemoryForTests() {
    memoryId = '';
  }

  return { STORAGE_KEY, getOrCreate, isStudentId, resetMemoryForTests };
});
