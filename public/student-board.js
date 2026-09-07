'use strict';
const SB_TYPES = {photo:'사진',document:'PDF·문서',text:'글·웹앱 결과 붙여넣기'};
const SB_DEFAULT = () => ({enabled:true,types:['photo','document','text'],sharing:'teacher'});
let sbViewEpoch = 0;
function sbRead(key) { if(!key)return null;try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } }
function sbWrite(key,value) { if(!key)return;try { if(value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key,JSON.stringify(value)); } catch {} }
function sbDraftKeys(code, session) {
  const scope=session?.draftScope;
  if(typeof scope!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(scope))return {draft:null,name:null};
  return {draft:`moakit-submission-draft:${code}:${scope}`,name:`moakit-submission-name:${code}:${scope}`};
}
function sbAccountUrl(code) {
  return /^[a-z0-9]{4,10}$/i.test(code||'')?`/student-accounts.html?board=${encodeURIComponent(code)}`:'/student-accounts.html';
}
function sbRecordEnabled(course,lesson) { return course.careerEnabled===true&&lesson.record?.enabled===true; }
function sbCareerSettingsHtml(config, available, schools, error='') {
  const setting=config.career||{enabled:false,schoolId:null};
  const canEnable=available&&schools.length>0&&!error;
  return `<fieldset class="sc-panel"><legend>학생 계정·진로기록 연결</legend><label class="sc-share-consent"><input type="checkbox" id="sbt-career" ${setting.enabled?'checked':''} ${!canEnable&&!setting.enabled?'disabled':''}> 학생 계정으로 참여하고 진로기록 남기기</label><label>이 수업의 학교<select id="sbt-school" ${!canEnable?'disabled':''}><option value="">담당 학교를 선택하세요</option>${schools.map(s=>`<option value="${esc(s.id)}" ${s.id===setting.schoolId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><p class="small muted">연결하면 이 학교의 학생 계정으로 입장합니다. 차시에서 기록을 켠 제출물만 저장하며, 게시판 공개 여부와 정답 여부는 저장 조건이 아닙니다.</p>${!canEnable?`<p class="small muted">${esc(error||(!available?'학생 계정 연결 설정이 준비되면 사용할 수 있습니다.':'담당 학교와 학생 계정을 먼저 등록하세요.'))}</p>`:''}<a href="/student-accounts.html">학교·학생 계정 관리</a></fieldset>`;
}
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
function sbCareerLabel(state) {
  return {saved:'진로기록 저장 완료',pending:'진로기록 저장 대기',not_requested:'게시판 제출만'}[state] || '게시판 제출만';
}
function sbRecordsHtml(records) {
  return records.map(r=>{
    const p=r.record,s=p.raw_data.submission;
    return `<article class="sc-career-record"><div><small>${esc(s.session_title)}</small><h3>${esc(p.artifact)}</h3><p>${esc(p.process)}</p><p class="small muted">활동일 ${esc(new Date(p.occurred_at).toLocaleString('ko-KR'))} · 교사 확인 미요청</p><span class="sc-record-status">${sbCareerLabel(r.state)}</span>${r.recordId?`<p class="small muted">저장 번호 ${esc(r.recordId)}</p>`:''}<details><summary>내가 제출한 원본 보기</summary><p class="sc-original-text">${esc(s.content||'글 설명 없음')}</p>${s.attachment?`<button class="btn btn-soft btn-sm" data-career-file="${esc(r.postId)}">${esc(s.attachment.name)} 열기</button>`:''}</details>${r.state==='pending'?`<p class="small muted">제출물은 보관되었습니다. 진로기록 저장을 다시 확인해 주세요.</p><button class="btn btn-soft btn-sm" data-career-retry="${esc(r.postId)}">같은 기록 저장 재시도</button>`:''}</div></article>`;
  }).join('') || '<div class="sc-empty">아직 진로기록으로 제출한 활동이 없습니다.<p>선생님이 기록을 켠 차시에서 결과물을 제출하면 여기에 표시됩니다.</p></div>';
}
function sbCard(p) {
  return `<article class="sc-post"><div class="sc-post-top"><span class="sc-avatar" aria-hidden="true">${p.mine?'나':'•'}</span><b>${esc(p.student_name)}</b>${p.mine?'<span class="sc-pill">내 제출</span>':''}</div>${p.previewUrl?`<button class="sc-photo" data-photo="${p.id}" aria-label="${esc(p.title)} 사진 크게 보기"><img src="${esc(p.previewUrl)}" alt="${esc(p.title)}" loading="lazy"></button>`:p.file_name?`<div class="sc-document">${icon('file')}<span>${esc(p.file_name)}</span></div>`:''}<div class="sc-post-copy"><small>${esc(p.sessionTitle)}</small><h3>${esc(p.title)}</h3>${p.content?`<p>${esc(p.content)}</p>`:''}${p.file_name?`<button class="sc-file-link" data-subfile="${p.id}">${icon('download')} ${esc(p.file_name)}</button>`:''}<footer><span>${p.mine?sbCareerLabel(p.careerStatus):'제출 완료'} · ${p.visibility==='class'?'우리 반 공개':'선생님만 열람'}</span><time>${esc(new Date(p.created_at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))}</time></footer></div></article>`;
}
async function renderStudentClass(code, join, careerStudentId) {
  const epoch = ++sbViewEpoch;
  const onPage=()=>epoch===sbViewEpoch && location.hash.toLowerCase()===`#/board/${code}`;
  const base=`/api/join-board/${code}`;
  let data;
  $app.innerHTML='<div class="login-wrap"><div class="card"><p role="status">학생 세션을 확인하고 있어요.</p></div></div>';
  try { data=await sbRequest('GET',`${base}/submissions`); } catch(e) { if(!onPage())return; $app.innerHTML=`<div class="login-wrap"><div class="card"><h1>${e.status===401?'학생 로그인이 필요해요':'수업을 불러오지 못했어요'}</h1><p>${esc(e.message)}</p>${e.status===401?`<a class="btn btn-primary" href="${esc(sbAccountUrl(code))}">학생 계정으로 로그인</a>`:''}<button class="btn btn-soft" id="sc-reload">다시 불러오기</button></div></div>`;document.getElementById('sc-reload').onclick=()=>navigate();return; }
  if(!onPage())return;
  // Old code-only drafts cannot establish ownership on a shared tablet.
  sbWrite(`moakit-submission-draft:${code}`,null);sbWrite(`moakit-submission-name:${code}`,null);
  let keys=sbDraftKeys(code,data.studentSession);
  let current=data.course.activeSession, tab='activity', page='today', scope='all', file=null, preview='', busy=false, pending=sbRead(keys.draft), message='', feedBusy=false;
  let readEpoch=0,screenLocked=false,gateError=null;
  let draft={student_name:sbRead(keys.name) || '',title:'',content:''};
  if(pending?.snapshot){draft={student_name:pending.snapshot.student_name,title:pending.snapshot.title,content:pending.snapshot.content};current=pending.snapshot.sessionId;tab='board';}
  if(!data.course.sessions.some(s=>s.id===current))current=data.course.activeSession;
  const lesson=()=>data.course.sessions.find(s=>s.id===current)||data.course.sessions[0];
  const dirty=()=>!!(file||draft.title||draft.content||pending);
  const unload=e=>{if(onPage()&&dirty()){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',unload);
  const cleanup=()=>{if(!onPage()){readEpoch++;if(preview)URL.revokeObjectURL(preview);window.removeEventListener('beforeunload',unload);window.removeEventListener('hashchange',cleanup);window.removeEventListener('pageshow',onPageShow);window.removeEventListener('pagehide',suspend);document.removeEventListener?.('visibilitychange',onVisibility);}};
  window.addEventListener('hashchange',cleanup);
  function suspend(){if(!onPage())return;readEpoch++;screenLocked=true;gateError=null;feedBusy=false;busy=false;data.posts=[];data.careerRecords=[];data.next=null;render();}
  function onPageShow(event){if(event.persisted&&onPage()){suspend();return feed(false,true);}}
  function onVisibility(){if(!onPage())return;if(document.visibilityState==='hidden')suspend();else if(document.visibilityState==='visible')return feed(false,true);}
  window.addEventListener('pagehide',suspend);window.addEventListener('pageshow',onPageShow);document.addEventListener?.('visibilitychange',onVisibility);
  function remember(){sbWrite(keys.draft,pending);}
  function discardDraft() {
    sbWrite(keys.draft,null);sbWrite(keys.name,null);pending=null;draft={student_name:'',title:'',content:''};file=null;
    if(preview)URL.revokeObjectURL(preview);preview='';
  }
  function updateSession(next) {
    if(next.studentSession?.draftScope===data.studentSession?.draftScope)return;
    discardDraft();keys=sbDraftKeys(code,next.studentSession);
    message='학생 세션이 변경되어 이전 학생의 작성 내용을 비웠습니다. 본인 계정을 확인하고 제출하세요.';
  }
  function privateFailure(error) {
    if(error.status===401||error.status===403||error.status===409){discardDraft();keys={draft:null,name:null};data.studentSession=null;}
    data.posts=[];data.careerRecords=[];data.next=null;screenLocked=true;gateError=error;
  }
  function inputDisabled(){return busy||feedBusy||!!pending;}
  function render() {
    if(!onPage())return;
    if(screenLocked){$app.innerHTML=`<div class="login-wrap"><div class="card"><h1>${gateError?'학생 입장을 다시 확인해 주세요':'학생 세션을 확인하고 있어요'}</h1><p role="status">${esc(gateError?.message||'확인이 끝나면 내 제출물과 기록을 표시합니다.')}</p>${gateError?`<a class="btn btn-primary" href="${esc(sbAccountUrl(code))}">학생 계정 확인</a><button class="btn btn-soft" id="sc-session-reload">수업 다시 확인</button><a href="/app#/login">참여 코드로 다시 입장</a>`:''}</div></div>`;document.getElementById('sc-session-reload')?.addEventListener('click',()=>feed(false,true));return;}
    const s=lesson(), settings=s.submissions, recordEnabled=sbRecordEnabled(data.course,s), active=page==='today', boardTab=tab==='board'||!active;
    const title=page==='mine'?'내 제출물':page==='records'?'내 진로기록':s.title;
    const activityLinks=s.materials.links.filter(l=>l.kind==='aiapp');
    const activityFiles=s.materials.files.filter(f=>f.purpose==='app'||/\.html?$/i.test(f.name));
    const resources={links:s.materials.links.filter(l=>l.kind!=='aiapp'),files:s.materials.files.filter(f=>!activityFiles.includes(f))};
    const visiblePosts=data.posts; // Already filtered and authorized by the server.
    $app.innerHTML=`<div class="student-class"><aside class="sc-sidebar"><a class="sc-brand" href="#/board/${code}"><span aria-hidden="true">🌱</span><span>MOAKIT<small>수업허브</small></span></a><nav aria-label="학생 메뉴">${[['today','book','오늘 수업'],['mine','file','내 제출물'],['records','clock','내 진로기록']].map(([k,i,n])=>`<button data-sc-page="${k}" class="${page===k?'active':''}" aria-pressed="${page===k}">${icon(i)} ${n}</button>`).join('')}</nav><div class="sc-sidebar-bottom"><p>오늘의 배움이<br>더 큰 내일로</p>${data.studentSession?.accountLinked?`<a href="${esc(sbAccountUrl(code))}">내 계정·전체 진로기록</a>`:''}<button id="sc-leave">${data.studentSession?.accountLinked?'로그아웃하고 수업 나가기':'수업 나가기'}</button></div></aside><main class="sc-main"><header class="sc-header"><div class="sc-breadcrumb">${icon('book')} ${esc(join.board.title)} <span>참여 코드 ${esc(code.toUpperCase())}</span></div><div class="sc-heading"><div><h1>${esc(title)}</h1><p>${active?esc(s.bridge||'활동하고, 결과물을 남기고, 함께 나눠보세요.'):data.studentSession?.accountLinked?'이 수업에서 내 계정으로 제출한 기록입니다. 다른 수업의 기록은 내 계정에서 확인하세요.':'현재 학생 세션의 제출물입니다. 진로기록을 연결한 수업은 학생 계정으로 참여하세요.'}</p></div>${active?`<nav class="sc-lessons" aria-label="차시 선택">${data.course.sessions.map((x,i)=>`<button data-sc-lesson="${esc(x.id)}" class="${x.id===current?'active':''}" aria-current="${x.id===current?'step':'false'}"><b>${i+1}차시</b><span>${esc(x.title)}</span></button>`).join('')}</nav>`:''}</div>${active?`<nav class="sc-tabs" aria-label="수업 화면">${[['activity','활동하기'],['materials','자료·활동지'],['board','제출 게시판']].map(([k,n])=>`<button data-sc-tab="${k}" class="${tab===k?'active':''}" aria-pressed="${tab===k}">${n}</button>`).join('')}</nav>`:''}</header><div class="sc-body">
    ${boardTab?`<div class="sc-board-layout ${!active?'without-composer':''}"><section class="sc-panel sc-board"><div class="sc-panel-title"><h2>${page==='records'?'제출 활동과 기록 상태':page==='mine'?'내가 제출한 결과물':'우리 반 제출 게시판'}</h2><span class="sc-privacy">${icon('lock')} 교사가 공개한 제출물만 함께 봐요</span></div>${active?`<div class="sc-filters"><button data-sc-scope="all" class="${scope==='all'?'active':''}">전체 제출물</button><button data-sc-scope="mine" class="${scope==='mine'?'active':''}">내 제출물</button></div>`:''}<div class="sc-feed-status" role="status">${feedBusy?'불러오는 중…':''}</div>${page==='records'?`<div class="sc-records">${sbRecordsHtml(data.careerRecords||[])}</div>`:`<div class="sc-grid">${visiblePosts.map(sbCard).join('')||`<div class="sc-empty">${scope==='mine'||page==='mine'?'아직 내 제출물이 없습니다.':'아직 공개된 제출물이 없습니다.'}<p>제출한 결과물은 선생님이 먼저 확인합니다.</p></div>`}${active?'<button class="sc-add" id="sc-focus-compose"><span>＋</span>내 결과물 올리기</button>':''}</div>`}${data.next?'<button class="btn btn-soft sc-more" id="sc-more">더 보기</button>':''}</section>
    ${active?`<section class="sc-panel sc-compose" aria-labelledby="sc-compose-title"><h2 id="sc-compose-title">내 결과물 올리기</h2>${recordEnabled?`<p class="sc-help">진로기록 제출 안내: ${esc(s.record.completion)}</p>`:''}${settings.enabled?`<form id="sc-form"><div class="sc-upload-actions"><button type="button" id="sc-camera" ${inputDisabled()||!settings.types.includes('photo')?'disabled':''}>${icon('camera')} 사진 찍기</button><button type="button" id="sc-file" ${inputDisabled()||!settings.types.some(t=>t!=='text')?'disabled':''}>${icon('upload')} 파일 선택</button></div><p class="sc-help">${settings.types.map(t=>SB_TYPES[t]).join(' · ')}<br>한 번에 파일 1개 · 최대 20MB</p><input id="sc-camera-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden><input id="sc-file-input" type="file" accept="${[...(settings.types.includes('photo')?['.png','.jpg','.jpeg','.webp','.gif']:[]),...(settings.types.includes('document')?['.pdf','.ppt','.pptx','.doc','.docx','.xls','.xlsx','.hwp','.hwpx']:[])].join(',')}" hidden>
    <label>이름<input id="sc-name" value="${esc(draft.student_name)}" maxlength="20" autocomplete="off" placeholder="선생님이 확인할 이름" required ${inputDisabled()?'disabled':''}></label><label>제목<input id="sc-title" value="${esc(draft.title)}" maxlength="120" placeholder="예: 민들레 관찰 기록" required ${inputDisabled()?'disabled':''}></label><label>설명 ${file||pending?.snapshot.uploadId?'(선택)':''}<textarea id="sc-content" rows="3" maxlength="2000" placeholder="무엇을 관찰하고 만들었나요?" ${inputDisabled()?'disabled':''}>${esc(draft.content)}</textarea></label>
    ${file||pending?.fileName?`<div class="sc-selected">${preview?`<img src="${esc(preview)}" alt="선택한 사진 미리보기">`:icon('file')}<span>${esc(file?.name||pending.fileName)}</span><button id="sc-remove-file" type="button" ${inputDisabled()?'disabled':''}>빼기</button></div>`:''}
    <div class="sc-visibility"><span>공개 범위</span><strong>${icon('lock')} 선생님에게 제출</strong><small>${settings.sharing==='class'?'우리 반 공개 여부는 선생님이 정해요.':'이 차시는 선생님만 볼 수 있어요.'}</small></div><button class="sc-submit" type="submit" ${busy?'disabled':''}>${busy?'제출 중…':pending?'같은 제출 다시 확인':'제출하기'}</button><p id="sc-message" role="status" aria-live="polite">${esc(message)}</p>${pending&&!busy?'<button class="btn btn-ghost btn-sm" id="sc-reset" type="button">확인 중인 제출 취소</button>':''}<p class="sc-submit-note">${icon('file')} 제출 확인 → 내 제출물에 보관</p></form>`:'<p class="sc-empty">이 차시는 지금 제출을 받지 않습니다.</p>'}</section>`:''}</div>`:
    tab==='activity'?`<section class="sc-panel sc-activity"><span class="sc-eyebrow">${esc(data.course.name)} · ${s.minutes}분</span><h2>오늘의 활동을 시작해요</h2><p>${esc(s.bridge||'선생님의 안내에 따라 웹앱 활동을 진행하세요.')}</p><div class="sc-app-links">${activityLinks.map(l=>`<a href="${esc(careerMaterialUrl(l,code,careerStudentId))}" target="_blank" rel="noopener noreferrer">${icon('monitor')}<span>${esc(l.label||'웹앱 활동 열기')}<small>새 창에서 활동하기</small></span><b>↗</b></a>`).join('')}${studentMaterialsHtml({links:[],files:activityFiles},code,careerStudentId)}${!activityLinks.length&&!activityFiles.length?'<div class="sc-empty">선생님이 공유한 웹앱이 아직 없습니다.</div>':''}</div><button class="btn btn-primary" data-sc-tab="board">활동 결과물 제출하기 →</button></section>`:`<section class="sc-panel sc-resources"><h2>수업 자료·활동지</h2><p>선생님이 이 수업에 공유한 자료를 확인하세요.</p>${studentMaterialsHtml(resources,code,careerStudentId)||'<p class="sc-empty">공유된 자료가 아직 없습니다.</p>'}</section>`}
    <aside class="sc-career-banner">${icon('file')}<div><strong>활동 기록과 연결</strong><p>${recordEnabled?'학생 계정에 연결된 진로기록으로 저장을 요청합니다. 완료 여부는 내 진로기록에서 확인하세요.':'이 차시는 게시판 제출만 받습니다. 진로기록 저장은 수업과 차시의 연결 설정을 따릅니다.'}</p></div><span>${recordEnabled?'진로기록 연결':'게시판 제출'}</span></aside></div></main></div>`;
    bind();
  }
  async function feed(append=false,force=false) {
    if((feedBusy&&!force)||!onPage())return;
    const ticket=++readEpoch,selectedPage=page,selectedScope=scope,selectedLesson=current;
    const valid=()=>onPage()&&ticket===readEpoch&&page===selectedPage&&scope===selectedScope&&current===selectedLesson;
    const oldPosts=data.posts||[],oldRecords=data.careerRecords||[],oldScope=data.studentSession?.draftScope;
    const p=new URLSearchParams();
    if(page==='today')p.set('lesson',current);
    if(page!=='today'||scope==='mine')p.set('scope','mine');
    if(append&&data.next)p.set('before',data.next);
    feedBusy=true;screenLocked=true;gateError=null;data.posts=[];data.careerRecords=[];data.next=null;render();
    try {
      if(selectedPage==='records'){
        // Check the browser's current account before returning to cached record views.
        const context=await sbRequest('GET',`${base}/submissions?scope=mine`);
        if(!valid())return;
        updateSession(context);data={...context,posts:[],careerRecords:[],next:null};
        if(oldScope!==context.studentSession?.draftScope)p.delete('before');
        const next=await sbRequest('GET',`${base}/career-records?${p}`);
        if(!valid())return;
        if(next.studentSession?.draftScope!==context.studentSession?.draftScope)throw Object.assign(new Error('학생 세션이 변경되었습니다. 본인 계정으로 수업을 다시 확인하세요.'),{status:409});
        data={...data,careerRecords:append&&oldScope===context.studentSession?.draftScope?[...oldRecords,...next.records]:next.records,next:next.next};
      }else{
        const next=await sbRequest('GET',`${base}/submissions?${p}`);
        if(!valid())return;
        updateSession(next);data={...next,posts:append&&oldScope===next.studentSession?.draftScope?[...oldPosts,...next.posts]:next.posts};
      }
      screenLocked=false;gateError=null;
    }catch(e){if(valid()){message=e.message;privateFailure(e);}}
    finally{if(valid()){feedBusy=false;render();}}
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
  async function openPrivateFile(button,path) {
    const ticket=readEpoch;button.disabled=true;
    try{
      const result=await sbRequest('GET',path);
      if(!onPage()||screenLocked||ticket!==readEpoch)return;
      const a=document.createElement('a');a.href=result.url;a.rel='noopener noreferrer';a.target='_blank';a.click();
    }catch(e){if(onPage()&&ticket===readEpoch){if([401,403,409].includes(e.status)){privateFailure(e);render();}else toast(e.message,true);}}
    finally{button.disabled=false;}
  }
  function bind() {
    const root=document.querySelector('.student-class');
    root.querySelectorAll('[data-sc-tab]').forEach(b=>b.onclick=()=>{if(busy)return;tab=b.dataset.scTab;render();if(tab==='board')feed();});
    root.querySelectorAll('[data-sc-page]').forEach(b=>b.onclick=()=>move(()=>{page=b.dataset.scPage;}));
    root.querySelectorAll('[data-sc-lesson]').forEach(b=>b.onclick=()=>{if(pending)return toast('먼저 확인 중인 제출을 완료해 주세요.',true);if(dirty())return toast('작성 중인 결과물을 먼저 제출해 주세요.',true);move(()=>{current=b.dataset.scLesson;});});
    root.querySelectorAll('[data-sc-scope]').forEach(b=>b.onclick=()=>move(()=>{scope=b.dataset.scScope;}));
    root.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>{const p=data.posts.find(p=>String(p.id)===b.dataset.photo);if(p?.previewUrl)openImageLightbox(p.previewUrl);});
    root.querySelectorAll('[data-subfile]').forEach(b=>b.onclick=()=>openPrivateFile(b,`${base}/submission-file/${b.dataset.subfile}`));
    root.querySelectorAll('[data-career-retry]').forEach(b=>b.onclick=async()=>{
      if(busy||screenLocked)return;const ticket=readEpoch;busy=true;b.disabled=true;
      try{const r=await sbRequest('POST',`${base}/career-records/${b.dataset.careerRetry}/retry`,{draftScope:data.studentSession?.draftScope});if(onPage()&&!screenLocked&&ticket===readEpoch)toast(r.state==='saved'?'진로기록 저장을 확인했습니다.':'저장 연결을 확인하지 못했습니다. 제출 원본은 보관되어 있습니다.',r.state!=='saved');}
      catch(e){if(onPage()&&ticket===readEpoch){if([401,403,409].includes(e.status))privateFailure(e);else toast(e.message,true);}}
      finally{if(onPage()&&ticket===readEpoch){busy=false;if(screenLocked)render();else await feed();}}
    });
    root.querySelectorAll('[data-career-file]').forEach(b=>b.onclick=()=>openPrivateFile(b,`${base}/career-records/${b.dataset.careerFile}/file`));
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
      if(!confirm(dirty()?'작성 중인 내용이 있습니다. 수업에서 나갈까요?':data.studentSession?.accountLinked?'로그아웃하고 수업에서 나갈까요? 공유기기의 다음 학생은 본인 계정으로 로그인해야 합니다.':'수업에서 나갈까요? 공유기기의 다음 학생은 새 제출 세션으로 입장합니다.'))return;
      try{await sbRequest('POST',`${base}/leave`,{});sbWrite(keys.draft,null);sbWrite(keys.name,null);pending=null;draft={};file=null;location.hash='#/login';}catch(e){toast(e.message,true);}
    };
  }
  async function send() {
    if(busy||feedBusy||screenLocked)return;
    if(!pending&&(!draft.student_name.trim()||!draft.title.trim()||(!draft.content.trim()&&!file))){message='이름·제목을 적고 활동 내용이나 파일을 추가하세요.';render();return;}
    if(!pending){pending=submissionAttempt({...draft,sessionId:current,uploadId:null,draftScope:data.studentSession?.draftScope});pending.fileName=file?.name||'';remember();}
    const attempt=pending,ticket=readEpoch;
    const valid=()=>onPage()&&!screenLocked&&ticket===readEpoch&&attempt.snapshot.draftScope===data.studentSession?.draftScope;
    busy=true;message='제출 내용을 확인하고 있어요.';render();
    let acknowledged=false;
    try {
      if(attempt.fileName&&!attempt.uploaded){
        if(!file)throw Object.assign(new Error('새로고침 전 파일은 다시 선택해야 합니다. 확인 중인 제출을 취소한 뒤 파일을 선택하세요.'),{status:400});
        const sign=await sbRequest('POST',`${base}/file-sign`,{sessionId:attempt.snapshot.sessionId,name:file.name,size:file.size,draftScope:attempt.snapshot.draftScope});
        if(!valid())return;
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
        try{const r=await fetch(sign.uploadUrl,{method:'PUT',headers:{'Content-Type':sign.mime,'x-upsert':'false'},body:file,signal:controller.signal});if(!r.ok)throw new Error('파일 업로드에 실패했습니다. 같은 제출로 다시 시도하세요.');}finally{clearTimeout(timer);}
        if(!valid())return;attempt.snapshot.uploadId=sign.uploadId;attempt.uploaded=true;remember();
      }
      const submitted = await sbRequest('POST',`${base}/posts`,attempt.snapshot);
      if(!valid())return;
      acknowledged=true;sbWrite(keys.name,draft.student_name);pending=null;remember();
      draft={student_name:draft.student_name,title:'',content:''};file=null;if(preview)URL.revokeObjectURL(preview);preview='';message=submitted.career?.state==='saved'?'제출과 진로기록 저장이 완료되었어요.':submitted.career?.state==='pending'?'제출은 완료되었어요. 내 진로기록에서 저장을 다시 확인해 주세요.':'제출 완료! 선생님에게 전달했어요.';scope='mine';tab='board';
    }catch(e){if(!valid())return;message=e.name==='AbortError'?'응답이 늦어지고 있어요. 같은 제출 다시 확인을 눌러주세요.':e.message;if(e.status===400){pending=null;remember();}if([401,403,409].includes(e.status))privateFailure(e);}
    finally{if(onPage()&&ticket===readEpoch){busy=false;render();}}
    if(acknowledged&&valid())await feed();
  }
  render();await feed();
}
async function loadSubmissionSettings(el,boardId) {
  let data,busy=false,schools=[],schoolError='';
  try{data=await sbRequest('GET',`/api/boards/${boardId}/submission-settings`);}catch(e){el.textContent=e.message;return;}
  if(data.careerAvailable){try{schools=(await sbRequest('GET','/api/student-accounts/schools')).schools||[];}catch(e){schoolError=e.message;}}
  const draw=()=>{
    const c=data.config;
    el.innerHTML=`<h2>차시·학생 제출 설정</h2><p class="small muted">이 수업의 운영 구성과 제출 방법을 정하세요. 공유 자료는 아래에서 선택합니다.</p><div class="sc-teacher-variant"><label>운영 구성<select id="sbt-variant"><option value="${esc(c.variantId)}">${esc(c.name)} · ${c.sessions.length}차시 (현재)</option>${data.variants.filter(v=>v.id!==c.variantId).map(v=>`<option value="${esc(v.id)}">${esc(v.name)} · ${v.count}차시</option>`).join('')}</select></label><button class="btn btn-soft" id="sbt-apply">구성 적용</button></div>${sbCareerSettingsHtml(c,data.careerAvailable===true,schools,schoolError)}<label class="sc-share-consent"><input type="checkbox" id="sbt-share"> 이 구성의 학생 웹앱·활동지도 학생에게 공유</label><div class="sc-settings-scroll"><table class="sc-settings"><thead><tr><th>차시</th><th>오늘 수업</th><th>제출 받기</th><th>허용 형식</th><th>공개 범위</th></tr></thead><tbody>${c.sessions.map((s,i)=>`<tr><th>${i+1}차시<br>${esc(s.title)}</th><td><input type="radio" name="sbt-active" data-active="${esc(s.id)}" aria-label="${i+1}차시를 오늘 수업으로" ${c.activeSession===s.id?'checked':''}></td><td><input type="checkbox" data-enabled="${i}" aria-label="${i+1}차시 제출 받기" ${s.submissions.enabled?'checked':''}></td><td>${Object.entries(SB_TYPES).map(([k,n])=>`<label><input type="checkbox" data-type="${i}:${k}" ${s.submissions.types.includes(k)?'checked':''}>${n}</label>`).join('')}</td><td><select data-sharing="${i}" aria-label="${i+1}차시 공개 범위"><option value="teacher" ${s.submissions.sharing==='teacher'?'selected':''}>선생님만 열람</option><option value="class" ${s.submissions.sharing==='class'?'selected':''}>교사 확인 후 우리 반 공개</option></select></td></tr>`).join('')}</tbody></table></div><p class="small muted">우리 반 공개를 허용해도 새 제출물은 먼저 선생님에게만 보입니다. 아래 제출 카드의 ‘우리 반에 공개’로 공개하세요. 학생 계정 연결과 차시의 기록 설정을 모두 켜야 진로기록을 저장합니다. 제출 카드에서 실제 저장 결과를 확인하세요.</p><button class="btn btn-primary" id="sbt-save">제출 설정 저장</button><button class="btn btn-soft" id="sbt-records">이 수업의 진로기록 확인</button><p id="sbt-message" role="status"></p>`;
    el.querySelector('#sbt-records').onclick=async()=>{const button=el.querySelector('#sbt-records');button.disabled=true;try{const result=await sbRequest('GET',`/api/boards/${boardId}/career-records`);const modal=openModal(`<h3>이 수업의 진로기록</h3><p>최근 200건의 제출 원본과 실제 저장 결과입니다. 교사 확인 여부와 저장 성공은 별개입니다.</p>${result.records.map(r=>`<section class="ce-preview"><h4>${esc(r.studentName)} · ${esc(r.record.artifact)}</h4><p>${esc(r.record.raw_data.submission.session_title)}</p><p>${esc(r.record.process)}</p><span>${sbCareerLabel(r.state)}</span>${r.recordId?`<p class="small muted">저장 번호 ${esc(r.recordId)}</p>`:''}<details><summary>제출한 글 보기</summary><p class="sc-original-text">${esc(r.record.raw_data.submission.content||'글 설명 없음')}</p></details></section>`).join('')||'<p>진로기록으로 제출한 활동이 없습니다.</p>'}<div class="m-actions"><button class="btn btn-primary" id="sbt-records-close">닫기</button></div>`);modal.querySelector('#sbt-records-close').onclick=()=>modal.remove();}catch(e){toast(e.message,true);}finally{button.disabled=false;}};
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
    const careerEnabled=el.querySelector('#sbt-career').checked;
    const selectedSchool=el.querySelector('#sbt-school').value||c.career?.schoolId||null;
    if(careerEnabled&&(!selectedSchool||!data.careerAvailable||schoolError)){el.querySelector('#sbt-message').textContent=schoolError||'학생 계정 연결 상태와 담당 학교를 확인하세요.';return;}
    const career={enabled:careerEnabled,schoolId:careerEnabled?selectedSchool:null};
    busy=true;el.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);
    try{const r=await sbRequest('PUT',`/api/boards/${boardId}/submission-settings`,{revision:c.revision,variantId,sessions,activeSession,shareStudentMaterials,career});data.config=r.config;draw();el.querySelector('#sbt-message').textContent='설정이 저장되었습니다.';if(shareStudentMaterials){const card=document.getElementById('share-card');if(card)loadShareCard(card,boardId);}}catch(e){el.querySelector('#sbt-message').textContent=e.message;}finally{busy=false;el.querySelectorAll('button,input,select').forEach(b=>b.disabled=false);const toggle=el.querySelector('#sbt-career'),school=el.querySelector('#sbt-school');const unavailable=!data.careerAvailable||!schools.length||!!schoolError;if(toggle)toggle.disabled=unavailable&&!toggle.checked;if(school)school.disabled=unavailable;}
  }
  draw();
}
