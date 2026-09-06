import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const { accountConnectionOptions } = require('../lib/student-accounts/connection');
const { accountConfig } = require('../lib/student-accounts/config');
const { databaseTarget } = require('../lib/student-accounts/diagnostics');
const project = 'abcdefghijklmnopqrst';
const databaseUrl = `postgresql://postgres.${project}:old_password@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=verify-full&statement_timeout=7000`;

test('separate password reaches the real pg client literally, including reserved symbols and spaces', () => {
  for (const password of ['test@word#123!', 'literal%40%25%not-an-escape', 'slashes/colon:query?plus+amp&', ' leading and trailing ', '한글🔐']) {
    const config = accountConfig({CAREER_ACCOUNTS_DATABASE_URL:databaseUrl, CAREER_ACCOUNTS_DATABASE_PASSWORD:password});
    const options = accountConnectionOptions(config);
    assert.equal(options.connectionString, undefined);
    const params = new Client(options).connectionParameters;
    assert.equal(params.password, password);
    assert.equal(params.host, 'aws-0-ap-northeast-2.pooler.supabase.com');
    assert.equal(params.user, `postgres.${project}`);
    assert.equal(params.database, 'postgres');
    assert.equal(params.port, 5432);
    assert.deepEqual(params.ssl, {});
    assert.equal(params.statement_timeout, '7000');
    assert.equal(params.application_name, 'moakit-student-accounts');
  }
});

test('old URI and query passwords cannot override the separate password', () => {
  const params = new Client(accountConnectionOptions({databaseUrl:databaseUrl+'&password=old_query_password', databasePassword:'new@literal%40'})).connectionParameters;
  assert.equal(params.password, 'new@literal%40');
});

test('existing URI-only setups remain compatible and explicit empty overrides fail closed', () => {
  const options = accountConnectionOptions({databaseUrl});
  assert.equal(options.connectionString, databaseUrl);
  assert.equal(new Client(options).connectionParameters.password, 'old_password');
  for (const password of ['', null, false]) {
    assert.throws(() => accountConnectionOptions({databaseUrl, databasePassword:password}), error => error.status === 503);
  }
  assert.throws(() => accountConnectionOptions({databasePassword:'secret'}), error => error.status === 503);
});

test('safe diagnostics describe the effective override without exposing it', () => {
  const password = 'new@literal%40';
  assert.deepEqual(databaseTarget(databaseUrl.replace('old_password', '%5BYOUR-PASSWORD%5D'), password), {
    kind:'supabase_pooler', projectRef:project, port:5432, credential:'present',
  });
  assert.equal(JSON.stringify(databaseTarget(databaseUrl, password)).includes(password), false);
});
