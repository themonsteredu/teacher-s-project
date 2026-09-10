import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const S=require('../lib/student-accounts/security');
const {createService}=require('../lib/student-accounts/service');
const user={id:7,role:'teacher'}, school=crypto.randomUUID();
function database(respond){
  const calls=[];
  return {calls,pool:{connect:async()=>({query:async(sql,args=[])=>{calls.push({sql,args});if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {};return respond(sql,args);},release(){calls.push({sql:'release'});}})}};
}
test('salted password hashes verify without storing the password',async()=>{
  const a=await S.passwordHash('local-test-password'),b=await S.passwordHash('local-test-password');
  assert.notEqual(a,b);assert.ok(await S.passwordMatches('local-test-password',a));
  assert.equal(await S.passwordMatches('incorrect',a),false);assert.equal(await S.passwordMatches('x','corrupt'),false);
});
test('cross-origin mutations fail closed, including missing Origin',()=>{
  for(const headers of [{},{origin:'https://attacker.invalid'},{origin:'https://hub.example','sec-fetch-site':'cross-site'}])assert.throws(()=>S.sameOrigin({headers},'https://hub.example'),e=>e.status===403);
  S.sameOrigin({headers:{origin:'https://hub.example'}},'https://hub.example');
});
test('student session cookie is HttpOnly, Secure, host scoped and expires on logout',()=>{
  assert.match(S.cookie('abc',true),/^__Host-moakit_student_session=abc; HttpOnly; SameSite=Strict; Path=\/; Max-Age=28800; Secure$/);
  assert.match(S.cookie('',true,0),/Max-Age=0/);
});
test('roster keeps same-name students separate and rejects unbounded input',()=>{
  assert.equal(S.roster([{displayName:'학생',className:'1반'},{displayName:'학생',className:'1반'}]).length,2);
  assert.throws(()=>S.roster([]));assert.throws(()=>S.roster(Array(101).fill({displayName:'학생',className:'반'})));
});
test('unassigned teachers cannot list, issue or reset another school accounts',async()=>{
  const db=database(()=>({rowCount:0,rows:[]})),api=createService(db.pool,'hub');
  await assert.rejects(api.list(user,school),e=>e.status===403);
  await assert.rejects(api.provision(user,school,[{displayName:'학생',className:'1반'}]),e=>e.status===403);
  await assert.rejects(api.reset(user,school,crypto.randomUUID()),e=>e.status===403);
  assert.equal(db.calls.some(c=>/^(INSERT|UPDATE|DELETE)/.test(c.sql)),false);
});
test('account issue generates independent UUIDs and audits, all in one transaction',async()=>{
  const db=database(sql=>sql.startsWith('SELECT 1')?{rowCount:1,rows:[{}]}:sql.includes('RETURNING id')?{rowCount:1,rows:[{id:crypto.randomUUID()}]}:{rowCount:1,rows:[]});
  const api=createService(db.pool,'hub');
  const issued=await api.provision(user,school,[{displayName:'같은 이름',className:'2반'},{displayName:'같은 이름',className:'2반'}]);
  const ids=db.calls.filter(c=>c.sql.startsWith('INSERT INTO career_log.students')).map(c=>c.args[0]);
  assert.equal(ids.length,2);assert.ok(ids.every(S.uuid));assert.notEqual(ids[0],ids[1]);
  assert.notEqual(issued[0].username,issued[1].username);
  assert.equal(db.calls.filter(c=>c.sql==='COMMIT').length,1);
  assert.equal(db.calls.filter(c=>c.sql.includes('INSERT INTO moakit_accounts.audit')).length,2);
  assert.equal(db.calls.some(c=>/UPDATE career_log|DELETE FROM career_log/.test(c.sql)),false);
});
test('partial batch failures roll back including new student bindings',async()=>{
  const db=database(sql=>{if(sql.startsWith('SELECT 1'))return{rowCount:1,rows:[{}]};if(sql.includes('INSERT INTO moakit_accounts.accounts'))throw new Error('connection lost');return{rowCount:1,rows:[]};});
  await assert.rejects(createService(db.pool,'hub').provision(user,school,[{displayName:'학생',className:'반'}]));
  assert.ok(db.calls.some(c=>c.sql==='ROLLBACK'));assert.ok(!db.calls.some(c=>c.sql==='COMMIT'));
});
test('password reset revokes all sessions without changing student identity',async()=>{
  const db=database(()=>({rowCount:1,rows:[{id:crypto.randomUUID()}]}));
  const id=crypto.randomUUID();await createService(db.pool,'hub').reset(user,school,id);
  assert.ok(db.calls.some(c=>c.sql==='DELETE FROM moakit_accounts.sessions WHERE account_id=$1'&&c.args[0]===id));
  assert.ok(!db.calls.some(c=>c.sql.startsWith('UPDATE')&&c.sql.includes('career_student_id')));
});
test('forged or expired student sessions do not expose identity',async()=>{
  const db=database(()=>({rowCount:0,rows:[]})),api=createService(db.pool,'hub');
  await assert.rejects(api.me(crypto.randomUUID()),e=>e.status===401);
  await assert.rejects(api.me('a'.repeat(64)),e=>e.status===401);
  assert.ok(db.calls.some(c=>c.sql.includes('expires_at>now() AND a.active=true')));
});
test('login stores only token hash and returns mandatory password-change state',async()=>{
  const passwordHash=await S.passwordHash('test-student-password');
  const db=database(sql=>sql.includes('login_limits')?{rows:[{attempts:1}]}:sql.startsWith('SELECT *')?{rows:[{id:crypto.randomUUID(),active:true,password_hash:passwordHash,must_change_password:true}]}:{rows:[]});
  const result=await createService(db.pool,'hub').login('m'+'a'.repeat(20),'test-student-password','loopback');
  assert.equal(result.mustChangePassword,true);assert.match(result.token,/^[a-f0-9]{64}$/);
  const stored=db.calls.find(c=>c.sql.includes('INSERT INTO moakit_accounts.sessions'));
  assert.equal(stored.args[0],S.hash(result.token));assert.notEqual(stored.args[0],result.token);
});
test('rate limit refuses verification before querying account passwords',async()=>{
  const db=database(()=>({rows:[{attempts:21}]}));
  await assert.rejects(createService(db.pool,'hub').login('m'+'b'.repeat(20),'password','loopback'),e=>e.status===429);
  assert.ok(!db.calls.some(c=>c.sql.startsWith('SELECT *')));
});
