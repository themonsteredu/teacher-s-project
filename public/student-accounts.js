'use strict';
const $ = id => document.getElementById(id);
const message = text => { $('message').textContent = text; };
let studentEpoch = 0, studentUsername = null, recordsBefore = null, recordsBusy = false;
const returnCode = new URLSearchParams(location.search).get('board');
if (/^[A-Za-z0-9]{4,10}$/.test(returnCode || '')) $('return-board').href='/app#/board/'+returnCode;
function clearRecords() {
  $('records').replaceChildren();$('records-pane').hidden=true;
  $('records-more').hidden=true;$('records-more').disabled=false;$('records-message').textContent='';
  recordsBefore=null;recordsBusy=false;
}
function clearStudent() {
  ++studentEpoch;studentUsername=null;clearRecords();
  $('account-name').textContent='';$('signed-in').hidden=true;
  $('password-form').hidden=true;$('password-form').reset();
  $('return-board').hidden=true;$('login-form').hidden=false;
  return studentEpoch;
}
function appendRecord(record) {
  const article=document.createElement('article'),heading=document.createElement('h3'),when=document.createElement('p'),process=document.createElement('p');
  // 같은 학생 번호로 모아랩(job.moakit.ai) 진로 수업에서 남긴 기록도 함께 나온다.
  const job=record.source==='job'&&record.raw_data&&typeof record.raw_data.job==='object'?record.raw_data.job:null;
  heading.textContent=record.artifact||(job&&typeof job.deck_title==='string'?job.deck_title:'')||'활동 결과물';
  const date=new Date(record.occurred_at);
  when.textContent=(Number.isNaN(date.getTime())?'활동 날짜 확인 중':date.toLocaleString('ko-KR'))+(job?' · 모아랩 진로 수업':'');
  when.className='muted';process.textContent=record.process||'';
  article.append(heading,when,process);
  if(record.reflection){const reflection=document.createElement('p');reflection.textContent='내가 남긴 생각: '+record.reflection;article.append(reflection);}
  const submitted=record.raw_data?.submission;
  if(typeof submitted?.content==='string'&&submitted.content){
    const details=document.createElement('details'),summary=document.createElement('summary'),original=document.createElement('p');
    summary.textContent='내가 제출한 글 보기';original.textContent=submitted.content;original.style.whiteSpace='pre-wrap';
    details.append(summary,original);article.append(details);
  }
  if(typeof submitted?.attachment?.name==='string'){
    const attachment=document.createElement('p');attachment.textContent='함께 제출한 파일: '+submitted.attachment.name;article.append(attachment);
  }
  $('records').append(article);
}
async function loadRecords(reset=false) {
  if(recordsBusy)return;
  if(reset){$('records').replaceChildren();recordsBefore=null;}
  const epoch=studentEpoch;recordsBusy=true;$('records-more').disabled=true;
  $('records-message').textContent='기록을 불러오는 중…';
  try{
    const result=await request('records'+(recordsBefore?'?before='+encodeURIComponent(recordsBefore):''));
    if(epoch!==studentEpoch)return;
    if(!studentUsername||result.username!==studentUsername){
      clearStudent();message('학생 계정이 변경되었습니다. 학생 로그인 메뉴에서 계정을 다시 확인해 주세요.');return;
    }
    result.records.forEach(appendRecord);recordsBefore=result.nextBefore;
    $('records-more').hidden=!recordsBefore;
    $('records-message').textContent=$('records').children.length?'':'아직 저장된 진로기록이 없습니다. 수업에서 활동을 제출하면 이곳에서 확인할 수 있습니다.';
  }catch(e){
    if(epoch!==studentEpoch)return;
    if(e.status===401||e.status===403){clearStudent();message(e.message);}
    else $('records-message').textContent=e.message;
  }
  finally{if(epoch===studentEpoch){recordsBusy=false;$('records-more').disabled=false;}}
}
async function request(path, method = 'GET', body) {
  const r = await fetch('/api/student-accounts/' + path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.error || '요청에 실패했습니다.'), { status: r.status });
  return data;
}
function bindForm(id, action) {
  $(id).onsubmit = async event => {
    event.preventDefault(); const button = $(id).querySelector('button'); if (button.disabled) return;
    button.disabled = true; message('처리 중…');
    try { await action(new FormData($(id))); } catch (e) { message(e.message); }
    finally { button.disabled = false; }
  };
}
async function refreshStudent() {
  const epoch=clearStudent();
  if(document.visibilityState!=='visible')return;
  message('학생 계정을 확인하는 중…');
  try {
    const me = await request('me');
    if(epoch!==studentEpoch)return;
    studentUsername=me.username;
    $('login-form').hidden = true; $('signed-in').hidden = false;
    $('account-name').textContent = me.username;
    $('password-form').hidden = !me.mustChangePassword;
    message(me.mustChangePassword ? '첫 로그인입니다. 비밀번호를 변경해 주세요.' : '학생 계정으로 로그인했습니다.');
    if(!me.mustChangePassword){$('return-board').hidden=!/^[A-Za-z0-9]{4,10}$/.test(returnCode||'');$('records-pane').hidden=false;await loadRecords(true);}
  } catch (e) { if(epoch!==studentEpoch)return;clearStudent();message(e.status===401?'학생 로그인 후 기록을 확인하세요.':e.message); }
}
bindForm('login-form', async f => { await request('login','POST',{username:f.get('username').trim(),password:f.get('password')}); $('login-form').reset(); await refreshStudent(); });
bindForm('password-form', async f => {
  if(f.get('next')!==f.get('confirm')) throw new Error('새 비밀번호가 서로 다릅니다.');
  await request('password','POST',{current:f.get('current'),next:f.get('next')});
  $('password-form').reset(); await refreshStudent(); message('비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인하세요.');
});
$('logout').onclick=async()=>{clearStudent();try{await request('logout','POST');await refreshStudent();message('로그아웃했습니다.');}catch(e){message(e.message);}};
$('records-more').onclick=()=>loadRecords();
window.addEventListener('pagehide',()=>{clearStudent();$('login-form').reset();});
window.addEventListener('pageshow',event=>{if(event.persisted&&$('manager-pane').hidden)refreshStudent();});
window.addEventListener('focus',()=>{if(document.visibilityState==='visible'&&$('manager-pane').hidden)refreshStudent();});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){clearStudent();$('login-form').reset();}
  else if(document.visibilityState==='visible'&&$('manager-pane').hidden)refreshStudent();
});
window.AccountManager.init({request,message,clearStudent,refreshStudent});
refreshStudent();
