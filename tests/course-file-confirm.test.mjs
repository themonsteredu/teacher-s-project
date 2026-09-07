import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),source=readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
test('actual file-confirm endpoint serializes duplicate confirmations and rejects changed metadata',async()=>{
 const rows=[],module={exports:{}};let tail=Promise.resolve();
 const db={TS:x=>x,ready:async()=>{},getSettings:async()=>({site_open:true}),log:async()=>{},q:async()=>[],one:async sql=>sql.includes('FROM programs')?{id:7}:null,
  transaction:async work=>{const prior=tail;let release;tail=new Promise(r=>release=r);await prior;let locked=false;const c={q:async sql=>{assert.match(sql,/pg_advisory_xact_lock/);locked=true;},one:async(sql,a)=>{assert.equal(locked,true);if(sql.startsWith('SELECT id,name'))return rows.find(r=>r.path===a[1])||null;const row={id:rows.length+1,name:a[2],mime:a[3],size:a[4],path:a[5]};rows.push(row);return row;}};try{return await work(c);}finally{release();}}};
 const deps={'node:crypto':require('node:crypto'),'./course-plan':require('../lib/course-plan'),'./password':{},'./cookies':{},'./storage':{storageEnabled:true},'./db':db,'./auth':{getSessionUser:async()=>({user:{id:1,role:'admin'}}),roleLevel:()=>2}};
 vm.runInNewContext(source,{module,require:id=>deps[id],process:{env:{}},Buffer,URL});
 const call=async patch=>{let status,body;await module.exports.handleApi({method:'POST',headers:{}},{writeHead(s){status=s;},end(s){body=JSON.parse(s);}},'/api/programs/7/file-confirm',{name:'자료.pdf',size:20,mime:'application/pdf',path:'program7/upload.pdf',...patch});return{status,body};};
 const results=await Promise.all([call(),call()]);assert.equal(rows.length,1);assert.equal(results[0].status,200);assert.equal(results[1].body.id,results[0].body.id);assert.equal((await call({name:'changed.pdf'})).status,409);assert.equal(rows.length,1);
});
