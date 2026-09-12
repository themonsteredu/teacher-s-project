import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {domFixture,esc} from './dom-fixture.mjs';
const source=readFileSync(new URL('../public/student-board.js',import.meta.url),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
function ui(){
 const document=domFixture('<main id="submission-settings-card"></main>'),root=document.querySelector('main'),requests=[];
 let reject=false,hold=false,release;
 const config={revision:'r1',variantId:'full',name:'전체 과정',activeSession:'s1',career:{enabled:false,schoolId:null},sessions:Array.from({length:12},(_,i)=>({id:`s${i+1}`,title:`${i+1}차시 · ${i===11?'우리 역할극에 어울리는 음악':'자연 관찰'}`,submissions:{enabled:true,types:['photo','document','text'],sharing:'teacher'}}))};
 const ctx={document,esc,console,confirm:()=>true};vm.createContext(ctx);vm.runInContext(source,ctx);
 ctx.sbRequest=async(method,path,body)=>{
   if(method==='GET')return {config:copy(config),careerAvailable:false,variants:[]};
   requests.push(copy(body));if(hold)await new Promise(resolve=>release=resolve);if(reject)throw Error('저장 연결을 다시 확인하세요.');
   return{config:{...copy(config),...copy(body),revision:'r2'}};
 };
 const node=s=>{const n=root.querySelector(s);assert.ok(n,`rendered ${s}`);return n;};
 return{root,requests,node,open:()=>ctx.loadSubmissionSettings(root,17),fail(v=true){reject=v;},hold(){hold=true;},release(){release?.();},
  change(s,v){const n=node(s);if(typeof v==='boolean')n.checked=v;else n.value=v;return n.onchange({target:n});},
  click(s){const n=node(s);assert.equal(n.disabled,false);return n.onclick();}};
}
test('twelve lessons render one editor with full titles and separate today selection',async()=>{
 const u=ui();await u.open();assert.equal(u.root.querySelectorAll('#sbt-enabled').length,1);assert.equal(u.root.querySelectorAll('#sbt-lesson option').length,12);assert.equal(u.root.querySelectorAll('table').length,0);
 u.change('#sbt-lesson','s12');assert.equal(u.node('#sbt-lesson-panel h3').textContent,'12차시 · 우리 역할극에 어울리는 음악');assert.match(u.node('#sbt-today').textContent,/^1차시/);
 await u.click('#sbt-use-today');assert.match(u.node('#sbt-today').textContent,/^12차시/);
});
test('switching lessons preserves edits and saves the entire config with revision and today selection',async()=>{
 const u=ui();await u.open();u.change('#sbt-enabled',false);u.change('[data-sbt-type="photo"]',false);
 u.change('#sbt-lesson','s12');u.change('#sbt-sharing','class');await u.click('#sbt-use-today');
 u.change('#sbt-lesson','s1');assert.equal(u.node('#sbt-enabled').checked,false);assert.equal(u.node('[data-sbt-type="photo"]').checked,false);
 await u.click('#sbt-save');const body=u.requests[0];assert.equal(body.sessions.length,12);assert.equal(body.sessions[0].submissions.enabled,false);assert.equal(body.sessions[11].submissions.sharing,'class');assert.equal(body.activeSession,'s12');assert.equal(body.revision,'r1');assert.equal(body.shareStudentMaterials,false);assert.equal(body.career.enabled,false);
 assert.match(u.node('#sbt-message').textContent,/저장되었습니다/);assert.equal(u.node('#sbt-career').disabled,true);
});
test('failed save retains drafts and disabled capabilities; retry excludes duplicate in-flight writes',async()=>{
 const u=ui();await u.open();u.change('#sbt-enabled',false);u.fail();await u.click('#sbt-save');assert.equal(u.node('#sbt-enabled').checked,false);assert.equal(u.node('#sbt-career').disabled,true);assert.equal(u.node('#sbt-use-today').disabled,true);assert.equal(u.node('#sbt-save').disabled,false);
 u.fail(false);u.hold();const sending=u.click('#sbt-save');await u.node('#sbt-save').onclick();assert.equal(u.requests.length,2);u.release();await sending;assert.equal(u.node('#sbt-enabled').checked,false);
});
test('invalid hidden lesson is revealed without losing settings for another lesson',async()=>{
 const u=ui();await u.open();for(const type of ['photo','document','text'])u.change(`[data-sbt-type="${type}"]`,false);
 u.change('#sbt-lesson','s12');u.change('#sbt-sharing','class');await u.click('#sbt-save');assert.equal(u.requests.length,0);assert.equal(u.node('#sbt-lesson').value,'s1');assert.match(u.node('#sbt-message').textContent,/하나 이상/);
 u.change('[data-sbt-type="text"]',true);await u.click('#sbt-save');assert.equal(u.requests[0].sessions[11].submissions.sharing,'class');
});
