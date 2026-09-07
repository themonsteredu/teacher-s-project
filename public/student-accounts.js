'use strict';
const $ = id => document.getElementById(id);
const message = text => { $('message').textContent = text; };
let selectedMember = null;
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
  heading.textContent=record.artifact||'활동 결과물';
  const date=new Date(record.occurred_at);
  when.textContent=Number.isNaN(date.getTime())?'활동 날짜 확인 중':date.toLocaleString('ko-KR');
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
function clearIssued(){ $('issued-values').textContent='';$('issued').hidden=true; }
$('clear-issued').onclick=clearIssued;
window.addEventListener('pagehide',clearIssued);
window.addEventListener('pagehide',()=>{clearStudent();$('login-form').reset();});
window.addEventListener('pageshow',event=>{if(event.persisted&&$('manager-pane').hidden)refreshStudent();});
window.addEventListener('focus',()=>{if(document.visibilityState==='visible'&&$('manager-pane').hidden)refreshStudent();});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){clearStudent();$('login-form').reset();clearIssued();}
  else if(document.visibilityState==='visible'&&$('manager-pane').hidden)refreshStudent();
});
$('student-tab').onclick=()=>{clearIssued();$('student-pane').hidden=false;$('manager-pane').hidden=true;refreshStudent();};
async function schools(){
  const d=await request('schools');$('schools').replaceChildren(new Option('학교를 선택하세요',''));
  d.schools.forEach(s=>$('schools').add(new Option(s.name,s.id)));
}
$('manager-tab').onclick=async()=>{
  clearStudent();clearIssued();$('student-pane').hidden=true;$('manager-pane').hidden=false;message('');
  try {
    const r=await fetch('/api/me',{credentials:'same-origin'});const d=await r.json();
    if(!r.ok) throw new Error('모아허브에서 교사 로그인 후 이 화면으로 돌아오세요.');
    $('teacher-status').textContent=`${d.user.name} 선생님 · 담당 학교만 표시됩니다.`;
    $('school-form').hidden=d.user.role!=='admin';$('manager-form').hidden=true;
    $('manager-pane').dataset.admin=String(d.user.role==='admin'); await schools();
  }catch(e){message(e.message);}
};
bindForm('school-form',async f=>{await request('schools','POST',{name:f.get('schoolName')});$('school-form').reset();await schools();message('학교를 등록했습니다.');});
const schoolPath=()=>{if(!$('schools').value)throw new Error('학교를 선택하세요.');return `schools/${$('schools').value}`;};
async function members(){
  const d=await request(schoolPath()+'/students');$('students').replaceChildren();
  d.students.forEach(s=>{
    const tr=document.createElement('tr');
    for(const value of [s.display_name,s.class_name,s.username]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
    const td=document.createElement('td'),edit=document.createElement('button'),reset=document.createElement('button');
    edit.textContent='반·이름 변경';edit.onclick=()=>{selectedMember=s.id;$('member-form').hidden=false;$('member-form').elements.displayName.value=s.display_name;$('member-form').elements.className.value=s.class_name;};
    reset.textContent='비밀번호 초기화';reset.onclick=async()=>{
      if(!confirm(`${s.display_name} 학생의 비밀번호를 초기화할까요? 기존 로그인은 종료됩니다.`))return;
      reset.disabled=true;try{const r=await request(schoolPath()+`/students/${s.id}/reset`,'POST');$('issued-values').textContent=`${s.display_name}\t${s.username}\t${r.temporaryPassword}`;$('issued').hidden=false;message('임시 비밀번호를 학생에게 전달하세요.');}catch(e){message(e.message);}finally{reset.disabled=false;}
    };
    td.append(edit,reset);tr.append(td);$('students').append(tr);
  });
}
$('schools').onchange=async()=>{clearIssued();$('member-form').hidden=true;selectedMember=null;$('students').replaceChildren();$('roster-form').hidden=!$('schools').value;$('manager-form').hidden=!$('schools').value||$('manager-pane').dataset.admin!=='true';if($('schools').value)try{await members();}catch(e){message(e.message);}};
bindForm('manager-form',async f=>{await request(schoolPath()+'/managers','POST',{teacherId:f.get('teacherId').trim()});message('학교 담당자를 지정했습니다.');});
bindForm('roster-form',async f=>{
  const students=f.get('roster').trim().split(/\r?\n/).map(line=>{const parts=line.split('\t');if(parts.length!==2)throw new Error('각 줄에 이름과 반을 탭으로 구분하세요.');return {displayName:parts[0].trim(),className:parts[1].trim()};});
  const d=await request(schoolPath()+'/students','POST',{students});
  $('issued-values').textContent=d.students.map(s=>`${s.displayName}\t${s.className}\t${s.username}\t${s.temporaryPassword}`).join('\n');$('issued').hidden=false;$('roster-form').reset();message(`${d.students.length}명 계정을 발급했습니다.`);await members();
});
bindForm('member-form',async f=>{await request(schoolPath()+`/students/${selectedMember}`,'PATCH',{displayName:f.get('displayName'),className:f.get('className')});$('member-form').hidden=true;await members();message('소속 정보를 변경했습니다.');});
refreshStudent();
