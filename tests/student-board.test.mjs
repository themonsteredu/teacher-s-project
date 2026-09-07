import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);
const {createService,fileSpec,sameOrigin}=require('../lib/student-board');
const {parseCookies}=require('../lib/cookies');
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const accounts=new Map(),deliveries=[],recordIds=new Map(),schoolId=randomUUID();
  const settings=new Map(),posts=[],locks=[],objects=new Map(),signed=[],materialWrites=[],b={id:7,program_id:11,created_by:3,code:'abcd12',is_open:true},program={published:true};
  let inTx=false,nextId=1,queue=Promise.resolve(),breakReceipt=false,site='1',deliveryFails=false,accountAvailable=true,manager=true;
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
    if(sql.startsWith('SELECT key,value FROM settings'))return a[0].filter(k=>settings.has(k)).map(key=>({key,value:settings.get(key)}));
    if(sql.startsWith('WITH career_posts')){
      return [...settings.entries()].filter(([key])=>/^sb:post:[1-9][0-9]*$/.test(key)).map(([key,value])=>({key,value})).filter(({key,value})=>{const m=JSON.parse(value);return sql.includes("->>'accountId'=$1") ? m.accountId===a[0]&&m.career?.payload.session_ref===a[1]&&(!a[2]||Number(key.slice(8))<Number(a[2])) : m.career?.payload.session_ref===a[0];}).sort((x,y)=>Number(y.key.slice(8))-Number(x.key.slice(8))).slice(0,61);
    }
    if(sql.startsWith('SELECT p.*, m.value AS submission_meta')){
      const [id,owner,lesson,mine,before,publicIds,accountId='']=a;
      return posts.filter(p=>p.board_id===id).map(p=>({...copy(p),submission_meta:settings.get(`sb:post:${p.id}`)||null})).filter(p=>{const m=JSON.parse(p.submission_meta||'null'),owns=m?.accountId ? m.accountId===accountId : !accountId&&m?.owner===owner;return ((!p.hidden&&(!m||publicIds.includes(m.sessionId)))||owns)&&(!lesson||m?.sessionId===lesson)&&(!mine||owns)&&(!before||p.id<Number(before));}).sort((a,b)=>b.id-a.id).slice(0,61);
    }
    throw new Error('Unmocked SQL: '+sql);
  };
  const c={q:run,one:async(s,a)=>(await run(s,a))[0]||null};
  const db={q:async(s,a)=>{assert.equal(inTx,false,'must not borrow a second pool client inside a transaction');return run(s,a);},one:async(s,a)=>{assert.equal(inTx,false,'must not borrow a second pool client inside a transaction');return c.one(s,a);},transaction:async work=>{
    const previous=queue;let release;queue=new Promise(r=>release=r);await previous;
    const oldSettings=new Map(settings),oldPosts=copy(posts);inTx=true;
    try{return await work(c);}catch(e){settings.clear();for(const [k,v]of oldSettings)settings.set(k,v);posts.splice(0,posts.length,...oldPosts);throw e;}finally{inTx=false;release();}
  }};
  const storage={storageEnabled:true,createSignedUpload:async path=>({uploadUrl:'https://storage.test/'+path}),inspectObject:async path=>{if(!objects.has(path))throw new Error('missing');return objects.get(path);},createSignedDownload:async path=>{signed.push(path);return'https://storage.test/private/'+path;},archiveSubmission:async upload=>({...upload,path:'career-originals/'+upload.path.split('/').pop()})};
  const accountError=(status)=>{const e=Error('account denied');e.status=status;throw e;};
  const resolveStudent=async req=>{if(!req.accountToken)return null;const account=accounts.get(req.accountToken);if(!accountAvailable)accountError(503);if(!account||account.revoked||new Date(account.expiresAt).getTime()<=Date.now())accountError(401);return copy(account);};
  const authorizeStudent=async(req,school)=>{const account=await resolveStudent(req);if(!account)accountError(401);if(!account.schools.includes(school)||account.mustChangePassword)accountError(403);return account;};
  const api=createService({db,storage,resolveStudent,authorizeStudent,authorizeSchool:async(user,school)=>{if(!accountAvailable)accountError(503);if(!manager||!user||school!==schoolId)accountError(403);},careerAvailable:()=>accountAvailable,logoutStudent:async req=>{if(req.accountToken&&accounts.has(req.accountToken))accounts.get(req.accountToken).revoked=true;},deliverCareer:async(req,payload)=>{deliveries.push(copy(payload));if(deliveryFails)throw Error('temporary Edge failure');if(!recordIds.has(payload.source_event_id))recordIds.set(payload.source_event_id,randomUUID());return{recordId:recordIds.get(payload.source_event_id),storedAt:new Date().toISOString()};},parseCookies,secure:true,clientIp:()=> '192.0.2.1',openBoardByCode:async code=>code.toLowerCase()===b.code&&b.is_open&&program.published?{board:copy(b),program}:null,sharedMaterials:async()=>copy(f.shared)});
  function request(cookie='',url='/api/join-board/abcd12/submissions'){return {url,headers:{host:'hub.test',origin:'https://hub.test',cookie,'sec-fetch-site':'same-origin'}};}
  function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];}};}
  const f={api,accounts,deliveries,recordIds,schoolId,settings,posts,locks,objects,signed,materialWrites,b,program,storage,cfg,shared:{links:[],files:[]},request,response,set site(v){site=v;},set failReceipt(v){breakReceipt=v;},set deliveryFails(v){deliveryFails=v;},set accountAvailable(v){accountAvailable=v;},set manager(v){manager=v;},
  account(extra={}){const token=randomUUID(),account={accountId:randomUUID(),careerStudentId:randomUUID(),sessionHash:randomUUID(),expiresAt:new Date(Date.now()+3600000).toISOString(),mustChangePassword:false,schools:[schoolId],...extra};accounts.set(token,account);return token;},
  async refresh(req){const res=response(),r=await api.list(req,res,'ABCD12');const cookies=res.headers['Set-Cookie'];if(cookies)req.headers.cookie=(Array.isArray(cookies)?cookies.at(-1):cookies).split(';')[0];req.draftScope=r.studentSession.draftScope;return r;},
  async join(token){const req=request();req.accountToken=token;await f.refresh(req);return req;},
  bodyFor(req,extra={}){return f.body({draftScope:req.draftScope,...extra});},
  enableCareer(){cfg.career={enabled:true,schoolId};cfg.sessions[0].record={mode:'submission',process:'식물의 특징을 관찰하고 결과를 제출함',completion:'관찰 결과 제출',original:'학생 입력과 첨부 원본'};f.setConfig();},body(extra={}){return{requestId:randomUUID(),sessionId:'lesson-1',student_name:'학생',title:'식물 관찰',content:'노란 꽃과 톱니 모양 잎',...extra};},setConfig(next=cfg){settings.set('sb:config:7',JSON.stringify(next));}};
  return f;
}
test('server issues opaque per-board cookie with protected flags; UUID/name never proves ownership',async()=>{const f=fixture(),res=f.response(),req=f.request('moakit_career_student_id='+randomUUID());await f.api.list(req,res,'abcd12');assert.match(res.headers['Set-Cookie'],/^moakit_submission_7=[a-f0-9]{64}; HttpOnly; SameSite=Strict;/);assert.match(res.headers['Set-Cookie'],/Secure/);const raw=res.headers['Set-Cookie'].split('=')[1].split(';')[0];assert.ok(![...f.settings.keys()].some(k=>k.includes(raw)));await assert.rejects(()=>f.api.submit(req,res,'abcd12',f.body()),e=>e.status===401);});
test('new submissions stay private; another same-named student cannot see or download them',async()=>{const f=fixture(),a=await f.join(),b=await f.join(),res=f.response();const r=await f.api.submit(a,res,'abcd12',f.body());assert.equal(f.posts[0].hidden,true);assert.equal((await f.api.list(a,res,'abcd12')).posts[0].mine,true);assert.equal((await f.api.list(b,res,'abcd12')).posts.length,0);f.posts[0].storage_path='board7/file.png';await assert.rejects(()=>f.api.file(b,res,'abcd12',r.id),e=>e.status===403);assert.equal(f.signed.length,0);});
test('network retry returns the existing post; modified snapshot with the same ID is rejected',async()=>{const f=fixture(),req=await f.join(),body=f.body();const first=await f.api.submit(req,f.response(),'abcd12',body);const retry=await f.api.submit(req,f.response(),'abcd12',body);assert.equal(retry.id,first.id);assert.equal(retry.replayed,true);assert.equal(f.posts.length,1);await assert.rejects(()=>f.api.submit(req,f.response(),'abcd12',{...body,content:'changed'}),e=>e.status===409);});
test('same event uses same advisory lock and a distinct event uses another lock',async()=>{const f=fixture(),req=await f.join(),body=f.body();await f.api.submit(req,f.response(),'abcd12',body);const first=f.locks[0],retryOffset=f.locks.length;await f.api.submit(req,f.response(),'abcd12',body);assert.equal(f.locks[retryOffset],first);const offset=f.locks.length;await f.api.submit(req,f.response(),'abcd12',f.body());assert.notEqual(f.locks[offset],first);});
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


test('ordinary guest submissions stay usable but never fabricate a Career UUID or record',async()=>{
 const f=fixture();f.cfg.sessions[0].record={mode:'submission',process:'학생 기록',completion:'제출',original:'입력'};f.setConfig();
 const req=await f.join(),r=await f.api.submit(req,f.response(),'abcd12',f.bodyFor(req,{student_id:randomUUID()}));
 assert.equal(r.career.state,'not_requested');assert.equal(f.deliveries.length,0);
 const identity=await f.api.joinContext(req,f.response(),'abcd12');assert.equal(identity.careerStudentId,null);assert.equal(identity.accountLinked,false);
 for(const [key,value]of f.settings)if(key.startsWith('sb:session:'))assert.equal(JSON.parse(value).careerStudentId,undefined);
});
test('account activity A and B retain server account UUID and ignore supplied UUID/name/code',async()=>{
 const f=fixture();f.enableCareer();f.cfg.sessions.push({...copy(f.cfg.sessions[0]),id:'lesson-2',title:'비교하기'});f.setConfig();
 const token=f.account(),req=await f.join(token),student=f.accounts.get(token).careerStudentId;
 const a=await f.api.submit(req,f.response(),'abcd12',f.bodyFor(req,{student_id:randomUUID()}));
 const b=await f.api.submit(req,f.response(),'abcd12',f.bodyFor(req,{sessionId:'lesson-2',student_name:'다른 표시명'}));
 assert.equal(a.career.state,'saved');assert.equal(b.career.state,'saved');assert.notEqual(a.career.recordId,b.career.recordId);
 assert.deepEqual(f.deliveries.map(p=>p.student_id),[student,student]);assert.notEqual(student,f.accounts.get(token).accountId);
 assert.equal(f.deliveries[0].reflection,null);assert.equal(f.deliveries[0].verification_status,null);
 assert.deepEqual((await f.api.records(req,f.response(),'abcd12')).records.map(r=>r.record.student_id),[student,student]);
});
test('school-bound class rejects guests, wrong school, initial password and inactive account',async()=>{
 const f=fixture();f.enableCareer();
 await assert.rejects(()=>f.join(),e=>e.status===401);
 await assert.rejects(()=>f.join(f.account({schools:[randomUUID()]})),e=>e.status===403);
 await assert.rejects(()=>f.join(f.account({mustChangePassword:true})),e=>e.status===403);
 await assert.rejects(()=>f.join(f.account({revoked:true})),e=>e.status===401);
 assert.equal(f.posts.length,0);assert.equal(f.deliveries.length,0);
});
test('teacher must manage the chosen school and a bound board cannot change school or silently become public',async()=>{
 const f=fixture(),teacher={id:3,role:'teacher'},body={...copy(f.cfg),career:{enabled:true,schoolId:f.schoolId}};
 f.manager=false;await assert.rejects(()=>f.api.saveSettings(7,teacher,body),e=>e.status===403);
 f.manager=true;const first=await f.api.saveSettings(7,teacher,body);
 await assert.rejects(()=>f.api.saveSettings(7,teacher,{...first.config,career:{enabled:true,schoolId:randomUUID()}}),e=>e.status===409);
 const paused=await f.api.saveSettings(7,teacher,{...first.config,career:{enabled:false,schoolId:null}});
 assert.equal(paused.config.career.schoolId,f.schoolId);assert.equal(paused.config.career.enabled,false);
 await assert.rejects(()=>f.join(),e=>e.status===401);
 f.manager=false;await assert.rejects(()=>f.api.teacherRecords(7,teacher),e=>e.status===403);
});
test('shared tablet login switch rotates ownership and stale A draft cannot submit as B',async()=>{
 const f=fixture(),aToken=f.account(),bToken=f.account(),req=await f.join(aToken),oldScope=req.draftScope;
 const original=await f.api.submit(req,f.response(),'abcd12',f.bodyFor(req));
 req.accountToken=bToken;
 await assert.rejects(()=>f.api.submit(req,f.response(),'abcd12',f.body({draftScope:oldScope})),e=>e.status===401);
 const current=await f.refresh(req);assert.notEqual(req.draftScope,oldScope);assert.equal(current.posts.length,0);
 await assert.rejects(()=>f.api.submit(req,f.response(),'abcd12',f.body({draftScope:oldScope})),e=>e.status===409);
 f.posts[0].storage_path='board7/private.png';await assert.rejects(()=>f.api.file(req,f.response(),'abcd12',original.id),e=>e.status===403);
 req.accountToken=undefined;const guest=await f.refresh(req);assert.equal(guest.posts.length,0);assert.equal(guest.studentSession.accountLinked,false);
});
test('fresh session for the same account can retrieve own private work without adopting another account cookie',async()=>{
 const f=fixture();f.enableCareer();const firstToken=f.account(),a=await f.join(firstToken);
 await f.api.submit(a,f.response(),'abcd12',f.bodyFor(a));
 const nextToken=f.account({...f.accounts.get(firstToken),sessionHash:randomUUID()}),fresh=await f.join(nextToken);
 assert.notEqual(fresh.draftScope,a.draftScope);assert.equal((await f.api.list(fresh,f.response(),'abcd12')).posts[0].mine,true);
 assert.equal((await f.api.records(fresh,f.response(),'abcd12')).records.length,1);
 const other=await f.join(f.account());assert.equal((await f.api.records(other,f.response(),'abcd12')).records.length,0);
});
test('pending Career retries keep immutable payload/event, survive new account session and deduplicate concurrent retries',async()=>{
 const f=fixture();f.enableCareer();f.deliveryFails=true;const token=f.account(),a=await f.join(token),body=f.bodyFor(a);
 const first=await f.api.submit(a,f.response(),'abcd12',body);assert.equal(first.career.state,'pending');const original=copy(f.deliveries[0]);
 f.deliveryFails=false;const next=f.account({...f.accounts.get(token),sessionHash:randomUUID()}),fresh=await f.join(next);
 const retries=await Promise.all([f.api.saveCareer(fresh,f.response(),'abcd12',first.id,{draftScope:fresh.draftScope}),f.api.saveCareer(fresh,f.response(),'abcd12',first.id,{draftScope:fresh.draftScope})]);
 assert.equal(retries[0].recordId,retries[1].recordId);assert.equal(f.posts.length,1);assert.equal(f.recordIds.size,1);
 assert.deepEqual(f.deliveries,[original,original]);
});
test('retry revalidates live school membership and all board/program/site gates before Edge delivery',async()=>{
 const f=fixture();f.enableCareer();f.deliveryFails=true;const token=f.account(),req=await f.join(token),first=await f.api.submit(req,f.response(),'abcd12',f.bodyFor(req));
 f.deliveryFails=false;const body={draftScope:req.draftScope};
 f.accounts.get(token).schools=[];await assert.rejects(()=>f.api.saveCareer(req,f.response(),'abcd12',first.id,body),e=>e.status===403);f.accounts.get(token).schools=[f.schoolId];
 f.b.is_open=false;await assert.rejects(()=>f.api.saveCareer(req,f.response(),'abcd12',first.id,body),e=>e.status===403);f.b.is_open=true;
 f.program.published=false;await assert.rejects(()=>f.api.saveCareer(req,f.response(),'abcd12',first.id,body),e=>e.status===403);f.program.published=true;
 f.site='0';await assert.rejects(()=>f.api.saveCareer(req,f.response(),'abcd12',first.id,body),e=>e.status===403);f.site='1';
 f.cfg.career.enabled=false;f.setConfig();await assert.rejects(()=>f.api.saveCareer(req,f.response(),'abcd12',first.id,body),e=>e.status===403);
 assert.equal(f.deliveries.length,1);assert.equal(f.recordIds.size,0);
});
test('expired student account blocks list, private file and retry; leaving revokes account on closed board',async()=>{
 const f=fixture();f.enableCareer();const token=f.account(),req=await f.join(token),first=await f.api.submit(req,f.response(),'abcd12',f.bodyFor(req));
 f.accounts.get(token).expiresAt=new Date(Date.now()-1).toISOString();
 await assert.rejects(()=>f.api.list(req,f.response(),'abcd12'),e=>e.status===401);
 await assert.rejects(()=>f.api.recordFile(req,f.response(),'abcd12',first.id),e=>e.status===401);
 await assert.rejects(()=>f.api.saveCareer(req,f.response(),'abcd12',first.id,{draftScope:req.draftScope}),e=>e.status===401);
 f.b.is_open=false;await f.api.leave(req,f.response(),'abcd12');assert.equal(f.accounts.get(token).revoked,true);
});
test('Career attachment retains independent original after ordinary board submission deletion',async()=>{
 const f=fixture();f.enableCareer();const req=await f.join(f.account()),res=f.response(),upload=await f.api.sign(req,res,'abcd12',{draftScope:req.draftScope,sessionId:'lesson-1',name:'활동.png',size:20});
 const receipt=JSON.parse(f.settings.get(`sb:upload:7:${upload.uploadId}`));f.objects.set(receipt.path,{size:20,mime:'image/png'});
 const first=await f.api.submit(req,res,'abcd12',f.bodyFor(req,{uploadId:upload.uploadId}));f.posts.splice(0);
 assert.match((await f.api.recordFile(req,res,'abcd12',first.id)).url,/career-originals/);
 assert.equal((await f.api.records(req,res,'abcd12')).records.length,1);
});


test('Career record response identifies the current draft scope without exposing account authentication',async()=>{
 const f=fixture();f.enableCareer();const token=f.account(),req=await f.join(token),account=f.accounts.get(token);
 await f.api.submit(req,f.response(),'abcd12',f.bodyFor(req));
 const result=await f.api.records(req,f.response(),'abcd12');
 assert.deepEqual(result.studentSession,{accountLinked:true,draftScope:req.draftScope});
 const context=JSON.stringify(result.studentSession);
 for(const secret of [token,account.sessionHash,account.accountId,account.careerStudentId,req.headers.cookie])assert.ok(!context.includes(secret));
 const nextToken=f.account({...account,sessionHash:randomUUID()}),next=await f.join(nextToken);
 const refreshed=await f.api.records(next,f.response(),'abcd12');
 assert.notEqual(refreshed.studentSession.draftScope,result.studentSession.draftScope);
 assert.equal(refreshed.records[0].record.student_id,result.records[0].record.student_id);
});

test('same-origin activity context requires an existing bound board session and exposes no Career UUID',async()=>{
 const f=fixture();f.enableCareer();f.shared.links=[{url:'/lessons/초2-인공지능/3차시-학생용-감각짝맞추기.html',lesson_id:1}];const token=f.account(),req=f.request();req.accountToken=token;
 await assert.rejects(()=>f.api.activityContext(req,f.response(),'abcd12'),e=>e.status===401);
 const joined=await f.join(token);joined.url='/api/join-board/abcd12/science-career?session_id=lesson-1';const context=await f.api.activityContext(joined,f.response(),'abcd12');
 assert.deepEqual(context,{accountLinked:true,draftScope:joined.draftScope,sessionId:'lesson-1'});
 assert.ok(!JSON.stringify(context).includes(f.accounts.get(token).careerStudentId));
 f.cfg.career.enabled=false;f.setConfig();await assert.rejects(()=>f.api.activityContext(joined,f.response(),'abcd12'),e=>e.status===403);
});
test('activity writes reject missing/stale scope, switched accounts and cross-origin cookies',async()=>{
 const f=fixture();f.enableCareer();f.shared.links=[{url:'/lessons/초2-인공지능/3차시-학생용-감각짝맞추기.html',lesson_id:1}];const a=await f.join(f.account());
 for(const draftScope of [undefined,randomUUID()])await assert.rejects(()=>f.api.authorizeActivity(a,f.response(),'abcd12',{draftScope,session_id:'lesson-1'}),e=>e.status===409);
 const who=await f.api.authorizeActivity(a,f.response(),'abcd12',{draftScope:a.draftScope,session_id:'lesson-1'});assert.equal(who.careerStudentId,f.accounts.get(a.accountToken).careerStudentId);
 const old=a.draftScope;a.accountToken=f.account();await assert.rejects(()=>f.api.authorizeActivity(a,f.response(),'abcd12',{draftScope:old,session_id:'lesson-1'}),e=>e.status===401);
 await f.refresh(a);await assert.rejects(()=>f.api.authorizeActivity(a,f.response(),'abcd12',{draftScope:old,session_id:'lesson-1'}),e=>e.status===409);
 a.headers.origin='https://evil.test';await assert.rejects(()=>f.api.authorizeActivity(a,f.response(),'abcd12',{draftScope:a.draftScope,session_id:'lesson-1'}),e=>e.status===403);
});
test('Science follows the selected lesson material and recording gates, not merely the active lesson',async()=>{
 const f=fixture();f.enableCareer();f.shared.links=[{url:'/lessons/초2-인공지능/3차시-학생용-감각짝맞추기.html',lesson_id:1}];
 f.cfg.sessions.push({...copy(f.cfg.sessions[0]),id:'lesson-2',sourceLessons:['2']});f.cfg.activeSession='lesson-2';f.setConfig();
 const req=await f.join(f.account()),body={draftScope:req.draftScope,session_id:'lesson-1'};
 assert.equal((await f.api.authorizeActivity(req,f.response(),'abcd12',body)).activitySessionId,'lesson-1');
 await assert.rejects(()=>f.api.authorizeActivity(req,f.response(),'abcd12',{...body,session_id:'lesson-2'}),e=>e.status===403);
 await assert.rejects(()=>f.api.authorizeActivity(req,f.response(),'abcd12',{...body,session_id:'unknown'}),e=>e.status===400);
 f.cfg.sessions[0].record.mode='none';f.setConfig();await assert.rejects(()=>f.api.authorizeActivity(req,f.response(),'abcd12',body),e=>e.status===403);
 f.cfg.sessions[0].record.mode='submission';f.cfg.sessions[0].submissions.enabled=false;f.setConfig();await assert.rejects(()=>f.api.authorizeActivity(req,f.response(),'abcd12',body),e=>e.status===403);
 f.cfg.sessions[0].submissions.enabled=true;f.cfg.sessions[0].submissions.types=['photo'];f.setConfig();await assert.rejects(()=>f.api.authorizeActivity(req,f.response(),'abcd12',body),e=>e.status===400);
});
