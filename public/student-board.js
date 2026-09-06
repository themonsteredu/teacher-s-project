'use strict';
const SB_TYPES = {photo:'사진',document:'PDF·문서',text:'글·웹앱 결과 붙여넣기'};
const SB_DEFAULT = () => ({enabled:true,types:['photo','document','text'],sharing:'teacher'});
let sbViewEpoch = 0;
function sbRead(key) { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } }
function sbWrite(key,value) { try { if(value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key,JSON.stringify(value)); } catch {} }
async function sbRequest(method,path,body) {
  const controller = new AbortController(), timeout = setTimeout(()=>controller.abort(),30000);
  try {
    const r = await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});
    const data = await r.json();
    if (!r.ok) { const e = new Error(data.error === 'site_closed' ? '지금은 수업이 닫혀 있습니다.' : data.error || '요청을 처리하지 못했습니다.');e.status=r.status;throw e; }
    return data;
  } finally { clearTimeout(timeout); }
}
// Holds exactly one immutable snapshot until the server acknowledges its request UUID.
function submissionAttempt(snapshot, saved) {
  if (saved?.snapshot && /^[0-9a-f-]{36}$/i.test(saved.snapshot.requestId || '')) return saved;
  return {snapshot:{...snapshot,requestId:crypto.randomUUID()},uploaded:false};
}
function sbCard(p) {
  return `<article class="sc-post"><div class="sc-post-top"><span class="sc-avatar" aria-hidden="true">${p.mine?'나':'•'}</span><b>${esc(p.student_name)}</b>${p.mine?'<span class="sc-pill">내 제출</span>':''}</div>${p.previewUrl?`<button class="sc-photo" data-photo="${p.id}" aria-label="${esc(p.title)} 사진 크게 보기"><img src="${esc(p.previewUrl)}" alt="${esc(p.title)}" loading="lazy"></button>`:p.file_name?`<div class="sc-document">${icon('file')}<span>${esc(p.file_name)}</span></div>`:''}<div class="sc-post-copy"><small>${esc(p.sessionTitle)}</small><h3>${esc(p.title)}</h3>${p.content?`<p>${esc(p.content)}</p>`:''}${p.file_name?`<button class="sc-file-link" data-subfile="${p.id}">${icon('download')} ${esc(p.file_name)}</button>`:''}<footer><span>제출 완료 · ${p.visibility==='class'?'우리 반 공개':'선생님만 열람'}</span><time>${esc(new Date(p.created_at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))}</time></footer></div></article>`;
}
async function renderStudentClass(code, join, careerStudentId) {
  const epoch = ++sbViewEpoch;
  const onPage=()=>epoch===sbViewEpoch && location.hash.toLowerCase()===`#/board/${code}`;
  const base=`/api/join-board/${code}`, draftKey=`moakit-submission-draft:${code}`;
  let data;
  try { data=await sbRequest('GET',`${base}/submissions`); } catch(e) { if(!onPage())return; $app.innerHTML=`<div class="login-wrap"><div class="card"><h1>수업을 불러오지 못했어요</h1><p>${esc(e.message)}</p><button class="btn btn-primary" id="sc-reload">다시 불러오기</button></div></div>`;document.getElementById('sc-reload').onclick=()=>navigate();return; }
  if(!onPage())return;
  let current=data.course.activeSession, tab='activity', page='today', scope='all', file=null, preview='', busy=false, pending=sbRead(draftKey), message='', feedBusy=false;
  let draft={student_name:sbRead(`moakit-submission-name:${code}`) || '',title:'',content:''};
  if(pending?.snapshot){draft={student_name:pending.snapshot.student_name,title:pending.snapshot.title,content:pending.snapshot.content};current=pending.snapshot.sessionId;tab='board';}
  if(!data.course.sessions.some(s=>s.id===current))current=data.course.activeSession;
  const lesson=()=>data.course.sessions.find(s=>s.id===current)||data.course.sessions[0];
  const dirty=()=>!!(file||draft.title||draft.content||pending);
  const unload=e=>{if(onPage()&&dirty()){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',unload);
  const cleanup=()=>{if(!onPage()){if(preview)URL.revokeObjectURL(preview);window.removeEventListener('beforeunload',unload);window.removeEventListener('hashchange',cleanup);}};
  window.addEventListener('hashchange',cleanup);
  function remember(){sbWrite(draftKey,pending);}
  function inputDisabled(){return busy||feedBusy||!!pending;}
  function render() {
    if(!onPage())return;
    const s=lesson(), settings=s.submissions, active=page==='today', boardTab=tab==='board'||!active;
    const title=page==='mine'?'내 제출물':page==='records'?'내 활동 기록':s.title;
    const activityLinks=s.materials.links.filter(l=>l.kind==='aiapp');
    const activityFiles=s.materials.files.filter(f=>f.purpose==='app'||/\.html?$/i.test(f.name));
    const resources={links:s.materials.links.filter(l=>l.kind!=='aiapp'),files:s.materials.files.filter(f=>!activityFiles.includes(f))};
    const visiblePosts=data.posts; // Already filtered and authorized by the server.
    $app.innerHTML=`<div class="student-class"><aside class="sc-sidebar"><a class="sc-brand" href="#/board/${code}"><span aria-hidden="true">🌱</span><span>MOAKIT<small>수업허브</small></span></a><nav aria-label="학생 메뉴">${[['today','book','오늘 수업'],['mine','file','내 제출물'],['records','clock','내 활동 기록']].map(([k,i,n])=>`<button data-sc-page="${k}" class="${page===k?'active':''}" aria-pressed="${page===k}">${icon(i)} ${n}</button>`).join('')}</nav><div class="sc-sidebar-bottom"><p>오늘의 배움이<br>더 큰 내일로</p><button id="sc-leave">수업 나가기</button></div></aside><main class="sc-main"><header class="sc-header"><div class="sc-breadcrumb">${icon('book')} ${esc(join.board.title)} <span>참여 코드 ${esc(code.toUpperCase())}</span></div><div class="sc-heading"><div><h1>${esc(title)}</h1><p>${active?esc(s.bridge||'활동하고, 결과물을 남기고, 함께 나눠보세요.'):'현재 기기에서 참여한 학생 세션의 제출물입니다.'}</p></div>${active?`<nav class="sc-lessons" aria-label="차시 선택">${data.course.sessions.map((x,i)=>`<button data-sc-lesson="${esc(x.id)}" class="${x.id===current?'active':''}" aria-current="${x.id===current?'step':'false'}"><b>${i+1}차시</b><span>${esc(x.title)}</span></button>`).join('')}</nav>`:''}</div>${active?`<nav class="sc-tabs" aria-label="수업 화면">${[['activity','활동하기'],['materials','자료·활동지'],['board','제출 게시판']].map(([k,n])=>`<button data-sc-tab="${k}" class="${tab===k?'active':''}" aria-pressed="${tab===k}">${n}</button>`).join('')}</nav>`:''}</header><div class="sc-body">
    ${boardTab?`<div class="sc-board-layout ${!active?'without-composer':''}"><section class="sc-panel sc-board"><div class="sc-panel-title"><h2>${page==='records'?'제출 활동과 기록 상태':page==='mine'?'내가 제출한 결과물':'우리 반 제출 게시판'}</h2><span class="sc-privacy">${icon('lock')} 교사가 공개한 제출물만 함께 봐요</span></div>${active?`<div class="sc-filters"><button data-sc-scope="all" class="${scope==='all'?'active':''}">전체 제출물</button><button data-sc-scope="mine" class="${scope==='mine'?'active':''}">내 제출물</button></div>`:''}<div class="sc-feed-status" role="status">${feedBusy?'불러오는 중…':''}</div>${page==='records'?`<div class="sc-records">${visiblePosts.map(p=>`<article><div><small>${esc(p.sessionTitle)}</small><h3>${esc(p.title)}</h3><p>제출 완료 · ${esc(new Date(p.created_at).toLocaleDateString('ko-KR'))}</p></div><span class="sc-record-status">Career Log 미연결</span></article>`).join('')||'<div class="sc-empty">아직 제출한 활동이 없습니다.</div>'}</div>`:`<div class="sc-grid">${visiblePosts.map(sbCard).join('')||`<div class="sc-empty">${scope==='mine'||page==='mine'?'아직 내 제출물이 없습니다.':'아직 공개된 제출물이 없습니다.'}<p>제출한 결과물은 선생님이 먼저 확인합니다.</p></div>`}${active?'<button class="sc-add" id="sc-focus-compose"><span>＋</span>내 결과물 올리기</button>':''}</div>`}${data.next?'<button class="btn btn-soft sc-more" id="sc-more">더 보기</button>':''}</section>
    ${active?`<section class="sc-panel sc-compose" aria-labelledby="sc-compose-title"><h2 id="sc-compose-title">내 결과물 올리기</h2>${settings.enabled?`<form id="sc-form"><div class="sc-upload-actions"><button type="button" id="sc-camera" ${inputDisabled()||!settings.types.includes('photo')?'disabled':''}>${icon('camera')} 사진 찍기</button><button type="button" id="sc-file" ${inputDisabled()||!settings.types.some(t=>t!=='text')?'disabled':''}>${icon('upload')} 파일 선택</button></div><p class="sc-help">${settings.types.map(t=>SB_TYPES[t]).join(' · ')}<br>한 번에 파일 1개 · 최대 20MB</p><input id="sc-camera-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden><input id="sc-file-input" type="file" accept="${[...(settings.types.includes('photo')?['.png','.jpg','.jpeg','.webp','.gif']:[]),...(settings.types.includes('document')?['.pdf','.ppt','.pptx','.doc','.docx','.xls','.xlsx','.hwp','.hwpx']:[])].join(',')}" hidden>
    <label>이름<input id="sc-name" value="${esc(draft.student_name)}" maxlength="20" autocomplete="off" placeholder="선생님이 확인할 이름" required ${inputDisabled()?'disabled':''}></label><label>제목<input id="sc-title" value="${esc(draft.title)}" maxlength="120" placeholder="예: 민들레 관찰 기록" required ${inputDisabled()?'disabled':''}></label><label>설명 ${file||pending?.snapshot.uploadId?'(선택)':''}<textarea id="sc-content" rows="3" maxlength="2000" placeholder="무엇을 관찰하고 만들었나요?" ${inputDisabled()?'disabled':''}>${esc(draft.content)}</textarea></label>
    ${file||pending?.fileName?`<div class="sc-selected">${preview?`<img src="${esc(preview)}" alt="선택한 사진 미리보기">`:icon('file')}<span>${esc(file?.name||pending.fileName)}</span><button id="sc-remove-file" type="button" ${inputDisabled()?'disabled':''}>빼기</button></div>`:''}
    <div class="sc-visibility"><span>공개 범위</span><strong>${icon('lock')} 선생님에게 제출</strong><small>${settings.sharing==='class'?'우리 반 공개 여부는 선생님이 정해요.':'이 차시는 선생님만 볼 수 있어요.'}</small></div><button class="sc-submit" type="submit" ${busy?'disabled':''}>${busy?'제출 중…':pending?'같은 제출 다시 확인':'제출하기'}</button><p id="sc-message" role="status" aria-live="polite">${esc(message)}</p>${pending&&!busy?'<button class="btn btn-ghost btn-sm" id="sc-reset" type="button">확인 중인 제출 취소</button>':''}<p class="sc-submit-note">${icon('file')} 제출 확인 → 내 제출물에 보관</p></form>`:'<p class="sc-empty">이 차시는 지금 제출을 받지 않습니다.</p>'}</section>`:''}</div>`:
    tab==='activity'?`<section class="sc-panel sc-activity"><span class="sc-eyebrow">${esc(data.course.name)} · ${s.minutes}분</span><h2>오늘의 활동을 시작해요</h2><p>${esc(s.bridge||'선생님의 안내에 따라 웹앱 활동을 진행하세요.')}</p><div class="sc-app-links">${activityLinks.map(l=>`<a href="${esc(careerMaterialUrl(l,code,careerStudentId))}" target="_blank" rel="noopener noreferrer">${icon('monitor')}<span>${esc(l.label||'웹앱 활동 열기')}<small>새 창에서 활동하기</small></span><b>↗</b></a>`).join('')}${studentMaterialsHtml({links:[],files:activityFiles},code,careerStudentId)}${!activityLinks.length&&!activityFiles.length?'<div class="sc-empty">선생님이 공유한 웹앱이 아직 없습니다.</div>':''}</div><button class="btn btn-primary" data-sc-tab="board">활동 결과물 제출하기 →</button></section>`:`<section class="sc-panel sc-resources"><h2>수업 자료·활동지</h2><p>선생님이 이 수업에 공유한 자료를 확인하세요.</p>${studentMaterialsHtml(resources,code,careerStudentId)||'<p class="sc-empty">공유된 자료가 아직 없습니다.</p>'}</section>`}
    <aside class="sc-career-banner">${icon('file')}<div><strong>활동 기록과 연결</strong><p>이 게시판의 파일 제출은 Career Log에 자동 저장되지 않습니다.</p></div><span>기록 미연결</span></aside></div></main></div>`;
    bind();
  }
  async function feed(append=false) {
    if(feedBusy)return;
    feedBusy=true;
    render();
    const selectedPage=page,selectedScope=scope,selectedLesson=current;
    const p=new URLSearchParams();
    if(page==='today')p.set('lesson',current);
    if(page!=='today'||scope==='mine')p.set('scope','mine');
    if(append&&data.next)p.set('before',data.next);
    try { const next=await sbRequest('GET',`${base}/submissions?${p}`);if(page!==selectedPage||scope!==selectedScope||current!==selectedLesson)return;data={...next,posts:append?[...data.posts,...next.posts]:next.posts}; }
    catch(e){message=e.message;toast(e.message,true);}finally{feedBusy=false;render();}
  }
  function move(fn) {
    if(busy||feedBusy)return;
    if(dirty()&&!confirm('작성 중인 제출 내용이 있어요. 이 화면에 남겨두고 이동할까요?'))return;
    fn();data.posts=[];data.next=null;render();feed();
  }
  function selectFile(next) {
    if(!next)return;
    const ext=next.name.split('.').pop().toLowerCase(),photo=['png','jpg','jpeg','webp','gif'].includes(ext),doc=['pdf','ppt','pptx','doc','docx','xls','xlsx','hwp','hwpx'].includes(ext);
    if(!next.size||next.size>20*1024*1024||(!photo&&!doc)||!lesson().submissions.types.includes(photo?'photo':'document')){message='이 차시에 허용된 파일을 선택하세요. 최대 20MB입니다.';render();return;}
    if(preview)URL.revokeObjectURL(preview);file=next;preview=photo?URL.createObjectURL(file):'';message='';render();
  }
  function bind() {
    const root=document.querySelector('.student-class');
    root.querySelectorAll('[data-sc-tab]').forEach(b=>b.onclick=()=>{if(busy)return;tab=b.dataset.scTab;render();if(tab==='board')feed();});
    root.querySelectorAll('[data-sc-page]').forEach(b=>b.onclick=()=>move(()=>{page=b.dataset.scPage;}));
    root.querySelectorAll('[data-sc-lesson]').forEach(b=>b.onclick=()=>{if(pending)return toast('먼저 확인 중인 제출을 완료해 주세요.',true);if(dirty())return toast('작성 중인 결과물을 먼저 제출해 주세요.',true);move(()=>{current=b.dataset.scLesson;});});
    root.querySelectorAll('[data-sc-scope]').forEach(b=>b.onclick=()=>move(()=>{scope=b.dataset.scScope;}));
    root.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>{const p=data.posts.find(p=>String(p.id)===b.dataset.photo);if(p?.previewUrl)openImageLightbox(p.previewUrl);});
    root.querySelectorAll('[data-subfile]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await sbRequest('GET',`${base}/submission-file/${b.dataset.subfile}`);const a=document.createElement('a');a.href=r.url;a.rel='noopener noreferrer';a.target='_blank';a.click();}catch(e){toast(e.message,true);}finally{b.disabled=false;}});
    root.querySelectorAll('[data-matfile]').forEach(b=>b.onclick=()=>openStudentFile(code,b.dataset.matfile));
    root.querySelector('#sc-more')?.addEventListener('click',()=>feed(true));
    root.querySelector('#sc-focus-compose')?.addEventListener('click',()=>{root.querySelector('#sc-compose-title')?.scrollIntoView({behavior:'smooth',block:'start'});root.querySelector('#sc-title')?.focus();});
    for(const [id,key] of [['sc-name','student_name'],['sc-title','title'],['sc-content','content']]){const el=root.querySelector('#'+id);if(el)el.oninput=e=>{draft[key]=e.target.value;};}
    root.querySelector('#sc-camera')?.addEventListener('click',()=>root.querySelector('#sc-camera-input').click());
    root.querySelector('#sc-file')?.addEventListener('click',()=>root.querySelector('#sc-file-input').click());
    for(const id of ['sc-camera-input','sc-file-input'])root.querySelector('#'+id)?.addEventListener('change',e=>selectFile(e.target.files[0]));
    root.querySelector('#sc-remove-file')?.addEventListener('click',()=>{if(preview)URL.revokeObjectURL(preview);preview='';file=null;render();});
    root.querySelector('#sc-reset')?.addEventListener('click',()=>{if(confirm('통신 오류가 났다면 이미 제출되었을 수도 있어요. 내 제출물을 확인한 뒤 취소해 주세요. 취소할까요?')){pending=null;remember();message='새 제출로 다시 작성할 수 있습니다.';render();}});
    root.querySelector('#sc-form')?.addEventListener('submit',e=>{e.preventDefault();return send();});
    root.querySelector('#sc-leave').onclick=async()=>{
      if(busy)return;
      if(!confirm(dirty()?'작성 중인 내용이 있습니다. 수업에서 나갈까요?':'수업에서 나갈까요? 공유기기의 다음 학생은 새 제출 세션으로 입장합니다.'))return;
      try{await sbRequest('POST',`${base}/leave`,{});sbWrite(draftKey,null);sbWrite(`moakit-submission-name:${code}`,null);pending=null;draft={};file=null;location.hash='#/login';}catch(e){toast(e.message,true);}
    };
  }
  async function send() {
    if(busy||feedBusy)return;
    if(!pending&&(!draft.student_name.trim()||!draft.title.trim()||(!draft.content.trim()&&!file))){message='이름·제목을 적고 활동 내용이나 파일을 추가하세요.';render();return;}
    if(!pending){pending=submissionAttempt({...draft,sessionId:current,uploadId:null});pending.fileName=file?.name||'';remember();}
    busy=true;message='제출 내용을 확인하고 있어요.';render();
    let acknowledged=false;
    try {
      if(pending.fileName&&!pending.uploaded){
        if(!file)throw Object.assign(new Error('새로고침 전 파일은 다시 선택해야 합니다. 확인 중인 제출을 취소한 뒤 파일을 선택하세요.'),{status:400});
        const sign=await sbRequest('POST',`${base}/file-sign`,{sessionId:pending.snapshot.sessionId,name:file.name,size:file.size});
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
        try{const r=await fetch(sign.uploadUrl,{method:'PUT',headers:{'Content-Type':sign.mime,'x-upsert':'false'},body:file,signal:controller.signal});if(!r.ok)throw new Error('파일 업로드에 실패했습니다. 같은 제출로 다시 시도하세요.');}finally{clearTimeout(timer);}
        pending.snapshot.uploadId=sign.uploadId;pending.uploaded=true;remember();
      }
      await sbRequest('POST',`${base}/posts`,pending.snapshot);
      acknowledged=true;sbWrite(`moakit-submission-name:${code}`,draft.student_name);pending=null;remember();
      draft={student_name:draft.student_name,title:'',content:''};file=null;if(preview)URL.revokeObjectURL(preview);preview='';message='제출 완료! 선생님에게 전달했어요.';scope='mine';tab='board';
    }catch(e){message=e.name==='AbortError'?'응답이 늦어지고 있어요. 같은 제출 다시 확인을 눌러주세요.':e.message;if(e.status===400){pending=null;remember();}}
    finally{busy=false;render();}
    if(acknowledged)await feed();
  }
  render();await feed();
}
async function loadSubmissionSettings(el,boardId) {
  let data,busy=false;
  try{data=await sbRequest('GET',`/api/boards/${boardId}/submission-settings`);}catch(e){el.textContent=e.message;return;}
  const draw=()=>{
    const c=data.config;
    el.innerHTML=`<h2>차시·학생 제출 설정</h2><p class="small muted">이 수업의 운영 구성과 제출 방법을 정하세요. 공유 자료는 아래에서 선택합니다.</p><div class="sc-teacher-variant"><label>운영 구성<select id="sbt-variant"><option value="${esc(c.variantId)}">${esc(c.name)} · ${c.sessions.length}차시 (현재)</option>${data.variants.filter(v=>v.id!==c.variantId).map(v=>`<option value="${esc(v.id)}">${esc(v.name)} · ${v.count}차시</option>`).join('')}</select></label><button class="btn btn-soft" id="sbt-apply">구성 적용</button></div><label class="sc-share-consent"><input type="checkbox" id="sbt-share"> 이 구성의 학생 웹앱·활동지도 학생에게 공유</label><div class="sc-settings-scroll"><table class="sc-settings"><thead><tr><th>차시</th><th>오늘 수업</th><th>제출 받기</th><th>허용 형식</th><th>공개 범위</th></tr></thead><tbody>${c.sessions.map((s,i)=>`<tr><th>${i+1}차시<br>${esc(s.title)}</th><td><input type="radio" name="sbt-active" data-active="${esc(s.id)}" aria-label="${i+1}차시를 오늘 수업으로" ${c.activeSession===s.id?'checked':''}></td><td><input type="checkbox" data-enabled="${i}" aria-label="${i+1}차시 제출 받기" ${s.submissions.enabled?'checked':''}></td><td>${Object.entries(SB_TYPES).map(([k,n])=>`<label><input type="checkbox" data-type="${i}:${k}" ${s.submissions.types.includes(k)?'checked':''}>${n}</label>`).join('')}</td><td><select data-sharing="${i}" aria-label="${i+1}차시 공개 범위"><option value="teacher" ${s.submissions.sharing==='teacher'?'selected':''}>선생님만 열람</option><option value="class" ${s.submissions.sharing==='class'?'selected':''}>교사 확인 후 우리 반 공개</option></select></td></tr>`).join('')}</tbody></table></div><p class="small muted">우리 반 공개를 허용해도 새 제출물은 먼저 선생님에게만 보입니다. 아래 제출 카드의 ‘우리 반에 공개’로 공개하세요. 파일 제출은 Career Log 자동 저장과 연결되지 않습니다.</p><button class="btn btn-primary" id="sbt-save">제출 설정 저장</button><p id="sbt-message" role="status"></p>`;
    el.querySelector('#sbt-save').onclick=()=>save(false);el.querySelector('#sbt-apply').onclick=()=>save(true);
  };
  async function save(changeVariant){
    if(busy)return;
    const c=data.config,variantId=changeVariant?el.querySelector('#sbt-variant').value:c.variantId;
    if(changeVariant&&variantId===c.variantId)return;
    if(changeVariant&&!confirm('새 운영 구성을 적용할까요? 기존 제출물은 해당 차시 이름으로 보관됩니다.'))return;
    const sessions=c.sessions.map((s,i)=>({id:s.id,submissions:{enabled:el.querySelector(`[data-enabled="${i}"]`).checked,types:Object.keys(SB_TYPES).filter(k=>el.querySelector(`[data-type="${i}:${k}"]`).checked),sharing:el.querySelector(`[data-sharing="${i}"]`).value}}));
    if(!changeVariant&&sessions.some(s=>!s.submissions.types.length)){el.querySelector('#sbt-message').textContent='차시마다 제출 형식을 하나 이상 선택하세요.';return;}
    const activeSession=el.querySelector('[data-active]:checked')?.dataset.active||c.activeSession;
    const shareStudentMaterials=el.querySelector('#sbt-share').checked;
    busy=true;el.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);
    try{const r=await sbRequest('PUT',`/api/boards/${boardId}/submission-settings`,{revision:c.revision,variantId,sessions,activeSession,shareStudentMaterials});data.config=r.config;draw();el.querySelector('#sbt-message').textContent='설정이 저장되었습니다.';if(shareStudentMaterials){const card=document.getElementById('share-card');if(card)loadShareCard(card,boardId);}}catch(e){el.querySelector('#sbt-message').textContent=e.message;}finally{busy=false;el.querySelectorAll('button,input,select').forEach(b=>b.disabled=false);}
  }
  draw();
}
