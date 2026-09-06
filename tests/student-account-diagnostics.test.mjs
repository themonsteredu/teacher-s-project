import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { databaseTarget } = require('../lib/student-accounts/diagnostics');
const project = 'abcdefghijklmnopqrst';
const pooler = 'aws-0-ap-northeast-2.pooler.supabase.com';
const secret = 'private:P@ss/word?#';

test('connection diagnostics expose only the recognized target and credential presence', () => {
  const result = databaseTarget(`postgresql://postgres.${project}:${encodeURIComponent(secret)}@${pooler}:6543/private_db?application_name=private_app`);
  assert.deepEqual(result, {kind:'supabase_pooler', projectRef:project, port:6543, credential:'present'});
  const serialized = JSON.stringify(result);
  for (const privateValue of [secret, encodeURIComponent(secret), 'postgres.', 'private_db', 'private_app', pooler]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  assert.deepEqual(databaseTarget(`postgresql://postgres:secret@db.${project}.supabase.co:5432/postgres`),
    {kind:'supabase_direct', projectRef:project, port:5432, credential:'present'});
});

test('diagnostics follow pg query overrides instead of reporting a misleading URI host', () => {
  const otherProject = 'bbbbbbbbbbbbbbbbbbbb';
  assert.deepEqual(databaseTarget(`postgresql://postgres:secret@db.${project}.supabase.co:5432/postgres?host=${pooler}&user=postgres.${otherProject}&port=6543&password=private_override`),
    {kind:'supabase_pooler', projectRef:otherProject, port:6543, credential:'present'});
});

test('unknown or malformed targets never echo arbitrary connection data', () => {
  for (const uri of [
    `postgresql://private_user:private_password@private_host/private_db`,
    `postgresql://postgres:secret@db.${project}.supabase.co.attacker.example/postgres`,
    `postgresql://postgres:secret@${pooler}.attacker.example/postgres`,
    'postgresql://user:password@host:notaport/db',
  ]) {
    assert.ok(['invalid','unrecognized'].includes(databaseTarget(uri).kind));
    assert.equal(Object.keys(databaseTarget(uri)).length, 1);
  }
  assert.deepEqual(databaseTarget(undefined), {kind:'missing'});
  assert.equal(databaseTarget(`postgresql://private_user:private_password@${pooler}:5432/postgres`).projectRef, 'unrecognized');
});

test('known placeholders are categorized without revealing credentials', () => {
  for (const placeholder of ['[YOUR-PASSWORD]', '[YOUR_PASSWORD]', '[PASSWORD]']) {
    const result = databaseTarget(`postgresql://postgres.${project}:${encodeURIComponent(placeholder)}@${pooler}:5432/postgres`);
    assert.equal(result.credential, 'placeholder');
    assert.equal(JSON.stringify(result).includes(placeholder), false);
  }
});
