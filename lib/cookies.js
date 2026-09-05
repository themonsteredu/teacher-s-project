'use strict';

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
    }
  }
  return out;
}

module.exports = { parseCookies };
