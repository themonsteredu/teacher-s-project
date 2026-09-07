import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const source=readFileSync(new URL('../public/student-board.js',import.meta.url),'utf8');
function ui({failOnce=false,storageBroken=false,uploadFails=false}={}){
  const nodes=new Map(),requests=[],values=new Map(),posts=[];let html='',fail=failOnce,activePosts=0,maxActive=0;
  const esc=s=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
  function node(key){if(!nodes.has(key))nodes.set(key,{disabled:false,value:'',dataset:{},handlers:{},addEventListener(k,f){this.handlers[k]=f;},click(){return this.onclick?.()||this.handlers.click?.();},scrollIntoView(){},focus(){}});return nodes.get(key);}
  const root={querySelector:node,querySelectorAll:()=>[]};
  const app={set innerHTML(v){html=v;for(const m of v.matchAll(/<(?:input|button|textarea)[^>]*id="([^"]+)"[^>]*>/g)){const n=node('#'+m[1]);n.disabled=/\bdisabled\b/.test(m[0]);const value=/\bvalue="([^"]*)"/.exec(m[0]);if(value)n.value=value[1];}}};
  const lesson={id:'lesson-1',title:'식물 관찰',minutes:40,bridge:'눈에 보이는 특징을 기록해요',submissions:{enabled:true,types:['photo','document','text'],sharing:'teacher'},materials:{links:[{id:9,kind:'aiapp',url:'https://app.test',label:'관찰 웹앱'}],files:[]}};
  const ctx={console,crypto:{randomUUID},URL,URLSearchParams,AbortController,setTimeout,clearTimeout,Date,File,document:{querySelector:()=>root,getElementById:id=>node('#'+id),createElement:()=>({click(){}})},window:{addEventListener(){},removeEventListener(){}},location:{hash:'#/board/abcd12'},$app:app,esc,icon:()=>'<svg></svg>',toast:()=>{},openImageLightbox(){},openStudentFile(){},careerMaterialUrl:l=>l.url,studentMaterialsHtml:()=>'<div>공유 자료</div>',confirm:()=>true,sessionStorage:{getItem:k=>{if(storageBroken)throw Error('blocked');return values.get(k)||null;},setItem:(k,v)=>{if(storageBroken)throw Error('blocked');values.set(k,v);},removeItem:k=>{if(storageBroken)throw Error('blocked');values.delete(k);}},fetch:async(path,opts)=>{
    const body=opts.body?JSON.parse(typeof opts.body==='string'?opts.body:'{}'):null;requests.push({path,method:opts.method,body});
    if(path.includes('/submissions'))return {ok:true,json:async()=>({course:{name:'관찰 수업',activeSession:'lesson-1',sessions:[lesson]},posts:[...posts],next:null})};
    if(path.endsWith('/file-sign'))return {ok:true,json:async()=>({uploadId:'dcf764b3-aeff-4511-a03d-2c451c7d0508',uploadUrl:'https://storage.test/upload',mime:'image/png'})};
    if(path==='https://storage.test/upload')return {ok:!uploadFails};
    if(path.endsWith('/posts')){
      activePosts++;maxActive=Math.max(activePosts,maxActive);await Promise.resolve();activePosts--;
      if(!posts.length)posts.push({id:71,student_name:body.student_name,title:body.title,content:body.content,mine:true,sessionTitle:'식물 관찰',created_at:'2026-09-06T00:00:00Z',visibility:'teacher'});
      if(fail){fail=false;throw new Error('network response lost');}
      return {ok:true,json:async()=>({ok:true,id:71})};
    }
    throw Error(path);
  }};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  return {ctx,node,requests,values,get html(){return html;},get maxActive(){return maxActive;},async open(){await ctx.renderStudentClass('abcd12',{board:{title:'우리 반 수업',code:'abcd12'}},'server-career-candidate');},async board(){// use the same rendered tab listener through a small real selector collection
    const b={dataset:{scTab:'board'}};root.querySelectorAll=sel=>sel==='[data-sc-tab]'?[b]:[];
    await ctx.renderStudentClass('abcd12',{board:{title:'우리 반 수업'}},'server-career-candidate');b.onclick();
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
