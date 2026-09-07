import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), author=require('../public/course-authoring'), {normalize,issues}=require('../lib/course-plan');
const blank=()=>({title:'',minutes:40,sourceLessons:[],bridge:'',assets:{app:{url:'',fileId:''},ppt:{url:'',fileId:''},worksheet:{url:'',fileId:''},guide:{url:'',fileId:''}},submissions:{enabled:true,types:['text'],sharing:'teacher'},record:{mode:'none',completion:'',original:'',process:''}});
test('paste original lessons once; preserve tab-separated lesson app addresses',()=>{
 const rows=author.outline('관찰\thttps://app.test/one\n비교\n결과 발표',blank,'https://app.test');
 assert.equal(rows.length,3);assert.equal(rows[0].assets.app.url,'https://app.test/one');assert.equal(rows[1].assets.app.url,'https://app.test');
 assert.throws(()=>author.outline('',blank));assert.throws(()=>author.outline(Array(51).fill('차시').join('\n'),blank));
});
test('10-lesson original produces selected 3-lesson course without mutating source materials or record settings',()=>{
 const source={sessions:Array.from({length:10},(_,i)=>({...blank(),title:`원본 ${i+1}`}))};source.sessions[4].assets.worksheet.fileId='15';source.sessions[4].record={mode:'submission',completion:'제출',original:'관찰',process:'관찰 결과를 기록함'};
 const short=author.variant(source,[0,4,9],'short','3차시');assert.deepEqual(short.sessions.map(s=>s.title),['원본 1','원본 5','원본 10']);assert.equal(short.sessions[1].assets.worksheet.fileId,'15');assert.equal(short.sessions[1].record.process,'관찰 결과를 기록함');short.sessions[1].assets.worksheet.fileId='20';short.sessions[1].record.process='수정';assert.equal(source.sessions[4].assets.worksheet.fileId,'15');assert.equal(source.sessions[4].record.process,'관찰 결과를 기록함');
 assert.throws(()=>author.variant(source,[99],'bad','bad'));assert.throws(()=>author.variant(source,[0,0],'bad','bad'));
});
test('common app fills empty slots and never replaces lesson-specific apps or uploaded HTML',()=>{
 const plan={appUrl:'https://app.test',variants:[{sessions:[blank(),blank(),blank()]}]};plan.variants[0].sessions[1].assets.app.url='https://other.test';plan.variants[0].sessions[2].assets.app.fileId='5';assert.equal(author.commonApp(plan),1);assert.equal(plan.variants[0].sessions[1].assets.app.url,'https://other.test');assert.equal(plan.variants[0].sessions[2].assets.app.fileId,'5');
});
test('offline submission-only curriculum publishes without fake PPT/app/guide requirements',()=>{
 const p={version:1,appUrl:'',variants:[{id:'one',name:'관찰',sessions:[{...blank(),title:'민들레 관찰'}]}]};assert.deepEqual(issues(normalize(p)),[]);p.variants[0].sessions[0].submissions.enabled=false;assert.equal(issues(normalize(p)).length,1);
});
