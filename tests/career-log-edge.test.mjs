import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../supabase/functions/career-log-ingest/index.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, ''));
const studentId = '11111111-1111-4111-8111-111111111111';
const hubSubmission = () => ({...record('hub-submission-v1'), reflection:null, source_event_id:'hub-submission-v1:dcf764b3-aeff-4511-a03d-2c451c7d0508',
  raw_data:{hub:{board_id:'42',program_id:'11'},submission:{session_id:'lesson-1',title:'내 관찰 결과',content:'노란 꽃과 톱니 모양 잎',attachment:null}}});

test('Hub submission snapshots persist and concurrent retries produce one Career record',async()=>{
 const edge=runtime(),p=hubSubmission();const results=await Promise.all([edge.call(p),edge.call(p)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);assert.equal(edge.inserts(),1);assert.equal(edge.locks(),2);
});
test('older committed Hub snapshot retries keep the original activity time',async()=>{
 const p=hubSubmission();p.occurred_at=new Date(Date.now()-3*86400000).toISOString();assert.equal((await runtime().call(p)).status,201);
 const oldHistory=record('history-ai-01');oldHistory.occurred_at=p.occurred_at;assert.equal((await runtime().call(oldHistory)).status,400);
});
test('Hub submission rejects missing actual work, mismatched board, fabricated reflection and non-UUID event',async()=>{
 for(const change of [p=>p.raw_data.submission.content='',p=>p.raw_data.hub.board_id='999',p=>p.reflection='auto generated',p=>p.source_event_id='hub-submission-v1:named-student']){const p=hubSubmission();change(p);const edge=runtime();assert.equal((await edge.call(p)).status,400);assert.equal(edge.inserts(),0);}
});
const recordId = '22222222-2222-4222-8222-222222222222';
const claims = {
  iss: 'https://oidc.vercel.com/themonsteredu', owner_id: 'team_XboDIrxx45loHnmZwo54PKam',
  project_id: 'prj_Cckc9mrsPW5njKmqEohLMAejKEM1', environment: 'production',
  sub: 'owner:themonsteredu:project:teacher-s-project:environment:production',
};
function record(program = 'aviation-mobility-01') {
  return { student_id: studentId, session_ref: 'hub-board:42', program_ref: program, occurred_at: new Date().toISOString(),
    process: '선택한 경로로 운항하고 활동을 돌아봤어요.', artifact: '운항 기록', reflection: '다음에는 속도를 줄이겠어요.',
    source: 'hub', source_event_id: `${program}:contract-test-attempt`, raw_data: { activity: 'test' },
    verification_status: null, verified_by: null, verified_at: null, supersedes_id: null };
}
function runtime({ payload = claims, signatureValid = true, available = true } = {}) {
  let handle;
  let databaseCalls = 0;
  const rows = new Map();
  let inserts = 0;
  let locks = 0;
  let tail = Promise.resolve();
  const sql = async (parts, ...values) => {
    databaseCalls += 1;
    const query = parts.join('?');
    if (/select id, student_id/.test(query)) return rows.has(values[1]) ? [rows.get(values[1])] : [];
    if (/insert into career_log.records/.test(query)) {
      inserts += 1;
      const inserted = { id: recordId, student_id: values[0] };
      rows.set(values.at(-1), inserted);
      return [inserted];
    }
    return [];
  };
  sql.json = value => value;
  sql.end = async () => {};
  sql.begin = async (options, callback) => {
    assert.equal(options, 'isolation level read committed');
    let release;
    let hasLock = false;
    const transaction = async (parts, ...values) => {
      const query = parts.join('?');
      if (/pg_advisory_xact_lock/.test(query)) {
        assert.equal(values[0], 'hub');
        assert.match(values[1], /^(aviation-mobility-01|hub-submission-v1):/);
        const previous = tail;
        tail = new Promise(resolve => { release = resolve; });
        await previous;
        hasLock = true; locks += 1;
        return [];
      }
      if (/set local/.test(query)) return [];
      assert.equal(hasLock, true, 'No lookup or write may happen before the transaction lock');
      return sql(parts, ...values);
    };
    transaction.json = sql.json;
    try { return await callback(transaction); }
    finally { release?.(); }
  };
  new Function('Deno', 'createRemoteJWKSet', 'decodeJwt', 'jwtVerify', 'postgres', code)(
    { serve: callback => { handle = callback; }, env: { get: () => available ? 'test-db' : undefined } },
    url => { assert.equal(url.href, `${payload.iss}/.well-known/jwks`); return {}; },
    () => payload,
    async (token, _jwks, options) => {
      assert.equal(options.issuer, payload.iss);
      assert.equal(options.audience, 'https://vercel.com/themonsteredu');
      if (!signatureValid || token !== 'signed-test-token') throw new Error('invalid signature');
      return { payload };
    },
    () => sql,
  );
  return { call: (value, token = 'signed-test-token') => handle(new Request('https://example.invalid/career-log-ingest', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(value),
  })), databaseCalls: () => databaseCalls, inserts: () => inserts, locks: () => locks };
}

test('Edge accepts the added aviation program and keeps history/science compatibility', async () => {
  for (const program of ['aviation-mobility-01', 'history-ai-01', 'science-observation-ai-03']) {
    const res = await runtime().call(record(program));
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { ok: true, duplicate: false, record_id: recordId, student_id: studentId });
  }
});

test('Edge retains signed OIDC verification and exact Hub team/project/environment checks', async () => {
  for (const options of [
    { signatureValid: false }, { payload: { ...claims, iss: 'https://evil.example' } },
    { payload: { ...claims, owner_id: 'another-team' } }, { payload: { ...claims, project_id: 'drone-client-project' } },
    { payload: { ...claims, environment: 'development' } }, { payload: { ...claims, sub: 'unexpected-subject' } },
  ]) {
    const edge = runtime(options);
    assert.equal((await edge.call(record())).status, 401);
    assert.equal(edge.databaseCalls(), 0);
  }
  const edge = runtime();
  assert.equal((await edge.call(record(), '')).status, 401);
  assert.equal(edge.databaseCalls(), 0);
});

test('Edge rejects unrelated programs, mismatched event prefixes and fabricated verification', async () => {
  for (const patch of [{ program_ref: 'other-program' }, { source_event_id: 'history-ai-01:wrong-program' }, { verification_status: 'verified' }, { session_ref: 'client-session' }, { student_id: 'named-student' }]) {
    const edge = runtime();
    assert.equal((await edge.call({ ...record(), ...patch })).status, 400);
    assert.equal(edge.databaseCalls(), 0);
  }
});

test('Edge retries return the existing receipt and reject reuse by another student', async () => {
  const edge = runtime();
  const original = record();
  assert.equal((await edge.call(original)).status, 201);
  const duplicate = await edge.call(original);
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), { ok: true, duplicate: true, record_id: recordId, student_id: studentId });
  const conflict = await edge.call({ ...original, student_id: '33333333-3333-4333-8333-333333333333' });
  assert.equal(conflict.status, 409);
});

test('Edge storage unavailability cannot produce a success receipt', async () => {
  const edge = runtime({ available: false });
  const res = await edge.call(record());
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'storage_unavailable' });
  assert.equal(edge.databaseCalls(), 0);
});

test('concurrent aviation requests take the transaction lock before lookup and return one receipt', async () => {
  const edge = runtime();
  const results = await Promise.all([edge.call(record()), edge.call(record()), edge.call(record())]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 200, 201]);
  assert.equal(edge.inserts(), 1);
  assert.equal(edge.locks(), 3);
  for (const result of results) assert.equal((await result.json()).record_id, recordId);
});
