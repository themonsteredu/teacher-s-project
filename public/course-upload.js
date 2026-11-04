'use strict';
function openCourseFileBatch({programId, variant, files, changed, redraw}) {
  let selected=[],busy=false;
  const hint = name => CourseAuthoring.fileHint(name);
  const modal=openModal('<h3>수업 파일 올리기</h3><p>HTML 웹앱과 수업 자료를 고르세요. 파일명에 차시와 학생용·교사용이 있으면 연결 위치를 제안합니다. 올리기 전에 확인하고 바꿀 수 있습니다.</p><input type="file" id="cb-files" multiple accept=".pdf,.ppt,.pptx,.doc,.docx,.hwp,.hwpx,.html,.htm,.zip,.png,.jpg,.jpeg,.webp"><button type="button" class="btn btn-soft btn-sm" id="cb-create-lessons">파일명으로 차시 만들기</button><p class="small muted">차시가 비어 있을 때만 만들 수 있습니다. 파일 이름에 1차시, 2차시처럼 적어 주세요.</p><div id="cb-rows"></div><div class="m-actions"><button class="btn btn-ghost" id="cb-close">닫기</button><button class="btn btn-primary" id="cb-upload">선택한 자료 업로드</button></div><p id="cb-message" role="status"></p>');
  modal.querySelector('#cb-close').onclick=()=>{if(!busy){modal.remove();redraw();}};
  function drawRows() {
    modal.querySelector('#cb-rows').innerHTML=selected.map((x,i)=>{
      const h=hint(x.file.name), index=h.number && h.number<=variant.sessions.length ? h.number-1 : -1;
      return `<div class="ce-bulk-row"><strong>${esc(x.file.name)}</strong><label>차시<select data-cb-session="${i}"><option value="">직접 선택</option>${variant.sessions.map((s,j)=>`<option value="${j}" ${j===index?'selected':''}>${j+1}차시 · ${esc(s.title||'제목 미입력')}</option>`).join('')}</select></label><label>자료 종류<select data-cb-slot="${i}"><option value="">직접 선택</option>${Object.entries(COURSE_SLOTS).map(([k,n])=>`<option value="${k}" ${h.slot===k?'selected':''}>${n}</option>`).join('')}</select></label><span data-cb-status="${i}" role="status">${index<0||!h.slot?'확인 필요':'제안 · 확인 필요'}</span></div>`;
    }).join('');
  }
  modal.querySelector('#cb-files').onchange=e=>{
    selected=Array.from(e.target.files).map(file=>({file,done:false}));
    drawRows();
  };
  modal.querySelector('#cb-create-lessons').onclick=()=>{
    const msg=modal.querySelector('#cb-message');
    if(!selected.length){msg.textContent='먼저 파일을 선택하세요.';return;}
    const empty=variant.sessions.length===1 && !variant.sessions[0].title.trim() && Object.values(variant.sessions[0].assets).every(a=>!a.url&&!a.fileId);
    if(!empty){msg.textContent='기존 차시가 있어 자동으로 만들지 않았습니다. 기존 차시를 선택해 주세요.';return;}
    const hints=selected.map(x=>hint(x.file.name)), nums=hints.map(h=>h.number).filter(Boolean);
    if(!nums.length){msg.textContent='파일 이름에서 차시 번호를 찾지 못했습니다. 직접 차시를 추가해 주세요.';return;}
    const count=Math.max(...nums);
    variant.sessions=Array.from({length:count},(_,i)=>{const h=hints.find(x=>x.number===i+1);const s=blankCourseSession();s.title=h?.title||`${i+1}차시`;return s;});
    changed();drawRows();msg.textContent=`${count}개 차시를 임시로 만들었습니다. 제목과 파일 연결을 확인한 뒤 저장해 주세요.`;
  };
  modal.querySelector('#cb-upload').onclick=async()=>{
    if(busy)return;
    const msg=modal.querySelector('#cb-message');
    if(!selected.length||selected.length>50){msg.textContent='파일을 1~50개 선택하세요.';return;}
    const targets=selected.map((x,i)=>{const raw=modal.querySelector(`[data-cb-session="${i}"]`).value;return {index:raw===''?-1:Number(raw),slot:modal.querySelector(`[data-cb-slot="${i}"]`).value};});
    if(targets.some(t=>!Number.isInteger(t.index)||t.index<0||!variant.sessions[t.index]||!Object.hasOwn(COURSE_SLOTS,t.slot))){msg.textContent='각 파일의 차시와 자료 종류를 선택해 주세요.';return;}
    if(new Set(targets.map(t=>`${t.index}:${t.slot}`)).size!==targets.length){msg.textContent='같은 차시·자료 종류에 파일이 겹칩니다. 각 파일의 배치를 확인하세요.';return;}
    if(targets.some((t,i)=>!selected[i].done && (variant.sessions[t.index].assets[t.slot]?.url || variant.sessions[t.index].assets[t.slot]?.fileId)) && !confirm('이미 연결된 자료가 있습니다. 선택한 칸의 연결을 바꿀까요? 기존 파일은 공통 자료에 남습니다.'))return;
    if(selected.some(x=>!x.file.size||x.file.size>100*1024*1024)){msg.textContent='각 파일은 0MB 초과 100MB 이하여야 합니다.';return;}
    busy=true;modal.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
    try {
      for(let i=0;i<selected.length;i++) {
        const x=selected[i],t=targets[i];if(x.done)continue;
        const status=modal.querySelector(`[data-cb-status="${i}"]`),f=x.file,mime=guessMime(f.name,f.type);status.textContent='업로드 중…';
        if(!x.sign)x.sign=await api('POST',`/api/programs/${programId}/file-sign`,{name:f.name,size:f.size});
        if(!x.uploaded){const r=await fetch(x.sign.uploadUrl,{method:'PUT',headers:{'Content-Type':mime,'x-upsert':'true'},body:f,signal:AbortSignal.timeout(120000)});if(!r.ok)throw new Error(`${f.name}: 업로드 실패`);x.uploaded=true;}
        const r=await api('POST',`/api/programs/${programId}/file-confirm`,{path:x.sign.path,name:f.name,size:f.size,mime,lesson_id:null});
        if(!files.some(v=>String(v.id)===String(r.id)))files.push({id:r.id,name:f.name,mime,size:f.size,downloadable:false});
        variant.sessions[t.index].assets[t.slot]={url:'',fileId:String(r.id)};x.done=true;changed();status.textContent='연결 완료';
      }
      msg.textContent='자료를 연결했습니다. 닫은 뒤 수업 구성을 저장하세요.';
    }catch(e){msg.textContent=e.message+' · 완료된 파일은 유지됩니다. 다시 누르면 실패한 파일부터 확인합니다.';}
    finally{busy=false;modal.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);selected.forEach((x,i)=>{if(x.done){modal.querySelector(`[data-cb-session="${i}"]`).disabled=true;modal.querySelector(`[data-cb-slot="${i}"]`).disabled=true;}});}
  };
}
