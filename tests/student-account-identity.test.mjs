import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createIdentityHelpers}=require('../lib/student-accounts/identity');
const {createService}=require('../lib/student-accounts/service');
const S=require('../lib/student-accounts/security');
const token='a'.repeat(64),school=crypto.randomUUID();
const row={id:crypto.randomUUID(),career_student_id:crypto.randomUUID(),username:'m'+'1'.repeat(20),must_change_password:false,expires_at:new Date(Date.now()+3600000)};
const req=(cookie)=>({headers:cookie?{cookie}:{},body:{student_id:crypto.randomUUID()},url:'/api/join-board/ABCD12?student_id='+crypto.randomUUID()});
function database(respond){
  const calls=[];
  return {calls,pool:{connect:async()=>({query:async(sql,args=[])=>{calls.push({sql,args});if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {};return respond(sql,args);},release(){}})}};
}
function helpers({enabled=true,origin='https://hub.example',api={}}={}){
  let connections=0;
  const helper=createIdentityHelpers({getConfig:()=>({enabled,origin}),getService:()=>{connections++;return api;}});
  return {helper,connections:()=>connections};
}
test('guest requests never connect to account DB or use body/query UUID',async()=>{
  for(const enabled of [true,false]){
    const h=helpers({enabled});
    assert.equal(await h.helper.resolveStudent(req()),null);
    assert.equal(h.connections(),0);
  }
});
test('disabled account with remaining cookie fails closed rather than becoming guest',async()=>{
  const h=helpers({enabled:false});
  await assert.rejects(h.helper.resolveStudent(req('__Host-moakit_student_session='+token)),e=>e.status===503);
  assert.equal(h.connections(),0);
});
test('only one correctly scoped opaque cookie can select a session',async()=>{
  const h=helpers();
  for(const cookie of ['moakit_student_session='+token,'__Host-moakit_student_session='+crypto.randomUUID(),'__Host-moakit_student_session=','__Host-moakit_student_session','__Host-moakit_student_session='+token+'; __Host-moakit_student_session='+token,'__Host-moakit_student_session='+token+'; moakit_student_session='+token]){
    await assert.rejects(h.helper.resolveStudent(req(cookie)),e=>e.status===401);
  }
  await assert.rejects(h.helper.resolveStudent(req(),{required:true}),e=>e.status===401);
  assert.equal(h.connections(),0);
});
test('revoked session errors propagate and never fall back to anonymous identity',async()=>{
  const h=helpers({api:{resolveStudent:async()=>{throw Object.assign(new Error('revoked'),{status:401});}}});
  await assert.rejects(h.helper.resolveStudent(req('__Host-moakit_student_session='+token)),e=>e.status===401);
});
test('account UUID persists across sessions while owner session hash rotates',async()=>{
  const db=database(()=>({rowCount:1,rows:[row]})),api=createService(db.pool,'hub');
  const first=await api.resolveStudent(token),next=await api.resolveStudent('b'.repeat(64));
  assert.equal(first.careerStudentId,row.career_student_id);
  assert.notEqual(first.careerStudentId,first.accountId);
  assert.equal(first.careerStudentId,next.careerStudentId);
  assert.notEqual(first.sessionHash,next.sessionHash);
  assert.equal(first.sessionHash,S.hash(token));
  assert.equal(first.expiresAt,row.expires_at);
  assert.ok(db.calls.every(c=>!c.args.includes(token)));
});
test('class authorization checks active membership for exact account and school',async()=>{
  const db=database(sql=>sql.includes('JOIN moakit_accounts.accounts')?{rowCount:1,rows:[row]}:{rowCount:1,rows:[{}]});
  const identity=await createService(db.pool,'hub').authorizeStudent(token,school);
  assert.equal(identity.careerStudentId,row.career_student_id);
  const q=db.calls.find(c=>c.sql.includes('FROM moakit_accounts.memberships'));
  assert.deepEqual(q.args,[row.id,school]);assert.match(q.sql,/active=true/);
  assert.ok(db.calls.some(c=>c.sql.includes('expires_at>now() AND a.active=true')));
});
test('inactive membership and initial passwords block class access',async()=>{
  const missing=database(sql=>sql.includes('JOIN moakit_accounts.accounts')?{rowCount:1,rows:[row]}:{rowCount:0,rows:[]});
  await assert.rejects(createService(missing.pool,'hub').authorizeStudent(token,school),e=>e.status===403);
  const initial=database(()=>({rowCount:1,rows:[{...row,must_change_password:true}]}));
  await assert.rejects(createService(initial.pool,'hub').authorizeStudent(token,school),e=>e.status===403);
  assert.ok(!initial.calls.some(c=>c.sql.includes('FROM moakit_accounts.memberships')));
});
test('school binding requires an explicit issuer scoped manager even for admin',async()=>{
  const db=database(()=>({rowCount:0,rows:[]})),api=createService(db.pool,'moakit-hub');
  await assert.rejects(api.authorizeSchool({id:7,role:'admin'},school),e=>e.status===403);
  assert.deepEqual(db.calls.find(c=>c.sql.includes('FROM moakit_accounts.managers')).args,[school,'moakit-hub','7']);
});
test('own record query uses server UUID, bounded pagination and own-record cursor',async()=>{
  const ids=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()],before=crypto.randomUUID();
  const db=database(sql=>sql.includes('JOIN moakit_accounts.accounts')?{rowCount:1,rows:[row]}:{rows:ids.map(id=>({id}))});
  const result=await createService(db.pool,'hub').readRecords(token,{limit:2,before});
  assert.deepEqual(result,{username:row.username,records:[{id:ids[0]},{id:ids[1]}],nextBefore:ids[1]});
  const q=db.calls.find(c=>c.sql.includes('FROM career_log.records'));
  assert.deepEqual(q.args,[row.career_student_id,3,before]);
  assert.match(q.sql,/WHERE student_id=\$1/);assert.match(q.sql,/WHERE id=\$3 AND student_id=\$1/);
  assert.ok(!db.calls.some(c=>/^(INSERT|UPDATE|DELETE|TRUNCATE)/.test(c.sql)));
});
test('record reads reject invalid pagination and initial password before reading records',async()=>{
  const db=database(()=>({rowCount:1,rows:[{...row,must_change_password:true}]})),api=createService(db.pool,'hub');
  for(const options of [{limit:0},{limit:101},{limit:1.2},{before:'invalid'}])await assert.rejects(api.readRecords(token,options),e=>e.status===400);
  await assert.rejects(api.readRecords(token),e=>e.status===403);
  assert.ok(!db.calls.some(c=>c.sql.includes('FROM career_log.records')));
});
test('leaving revokes account session and clears cookie without dropping board cookie',async()=>{
  let revoked;
  const h=helpers({api:{logout:async value=>{revoked=value;}}});
  let header='board_session=; Max-Age=0';
  const res={getHeader:()=>header,setHeader:(key,value)=>{assert.equal(key,'Set-Cookie');header=value;}};
  await h.helper.logoutStudent(req('__Host-moakit_student_session='+token),res);
  assert.equal(revoked,token);assert.equal(header[0],'board_session=; Max-Age=0');
  assert.match(header[1],/^__Host-moakit_student_session=;.*Max-Age=0; Secure$/);
  const guest=helpers();await guest.helper.logoutStudent(req(),res);assert.equal(guest.connections(),0);
});
