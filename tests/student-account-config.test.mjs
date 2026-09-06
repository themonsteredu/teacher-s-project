import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { accountConfig } = require('../lib/student-accounts/config');
const preview = {
  VERCEL: '1', VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: 'career-log-science-observation',
  VERCEL_BRANCH_URL: 'hub-git-accounts-example.vercel.app',
  CAREER_ACCOUNTS_DATABASE_URL: 'postgresql://example:example@localhost/accounts',
};

test('approved Vercel Preview uses public defaults and only the explicit central secret', () => {
  assert.deepEqual(accountConfig(preview), {
    enabled: true, databaseUrl: preview.CAREER_ACCOUNTS_DATABASE_URL,
    issuer: 'moakit-hub', origin: 'https://hub-git-accounts-example.vercel.app',
  });
  const config = accountConfig({...preview, CAREER_ACCOUNTS_DATABASE_URL: undefined, DATABASE_URL: 'postgresql://other-db'});
  assert.equal(config.databaseUrl, undefined);
});

test('production, local runs, missing metadata and other branches stay disabled', () => {
  for (const changed of [
    {VERCEL_ENV: 'production'}, {VERCEL_ENV: 'development'}, {VERCEL_ENV: undefined},
    {VERCEL: undefined}, {VERCEL_GIT_COMMIT_REF: 'another-branch'}, {VERCEL_GIT_COMMIT_REF: undefined},
  ]) {
    const config = accountConfig({...preview, ...changed});
    assert.equal(config.enabled, false);
    assert.equal(config.issuer, undefined);
    assert.equal(config.origin, undefined);
  }
});

test('explicit OFF and malformed flags always override Preview activation', () => {
  for (const value of ['0', '', 'false', 'true', ' 1']) {
    assert.equal(accountConfig({...preview, STUDENT_ACCOUNTS_ENABLED: value}).enabled, false);
  }
});

test('fully explicit configuration still works outside Preview', () => {
  const config = accountConfig({
    VERCEL_ENV: 'production', STUDENT_ACCOUNTS_ENABLED: '1',
    STUDENT_ACCOUNT_ISSUER: 'explicit-issuer', STUDENT_ACCOUNT_ORIGIN: 'https://hub.example/',
    CAREER_ACCOUNTS_DATABASE_URL: preview.CAREER_ACCOUNTS_DATABASE_URL,
  });
  assert.equal(config.enabled, true);
  assert.equal(config.issuer, 'explicit-issuer');
  assert.equal(config.origin, 'https://hub.example');
  assert.equal(accountConfig({VERCEL_ENV:'production', STUDENT_ACCOUNTS_ENABLED:'1'}).origin, undefined);
});

test('Preview origin rejects paths, credentials, foreign suffixes and request-derived values', () => {
  for (const host of [undefined, 'https://hub.vercel.app', 'hub.vercel.app/other', 'hub.vercel.app?x=1',
    'hub.vercel.app@attacker.example', 'hub.vercel.app.attacker.example', '//hub.vercel.app', 'hub.vercel.app\n']) {
    const config = accountConfig({...preview, VERCEL_BRANCH_URL: host, HTTP_HOST: 'attacker.example'});
    assert.equal(config.origin, undefined);
  }
});

test('explicit origin takes precedence and invalid explicit values fail closed', () => {
  assert.equal(accountConfig({...preview, STUDENT_ACCOUNT_ORIGIN:'https://configured.example'}).origin, 'https://configured.example');
  assert.equal(accountConfig({STUDENT_ACCOUNT_ORIGIN:'http://localhost:3000'}).origin, 'http://localhost:3000');
  for (const origin of ['', ' https://hub.example', 'https://hub.example/path', 'https://user:pass@hub.example',
    'https://hub.example?x=1', 'https://hub.example#x', 'http://hub.example', 'javascript:alert(1)']) {
    assert.equal(accountConfig({...preview, STUDENT_ACCOUNT_ORIGIN:origin}).origin, undefined);
  }
});
