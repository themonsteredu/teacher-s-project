import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

// 함께 보는 선생님(담임 등): 수업을 연 선생님이 아이디로 더하면 그 선생님은 제출물을
// 보고·받고·인쇄만 한다. 공개·삭제·설정·함께 볼 사람 정하기는 여전히 수업을 연 사람만.
const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
const SCHOOL='286b4334-5836-4b36-a778-b693c1734d93';
const OWNER=1, VIEWER=5, STRANGER=9;

async function call(method,path,{userId=OWNER,role='teacher',viewers=[VIEWER],bound=true,body={},ownerActive=true,ownerSchool=true}={}) {
  const board={id:16,created_by:OWNER,program_id:11,title:'2학년 2반',code:'ab12cd',roster:'',is_open:true,class_date:null,created_at:'x'};
  const post={id:21,board_id:16,storage_path:'board16/a.png',file_name:'a.png',mime:'image/png',student_name:'김하늘',content:'',hidden:true};
  const users=[
    {id:OWNER,name:'원장',username:'owner',role:'teacher',active:ownerActive},
    {id:VIEWER,name:'담임',username:'homeroom',role:'teacher',active:true},
    {id:7,name:'퇴직',username:'gone',role:'teacher',active:false},
  ];
  const settings=new Map();
  if(viewers.length)settings.set('sb:viewers:16',JSON.stringify(viewers));
  if(bound)settings.set('sb:config:16',JSON.stringify({career:{enabled:false,schoolId:SCHOOL},sessions:[]}));
  const effects={schoolChecks:[],writes:[],deletes:[],signed:0};
  const db={
    ready:async()=>{},getSettings:async()=>({site_open:true}),TS:s=>s,log:async()=>{},ACADEMY_ID:null,
    one:async(sql,args)=>{
      if(/FROM settings WHERE key ?= ?\$1/.test(sql)){const v=settings.get(args[0]);return v===undefined?null:{value:v};}
      if(sql.startsWith('SELECT * FROM boards'))return board;
      if(sql.startsWith('SELECT * FROM programs'))return {id:11,title:'AI 교재',published:true};
      if(sql.startsWith('SELECT * FROM board_posts'))return post;
      if(sql.includes('FROM users WHERE username'))return users.find(u=>u.username===args[0])||null;
      if(sql.includes('FROM users WHERE id = $1'))return users.find(u=>u.id===Number(args[0]))||null;
      throw new Error(sql);
    },
    q:async(sql,args)=>{
      if(sql.startsWith('INSERT INTO settings')){effects.writes.push(args);settings.set(args[0],args[1]);return [];}
      if(sql.startsWith('DELETE FROM settings WHERE key = $1')){effects.deletes.push(args[0]);settings.delete(args[0]);return [];}
      if(sql.includes("LIKE 'sb:viewers:%'"))return [...settings].filter(([k])=>k.startsWith('sb:viewers:')).map(([key,value])=>({key,value}));
      if(sql.includes('FROM boards b JOIN programs p')){
        const row={...board,program_title:'AI 교재',program_published:true,teacher_name:'원장',post_count:1,item_count:0};
        if(!sql.includes('WHERE'))return [row];
        return String(args[0])===String(OWNER)||args[1].map(String).includes('16')?[row]:[];
      }
      if(sql.includes('FROM users WHERE id = ANY'))return users.filter(u=>args[0].map(Number).includes(u.id));
      if(sql.startsWith('SELECT board_id, student_name'))return [];
      if(sql.includes('FROM board_posts'))return [post];
      if(sql.includes('FROM settings WHERE key=ANY'))return [];
      throw new Error(sql);
    },
  };
  const dependencies={
    'node:crypto':require('node:crypto'),'./db':db,'./password':{},'./cookies':{},'./worksheet-headers':require('../lib/worksheet-headers'),'./student-board':require('../lib/student-board'),
    './auth':{getSessionUser:async()=>({user:{id:userId,role}}),roleLevel:r=>r==='admin'?2:1},
    './storage':{storageEnabled:true,createSignedDownload:async()=>{effects.signed++;return 'https://storage.example/signed';},createSignedDownloads:async()=>new Map()},
    './student-accounts/http':{authorizeSchool:async(user)=>{
      effects.schoolChecks.push(user.id);
      // 수업을 연 선생님만 그 학교 담당자다
      if(user.id!==OWNER||!ownerSchool)throw Object.assign(new Error('학교 관리 권한이 없습니다.'),{status:403});
    }},
  };
  const module={exports:{}};
  vm.runInNewContext(source,{module,require:id=>{
    if(!(id in dependencies))throw new Error(`Unexpected module ${id}`);
    return dependencies[id];
  },process:{env:{}},Buffer,URL});
  let status,result,location;
  await module.exports.handleApi({method,headers:{host:'hub.example',origin:'https://hub.example'}},{
    setHeader(){},writeHead(s,h){status=s;location=h?.Location;},end(value){result=value?JSON.parse(value):null;},
  },path,body);
  return {status,result,location,settings,...effects};
}

test('함께 보는 선생님은 학교 담당자가 아니어도 제출물을 본다(보기 전용)',async()=>{
  const r=await call('GET','/api/boards/16/posts',{userId:VIEWER});
  assert.equal(r.status,200);
  assert.equal(r.result.viewOnly,true);
  assert.equal(r.result.manageable,false);
  assert.equal(r.result.posts.length,1);
  assert.deepEqual(r.schoolChecks,[OWNER],'보는 사람이 아니라 넘겨준 선생님의 학교 권한을 확인한다');
});

test('목록에 없는 선생님은 여전히 못 본다',async()=>{
  for(const path of ['/api/boards/16/posts','/api/boards/16/download-all','/api/posts/21/download']) {
    const r=await call('GET',path,{userId:STRANGER});
    assert.equal(r.status,403,path);
    assert.equal(r.signed,0,`${path} 서명 주소를 만들지 않는다`);
  }
});

test('함께 보는 선생님은 받기(전체·한 장)를 할 수 있다',async()=>{
  const all=await call('GET','/api/boards/16/download-all',{userId:VIEWER});
  assert.equal(all.status,200);
  assert.equal(all.result.count,1);
  const one=await call('GET','/api/posts/21/download/0',{userId:VIEWER});
  assert.equal(one.status,302);
  assert.equal(one.location,'https://storage.example/signed');
});

test('함께 보는 선생님은 공개·삭제·마감·함께 볼 사람 정하기를 못 한다',async()=>{
  for(const [method,path,body] of [
    ['PATCH','/api/posts/21',{hidden:false}],
    ['DELETE','/api/posts/21'],
    ['PATCH','/api/boards/16',{is_open:false}],
    ['DELETE','/api/boards/16'],
    ['GET','/api/boards/16/viewers'],
    ['POST','/api/boards/16/viewers',{username:'homeroom'}],
    ['DELETE',`/api/boards/16/viewers/${VIEWER}`],
  ]) {
    const r=await call(method,path,{userId:VIEWER,body});
    assert.ok(r.status===403,`${method} ${path} → ${r.status}`);
    assert.deepEqual(r.writes,[],`${method} ${path} 는 아무것도 쓰지 않는다`);
  }
});

test('수업을 연 선생님은 아이디로 함께 볼 선생님을 더하고 뺀다',async()=>{
  const add=await call('POST','/api/boards/16/viewers',{viewers:[],body:{username:'homeroom'}});
  assert.equal(add.status,200);
  assert.deepEqual(JSON.parse(add.settings.get('sb:viewers:16')),[VIEWER]);
  assert.deepEqual(add.result.viewers.map(v=>v.username),['homeroom']);
  const again=await call('POST','/api/boards/16/viewers',{body:{username:'homeroom'}});
  assert.deepEqual(JSON.parse(again.settings.get('sb:viewers:16')),[VIEWER],'두 번 더해도 한 번만');
  const remove=await call('DELETE',`/api/boards/16/viewers/${VIEWER}`);
  assert.equal(remove.status,200);
  assert.deepEqual(remove.deletes,['sb:viewers:16'],'마지막 사람을 빼면 설정 줄을 지운다');
  assert.deepEqual(remove.result.viewers,[]);
});

test('없는 아이디·쉬는 계정·수업을 연 사람 자신은 더하지 않는다',async()=>{
  for(const username of ['nobody','gone','owner','']) {
    const r=await call('POST','/api/boards/16/viewers',{viewers:[],body:{username}});
    assert.equal(r.status,400,username);
    assert.deepEqual(r.writes,[],username);
  }
});

test('함께 보는 선생님의 내 수업 목록에 그 수업이 함께 보기로 나온다',async()=>{
  const r=await call('GET','/api/my-boards',{userId:VIEWER});
  assert.equal(r.status,200);
  assert.deepEqual(r.result.boards.map(b=>[b.id,b.shared,b.mine]),[[16,true,false]]);
  assert.ok(!r.schoolChecks.includes(VIEWER),'보는 사람에게 학교 담당을 요구하지 않는다');
  const stranger=await call('GET','/api/my-boards',{userId:STRANGER});
  assert.deepEqual(stranger.result.boards,[]);
});

test('수업을 지울 때 함께 보기 설정도 지운다',()=>{
  assert.match(source,/\[`sb:config:\$\{id\}`, `sb:viewers:\$\{id\}`\]/);
});

test('넘겨준 선생님이 쉬는 계정이 되거나 학교 권한을 잃으면 함께 보기도 멈춘다',async()=>{
  for(const opts of [{ownerActive:false},{ownerSchool:false}]) {
    for(const path of ['/api/boards/16/posts','/api/boards/16/download-all','/api/posts/21/download']) {
      const r=await call('GET',path,{userId:VIEWER,...opts});
      assert.equal(r.status,403,`${JSON.stringify(opts)} ${path}`);
      assert.equal(r.signed,0);
    }
    const list=await call('GET','/api/my-boards',{userId:VIEWER,...opts});
    assert.deepEqual(list.result.boards,[],`${JSON.stringify(opts)} 내 수업 목록에서도 빠진다`);
  }
});

test('학교 권한을 잃은 선생님도 함께 보기를 거둘(빼기) 수 있다',async()=>{
  const r=await call('DELETE',`/api/boards/16/viewers/${VIEWER}`,{ownerSchool:false});
  assert.equal(r.status,200);
  assert.deepEqual(r.deletes,['sb:viewers:16']);
  const add=await call('POST','/api/boards/16/viewers',{ownerSchool:false,viewers:[],body:{username:'homeroom'}});
  assert.equal(add.status,403,'더하기는 여전히 학교 권한이 있어야 한다');
});
