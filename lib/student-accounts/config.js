'use strict';

// Public configuration for the currently authorized account verification branch.
// Secrets remain in Vercel. Production and other branches require explicit config.
const PREVIEW = Object.freeze({
  branch: 'career-log-science-observation',
  issuer: 'moakit-hub',
});

function publicOrigin(value) {
  if (typeof value !== 'string' || value !== value.trim()) return undefined;
  try {
    const url = new URL(value);
    const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((!local && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || url.pathname !== '/') return undefined;
    return url.origin;
  } catch { return undefined; }
}

function previewOrigin(hostname) {
  if (typeof hostname !== 'string' || hostname !== hostname.trim() || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(hostname)) return undefined;
  return `https://${hostname}`;
}

function accountConfig(env = process.env) {
  const preview = env.VERCEL === '1' && env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === PREVIEW.branch;
  return {
    enabled: env.STUDENT_ACCOUNTS_ENABLED === undefined ? preview : env.STUDENT_ACCOUNTS_ENABLED === '1',
    databaseUrl: env.CAREER_ACCOUNTS_DATABASE_URL,
    issuer: env.STUDENT_ACCOUNT_ISSUER === undefined ? (preview ? PREVIEW.issuer : undefined) : env.STUDENT_ACCOUNT_ISSUER,
    origin: env.STUDENT_ACCOUNT_ORIGIN === undefined
      ? (preview ? previewOrigin(env.VERCEL_BRANCH_URL) : undefined)
      : publicOrigin(env.STUDENT_ACCOUNT_ORIGIN),
  };
}

module.exports = { accountConfig };
