import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test';
process.env.CAREER_LOG_INGEST_URL='https://central.example/functions/v1/career-log-ingest';
const db=require('../lib/db'), accounts=require('../lib/student-accounts/http');
const studentId='11111111-1111-4111-8111-111111111111';
const schoolId='22222222-2222-4222-8222-222222222222';
const req={method:'POST',headers:{origin:'https://ai-history-ar.vercel.app','x-vercel-oidc-token':'runtime-token'}};
const value={board_code:'ABCD12',program_ref:'history-ai-01',process:'자료를 비교하고 활동 결과물을 작성함',source_event_id:'history-ai-01:attempt',raw_data:{comparison:'학생 작성 내용'}};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};}
function load({career={enabled:true,schoolId},authorize=async()=>({careerStudentId:studentId})}={}){
  db.getSettings=async()=>({site_open:true});
  db.one=async sql=>sql.includes('SELECT value FROM settings')?{value:JSON.stringify({career})}:{id:42,program_id:8,is_open:true,published:true};
  db.q=async()=>[{url:'https://ai-history-ar.vercel.app'}];
  accounts.authorizeStudent=authorize;
  delete require.cache[require.resolve('../lib/career-log')];
  return require('../lib/career-log').handleCareerLogIngest;
}
test('public code plus forged UUID cannot bypass a missing or revoked student account',async t=>{
  t.mock.method(globalThis,'fetch',async()=>assert.fail('must not store'));
  for(const status of [401,403,503]){
    const res=response();
    await load({authorize:async()=>{throw Object.assign(new Error('account denied'),{status});}})(req,res,{...value,student_id:studentId});
    assert.equal(res.statusCode,status);
  }
  assert.equal(globalThis.fetch.mock.callCount(),0);
});
test('unbound and paused classes cannot create account records through legacy apps',async t=>{
  t.mock.method(globalThis,'fetch',async()=>assert.fail('must not store'));
  for(const career of [null,{enabled:false,schoolId},{enabled:true,schoolId:null}]){
    const res=response();await load({career})(req,res,{...value,student_id:studentId});
    assert.equal(res.statusCode,403);assert.equal(res.body.error,'career_class_not_connected');
  }
});
test('mismatching body UUID is refused; omitted UUID is supplied only by the verified server account',async t=>{
  let saved;
  t.mock.method(globalThis,'fetch',async(url,options)=>{saved=JSON.parse(options.body);return Response.json({ok:true},{status:201});});
  const handle=load({authorize:async(actualReq,actualSchool)=>{assert.equal(actualReq,req);assert.equal(actualSchool,schoolId);return {careerStudentId:studentId};}});
  const wrong=response();await handle(req,wrong,{...value,student_id:schoolId});
  assert.equal(wrong.statusCode,409);assert.equal(globalThis.fetch.mock.callCount(),0);
  const correct=response();await handle(req,correct,value);
  assert.equal(correct.statusCode,201);assert.equal(saved.student_id,studentId);
  assert.equal(saved.session_ref,'hub-board:42');assert.equal(saved.source,'hub');
});
test('unknown account lookup failures do not expose internal database information',async()=>{
  const res=response();await load({authorize:async()=>{throw new Error('secret connection details');}})(req,res,value);
  assert.equal(res.statusCode,503);assert.equal(res.body.error,'student_identity_unavailable');
});
