import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const {snapshot,deliver}=createRequire(import.meta.url)('../lib/submission-career');
process.env.CAREER_LOG_INGEST_URL='https://central.example/functions/v1/career-log-ingest';
const payload=()=>snapshot({studentId:randomUUID(),board:{id:7,program_id:11},session:{id:'lesson-1',title:'관찰',record:{process:'관찰 기록을 제출함'}},data:{title:'관찰 원본',content:'톱니 모양 잎'},attachment:null});
test('server-generated event UUID contains no board code, name, school or student identity',()=>{const p=payload();assert.match(p.source_event_id,/^hub-submission-v1:[a-f0-9-]{36}$/);assert.ok(!p.source_event_id.includes(p.student_id));assert.equal(p.verification_status,null);assert.equal(p.supersedes_id,null);});
test('receipt requires successful Edge acknowledgement with exact student UUID and actual record UUID',async()=>{
 const p=payload(),req={headers:{'x-vercel-oidc-token':'runtime-token'}};
 await assert.rejects(()=>deliver({headers:{}},p,()=>{throw Error('must not fetch');}));
 for(const result of [{ok:true,record_id:randomUUID(),student_id:randomUUID()},{ok:true,student_id:p.student_id},{ok:false,record_id:randomUUID(),student_id:p.student_id}])await assert.rejects(()=>deliver(req,p,async()=>({ok:true,json:async()=>result})));
 const id=randomUUID();assert.equal((await deliver(req,p,async(url,opts)=>{assert.equal(opts.headers.Authorization,'Bearer runtime-token');assert.deepEqual(JSON.parse(opts.body),p);return{ok:true,json:async()=>({ok:true,record_id:id,student_id:p.student_id})};})).recordId,id);
});
