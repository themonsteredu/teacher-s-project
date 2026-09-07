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
    if(s.record.mode==='submission'&&(!s.record.completion.trim()||!s.record.original.trim()||!s.record.process.trim())) out.push(`${label}: 활동 기록 설정`);
  })); return out;
}
function coursePreviewHtml(plan, files, index=0) {
  const v=plan.variants[index];
  return `<div class="ce-preview"><p class="ce-kicker">수업 구성 미리보기</p><h2>${esc(v.name)} · ${v.sessions.length}차시</h2><p class="muted">총 ${v.sessions.reduce((sum,s)=>sum+s.minutes,0)}분 · 자료 연결 확인용</p>${v.sessions.map((s,i)=>`<section><h3>${i+1}차시 · ${esc(s.title||'활동 제목 미입력')}</h3><p>${esc(s.bridge)}</p><div class="ce-preview-assets">${Object.entries(COURSE_SLOTS).map(([k,name])=>{
    const a=s.assets[k];const f=files.find(f=>String(f.id)===String(a.fileId));
    if(a.fileId) return `<span>${name}: ${esc(f?.name||'삭제된 파일 — 다시 연결 필요')}</span>`;
    return `<span>${name}: ${a.url?'주소 연결됨':'미등록'}</span>`;
  }).join('')}</div><p class="small muted">${s.record.mode==='submission'?`Hub 제출 시 진로기록: ${esc(s.record.process||'설명 미입력')} · 저장 결과는 내 진로기록에서 확인`:'Career Log 기록 미설정'}</p></section>`).join('')}</div>`;
}
route(/^#\/manage\/(\d+)$/, async id => {
  if(!isAdmin()){location.hash='#/';return;}
  const [data,saved]=await Promise.all([api('GET',`/api/programs/${id}`),api('GET',`/api/programs/${id}/course-plan`)]);
  let draft=courseDrafts.get(id);
  const p=draft?.dirty&&draft.info ? draft.info : data.program;
  if(!draft || !draft.dirty){
    const plan=saved.plan||{version:1,appUrl:'',variants:[{id:crypto.randomUUID(),name:'기본 구성',sessions:(data.lessons.length?data.lessons:[null]).map(l=>({...blankCourseSession(),title:l?.title||'',sourceLessons:l?[String(l.id)]:[]}))}]};
    draft={plan,info:p,revision:saved.revision,dirty:false,selected:0};courseDrafts.set(id,draft);
  }
  draft.plan.variants.forEach(v=>v.sessions.forEach(s=>{s.submissions ||= {enabled:true,types:['photo','document','text'],sharing:'teacher'};}));
  let busy=false;
  const changed=()=>{draft.dirty=true;const label=document.getElementById('ce-status');if(label)label.textContent='저장하지 않은 변경사항';};
  const field=(label,value,attrs='')=>`<label>${label}<input value="${esc(value)}" ${attrs}></label>`;
  function draw(){
    const plan=draft.plan, v=plan.variants[draft.selected];
    shell('수업 등록',`<div class="course-editor"><div class="ce-main">
    <header class="ce-head"><div><h1>수업 등록</h1><p>원본 차시와 자료를 한 번 등록하고 필요한 구성으로 재사용하세요.</p></div><span class="ce-status" id="ce-status" role="status">${draft.dirty?'저장하지 않은 변경사항':'구성 편집'}</span></header>
    <nav class="ce-steps" aria-label="등록 순서">${['기본정보','수업 구성','구성별 자료','활동 기록','확인·공개'].map((t,i)=>`<button type="button" data-step="${i}"><b>${i+1}</b>${t}</button>`).join('')}</nav>
    <section class="ce-section" id="ce-step-0"><h2>기본정보</h2><div class="ce-basic">${field('수업명',p.title,'id="ce-title" maxlength="200"')}<label>대상 학년<select id="ce-grade"><option value="">미지정</option>${GRADES.map(g=>`<option ${g===p.grade?'selected':''}>${g}</option>`).join('')}</select></label>${field('공통 웹앱 주소',plan.appUrl,'id="ce-app" type="url" placeholder="https://…"')}</div><button type="button" class="btn btn-soft btn-sm" id="ce-common-app">공통 웹앱을 비어 있는 차시에 연결</button><label>수업 소개<textarea id="ce-description" rows="2">${esc(p.description)}</textarea></label></section>
    <section class="ce-workspace" id="ce-step-1"><aside class="ce-variants"><h2>운영 구성</h2>${plan.variants.map((x,i)=>`<button type="button" class="${i===draft.selected?'selected':''}" data-variant="${i}" aria-pressed="${i===draft.selected}">${esc(x.name)}<small>${x.sessions.length}차시</small></button>`).join('')}<button type="button" id="ce-add-variant">＋ 구성 추가</button><p>차시 수는 자유롭게 정할 수 있습니다.</p></aside><div class="ce-session-panel"><div class="ce-panel-heading">${field('구성 이름',v.name,'id="ce-variant-name" maxlength="80"')}<button type="button" class="btn btn-ghost btn-sm" id="ce-delete-variant" ${plan.variants.length===1?'disabled':''}>구성 삭제</button></div><p class="muted">처음에는 원본 차시를 한꺼번에 등록하세요. 짧은 구성은 ‘구성 추가’에서 원본 차시를 골라 만듭니다.</p>
    <div class="ce-toolbar"><button type="button" class="btn btn-soft btn-sm" id="ce-outline">차시 목록 한꺼번에 입력</button><span class="small muted">제목을 한 줄씩 붙여넣기 · 최대 50차시</span></div><div class="ce-table-scroll"><table class="ce-table"><thead><tr><th>우리 수업</th><th>원본 차시</th><th>시간</th><th>시작 자료·연결 설명</th><th>순서</th></tr></thead><tbody>${v.sessions.map((s,i)=>`<tr><td><label>${i+1}차시<input aria-label="${i+1}차시 활동 제목" data-session="${i}" data-field="title" value="${esc(s.title)}" placeholder="활동 제목" maxlength="120"></label></td><td><select multiple aria-label="${i+1}차시 원본 차시 선택" data-sources="${i}">${data.lessons.map(l=>`<option value="${l.id}" ${s.sourceLessons.includes(String(l.id))?'selected':''}>${esc(l.title)}</option>`).join('')}</select>${data.lessons.length?'':'<small>공통 자료 관리에서 원본 차시를 추가할 수 있어요.</small>'}</td><td><input type="number" aria-label="${i+1}차시 수업 시간" data-session="${i}" data-field="minutes" value="${s.minutes}" min="5" max="240">분</td><td><textarea aria-label="${i+1}차시 연결 설명" data-session="${i}" data-field="bridge" rows="2" placeholder="예: 조사 대신 제공 자료로 시작">${esc(s.bridge)}</textarea></td><td><button type="button" data-move="${i}" data-direction="-1" ${i===0?'disabled':''} aria-label="${i+1}차시 위로">↑</button><button type="button" data-move="${i}" data-direction="1" ${i===v.sessions.length-1?'disabled':''} aria-label="${i+1}차시 아래로">↓</button><button type="button" data-remove="${i}" ${v.sessions.length===1?'disabled':''}>삭제</button></td></tr>`).join('')}</tbody></table></div><button type="button" class="btn btn-soft btn-sm" id="ce-add-session">＋ 차시 추가</button></div></section>
    <section class="ce-section" id="ce-step-2"><h2>${esc(v.name)} 자료 연결</h2><p class="muted">자료는 필요한 종류만 연결하세요. 구성 복사 시 자료도 함께 복사됩니다.</p><button type="button" class="btn btn-soft btn-sm" id="ce-bulk-files">자료 여러 개 등록</button><div class="ce-table-scroll"><table class="ce-table ce-assets"><thead><tr><th>차시</th>${Object.values(COURSE_SLOTS).map(n=>`<th>${n}</th>`).join('')}</tr></thead><tbody>${v.sessions.map((s,i)=>`<tr><th>${i+1}차시</th>${Object.entries(COURSE_SLOTS).map(([k,name])=>{const a=s.assets[k];return `<td><button type="button" class="ce-asset-button" data-asset="${i}:${k}">${a.fileId?'파일 연결됨':a.url?'주소 연결됨':'＋ 파일·링크'}</button><small>${esc(a.fileId?data.files.find(f=>String(f.id)===a.fileId)?.name||'파일 확인 필요':a.url?'연결 주소 수정':'아직 미등록')}</small></td>`;}).join('')}</tr>`).join('')}</tbody></table></div><a class="ce-library-link" href="#/resources/${id}">공통 자료·원본 차시 관리 열기 →</a></section>
    <section class="ce-section" id="ce-step-3"><h2>활동 기록 설계</h2><p class="muted">Hub 게시판에 제출한 사진·문서·글을 진로기록으로 남깁니다. 외부 웹앱 내부의 제출 버튼은 앱별 연동이 필요합니다.</p>${v.sessions.map((s,i)=>`<details class="ce-record"><summary>${i+1}차시 · ${esc(s.title||'활동 제목 미입력')} <span>${s.record.mode==='submission'?'제출 기록 설계':'기록 미설정'}</span></summary><div class="ce-submission-options"><h3>학생 제출 설정</h3><label><input type="checkbox" data-sub-enabled="${i}" ${s.submissions.enabled?'checked':''}>이 차시에서 제출 받기</label><div>${Object.entries({photo:'사진',document:'PDF·문서',text:'글·웹앱 결과 붙여넣기'}).map(([k,n])=>`<label><input type="checkbox" data-sub-type="${i}:${k}" ${s.submissions.types.includes(k)?'checked':''}>${n}</label>`).join('')}</div><label>공개 범위<select data-sub-sharing="${i}"><option value="teacher" ${s.submissions.sharing==='teacher'?'selected':''}>선생님만 열람</option><option value="class" ${s.submissions.sharing==='class'?'selected':''}>교사 확인 후 우리 반 공개</option></select></label><p class="ce-note">새 제출물은 선생님이 먼저 확인합니다. 웹앱 결과는 글 또는 파일로 제출하며 자동 수집하지 않습니다.</p></div><label>기록 방식<select data-record="${i}" data-field="mode"><option value="none" ${s.record.mode==='none'?'selected':''}>기록하지 않음</option><option value="submission" ${s.record.mode==='submission'?'selected':''}>학생 제출 시 기록</option></select></label><div class="ce-record-fields">${field('학생에게 보여줄 제출 안내',s.record.completion,`data-record="${i}" data-field="completion" placeholder="예: 관찰 내용과 결과물 제출" maxlength="500"`)}${field('학생에게 받을 내용 안내',s.record.original,`data-record="${i}" data-field="original" placeholder="예: 식물 이름, 관찰 특징, 학생 결과물" maxlength="1000"`)}${field('한 줄 활동 설명',s.record.process,`data-record="${i}" data-field="process" placeholder="예: 식물을 관찰하고 특징을 기록함" maxlength="300"`)}</div><p class="ce-note">완료 기준: 제목과 활동 내용 또는 파일을 제출했는지 확인합니다. 아래 안내 문장은 학생에게 보여주며, 정답·점수는 검사하지 않습니다. 저장 결과는 학생의 내 진로기록에서 확인합니다.</p></details>`).join('')}</section>
    <section class="ce-section ce-review" id="ce-step-4"><h2>확인·공개</h2><p>원하는 구성의 자료를 미리 확인하세요. 실제 학생 입장과 웹앱 기록 저장은 별도 운영 검증이 필요합니다.</p><div class="ce-actions"><button type="button" class="btn btn-soft" id="ce-preview">현재 구성 미리보기</button><button type="button" class="btn btn-ghost" id="ce-save">임시 저장</button><button type="button" class="btn btn-primary" id="ce-publish">자료 확인 후 공개</button></div><p id="ce-message" role="status" aria-live="polite"></p></section>
    <div class="ce-step-actions"><button type="button" class="btn btn-ghost" id="ce-previous">이전</button><button type="button" class="btn btn-soft" id="ce-quick-save">임시 저장</button><button type="button" class="btn btn-primary" id="ce-next">다음</button></div></div></div>`);
    bind();
  }
  function bind(){
    const root=document.querySelector('.course-editor');
    const showStep=index=>{
      draft.step=index;
      root.querySelector('#ce-previous').disabled=index===0;root.querySelector('#ce-next').disabled=index===4;
      for(let i=0;i<5;i++)document.getElementById(`ce-step-${i}`).hidden=i!==index;
      root.querySelectorAll('[data-step]').forEach(b=>b.setAttribute('aria-current',Number(b.dataset.step)===index?'step':'false'));
    };
    root.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>showStep(Number(b.dataset.step)));
    showStep(draft.step||0);
    root.querySelector('#ce-previous').onclick=()=>showStep(Math.max(0,draft.step-1));
    root.querySelector('#ce-next').onclick=()=>showStep(Math.min(4,draft.step+1));
    root.querySelector('#ce-quick-save').onclick=()=>{draft.step=4;draw();return save(false);};
    root.querySelectorAll('[data-variant]').forEach(b=>b.onclick=()=>{draft.selected=Number(b.dataset.variant);draw();});
    const v=draft.plan.variants[draft.selected];
    root.querySelector('#ce-title').oninput=e=>{p.title=e.target.value;changed();};
    root.querySelector('#ce-grade').onchange=e=>{p.grade=e.target.value;changed();};
    root.querySelector('#ce-description').oninput=e=>{p.description=e.target.value;changed();};
    root.querySelector('#ce-app').oninput=e=>{draft.plan.appUrl=e.target.value;changed();};
    root.querySelector('#ce-variant-name').oninput=e=>{v.name=e.target.value;changed();};
    root.querySelectorAll('[data-session]').forEach(el=>el.oninput=e=>{v.sessions[Number(el.dataset.session)][el.dataset.field]=el.dataset.field==='minutes'?Number(e.target.value):e.target.value;changed();});
    root.querySelectorAll('[data-sources]').forEach(el=>el.onchange=()=>{v.sessions[Number(el.dataset.sources)].sourceLessons=Array.from(el.selectedOptions,o=>o.value);changed();});
    root.querySelectorAll('[data-sub-enabled]').forEach(el=>el.onchange=()=>{v.sessions[Number(el.dataset.subEnabled)].submissions.enabled=el.checked;changed();});
    root.querySelectorAll('[data-sub-sharing]').forEach(el=>el.onchange=()=>{v.sessions[Number(el.dataset.subSharing)].submissions.sharing=el.value;changed();});
    root.querySelectorAll('[data-sub-type]').forEach(el=>el.onchange=()=>{const [i,k]=el.dataset.subType.split(':'),s=v.sessions[Number(i)].submissions; s.types=el.checked?[...new Set([...s.types,k])]:s.types.filter(t=>t!==k);changed();});
    root.querySelectorAll('[data-record]').forEach(el=>el.oninput=e=>{v.sessions[Number(el.dataset.record)].record[el.dataset.field]=e.target.value;changed();});
    root.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.move),j=i+Number(b.dataset.direction);if(j<0||j>=v.sessions.length)return;[v.sessions[i],v.sessions[j]]=[v.sessions[j],v.sessions[i]];changed();draw();});
    root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{if(confirm('이 구성에서 차시를 제외할까요? 원본 자료는 유지됩니다.')){v.sessions.splice(Number(b.dataset.remove),1);changed();draw();}});
    root.querySelector('#ce-common-app').onclick=()=>{try{const n=CourseAuthoring.commonApp(draft.plan);changed();draw();toast(`${n}개 차시에 웹앱을 연결했습니다.`);}catch(e){toast(e.message,true);}};
    root.querySelector('#ce-outline').onclick=()=>{
      const modal=openModal('<h3>원본 차시 한꺼번에 등록</h3><p>차시 제목을 한 줄씩 입력하세요. 엑셀에서 제목과 웹앱 주소 두 열을 함께 붙여넣어도 됩니다.</p><textarea id="co-lines" rows="10" placeholder="1차시 · 문제 발견&#10;2차시 · 자료 조사"></textarea><p>기존 차시는 유지하고 뒤에 추가합니다.</p><div class="m-actions"><button class="btn btn-ghost" id="co-cancel">취소</button><button class="btn btn-primary" id="co-add">차시 추가</button></div><p id="co-error" role="status"></p>');
      modal.querySelector('#co-cancel').onclick=()=>modal.remove();
      modal.querySelector('#co-add').onclick=()=>{try{const sessions=CourseAuthoring.outline(modal.querySelector('#co-lines').value,blankCourseSession,draft.plan.appUrl);const empty=v.sessions.length===1&&!v.sessions[0].title&&!Object.values(v.sessions[0].assets).some(a=>a.url||a.fileId);if((empty?0:v.sessions.length)+sessions.length>50)throw new Error('구성당 최대 50차시입니다.');v.sessions=empty?sessions:[...v.sessions,...sessions];changed();modal.remove();draw();}catch(e){modal.querySelector('#co-error').textContent=e.message;}};
    };
    root.querySelector('#ce-add-session').onclick=()=>{if(v.sessions.length>=50)return toast('구성당 최대 50차시입니다.',true);v.sessions.push(blankCourseSession());changed();draw();};
    root.querySelector('#ce-delete-variant').onclick=()=>{if(draft.plan.variants.length>1&&confirm('이 운영 구성을 삭제할까요? 원본 자료는 유지됩니다.')){draft.plan.variants.splice(draft.selected,1);draft.selected=0;changed();draw();}};
    root.querySelector('#ce-add-variant').onclick=()=>{
      if(draft.plan.variants.length>=12)return toast('최대 12개 구성을 등록할 수 있습니다.',true);
      const modal=openModal(`<h3>원본에서 운영 구성 만들기</h3><label>구성 이름<input id="cv-name" placeholder="예: 3차시 집중 과정" maxlength="80"></label><label>가져올 구성<select id="cv-source">${draft.plan.variants.map((x,i)=>`<option value="${i}" ${i===draft.selected?'selected':''}>${esc(x.name)} · ${x.sessions.length}차시</option>`).join('')}</select></label><div id="cv-lessons"></div><p>선택한 차시의 웹앱·자료·제출 설정을 복사합니다. 생략한 과정의 시작 자료는 새 구성에서 보완하세요.</p><div class="m-actions"><button class="btn btn-ghost" id="cv-cancel">취소</button><button class="btn btn-primary" id="cv-add">선택한 차시로 만들기</button></div><p id="cv-error" role="status"></p>`);
      const choices=()=>{const source=draft.plan.variants[Number(modal.querySelector('#cv-source').value)];modal.querySelector('#cv-lessons').innerHTML=source.sessions.map((s,i)=>`<label class="ce-choice"><input type="checkbox" value="${i}" data-cv-lesson checked>${i+1}차시 · ${esc(s.title||'제목 미입력')}</label>`).join('');};choices();
      modal.querySelector('#cv-source').onchange=choices;
      modal.querySelector('#cv-cancel').onclick=()=>modal.remove();
      modal.querySelector('#cv-add').onclick=()=>{try{const source=draft.plan.variants[Number(modal.querySelector('#cv-source').value)],indices=Array.from(modal.querySelectorAll('[data-cv-lesson]:checked'),el=>Number(el.value));draft.plan.variants.push(CourseAuthoring.variant(source,indices,crypto.randomUUID(),modal.querySelector('#cv-name').value));draft.selected=draft.plan.variants.length-1;changed();modal.remove();draw();}catch(e){modal.querySelector('#cv-error').textContent=e.message;}};
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
