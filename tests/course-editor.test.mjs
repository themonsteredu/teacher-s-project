import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/course-editor.js',import.meta.url),'utf8');
const curriculum=readFileSync(new URL('../public/curriculum.js',import.meta.url),'utf8');
const authoring=readFileSync(new URL('../public/course-authoring.js',import.meta.url),'utf8');

// A small event fixture, not a browser/layout test. Parse rendered controls so
// missing selectors or handlers bound to another lesson fail here.
const decode=s=>String(s??'').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
function element(tag='root',attrs={}){
  const el={tag,attrs,children:[],textContent:'',disabled:'disabled' in attrs,checked:'checked' in attrs,hidden:'hidden' in attrs,dataset:Object.fromEntries(Object.entries(attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v])),
    scrollIntoView(){},focus(){this.focused=true;},setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return this.attrs[k]??null;},addEventListener(k,fn){this['on'+k]=fn;},remove(){this.removed=true;},
    querySelector(s){return this.querySelectorAll(s)[0]||null;},
    querySelectorAll(selector){const all=[];const walk=n=>{for(const c of n.children){all.push(c);walk(c);}};walk(this);return all.filter(n=>selector.split(',').some(s=>matches(n,s.trim().split(/\s+/).at(-1))));}
  };
  Object.defineProperty(el,'value',{get(){if(this._value!==undefined)return this._value;if(this.tag==='select'){const opts=this.querySelectorAll('option');return (opts.find(o=>'selected' in o.attrs)||opts[0])?.value??'';}return this.attrs.value??(this.tag==='textarea'||this.tag==='option'?this.textContent:'');},set(v){this._value=String(v);}});
  Object.defineProperty(el,'selectedOptions',{get(){return this.querySelectorAll('option').filter(o=>'selected' in o.attrs);}});
  Object.defineProperty(el,'innerHTML',{get(){return this._html||'';},set(value){this._html=value;this.children=parse(value);}});
  return el;
}
function matches(el,selector){
  if(selector.endsWith(':checked')){if(!el.checked)return false;selector=selector.slice(0,-8);}
  const id=selector.match(/#([\w-]+)/)?.[1];if(id&&el.attrs.id!==id)return false;
  const cls=selector.match(/\.([\w-]+)/)?.[1];if(cls&&!String(el.attrs.class||'').split(/\s+/).includes(cls))return false;
  const tag=selector.match(/^[\w-]+/)?.[0];if(tag&&el.tag!==tag)return false;
  for(const a of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)){if(!(a[1] in el.attrs)||(a[2]!==undefined&&el.attrs[a[1]]!==a[2]))return false;}
  return true;
}
function parse(html){
  const root=element(),stack=[root];
  for(const part of html.matchAll(/<\/?[^>]+>|[^<]+/g)){
    const token=part[0];if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}if(token.startsWith('<!'))continue;
    if(token[0]!=='<'){stack.at(-1).textContent+=decode(token);continue;}
    const tag=token.match(/^<([\w-]+)/)?.[1];if(!tag)continue;
    const attrs={};for(const a of token.slice(tag.length+1,-1).matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attrs[a[1]]=decode(a[2]??a[3]??a[4]??'');
    const node=element(tag,attrs);stack.at(-1).children.push(node);if(!['input','br','hr','img','meta','link'].includes(tag))stack.push(node);
  }return root.children;
}
function ui({lessons=[{id:1,title:'원본 활동'}],initialPlan=null}={}){
  let html='',saved={revision:initialPlan?'initial':null,plan:initialPlan},fail=false,root=element(),modal=null;const routes=[],calls=[],toasts=[];
  const program={id:71,title:'수업 제목',description:'소개',grade:'초5'};
  const node=selector=>{const found=root.querySelector(selector);assert.ok(found,`rendered control ${selector}`);return found;};
  const ctx={Map,Object,Array,String,Number,crypto:{randomUUID},window:{addEventListener(){}},location:{hash:'#/manage/71'},GRADES:['초5'],isAdmin:()=>true,esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),route:(pattern,fn)=>routes.push({pattern,fn}),confirm:()=>true,toast:(...args)=>toasts.push(args),document:{getElementById:id=>root.querySelector('#'+id),querySelector:s=>s==='.course-editor'?root:root.querySelector(s),querySelectorAll:s=>root.querySelectorAll(s)},shell:(title,content)=>{html=content;root=element();root.innerHTML=content;},openModal:content=>{modal=element();modal.innerHTML=content;return modal;},api:async(method,path,body)=>{calls.push({method,path,body});if(path.endsWith('/course-plan')){if(method==='PUT'){if(fail)throw new Error('검증용 네트워크 오류');saved={revision:randomUUID(),plan:structuredClone(body.plan)};}return structuredClone(saved);}if(method==='PATCH')Object.assign(program,body);return{program:{...program},lessons,files:[],links:[]};}};
  vm.createContext(ctx);vm.runInContext(curriculum,ctx);vm.runInContext(authoring,ctx);vm.runInContext(source,ctx);
  return{open:()=>routes[0].fn('71'),node,all:s=>root.querySelectorAll(s),get html(){return html;},get saved(){return saved;},get modal(){return modal;},calls,toasts,fail(value=true){fail=value;},click(s){const n=node(s);assert.equal(n.disabled,false,`${s} must be enabled`);assert.equal(typeof n.onclick,'function',`${s} click handler`);return n.onclick({target:n});},input(s,value){const n=node(s);n.value=value;assert.equal(typeof n.oninput,'function',`${s} input handler`);return n.oninput({target:n});},change(s,value){const n=node(s);if(typeof value==='boolean')n.checked=value;else n.value=value;assert.equal(typeof n.onchange,'function',`${s} change handler`);return n.onchange({target:n});}};
}
const lessons=[{id:1,title:'문제 발견'},{id:2,title:'증거 조사'},{id:3,title:'결과 발표'}];
const title=i=>`[data-session="${i}"][data-field="title"]`;
const record=(i,field)=>`[data-record="${i}"][data-field="${field}"]`;

test('four registration steps show one selected lesson with materials, submissions and record settings together',async()=>{
  const u=ui({lessons});await u.open();assert.equal(u.all('[data-step]').length,4);assert.equal(u.node('#ce-step-0').hidden,false);
  u.click('[data-step="1"]');assert.equal(u.node('#ce-step-0').hidden,true);assert.equal(u.node('#ce-step-1').hidden,false);assert.equal(u.node('#ce-lesson-workspace').hidden,false);
  assert.equal(u.all('[data-session][data-field="title"]').length,1);assert.equal(u.node(title(0)).value,'문제 발견');assert.equal(u.all('[data-asset]').length,4);assert.equal(u.all('[data-record]').length,4);assert.ok(u.node('[data-sub-enabled="0"]'));
  for(const label of ['학생 웹앱','수업 PPT','활동지','교안'])assert.ok(u.html.includes(label));assert.ok(!u.html.includes('class="ce-sidebar"'));
  u.click('[data-step="2"]');assert.equal(u.node('#ce-lesson-workspace').hidden,true);assert.equal(u.node('#ce-step-2').hidden,false);
  u.click('[data-step="3"]');assert.equal(u.node('#ce-step-3').hidden,false);assert.equal(u.node('#ce-next').disabled,true);
});

test('lesson and step navigation preserve all edits; quick save stays in the current step',async()=>{
  const u=ui({lessons});await u.open();u.input('#ce-title','한 번 입력한 수업명');u.click('[data-step="1"]');
  u.input(title(0),'학생 관찰');u.input('[data-session="0"][data-field="minutes"]','45');u.input('[data-session="0"][data-field="bridge"]','제공된 관찰 사진부터 시작');
  u.input(record(0,'mode'),'submission');u.input(record(0,'completion'),'활동지 사진과 설명 제출');u.input(record(0,'original'),'학생이 작성한 관찰 내용');u.input(record(0,'process'),'식물의 특징을 관찰하고 기록함');
  u.change('[data-sub-type="0:document"]',false);u.change('[data-sub-sharing="0"]','class');
  u.click('[data-asset="0:worksheet"]');u.modal.querySelector('#ca-url').value='https://example.test/observation.pdf';u.modal.querySelector('#ca-apply').onclick();
  u.click('[data-lesson="1"]');u.input(title(1),'학생 비교');u.change('#ce-lesson-select','0');assert.equal(u.node(title(0)).value,'학생 관찰');assert.equal(u.node(record(0,'process')).value,'식물의 특징을 관찰하고 기록함');
  u.click('[data-step="0"]');assert.equal(u.node('#ce-title').value,'한 번 입력한 수업명');u.click('[data-step="1"]');await u.click('#ce-quick-save');
  assert.equal(u.node('#ce-step-1').hidden,false);assert.match(u.node('#ce-message').textContent,/저장했습니다/);const s=u.saved.plan.variants[0].sessions[0];assert.equal(s.minutes,45);assert.equal(s.bridge,'제공된 관찰 사진부터 시작');assert.equal(s.assets.worksheet.url,'https://example.test/observation.pdf');assert.deepEqual(s.submissions.types,['photo','text']);assert.equal(s.submissions.sharing,'class');assert.equal(s.record.process,'식물의 특징을 관찰하고 기록함');assert.equal(u.saved.plan.variants[0].sessions[1].title,'학생 비교');
  await u.open();u.click('[data-step="1"]');assert.equal(u.node(title(0)).value,'학생 관찰');
});

test('mobile add, reorder and remove keep the intended lesson active with focus on its editor',async()=>{
  const u=ui({lessons});await u.open();u.click('[data-step="1"]');u.click('[data-lesson="1"]');assert.equal(u.node(title(1)).focused,true);u.input(title(1),'선택한 조사 활동');u.click('[data-move="1"][data-direction="-1"]');assert.equal(u.node(title(0)).value,'선택한 조사 활동');assert.equal(u.node(title(0)).focused,true);
  u.click('#ce-add-session-mobile');assert.equal(u.node(title(3)).value,'');u.input(title(3),'추가 실험');u.click('[data-move="3"][data-direction="-1"]');assert.equal(u.node(title(2)).value,'추가 실험');assert.equal(u.node(title(2)).focused,true);u.click('[data-remove="2"]');assert.equal(u.all('[data-session][data-field="title"]').length,1);assert.equal(u.all('[data-lesson]').length,3);await u.click('#ce-quick-save');assert.deepEqual(u.saved.plan.variants[0].sessions.map(s=>s.title),['선택한 조사 활동','문제 발견','결과 발표']);
});

test('copying selected original lessons creates an independently editable alternative and preserves source',async()=>{
  const u=ui({lessons});await u.open();u.click('[data-step="1"]');u.click('[data-lesson="2"]');u.input(record(2,'process'),'결과를 설명함');u.click('[data-step="2"]');u.click('#ce-add-variant');
  const modal=u.modal;modal.querySelector('#cv-name').value='2차시 집중';modal.querySelectorAll('[data-cv-lesson]')[1].checked=false;modal.querySelector('#cv-add').onclick();
  assert.equal(u.node('#ce-step-2').hidden,false);assert.equal(u.node(title(0)).value,'문제 발견');u.input(title(0),'제공 자료로 문제 발견');u.input('[data-session="0"][data-field="bridge"]','생략한 조사는 교사가 제공');u.click('[data-lesson="1"]');assert.equal(u.node(record(1,'process')).value,'결과를 설명함');u.input(record(1,'process'),'요약 자료를 비교하고 설명함');
  u.click('[data-step="1"]');assert.equal(u.node(title(0)).value,'문제 발견');assert.equal(u.node('#ce-delete-variant').disabled,true);u.click('[data-step="2"]');u.click('[data-lesson="1"]');assert.equal(u.node(record(1,'process')).value,'요약 자료를 비교하고 설명함');await u.click('#ce-quick-save');
  assert.equal(u.saved.plan.variants.length,2);assert.equal(u.saved.plan.variants[0].sessions.length,3);assert.equal(u.saved.plan.variants[0].sessions[2].record.process,'결과를 설명함');assert.equal(u.saved.plan.variants[1].sessions.length,2);assert.equal(u.saved.plan.variants[1].sessions[0].bridge,'생략한 조사는 교사가 제공');
});

test('save failure keeps the edited lesson and releases saving state for a successful retry',async()=>{
  const u=ui({lessons});await u.open();u.click('[data-step="1"]');u.click('[data-lesson="1"]');u.input(title(1),'다시 저장할 활동');u.fail();await u.click('#ce-quick-save');assert.equal(u.node('#ce-message').textContent,'검증용 네트워크 오류');assert.equal(u.node('#ce-quick-save').disabled,false);assert.equal(u.node(title(1)).value,'다시 저장할 활동');u.fail(false);await u.click('#ce-quick-save');assert.equal(u.saved.plan.variants[0].sessions[1].title,'다시 저장할 활동');assert.equal(u.node('#ce-step-1').hidden,false);
});

test('turning off student submissions disables recording without discarding the written activity guidance',async()=>{
  const u=ui();await u.open();u.click('[data-step="1"]');u.input(record(0,'mode'),'submission');u.input(record(0,'process'),'학생이 관찰 결과를 기록함');assert.equal(u.node('#ce-record-fields').hidden,false);
  u.change('[data-sub-enabled="0"]',false);assert.equal(u.node(record(0,'mode')).disabled,true);assert.equal(u.node(record(0,'mode')).value,'none');assert.equal(u.node('#ce-submission-fields').hidden,true);assert.equal(u.node('#ce-record-fields').hidden,true);await u.click('#ce-quick-save');assert.equal(u.saved.plan.variants[0].sessions[0].record.mode,'none');assert.equal(u.saved.plan.variants[0].sessions[0].record.process,'학생이 관찰 결과를 기록함');
  u.change('[data-sub-enabled="0"]',true);assert.equal(u.node(record(0,'mode')).disabled,false);assert.equal(u.node(record(0,'mode')).value,'none');u.input(record(0,'mode'),'submission');assert.equal(u.node(record(0,'process')).value,'학생이 관찰 결과를 기록함');
});

test('returning from preview edits the reviewed alternative rather than the previously selected one',async()=>{
  const u=ui();await u.open();u.click('[data-step="2"]');
  for(const name of ['오전 구성','오후 구성']){u.click('#ce-add-variant');u.modal.querySelector('#cv-name').value=name;u.modal.querySelector('#cv-add').onclick();u.input(title(0),name+'의 활동');}
  u.click('[data-step="3"]');u.change('#ce-review-variant','1');u.click('#ce-previous');assert.equal(u.node('#ce-step-2').hidden,false);assert.equal(u.node('#ce-variant-name').value,'오전 구성');assert.equal(u.node(title(0)).value,'오전 구성의 활동');
  u.click('[data-step="3"]');u.change('#ce-review-variant','2');u.click('#ce-previous');assert.equal(u.node('#ce-variant-name').value,'오후 구성');assert.equal(u.node(title(0)).value,'오후 구성의 활동');
});

test('the last submission type cannot be removed or hidden in an unsavable state',async()=>{
  const u=ui();await u.open();u.click('[data-step="1"]');u.change('[data-sub-type="0:photo"]',false);u.change('[data-sub-type="0:document"]',false);u.change('[data-sub-type="0:text"]',false);assert.equal(u.node('[data-sub-type="0:text"]').checked,true);assert.match(u.toasts.at(-1)[0],/하나 이상/);
  u.change('[data-sub-enabled="0"]',false);await u.click('#ce-quick-save');assert.deepEqual(u.saved.plan.variants[0].sessions[0].submissions.types,['text']);assert.equal(u.saved.plan.variants[0].sessions[0].submissions.enabled,false);assert.match(u.node('#ce-message').textContent,/저장했습니다/);
});

test('publication missing required program title is blocked before API persistence',async()=>{
  const u=ui();await u.open();u.input('#ce-title','');u.click('[data-step="3"]');await u.click('#ce-publish');assert.match(u.node('#ce-message').textContent,/수업명을 입력/);assert.equal(u.saved.plan,null);assert.equal(u.calls.filter(c=>c.method==='PUT').length,0);
});


test('curriculum connections save explicit grade-subject pairs, topic and test purpose without duplicating lessons',async()=>{
  const u=ui({lessons});await u.open();
  assert.equal(u.node('[data-curriculum-link="0"][data-field="grade"]').value,'5');
  u.change('[data-curriculum-link="0"][data-field="grade"]','2');u.input('[data-curriculum-link="0"][data-field="subject"]','국어');
  u.click('#ce-add-link');u.change('[data-curriculum-link="1"][data-field="grade"]','3');u.input('[data-curriculum-link="1"][data-field="subject"]','과학');
  u.input('#ce-topic','관찰한 내용을 글로 표현하기');u.change('#ce-purpose','test');
  u.click('[data-step="1"]');u.click('[data-step="0"]');assert.equal(u.node('#ce-topic').value,'관찰한 내용을 글로 표현하기');
  await u.click('#ce-quick-save');assert.deepEqual(u.saved.plan.curriculum,{links:[{school:'elementary',grade:2,subject:'국어'},{school:'elementary',grade:3,subject:'과학'}],topic:'관찰한 내용을 글로 표현하기',purpose:'test'});
  assert.equal(u.saved.plan.variants.length,1);assert.equal(u.saved.plan.variants[0].sessions.length,3);
  await u.open();assert.equal(u.node('[data-curriculum-link="1"][data-field="subject"]').value,'과학');
  u.click('[data-step="3"]');assert.match(u.html,/테스트·검증용/);assert.match(u.html,/관찰한 내용을 글로 표현하기/);
});

test('removing every curriculum connection persists unclassified instead of restoring legacy grade',async()=>{
  const u=ui();await u.open();u.click('[data-curriculum-remove="0"]');await u.click('#ce-quick-save');
  assert.deepEqual(u.saved.plan.curriculum.links,[]);await u.open();assert.equal(u.all('[data-curriculum-link]').length,0);assert.match(u.html,/미분류/);
});

test('school change corrects out-of-range grade; duplicate connections normalize on save',async()=>{
  const u=ui();await u.open();u.change('[data-curriculum-link="0"][data-field="school"]','middle');assert.equal(u.node('[data-curriculum-link="0"][data-field="grade"]').value,'1');u.input('[data-curriculum-link="0"][data-field="subject"]',' 국어 ');
  u.click('#ce-add-link');u.input('[data-curriculum-link="1"][data-field="subject"]','국어');await u.click('#ce-quick-save');assert.equal(u.saved.plan.curriculum.links.length,1);assert.equal(u.saved.plan.curriculum.links[0].subject,'국어');
});
