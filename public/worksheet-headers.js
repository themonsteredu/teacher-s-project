'use strict';
// 관리자용 학교별 활동지 머리글 편집 화면 (/worksheet-headers.html)
(function () {
  const $ = id => document.getElementById(id);
  const message = t => { $('message').textContent = t; };
  const WH = window.MoakitWorksheetHeader;
  let schools = [], editing = null, logo = '';

  async function request(path, method = 'GET', body) {
    const r = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || '요청에 실패했습니다.'), { status: r.status });
    return data;
  }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function renderList() {
    const box = $('list');
    box.replaceChildren();
    if (!schools.length) { box.innerHTML = '<p class="muted">등록된 학교가 없습니다. “학교 추가”로 시작하세요.</p>'; return; }
    for (const s of schools) {
      const el = document.createElement('div');
      el.className = 'school';
      el.innerHTML = `${s.logo ? `<img src="${esc(s.logo)}" alt="">` : '<div class="noimg">로고 없음</div>'}
        <div><h3>${esc(s.name)} <span class="muted" style="font-weight:400;font-size:12px">${s.builtin && !s.saved ? '기본 내장' : ''}</span></h3>
        <p>${esc(s.left || '(왼쪽 문구 없음)')} · ${esc(s.right || '(오른쪽 문구 없음)')}</p>
        <p>주소에 붙일 값: <code>?school=${esc(s.slug)}</code> <button type="button" class="soft" data-copy="${esc(s.slug)}" style="padding:4px 10px;font-size:12px">복사</button></p></div>
        <div class="actions"><button type="button" data-edit="${esc(s.slug)}">수정</button></div>`;
      box.append(el);
    }
    box.querySelectorAll('[data-edit]').forEach(b => { b.onclick = () => openEdit(schools.find(s => s.slug === b.dataset.edit)); });
    box.querySelectorAll('[data-copy]').forEach(b => { b.onclick = async () => { try { await navigator.clipboard.writeText('?school=' + b.dataset.copy); message('복사했습니다: ?school=' + b.dataset.copy); } catch { message('복사가 막혀 있어요. 직접 적어 주세요: ?school=' + b.dataset.copy); } }; });
  }

  function formData() {
    const f = new FormData($('form'));
    return { name: f.get('name'), left: f.get('left'), right: f.get('right'), title: f.get('title'), note: f.get('note'), logo };
  }
  function preview() {
    const d = formData();
    $('preview-header').innerHTML = WH.html({ ...d, name: d.name || '학교 이름' }, { area: $('pv-area').value, topic: $('pv-topic').value });
    $('preview-header').className = 'on';
    $('preview-header').setAttribute('data-ws-header', '');
    $('logo-preview').hidden = !logo;
    if (logo) $('logo-preview').src = logo;
  }

  function openEdit(s) {
    editing = s || null;
    const f = $('form');
    f.reset();
    f.slug.value = s ? s.slug : '';
    f.slug.disabled = !!s;
    f.name.value = s ? s.name : '';
    f.left.value = s ? s.left : '';
    f.right.value = s ? s.right : '';
    f.title.value = s ? s.title : '';
    f.note.value = s ? (s.note || '') : '';
    logo = s ? (s.logo || '') : '';
    $('edit-title').textContent = s ? `${s.name} 머리글 수정` : '학교 추가';
    $('remove').hidden = !s || (s.builtin && !s.saved);
    $('remove').textContent = s && s.builtin ? '기본값으로 되돌리기' : '삭제';
    $('list-pane').hidden = true; $('edit-pane').hidden = false;
    message('');
    preview();
  }
  function closeEdit() { editing = null; $('edit-pane').hidden = true; $('list-pane').hidden = false; }

  async function load() {
    schools = (await request('/api/worksheet-headers')).schools || [];
    renderList();
  }

  $('form').oninput = preview;
  $('pv-area').oninput = preview; $('pv-topic').oninput = preview;
  $('form').logofile.onchange = () => {
    const file = $('form').logofile.files[0];
    if (!file) return;
    if (file.size > 450 * 1024) { message('로고 파일이 너무 큽니다. 450KB 이하로 줄여 주세요.'); $('form').logofile.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => { logo = String(reader.result || ''); message(''); preview(); };
    reader.readAsDataURL(file);
  };
  $('logo-clear').onclick = () => { logo = ''; $('form').logofile.value = ''; preview(); };
  $('cancel').onclick = closeEdit;
  $('new').onclick = () => openEdit(null);
  $('form').onsubmit = async e => {
    e.preventDefault();
    const slug = editing ? editing.slug : $('form').slug.value.trim();
    $('save').disabled = true; message('저장 중…');
    try {
      await request('/api/worksheet-headers/' + encodeURIComponent(slug), 'PUT', formData());
      await load(); closeEdit(); message('저장했습니다. 활동지에서 학교를 고르면 바로 반영됩니다.');
    } catch (err) { message(err.message); }
    finally { $('save').disabled = false; }
  };
  $('remove').onclick = async () => {
    if (!editing) return;
    const builtin = editing.builtin;
    if (!confirm(builtin ? '저장한 내용을 지우고 기본값으로 되돌릴까요?' : `${editing.name} 머리글을 삭제할까요? 이 학교 코드로 연 활동지는 기본 모습으로 인쇄됩니다.`)) return;
    $('remove').disabled = true;
    try { await request('/api/worksheet-headers/' + encodeURIComponent(editing.slug), 'DELETE'); await load(); closeEdit(); message(builtin ? '기본값으로 되돌렸습니다.' : '삭제했습니다.'); }
    catch (err) { message(err.message); }
    finally { $('remove').disabled = false; }
  };

  (async () => {
    try {
      const me = await request('/api/me');
      if (me.user.role !== 'admin') { $('gate').hidden = false; message('관리자만 활동지 머리글을 바꿀 수 있습니다.'); return; }
      await load();
      $('list-pane').hidden = false;
    } catch (err) {
      $('gate').hidden = false;
      message(err.status === 401 ? '로그인이 필요합니다.' : err.message);
    }
  })();
})();
