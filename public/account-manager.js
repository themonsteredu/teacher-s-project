'use strict';
window.AccountManager = {
  init({request,message,clearStudent,refreshStudent}) {
    const $=id=>document.getElementById(id),IO=window.AccountRoster;
    let epoch=0,schoolId='',schoolName='',busy=false,students=[],issued=[],preview=[],previewSignature='',editing=null,fileEpoch=0;
    const stamp=()=>({epoch,schoolId});
    const current=s=>s.epoch===epoch&&s.schoolId===schoolId&&document.visibilityState!=='hidden';
    function clearIssued(){issued=[];$('issued-values').textContent='';$('issued').hidden=true;}
    function clearPreview(){preview=[];previewSignature='';$('roster-preview').hidden=true;$('roster-preview-rows').replaceChildren();$('issue-accounts').disabled=true;}
    function clearSchool(){++epoch;++fileEpoch;clearIssued();clearPreview();students=[];editing=null;schoolId='';schoolName='';$('schools').value='';$('roster-form').reset();$('member-form').reset();$('manager-form').reset();$('roster-form').hidden=true;$('manager-form').hidden=true;$('member-form').hidden=true;$('students').replaceChildren();$('student-count').textContent='';$('download-students').disabled=true;changeMode();}
    function setBusy(value){busy=value;$('schools').disabled=value;$('student-tab').disabled=value;$('manager-tab').disabled=value;
      for(const id of ['roster-form','member-form','manager-form','school-form'])for(const control of $(id).querySelectorAll('input,textarea,select,button'))control.disabled=value;
      $('issue-accounts').disabled=value||!preview.length;
      for(const button of $('students').querySelectorAll('button'))button.disabled=value;
    }
    async function action(work){if(busy)return;setBusy(true);try{await work();}catch(e){if(e.status===401||e.status===403)clearSchool();message(e.message);}finally{setBusy(false);}}
    function signature(){return JSON.stringify([schoolId,$('roster-mode').value,$('roster-grade').value,$('roster-class').value,$('roster-text').value]);}
    function tr(values){const row=document.createElement('tr');for(const value of values){const cell=document.createElement('td');cell.textContent=value??'—';row.append(cell);}return row;}
    function download(headers,rows,name){const blob=new Blob([IO.csv(headers,rows)],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=IO.safeFilePart(name)+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    const filename=suffix=>`${schoolName||'학교'}_${suffix}_${new Date().toISOString().slice(0,10)}`;
    const rowValues=s=>[s.grade??'',s.classNumber??'',s.studentNumber??'',s.displayName??s.display_name??'',s.username];
    function showIssued(rows){issued=rows.map(s=>({...s}));$('issued-values').textContent=issued.map(s=>[...rowValues(s),s.temporaryPassword].join('\t')).join('\n');$('issued').hidden=false;}
    function renderStudents(){
      $('students').replaceChildren();$('student-count').textContent=`등록된 학생 ${students.length}명`;$('download-students').disabled=!students.length;
      for(const s of students){
        const row=tr(rowValues(s)),cell=document.createElement('td'),edit=document.createElement('button'),reset=document.createElement('button');
        if(!s.grade){row.children[1].textContent=s.class_name||'—';}
        edit.type=reset.type='button';edit.textContent='소속 수정';reset.textContent='비밀번호 초기화';edit.className=reset.className='secondary';
        edit.onclick=()=>{if(busy)return;editing=s.id;const f=$('member-form');f.hidden=false;f.elements.displayName.value=s.display_name;f.elements.grade.value=s.grade||'';f.elements.classNumber.value=s.classNumber||'';f.elements.studentNumber.value=s.studentNumber||'';$('member-legacy').textContent=s.grade?'':`기존 소속: ${s.class_name}. 학년·반·번호를 입력하면 같은 계정에 연결됩니다.`;f.scrollIntoView({block:'nearest',behavior:'smooth'});};
        reset.onclick=()=>action(async()=>{
          if(!confirm(`${s.display_name} 학생의 임시 비밀번호를 새로 발급할까요? 기존 로그인은 종료됩니다.`))return;
          const snap=stamp();message('임시 비밀번호를 발급하는 중…');
          const result=await request(`schools/${snap.schoolId}/students/${s.id}/reset`,'POST');
          if(!current(snap))return;showIssued([{...s,displayName:s.display_name,temporaryPassword:result.temporaryPassword}]);message('임시 비밀번호를 새로 발급했습니다. 계정 파일을 내려받아 학생에게 전달하세요.');await loadStudents(snap);
        });
        cell.append(edit,reset);row.append(cell);$('students').append(row);
      }
    }
    async function loadStudents(snap=stamp()) {let result;try{result=await request(`schools/${snap.schoolId}/students`);}catch(e){if(!current(snap))return;if(e.status===401||e.status===403)clearSchool();throw e;}if(!current(snap))return;students=result.students;renderStudents();}
    async function loadSchools(){const expected=epoch,result=await request('schools');if(expected!==epoch)return;$('schools').replaceChildren(new Option('학교를 선택하세요',''));for(const s of result.schools)$('schools').add(new Option(s.name,s.id));}
    function changeMode(){clearPreview();const single=$('roster-mode').value==='class';$('class-fields').hidden=!single;$('roster-grade').required=single;$('roster-class').required=single;$('roster-text').placeholder=single?'1\t김하나\n2\t이두나':'2\t1\t1\t김하나\n2\t2\t1\t이두나';$('roster-columns').textContent=single?'번호 · 이름 두 열을 엑셀에서 복사해 붙여넣으세요.':'학년 · 반 · 번호 · 이름 네 열을 엑셀에서 복사해 붙여넣으세요.';}
    function buildPreview(){
      clearPreview();if(!schoolId)throw new Error('담당 학교를 먼저 선택하세요.');
      const rows=IO.parseRoster($('roster-text').value,{mode:$('roster-mode').value,grade:$('roster-grade').value,classNumber:$('roster-class').value});
      const key=s=>[s.grade,s.classNumber,s.studentNumber].join(':'),occupied=new Set(students.filter(s=>s.grade&&s.classNumber&&s.studentNumber).map(key));
      const duplicate=rows.find(s=>occupied.has(key(s)));if(duplicate)throw new Error(`${duplicate.grade}학년 ${duplicate.classNumber}반 ${duplicate.studentNumber}번은 이미 등록되어 있습니다. 기존 학생의 소속 수정 메뉴를 이용하세요.`);
      preview=rows;previewSignature=signature();const groups=new Map();for(const s of rows){const group=`${s.grade}학년 ${s.classNumber}반`;groups.set(group,(groups.get(group)||0)+1);$('roster-preview-rows').append(tr([s.grade,s.classNumber,s.studentNumber,s.displayName]));}
      $('roster-summary').textContent=`총 ${rows.length}명 · `+[...groups].map(([name,count])=>`${name} ${count}명`).join(' / ');
      $('roster-preview').hidden=false;$('issue-accounts').disabled=false;message('명단을 확인한 뒤 계정 발급을 눌러주세요. 아직 계정은 생성되지 않았습니다.');
    }
    $('roster-mode').onchange=()=>{++fileEpoch;$('roster-file').value='';$('roster-text').value='';changeMode();};
    for(const id of ['roster-grade','roster-class','roster-text'])$(id).oninput=()=>{++fileEpoch;clearPreview();};
    $('preview-roster').onclick=()=>{if(busy)return;try{buildPreview();}catch(e){message(e.message);}};
    $('roster-file').onchange=async()=>{
      const file=$('roster-file').files?.[0];if(!file||busy)return;const seq=++fileEpoch,snap=stamp();clearPreview();
      try{
        if(!/\.(csv|tsv|txt)$/i.test(file.name))throw new Error('엑셀의 셀을 복사해 붙여넣거나, CSV UTF-8로 저장한 파일을 선택하세요.');
        if(file.size>200*1024)throw new Error('명단 파일은 200KB 이하, 한 번에 100명까지 등록할 수 있습니다.');
        let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw new Error('엑셀에서 파일 형식을 CSV UTF-8로 저장한 뒤 다시 선택하세요.');}
        if(seq!==fileEpoch||!current(snap))return;$('roster-text').value=text;buildPreview();
      }catch(e){if(seq===fileEpoch&&current(snap))message(e.message);}
    };
    $('download-template').onclick=()=>download(['학년','반','번호','이름'],[],'학생명단_학교전체_양식');
    $('roster-form').onsubmit=event=>{event.preventDefault();action(async()=>{
      if(!preview.length||previewSignature!==signature()){clearPreview();throw new Error('명단 확인을 먼저 눌러주세요.');}
      if(!$('new-students-confirm').checked)throw new Error('신규 학생 명단 확인란에 체크해 주세요.');
      const rows=preview.map(s=>({...s})),snap=stamp();clearIssued();message(`${rows.length}명 계정을 발급하는 중… 창을 닫지 마세요.`);
      const result=await request(`schools/${snap.schoolId}/students`,'POST',{students:rows});
      if(!current(snap))return;showIssued(result.students);$('roster-text').value='';$('roster-file').value='';$('new-students-confirm').checked=false;clearPreview();
      message(`${result.students.length}명 계정을 발급했습니다. 임시 비밀번호가 포함된 계정 파일을 지금 내려받으세요.`);await loadStudents(snap);
    });};
    $('download-issued').onclick=()=>{if(!issued.length)return;download(['학교','학년','반','번호','이름','아이디','임시 비밀번호'],issued.map(s=>[schoolName,...rowValues(s),s.temporaryPassword]),filename('발급계정'));};
    $('clear-issued').onclick=clearIssued;
    $('download-students').onclick=()=>action(async()=>{const snap=stamp();await loadStudents(snap);if(current(snap))download(['학교','학년','반','번호','이름','아이디','기존 소속'],students.map(s=>[schoolName,...rowValues(s),s.grade?'':s.class_name||'']),filename('학생명단'));});
    $('schools').onchange=async()=>{
      if(busy){$('schools').value=schoolId;return;}const nextId=$('schools').value,nextName=$('schools').selectedOptions[0]?.textContent||'';clearSchool();schoolId=nextId;schoolName=nextName;$('schools').value=nextId;
      $('roster-form').hidden=!schoolId;$('manager-form').hidden=!schoolId||$('manager-pane').dataset.admin!=='true';
      if(schoolId)try{await loadStudents();}catch(e){message(e.message);}
    };
    $('member-form').onsubmit=event=>{event.preventDefault();action(async()=>{
      const id=editing,snap=stamp();if(!id||!snap.schoolId)return;const f=$('member-form').elements;
      await request(`schools/${snap.schoolId}/students/${id}`,'PATCH',{displayName:f.displayName.value,grade:Number(f.grade.value),classNumber:Number(f.classNumber.value),studentNumber:Number(f.studentNumber.value)});
      if(!current(snap))return;$('member-form').hidden=true;editing=null;message('소속 정보를 수정했습니다. 아이디와 진로기록은 그대로 유지됩니다.');await loadStudents(snap);
    });};
    $('school-form').onsubmit=event=>{event.preventDefault();action(async()=>{const expected=epoch;await request('schools','POST',{name:$('school-form').elements.schoolName.value});if(expected!==epoch)return;$('school-form').reset();clearSchool();await loadSchools();message('학교를 등록했습니다. 담당 학교에서 선택하세요.');});};
    $('manager-form').onsubmit=event=>{event.preventDefault();action(async()=>{const snap=stamp();if(!snap.schoolId)return;await request(`schools/${snap.schoolId}/managers`,'POST',{teacherId:$('manager-form').elements.teacherId.value.trim()});if(current(snap))message('학교 담당자를 지정했습니다.');});};
    $('manager-tab').onclick=async()=>{
      if(busy)return;clearStudent();clearSchool();schoolId='';schoolName='';$('roster-form').hidden=true;$('manager-form').hidden=true;$('student-pane').hidden=true;$('manager-pane').hidden=false;message('');const expected=epoch;
      try{const r=await fetch('/api/me',{credentials:'same-origin'}),d=await r.json();if(expected!==epoch)return;if(!r.ok)throw new Error('모아허브에서 교사 로그인 후 이 화면으로 돌아오세요.');$('teacher-status').textContent=`${d.user.name} 선생님 · 담당 학교만 표시됩니다.`;$('school-form').hidden=d.user.role!=='admin';$('manager-pane').dataset.admin=String(d.user.role==='admin');await loadSchools();}catch(e){if(expected===epoch)message(e.message);}
    };
    $('student-tab').onclick=()=>{if(busy)return;clearSchool();schoolId='';schoolName='';$('student-pane').hidden=false;$('manager-pane').hidden=true;refreshStudent();};
    window.addEventListener('pagehide',()=>{clearSchool();});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){++epoch;++fileEpoch;clearIssued();}});
    changeMode();return {clearIssued};
  }
};
