import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../lib/db.js',import.meta.url),'utf8');
function db(){
 const trace=[],module={exports:{}};
 class Pool{async connect(){trace.push('connect');return{query:async(sql)=>{trace.push(sql);return{rows:[{id:71}]};},release(){trace.push('release');}};}async query(){throw Error('pool.query cannot participate in this transaction');}}
 vm.runInNewContext(source,{module,require:id=>id==='pg'?{Pool}:id==='./password'?{}:id==='./curriculum'?{}:null,process:{env:{DATABASE_URL:'postgresql://test@localhost/test'}},console});
 return{api:module.exports,trace};
}
test('post and receipt queries commit on one checked-out client and release it',async()=>{const d=db();const r=await d.api.transaction(async c=>{await c.q('insert post');return c.one('insert receipt');});assert.equal(r.id,71);assert.deepEqual(d.trace,['connect','BEGIN','insert post','insert receipt','COMMIT','release']);});
test('receipt failure rolls back and releases the same client',async()=>{const d=db();await assert.rejects(()=>d.api.transaction(async c=>{await c.q('insert post');throw Error('receipt failed');}),/receipt failed/);assert.deepEqual(d.trace,['connect','BEGIN','insert post','ROLLBACK','release']);});
