import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/course-upload.js',import.meta.url),'utf8');
function fixture(){
 const nodes=new Map(),calls=[],files=[],variant={sessions:[{assets:{}},{assets:{}}]};let fail=true,changed=0;
 const node=k=>{if(!nodes.has(k))nodes.set(k,{value:'',textContent:'',disabled:false});return nodes.get(k);};
 const modal={querySelector:node,querySelectorAll:()=>[...nodes.values()],remove(){}};
 const ctx={AbortSignal,esc:String,COURSE_SLOTS:{app:'웹앱',ppt:'PPT',worksheet:'활동지',guide:'교안'},openModal:()=>modal,guessMime:()=> 'application/pdf',fetch:async(url)=>{calls.push(url);return{ok:true};},api:async(method,url,body)=>{calls.push({url,body});if(url.endsWith('/file-sign'))return{path:'program7/'+body.name,uploadUrl:'https://storage.test/'+body.name};if(body.name==='b.pdf'&&fail){fail=false;throw Error('confirmation response lost');}return{id:body.name==='a.pdf'?1:2};}};
 vm.createContext(ctx);vm.runInContext(source,ctx);ctx.openCourseFileBatch({programId:7,variant,files,changed:()=>changed++,redraw(){}});
 return{node,calls,files,variant,get changed(){return changed;},choose(){node('#cb-files').onchange({target:{files:[{name:'a.pdf',size:10},{name:'b.pdf',size:20}]}});for(let i=0;i<2;i++){node(`[data-cb-session="${i}"]`).value=String(i);node(`[data-cb-slot="${i}"]`).value='worksheet';}},send:()=>node('#cb-upload').onclick()};
}
test('batch registration retains successful assignments and retries only unconfirmed files using the same path',async()=>{
 const f=fixture();f.choose();await f.send();assert.equal(f.files.length,1);assert.equal(f.variant.sessions[0].assets.worksheet.fileId,'1');assert.match(f.node('#cb-message').textContent,/다시 누르면/);await f.send();assert.equal(f.files.length,2);assert.equal(f.changed,2);assert.equal(f.calls.filter(x=>typeof x==='string').length,2);const second=f.calls.filter(x=>x.url?.endsWith('/file-confirm')&&x.body.name==='b.pdf');assert.equal(second.length,2);assert.equal(second[0].body.path,second[1].body.path);assert.equal(f.node('#cb-upload').disabled,false);
});
test('duplicate lesson/slot assignments fail before uploading any object',async()=>{const f=fixture();f.choose();f.node('[data-cb-session="1"]').value='0';await f.send();assert.equal(f.calls.length,0);assert.match(f.node('#cb-message').textContent,/겹칩니다/);});
