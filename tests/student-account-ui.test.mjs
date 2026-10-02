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


test('모아랩 진로 관찰 기록은 강점 칸을 제목으로 쓰지 않고 진로 강사가 본 내용으로 표시한다',async()=>{
  const p=page();p.pending.shift().reply({username:'student',mustChangePassword:false});await tick();
  p.pending.shift().reply({username:'student',records:[{
    id:'r1',occurred_at:'2026-09-11T00:00:00Z',source:'job',program_ref:'job-career-observation',
    process:'관제 시뮬레이터를 조작했습니다.',artifact:'절차를 단계로 쪼개 설명합니다.',reflection:'공항 견학을 권합니다.',
    raw_data:{job:{entry_kind:'career_observation',title:'항공 진로 체험 2회차',author_name:'김진로',deck_id:7,deck_title:'항공 모빌리티',
      observation:{activity:'관제 시뮬레이터를 조작했습니다.',strengths:'절차를 단계로 쪼개 설명합니다.',next_step:'공항 견학을 권합니다.'}}},
  }],nextBefore:null});await tick();
  const texts=[];function visit(node){texts.push(node.textContent);node.children.forEach(visit);}visit(p.get('records'));
  assert.equal(p.get('records').children[0].children[0].textContent,'항공 진로 체험 2회차','강점 칸이 제목이 되면 안 된다');
  assert.ok(texts.some(t=>t.includes('모아랩 진로 수업 · 진로 강사 관찰')));
  assert.equal(texts.some(t=>t.includes('선생님')),false,'관찰은 학교 선생님이 아니라 진로 강사가 쓴다');
  assert.ok(texts.includes('강사가 본 나의 강점·흥미: 절차를 단계로 쪼개 설명합니다.'));
  assert.ok(texts.includes('작성: 김진로'));
  assert.ok(texts.includes('웹앱: 항공 모빌리티'),'이어 둔 웹앱은 제목이 아니라 따로 보인다');
  assert.ok(texts.includes('추천받은 다음 활동: 공항 견학을 권합니다.'));
  assert.equal(texts.some(t=>t.startsWith('내가 남긴 생각')),false,'강사가 쓴 내용을 학생이 쓴 것처럼 보여주지 않는다');
});

test('정정된 진로 관찰 기록도 관찰 항목 이름표를 유지한다',async()=>{
  const p=page();p.pending.shift().reply({username:'student',mustChangePassword:false});await tick();
  p.pending.shift().reply({username:'student',records:[{
    id:'r2',occurred_at:'2026-09-11T00:00:00Z',source:'job',supersedes_id:'r1',program_ref:'job-career-observation',
    process:'고친 내용',artifact:'고친 강점',reflection:'고친 다음 활동',
    raw_data:{job:{entry_kind:'revision',observation_kind:'career_observation',title:'항공 진로 체험 2회차 (정정)',
      observation:{activity:'고친 내용',strengths:'고친 강점',next_step:'고친 다음 활동'}}},
  }],nextBefore:null});await tick();
  const texts=[];function visit(node){texts.push(node.textContent);node.children.forEach(visit);}visit(p.get('records'));
  assert.equal(p.get('records').children[0].children[0].textContent,'항공 진로 체험 2회차 (정정)');
  assert.ok(texts.includes('강사가 본 나의 강점·흥미: 고친 강점'));
  assert.equal(texts.some(t=>t.startsWith('내가 남긴 생각')),false);
  // 정정 표시가 종류 표시를 밀어내면 안 된다 — 둘 다 보여야 한다.
  const line=texts.find(t=>t.includes('담당자 정정'));
  assert.ok(line&&line.includes('진로 강사 관찰'),'정정된 관찰 기록도 관찰 기록임이 보여야 한다: '+line);
});

test('학교 수업 기록의 정정 표시는 예전 그대로 둔다',async()=>{
  const p=page();p.pending.shift().reply({username:'student',mustChangePassword:false});await tick();
  p.pending.shift().reply({username:'student',records:[{
    id:'r4',occurred_at:'2026-09-11T00:00:00Z',source:'hub',supersedes_id:'r0',
    artifact:'관찰 카드',process:'식물을 관찰함',raw_data:{},
  }],nextBefore:null});await tick();
  const texts=[];function visit(node){texts.push(node.textContent);node.children.forEach(visit);}visit(p.get('records'));
  const line=texts.find(t=>t.includes('담당자 정정'));
  assert.ok(line&&line.endsWith(' · 담당자 정정'));
  assert.equal(line.includes('모아랩'),false);
});

test('학생이 직접 쓴 기록은 예전처럼 "내가 남긴 생각"으로 보인다',async()=>{
  const p=page();p.pending.shift().reply({username:'student',mustChangePassword:false});await tick();
  p.pending.shift().reply({username:'student',records:[{
    id:'r3',occurred_at:'2026-09-11T00:00:00Z',source:'job',program_ref:'job-deck:7',
    process:'내가 한 활동',artifact:'내 결과물',reflection:'내 생각',
    raw_data:{job:{entry_kind:'student_reflection',deck_title:'역사 AI 수업'}},
  }],nextBefore:null});await tick();
  const texts=[];function visit(node){texts.push(node.textContent);node.children.forEach(visit);}visit(p.get('records'));
  assert.equal(p.get('records').children[0].children[0].textContent,'내 결과물');
  assert.ok(texts.includes('내가 남긴 생각: 내 생각'));
});

test('관찰 기록은 제목이 없어도 웹앱 이름을 제목으로 쓰지 않는다',async()=>{
  const p=page();p.pending.shift().reply({username:'student',mustChangePassword:false});await tick();
  p.pending.shift().reply({username:'student',records:[{
    id:'r5',occurred_at:'2026-09-11T00:00:00Z',source:'job',program_ref:'job-career-observation',
    process:'활동',artifact:'강점',reflection:'다음 활동',
    raw_data:{job:{entry_kind:'career_observation',deck_id:7,deck_title:'항공 모빌리티',observation:{activity:'활동',strengths:'강점',next_step:'다음 활동'}}},
  }],nextBefore:null});await tick();
  const texts=[];function visit(node){texts.push(node.textContent);node.children.forEach(visit);}visit(p.get('records'));
  assert.equal(p.get('records').children[0].children[0].textContent,'진로 관찰 기록');
  assert.ok(texts.includes('웹앱: 항공 모빌리티'));
  assert.equal(texts.some(t=>t.startsWith('작성:')),false,'작성자 이름이 없으면 줄을 만들지 않는다');
});

test('담당자 기록은 작성자를, 학생 글을 고친 정정본은 정정한 사람을 보여주고 학생 글에는 붙이지 않는다',async()=>{
  const p=page();p.pending.shift().reply({username:'student',mustChangePassword:false});await tick();
  p.pending.shift().reply({username:'student',records:[
    {id:'r6',occurred_at:'2026-09-12T00:00:00Z',source:'job',program_ref:'job-staff-record',process:'상담',artifact:'상담 기록',
      raw_data:{job:{entry_kind:'staff_record',title:'진로 상담',author_name:'김진로'}}},
    {id:'r7',occurred_at:'2026-09-11T00:00:00Z',source:'job',supersedes_id:'r3',program_ref:'job-deck:7',process:'고친 활동',artifact:'고친 결과물',reflection:'내 생각',
      raw_data:{job:{entry_kind:'revision',deck_id:7,deck_title:'역사 AI 수업',revised_by:'moakit-lab:1',author_name:'김진로'}}},
    {id:'r8',occurred_at:'2026-09-10T00:00:00Z',source:'job',program_ref:'job-deck:7',process:'내 활동',artifact:'내 결과물',reflection:'내 생각',
      raw_data:{job:{entry_kind:'student_reflection',deck_title:'역사 AI 수업',author_name:'끼어든 이름'}}},
  ],nextBefore:null});await tick();
  const lines=[...p.get('records').children].map(article=>article.children.map(node=>node.textContent));
  assert.ok(lines[0].includes('작성: 김진로'));
  assert.ok(lines[1].includes('정정: 김진로'));assert.equal(lines[1].includes('작성: 김진로'),false);
  assert.equal(lines[1].some(t=>t.startsWith('웹앱:')),false,'웹앱 줄은 관찰 기록에만 붙는다');
  assert.equal(lines[2].some(t=>t.startsWith('작성:')||t.startsWith('정정:')),false,'학생이 쓴 기록에는 쓴 사람 줄을 붙이지 않는다');
});

test('정정본은 처음 쓴 사람을 지키고 고친 사람을 따로 보여준다 — 학생 글을 고친 정정본은 고친 사람만',async()=>{
  const p=page();p.pending.shift().reply({username:'student',mustChangePassword:false});await tick();
  p.pending.shift().reply({username:'student',records:[
    // 진로 강사가 쓴 관찰 기록을 관리자가 고친 정정본
    {id:'r9',occurred_at:'2026-09-14T00:00:00Z',source:'job',supersedes_id:'r1',program_ref:'job-career-observation',process:'고친 활동',artifact:'고친 강점',
      raw_data:{job:{entry_kind:'revision',observation_kind:'career_observation',title:'항공 진로 체험',author_name:'김진로',revised_by:'moakit-lab:1',revised_by_name:'모아킷 관리자',
        observation:{activity:'고친 활동',strengths:'고친 강점',next_step:''}}}},
    // 담당자 기록(상담)의 정정본 — entry_kind 가 'revision' 이라 program_ref 로 담당자 기록임을 안다
    {id:'r10',occurred_at:'2026-09-13T00:00:00Z',source:'job',supersedes_id:'r6',program_ref:'job-staff-record',process:'고친 상담',artifact:'상담 기록',
      raw_data:{job:{entry_kind:'revision',title:'진로 상담',author_name:'김진로',revised_by:'moakit-lab:1',revised_by_name:'모아킷 관리자'}}},
    // 학생이 쓴 웹앱 기록을 담당자가 고친 정정본 — 쓴 사람 이름이 없다
    {id:'r11',occurred_at:'2026-09-12T00:00:00Z',source:'job',supersedes_id:'r3',program_ref:'job-deck:7',process:'고친 활동',artifact:'내 결과물',reflection:'내 생각',
      raw_data:{job:{entry_kind:'revision',deck_id:7,deck_title:'역사 AI 수업',revised_by:'moakit-lab:1',revised_by_name:'모아킷 관리자'}}},
  ],nextBefore:null});await tick();
  const lines=[...p.get('records').children].map(article=>article.children.map(node=>node.textContent));
  assert.ok(lines[0].includes('작성: 김진로 · 정정: 모아킷 관리자'),'관찰 기록을 고쳐도 쓴 사람은 진로 강사다');
  assert.ok(lines[1].includes('작성: 김진로 · 정정: 모아킷 관리자'),'담당자 기록의 정정본도 같다');
  assert.ok(lines[2].includes('정정: 모아킷 관리자'));
  assert.equal(lines[2].some(t=>t.startsWith('작성:')),false,'학생이 쓴 기록에 담당자를 쓴 사람으로 붙이지 않는다');
});
