import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),source=readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
function harness({site=true,user=null}={}){
  let calls=[],signed=0;const module={exports:{}};
  const deps={'node:crypto':require('node:crypto'),'./password':{},'./cookies':{},'./auth':{getSessionUser:async()=>user?{user}:null,roleLevel:r=>({admin:2,teacher:1}[r]||0)},'./storage':{storageEnabled:true,createSignedDownload:async()=>{signed++;return'https://storage.test/private';}},'./db':{TS:c=>c,ready:async()=>{},getSettings:async()=>({site_open:site}),log:async()=>{},one:async sql=>sql.includes('board_posts')?{id:9,board_id:7,storage_path:'private/file.pdf'}:{id:7,program_id:11,created_by:3},q:async()=>[]},'./student-board':{sameOrigin:()=>{},createService:()=>Object.fromEntries(['list','sign','submit','file','leave','settings','saveSettings'].map(name=>[name,async(...args)=>{calls.push({name,args});return{ok:true};}]))}};
  vm.runInNewContext(source,{module,require:id=>deps[id],process:{env:{}},Buffer,URL});
  return{calls,get signed(){return signed;},async request(method,path,body){let status,result;const headers={};await module.exports.handleApi({method,url:path,headers:{host:'hub.test',origin:'https://hub.test'}},{setHeader(k,v){headers[k]=v;},writeHead(s){status=s;},end(s){result=s?JSON.parse(s):null;}},path,body);return{status,result,headers};}};
}
test('all student submission paths enforce the site kill switch before work',async()=>{const a=harness({site:false});for(const [method,path]of [['GET','submissions'],['POST','file-sign'],['POST','posts'],['GET','submission-file/9']])assert.equal((await a.request(method,'/api/join-board/ABCD12/'+path,{})).status,403);assert.equal(a.calls.length,0);});
test('supported alphanumeric participation code and nested file ID reach the correct handlers',async()=>{const a=harness();assert.equal((await a.request('GET','/api/join-board/bS2622/submissions')).status,200);assert.equal(a.calls[0].args[2],'bS2622');await a.request('GET','/api/join-board/ABCD12/submission-file/9');assert.equal(a.calls[1].name,'file');assert.equal(a.calls[1].args[3],'9');});
test('teacher config endpoints require teacher authentication',async()=>{const a=harness();assert.equal((await a.request('PUT','/api/boards/7/submission-settings',{})).status,401);assert.equal(a.calls.length,0);});
test('unrelated teacher cannot download a private attachment by guessed post ID',async()=>{const a=harness({user:{id:8,role:'teacher'}});assert.equal((await a.request('GET','/api/posts/9/download')).status,403);assert.equal(a.signed,0);});
test('class owner can download their students attachments',async()=>{const a=harness({user:{id:3,role:'teacher'}});assert.equal((await a.request('GET','/api/posts/9/download')).status,302);assert.equal(a.signed,1);});
test('student logout remains available with a closed site',async()=>{const a=harness({site:false});assert.equal((await a.request('POST','/api/join-board/ABCD12/leave',{})).status,200);assert.equal(a.calls[0].name,'leave');});
