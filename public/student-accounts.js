'use strict';
const $ = id => document.getElementById(id);
const message = text => { $('message').textContent = text; };
let selectedMember = null;
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
  try {
    const me = await request('me');
    $('login-form').hidden = true; $('signed-in').hidden = false;
    $('account-name').textContent = me.username;
    $('password-form').hidden = !me.mustChangePassword;
    message(me.mustChangePassword ? '첫 로그인입니다. 비밀번호를 변경해 주세요.' : '학생 계정으로 로그인했습니다.');
  } catch (e) { $('login-form').hidden=false; $('signed-in').hidden=true; $('password-form').hidden=true; if(e.status!==401) message(e.message); }
}
bindForm('login-form', async f => { await request('login','POST',{username:f.get('username').trim(),password:f.get('password')}); $('login-form').reset(); await refreshStudent(); });
bindForm('password-form', async f => {
  if(f.get('next')!==f.get('confirm')) throw new Error('새 비밀번호가 서로 다릅니다.');
  await request('password','POST',{current:f.get('current'),next:f.get('next')});
  $('password-form').reset(); await refreshStudent(); message('비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인하세요.');
});
$('logout').onclick=async()=>{try{await request('logout','POST');await refreshStudent();message('로그아웃했습니다.');}catch(e){message(e.message);}};
function clearIssued(){ $('issued-values').textContent='';$('issued').hidden=true; }
$('clear-issued').onclick=clearIssued;
window.addEventListener('pagehide',clearIssued);
$('student-tab').onclick=()=>{clearIssued();$('student-pane').hidden=false;$('manager-pane').hidden=true;refreshStudent();};
async function schools(){
  const d=await request('schools');$('schools').replaceChildren(new Option('학교를 선택하세요',''));
  d.schools.forEach(s=>$('schools').add(new Option(s.name,s.id)));
}
$('manager-tab').onclick=async()=>{
  clearIssued();$('student-pane').hidden=true;$('manager-pane').hidden=false;message('');
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
