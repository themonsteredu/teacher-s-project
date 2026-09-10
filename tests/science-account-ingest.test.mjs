import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test';
process.env.CAREER_LOG_INGEST_URL='https://central.example/functions/v1/career-log-ingest';
const db=require('../lib/db');
const student='11111111-1111-4111-8111-111111111111',scope='22222222-2222-4222-8222-222222222222',record='33333333-3333-4333-8333-333333333333';
const req={method:'POST',headers:{host:'hub.moakit.ai',origin:'https://hub.moakit.ai','sec-fetch-site':'same-origin','x-vercel-oidc-token':'runtime-token'}};
const input={program_ref:'science-observation-ai-03',board_code:'ABCD12',session_id:'lesson-1',draftScope:scope,process:'민들레 식물을 관찰하고 눈에 보이는 특징을 기록함',artifact:'식물 관찰 카드 · 민들레: 노란 꽃',reflection:null,source_event_id:'science-observation-ai-03:abcd12:'+record,raw_data:{lesson:3,activity:'plant-observation',observation:{plant_name:'민들레',features:'노란 꽃'}}};
function response(){return{headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};}
function load({site=true,board={id:42,program_id:8,is_open:true,published:true},links=[{url:'/lessons/초2-인공지능/3차시-학생용-감각짝맞추기.html'}]}={}){
 db.getSettings=async()=>({site_open:site});db.one=async()=>board;db.q=async()=>links;
 delete require.cache[require.resolve('../lib/career-log')];return require('../lib/career-log').handleCareerLogIngest;
}
const allowed={authorizeScience:async()=>({careerStudentId:student,draftScope:scope,activitySessionId:'lesson-1'})};
test('general ingest cannot bypass the scoped Science board-session handler',async t=>{
 t.mock.method(globalThis,'fetch',async()=>assert.fail('must not store'));const res=response();await load()(req,res,input);
 assert.equal(res.statusCode,403);assert.equal(res.body.error,'science_board_session_required');
});
test('verified Science write sends the server UUID and returns only a validated public receipt',async t=>{
 let payload;t.mock.method(globalThis,'fetch',async(url,options)=>{payload=JSON.parse(options.body);return Response.json({ok:true,record_id:record,student_id:student,duplicate:false},{status:201});});
 const res=response();await load()(req,res,input,{authorizeScience:async body=>{assert.equal(body.draftScope,scope);assert.equal(body.student_id,undefined);return{careerStudentId:student,activitySessionId:'lesson-1'};}});
 assert.equal(res.statusCode,201);assert.equal(payload.student_id,student);assert.equal(payload.session_ref,'hub-board:42');
 assert.equal(res.body.student_id,undefined);assert.deepEqual(res.body,{ok:true,record_id:record,duplicate:false,source_event_id:input.source_event_id,draftScope:scope});
});
test('Science access failures, site and program switches prevent downstream records',async t=>{
 t.mock.method(globalThis,'fetch',async()=>assert.fail('must not store'));
 for(const [options,status] of [[{site:false},403],[{board:{is_open:false}},404],[{board:{is_open:true,published:false}},403],[{links:[{label:'자연을 관찰하는 AI',url:'https://evil.test/fake.html'}]},403]]){
  const res=response();await load(options)(req,res,input,allowed);assert.equal(res.statusCode,status);
 }
 for(const status of [401,403,409]){const res=response();await load()(req,res,input,{authorizeScience:async()=>{throw Object.assign(Error('denied'),{status});}});assert.equal(res.statusCode,status);}
});
test('missing observation, malformed event IDs and forged UUIDs are rejected',async t=>{
 t.mock.method(globalThis,'fetch',async()=>assert.fail('must not store'));
 for(const [body,status] of [[{...input,student_id:scope},409],[{...input,source_event_id:'science-observation-ai-03:abcd12:not-a-uuid'},400],[{...input,raw_data:{...input.raw_data,observation:{plant_name:'민들레',features:''}}},400],[{...input,process:'자동 기본값'},400]]){
  const res=response();await load()(req,res,body,allowed);assert.equal(res.statusCode,status);
 }
});
test('an invalid or different-student Edge success is not relayed as saved',async t=>{
 let body={ok:true};t.mock.method(globalThis,'fetch',async()=>Response.json(body,{status:201}));
 for(const next of [{ok:true},{ok:true,record_id:record,student_id:scope,duplicate:false}]){body=next;const res=response();await load()(req,res,input,allowed);assert.equal(res.statusCode,502);assert.equal(res.body.error,'invalid_edge_response');assert.equal(res.body.student_id,undefined);}
});
