import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../public/student-accounts.html',import.meta.url),'utf8');
const helper=readFileSync(new URL('../public/account-roster.js',import.meta.url),'utf8');
const controller=readFileSync(new URL('../public/account-manager.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';

function domFixture() {
  const nodes=new Map(),downloads=[],blobs=new Map(),listeners={};
  class Element {
    constructor(tag,attributes={}){
      this.tagName=tag.toLowerCase();this.children=[];this.parentNode=null;this.attributes=attributes;this.dataset={};this._text='';
      this._value=attributes.value;this.defaultValue=attributes.value??'';this.checked='checked' in attributes;this.defaultChecked=this.checked;
      this.hidden='hidden' in attributes;this.disabled='disabled' in attributes;this.required='required' in attributes;
      this.name=attributes.name||'';this.id=attributes.id||'';this.files=[];
      if(this.id)nodes.set(this.id,this);
      for(const [key,value]of Object.entries(attributes))if(key.startsWith('data-'))this.dataset[key.slice(5)]=value;
    }
    append(...children){for(const child of children){child.parentNode=this;this.children.push(child);}}
    add(child){this.append(child);}
    replaceChildren(...children){this.children=[];this._text='';if(this.tagName==='select')this._value=undefined;this.append(...children);}
    get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
    set textContent(value){this._text=String(value);this.children=[];}
    get value(){return this._value??(this.tagName==='select'?this.children.find(child=>'selected' in child.attributes)?.value??this.children[0]?.value??'':this.tagName==='option'?this.textContent:'');}
    set value(value){this._value=String(value);}
    get selectedOptions(){return this.children.filter(child=>child.value===this.value);}
    querySelectorAll(selector){const tags=selector.split(',').map(tag=>tag.trim());const result=[];function visit(node){for(const child of node.children){if(tags.includes(child.tagName))result.push(child);visit(child);}}visit(this);return result;}
    querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
    get elements(){return Object.fromEntries(this.querySelectorAll('input,textarea,select,button').filter(child=>child.name).map(child=>[child.name,child]));}
    reset(){for(const child of this.querySelectorAll('input,textarea,select')){child._value=child.tagName==='select'?undefined:child.defaultValue;child.checked=child.defaultChecked;}}
    scrollIntoView(){}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);}
    click(){if(this.disabled)return;if(this.tagName==='a'){downloads.push({name:this.download,blob:blobs.get(this.href)});return;}return this.onclick?.({preventDefault(){}});}
  }
  const root=new Element('root'),stack=[root],voidTags=new Set(['input','meta','link','br','img','hr','source']);
  const source=html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  for(const match of source.matchAll(/<\/?([a-z][\w-]*)\b([^>]*)>|([^<]+)/gi)){
    if(match[3]){stack.at(-1)._text+=match[3];continue;}
    if(match[0].startsWith('</')){if(stack.at(-1).tagName===match[1].toLowerCase())stack.pop();continue;}
    const attributes={};for(const item of match[2].matchAll(/([\w-]+)(?:="([^"]*)"|='([^']*)'|=([^\s>]+))?/g))attributes[item[1]]=item[2]??item[3]??item[4]??'';
    const element=new Element(match[1],attributes);stack.at(-1).append(element);if(!voidTags.has(element.tagName))stack.push(element);
  }
  const document={visibilityState:'visible',getElementById:id=>{assert.ok(nodes.has(id),`Unknown HTML element ${id}`);return nodes.get(id);},createElement:tag=>new Element(tag),body:root,addEventListener(name,fn){(listeners[name]??=[]).push(fn);}};
  const window={addEventListener(name,fn){(listeners[name]??=[]).push(fn);}};
  for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw new Error('Credential storage must not be used');}});
  const URL={createObjectURL(blob){const url=`blob:test-${blobs.size}`;blobs.set(url,blob);return url;},revokeObjectURL(){}};
  return {document,window,downloads,listeners,URL,node:id=>document.getElementById(id),Option:class extends Element{constructor(text,value){super('option',{value});this.textContent=text;}}};
}

async function fixture({existing={},intercept}={}) {
  const f=domFixture(),calls=[],messages=[];
  const schools=[{id:a,name:'가온초등학교'},{id:b,name:'나래초등학교'}],members=new Map(Object.entries(existing));
  let issuedNumber=0;
  async function request(path,method='GET',body){
    calls.push({path,method,body:body===undefined?undefined:plain(body)});
    if(intercept){const result=intercept(path,method,body);if(result!==undefined)return await result;}
    if(path==='schools'&&method==='GET')return {schools:plain(schools)};
    if(path==='schools'&&method==='POST'){schools.push({id:'33333333-3333-4333-8333-333333333333',name:body.name});return schools.at(-1);}
    const route=/^schools\/([^/]+)\/students(?:\/([^/]+)(\/reset)?)?$/.exec(path);
    if(!route)throw new Error(`Unexpected request ${method} ${path}`);
    const school=route[1];if(!members.has(school))members.set(school,[]);
    if(method==='GET')return {students:plain(members.get(school))};
    if(method==='POST'&&!route[2]){
      const students=body.students.map(row=>{
        issuedNumber+=1;return {...plain(row),id:`account-${issuedNumber}`,username:`mtest${issuedNumber}`,temporaryPassword:`Temp-safe-${issuedNumber}`};
      });
      members.get(school).push(...students.map(({temporaryPassword,displayName,...row})=>({...row,display_name:displayName,class_name:`${row.grade}학년 ${row.classNumber}반 ${row.studentNumber}번`})));
      return {students};
    }
    if(method==='PATCH'){
      const row=members.get(school).find(member=>member.id===route[2]);assert.ok(row);Object.assign(row,body,{display_name:body.displayName,class_name:`${body.grade}학년 ${body.classNumber}반 ${body.studentNumber}번`});return {ok:true};
    }
    if(method==='POST'&&route[3])return {temporaryPassword:'Reset-safe-password'};
    throw new Error(`Unexpected request ${method} ${path}`);
  }
  const context=vm.createContext({...f,Blob,TextDecoder,console,confirm:()=>true,setTimeout:()=>0,fetch:async(url,options)=>{assert.equal(url,'/api/me');assert.equal(options.credentials,'same-origin');return {ok:true,json:async()=>({user:{name:'테스트',role:'admin'}})};}});
  vm.runInContext(helper,context);vm.runInContext(controller,context);
  f.window.AccountManager.init({request,message:value=>messages.push(value),clearStudent(){},refreshStudent(){}});
  await f.node('manager-tab').click();
  async function select(id){f.node('schools').value=id;await f.node('schools').onchange();}
  function paste(text,{grade=2,classNumber=1,mode='class'}={}){
    f.node('roster-mode').value=mode;f.node('roster-mode').onchange();
    f.node('roster-grade').value=grade;f.node('roster-class').value=classNumber;f.node('roster-text').value=text;f.node('roster-text').oninput();
    f.node('preview-roster').click();
  }
  async function submit(id){f.node(id).onsubmit({preventDefault(){}});await tick();await tick();}
  function hide(){f.document.visibilityState='hidden';for(const fn of f.listeners.visibilitychange||[])fn();}
  return {...f,calls,messages,members,select,paste,submit,hide,async issue(){f.node('new-students-confirm').checked=true;await submit('roster-form');}};
}

test('one class paste previews numbers, posts structured rows and downloads issued credentials',async()=>{
  const f=await fixture();await f.select(a);f.paste('번호\t이름\n1\t김하나\n2\t이두나');
  assert.equal(f.node('roster-preview').hidden,false);assert.equal(f.node('roster-preview-rows').children.length,2);assert.match(f.node('roster-summary').textContent,/총 2명.*2학년 1반 2명/);
  assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
  await f.issue();
  const post=f.calls.find(call=>call.method==='POST');assert.equal(post.path,`schools/${a}/students`);
  assert.deepEqual(post.body.students,[{grade:2,classNumber:1,studentNumber:1,displayName:'김하나'},{grade:2,classNumber:1,studentNumber:2,displayName:'이두나'}]);
  assert.equal(f.node('issued').hidden,false);f.node('download-issued').click();
  const file=f.downloads.at(-1),csv=await file.blob.text();
  assert.match(file.name,/가온초등학교_발급계정.*\.csv$/);assert.match(csv,/"가온초등학교","2","1","1","김하나","mtest1","Temp-safe-1"/);assert.match(csv,/"임시 비밀번호"/);
  await f.node('download-students').click();
  const list=await f.downloads.at(-1).blob.text();assert.match(list,/"아이디"/);assert.doesNotMatch(list,/비밀번호|Temp-safe/);
});

test('school mode accepts multiple classes and preserves each grade/class/number',async()=>{
  const f=await fixture();await f.select(a);f.paste('학년,반,번호,이름\n2,1,1,김하나\n3,2,1,김하나',{mode:'school'});await f.issue();
  const rows=f.calls.find(call=>call.method==='POST').body.students;
  assert.deepEqual(rows.map(row=>[row.grade,row.classNumber,row.studentNumber]),[[2,1,1],[3,2,1]]);
});

test('duplicate seats are blocked before issuing, and editing pasted text invalidates preview',async()=>{
  const f=await fixture({existing:{[a]:[{id:'existing',grade:2,classNumber:1,studentNumber:1,display_name:'기존 학생',username:'mexisting',class_name:'2학년 1반 1번'}]}});await f.select(a);
  f.paste('1,김하나');assert.equal(f.node('issue-accounts').disabled,true);assert.match(f.messages.at(-1),/이미 등록/);
  f.paste('2,김하나\n2,이두나');assert.equal(f.node('issue-accounts').disabled,true);assert.match(f.messages.at(-1),/중복/);
  f.paste('2,김하나');assert.equal(f.node('issue-accounts').disabled,false);
  f.node('roster-text').value='3,이두나';f.node('roster-text').oninput();assert.equal(f.node('issue-accounts').disabled,true);
  await f.issue();assert.equal(f.calls.filter(call=>call.method==='POST').length,0);assert.match(f.messages.at(-1),/명단 확인/);
});

test('a late school A roster cannot replace the currently selected school B',async()=>{
  let resolveA;const f=await fixture({existing:{[b]:[{id:'b',grade:3,classNumber:2,studentNumber:4,display_name:'B 학생',username:'mb',class_name:'3학년 2반 4번'}]},intercept(path,method){if(path===`schools/${a}/students`&&method==='GET')return new Promise(resolve=>{resolveA=resolve;});}});
  const first=f.select(a);await tick();await f.select(b);resolveA({students:[{id:'a',display_name:'A 학생',username:'ma',class_name:'이전 반'}]});await first;
  assert.match(f.node('students').textContent,/B 학생/);assert.doesNotMatch(f.node('students').textContent,/A 학생/);
  await f.node('download-students').click();const csv=await f.downloads.at(-1).blob.text();assert.match(csv,/나래초등학교/);assert.doesNotMatch(csv,/A 학생|가온초등학교/);
});

test('school switch clears issued passwords and prevents downloading the previous school batch',async()=>{
  const f=await fixture();await f.select(a);f.paste('1,김하나');await f.issue();assert.match(f.node('issued-values').textContent,/Temp-safe-1/);
  await f.select(b);assert.equal(f.node('issued').hidden,true);assert.equal(f.node('issued-values').textContent,'');f.node('download-issued').click();assert.equal(f.downloads.length,0);
});

test('hidden pages erase issued credentials from DOM and memory',async()=>{
  const f=await fixture();await f.select(a);f.paste('1,김하나');await f.issue();f.hide();
  assert.equal(f.node('issued').hidden,true);assert.equal(f.node('issued-values').textContent,'');
  f.document.visibilityState='visible';f.node('download-issued').click();assert.equal(f.downloads.length,0);
});

test('issuance completed after page hiding cannot put credentials back into the page',async()=>{
  let finish;const f=await fixture({intercept(path,method){if(path===`schools/${a}/students`&&method==='POST')return new Promise(resolve=>{finish=resolve;});}});
  await f.select(a);f.paste('1,김하나');await f.issue();assert.equal(f.node('schools').disabled,true);f.hide();
  finish({students:[{grade:2,classNumber:1,studentNumber:1,displayName:'김하나',username:'late-user',temporaryPassword:'late-secret'}]});await tick();
  assert.equal(f.node('issued-values').textContent,'');assert.equal(f.node('issued').hidden,true);assert.equal(f.node('schools').disabled,false);
});

test('creating school B after selecting A clears the previous school context and registration forms',async()=>{
  const f=await fixture();await f.select(a);f.paste('1,김하나');await f.issue();
  f.node('school-form').elements.schoolName.value='새 학교';await f.submit('school-form');
  assert.equal(f.node('schools').value,'');assert.equal(f.node('roster-form').hidden,true);assert.equal(f.node('manager-form').hidden,true);assert.equal(f.node('member-form').hidden,true);
  assert.equal(f.node('issued').hidden,true);assert.equal(f.node('issued-values').textContent,'');assert.equal(f.node('students').children.length,0);
  f.paste('2,이두나');assert.equal(f.node('issue-accounts').disabled,true);assert.match(f.messages.at(-1),/담당 학교/);
  assert.equal(f.calls.filter(call=>call.method==='POST'&&call.path.endsWith('/students')).length,1);
});

test('legacy membership is shown honestly and editing it uses the same account',async()=>{
  const f=await fixture({existing:{[a]:[{id:'legacy-account',grade:null,classNumber:null,studentNumber:null,display_name:'기존 학생',username:'msame',class_name:'방과후 A반'}]}});await f.select(a);
  assert.match(f.node('students').textContent,/방과후 A반/);const edit=f.node('students').querySelectorAll('button')[0];edit.click();
  assert.match(f.node('member-legacy').textContent,/방과후 A반/);assert.equal(f.node('member-form').elements.grade.value,'');
  for(const [key,value]of Object.entries({displayName:'기존 학생',grade:2,classNumber:1,studentNumber:7}))f.node('member-form').elements[key].value=value;
  await f.submit('member-form');const patch=f.calls.find(call=>call.method==='PATCH');
  assert.equal(patch.path,`schools/${a}/students/legacy-account`);assert.deepEqual(patch.body,{displayName:'기존 학생',grade:2,classNumber:1,studentNumber:7});assert.ok(!('student_id' in patch.body));assert.equal(f.members.get(a)[0].username,'msame');
});

test('CSV file import uses the real parser and refuses unsupported spreadsheet binaries',async()=>{
  const f=await fixture();await f.select(a);f.paste('',{mode:'school'});
  const bytes=new TextEncoder().encode('학년,반,번호,이름\r\n2,3,4,김하나');f.node('roster-file').files=[{name:'명단.csv',size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer}];
  await f.node('roster-file').onchange();assert.equal(f.node('roster-preview-rows').children.length,1);assert.match(f.node('roster-summary').textContent,/2학년 3반 1명/);
  f.node('roster-file').files=[{name:'명단.xlsx',size:20}];await f.node('roster-file').onchange();assert.equal(f.node('issue-accounts').disabled,true);assert.match(f.messages.at(-1),/CSV UTF-8/);
});

test('lost school authorization clears cached names and issued passwords instead of downloading them',async()=>{
  let deny=false;const f=await fixture({intercept(path,method){if(deny&&path===`schools/${a}/students`&&method==='GET')return Promise.reject(Object.assign(new Error('학교 관리 권한이 없습니다.'),{status:403}));}});
  await f.select(a);f.paste('1,김하나');await f.issue();deny=true;await f.node('download-students').click();
  assert.equal(f.downloads.length,0);assert.equal(f.node('schools').value,'');assert.equal(f.node('students').children.length,0);assert.equal(f.node('issued-values').textContent,'');assert.equal(f.node('issued').hidden,true);assert.equal(f.node('roster-form').hidden,true);
});

test('an obsolete school A authorization error cannot clear the active school B context',async()=>{
  let rejectA;const f=await fixture({existing:{[b]:[{id:'b',grade:3,classNumber:2,studentNumber:4,display_name:'B 학생',username:'mb',class_name:'3학년 2반 4번'}]},intercept(path,method){if(path===`schools/${a}/students`&&method==='GET')return new Promise((resolve,reject)=>{rejectA=reject;});}});
  const first=f.select(a);await tick();await f.select(b);rejectA(Object.assign(new Error('A 학교 권한 만료'),{status:403}));await first;
  assert.equal(f.node('schools').value,b);assert.match(f.node('students').textContent,/B 학생/);assert.equal(f.node('roster-form').hidden,false);assert.ok(!f.messages.includes('A 학교 권한 만료'));
});
