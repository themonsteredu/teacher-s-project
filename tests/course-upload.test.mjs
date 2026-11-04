import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), CourseAuthoring=require('../public/course-authoring.js');
const source=readFileSync(new URL('../public/course-upload.js',import.meta.url),'utf8');
function fixture(){
 const nodes=new Map(),calls=[],files=[],variant={sessions:[{assets:{}},{assets:{}}]};let fail=true,changed=0;
 const node=k=>{if(!nodes.has(k))nodes.set(k,{value:'',textContent:'',disabled:false});return nodes.get(k);};
 const modal={querySelector:node,querySelectorAll:()=>[...nodes.values()],remove(){}};
 const ctx={AbortSignal,CourseAuthoring,esc:String,COURSE_SLOTS:{app:'웹앱',ppt:'PPT',worksheet:'활동지',guide:'교안'},openModal:()=>modal,guessMime:()=> 'application/pdf',fetch:async(url)=>{calls.push(url);return{ok:true};},api:async(method,url,body)=>{calls.push({url,body});if(url.endsWith('/file-sign'))return{path:'program7/'+body.name,uploadUrl:'https://storage.test/'+body.name};if(body.name==='b.pdf'&&fail){fail=false;throw Error('confirmation response lost');}return{id:body.name==='a.pdf'?1:2};}};
 vm.createContext(ctx);vm.runInContext(source,ctx);ctx.openCourseFileBatch({programId:7,variant,files,changed:()=>changed++,redraw(){}});
 return{node,calls,files,variant,get changed(){return changed;},choose(){node('#cb-files').onchange({target:{files:[{name:'a.pdf',size:10},{name:'b.pdf',size:20}]}});for(let i=0;i<2;i++){node(`[data-cb-session="${i}"]`).value=String(i);node(`[data-cb-slot="${i}"]`).value='worksheet';}},send:()=>node('#cb-upload').onclick()};
}
test('batch registration retains successful assignments and retries only unconfirmed files using the same path',async()=>{
 const f=fixture();f.choose();await f.send();assert.equal(f.files.length,1);assert.equal(f.variant.sessions[0].assets.worksheet.fileId,'1');assert.match(f.node('#cb-message').textContent,/다시 누르면/);await f.send();assert.equal(f.files.length,2);assert.equal(f.changed,2);assert.equal(f.calls.filter(x=>typeof x==='string').length,2);const second=f.calls.filter(x=>x.url?.endsWith('/file-confirm')&&x.body.name==='b.pdf');assert.equal(second.length,2);assert.equal(second[0].body.path,second[1].body.path);assert.equal(f.node('#cb-upload').disabled,false);
});
test('duplicate lesson/slot assignments fail before uploading any object',async()=>{const f=fixture();f.choose();f.node('[data-cb-session="1"]').value='0';await f.send();assert.equal(f.calls.length,0);assert.match(f.node('#cb-message').textContent,/겹칩니다/);});


test('파일명으로 차시와 역할을 제안하며 모르는 정보는 직접 선택한다',()=>{
 const h=CourseAuthoring.fileHint('2차시_선생님용_소리로소통하는나와AI.html');
 assert.equal(h.number,2);assert.equal(h.slot,'guide');assert.equal(h.title,'소리로소통하는나와AI');
 assert.equal(CourseAuthoring.fileHint('1차시_학생용_AI퀴즈.html').slot,'app');
 assert.equal(CourseAuthoring.fileHint('2차시_활동지.pdf').slot,'worksheet');
 assert.equal(CourseAuthoring.fileHint('나의 웹앱.html').number,null);
 assert.equal(CourseAuthoring.fileHint('수업.html').slot,'');
});

test('빈 과정에서 파일명으로 차시를 제안하고 기존 과정은 덮어쓰지 않는다',()=>{
 const nodes=new Map(),node=k=>{if(!nodes.has(k))nodes.set(k,{value:'',textContent:'',innerHTML:'',disabled:false});return nodes.get(k);};
 const modal={querySelector:node,querySelectorAll:()=>[],remove(){}};
 const blank=()=>({title:'',assets:{app:{url:'',fileId:''},ppt:{url:'',fileId:''},worksheet:{url:'',fileId:''},guide:{url:'',fileId:''}}});
 let changed=0;const variant={sessions:[blank()]};
 const ctx={CourseAuthoring,blankCourseSession:blank,esc:String,COURSE_SLOTS:{app:'학생 웹앱',ppt:'수업 PPT',worksheet:'활동지',guide:'교안'},openModal:()=>modal};
 vm.createContext(ctx);vm.runInContext(source,ctx);ctx.openCourseFileBatch({programId:7,variant,files:[],changed:()=>changed++,redraw(){}});
 node('#cb-files').onchange({target:{files:[{name:'1차시_학생용_AI퀴즈.html',size:10},{name:'2차시_선생님용_소리.html',size:20}]}});
 node('#cb-create-lessons').onclick();
 assert.equal(variant.sessions.length,2);assert.equal(variant.sessions[0].title,'AI퀴즈');assert.equal(variant.sessions[1].title,'소리');assert.equal(changed,1);
 assert.match(node('#cb-rows').innerHTML,/value="0" selected/);assert.match(node('#cb-rows').innerHTML,/value="guide" selected/);
 node('#cb-create-lessons').onclick();assert.equal(changed,1);assert.match(node('#cb-message').textContent,/기존 차시/);
});
