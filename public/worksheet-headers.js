'use strict';
// 활동지 인쇄 화면 (/worksheet-headers.html)
// - 교사·관리자: 학교를 고르고 차시별 인쇄용 활동지를 연다.
// - 관리자: 학교 머리글(문구·로고)을 추가·수정·삭제한다.
(function () {
  const $ = id => document.getElementById(id);
  const message = t => { $('message').textContent = t; };
  const WH = window.MoakitWorksheetHeader;
  const PICKED = 'moakit:ws:school';
  let schools = [], sheets = [], editing = null, logo = '';

  async function request(path, method = 'GET', body) {
    const r = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || '요청에 실패했습니다.'), { status: r.status });
    return data;
  }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function remembered() { try { return localStorage.getItem(PICKED) || ''; } catch { return ''; } }
  function remember(slug) { try { if (slug) localStorage.setItem(PICKED, slug); else localStorage.removeItem(PICKED); } catch { /* 저장 불가 브라우저 */ } }

  // ---------- 인쇄 ----------
  function lessonUrl(file, slug) { return '/lessons/' + file.split('/').map(encodeURIComponent).join('/') + (slug ? '?school=' + encodeURIComponent(slug) : ''); }

  function renderPrint() {
    const slug = $('print-school').value;
    remember(slug);
    const box = $('print-list');
    box.replaceChildren();
    if (!sheets.length) {
      box.innerHTML = '<p class="muted">인쇄용 활동지가 있는 수업이 아직 없습니다.</p>';
      return;
    }
    box.innerHTML = sheets.map(group => `<div class="ws-group"><h3>${esc(group.label)}</h3>` + group.items.map(item => `
      <div class="ws-row">
        <div class="ws-n">${item.n}차시</div>
        <div class="ws-name">${esc(item.title)}</div>
        <div class="actions">
          ${item.student ? `<a class="btn-link" href="${esc(lessonUrl(item.student, slug))}" target="_blank" rel="noopener" aria-label="${esc(group.label)} ${item.n}차시 ${esc(item.title)} 학생용 인쇄">학생용 인쇄</a>` : ''}
          ${item.teacher ? `<a class="btn-link soft" href="${esc(lessonUrl(item.teacher, slug))}" target="_blank" rel="noopener" aria-label="${esc(group.label)} ${item.n}차시 ${esc(item.title)} 교사용 열기">교사용 열기</a>` : ''}
        </div>
      </div>`).join('') + '</div>').join('');
  }

  function fillSchoolPicker() {
    const select = $('print-school');
    const want = remembered();
    select.innerHTML = '<option value="">학교 머리글 없음 (기본 모양)</option>' +
      schools.map(s => `<option value="${esc(s.slug)}"${s.slug === want ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
    select.onchange = renderPrint;
  }

  async function loadSheets() {
    try {
      const r = await fetch('/lessons/worksheets.json', { credentials: 'same-origin' });
      sheets = r.ok ? await r.json() : [];
    } catch { sheets = []; }
    if (!Array.isArray(sheets)) sheets = [];
  }

  // ---------- 학교 머리글 관리 (관리자) ----------
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
    const box = $('preview-header');
    box.innerHTML = WH.html({ ...d, name: d.name || '학교 이름' }, { area: $('pv-area').value, topic: $('pv-topic').value });
    box.className = 'on';
    box.setAttribute('data-ws-header', '');
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

  async function loadSchools() {
    schools = (await request('/api/worksheet-headers')).schools || [];
    fillSchoolPicker();
    renderPrint();
  }

  function bindAdmin() {
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
        await loadSchools(); renderList(); closeEdit();
        message('저장했습니다. 활동지에서 그 학교를 고르면 바로 반영됩니다.');
      } catch (err) { message(err.message); }
      finally { $('save').disabled = false; }
    };
    $('remove').onclick = async () => {
      if (!editing) return;
      const builtin = editing.builtin;
      if (!confirm(builtin ? '저장한 내용을 지우고 기본값으로 되돌릴까요?' : `${editing.name} 머리글을 삭제할까요? 이 학교 코드로 연 활동지는 기본 모습으로 인쇄됩니다.`)) return;
      $('remove').disabled = true;
      try { await request('/api/worksheet-headers/' + encodeURIComponent(editing.slug), 'DELETE'); await loadSchools(); renderList(); closeEdit(); message(builtin ? '기본값으로 되돌렸습니다.' : '삭제했습니다.'); }
      catch (err) { message(err.message); }
      finally { $('remove').disabled = false; }
    };
  }

  (async () => {
    await loadSheets();
    let me;
    try { me = await request('/api/me'); }
    catch (err) {
      // 로그인 문제일 때만 게이트를 연다.
      $('gate').hidden = false;
      message(err.status === 401 ? '로그인이 필요합니다.' : err.message);
      return;
    }
    $('print-pane').hidden = false;
    try { await loadSchools(); }
    catch (err) {
      // 학교 목록을 못 불러와도 인쇄 목록은 살린다 — 기본 모양으로는 인쇄된다.
      schools = []; fillSchoolPicker(); renderPrint();
      message('학교 머리글 목록을 불러오지 못했습니다. 기본 모양으로 인쇄됩니다.');
    }
    if (me.user.role === 'admin') { bindAdmin(); renderList(); $('list-pane').hidden = false; }
  })();
})();
