import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const R=require('../lib/student-accounts/roster');
const S=require('../lib/student-accounts/security');
const {createService}=require('../lib/student-accounts/service');
const teacher={id:7,role:'teacher'};
const school=crypto.randomUUID(),otherSchool=crypto.randomUUID();
const entry=(studentNumber,displayName='김하나')=>({grade:2,classNumber:1,studentNumber,displayName});
const member=(schoolId,number,extras={})=>({account_id:crypto.randomUUID(),school_id:schoolId,display_name:'기존 학생',class_name:`2학년 1반 ${number}번`,active:true,...extras});

// A transactional store with advisory-lock scheduling. Writes become visible
// only at COMMIT, so tests exercise interleaving rather than returning canned
// "duplicate" answers for concurrent calls.
function database({members=[],allowed=[school,otherSchool],failMembershipNumber=0}={}) {
  const state={members:members.map(row=>({...row})),students:[],accounts:[],audits:[]};
  for(const row of members) state.accounts.push({id:row.account_id,career_student_id:crypto.randomUUID(),username:`m${crypto.randomBytes(10).toString('hex')}`,active:true,must_change_password:true});
  const calls=[],locks=new Map();let connectionNumber=0,membershipWrites=0;
  const canonical=value=>String(value).toLowerCase();
  return {state,calls,pool:{async connect(){
    const connection=++connectionNumber,updates=[],unlocks=[];
    function releaseLocks(){for(const unlock of unlocks.splice(0))unlock();}
    return {async query(sql,args=[]){
      calls.push({connection,sql,args});
      if(sql==='BEGIN')return {};
      if(sql==='COMMIT'){for(const update of updates.splice(0))update();releaseLocks();return {};}
      if(sql==='ROLLBACK'){updates.length=0;releaseLocks();return {};}
      if(sql.startsWith('SELECT 1 FROM moakit_accounts.managers'))return {rowCount:allowed.some(id=>canonical(id)===canonical(args[0]))?1:0,rows:[]};
      if(sql.startsWith('SELECT pg_advisory_xact_lock')){
        const key=args[0],previous=locks.get(key)||Promise.resolve();let unlock;
        const held=new Promise(resolve=>{unlock=resolve;});
        locks.set(key,previous.then(()=>held));
        await previous;unlocks.push(unlock);return {rows:[]};
      }
      if(sql.startsWith('SELECT account_id,class_name FROM moakit_accounts.memberships'))return {rows:state.members.filter(row=>canonical(row.school_id)===canonical(args[0])&&row.active).map(row=>({...row}))};
      if(sql.startsWith('SELECT a.id,a.username'))return {rows:state.members.filter(row=>canonical(row.school_id)===canonical(args[0])&&row.active).map(row=>{
        const account=state.accounts.find(a=>a.id===row.account_id);
        return {id:account.id,username:account.username,active:account.active,must_change_password:account.must_change_password,display_name:row.display_name,class_name:row.class_name};
      })};
      if(sql.startsWith('INSERT INTO career_log.students')){updates.push(()=>state.students.push(args[0]));return {rowCount:1,rows:[]};}
      if(sql.startsWith('INSERT INTO moakit_accounts.accounts')){
        const id=crypto.randomUUID();updates.push(()=>state.accounts.push({id,career_student_id:args[0],username:args[1],password_hash:args[2],active:true,must_change_password:true}));return {rowCount:1,rows:[{id}]};
      }
      if(sql.startsWith('INSERT INTO moakit_accounts.memberships')){
        membershipWrites+=1;if(membershipWrites===failMembershipNumber)throw new Error('simulated storage interruption');
        updates.push(()=>state.members.push({account_id:args[0],school_id:canonical(args[1]),display_name:args[2],class_name:args[3],active:true}));return {rowCount:1,rows:[]};
      }
      if(sql.startsWith('UPDATE moakit_accounts.memberships SET display_name=')){
        const existing=state.members.find(row=>canonical(row.account_id)===canonical(args[2])&&canonical(row.school_id)===canonical(args[3])&&row.active);
        if(!existing)return {rowCount:0,rows:[]};
        updates.push(()=>{existing.display_name=args[0];existing.class_name=args[1];});return {rowCount:1,rows:[{account_id:existing.account_id}]};
      }
      if(sql.startsWith('INSERT INTO moakit_accounts.audit')){updates.push(()=>state.audits.push([...args]));return {rowCount:1,rows:[]};}
      throw new Error(`Unexpected SQL: ${sql}`);
    },release(){releaseLocks();calls.push({connection,sql:'release',args:[]});}};
  }}};
}

test('structured roster serializes into existing class_name metadata and remains idempotent',()=>{
  const normalized=R.normalize({...entry('003'),grade:' 2 ',classNumber:'01'});
  assert.deepEqual(normalized,{displayName:'김하나',grade:2,classNumber:1,studentNumber:3,className:'2학년 1반 3번'});
  assert.deepEqual(R.normalize(normalized),normalized);
  assert.deepEqual(S.roster([entry(3)]),[normalized]);
});

test('legacy class labels remain readable without inventing grade or student number',()=>{
  const legacy=R.normalize({displayName:'이두나',className:'방과후 코딩 A반'});
  assert.deepEqual(legacy,{displayName:'이두나',className:'방과후 코딩 A반',grade:null,classNumber:null,studentNumber:null});
  assert.deepEqual(R.normalize(legacy),legacy);
  assert.deepEqual(R.fromLabel('2학년 1반'),{grade:null,classNumber:null,studentNumber:null});
  assert.deepEqual(R.fromLabel('2학년 1반 03번'),{grade:2,classNumber:1,studentNumber:3});
  assert.deepEqual(R.fromLabel('7학년 1반 3번'),{grade:null,classNumber:null,studentNumber:null});
  assert.deepEqual(R.fromLabel({toString:()=> '2학년 1반 3번'}),{grade:null,classNumber:null,studentNumber:null});
});

test('server validates all structured fields and keeps same-name students distinct',()=>{
  assert.equal(R.validate([entry(1),entry(2)]).length,2);
  for(const changed of [{grade:0},{grade:7},{classNumber:100},{studentNumber:1000},{studentNumber:1.5},{studentNumber:null},{studentNumber:'1e2'},{displayName:'김\n하나'}]){
    assert.throws(()=>R.validate([{...entry(1),...changed}]),error=>error.status===400);
  }
  assert.throws(()=>R.validate([entry(1),{displayName:'다른 이름',className:'2학년 1반 01번'}]),error=>error.status===400&&/중복/.test(error.message));
  assert.throws(()=>R.validate([]),error=>error.status===400);
  assert.throws(()=>R.validate(Array.from({length:101},(_,i)=>entry(i+1))),error=>error.status===400);
});

test('list returns parsed metadata and sorts numbers numerically while preserving legacy rows',async()=>{
  const db=database({members:[member(school,10),member(school,2),member(school,1,{class_name:'늘봄 A반'})]});
  const students=await createService(db.pool,'hub').list(teacher,school);
  assert.deepEqual(students.map(row=>row.studentNumber),[2,10,null]);
  assert.deepEqual(students.slice(0,2).map(row=>[row.grade,row.classNumber]),[[2,1],[2,1]]);
  assert.equal(students[2].class_name,'늘봄 A반');
  assert.ok(students.every(row=>!('password_hash' in row)&&!('career_student_id' in row)));
});

test('provision authorizes, locks and checks occupancy before creating random account identities',async()=>{
  const db=database(),api=createService(db.pool,'hub');
  const issued=await api.provision(teacher,school,[entry(1),entry(2)]);
  assert.deepEqual(issued.map(row=>[row.grade,row.classNumber,row.studentNumber]),[[2,1,1],[2,1,2]]);
  assert.deepEqual(db.state.members.map(row=>row.class_name),['2학년 1반 1번','2학년 1반 2번']);
  assert.equal(new Set(db.state.students).size,2);
  for(const account of db.state.accounts){assert.ok(S.uuid(account.id));assert.ok(S.uuid(account.career_student_id));assert.notEqual(account.id,account.career_student_id);}
  assert.ok(issued.every(row=>row.temporaryPassword&&!('career_student_id' in row)));
  const authorize=db.calls.findIndex(call=>call.sql.startsWith('SELECT 1 FROM moakit_accounts.managers'));
  const lock=db.calls.findIndex(call=>call.sql.startsWith('SELECT pg_advisory_xact_lock'));
  const check=db.calls.findIndex(call=>call.sql.startsWith('SELECT account_id,class_name'));
  const insert=db.calls.findIndex(call=>call.sql.startsWith('INSERT INTO career_log.students'));
  assert.ok(authorize<lock&&lock<check&&check<insert);
  assert.equal(db.calls[lock].args[0],`moakit-account-roster:${school}`);
  assert.equal(db.state.audits.length,2);
});

test('an occupied seat rejects the whole batch with 409 before any inserts',async()=>{
  const existing=member(school,2),db=database({members:[existing]});
  await assert.rejects(createService(db.pool,'hub').provision(teacher,school,[entry(1),entry(2)]),error=>error.status===409);
  assert.equal(db.state.members.length,1);assert.equal(db.state.students.length,0);
  assert.ok(!db.calls.some(call=>call.sql.startsWith('INSERT')));
  assert.ok(db.calls.some(call=>call.sql==='ROLLBACK'));
});

test('the same seat in a different school remains independently available',async()=>{
  const db=database({members:[member(school,1)]});
  await createService(db.pool,'hub').provision(teacher,otherSchool,[entry(1)]);
  assert.equal(db.state.members.length,2);
  assert.ok(db.calls.some(call=>call.sql.startsWith('SELECT pg_advisory_xact_lock')&&call.args[0]===`moakit-account-roster:${otherSchool}`));
});

test('partial batch storage failure rolls back membership, account, identity and audit together',async()=>{
  const db=database({failMembershipNumber:2});
  await assert.rejects(createService(db.pool,'hub').provision(teacher,school,[entry(1),entry(2)]),/simulated storage interruption/);
  assert.deepEqual(db.state,{members:[],students:[],accounts:[],audits:[]});
  assert.ok(db.calls.some(call=>call.sql==='ROLLBACK'));
  assert.ok(!db.calls.some(call=>call.sql==='COMMIT'));
});

test('unauthorized issue and edit cannot acquire the school lock or read its roster',async()=>{
  const db=database({allowed:[]}),api=createService(db.pool,'hub');
  await assert.rejects(api.provision(teacher,school,[entry(1)]),error=>error.status===403);
  await assert.rejects(api.updateMember(teacher,school,crypto.randomUUID(),entry(1)),error=>error.status===403);
  assert.ok(!db.calls.some(call=>call.sql.includes('pg_advisory')||call.sql.startsWith('SELECT account_id')||/^(INSERT|UPDATE|DELETE)/.test(call.sql)));
});

test('editing membership preserves account ID, credentials and Career UUID, including uppercase IDs',async()=>{
  const existing=member(school,1),db=database({members:[existing]}),before=structuredClone(db.state.accounts);
  const api=createService(db.pool,'hub');
  await api.updateMember(teacher,school.toUpperCase(),existing.account_id.toUpperCase(),entry(1,'바뀐 이름'));
  assert.equal(db.state.members[0].display_name,'바뀐 이름');
  assert.equal(db.state.members[0].account_id,existing.account_id);
  assert.deepEqual(db.state.accounts,before);
  assert.ok(!db.calls.some(call=>/^(UPDATE|DELETE|INSERT).*career_log/.test(call.sql)||call.sql.startsWith('UPDATE moakit_accounts.accounts')));
  assert.ok(db.calls.some(call=>call.sql.startsWith('SELECT pg_advisory')&&call.args[0]===`moakit-account-roster:${school}`));
});

test('membership edits cannot take a different active students seat',async()=>{
  const a=member(school,1),b=member(school,2),db=database({members:[a,b]});
  await assert.rejects(createService(db.pool,'hub').updateMember(teacher,school,a.account_id,entry(2)),error=>error.status===409);
  assert.equal(db.state.members[0].class_name,'2학년 1반 1번');
  assert.ok(!db.calls.some(call=>call.sql.startsWith('UPDATE')));
});

test('concurrent issue requests for the same seat serialize, including UUID case variants',async()=>{
  const db=database(),api=createService(db.pool,'hub');
  const results=await Promise.allSettled([
    api.provision(teacher,school,[entry(1)]),
    api.provision(teacher,school.toUpperCase(),[entry(1,'다른 학생')]),
  ]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.find(result=>result.status==='rejected').reason.status,409);
  assert.equal(db.state.members.length,1);assert.equal(db.state.students.length,1);
  assert.equal(new Set(db.calls.filter(call=>call.sql.startsWith('SELECT pg_advisory')).map(call=>call.args[0])).size,1);
});

test('concurrent issue and membership edit use the same lock and cannot claim one seat twice',async()=>{
  const existing=member(school,1),db=database({members:[existing]}),api=createService(db.pool,'hub');
  const results=await Promise.allSettled([
    api.provision(teacher,school,[entry(2)]),
    api.updateMember(teacher,school,existing.account_id,entry(2,'기존 학생')),
  ]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.find(result=>result.status==='rejected').reason.status,409);
  assert.equal(db.state.members.filter(row=>row.class_name==='2학년 1반 2번').length,1);
});

test('legacy API clients may still issue and edit free-form class names',async()=>{
  const db=database(),api=createService(db.pool,'hub');
  const [issued]=await api.provision(teacher,school,[{displayName:'김하나',className:'방과후 A반'}]);
  assert.equal(issued.studentNumber,null);
  await api.updateMember(teacher,school,issued.id,{displayName:'김하나',className:'방과후 B반',grade:null,classNumber:null,studentNumber:null});
  assert.equal(db.state.members[0].class_name,'방과후 B반');
});
