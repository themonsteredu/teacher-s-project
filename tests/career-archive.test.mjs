import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../lib/storage.js',import.meta.url),'utf8');
test('private archive uses server-side copy once, verifies metadata and refuses normal removal',async()=>{
 let exists=false;const calls=[],module={exports:{}};
 vm.runInNewContext(source,{module,URL,AbortSignal,process:{env:{SUPABASE_URL:'https://storage.test',SUPABASE_SERVICE_KEY:'server-only',SUPABASE_BUCKET:'files'}},fetch:async(url,opts)=>{
  calls.push({url,opts});
  if(url.includes('/object/sign/'))return{ok:true,json:async()=>({signedURL:'/private-check'})};
  if(url.endsWith('/private-check'))return{ok:exists,headers:{get:key=>({'content-length':'20','content-type':'image/png'}[key])},body:{cancel:async()=>{}}};
  if(url.endsWith('/object/copy')){exists=true;return{ok:true};}
  throw Error(url);
 }});
 const s=module.exports,u={path:'board7/unique.png',name:'photo.png',mime:'image/png',size:20};const a=await s.archiveSubmission(u);assert.equal(a.path,'career-originals/unique.png');await s.archiveSubmission(u);await s.removeObject(a.path);
 const copies=calls.filter(c=>c.url.endsWith('/object/copy'));assert.equal(copies.length,1);assert.deepEqual(JSON.parse(copies[0].opts.body),{bucketId:'files',sourceKey:u.path,destinationKey:a.path});assert.ok(!calls.some(c=>c.opts.method==='DELETE'));
});
