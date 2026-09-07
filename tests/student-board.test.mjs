import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);
const {createService,fileSpec,sameOrigin}=require('../lib/student-board');
const {parseCookies}=require('../lib/cookies');
const copy=x=>JSON.parse(JSON.stringify(x));
const enableRecords=f=>{f.cfg.sessions[0].record={mode:'submission',completion:'관찰 결과 제출',original:'학생이 작성한 관찰',process:'관찰 내용을 작성해 제출함'};f.setConfig();};

test('real submit service binds two activities to server random UUID and ignores client identity/evaluation',async()=>{
 const delivered=[];const f=fixture({deliverCareer:async(req,p)=>{delivered.push(copy(p));return{recordId:randomUUID(),storedAt:new Date().toISOString()};}});enableRecords(f);
 const req=await f.join(),res=f.response();req.headers.cookie+='; moakit_career_student_id='+randomUUID();
 const serverId=await f.api.identity(req,res,'abcd12');
 const a=await f.api.submit(req,res,'abcd12',f.body({student_id:randomUUID(),score:100,correct:false}));
 f.cfg.sessions.push({...copy(f.cfg.sessions[0]),id:'lesson-2',title:'비교하기'});f.setConfig();
 const b=await f.api.submit(req,res,'abcd12',f.body({sessionId:'lesson-2',content:'비교 근거를 작성했습니다.'}));
 assert.equal(a.career.state,'saved');assert.equal(b.career.state,'saved');assert.equal(delivered.length,2);assert.equal(delivered[0].student_id,serverId);assert.equal(delivered[1].student_id,serverId);assert.match(serverId,/^[a-f0-9]{8}-[a-f0-9]{4}-4/);assert.notEqual(delivered[0].source_event_id,delivered[1].source_event_id);
 assert.equal(delivered[0].raw_data.submission.content,'노란 꽃과 톱니 모양 잎');assert.equal(delivered[0].verification_status,null);assert.equal(delivered[0].reflection,null);assert.equal(delivered[0].raw_data.score,undefined);
 const records=await f.api.records(req,res,'abcd12');assert.equal(records.records.length,2);assert.equal(records.records[0].record.student_id,serverId);
 assert.equal((await f.api.teacherRecords(7,{id:3,role:'teacher'})).records[0].studentName,'학생');await assert.rejects(()=>f.api.teacherRecords(7,{id:99,role:'teacher'}),e=>e.status===403);
 const other=await f.join();assert.equal((await f.api.records(other,res,'abcd12')).records.length,0);await assert.rejects(()=>f.api.saveCareer(other,res,'abcd12',a.id),e=>e.status===403);
});
test('downstream lost response keeps post; retry retains exact snapshot and event UUID',async()=>{
 let lost=true;const payloads=[];const id=randomUUID();const f=fixture({deliverCareer:async(req,p)=>{payloads.push(copy(p));if(lost)throw Error('response lost');return{recordId:id,storedAt:'now'};}});enableRecords(f);const req=await f.join(),body=f.body();
 const first=await f.api.submit(req,f.response(),'abcd12',body);assert.equal(first.career.state,'pending');assert.equal(f.posts.length,1);
 f.cfg.sessions[0].record.process='변경된 수업 설정';f.setConfig();lost=false;
 const retry=await f.api.submit(req,f.response(),'abcd12',body);assert.equal(retry.id,first.id);assert.equal(retry.career.recordId,id);assert.deepEqual(payloads[0],payloads[1]);assert.equal(f.posts.length,1);
 await f.api.saveCareer(req,f.response(),'abcd12',first.id);assert.equal(payloads.length,2);
});
test('pending Career retries honor site/board/program switches and revoked student sessions',async()=>{
 const f=fixture({deliverCareer:async()=>{throw Error('offline');}});enableRecords(f);const req=await f.join(),res=f.response();const r=await f.api.submit(req,res,'abcd12',f.body());
 f.site='0';await assert.rejects(()=>f.api.saveCareer(req,res,'abcd12',r.id),e=>e.status===403);f.site='1';f.b.is_open=false;await assert.rejects(()=>f.api.saveCareer(req,res,'abcd12',r.id),e=>e.status===403);f.b.is_open=true;f.program.published=false;await assert.rejects(()=>f.api.saveCareer(req,res,'abcd12',r.id),e=>e.status===403);f.program.published=true;await f.api.leave(req,res,'abcd12');await assert.rejects(()=>f.api.saveCareer(req,res,'abcd12',r.id),e=>e.status===401);
 const next=await f.join();assert.equal((await f.api.records(next,res,'abcd12')).records.length,0);
});
test('photo snapshot uses independently archived original; another student cannot open it',async()=>{
 const f=fixture({deliverCareer:async()=>({recordId:randomUUID(),storedAt:'now'})});enableRecords(f);const req=await f.join(),res=f.response();
 f.storage.archiveSubmission=async upload=>({...upload,path:'career-originals/'+upload.path.split('/').pop()});
 const signed=await f.api.sign(req,res,'abcd12',{sessionId:'lesson-1',name:'관찰.png',size:20});const u=JSON.parse(f.settings.get(`sb:upload:7:${signed.uploadId}`));f.objects.set(u.path,{size:20,mime:'image/png'});
 const r=await f.api.submit(req,res,'abcd12',f.body({uploadId:signed.uploadId,content:''}));const rec=(await f.api.records(req,res,'abcd12')).records[0];assert.match(rec.record.raw_data.submission.attachment.storage_path,/^career-originals\//);
 f.posts.splice(0);assert.equal((await f.api.records(req,res,'abcd12')).records.length,1);assert.match((await f.api.recordFile(req,res,'abcd12',r.id)).url,/career-originals/);
 const other=await f.join();await assert.rejects(()=>f.api.recordFile(other,res,'abcd12',r.id),e=>e.status===403);
});
function fixture(options={}){
  const settings=new Map(),posts=[],locks=[],objects=new Map(),signed=[],materialWrites=[],b={id:7,program_id:11,created_by:3,code:'abcd12',is_open:true},program={published:true};
  let inTx=false,nextId=1,queue=Promise.resolve(),breakReceipt=false,site='1';
  const cfg={revision:null,variantId:'',name:'기본 수업',activeSession:'lesson-1',sessions:[{id:'lesson-1',title:'관찰하기',minutes:40,bridge:'',sourceLessons:['1'],assets:{},submissions:{enabled:true,types:['photo','document','text'],sharing:'teacher'}}]};
  const run=async(sql,a=[])=>{
    if(sql.startsWith('SELECT pg_advisory')){locks.push(a[0]);return[];}
    if(sql.startsWith('SELECT id FROM program_links'))return[];
    if(sql.startsWith('INSERT INTO program_links')){materialWrites.push({kind:a[1],url:a[3]});return[{id:100+materialWrites.length}];}
    if(sql.startsWith('SELECT id FROM program_files'))return a[0]==='55'&&a[1]===11?[{id:55}]:[];
    if(sql.startsWith('INSERT INTO board_items')){materialWrites.push({board:a[0],link:a[2],file:a[3]});return[];}
    if(sql.startsWith('SELECT value FROM settings')){const key=sql.includes("key='site_open'")?'site_open':a[0];const value=key==='site_open'?site:settings.get(key);return value===undefined?[]:[{value}];}
    if(sql.startsWith('INSERT INTO settings')){if(breakReceipt&&a[0].startsWith('sb:event:'))throw new Error('receipt write failed');settings.set(a[0],a[1]);return[];}
    if(sql.startsWith('DELETE FROM settings')){settings.delete(a[0]);return[];}
    if(sql.startsWith('SELECT id,title FROM lessons'))return[{id:1,title:'관찰하기'}];
    if(sql.startsWith('SELECT * FROM boards'))return b.isDeleted?[]:[copy(b)];
    if(sql.startsWith('SELECT b.id FROM boards'))return b.is_open&&program.published?[{id:b.id}]:[];
    if(sql.startsWith('SELECT count(*)'))return[{c:0}];
    if(sql.startsWith('INSERT INTO board_posts')){const [board_id,student_name,content,file_name,storage_path,mime,size,ip]=a;const p={id:nextId++,board_id,student_name,content,file_name,storage_path,mime,size,ip,hidden:true,created_at:'2026-09-06T02:00:00Z'};posts.push(p);return[{id:p.id}];}
    if(sql.startsWith('SELECT id FROM board_posts'))return posts.filter(p=>String(p.id)===String(a[0])&&String(p.board_id)===String(a[1])).map(p=>({id:p.id}));
    if(sql.startsWith('SELECT * FROM board_posts'))return posts.filter(p=>String(p.id)===String(a[0])&&(a[1]===undefined||String(p.board_id)===String(a[1]))).map(copy);
    if(sql.startsWith('UPDATE board_posts')){posts.find(p=>String(p.id)===String(a[1])).hidden=a[0];return[];}
    if(sql.startsWith("WITH career_posts")&&a.length===1)return [...settings].filter(([k,v])=>k.startsWith('sb:post:')&&JSON.parse(v).career?.payload.session_ref===a[0]).map(([key,value])=>({key,value}));
    if(sql.startsWith("WITH career_posts"))return [...settings].filter(([k,v])=>{const m=JSON.parse(v);return k.startsWith('sb:post:')&&m.owner===a[0]&&m.career?.payload.session_ref===a[1];}).map(([key,value])=>({key,value}));
    if(sql.startsWith('SELECT key,value FROM settings'))return a[0].filter(k=>settings.has(k)).map(key=>({key,value:settings.get(key)}));
    if(sql.startsWith('SELECT p.*, m.value AS submission_meta')){
      const [id,owner,lesson,mine,before,publicIds]=a;
      return posts.filter(p=>p.board_id===id).map(p=>({...copy(p),submission_meta:settings.get(`sb:post:${p.id}`)||null})).filter(p=>{const m=JSON.parse(p.submission_meta||'null');return ((!p.hidden&&(!m||publicIds.includes(m.sessionId)))||m?.owner===owner)&&(!lesson||m?.sessionId===lesson)&&(!mine||m?.owner===owner)&&(!before||p.id<Number(before));}).sort((a,b)=>b.id-a.id).slice(0,61);
    }
    throw new Error('Unmocked SQL: '+sql);
  };
  const c={q:run,one:async(s,a)=>(await run(s,a))[0]||null};
  const db={q:async(s,a)=>{assert.equal(inTx,false,'must not borrow a second pool client inside a transaction');return run(s,a);},one:async(s,a)=>{assert.equal(inTx,false,'must not borrow a second pool client inside a transaction');return c.one(s,a);},transaction:async work=>{
    const previous=queue;let release;queue=new Promise(r=>release=r);await previous;
    const oldSettings=new Map(settings),oldPosts=copy(posts);inTx=true;
    try{return await work(c);}catch(e){settings.clear();for(const [k,v]of oldSettings)settings.set(k,v);posts.splice(0,posts.length,...oldPosts);throw e;}finally{inTx=false;release();}
  }};
  const storage={storageEnabled:true,createSignedUpload:async path=>({uploadUrl:'https://storage.test/'+path}),inspectObject:async path=>{if(!objects.has(path))throw new Error('missing');return objects.get(path);},createSignedDownload:async path=>{signed.push(path);return'https://storage.test/private/'+path;}};
  const api=createService({db,storage,parseCookies,secure:true,...options,clientIp:()=> '192.0.2.1',openBoardByCode:async code=>code.toLowerCase()===b.code&&b.is_open&&program.published?{board:copy(b),program}:null,sharedMaterials:async()=>copy(f.shared)});
  function request(cookie='',url='/api/join-board/abcd12/submissions'){return {url,headers:{host:'hub.test',origin:'https://hub.test',cookie,'sec-fetch-site':'same-origin'}};}
  function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];}};}
  const f={api,settings,posts,locks,objects,signed,materialWrites,b,program,storage,cfg,shared:{links:[],files:[]},request,response,set site(v){site=v;},set failReceipt(v){breakReceipt=v;},async join(){const req=request(),res=response();await api.list(req,res,'ABCD12');req.headers.cookie=res.headers['Set-Cookie'].split(';')[0];return req;},body(extra={}){return{requestId:randomUUID(),sessionId:'lesson-1',student_name:'학생',title:'식물 관찰',content:'노란 꽃과 톱니 모양 잎',...extra};},setConfig(next=cfg){settings.set('sb:config:7',JSON.stringify(next));}};
  return f;
}
test('server issues opaque per-board cookie with protected flags; UUID/name never proves ownership',async()=>{const f=fixture(),res=f.response(),req=f.request('moakit_career_student_id='+randomUUID());await f.api.list(req,res,'abcd12');assert.match(res.headers['Set-Cookie'],/^moakit_submission_7=[a-f0-9]{64}; HttpOnly; SameSite=Strict;/);assert.match(res.headers['Set-Cookie'],/Secure/);const raw=res.headers['Set-Cookie'].split('=')[1].split(';')[0];assert.ok(![...f.settings.keys()].some(k=>k.includes(raw)));await assert.rejects(()=>f.api.submit(req,res,'abcd12',f.body()),e=>e.status===401);});
test('new submissions stay private; another same-named student cannot see or download them',async()=>{const f=fixture(),a=await f.join(),b=await f.join(),res=f.response();const r=await f.api.submit(a,res,'abcd12',f.body());assert.equal(f.posts[0].hidden,true);assert.equal((await f.api.list(a,res,'abcd12')).posts[0].mine,true);assert.equal((await f.api.list(b,res,'abcd12')).posts.length,0);f.posts[0].storage_path='board7/file.png';await assert.rejects(()=>f.api.file(b,res,'abcd12',r.id),e=>e.status===403);assert.equal(f.signed.length,0);});
test('network retry returns the existing post; modified snapshot with the same ID is rejected',async()=>{const f=fixture(),req=await f.join(),body=f.body();const first=await f.api.submit(req,f.response(),'abcd12',body);const retry=await f.api.submit(req,f.response(),'abcd12',body);assert.equal(retry.id,first.id);assert.equal(retry.replayed,true);assert.equal(f.posts.length,1);await assert.rejects(()=>f.api.submit(req,f.response(),'abcd12',{...body,content:'changed'}),e=>e.status===409);});
test('same event uses same advisory lock and a distinct event uses another lock',async()=>{const f=fixture(),req=await f.join(),body=f.body();await f.api.submit(req,f.response(),'abcd12',body);const first=f.locks[0];await f.api.submit(req,f.response(),'abcd12',body);assert.equal(f.locks.at(-1),first);const offset=f.locks.length;await f.api.submit(req,f.response(),'abcd12',f.body());assert.notEqual(f.locks[offset],first);});
test('failed receipt write rolls back the post, metadata and file-use marker',async()=>{const f=fixture(),req=await f.join();f.failReceipt=true;await assert.rejects(()=>f.api.submit(req,f.response(),'abcd12',f.body()),/receipt/);assert.equal(f.posts.length,0);assert.equal([...f.settings.keys()].filter(k=>k.startsWith('sb:post:')).length,0);});
test('teacher-only settings forbid publication; owning teacher can publish after enabling classroom sharing',async()=>{const f=fixture(),a=await f.join(),b=await f.join();const r=await f.api.submit(a,f.response(),'abcd12',f.body());await assert.rejects(()=>f.api.moderate(r.id,{id:8,role:'teacher'},false),e=>e.status===403);await assert.rejects(()=>f.api.moderate(r.id,{id:3,role:'teacher'},false),e=>e.status===403);f.cfg.sessions[0].submissions.sharing='class';f.setConfig();await f.api.moderate(r.id,{id:3,role:'teacher'},false);assert.equal((await f.api.list(b,f.response(),'abcd12')).posts.length,1);f.cfg.sessions[0].submissions.sharing='teacher';f.setConfig();assert.equal((await f.api.list(b,f.response(),'abcd12')).posts.length,0);});
test('attachment receipt binds owner, board and lesson; actual object must exist with expected size/type',async()=>{const f=fixture(),a=await f.join(),b=await f.join(),res=f.response();const sign=await f.api.sign(a,res,'abcd12',{sessionId:'lesson-1',name:'사진.png',size:20});assert.equal(sign.path,undefined);const receipt=JSON.parse(f.settings.get(`sb:upload:7:${sign.uploadId}`));const body=f.body({uploadId:sign.uploadId});await assert.rejects(()=>f.api.submit(b,res,'abcd12',body),e=>e.status===400);await assert.rejects(()=>f.api.submit(a,res,'abcd12',body),e=>e.status===502);f.objects.set(receipt.path,{size:21,mime:'image/png'});await assert.rejects(()=>f.api.submit(a,res,'abcd12',body),e=>e.status===400);f.objects.set(receipt.path,{size:20,mime:'image/png'});await f.api.submit(a,res,'abcd12',body);assert.equal(f.posts[0].file_name,'사진.png');assert.equal((await f.api.submit(a,res,'abcd12',body)).replayed,true);await assert.rejects(()=>f.api.submit(a,res,'abcd12',f.body({uploadId:sign.uploadId})),e=>e.status===400);});
test('forged arbitrary storage paths never become attachments',async()=>{const f=fixture(),a=await f.join();await f.api.submit(a,f.response(),'abcd12',f.body({path:'board7/stolen.pdf',file_name:'stolen.pdf'}));assert.equal(f.posts[0].storage_path,null);});
test('closed boards, unpublished programs and site switch block submission before insertion',async()=>{const f=fixture(),a=await f.join();f.b.is_open=false;await assert.rejects(()=>f.api.submit(a,f.response(),'abcd12',f.body()),e=>e.status===403);f.b.is_open=true;f.program.published=false;await assert.rejects(()=>f.api.submit(a,f.response(),'abcd12',f.body()),e=>e.status===403);f.program.published=true;f.site='0';await assert.rejects(()=>f.api.submit(a,f.response(),'abcd12',f.body()),e=>e.status===403);assert.equal(f.posts.length,0);});
test('expired session and leaving a closed class revoke access to my submissions',async()=>{const f=fixture(),a=await f.join();f.b.is_open=false;await f.api.leave(a,f.response(),'abcd12');f.b.is_open=true;await assert.rejects(()=>f.api.submit(a,f.response(),'abcd12',f.body()),e=>e.status===401);});
test('disabled lesson and disallowed submission type fail closed',async()=>{const f=fixture(),a=await f.join();f.cfg.sessions[0].submissions.enabled=false;f.setConfig();await assert.rejects(()=>f.api.submit(a,f.response(),'abcd12',f.body()),e=>e.status===403);f.cfg.sessions[0].submissions.enabled=true;f.cfg.sessions[0].submissions.types=['photo'];f.setConfig();await assert.rejects(()=>f.api.submit(a,f.response(),'abcd12',f.body()),e=>e.status===400);});
test('student material mapping exposes shared items only, excludes guides and other lessons',async()=>{const f=fixture(),req=await f.join();f.cfg.sessions[0].assets={app:{url:'https://a.test'},guide:{url:'https://teacher.test'}};f.cfg.sessions.push({...copy(f.cfg.sessions[0]),id:'second',assets:{app:{url:'https://b.test'}}});f.setConfig();f.shared.links=[{id:1,url:'https://a.test',kind:'aiapp'},{id:2,url:'https://b.test',kind:'aiapp'},{id:3,url:'https://teacher.test',kind:'link'}];const r=await f.api.list(req,f.response(),'abcd12');assert.deepEqual(r.course.sessions[0].materials.links.map(x=>x.id),[1]);assert.deepEqual(r.course.sessions[1].materials.links.map(x=>x.id),[2]);});
test('stale teacher settings do not overwrite current configuration or leak to another teacher',async()=>{const f=fixture();await assert.rejects(()=>f.api.settings(7,{id:8,role:'teacher'}),e=>e.status===403);const c=(await f.api.settings(7,{id:3,role:'teacher'})).config;const first=await f.api.saveSettings(7,{id:3,role:'teacher'},c);assert.ok(first.config.revision);await assert.rejects(()=>f.api.saveSettings(7,{id:3,role:'teacher'},c),e=>e.status===409);});
test('oversized, zero/negative size, active HTML and SVG uploads are rejected',()=>{for(const name of ['a.html','a.svg','../a.png','a.txt'])assert.throws(()=>fileSpec({name,size:10}),e=>e.status===400);for(const size of [0,-1,1.5,21*1024*1024,'10'])assert.throws(()=>fileSpec({name:'a.png',size}),e=>e.status===400);assert.equal(fileSpec({name:'활동지.PDF',size:10}).mime,'application/pdf');});
test('cross-origin requests cannot mutate using ambient cookies',()=>{for(const headers of [{host:'hub.test',origin:'https://evil.test'},{host:'hub.test'},{host:'hub.test',origin:'https://hub.test','sec-fetch-site':'cross-site'}])assert.throws(()=>sameOrigin({headers}),e=>e.status===403);});

test('concurrent retries acknowledge one committed post',async()=>{const f=fixture(),req=await f.join(),body=f.body();const results=await Promise.all([f.api.submit(req,f.response(),'abcd12',body),f.api.submit(req,f.response(),'abcd12',body)]);assert.equal(results[0].id,results[1].id);assert.equal(f.posts.length,1);assert.equal(results.filter(r=>r.replayed).length,1);});

test('teacher explicitly shares only planned student app/worksheet through existing material records',async()=>{const f=fixture();f.settings.set('course_plan:11',JSON.stringify({published:true,revision:'published-1',plan:{variants:[{id:'course',name:'집중 탐구',sessions:[{...f.cfg.sessions[0],assets:{app:{url:'https://student.test'},worksheet:{fileId:'55'},ppt:{url:'https://ppt.test'},guide:{url:'https://teacher.test'}}}]}]}}));const r=await f.api.saveSettings(7,{id:3,role:'teacher'},{revision:null,variantId:'course',shareStudentMaterials:true});assert.equal(r.config.planRevision,'published-1');assert.equal(f.materialWrites.length,3);assert.equal(f.materialWrites[0].kind,'aiapp');assert.equal(f.materialWrites[0].url,'https://student.test');assert.equal(f.materialWrites[2].file,55);assert.ok(!JSON.stringify(f.materialWrites).includes('teacher.test'));});
test('config selection without sharing consent does not grant material access',async()=>{const f=fixture();f.settings.set('course_plan:11',JSON.stringify({published:true,plan:{variants:[{id:'course',name:'선택 구성',sessions:[{...f.cfg.sessions[0],assets:{app:{url:'https://student.test'}}}]}]}}));await f.api.saveSettings(7,{id:3,role:'teacher'},{revision:null,variantId:'course'});assert.equal(f.materialWrites.length,0);});
