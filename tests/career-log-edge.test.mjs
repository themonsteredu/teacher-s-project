import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { isDeepStrictEqual } from 'node:util';

const source = readFileSync(new URL('../supabase/functions/career-log-ingest/index.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, ''));
const studentId = '11111111-1111-4111-8111-111111111111';
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
function submission(attachment = null) {
  return { ...record('hub-submission-v1'), artifact:'관찰 보고서', reflection:null,
    source_event_id:'hub-submission-v1:dcf764b3-aeff-4511-a03d-2c451c7d0508',
    raw_data:{hub:{board_id:'42',program_id:'11'},submission:{session_id:'lesson-1',session_title:'식물 관찰',
      title:'관찰 보고서',content:attachment ? '' : '노란 꽃과 톱니 모양 잎',attachment}} };
}
const attachment = () => ({name:'관찰.jpg',mime:'image/jpeg',size:1234,
  storage_path:'career-originals/af7f06f8-ad86-4bc4-bff7-ebad0994f0f1.jpg'});
function runtime({ payload = claims, signatureValid = true, available = true, onLock } = {}) {
  let handle;
  let databaseCalls = 0;
  const rows = new Map();
  let inserts = 0;
  let locks = 0;
  const tails = new Map();
  const sql = async (parts, ...values) => {
    databaseCalls += 1;
    const query = parts.join('?');
    if (/select id, student_id/.test(query)) {
      const row = rows.get(JSON.stringify(values.slice(-2)));
      return row ? [{...row,snapshot_matches:isDeepStrictEqual(row.snapshot, values.slice(0,7))}] : [];
    }
    if (/insert into career_log.records/.test(query)) {
      inserts += 1;
      const inserted = { id: recordId, student_id: values[0], snapshot:[values[2],values[1],values[3],values[4],values[5],values[6],values[8]] };
      rows.set(JSON.stringify([values[7],values[9]]), inserted);
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
        assert.match(values[1], /^(history-ai-01|science-observation-ai-03|aviation-mobility-01|hub-submission-v1):/);
        assert.match(query, /pg_advisory_xact_lock\(hashtext\(\?\), hashtext\(\?\)\)/);
        const key = JSON.stringify(values);
        const previous = tails.get(key) || Promise.resolve();
        tails.set(key, new Promise(resolve => { release = resolve; }));
        await previous;
        hasLock = true; locks += 1;
        await onLock?.(values[1]);
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
  const preview = runtime({payload:{...claims,environment:'preview',sub:'owner:themonsteredu:project:teacher-s-project:environment:preview'}});
  assert.equal((await preview.call(submission())).status,201);
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

test('concurrent retries in every supported program lock before lookup and return one receipt', async () => {
  for (const original of [record(),record('history-ai-01'),record('science-observation-ai-03'),submission()]) {
    const edge = runtime();
    const results = await Promise.all([edge.call(original), edge.call(original), edge.call(original)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 200, 201]);
    assert.equal(edge.inserts(), 1);
    assert.equal(edge.locks(), 3);
    for (const result of results) assert.equal((await result.json()).record_id, recordId);
  }
});

test('separate events can enter different transaction locks concurrently', async () => {
  let entered, release;
  const firstEntered = new Promise(resolve => { entered = resolve; });
  const holdFirst = new Promise(resolve => { release = resolve; });
  const first = submission(), second = submission();
  second.source_event_id = 'hub-submission-v1:3ee5587b-c782-431a-bd8d-f9a6619b7a06';
  const edge = runtime({onLock:async event => { if (event === first.source_event_id) { entered(); await holdFirst; } }});
  const waiting = edge.call(first);
  await firstEntered;
  try {
    const other = await Promise.race([edge.call(second),new Promise((_,reject)=>{
      const timer = setTimeout(()=>reject(new Error('A distinct event was blocked by the first event')),1000);
      timer.unref();
    })]);
    assert.equal(other.status,201);
  } finally { release(); }
  assert.equal((await waiting).status,201);
  assert.equal(edge.inserts(),2);
});

test('Hub accepts either text originals or validated archived attachments', async () => {
  for (const original of [submission(),submission(attachment())]) {
    const edge = runtime();
    assert.equal((await edge.call(original)).status,201);
    assert.equal(edge.inserts(),1);
  }
});

test('Hub rejects missing originals, malformed attachments and incorrect snapshot context before storage', async () => {
  const changes = [
    p=>{p.raw_data.submission.content='';}, p=>{p.raw_data.submission.attachment={};},
    p=>{p.raw_data.submission.attachment=[];}, p=>{delete p.raw_data.submission.attachment;},
    p=>{delete p.raw_data.submission.session_id;}, p=>{delete p.raw_data.submission.session_title;},
    p=>{p.raw_data.submission.session_id='x'.repeat(81);}, p=>{p.raw_data.submission.content='x'.repeat(2001);},
    p=>{p.raw_data.submission=[];}, p=>{p.raw_data.hub=[];}, p=>{p.raw_data.hub.board_id='43';},
    p=>{p.raw_data.hub.program_id='not-a-program';}, p=>{p.artifact='다른 보고서';},
    p=>{p.reflection='기본 소감';},p=>{p.source_event_id='hub-submission-v1:student-name';},
    p=>{p.source='job';},p=>{p.supersedes_id=recordId;},
    ...[
      {size:0},{size:20*1024*1024+1},{size:'1234'},{mime:'text/html'},
      {name:'../관찰.jpg'},{name:'관찰.pdf'},
      {storage_path:'board42/af7f06f8-ad86-4bc4-bff7-ebad0994f0f1.jpg'},
      {storage_path:'career-originals/../secret.jpg'},
      {storage_path:'https://external.example/관찰.jpg'},
    ].map(patch=>p=>{p.raw_data.submission.attachment={...attachment(),...patch};}),
  ];
  for (const change of changes) {
    const original=submission();change(original);const edge=runtime();
    assert.equal((await edge.call(original)).status,400);
    assert.equal(edge.databaseCalls(),0);
  }
});

test('Hub retry preserves older committed activity time while legacy time limits stay unchanged', async () => {
  const original=submission();original.occurred_at=new Date(Date.now()-3*86400000).toISOString();
  const edge=runtime();assert.equal((await edge.call(original)).status,201);
  assert.equal((await edge.call(original)).status,200);
  const future={...original,occurred_at:new Date(Date.now()+600000).toISOString()};
  assert.equal((await runtime().call(future)).status,400);
  for (const program of ['history-ai-01','science-observation-ai-03','aviation-mobility-01']) {
    assert.equal((await runtime().call({...record(program),occurred_at:original.occurred_at})).status,400);
  }
});

test('Hub event replay only acknowledges the same immutable snapshot', async () => {
  const original=submission(),edge=runtime();assert.equal((await edge.call(original)).status,201);
  // PostgreSQL JSONB treats object key order as insignificant.
  const reordered=structuredClone(original);
  reordered.raw_data={submission:{...original.raw_data.submission},hub:{program_id:'11',board_id:'42'}};
  assert.equal((await edge.call(reordered)).status,200);
  for (const change of [
    p=>{p.raw_data.submission.content='다른 학생 원문';},
    p=>{p.raw_data.submission.session_id='lesson-2';},
    p=>{p.raw_data.hub.program_id='12';},p=>{p.process='다른 과정';},
    p=>{p.occurred_at=new Date(new Date(p.occurred_at).getTime()-1000).toISOString();},
    p=>{p.artifact=p.raw_data.submission.title='새 보고서';},
    p=>{p.session_ref='hub-board:43';p.raw_data.hub.board_id='43';},
    p=>{p.student_id='33333333-3333-4333-8333-333333333333';},
  ]) {
    const changed=structuredClone(original);change(changed);
    const res=await edge.call(changed);assert.equal(res.status,409);
    assert.deepEqual(await res.json(),{error:'source_event_conflict'});
  }
  assert.equal(edge.inserts(),1);
});

test('simultaneous different snapshots cannot reuse the same Hub event', async () => {
  const original=submission(),changed=structuredClone(original);
  changed.raw_data.submission.content='바뀐 원문';
  const edge=runtime(),results=await Promise.all([edge.call(original),edge.call(changed)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  assert.equal(edge.inserts(),1);
});

test('legacy event retries retain their existing receipt behavior', async () => {
  const edge=runtime(),original=record('history-ai-01');
  assert.equal((await edge.call(original)).status,201);
  assert.equal((await edge.call({...original,raw_data:{activity:'changed legacy retry'}})).status,200);
  assert.equal(edge.inserts(),1);
});
