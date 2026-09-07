'use strict';
function openCourseFileBatch({programId, variant, files, changed, redraw}) {
  let selected=[],busy=false;
  const modal=openModal('<h3>자료 여러 개 등록</h3><p>파일을 고른 뒤 차시와 자료 종류를 지정하세요. 지정한 칸의 기존 연결만 교체됩니다.</p><input type="file" id="cb-files" multiple accept=".pdf,.ppt,.pptx,.doc,.docx,.hwp,.hwpx,.html,.htm,.zip,.png,.jpg,.jpeg,.webp"><div id="cb-rows"></div><div class="m-actions"><button class="btn btn-ghost" id="cb-close">닫기</button><button class="btn btn-primary" id="cb-upload">선택한 자료 업로드</button></div><p id="cb-message" role="status"></p>');
  modal.querySelector('#cb-close').onclick=()=>{if(!busy){modal.remove();redraw();}};
  modal.querySelector('#cb-files').onchange=e=>{
    selected=Array.from(e.target.files).map(file=>({file,done:false}));
    modal.querySelector('#cb-rows').innerHTML=selected.map((x,i)=>`<div class="ce-bulk-row"><strong>${esc(x.file.name)}</strong><label>차시<select data-cb-session="${i}">${variant.sessions.map((s,j)=>`<option value="${j}">${j+1}차시 · ${esc(s.title)}</option>`).join('')}</select></label><label>자료 종류<select data-cb-slot="${i}">${Object.entries(COURSE_SLOTS).map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</select></label><span data-cb-status="${i}" role="status">대기</span></div>`).join('');
  };
  modal.querySelector('#cb-upload').onclick=async()=>{
    if(busy)return;
    const msg=modal.querySelector('#cb-message');
    if(!selected.length||selected.length>50){msg.textContent='파일을 1~50개 선택하세요.';return;}
    const targets=selected.map((x,i)=>({index:Number(modal.querySelector(`[data-cb-session="${i}"]`).value),slot:modal.querySelector(`[data-cb-slot="${i}"]`).value}));
    if(new Set(targets.map(t=>`${t.index}:${t.slot}`)).size!==targets.length){msg.textContent='같은 차시·자료 종류에 파일이 겹칩니다. 각 파일의 배치를 확인하세요.';return;}
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
