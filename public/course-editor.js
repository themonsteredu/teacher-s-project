'use strict';
/* Course registration. Metadata is not an ingest authorization or a student submission. */
const courseDrafts = new Map();
const COURSE_SLOTS = {app:'학생 웹앱',ppt:'수업 PPT',worksheet:'활동지',guide:'교안'};
const blankCourseSession = () => ({title:'',minutes:40,sourceLessons:[],bridge:'',assets:Object.fromEntries(Object.keys(COURSE_SLOTS).map(k=>[k,{url:'',fileId:''}])),submissions:{enabled:true,types:['photo','document','text'],sharing:'teacher'},record:{mode:'none',completion:'',original:'',process:''}});
window.addEventListener('beforeunload', e => { if([...courseDrafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue='';} });
function courseProblems(plan) {
  const out=[];
  plan.variants.forEach(v=>v.sessions.forEach((s,i)=>{
    const label=`${v.name} · ${i+1}차시`;
    if(!s.title.trim()) out.push(`${label}: 활동 제목`);
    if(!Object.values(s.assets).some(a=>a.url||a.fileId)&&!s.submissions?.enabled) out.push(`${label}: 자료 연결 또는 학생 제출 받기`);
    if(s.submissions.enabled&&!s.submissions.types.length) out.push(`${label}: 학생 제출 형식`);
    if(s.record.mode==='submission'&&(!s.submissions.enabled||!s.record.completion.trim()||!s.record.original.trim()||!s.record.process.trim())) out.push(`${label}: 활동 기록 설정`);
  })); return out;
}
function coursePreviewHtml(plan, files, index=0) {
  const v=plan.variants[index];
  return `<div class="ce-preview"><p class="ce-kicker">수업 구성 미리보기</p><h2>${esc(v.name)} · ${v.sessions.length}차시</h2><p class="muted">총 ${v.sessions.reduce((sum,s)=>sum+s.minutes,0)}분 · 자료 연결 확인용</p>${v.sessions.map((s,i)=>`<section><h3>${i+1}차시 · ${esc(s.title||'활동 제목 미입력')}</h3><p>${esc(s.bridge)}</p><div class="ce-preview-assets">${Object.entries(COURSE_SLOTS).map(([k,name])=>{
    const a=s.assets[k];const f=files.find(f=>String(f.id)===String(a.fileId));
    if(a.fileId) return `<span>${name}: ${esc(f?.name||'삭제된 파일 — 다시 연결 필요')}</span>`;
    return `<span>${name}: ${a.url?'주소 연결됨':'미등록'}</span>`;
  }).join('')}</div><p class="small muted">${s.submissions?.enabled?`학생 제출: ${s.submissions.types.map(t=>({photo:'사진',document:'PDF·문서',text:'글'}[t])).join(' · ')} / ${s.submissions.sharing==='class'?'교사 확인 후 우리 반 공개':'선생님만 열람'}`:'학생 제출 받지 않음'}</p><p class="small muted">${s.record.mode==='submission'?`Hub 제출 시 진로기록: ${esc(s.record.process||'설명 미입력')} · 저장 결과는 내 진로기록에서 확인`:'진로기록 남기지 않음'}</p>${s.record.mode==='submission'?`<p class="small">제출 안내: ${esc(s.record.completion||'미입력')}<br>받을 내용: ${esc(s.record.original||'미입력')}</p>`:''}</section>`).join('')}</div>`;
}
route(/^#\/manage\/(\d+)$/, async id => {
  if(!isAdmin()){location.hash='#/';return;}
  const [data,saved]=await Promise.all([api('GET',`/api/programs/${id}`),api('GET',`/api/programs/${id}/course-plan`)]);
  let draft=courseDrafts.get(id);
  const p=draft?.dirty&&draft.info ? draft.info : data.program;
  if(!draft || !draft.dirty){
    const plan=saved.plan||{version:1,appUrl:'',variants:[{id:crypto.randomUUID(),name:'전체 과정',sessions:(data.lessons.length?data.lessons:[null]).map(l=>({...blankCourseSession(),title:l?.title||'',sourceLessons:l?[String(l.id)]:[]}))}]};
    draft={plan,info:p,revision:saved.revision,dirty:false,selected:0,lesson:0,step:0,alternative:1};courseDrafts.set(id,draft);
  }
  draft.plan.variants.forEach(v=>v.sessions.forEach(s=>{s.submissions ||= {enabled:true,types:['photo','document','text'],sharing:'teacher'};}));
  let busy=false;
  const changed=()=>{draft.dirty=true;const label=document.getElementById('ce-status');if(label)label.textContent='저장하지 않은 변경사항';};
  const field=(label,value,attrs='')=>`<label>${label}<input value="${esc(value)}" ${attrs}></label>`;
  const sessionSummary = s => `${s.minutes}분 · 자료 ${Object.values(s.assets).filter(a=>a.url||a.fileId).length}개 · ${s.record.mode==='submission'?'진로기록 설정':s.submissions.enabled?'학생 제출':'자료 활용'}`;
  function lessonEditor(v) {
    const i=draft.lesson,s=v.sessions[i];
    return `<div class="ce-lesson-layout"><aside class="ce-lesson-rail" aria-label="차시 목록"><div class="ce-panel-heading"><h3>차시 목록 <span>${v.sessions.length}</span></h3></div><div class="ce-lesson-list">${v.sessions.map((x,j)=>`<button type="button" data-lesson="${j}" aria-pressed="${i===j}"><span class="ce-lesson-number">${j+1}</span><span><strong data-lesson-title="${j}">${esc(x.title||'새 차시')}</strong><small data-lesson-summary="${j}">${esc(sessionSummary(x))}</small></span></button>`).join('')}</div><button type="button" class="btn btn-soft btn-sm" id="ce-add-session">＋ 차시 추가</button></aside>
    <div class="ce-lesson-detail"><label class="ce-mobile-lessons">편집할 차시<select id="ce-lesson-select">${v.sessions.map((x,j)=>`<option value="${j}" ${j===i?'selected':''}>${j+1}차시 · ${esc(x.title||'새 차시')}</option>`).join('')}</select></label><button type="button" class="btn btn-soft btn-sm ce-mobile-add" id="ce-add-session-mobile">＋ 차시 추가</button><div class="ce-detail-heading"><p class="ce-kicker">${i+1}차시 편집</p><div class="ce-order-actions"><button type="button" data-move="${i}" data-direction="-1" ${i===0?'disabled':''} aria-label="${i+1}차시 위로">↑</button><button type="button" data-move="${i}" data-direction="1" ${i===v.sessions.length-1?'disabled':''} aria-label="${i+1}차시 아래로">↓</button><button type="button" data-remove="${i}" ${v.sessions.length===1?'disabled':''}>차시 제외</button></div></div>
    <div class="ce-lesson-basics">${field('활동 제목',s.title,`data-session="${i}" data-field="title" placeholder="예: 식물의 특징 관찰하기" maxlength="120"`)}${field('수업 시간 (분)',s.minutes,`type="number" data-session="${i}" data-field="minutes" min="5" max="240"`)}</div>
    <section class="ce-detail-section"><h3>수업 자료</h3><p class="muted">필요한 자료만 연결하세요. 같은 파일을 여러 구성에서 사용할 수 있습니다.</p><div class="ce-materials">${Object.entries(COURSE_SLOTS).map(([k,name])=>{const a=s.assets[k],f=data.files.find(f=>String(f.id)===String(a.fileId));return `<div class="ce-material"><div><strong>${name}</strong><small>${esc(a.fileId?f?.name||'파일 확인 필요':a.url||'아직 연결한 자료가 없어요')}</small></div><button type="button" class="ce-asset-button" data-asset="${i}:${k}" aria-label="${name} ${a.fileId||a.url?'변경':'연결'}">${a.fileId||a.url?'변경':'＋ 연결'}</button></div>`;}).join('')}</div></section>
    <section class="ce-detail-section"><h3>수업 시작 안내</h3><label>학생에게 보여줄 안내·생략한 과정의 연결 설명<textarea data-session="${i}" data-field="bridge" rows="3" maxlength="2000" placeholder="예: 앞 차시의 조사 대신 제공한 관찰 사진을 보고 시작하세요.">${esc(s.bridge)}</textarea></label><p class="ce-note">짧은 구성에서는 건너뛴 활동을 이 안내와 대체 PPT·활동지로 보완하세요.</p>${data.lessons.length?`<details class="ce-source-links"><summary>기존 공통 차시 연결</summary><label>함께 사용할 공통 차시<select multiple data-sources="${i}">${data.lessons.map(l=>`<option value="${l.id}" ${s.sourceLessons.includes(String(l.id))?'selected':''}>${esc(l.title)}</option>`).join('')}</select></label></details>`:''}</section>
    <section class="ce-detail-section"><h3>학생 제출</h3><label class="ce-check"><input type="checkbox" data-sub-enabled="${i}" ${s.submissions.enabled?'checked':''}>이 차시에서 학생 제출 받기</label><div class="ce-submission-fields" id="ce-submission-fields" ${s.submissions.enabled?'':'hidden'}><div class="ce-checks">${Object.entries({photo:'사진',document:'PDF·문서',text:'글·웹앱 결과 붙여넣기'}).map(([k,n])=>`<label class="ce-check"><input type="checkbox" data-sub-type="${i}:${k}" ${s.submissions.types.includes(k)?'checked':''}>${n}</label>`).join('')}</div><label>게시판 공개 범위<select data-sub-sharing="${i}"><option value="teacher" ${s.submissions.sharing==='teacher'?'selected':''}>선생님만 열람</option><option value="class" ${s.submissions.sharing==='class'?'selected':''}>교사 확인 후 우리 반 공개</option></select></label><p class="ce-note">학생은 활동지를 촬영하거나 결과 파일·글을 제출합니다. 새 제출물은 선생님이 먼저 확인합니다.</p></div></section>
    <section class="ce-detail-section"><h3>진로기록</h3><label>기록 방식<select data-record="${i}" data-field="mode" ${s.submissions.enabled?'':'disabled'}><option value="none" ${s.record.mode==='none'?'selected':''}>게시판 제출만 · 진로기록 남기지 않음</option><option value="submission" ${s.record.mode==='submission'?'selected':''}>Hub 학생 제출을 진로기록으로 남김</option></select></label><p id="ce-record-hint" class="muted">${s.submissions.enabled?'실제 저장 결과는 학생의 내 진로기록에서 확인합니다.':'학생 제출을 켜면 진로기록을 설정할 수 있습니다.'}</p><div class="ce-record-fields" id="ce-record-fields" ${s.record.mode==='submission'?'':'hidden'}>${field('학생에게 보여줄 제출 안내',s.record.completion,`data-record="${i}" data-field="completion" placeholder="예: 식물 관찰 내용과 활동지를 제출하세요." maxlength="500"`)}${field('학생에게 받을 내용',s.record.original,`data-record="${i}" data-field="original" placeholder="예: 식물 이름, 관찰 특징, 활동지 사진" maxlength="1000"`)}${field('기록에 남길 한 줄 활동 설명',s.record.process,`data-record="${i}" data-field="process" placeholder="예: 식물을 관찰하고 특징을 기록함" maxlength="300"`)}<div class="ce-record-example"><span>활동 설명 미리보기</span><p id="ce-record-example">${esc(s.record.process||'한 줄 활동 설명을 입력하세요.')}</p><small>학생이 제출한 글·첨부파일과 함께 남깁니다. 정답·점수는 완료 조건으로 사용하지 않습니다.</small></div></div><p class="ce-note">외부 웹앱 안의 제출은 앱별 연결이 필요합니다. 여기서는 Hub 게시판에 제출한 결과를 설정합니다.</p></section></div></div>`;
  }
  function draw(){
    draft.step=Math.min(3,Math.max(0,draft.step||0));
    draft.selected=Math.min(draft.selected,draft.plan.variants.length-1);
    const plan=draft.plan,v=plan.variants[draft.selected];
    draft.lesson=Math.min(Math.max(0,draft.lesson||0),v.sessions.length-1);
    const editable=draft.step===1||draft.step===2&&draft.selected>0;
    shell('수업 등록',`<div class="course-editor"><div class="ce-main">
    <header class="ce-head"><div><h1>커리큘럼 등록</h1><p>차시별 자료와 활동을 한 번 준비하고, 수업 시간에 맞게 구성하세요.</p></div><span class="ce-status" id="ce-status" role="status">${draft.dirty?'저장하지 않은 변경사항':'구성 편집'}</span></header>
    <nav class="ce-steps" aria-label="등록 순서">${['기본정보','원본 차시','수업 구성','미리보기·공개'].map((t,i)=>`<button type="button" data-step="${i}" aria-current="${draft.step===i?'step':'false'}"><b>${i+1}</b><span>${t}</span></button>`).join('')}</nav>
    <section class="ce-section" id="ce-step-0" ${draft.step===0?'':'hidden'}><p class="ce-kicker">01 · 프로그램 소개</p><h2>어떤 수업인가요?</h2><div class="ce-basic">${field('수업명',p.title,'id="ce-title" maxlength="200" placeholder="예: AI로 발견하는 우리 주변 생태계"')}<label>대상 학년<select id="ce-grade"><option value="">미지정</option>${GRADES.map(g=>`<option ${g===p.grade?'selected':''}>${g}</option>`).join('')}</select></label></div><label>수업 소개<textarea id="ce-description" rows="3">${esc(p.description)}</textarea></label><div class="ce-common-app">${field('공통 웹앱 주소 (선택)',plan.appUrl,'id="ce-app" type="url" placeholder="https://…"')}<p class="muted">웹앱 하나에 여러 차시가 있어도 주소는 한 번만 입력하세요. 차시마다 다른 주소도 연결할 수 있습니다.</p><button type="button" class="btn btn-soft btn-sm" id="ce-common-app">비어 있는 차시에 공통 웹앱 연결</button></div></section>
    <section class="ce-stage-heading" id="ce-step-1" ${draft.step===1?'':'hidden'}><p class="ce-kicker">02 · 원본 차시 만들기</p><h2>전체 과정의 자료와 활동을 준비하세요.</h2><p class="muted">먼저 차시 제목을 등록하고, 각 차시에서 자료·학생 제출·진로기록을 함께 설정합니다. 기존 프로그램은 첫 번째 구성을 원본으로 사용합니다.</p></section>
    <section class="ce-stage-heading" id="ce-step-2" ${draft.step===2?'':'hidden'}><p class="ce-kicker">03 · 수업 구성 만들기</p><h2>필요한 차시를 골라 수업에 맞추세요.</h2><p class="muted">1차시 단독 수업부터 3·5·10차시까지 자유롭게 만듭니다. 복사한 자료와 안내를 수정해도 원본 구성은 유지됩니다.</p><div class="ce-variants" aria-label="운영 구성">${plan.variants.slice(1).map((x,j)=>`<button type="button" data-variant="${j+1}" aria-pressed="${draft.selected===j+1}"><strong data-variant-name="${j+1}">${esc(x.name)}</strong><small>${x.sessions.length}차시</small></button>`).join('')}<button type="button" id="ce-add-variant">＋ 구성 추가</button></div>${plan.variants.length===1?'<div class="ce-empty"><h3>원본 과정만으로도 수업할 수 있어요.</h3><p>짧은 과정이 필요하면 ‘구성 추가’에서 차시를 고르세요. 원본만 사용할 때는 다음으로 넘어가세요.</p></div>':''}</section>
    <section id="ce-lesson-workspace" ${editable?'':'hidden'}><div class="ce-workspace-tools"><div class="ce-panel-heading">${field(draft.selected===0?'원본 구성 이름':'수업 구성 이름',v.name,'id="ce-variant-name" maxlength="80"')}<button type="button" class="btn btn-ghost btn-sm" id="ce-delete-variant" ${draft.selected===0?'disabled hidden':''}>구성 삭제</button></div><div class="ce-toolbar"><button type="button" class="btn btn-soft btn-sm" id="ce-outline">차시 목록 붙여넣기</button><button type="button" class="btn btn-soft btn-sm" id="ce-bulk-files">자료 여러 개 등록</button><a class="ce-library-link" href="#/resources/${id}">공통 자료 관리</a></div></div>${lessonEditor(v)}</section>
    <section class="ce-section ce-review" id="ce-step-3" ${draft.step===3?'':'hidden'}><p class="ce-kicker">04 · 미리보기·공개</p><h2>교사가 사용할 수업 구성을 확인하세요.</h2><label>미리 볼 구성<select id="ce-review-variant">${plan.variants.map((x,i)=>`<option value="${i}" ${i===draft.selected?'selected':''}>${esc(x.name)} · ${x.sessions.length}차시${i===0?' (원본)':''}</option>`).join('')}</select></label><div class="ce-review-preview">${coursePreviewHtml(plan,data.files,draft.selected)}</div><p class="ce-note">등록한 자료와 제출·기록 설정을 확인하는 화면입니다. 외부 웹앱의 결과 저장은 앱별 연결 상태를 별도로 확인하세요.</p><div class="ce-actions"><button type="button" class="btn btn-soft" id="ce-preview">크게 미리보기</button><button type="button" class="btn btn-ghost" id="ce-save">임시 저장</button><button type="button" class="btn btn-primary" id="ce-publish">자료 확인 후 공개</button></div></section>
    <div class="ce-step-footer"><p id="ce-message" role="status" aria-live="polite"></p><div class="ce-step-actions"><button type="button" class="btn btn-ghost" id="ce-previous" ${draft.step===0?'disabled':''}>이전</button><button type="button" class="btn btn-soft" id="ce-quick-save">임시 저장</button><button type="button" class="btn btn-primary" id="ce-next" ${draft.step===3?'disabled':''}>${draft.step===2?'미리보기':'다음'}</button></div></div></div></div>`);
    bind();
  }
  function bind(){
    const root=document.querySelector('.course-editor');
    const showStep=index=>{
      draft.step=index;draft.lesson=0;
      if(index===1)draft.selected=0;
      if(index===2)draft.selected=draft.plan.variants.length>1?Math.min(draft.alternative||1,draft.plan.variants.length-1):0;
      draw();document.querySelector(`[data-step="${index}"]`)?.focus();
    };
    root.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>showStep(Number(b.dataset.step)));
    root.querySelector('#ce-previous').onclick=()=>showStep(Math.max(0,draft.step-1));
    root.querySelector('#ce-next').onclick=()=>showStep(Math.min(3,draft.step+1));
    root.querySelector('#ce-quick-save').onclick=()=>save(false);
    root.querySelectorAll('[data-variant]').forEach(b=>b.onclick=()=>{draft.selected=Number(b.dataset.variant);draft.alternative=draft.selected;draft.lesson=0;draw();});
    const focusLesson=()=>document.querySelector('[data-session][data-field="title"]')?.focus();
    const selectLesson=index=>{if(!draft.plan.variants[draft.selected].sessions[index])return;draft.lesson=index;draw();focusLesson();};
    root.querySelectorAll('[data-lesson]').forEach(b=>b.onclick=()=>selectLesson(Number(b.dataset.lesson)));
    root.querySelector('#ce-lesson-select').onchange=e=>selectLesson(Number(e.target.value));
    root.querySelector('#ce-review-variant').onchange=e=>{draft.selected=Number(e.target.value);if(draft.selected>0)draft.alternative=draft.selected;draft.lesson=0;draw();};
    const v=draft.plan.variants[draft.selected];
    const refreshSummary=i=>{
      const s=v.sessions[i];
      const title=root.querySelector(`[data-lesson-title="${i}"]`);if(title)title.textContent=s.title||'새 차시';
      const summary=root.querySelector(`[data-lesson-summary="${i}"]`);if(summary)summary.textContent=sessionSummary(s);
      const option=root.querySelector(`#ce-lesson-select option[value="${i}"]`);if(option)option.textContent=`${i+1}차시 · ${s.title||'새 차시'}`;
    };
    root.querySelector('#ce-title').oninput=e=>{p.title=e.target.value;changed();};
    root.querySelector('#ce-grade').onchange=e=>{p.grade=e.target.value;changed();};
    root.querySelector('#ce-description').oninput=e=>{p.description=e.target.value;changed();};
    root.querySelector('#ce-app').oninput=e=>{draft.plan.appUrl=e.target.value;changed();};
    root.querySelector('#ce-variant-name').oninput=e=>{v.name=e.target.value;changed();const label=root.querySelector(`[data-variant-name="${draft.selected}"]`);if(label)label.textContent=v.name||'구성 이름';};
    root.querySelectorAll('[data-session]').forEach(el=>el.oninput=e=>{const i=Number(el.dataset.session);v.sessions[i][el.dataset.field]=el.dataset.field==='minutes'?Number(e.target.value):e.target.value;changed();refreshSummary(i);});
    root.querySelectorAll('[data-sources]').forEach(el=>el.onchange=()=>{v.sessions[Number(el.dataset.sources)].sourceLessons=Array.from(el.selectedOptions,o=>o.value);changed();});
    root.querySelectorAll('[data-sub-enabled]').forEach(el=>el.onchange=()=>{const i=Number(el.dataset.subEnabled),s=v.sessions[i];s.submissions.enabled=el.checked;if(!el.checked)s.record.mode='none';root.querySelector('#ce-submission-fields').hidden=!el.checked;root.querySelector('#ce-record-fields').hidden=s.record.mode!=='submission';const mode=root.querySelector(`[data-record="${i}"][data-field="mode"]`);mode.disabled=!el.checked;mode.value=s.record.mode;root.querySelector('#ce-record-hint').textContent=el.checked?'실제 저장 결과는 학생의 내 진로기록에서 확인합니다.':'학생 제출을 켜면 진로기록을 설정할 수 있습니다.';changed();refreshSummary(i);});
    root.querySelectorAll('[data-sub-sharing]').forEach(el=>el.onchange=()=>{v.sessions[Number(el.dataset.subSharing)].submissions.sharing=el.value;changed();});
    root.querySelectorAll('[data-sub-type]').forEach(el=>el.onchange=()=>{const [i,k]=el.dataset.subType.split(':'),s=v.sessions[Number(i)].submissions;if(!el.checked&&s.types.length===1&&s.types.includes(k)){el.checked=true;toast('제출 형식은 하나 이상 선택하세요.',true);return;}s.types=el.checked?[...new Set([...s.types,k])]:s.types.filter(t=>t!==k);changed();});
    root.querySelectorAll('[data-record]').forEach(el=>el.oninput=e=>{const i=Number(el.dataset.record),s=v.sessions[i];s.record[el.dataset.field]=e.target.value;if(el.dataset.field==='mode')root.querySelector('#ce-record-fields').hidden=s.record.mode!=='submission';if(el.dataset.field==='process')root.querySelector('#ce-record-example').textContent=s.record.process||'한 줄 활동 설명을 입력하세요.';changed();refreshSummary(i);});
    root.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.move),j=i+Number(b.dataset.direction);if(j<0||j>=v.sessions.length)return;[v.sessions[i],v.sessions[j]]=[v.sessions[j],v.sessions[i]];draft.lesson=j;changed();draw();focusLesson();});
    root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{if(v.sessions.length>1&&confirm('이 구성에서 차시를 제외할까요? 업로드한 파일과 다른 구성은 유지됩니다.')){const i=Number(b.dataset.remove);v.sessions.splice(i,1);draft.lesson=Math.min(i,v.sessions.length-1);changed();draw();}});
    root.querySelector('#ce-common-app').onclick=()=>{try{const n=CourseAuthoring.commonApp(draft.plan);changed();draw();toast(`${n}개 차시에 웹앱을 연결했습니다.`);}catch(e){toast(e.message,true);}};
    root.querySelector('#ce-outline').onclick=()=>{
      const modal=openModal('<h3>원본 차시 한꺼번에 등록</h3><p>차시 제목을 한 줄씩 입력하세요. 엑셀에서 제목과 웹앱 주소 두 열을 함께 붙여넣어도 됩니다.</p><textarea id="co-lines" rows="10" placeholder="1차시 · 문제 발견&#10;2차시 · 자료 조사"></textarea><p>기존 차시는 유지하고 뒤에 추가합니다.</p><div class="m-actions"><button class="btn btn-ghost" id="co-cancel">취소</button><button class="btn btn-primary" id="co-add">차시 추가</button></div><p id="co-error" role="status"></p>');
      modal.querySelector('#co-cancel').onclick=()=>modal.remove();
      modal.querySelector('#co-add').onclick=()=>{try{const sessions=CourseAuthoring.outline(modal.querySelector('#co-lines').value,blankCourseSession,draft.plan.appUrl);const empty=v.sessions.length===1&&JSON.stringify(v.sessions[0])===JSON.stringify(blankCourseSession());if((empty?0:v.sessions.length)+sessions.length>50)throw new Error('구성당 최대 50차시입니다.');v.sessions=empty?sessions:[...v.sessions,...sessions];changed();modal.remove();draw();}catch(e){modal.querySelector('#co-error').textContent=e.message;}};
    };
    root.querySelector('#ce-add-session').onclick=root.querySelector('#ce-add-session-mobile').onclick=()=>{if(v.sessions.length>=50)return toast('구성당 최대 50차시입니다.',true);const s=blankCourseSession();s.assets.app.url=draft.plan.appUrl.trim();v.sessions.push(s);draft.lesson=v.sessions.length-1;changed();draw();};
    root.querySelector('#ce-delete-variant').onclick=()=>{if(draft.selected>0&&confirm('이 운영 구성을 삭제할까요? 원본 자료는 유지됩니다.')){draft.plan.variants.splice(draft.selected,1);draft.selected=draft.plan.variants.length>1?Math.min(draft.selected,draft.plan.variants.length-1):0;draft.alternative=draft.selected||1;draft.lesson=0;changed();draw();}};
    root.querySelector('#ce-add-variant').onclick=()=>{
      if(draft.plan.variants.length>=12)return toast('최대 12개 구성을 등록할 수 있습니다.',true);
      const modal=openModal(`<h3>원본에서 운영 구성 만들기</h3><label>구성 이름<input id="cv-name" placeholder="예: 3차시 집중 과정" maxlength="80"></label><label>가져올 구성<select id="cv-source">${draft.plan.variants.map((x,i)=>`<option value="${i}" ${i===draft.selected?'selected':''}>${esc(x.name)} · ${x.sessions.length}차시</option>`).join('')}</select></label><div id="cv-lessons"></div><p>선택한 차시의 웹앱·자료·제출 설정을 복사합니다. 생략한 과정의 시작 자료는 새 구성에서 보완하세요.</p><div class="m-actions"><button class="btn btn-ghost" id="cv-cancel">취소</button><button class="btn btn-primary" id="cv-add">선택한 차시로 만들기</button></div><p id="cv-error" role="status"></p>`);
      const choices=()=>{const source=draft.plan.variants[Number(modal.querySelector('#cv-source').value)];modal.querySelector('#cv-lessons').innerHTML=source.sessions.map((s,i)=>`<label class="ce-choice"><input type="checkbox" value="${i}" data-cv-lesson checked>${i+1}차시 · ${esc(s.title||'제목 미입력')}</label>`).join('');};choices();
      modal.querySelector('#cv-source').onchange=choices;
      modal.querySelector('#cv-cancel').onclick=()=>modal.remove();
      modal.querySelector('#cv-add').onclick=()=>{try{const source=draft.plan.variants[Number(modal.querySelector('#cv-source').value)],indices=Array.from(modal.querySelectorAll('[data-cv-lesson]:checked'),el=>Number(el.value));draft.plan.variants.push(CourseAuthoring.variant(source,indices,crypto.randomUUID(),modal.querySelector('#cv-name').value));draft.selected=draft.plan.variants.length-1;draft.alternative=draft.selected;draft.lesson=0;draft.step=2;changed();modal.remove();draw();}catch(e){modal.querySelector('#cv-error').textContent=e.message;}};
    };
    root.querySelector('#ce-bulk-files').onclick=()=>openCourseFileBatch({programId:id,variant:v,files:data.files,changed,redraw:draw});
    root.querySelectorAll('[data-asset]').forEach(b=>b.onclick=()=>pickAsset(...b.dataset.asset.split(':')));
    root.querySelector('#ce-preview').onclick=()=>{const modal=openModal(coursePreviewHtml(draft.plan,data.files,draft.selected)+'<div class="m-actions"><button class="btn btn-primary" id="cp-close">닫기</button></div>');modal.querySelector('#cp-close').onclick=()=>modal.remove();};
    root.querySelector('#ce-save').onclick=()=>save(false);
    root.querySelector('#ce-publish').onclick=()=>save(true);
  }
  async function save(publish){
    if(busy)return;
    const msg=document.getElementById('ce-message');
    if(!p.title.trim()){msg.textContent='수업명을 입력하세요.';return;}
    if(publish){const problems=courseProblems(draft.plan);if(problems.length){msg.textContent=`공개 전 확인할 항목 ${problems.length}개: ${problems.slice(0,6).join(' / ')}`;return;}}
    busy=true;document.querySelectorAll('.course-editor button,.course-editor input,.course-editor select,.course-editor textarea').forEach(b=>b.disabled=true);
    msg.textContent='저장 중…';
    try{
      const r=await api('PUT',`/api/programs/${id}/course-plan`,{revision:draft.revision,plan:draft.plan,publish});
      draft.revision=r.revision;draft.plan=r.plan;
      await api('PATCH',`/api/programs/${id}`,{title:p.title,grade:p.grade,description:p.description,...(publish?{published:true}:{})});
      draft.dirty=false;draw();document.getElementById('ce-message').textContent=publish?'수업 구성과 자료가 공개되었습니다. 학생 입장·기록 연동은 별도 확인이 필요합니다.':'수업 구성을 저장했습니다. 다른 기기에서도 이어서 편집할 수 있습니다.';
    }catch(e){draw();document.getElementById('ce-message').textContent=e.message;}finally{busy=false;}
  }
  function pickAsset(index,slot){
    const session=draft.plan.variants[draft.selected].sessions[Number(index)], a=session.assets[slot];
    const modal=openModal(`<h3>${Number(index)+1}차시 · ${COURSE_SLOTS[slot]}</h3><label>연결 주소<input id="ca-url" placeholder="https://… 또는 /lessons/…" value="${esc(a.url)}"></label>${slot==='app'&&draft.plan.appUrl?'<button class="btn btn-soft btn-sm" id="ca-common">공통 웹앱 주소 사용</button>':''}<label>기존 수업 링크<select id="ca-link"><option value="">선택하지 않음</option>${data.links.map((l,i)=>`<option value="${i}">${esc(l.label||l.url)}</option>`).join('')}</select></label><label>공통 파일 재사용<select id="ca-file"><option value="">파일 선택하지 않음</option>${data.files.map(f=>`<option value="${f.id}" ${String(f.id)===a.fileId?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label><label>새 파일 업로드<input type="file" id="ca-upload" accept=".pdf,.ppt,.pptx,.doc,.docx,.hwp,.hwpx,.html,.htm,.zip,.png,.jpg,.jpeg,.webp"></label><p class="small muted">업로드 파일은 공통 자료에 보관되어 다른 구성에서도 재사용할 수 있습니다.</p><div class="m-actions"><button class="btn btn-ghost" id="ca-cancel">취소</button><button class="btn btn-ghost" id="ca-clear">연결 해제</button><button class="btn btn-primary" id="ca-apply">연결</button></div><p id="ca-msg" role="status"></p>`);
    const url=modal.querySelector('#ca-url'),file=modal.querySelector('#ca-file');
    modal.querySelector('#ca-common')?.addEventListener('click',()=>{url.value=draft.plan.appUrl;file.value='';});
    modal.querySelector('#ca-link').onchange=e=>{if(e.target.value!==''){url.value=data.links[Number(e.target.value)].url;file.value='';}};
    url.oninput=()=>{file.value='';};file.onchange=()=>{if(file.value)url.value='';};
    modal.querySelector('#ca-cancel').onclick=()=>modal.remove();
    modal.querySelector('#ca-clear').onclick=()=>{session.assets[slot]={url:'',fileId:''};changed();modal.remove();draw();};
    modal.querySelector('#ca-apply').onclick=()=>{const value=url.value.trim();if(value&&!(/^(https:\/\/|\/lessons\/|\/api\/tools\/)/.test(value))){modal.querySelector('#ca-msg').textContent='https:// 자료 주소를 입력하세요.';return;}session.assets[slot]={url:file.value?'':value,fileId:file.value};changed();modal.remove();draw();};
    modal.querySelector('#ca-upload').onchange=async e=>{
      const f=e.target.files[0];if(!f)return;const msg=modal.querySelector('#ca-msg');if(f.size>100*1024*1024||!f.size){msg.textContent='파일은 0MB 초과 100MB 이하여야 합니다.';return;}
      modal.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);msg.textContent='파일 업로드 중…';
      try{const mime=guessMime(f.name,f.type);const sign=await api('POST',`/api/programs/${id}/file-sign`,{name:f.name,size:f.size});const put=await fetch(sign.uploadUrl,{method:'PUT',headers:{'Content-Type':mime,'x-upsert':'true'},body:f});if(!put.ok)throw new Error('파일 업로드에 실패했습니다.');const r=await api('POST',`/api/programs/${id}/file-confirm`,{path:sign.path,name:f.name,size:f.size,mime,lesson_id:null});data.files.push({id:r.id,name:f.name,mime,size:f.size,downloadable:false});session.assets[slot]={url:'',fileId:String(r.id)};changed();modal.remove();draw();}catch(err){msg.textContent=err.message;modal.querySelectorAll('button,input,select').forEach(b=>b.disabled=false);}
    };
  }
  draw();
});
route(/^#\/course\/(\d+)$/, async id=>{
  const [data,saved]=await Promise.all([api('GET',`/api/programs/${id}`),api('GET',`/api/programs/${id}/course-plan`)]);
  if(!saved.plan){shell('운영 구성',`<div class="card"><h2>등록된 운영 구성이 없습니다.</h2><p>기존 수업 자료는 그대로 사용할 수 있습니다.</p><a class="btn btn-soft" href="#/program/${id}">수업 자료로 돌아가기</a></div>`);return;}
  let selected=0;
  const draw=()=>{
    const plan=saved.plan,v=plan.variants[selected];
    shell('구성별 수업 자료',`<div class="card"><h1>${esc(data.program.title)}</h1><p class="muted">교사용 구성별 자료 · 학생에게 공유할 자료는 수업 보드에서 별도로 선택합니다.</p><label>운영 구성<select id="course-selection">${plan.variants.map((x,i)=>`<option value="${i}" ${i===selected?'selected':''}>${esc(x.name)} · ${x.sessions.length}차시</option>`).join('')}</select></label>${coursePreviewHtml(plan,data.files,selected)}<div class="deck-list">${v.sessions.map((s,i)=>`<div class="deck-line"><strong>${i+1}차시 자료 열기</strong><div class="dl-actions">${Object.entries(COURSE_SLOTS).map(([k,label])=>{const a=s.assets[k],f=data.files.find(f=>String(f.id)===a.fileId);if(f){const html=/\.html?$/i.test(f.name)||f.mime==='text/html';const viewable=/^(application\/pdf|image\/)/.test(f.mime);return html?`<button class="btn btn-soft btn-sm" data-course-slide="${f.id}">${label}</button>`:viewable?`<button class="btn btn-soft btn-sm" data-course-file="${f.id}">${label}</button>`:f.downloadable||isAdmin()?`<a class="btn btn-soft btn-sm" href="/api/files/${f.id}/download" target="_blank" rel="noopener">${label} 받기</a>`:`<span class="small muted">${label}: 열람용 PDF 필요</span>`;}if(a.url)return `<a class="btn btn-soft btn-sm" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;return '';}).join('')}</div></div>`).join('')}</div><a class="btn btn-ghost" href="#/program/${id}">수업으로 돌아가기</a></div>`);
    document.getElementById('course-selection').onchange=e=>{selected=Number(e.target.value);draw();};
    document.querySelectorAll('[data-course-file]').forEach(b=>b.onclick=()=>openFileViewer(b.dataset.courseFile));
    document.querySelectorAll('[data-course-slide]').forEach(b=>b.onclick=()=>openSlidePresent(`/api/files/${b.dataset.courseSlide}/open`,'수업 자료'));
  };draw();
});
