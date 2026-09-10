import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const source=readFileSync(new URL('../public/student-board.js',import.meta.url),'utf8');
function ui({failOnce=false,storageBroken=false,uploadFails=false,careerEnabled=false,recordEnabled=false,careerState='not_requested',accountLinked=false,initialStatus=200,values=new Map()}={}){
  const nodes=new Map(),requests=[],posts=[],events=new Map();let html='',fail=failOnce,activePosts=0,maxActive=0,draftScope=randomUUID(),sessionStatus=initialStatus,holdRecords=false,releaseRecords,switchOnRecords=false;
  const listen=(name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},unlisten=(name,fn)=>events.get(name)?.delete(fn);
  const dispatch=async(name,event={})=>{await Promise.all([...events.get(name)||[]].map(fn=>fn(event)));};
  const esc=s=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
  function node(key){if(!nodes.has(key))nodes.set(key,{disabled:false,value:'',dataset:{},handlers:{},addEventListener(k,f){this.handlers[k]=f;},click(){return this.onclick?.()||this.handlers.click?.();},scrollIntoView(){},focus(){}});return nodes.get(key);}
  const tabButton={dataset:{scTab:'board'}},recordsButton={dataset:{scPage:'records'}},retryButton={dataset:{careerRetry:'71'}};
  const root={querySelector:node,querySelectorAll:sel=>({'[data-sc-tab]':[tabButton],'[data-sc-page]':[recordsButton],'[data-career-retry]':[retryButton]}[sel]||[])};
  const app={set innerHTML(v){html=v;for(const m of v.matchAll(/<(?:input|button|textarea)[^>]*id="([^"]+)"[^>]*>/g)){const n=node('#'+m[1]);n.disabled=/\bdisabled\b/.test(m[0]);const value=/\bvalue="([^"]*)"/.exec(m[0]);if(value)n.value=value[1];}}};
  const lesson={id:'lesson-1',title:'식물 관찰',minutes:40,bridge:'눈에 보이는 특징을 기록해요',record:{enabled:recordEnabled,completion:'특징을 기록하고 제출하세요'},submissions:{enabled:true,types:['photo','document','text'],sharing:'teacher'},materials:{links:[{id:9,kind:'aiapp',url:'https://app.test',label:'관찰 웹앱'}],files:[]}};
  const ctx={console,crypto:{randomUUID},URL,URLSearchParams,AbortController,setTimeout,clearTimeout,Date,File,document:{querySelector:()=>root,getElementById:id=>node('#'+id),createElement:()=>({click(){}}),visibilityState:'visible',addEventListener:listen,removeEventListener:unlisten},window:{addEventListener:listen,removeEventListener:unlisten},location:{hash:'#/board/abcd12'},$app:app,esc,icon:()=>'<svg></svg>',toast:()=>{},openImageLightbox(){},openStudentFile(){},careerMaterialUrl:l=>l.url,studentMaterialsHtml:()=>'<div>공유 자료</div>',confirm:()=>true,sessionStorage:{getItem:k=>{if(storageBroken)throw Error('blocked');return values.get(k)||null;},setItem:(k,v)=>{if(storageBroken)throw Error('blocked');values.set(k,v);},removeItem:k=>{if(storageBroken)throw Error('blocked');values.delete(k);}},fetch:async(path,opts)=>{
    const body=opts.body?JSON.parse(typeof opts.body==='string'?opts.body:'{}'):null;requests.push({path,method:opts.method,body});
    if(path.includes('/submissions'))return {ok:sessionStatus===200,status:sessionStatus,json:async()=>sessionStatus===200?({studentSession:{draftScope,accountLinked},course:{name:'관찰 수업',careerEnabled,activeSession:'lesson-1',sessions:[lesson]},posts:[...posts],next:null}):({error:'학생 계정으로 로그인하세요.'})};
    if(path.includes('/career-records?')){
      if(switchOnRecords){switchOnRecords=false;draftScope=randomUUID();}
      const result={studentSession:{draftScope,accountLinked},records:posts.filter(p=>p.careerStatus!=='not_requested').map(p=>({state:p.careerStatus,postId:p.id,recordId:p.careerStatus==='saved'?'88015fba-18ab-479a-893f-f8fd66bbeea5':null,record:{artifact:p.title,process:'민들레 특징을 관찰하고 기록함',occurred_at:p.created_at,raw_data:{submission:{session_title:'식물 관찰',content:p.content}}}})),next:null};
      if(holdRecords){holdRecords=false;await new Promise(resolve=>{releaseRecords=resolve;});}
      return {ok:true,json:async()=>result};
    }
    if(path.endsWith('/career-records/71/retry'))return {ok:true,json:async()=>({state:'pending'})};
    if(path.endsWith('/leave'))return {ok:true,json:async()=>({ok:true})};
    if(path.endsWith('/file-sign'))return {ok:true,json:async()=>({uploadId:'dcf764b3-aeff-4511-a03d-2c451c7d0508',uploadUrl:'https://storage.test/upload',mime:'image/png'})};
    if(path==='https://storage.test/upload')return {ok:!uploadFails};
    if(path.endsWith('/posts')){
      if(accountLinked&&body.draftScope!==draftScope)return {ok:false,status:409,json:async()=>({error:'학생 세션이 변경되었습니다.'})};
      activePosts++;maxActive=Math.max(activePosts,maxActive);await Promise.resolve();activePosts--;
      if(!posts.length)posts.push({id:71,student_name:body.student_name,title:body.title,content:body.content,mine:true,careerStatus:careerState,sessionTitle:'식물 관찰',created_at:'2026-09-06T00:00:00Z',visibility:'teacher'});
      if(fail){fail=false;throw new Error('network response lost');}
      return {ok:true,json:async()=>({ok:true,id:71,career:{state:careerState}})};
    }
    throw Error(path);
  }};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  return {ctx,node,requests,values,get html(){return html;},get maxActive(){return maxActive;},get draftScope(){return draftScope;},changeStudent(){draftScope=randomUUID();posts.length=0;},switchOnRecords(){switchOnRecords=true;},sessionFailure(status){sessionStatus=status;},holdRecords(){holdRecords=true;},async releaseRecords(){releaseRecords?.();await new Promise(r=>setTimeout(r,0));},pageHide(){return dispatch('pagehide');},pageShow(){return dispatch('pageshow',{persisted:true});},async hide(){ctx.document.visibilityState='hidden';await dispatch('visibilitychange');},async show(){ctx.document.visibilityState='visible';await dispatch('visibilitychange');},async open(){await ctx.renderStudentClass('abcd12',{board:{title:'우리 반 수업',code:'abcd12'}},'server-career-candidate');},async records(){recordsButton.onclick();await new Promise(r=>setTimeout(r,0));},retry(){return retryButton.onclick();},async board(){
    await ctx.renderStudentClass('abcd12',{board:{title:'우리 반 수업'}},'server-career-candidate');tabButton.onclick();
    await new Promise(r=>setTimeout(r,0));
  },fill(){node('#sc-name').oninput({target:{value:'학생 A'}});node('#sc-title').oninput({target:{value:'민들레 관찰'}});node('#sc-content').oninput({target:{value:'노란 꽃과 톱니 모양 잎'}});},send(){return node('#sc-form').handlers.submit({preventDefault(){}});}};
}
test('student screen renders lesson navigation and the three destinations without fake example submissions',async()=>{const u=ui();await u.open();for(const text of ['오늘 수업','내 제출물','내 진로기록','활동하기','자료·활동지','제출 게시판','관찰 웹앱'])assert.ok(u.html.includes(text));assert.ok(!u.html.includes('학생 A'));assert.ok(u.html.includes('게시판 제출만 받습니다'));});
test('submission board includes camera capture, file preview controls, teacher visibility and honest record state',async()=>{const u=ui();await u.board();for(const text of ['capture="environment"','내 결과물 올리기','sc-file-input','선생님에게 제출','게시판 제출'])assert.ok(u.html.includes(text));});
test('same snapshot/request ID retries after lost response; storage failures never leave the button saving',async()=>{const u=ui({failOnce:true,storageBroken:true});await u.board();u.fill();await u.send();assert.equal(u.node('#sc-submit').disabled,false);assert.ok(u.html.includes('같은 제출 다시 확인'));await u.send();const sent=u.requests.filter(r=>r.path.endsWith('/posts'));assert.equal(sent.length,2);assert.deepEqual(sent[0].body,sent[1].body);assert.match(sent[0].body.requestId,/^[a-f0-9-]{36}$/);assert.ok(u.html.includes('제출 완료!'));assert.equal(u.node('#sc-submit').disabled,false);});
test('double click creates only one in-flight submission and retains real student text',async()=>{const u=ui();await u.board();u.fill();await Promise.all([u.send(),u.send()]);assert.equal(u.requests.filter(r=>r.path.endsWith('/posts')).length,1);assert.equal(u.maxActive,1);assert.equal(u.requests.find(r=>r.path.endsWith('/posts')).body.content,'노란 꽃과 톱니 모양 잎');});
test('file upload failure does not submit a nonexistent attachment and permits retry',async()=>{const u=ui({uploadFails:true});await u.board();u.fill();u.node('#sc-file-input').handlers.change({target:{files:[new File(['PNG'],'photo.png',{type:'image/png'})]}});await u.send();assert.equal(u.requests.filter(r=>r.path.endsWith('/posts')).length,0);assert.equal(u.node('#sc-submit').disabled,false);assert.ok(u.html.includes('파일 업로드에 실패'));});
test('empty form cannot submit placeholder values',async()=>{const u=ui();await u.board();await u.send();assert.equal(u.requests.filter(r=>r.path.endsWith('/posts')).length,0);assert.ok(u.html.includes('이름·제목'));});
test('student titles, names and body are escaped in cards',()=>{const u=ui();const html=u.ctx.sbCard({id:1,mine:true,student_name:'<script>x</script>',title:'<img src=x onerror=x>',content:'<svg onload=x>',created_at:'2026-09-06',sessionTitle:'차시',visibility:'teacher'});assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;svg'));});
test('record connection requires both the board account setting and the lesson setting',async()=>{
  for(const options of [{careerEnabled:false,recordEnabled:true},{careerEnabled:true,recordEnabled:false}]){
    const u=ui(options);await u.board();assert.ok(u.html.includes('게시판 제출만 받습니다'));assert.ok(!u.html.includes('진로기록 제출 안내'));
  }
  const u=ui({careerEnabled:true,recordEnabled:true,accountLinked:true});await u.board();assert.ok(u.html.includes('진로기록 제출 안내'));assert.ok(u.html.includes('내 계정·전체 진로기록'));assert.ok(u.html.includes('로그아웃하고 수업 나가기'));
});
test('accepted Hub submission with a pending Edge receipt stays pending and retries the same record',async()=>{
  const u=ui({careerEnabled:true,recordEnabled:true,accountLinked:true,careerState:'pending'});await u.board();u.fill();await u.send();
  assert.ok(u.html.includes('제출은 완료되었어요'));assert.ok(!u.html.includes('진로기록 저장이 완료되었어요'));assert.equal(u.node('#sc-submit').disabled,false);
  await u.records();assert.ok(u.html.includes('진로기록 저장 대기'));assert.ok(u.html.includes('노란 꽃과 톱니 모양 잎'));assert.ok(!u.html.includes('저장 번호'));
  await u.retry();const retry=u.requests.find(r=>r.path.endsWith('/career-records/71/retry'));assert.equal(retry.body.draftScope,u.draftScope);assert.equal(u.requests.filter(r=>r.path.endsWith('/posts')).length,1);
});
test('only acknowledged saved receipts show a saved state and actual record ID',async()=>{
  const u=ui({careerEnabled:true,recordEnabled:true,accountLinked:true,careerState:'saved'});await u.board();u.fill();await u.send();assert.ok(u.html.includes('제출과 진로기록 저장이 완료되었어요'));
  await u.records();assert.ok(u.html.includes('진로기록 저장 완료'));assert.ok(u.html.includes('88015fba-18ab-479a-893f-f8fd66bbeea5'));assert.ok(!u.html.includes('같은 기록 저장 재시도'));
});
test('draft ownership follows the server scope and never replays another account or old board-only draft',async()=>{
  const values=new Map([['moakit-submission-draft:abcd12',JSON.stringify({snapshot:{student_name:'이전 학생',title:'다른 학생 결과',content:'이전 학생 비공개 내용',requestId:randomUUID()}})]]);
  const u=ui({failOnce:true,accountLinked:true,values});await u.board();assert.ok(!u.html.includes('이전 학생'));assert.equal(values.has('moakit-submission-draft:abcd12'),false);
  u.fill();await u.send();const first=u.requests.find(r=>r.path.endsWith('/posts'));assert.equal(first.body.draftScope,u.draftScope);assert.ok(values.has(`moakit-submission-draft:abcd12:${u.draftScope}`));
  u.changeStudent();await u.board();assert.ok(!u.html.includes('value="민들레 관찰"'));assert.ok(!u.html.includes('같은 제출 다시 확인'));assert.ok(!u.html.includes('학생 A'));
  u.fill();await u.send();const sent=u.requests.filter(r=>r.path.endsWith('/posts'));assert.notEqual(sent[0].body.draftScope,sent[1].body.draftScope);assert.notEqual(sent[0].body.requestId,sent[1].body.requestId);
});
test('leaving an account class calls the revoking leave endpoint and clears its stored draft',async()=>{
  const u=ui({failOnce:true,accountLinked:true});await u.board();u.fill();await u.send();const key=`moakit-submission-draft:abcd12:${u.draftScope}`;assert.ok(u.values.has(key));
  await u.node('#sc-leave').onclick();assert.equal(u.values.has(key),false);assert.equal(u.ctx.location.hash,'#/login');assert.equal(u.requests.filter(r=>r.path.endsWith('/leave')&&r.method==='POST').length,1);
});
test('a stale account tab discards its snapshot after server rejection and requires fresh confirmation',async()=>{
  const u=ui({accountLinked:true});await u.board();u.fill();u.changeStudent();await u.send();
  assert.ok(!u.html.includes('같은 제출 다시 확인'));assert.ok(!u.html.includes('value="민들레 관찰"'));assert.ok(!u.html.includes('학생 A'));assert.equal(u.node('#sc-submit').disabled,false);
  assert.ok(u.html.includes('학생 입장을 다시 확인'));await u.node('#sc-session-reload').handlers.click();
  u.fill();await u.send();const sent=u.requests.filter(r=>r.path.endsWith('/posts'));assert.notEqual(sent[0].body.draftScope,sent[1].body.draftScope);assert.equal(sent[1].body.draftScope,u.draftScope);
});
test('account-required board gives a safe login return link without accepting identity parameters',async()=>{
  const u=ui({initialStatus:401});await u.open();assert.ok(u.html.includes('학생 계정으로 로그인'));assert.ok(u.html.includes('/student-accounts.html?board=abcd12'));assert.ok(!u.html.includes('제출 중'));
  for(const code of ['https://evil.test','abcd12&student_id=fake','../app'])assert.equal(u.ctx.sbAccountUrl(code),'/student-accounts.html');
});
test('school connection controls require configured accounts and escape manager-scoped school names',()=>{
  const u=ui(),cfg={career:{enabled:false,schoolId:null}};
  const unavailable=u.ctx.sbCareerSettingsHtml(cfg,false,[]);assert.match(unavailable,/id="sbt-career"[^>]*disabled/);assert.ok(unavailable.includes('연결 설정이 준비되면'));
  const available=u.ctx.sbCareerSettingsHtml(cfg,true,[{id:randomUUID(),name:'<학교>'}]);assert.doesNotMatch(available,/id="sbt-career"[^>]*disabled/);assert.ok(available.includes('&lt;학교&gt;'));assert.ok(!available.includes('<학교>'));
});
test('failed session checks remove private records and cached drafts instead of leaving the previous student screen',async()=>{
  for(const status of [401,403]){
    const u=ui({accountLinked:true,careerState:'pending',failOnce:true});await u.board();u.fill();await u.send();await u.records();assert.ok(u.html.includes('노란 꽃과 톱니 모양 잎'));
    const draftKey=`moakit-submission-draft:abcd12:${u.draftScope}`;assert.ok(u.values.has(draftKey));
    u.sessionFailure(status);await u.records();assert.ok(u.html.includes('학생 입장을 다시 확인'));assert.ok(!u.html.includes('노란 꽃과 톱니 모양 잎'));assert.ok(!u.html.includes('value="민들레 관찰"'));assert.equal(u.values.has(draftKey),false);
  }
});
test('visibility return validates the new account before showing any private content',async()=>{
  const u=ui({accountLinked:true,careerState:'saved'});await u.board();u.fill();await u.send();await u.records();assert.ok(u.html.includes('노란 꽃과 톱니 모양 잎'));
  await u.hide();assert.ok(!u.html.includes('노란 꽃과 톱니 모양 잎'));assert.ok(u.html.includes('학생 세션을 확인'));
  u.changeStudent();await u.show();assert.ok(!u.html.includes('노란 꽃과 톱니 모양 잎'));assert.ok(!u.html.includes('88015fba-18ab-479a-893f-f8fd66bbeea5'));assert.ok(u.html.includes('아직 진로기록으로 제출한 활동이 없습니다'));
});
test('BFCache revalidation ignores a late record response from the previous student',async()=>{
  const u=ui({accountLinked:true,careerState:'saved'});await u.board();u.fill();await u.send();u.holdRecords();await u.records();assert.ok(u.html.includes('학생 세션을 확인'));
  await u.pageHide();u.changeStudent();await u.pageShow();assert.ok(!u.html.includes('노란 꽃과 톱니 모양 잎'));
  await u.releaseRecords();assert.ok(!u.html.includes('노란 꽃과 톱니 모양 잎'));assert.ok(!u.html.includes('88015fba-18ab-479a-893f-f8fd66bbeea5'));assert.ok(u.html.includes('아직 진로기록으로 제출한 활동이 없습니다'));
});
test('records fetched under a different account than their preflight are discarded',async()=>{
  const u=ui({accountLinked:true,careerState:'saved'});await u.board();u.fill();await u.send();u.switchOnRecords();await u.records();
  assert.ok(u.html.includes('학생 입장을 다시 확인'));assert.ok(!u.html.includes('노란 꽃과 톱니 모양 잎'));assert.ok(!u.html.includes('88015fba-18ab-479a-893f-f8fd66bbeea5'));
});
