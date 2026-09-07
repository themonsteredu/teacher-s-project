import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
const SCHOOL='286b4334-5836-4b36-a778-b693c1734d93';

async function call(method,path,{bound=true,allowed=false,role='teacher',accountError=null,pending=false,commitFailure=false,body={}}={}) {
  const board={id:16,created_by:1,program_id:11,title:'학교 수업',code:'school16',roster:'학생 비공개 이름'};
  const legacy={...board,id:17,title:'공개 코드 수업',code:'legacy17',roster:''};
  const post={id:21,board_id:16,storage_path:'board16/student.pdf',file_name:'보고서.pdf',student_name:'비공개 학생',content:'비공개 원본'};
  const program={id:11,title:'교과 활동',published:true};
  const effects={signed:0,removed:0,mutations:[],schoolChecks:[],nameQueries:[],order:[]};
  const db={
    ready:async()=>{},getSettings:async()=>({site_open:true}),TS:s=>s,log:async()=>{},
    one:async(sql,args)=>{
      effects.order.push(sql);
      if(sql.startsWith('WITH career_posts'))return pending?{'?column?':1}:null;
      if(sql==='SELECT value FROM settings WHERE key=$1') {
        if(args[0]==='sb:config:16'&&bound)return {value:JSON.stringify({career:{enabled:false,schoolId:SCHOOL}})};
        return null;
      }
      if(sql.includes('FROM board_posts'))return post;
      if(sql.includes('FROM boards'))return board;
      if(sql.includes('FROM programs'))return program;
      throw new Error(sql);
    },
    q:async(sql,args)=>{
      effects.order.push(sql);
      if(sql.startsWith('SELECT id FROM boards WHERE program_id='))return [board];
      if(sql.includes('FROM boards b'))return [board,legacy];
      if(sql.startsWith('SELECT board_id, student_name')){effects.nameQueries.push(args[0]);return [];}
      if(sql.includes('FROM board_posts'))return [post];
      if(sql.includes('FROM program_files')||sql.includes('FROM program_links')||sql.includes('FROM lessons')||sql.includes('FROM board_items'))return [];
      if(/^(UPDATE|DELETE|INSERT)/.test(sql)){effects.mutations.push(sql);return [];}
      throw new Error(sql);
    },
  };
  db.transaction=async fn=>{
    effects.order.push('BEGIN');
    try {const result=await fn(db);if(commitFailure)throw new Error('commit failed');effects.order.push('COMMIT');return result;}
    catch(error){effects.order.push('ROLLBACK');throw error;}
  };
  const dependencies={
    'node:crypto':require('node:crypto'),'./db':db,'./password':{},'./cookies':{},
    './auth':{getSessionUser:async()=>({user:{id:1,role}}),roleLevel:r=>r==='admin'?2:1},
    './storage':{storageEnabled:true,createSignedDownload:async()=>{effects.signed++;return 'https://storage.example/signed';},removeObject:async()=>{effects.removed++;effects.order.push('REMOVE_OBJECT');}},
    './student-accounts/http':{authorizeSchool:async(user,school)=>{
      effects.schoolChecks.push({user:user.id,school});
      if(accountError)throw accountError;
      if(!allowed)throw Object.assign(new Error('학교 관리 권한이 없습니다.'),{status:403});
    }},
  };
  const module={exports:{}};
  vm.runInNewContext(source,{module,require:id=>{
    if(!(id in dependencies))throw new Error(`Unexpected module ${id}`);
    return dependencies[id];
  },process:{env:{}},Buffer,URL});
  let status,result;
  await module.exports.handleApi({method,headers:{host:'hub.example',origin:'https://hub.example'}},{
    writeHead(s){status=s;},end(value){result=value?JSON.parse(value):null;},
  },path,body);
  return {status,result,...effects};
}

for(const [method,path,body] of [
  ['PATCH','/api/boards/16',{is_open:false}],
  ['DELETE','/api/boards/16'],
  ['GET','/api/boards/16/posts'],
  ['GET','/api/boards/16/items'],
  ['PUT','/api/boards/16/items',{link_ids:[]}],
  ['PATCH','/api/posts/21',{hidden:false}],
  ['DELETE','/api/posts/21'],
  ['GET','/api/boards/16/download-all'],
  ['GET','/api/posts/21/download'],
]) {
  test(`removed school manager cannot ${method} ${path} even while Career recording is off`,async()=>{
    const result=await call(method,path,{body});
    assert.equal(result.status,403);
    assert.equal(result.signed,0);
    assert.equal(result.removed,0);
    assert.deepEqual(result.mutations,[]);
    assert.equal(result.schoolChecks.length,1);
    assert.equal(result.schoolChecks[0].school,SCHOOL);
    assert.doesNotMatch(JSON.stringify(result.result),/비공개 학생|비공개 원본/);
  });
}

test('school-authorized board owner can still download the original file',async()=>{
  const result=await call('GET','/api/posts/21/download',{allowed:true});
  assert.equal(result.status,302);assert.equal(result.signed,1);
});
test('unbound legacy board stays available without account service access',async()=>{
  const result=await call('GET','/api/posts/21/download',{bound:false});
  assert.equal(result.status,302);assert.equal(result.signed,1);assert.equal(result.schoolChecks.length,0);
});
test('admin role alone cannot download school student files',async()=>{
  const result=await call('GET','/api/posts/21/download',{role:'admin'});
  assert.equal(result.status,403);assert.equal(result.signed,0);
});
test('school authorization outage fails closed before issuing a download',async()=>{
  const result=await call('GET','/api/posts/21/download',{accountError:new Error('private DB detail')});
  assert.equal(result.status,503);assert.equal(result.signed,0);
  assert.doesNotMatch(JSON.stringify(result.result),/private DB detail/);
});
test('my boards excludes removed school access before querying student roster submissions',async()=>{
  const result=await call('GET','/api/my-boards');
  assert.equal(result.status,200);
  assert.deepEqual(result.result.boards.map(b=>b.id),[17]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.nameQueries)),[[17]]);
  assert.doesNotMatch(JSON.stringify(result.result),/school16|학생 비공개 이름/);
});
test('program detail excludes school board codes after manager removal',async()=>{
  const result=await call('GET','/api/programs/11');
  assert.equal(result.status,200);
  assert.deepEqual(result.result.boards.map(b=>b.id),[17]);
  assert.doesNotMatch(JSON.stringify(result.result),/school16|학생 비공개 이름/);
});
test('program cascade deletion requires the affected school authorization before mutation',async()=>{
  const result=await call('DELETE','/api/programs/11',{role:'admin'});
  assert.equal(result.status,403);assert.equal(result.removed,0);assert.deepEqual(result.mutations,[]);
});
for(const path of ['/api/boards/16','/api/programs/11']) {
  test(`pending Career snapshots prevent ${path} deletion inside the row-locked transaction`,async()=>{
    const result=await call('DELETE',path,{allowed:true,role:'admin',pending:true});
    assert.equal(result.status,409);assert.equal(result.removed,0);assert.deepEqual(result.mutations,[]);
    const begin=result.order.indexOf('BEGIN'),lock=result.order.findIndex(sql=>sql.includes('FOR UPDATE')),check=result.order.findIndex(sql=>sql.startsWith('WITH career_posts'));
    assert.ok(begin<lock&&lock<check);assert.ok(result.order.includes('ROLLBACK'));assert.ok(!result.order.includes('COMMIT'));
    if(path.includes('programs'))assert.ok(result.order.some(sql=>sql==='SELECT id FROM boards WHERE program_id=$1 ORDER BY id FOR UPDATE'));
  });
  test(`saved or absent Career snapshots allow ${path} deletion with file cleanup after commit`,async()=>{
    const result=await call('DELETE',path,{allowed:true,role:'admin'});
    assert.equal(result.status,200);
    const check=result.order.findIndex(sql=>sql.startsWith('WITH career_posts')),remove=result.order.findIndex(sql=>sql.startsWith('DELETE FROM')),commit=result.order.indexOf('COMMIT'),file=result.order.indexOf('REMOVE_OBJECT');
    assert.ok(check<remove&&remove<commit&&commit<file);
    assert.equal(result.removed,1);
  });
  test(`failed ${path} deletion commit never removes stored files`,async()=>{
    const result=await call('DELETE',path,{allowed:true,role:'admin',commitFailure:true});
    assert.equal(result.status,503);assert.equal(result.removed,0);assert.ok(result.order.includes('ROLLBACK'));
  });
}
