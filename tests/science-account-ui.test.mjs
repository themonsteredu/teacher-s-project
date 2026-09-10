import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const html=readFileSync(new URL('../public/lessons/초2-인공지능/3차시-학생용-감각짝맞추기.html',import.meta.url),'utf8');
const block=html.slice(html.indexOf("let lastObs="),html.indexOf('function drawCard(o){'));
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const material=app.slice(app.indexOf('function careerMaterialUrl('),app.indexOf('// 학생 화면: 오늘의 수업자료 렌더'));
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',record='33333333-3333-4333-8333-333333333333';
const plain=v=>JSON.parse(JSON.stringify(v));
async function fixture({brokenStorage=false,search='?hub_code=ABCD12&hub_session=lesson-1',rejectCrypto=false}={}){
  const nodes=new Map(),listeners={},stored=new Map(),posts=[];
  let scope=a,postMode='ok',contexts=200;
  function node(id){if(!nodes.has(id)){const classes=new Set(id==='savedView'?['hide']:[]);nodes.set(id,{value:'',textContent:'',disabled:false,width:900,classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle(k,force){if(force===true)classes.add(k);else classes.delete(k);}}});}return nodes.get(id);}
  const document={hidden:false,getElementById:node,addEventListener(k,f){listeners[k]=f;}};
  const storage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
  const window={addEventListener(k,f){listeners[k]=f;}};
  for(const key of ['sessionStorage','localStorage'])Object.defineProperty(window,key,{get(){if(brokenStorage)throw Error('disabled');return storage;}});
  const context=vm.createContext({document,window,location:{search},URLSearchParams,AbortController,setTimeout,clearTimeout,crypto:rejectCrypto?{}:webcrypto,V:{saved:node('savedView'),observe:node('observeView')},show(){},console,
    fetch:async(url,options)=>{
      assert.equal(url,'/api/join-board/abcd12/science-career?session_id=lesson-1');assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');
      if(options.method==='GET')return Response.json(contexts===200?{accountLinked:true,draftScope:scope,sessionId:'lesson-1'}:{error:'denied'},{status:contexts});
      const body=JSON.parse(options.body);posts.push(body);
      if(postMode==='network')throw Error('network failed');
      if(typeof postMode==='function')return postMode(body);
      return Response.json(postMode==='invalid'?{ok:true}:{ok:true,record_id:record,duplicate:posts.length>1,source_event_id:body.source_event_id,draftScope:body.draftScope});
    }});
  vm.runInContext(block,context);
  await new Promise(resolve=>setImmediate(resolve));
  return{context,document,nodes,node,listeners,posts,stored,run:s=>vm.runInContext(s,context),set scope(v){scope=v;},set postMode(v){postMode=v;},set contexts(v){contexts=v;}};
}
test('same-origin Science links receive only normal board context; external apps receive no identity parameters',()=>{
  const c=vm.createContext({location:{origin:'https://teacher-s-project-preview-themonsteredu.vercel.app'},URL});vm.runInContext(material,c);
  const url='/lessons/초2-인공지능/3차시-학생용-감각짝맞추기.html?x=1&student_id='+a;
  const output=c.careerMaterialUrl({kind:'aiapp',url},'ABCD12','','lesson-1');const parsed=new URL(output,c.location.origin);
  assert.equal(parsed.searchParams.get('hub_code'),'ABCD12');assert.equal(parsed.searchParams.get('x'),'1');assert.equal(parsed.searchParams.has('student_id'),false);
  for(const externalUrl of ['https://hub.moakit.ai'+url.split('?')[0],'https://ai-history-ar.vercel.app/activity','https://drone-six-smoky.vercel.app/'])assert.equal(c.careerMaterialUrl({kind:'aiapp',url:externalUrl},'ABCD12',a,'lesson-1'),externalUrl);
});
test('real observation sends no Career UUID and validates a receipt before showing saved',async()=>{
  const f=await fixture();await f.run("saveCareerObservation('민들레','노란 꽃과 톱니 모양 잎')");
  assert.equal(f.posts.length,1);assert.equal(f.posts[0].student_id,undefined);assert.equal(f.posts[0].draftScope,a);
  assert.deepEqual(f.posts[0].raw_data,{lesson:3,activity:'plant-observation',observation:{plant_name:'민들레',features:'노란 꽃과 톱니 모양 잎'}});
  assert.match(f.node('careerLogStatus').textContent,/저장했어요/);assert.equal(f.run('careerSaving'),false);
});
test('storage failures and network retry retain the same UUID event and leave saving state',async()=>{
  const f=await fixture({brokenStorage:true});f.postMode='network';await f.run("saveCareerObservation('민들레','노란 꽃')");
  assert.equal(f.run('careerSaving'),false);assert.equal(f.node('careerRetryBtn').classList.contains('hide'),false);
  f.postMode='ok';await f.run("saveCareerObservation('민들레','노란 꽃')");await f.run("saveCareerObservation('민들레','노란 꽃')");
  assert.equal(new Set(f.posts.map(p=>p.source_event_id)).size,1);assert.match(f.posts[0].source_event_id,/:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('pending identifiers are isolated by draftScope and do not persist observation contents',async()=>{
  const f=await fixture();const first=f.run(`careerSourceEvent('abcd12','${a}','lesson-1','민들레','노란 꽃')`),second=f.run(`careerSourceEvent('abcd12','${b}','lesson-1','민들레','노란 꽃')`);
  const otherLesson=f.run(`careerSourceEvent('abcd12','${a}','lesson-2','민들레','노란 꽃')`);assert.notEqual(first.id,otherLesson.id);assert.notEqual(first.key,otherLesson.key);
  assert.notEqual(first.id,second.id);assert.notEqual(first.key,second.key);assert.ok([...f.stored.values()].every(v=>!v.includes('민들레')&&!v.includes('노란 꽃')));
});
test('an old A page cannot submit after B logs in and does not adopt B scope',async()=>{
  const f=await fixture();f.node('nameField').value='A';f.node('plantField').value='민들레';f.scope=b;
  await f.run("saveCareerObservation('민들레','노란 꽃')");assert.equal(f.posts.length,0);assert.equal(f.run('careerState'),'locked');assert.equal(f.run('careerScope'),a);
  assert.equal(f.node('nameField').value,'');assert.equal(f.node('plantField').value,'');assert.equal(f.node('saveBtn').disabled,true);
  await f.run("saveCareerObservation('민들레','노란 꽃')");assert.equal(f.posts.length,0);
});
test('page hiding clears observation, name and canvas before shared-device resume',async()=>{
  const f=await fixture();f.node('nameField').value='학생 A';f.node('plantField').value='민들레';f.run("lastObs={name:'학생 A',plant:'민들레',feat:'노란 꽃'}");
  f.document.hidden=true;f.listeners.visibilitychange();assert.equal(f.node('nameField').value,'');assert.deepEqual(plain(f.run('lastObs')),{name:'',plant:'',feat:''});assert.equal(f.node('saveBtn').disabled,true);
  f.scope=b;f.document.hidden=false;f.listeners.visibilitychange();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.run('careerState'),'locked');
});
test('account switch while waiting for a successful Edge receipt cannot display A result to B',async()=>{
  const f=await fixture();f.postMode=body=>{f.scope=b;return Response.json({ok:true,record_id:record,duplicate:false,source_event_id:body.source_event_id,draftScope:body.draftScope});};
  await f.run("saveCareerObservation('민들레','노란 꽃')");assert.equal(f.posts.length,1);assert.equal(f.run('careerState'),'locked');assert.equal(f.node('careerLogStatus').textContent,'');
});
test('malformed successful receipts and unavailable random generator never claim a stored record',async()=>{
  const f=await fixture();f.postMode='invalid';await f.run("saveCareerObservation('민들레','노란 꽃')");assert.doesNotMatch(f.node('careerLogStatus').textContent,/저장했어요/);assert.equal(f.run('careerSaving'),false);
  const g=await fixture({rejectCrypto:true});await g.run("saveCareerObservation('민들레','노란 꽃')");assert.equal(g.posts.length,0);assert.equal(g.run('careerSaving'),false);
});
test('blank observations and standalone activity never create a Career record',async()=>{
  const f=await fixture();await f.run("saveCareerObservation('민들레','')");assert.equal(f.posts.length,0);
  const standalone=await fixture({search:''});await standalone.run("saveCareerObservation('민들레','노란 꽃')");assert.equal(standalone.posts.length,0);
});

test('temporary context lookup failure can be retried without reload or adopting another student',async()=>{
  const f=await fixture();f.contexts=503;await f.run("saveCareerObservation('민들레','노란 꽃')");
  assert.equal(f.posts.length,0);assert.equal(f.node('saveBtn').disabled,true);assert.equal(f.node('careerContextRetryBtn').classList.contains('hide'),false);
  f.contexts=200;await f.node('careerContextRetryBtn').onclick();assert.equal(f.run('careerState'),'ready');assert.equal(f.node('saveBtn').disabled,false);
  await f.run("saveCareerObservation('민들레','노란 꽃')");assert.equal(f.posts.length,1);
  f.contexts=503;await f.run("saveCareerObservation('민들레','노란 꽃')");f.scope=b;f.contexts=200;await f.node('careerContextRetryBtn').onclick();
  assert.equal(f.run('careerState'),'locked');assert.equal(f.node('saveBtn').disabled,true);assert.equal(f.posts.length,1);
});

test('late completion from a suspended page cannot unlock a newer save operation',async()=>{
  const f=await fixture(),pending=[];f.postMode=body=>new Promise((resolve,reject)=>pending.push({body,resolve,reject}));
  const first=f.run("saveCareerObservation('민들레','노란 꽃')");await new Promise(resolve=>setImmediate(resolve));assert.equal(pending.length,1);
  f.document.hidden=true;f.listeners.visibilitychange();f.document.hidden=false;await f.run('careerResume()');
  const second=f.run("saveCareerObservation('민들레','톱니 모양 잎')");await new Promise(resolve=>setImmediate(resolve));assert.equal(pending.length,2);
  pending[0].reject(Error('old request aborted'));await first;assert.equal(f.run('careerSaving'),true);assert.equal(f.node('saveBtn').disabled,true);
  const current=pending[1];current.resolve(Response.json({ok:true,record_id:record,duplicate:false,source_event_id:current.body.source_event_id,draftScope:current.body.draftScope}));
  await second;assert.equal(f.run('careerSaving'),false);assert.match(f.node('careerLogStatus').textContent,/저장했어요/);
});

test('refocusing a still-visible shared window hides prior student work before context lookup finishes',async()=>{
 const f=await fixture();f.node('nameField').value='학생 A';f.node('plantField').value='민들레';f.scope=b;
 f.listeners.focus();assert.equal(f.node('nameField').value,'');assert.equal(f.node('plantField').value,'');assert.equal(f.node('saveBtn').disabled,true);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(f.run('careerState'),'locked');
});
