import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/course-editor.js',import.meta.url),'utf8');
function ui(){
  let html='',saved={revision:null,plan:null},fail=false;const routes=[],nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',disabled:false,scrollIntoView(){}});return nodes.get(id);};
  const root={querySelector:node,querySelectorAll:()=>[]};
  const program={id:71,title:'수업 제목',description:'소개',grade:'초5'};
  const ctx={Map,Object,Array,String,Number,crypto:{randomUUID},window:{addEventListener(){}},location:{hash:'#/manage/71'},GRADES:['초5'],isAdmin:()=>true,esc:s=>String(s??'').replaceAll('<','&lt;'),route:(pattern,fn)=>routes.push({pattern,fn}),document:{getElementById:id=>node('#'+id),querySelector:()=>root,querySelectorAll:()=>[]},shell:(title,content)=>{html=content;},api:async(method,path,body)=>{if(path.endsWith('/course-plan')){if(method==='PUT'){if(fail)throw new Error('검증용 네트워크 오류');saved={revision:randomUUID(),plan:structuredClone(body.plan)};}return structuredClone(saved);}return{program:{...program},lessons:[{id:1,title:'원본 활동'}],files:[],links:[]};}};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  return{open:()=>routes[0].fn('71'),node,get html(){return html;},get saved(){return saved;},fail(){fail=true;}};
}
test('new registration renders the four materials, arbitrary configuration control and record design',async()=>{const u=ui();await u.open();for(const t of ['수업 등록','운영 구성','구성 추가','학생 웹앱','수업 PPT','활동지','교안','활동 기록 설계'])assert.ok(u.html.includes(t));assert.ok(!u.html.includes('핵심 3차시'));});
test('registration shows one step at a time and advances without losing the draft',async()=>{const u=ui();await u.open();assert.equal(u.node('#ce-step-0').hidden,false);assert.equal(u.node('#ce-step-1').hidden,true);u.node('#ce-title').oninput({target:{value:'한 번 입력한 수업명'}});u.node('#ce-next').onclick();assert.equal(u.node('#ce-step-0').hidden,true);assert.equal(u.node('#ce-step-1').hidden,false);await u.node('#ce-quick-save').onclick();assert.ok(u.html.includes('한 번 입력한 수업명'));assert.equal(u.node('#ce-step-4').hidden,false);assert.ok(!u.html.includes('class="ce-sidebar"'));});
test('base information survives redraw when adding sessions; draft persists through actual save handler',async()=>{const u=ui();await u.open();u.node('#ce-title').oninput({target:{value:'변경된 수업'}});u.node('#ce-add-session').onclick();assert.ok(u.html.includes('변경된 수업'));await u.node('#ce-save').onclick();assert.equal(u.saved.plan.variants[0].sessions.length,2);assert.match(u.node('#ce-message').textContent,/저장했습니다/);await u.open();assert.ok(u.html.includes('2차시'));});
test('save failure exits saving state and permits a subsequent retry',async()=>{const u=ui();await u.open();u.fail();await u.node('#ce-save').onclick();assert.equal(u.node('#ce-message').textContent,'검증용 네트워크 오류');assert.equal(u.node('#ce-save').disabled,false);await u.node('#ce-save').onclick();assert.equal(u.node('#ce-message').textContent,'검증용 네트워크 오류');});
test('incomplete publication is blocked before API persistence',async()=>{const u=ui();await u.open();u.node('#ce-title').oninput({target:{value:''}});await u.node('#ce-publish').onclick();assert.match(u.node('#ce-message').textContent,/수업명을 입력/);assert.equal(u.saved.plan,null);});
