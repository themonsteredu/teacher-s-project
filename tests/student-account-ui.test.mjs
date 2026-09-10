import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../public/student-accounts.js',import.meta.url),'utf8');
const helpers=['account-roster.js','account-manager.js'].map(name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function page(search=''){
  const elements=new Map(),pending=[],events={window:new Map(),document:new Map()};
  const on=(target,event,listener)=>{if(!events[target].has(event))events[target].set(event,[]);events[target].get(event).push(listener);};
  function element(tag='div'){
    return {tagName:tag,hidden:false,textContent:'',children:[],style:{},dataset:{},href:'/app',disabled:false,
      append(...children){this.children.push(...children);},replaceChildren(...children){this.children=[...children];},
      querySelector(){return element('button');},querySelectorAll(){return [];},reset(){},add(option){this.children.push(option);}};
  }
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  get('manager-pane').hidden=true;
  const document={getElementById:get,createElement:element,visibilityState:'visible',addEventListener:(event,listener)=>on('document',event,listener)};
  const context=vm.createContext({document,location:{search},URLSearchParams,
    window:{addEventListener:(event,listener)=>on('window',event,listener)},Option:function(){},confirm:()=>false,
    fetch:(url,options)=>new Promise(resolve=>pending.push({url,options,reply(data,status=200){resolve({ok:status<400,status,json:async()=>data});}}))});
  helpers.forEach(source=>vm.runInContext(source,context));
  vm.runInContext(script,context);
  return {elements,context,pending,get,document,dispatch:(target,event,value={})=>events[target].get(event)?.forEach(listener=>listener(value))};
}
test('class return link accepts all normal code formats and rejects external/internal paths',()=>{
  for(const code of ['ABCD12','abcd','123456','Ab12Cd3456'])assert.equal(page('?board='+code).get('return-board').href,'/app#/board/'+code);
  for(const code of ['//evil.example','../admin','a','abcdefghijk','ABCD?student_id=x','https://evil.example'])assert.equal(page('?board='+encodeURIComponent(code)).get('return-board').href,'/app');
});
test('saved timeline shows student output safely without storage paths or JSON field names',async()=>{
  const p=page('?board=ABCD12');p.pending.shift().reply({username:'student',mustChangePassword:false});await tick();
  assert.equal(p.pending[0].url,'/api/student-accounts/records');
  p.pending.shift().reply({username:'student',records:[{artifact:'관찰 카드',occurred_at:'2026-09-07T00:00:00Z',process:'식물을 관찰함',reflection:null,raw_data:{submission:{content:'<script>bad()</script>',attachment:{name:'관찰사진.jpg',storage_path:'private/original.jpg'}}}}],nextBefore:null});await tick();
  const texts=[];function visit(node){texts.push(node.textContent);node.children.forEach(visit);}visit(p.get('records'));
  assert.ok(texts.includes('관찰 카드'));assert.ok(texts.includes('<script>bad()</script>'));assert.ok(texts.includes('함께 제출한 파일: 관찰사진.jpg'));
  assert.ok(!texts.some(text=>text.includes('storage_path')||text.includes('private/original.jpg')));
  assert.equal(p.get('return-board').hidden,false);
});
test('logout discards a delayed record response from the previous student',async()=>{
  const p=page('?board=ABCD12');p.pending.shift().reply({username:'studentA',mustChangePassword:false});await tick();
  const old=p.pending.shift();
  const logout=p.get('logout').onclick();
  assert.equal(p.get('records-pane').hidden,true);
  old.reply({username:'studentA',records:[{artifact:'학생 A 비공개 결과',occurred_at:'2026-09-07T00:00:00Z',process:'이전 학생 활동'}],nextBefore:null});await tick();
  assert.equal(p.get('records').children.length,0);
  p.pending.shift().reply({ok:true});await tick();
  p.pending.shift().reply({error:'학생 로그인이 필요합니다.'},401);await logout;
  assert.equal(p.get('records-pane').hidden,true);assert.equal(p.get('return-board').hidden,true);
});
async function privatePage(){
  const p=page('?board=ABCD12');
  p.pending.shift().reply({username:'studentA',mustChangePassword:false});await tick();
  p.pending.shift().reply({username:'studentA',records:[{artifact:'학생 A 비공개 결과',occurred_at:'2026-09-07T00:00:00Z',process:'이전 학생 활동'}],nextBefore:'before-record'});await tick();
  assert.equal(p.get('records').children.length,1);assert.equal(p.get('account-name').textContent,'studentA');
  return p;
}
function privateStateCleared(p){
  assert.equal(p.get('records').children.length,0);
  assert.equal(p.get('records-pane').hidden,true);
  assert.equal(p.get('account-name').textContent,'');
  assert.equal(p.get('signed-in').hidden,true);
  assert.equal(p.get('password-form').hidden,true);
  assert.equal(p.get('return-board').hidden,true);
}
for(const status of [401,403])test(`record HTTP ${status} immediately removes already loaded student data`,async()=>{
  const p=await privatePage();
  const more=p.get('records-more').onclick();
  p.pending.shift().reply({error:'학생 세션을 다시 확인해 주세요.'},status);await more;
  privateStateCleared(p);assert.equal(p.get('login-form').hidden,false);
  assert.equal(p.get('message').textContent,'학생 세션을 다시 확인해 주세요.');
});
test('visibility return clears private state before account revalidation and rejects delayed old responses',async()=>{
  const p=await privatePage();
  const oldMore=p.get('records-more').onclick(),old=p.pending.shift();
  p.document.visibilityState='hidden';p.dispatch('document','visibilitychange');privateStateCleared(p);
  p.document.visibilityState='visible';p.dispatch('document','visibilitychange');privateStateCleared(p);
  assert.equal(p.pending[0].url,'/api/student-accounts/me');
  p.pending.shift().reply({username:'studentB',mustChangePassword:false});await tick();
  p.pending.shift().reply({username:'studentB',records:[{artifact:'학생 B 새 결과',occurred_at:'2026-09-07T01:00:00Z',process:'새 학생 활동'}],nextBefore:null});await tick();
  old.reply({username:'studentA',records:[{artifact:'학생 A 늦은 결과',occurred_at:'2026-09-07T00:00:00Z',process:'이전 학생 활동'}],nextBefore:null});await oldMore;
  assert.equal(p.get('account-name').textContent,'studentB');
  assert.equal(p.get('records').children.length,1);
  assert.equal(p.get('records').children[0].children[0].textContent,'학생 B 새 결과');
});
test('BFcache restoration removes cached identity and checks the current server session first',async()=>{
  const p=await privatePage();p.dispatch('window','pagehide');privateStateCleared(p);
  p.dispatch('window','pageshow',{persisted:true});privateStateCleared(p);
  assert.equal(p.pending[0].url,'/api/student-accounts/me');
  p.pending.shift().reply({error:'다시 로그인하세요.'},401);await tick();privateStateCleared(p);
});
test('a valid replacement account response clears the previous student even with zero new records',async()=>{
  const p=await privatePage();const more=p.get('records-more').onclick();
  p.pending.shift().reply({username:'studentB',records:[],nextBefore:null});await more;
  privateStateCleared(p);assert.match(p.get('message').textContent,/계정이 변경/);
  p.get('student-tab').onclick();assert.equal(p.pending[0].url,'/api/student-accounts/me');
  p.pending.shift().reply({username:'studentB',mustChangePassword:false});await tick();
  assert.equal(p.pending[0].url,'/api/student-accounts/records');
  p.pending.shift().reply({username:'studentB',records:[],nextBefore:null});await tick();
  assert.equal(p.get('account-name').textContent,'studentB');assert.equal(p.get('records').children.length,0);
});
test('refocusing a still-visible window clears data before revalidating an account changed elsewhere',async()=>{
  const p=await privatePage();assert.equal(p.document.visibilityState,'visible');
  p.dispatch('window','focus');privateStateCleared(p);
  assert.equal(p.pending[0].url,'/api/student-accounts/me');
  p.pending.shift().reply({error:'다시 로그인하세요.'},401);await tick();privateStateCleared(p);
});

