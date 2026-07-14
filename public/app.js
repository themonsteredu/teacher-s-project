'use strict';

/* =====================================================
 * 수업프로그램 허브 — SPA
 * 학교 선생님용 수업프로그램 모음: 링크 · 첨부자료 · 웹앱 · 영상
 * ===================================================== */

const $app = document.getElementById('app');

const state = {
  me: null,       // 로그인 사용자
  settings: null, // 사이트 설정 (site_open / site_notice)
  search: '',     // 카탈로그 검색어
};

const ROLE_LABELS = { admin: '관리자', teacher: '교사' };
// 학년 목록 — 중·고 확장 시 여기에 '중1', '고1' 등을 추가하면 탭·선택지에 자동 반영됨
const GRADES = ['초1', '초2', '초3', '초4', '초5', '초6'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function isAdmin() { return state.me && state.me.role === 'admin'; }

/* ---------------- 아이콘 (Feather 스타일 인라인 SVG) ---------------- */
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  play: '<polygon points="5 3 19 12 5 21 5 3"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  edit: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  up: '<polyline points="18 15 12 9 6 15"/>',
  down: '<polyline points="6 9 12 15 18 9"/>',
};
function icon(name) {
  return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* ---------------- API ---------------- */
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.endsWith('/api/login')) {
    state.me = null;
    // 학생 보드는 로그인 없이 쓰므로, 보드 화면에서는 로그인으로 보내지 않는다
    if (!(location.hash || '').startsWith('#/board/')) location.hash = '#/login';
    throw new Error(data.error || '로그인이 필요합니다.');
  }
  // 사이트 킬스위치: 폐쇄 중이면 폐쇄 안내 화면 (학생 보드 접근 포함)
  if (res.status === 403 && data.error === 'site_closed') {
    renderClosed(data.notice);
    const err = new Error('사이트가 일시 중단되었습니다.');
    err.handled = true; // 라우트 catch에서 재렌더 방지
    throw err;
  }
  if (!res.ok) {
    const err = new Error(data.error || '요청에 실패했습니다.');
    err.data = data;
    throw err;
  }
  return data;
}

/* ---------------- 파일 mime 보정 (브라우저가 빈/틀린 타입을 주는 경우 대비) ---------------- */
const MIME_BY_EXT = {
  html: 'text/html', htm: 'text/html', pdf: 'application/pdf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
};
function guessMime(name, browserType) {
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  return MIME_BY_EXT[ext] || browserType || 'application/octet-stream';
}

/* ---------------- 토스트 / 모달 ---------------- */
function toast(message, warn = false) {
  let zone = document.getElementById('toast-zone');
  if (!zone) {
    zone = document.createElement('div');
    zone.id = 'toast-zone';
    document.body.appendChild(zone);
  }
  const el = document.createElement('div');
  el.className = `toast ${warn ? 'warn' : ''}`;
  el.textContent = message;
  zone.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function openModal(html) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal">${html}</div>`;
  back.addEventListener('mousedown', (e) => { if (e.target === back) back.remove(); });
  document.body.appendChild(back);
  return back;
}

// 작품 미리보기 확대 (패들렛식 그리드의 이미지 클릭)
function openImageLightbox(src) {
  const box = document.createElement('div');
  box.className = 'img-lightbox';
  box.innerHTML = `<button class="il-close" aria-label="닫기">✕</button><img src="${esc(src)}" alt="작품">`;
  box.addEventListener('click', () => box.remove());
  document.body.appendChild(box);
}
// 보드 그리드가 다시 그려져도 동작하도록 위임 처리 (한 번만 등록)
document.addEventListener('click', (e) => {
  const img = e.target.closest && e.target.closest('.pc-img');
  if (img && img.src) openImageLightbox(img.src);
});

/* ---------------- 본문 렌더링 (마크다운 최소 문법 + 영상 임베드) ---------------- */
function videoEmbed(url) {
  const yt = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,20})/.exec(url);
  if (yt) {
    return `<div class="video-box"><iframe src="https://www.youtube.com/embed/${esc(yt[1])}?rel=0&modestbranding=1"
      title="영상" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="no-referrer"></iframe></div>`;
  }
  if (/^https:\/\/[^\s<>"']+\.(mp4|webm|m4v)(\?[^\s<>"']*)?$/i.test(url)) {
    return `<div class="video-box"><video controls src="${esc(url)}"></video></div>`;
  }
  return `<p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a></p>`;
}

function renderBodyMd(text) {
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
  let html = '';
  let listOpen = false;
  const closeList = () => { if (listOpen) { html += '</ul>'; listOpen = false; } };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) { closeList(); html += `<h2>${inline(line.slice(3))}</h2>`; continue; }
    if (line.startsWith('- ')) { if (!listOpen) { html += '<ul>'; listOpen = true; } html += `<li>${inline(line.slice(2))}</li>`; continue; }
    if (line === '') { closeList(); continue; }
    closeList(); html += `<p>${inline(line)}</p>`;
  }
  closeList();
  return html;
}

/* ---------------- 라우터 ---------------- */
const routes = [];
function route(pattern, fn) { routes.push({ pattern, fn }); }

async function navigate() {
  const hash = location.hash || '#/';
  // 학생 활동 보드(#/board/코드)는 로그인 없이 접근 가능
  if (!state.me && hash !== '#/login' && !hash.startsWith('#/board/')) { location.hash = '#/login'; return; }
  if (state.me && state.me.mustChangePassword && hash !== '#/password' && hash !== '#/login') {
    location.hash = '#/password';
    return;
  }
  for (const r of routes) {
    const m = r.pattern.exec(hash);
    if (m) {
      try { await r.fn(...m.slice(1).map((v) => (v === undefined ? v : decodeURIComponent(v)))); }
      catch (e) { console.error(e); }
      return;
    }
  }
  location.hash = state.me ? '#/' : '#/login';
}
window.addEventListener('hashchange', navigate);

/* ---------------- 셸 (상단 메뉴바) ---------------- */
function menuItems() {
  const items = [['#/', 'grid', '프로그램'], ['#/myclass', 'monitor', '내 수업']];
  if (isAdmin()) {
    items.push(
      ['#/manage', 'layers', '프로그램 관리'],
      ['#/users', 'users', '교사 계정'],
      ['#/site', 'power', '사이트 설정'],
      ['#/logs', 'fileText', '이용 기록'],
    );
  }
  items.push(['#/settings', 'sliders', '내 설정']);
  return items;
}

function shell(title, contentHtml) {
  const u = state.me;
  const hash = (location.hash || '#/').split('/').slice(0, 2).join('/');
  document.title = `${title} — 수업프로그램 허브`;
  $app.innerHTML = `
    <div class="site">
      <header class="topbar" id="topbar">
        <a class="tb-brand" href="#/">
          <span class="tb-mark">수업</span>
          <span class="tb-name">수업프로그램 허브</span>
        </a>
        <button class="tb-burger" id="btn-hamburger" aria-label="메뉴">${icon('menu')}</button>
        <nav class="tb-nav" id="tb-nav">
          ${menuItems().map(([href, ic, text]) =>
            `<a href="${href}" class="${hash === href || (href === '#/' && (location.hash || '#/') === '#/') ? 'active' : ''}">${icon(ic)}${text}</a>`).join('')}
        </nav>
        <div class="tb-spacer"></div>
        <div class="search-box">
          ${icon('search')}
          <input id="global-search" placeholder="프로그램 검색" autocomplete="off" value="${esc(state.search)}">
        </div>
        <div class="tb-user">
          <span class="tb-avatar">${esc(u.name.slice(0, 1))}</span>
          <span class="tb-who">${esc(u.name)}<br><b>${esc(u.roleLabel)}</b></span>
          <button class="icon-btn" id="btn-logout" title="로그아웃">${icon('logout')}</button>
        </div>
      </header>
      <main class="page"><div class="page-inner">${contentHtml}</div></main>
      <footer class="site-foot">궁금한 점은 관리자 선생님에게 문의하세요 🌱</footer>
    </div>`;

  document.getElementById('btn-logout').onclick = async () => {
    await api('POST', '/api/logout').catch(() => {});
    state.me = null;
    location.hash = '#/login';
  };
  document.getElementById('btn-hamburger').onclick = () =>
    document.getElementById('topbar').classList.toggle('nav-open');
  document.getElementById('global-search').onkeydown = (e) => {
    if (e.key === 'Enter') {
      state.search = e.target.value.trim();
      if ((location.hash || '#/') === '#/') navigate(); else location.hash = '#/';
    }
  };
}

/* ---------------- 로그인 ---------------- */
route(/^#\/login$/, () => {
  let tab = 'join'; // 'join'(학생 참여 코드) | 'account'(교사 로그인)
  const render = (errMsg = '') => {
    $app.innerHTML = `
      <div class="login-wrap">
        <form class="login-card" id="login-form">
          <div class="lmark">수업</div>
          <div class="logo">수업프로그램 허브</div>
          <div class="sub">선생님용 수업자료 · 학생 활동 보드</div>
          <div class="tabs" style="margin-bottom:4px">
            <button type="button" data-ltab="join" class="${tab === 'join' ? 'active' : ''}">학생 참여</button>
            <button type="button" data-ltab="account" class="${tab === 'account' ? 'active' : ''}">교사 로그인</button>
          </div>
          ${tab === 'join' ? `
            <label>참여 코드</label>
            <input class="input" name="code" maxlength="10" placeholder="예: BS2622" required autocomplete="off"
              style="font-size:22px;letter-spacing:6px;text-align:center;font-weight:800;text-transform:uppercase">
            <div class="small muted" style="margin-top:10px;line-height:1.6">선생님이 화면에 보여주는 코드를 입력하면<br>활동 결과물을 올릴 수 있어요. 계정은 필요 없습니다.</div>
          ` : `
            <label>아이디</label>
            <input class="input" name="username" autocomplete="username" required>
            <label>비밀번호</label>
            <input class="input" name="password" type="password" autocomplete="current-password" required>
          `}
          <button class="btn btn-primary" type="submit">${tab === 'join' ? '보드 입장하기' : '로그인'}</button>
          <div class="login-error">${esc(errMsg)}</div>
        </form>
      </div>`;
    document.querySelectorAll('[data-ltab]').forEach((b) => {
      b.onclick = () => { tab = b.dataset.ltab; render(); };
    });
    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (tab === 'join') {
        const code = String(f.get('code') || '').trim().toLowerCase();
        if (!/^[a-z0-9]{4,10}$/.test(code)) return render('참여 코드는 영문·숫자 4~10자입니다.');
        location.hash = `#/board/${code}`;
        return;
      }
      try {
        const data = await api('POST', '/api/login', { username: f.get('username'), password: f.get('password') });
        state.me = data.user;
        state.settings = data.settings;
        location.hash = data.user.mustChangePassword ? '#/password' : '#/';
      } catch (err) { render(err.message); }
    };
  };
  render();
});

/* ---------------- 사이트 폐쇄 화면 ---------------- */
function renderClosed(notice) {
  const inner = `
    <div class="blocked-wrap">
      <div class="blocked-hero">${icon('lock')}</div>
      <h2>사이트 이용이 일시 중단되었습니다</h2>
      <p>${esc(notice || '관리자가 사이트를 잠시 닫아 두었습니다. 안내가 있을 때까지 기다려 주세요.')}</p>
      <p class="mt small muted">이 화면은 30초마다 자동으로 다시 확인합니다.</p>
    </div>`;
  // 로그인 없는 학생(보드 접근)도 이 화면을 볼 수 있음 — 셸 없이 렌더
  if (state.me) shell('안내', inner);
  else $app.innerHTML = `<div class="login-wrap"><div style="max-width:520px;width:100%">${inner}</div></div>`;
  setTimeout(() => navigate(), 30000);
}

/* ---------------- 카탈로그 (#/) ---------------- */
const CARD_DECO = ['📚', '🧭', '🎨', '🔬'];
let catalogTab = 'all';

route(/^#\/$/, async () => {
  const data = await api('GET', '/api/programs');
  const all = data.programs;
  // 학년 탭 (등록된 학년만 표시, GRADES 순서대로)
  const grades = [...new Set(all.map((p) => p.grade || ''))].filter(Boolean)
    .sort((a, b) => GRADES.indexOf(a) - GRADES.indexOf(b));
  const hasEtc = all.some((p) => !p.grade);
  const tabs = [['all', `전체 (${all.length})`],
    ...grades.map((g) => [g, `${g} (${all.filter((p) => p.grade === g).length})`]),
    ...(hasEtc && grades.length ? [['', `학년 미지정 (${all.filter((p) => !p.grade).length})`]] : [])];
  if (catalogTab !== 'all' && !tabs.some(([k]) => k === catalogTab)) catalogTab = 'all';
  const kw = state.search.toLowerCase();
  const list = all.filter((p) =>
    (catalogTab === 'all' || (p.grade || '') === catalogTab)
    && (!kw || p.title.toLowerCase().includes(kw) || String(p.description).toLowerCase().includes(kw)));

  const metaText = (p) => {
    const parts = [];
    if (p.grade) parts.push(`🎓 ${p.grade}`);
    if (p.category) parts.push(`📁 ${p.category}`);
    if (p.linkCount) parts.push(`🔗 링크 ${p.linkCount}`);
    if (p.aiappCount) parts.push(`🖥️ 웹앱 ${p.aiappCount}`);
    if (p.videoCount) parts.push(`▶ 영상 ${p.videoCount}`);
    if (p.fileCount) parts.push(`📎 자료 ${p.fileCount}`);
    return parts.join(' · ') || '준비 중';
  };
  const card = (p, i) => `
    <div class="deck-card">
      <div class="deck-thumb dg-${i % 4}"><div class="deco">${CARD_DECO[i % 4]}</div><div class="orb"></div><div class="dt">${esc(p.title)}</div></div>
      <div class="body">
        <div class="desc">${esc(String(p.description).split('\n')[0].replace(/^#+\s*/, '')) || '설명 없음'}</div>
        <div class="meta">
          <span class="small muted">${metaText(p)}</span>
          <span style="display:flex;gap:6px;align-items:center">
            ${isAdmin() && !p.published ? '<span class="badge gray">비공개</span>' : ''}
            <a href="#/program/${p.id}" class="btn btn-primary btn-sm" style="white-space:nowrap">${icon('play')} 열기</a>
          </span>
        </div>
      </div>
    </div>`;

  shell('프로그램', `
    <div class="page-head">
      <div><div class="ph-t">수업프로그램</div><div class="desc">수업에 바로 쓸 수 있는 프로그램 모음입니다.${state.search ? ` — 검색: "${esc(state.search)}"` : ''}</div></div>
      ${state.search ? '<button class="btn btn-ghost btn-sm" id="clear-search">검색 지우기</button>' : ''}
      ${isAdmin() ? `<a class="btn btn-primary" href="#/manage">${icon('edit')} 프로그램 관리</a>` : ''}
    </div>
    ${tabs.length > 1 ? `<div class="tabs">${tabs.map(([k, label]) => `<button data-ctab="${esc(k)}" class="${catalogTab === k ? 'active' : ''}">${esc(label)}</button>`).join('')}</div>` : ''}
    <div class="deck-cards">
      ${list.map(card).join('') || `<p class="empty-note">${state.search ? '검색 결과가 없습니다.' : '아직 공개된 프로그램이 없습니다.'}</p>`}
    </div>`);
  document.querySelectorAll('[data-ctab]').forEach((b) => {
    b.onclick = () => { catalogTab = b.dataset.ctab; navigate(); };
  });
  const clearBtn = document.getElementById('clear-search');
  if (clearBtn) clearBtn.onclick = () => { state.search = ''; navigate(); };
});

/* ---------------- 프로그램 상세 (#/program/:id) ---------------- */
const KIND_META = {
  link: ['link', '수업 링크', '새 탭에서 열립니다'],
  aiapp: ['monitor', '웹앱', '새 탭에서 실행됩니다'],
  video: ['play', '영상', '아래에서 바로 재생됩니다'],
};

const detailLessonSel = {}; // 프로그램별 선택된 차시 탭 기억
// 차시 표시 이름: 제목에 이미 "차시"가 들어 있으면 그대로, 아니면 "n차시 · 제목"
const lessonLabel = (l, i) => /차시/.test(l.title) ? esc(l.title) : `${i + 1}차시 · ${esc(l.title)}`;

route(/^#\/program\/(\d+)$/, async (id) => {
  let data;
  try { data = await api('GET', `/api/programs/${id}`); }
  catch (e) { if (state.me) { toast(e.message, true); location.hash = '#/'; } return; }
  const p = data.program;
  const lessons = data.lessons || [];
  // 차시 탭: 'all'(전체) | 0(공통) | 차시 id
  let sel = detailLessonSel[p.id] ?? 'all';
  if (sel !== 'all' && sel !== 0 && !lessons.some((l) => l.id === sel)) sel = 'all';
  const inTab = (x) => sel === 'all' || (sel === 0 ? !x.lesson_id : x.lesson_id === sel);
  const links = data.links.filter((l) => l.kind !== 'video' && inTab(l));
  const videos = data.links.filter((l) => l.kind === 'video' && inTab(l));
  // HTML 파일 = 실행형 웹앱 (수업용 PPT를 HTML로 만든 경우 등) — 링크·웹앱 카드에 실행 버튼으로 표시
  const isHtmlFile = (f) => /\.(html?|htm)$/i.test(f.name) || f.mime === 'text/html';
  const htmlApps = data.files.filter((f) => isHtmlFile(f) && inTab(f));
  const docFiles = data.files.filter((f) => !isHtmlFile(f) && inTab(f));
  const htmlAppRow = (f) => `
    <button class="btn btn-primary" data-slide="${f.id}" data-slidename="${esc(f.name.replace(/\.(html?|htm)$/i, ''))}" style="justify-content:flex-start;gap:8px;padding-right:14px;width:100%;text-align:left">
      ${icon('play')} <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name.replace(/\.(html?|htm)$/i, ''))}</span>
      <span class="small" style="margin-left:auto;white-space:nowrap;flex-shrink:0;opacity:.85">수업 실행 ⛶</span>
    </button>`;

  const linkRow = (l) => {
    const [ic, label] = KIND_META[l.kind] || KIND_META.link;
    return `
      <a class="btn ${l.kind === 'aiapp' ? 'btn-primary' : 'btn-soft'}" style="justify-content:flex-start;gap:8px;padding-right:14px" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">
        ${icon(ic)} <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.label || l.url)}</span> <span class="small ${l.kind === 'aiapp' ? '' : 'muted'}" style="margin-left:auto;white-space:nowrap;flex-shrink:0;opacity:.75">${label} ↗</span>
      </a>`;
  };
  const fileRow = (f) => {
    const viewable = f.mime === 'application/pdf' || /^image\//.test(f.mime || '');
    const canDl = f.downloadable || isAdmin();
    return `
    <div class="deck-line">
      <div class="dl-left">
        <span class="dl-ico">📎</span>
        <div class="dl-body">
          <div class="dl-title">${esc(f.name)} ${f.downloadable ? '' : '<span class="badge amber plain">보기 전용</span>'}</div>
          <div class="dl-meta small muted">${(f.size / 1024 / 1024).toFixed(1)}MB · ${esc(f.created_at)}</div>
        </div>
      </div>
      <div class="dl-actions">
        ${viewable ? `<button class="btn btn-soft btn-sm" data-view="${f.id}">${icon('eye')} 열람</button>` : ''}
        ${canDl
          ? `<a class="btn btn-primary btn-sm" href="/api/files/${f.id}/download" target="_blank" rel="noopener">${icon('download')} 다운로드</a>`
          : (!viewable ? '<span class="small muted">화면 열람용 PDF 변환 필요</span>' : '')}
      </div>
    </div>`;
  };
  const boardRow = (b) => `
    <div class="deck-line">
      <div class="dl-left">
        <span class="dl-ico">${b.is_open ? '🟢' : '⚪'}</span>
        <div class="dl-body">
          <div class="dl-title">${esc(b.title)}</div>
          <div class="dl-meta small muted">참여 코드 <b>${esc(String(b.code).toUpperCase())}</b> · 게시물 ${b.post_count}개 · ${b.is_open ? '진행 중' : '마감됨'}</div>
        </div>
      </div>
      <div class="dl-actions"><a class="btn btn-soft btn-sm" href="#/boardview/${b.id}">열기</a></div>
    </div>`;

  // 왼쪽(소개·영상) / 오른쪽(링크·자료·보드) 분리 — 왼쪽이 비면 한 단 전체폭으로
  const leftHtml = `
    ${p.description && (sel === 'all' || sel === 0) ? `<div class="card"><h2>소개</h2><div class="doc-body" style="line-height:1.9">${renderBodyMd(p.description)}</div></div>` : ''}
    ${videos.length ? `<div class="card"><h2>영상</h2>${videos.map((v) => `
      ${v.label ? `<div class="field-label" style="margin:8px 0 6px">${esc(v.label)}</div>` : ''}
      ${videoEmbed(v.url)}`).join('')}</div>` : ''}`;
  const rightHtml = `
    ${(links.length || htmlApps.length) ? `<div class="card"><h2>수업 링크 · 웹앱</h2>
      <div style="display:flex;flex-direction:column;gap:8px">${htmlApps.map(htmlAppRow).join('')}${links.map(linkRow).join('')}</div></div>` : ''}
    ${docFiles.length ? `<div class="card"><h2>첨부자료</h2>${docFiles.map(fileRow).join('')}</div>` : ''}
    <div class="card">
      <h2>학생 활동 보드 <span class="sub">${isAdmin() ? '전체 반 보드' : '내가 만든 우리 반 보드'} — 학생들이 코드로 들어와 결과물을 올립니다</span></h2>
      <div class="deck-list">${(data.boards || []).map(boardRow).join('') || '<p class="empty-note">아직 보드가 없습니다. 수업을 시작할 때 만들어 보세요.</p>'}</div>
      <div class="mt"><button class="btn btn-soft btn-sm" id="new-board">${icon('plus')} 새 보드 만들기</button></div>
    </div>`;
  const hasLeft = (p.description && (sel === 'all' || sel === 0)) || videos.length;

  shell(p.title, `
    <div class="page-head">
      <div>
        <div class="ph-t">${esc(p.title)} ${p.published ? '' : '<span class="badge gray">비공개</span>'}</div>
        <div class="desc">${p.grade ? `🎓 ${esc(p.grade)} · ` : ''}${p.category ? `📁 ${esc(p.category)} · ` : ''}${lessons.length ? `${lessons.length}차시 · ` : ''}업데이트 ${esc(p.updated_at)}</div>
      </div>
      <div style="display:flex;gap:8px">
        ${isAdmin() ? `
          <button class="btn btn-ghost btn-sm" id="pub-toggle">${p.published ? `${icon('eyeOff')} 비공개로 전환` : `${icon('eye')} 공개하기`}</button>
          <a class="btn btn-ghost btn-sm" href="#/manage/${p.id}">${icon('edit')} 편집</a>` : ''}
        <a class="btn btn-ghost btn-sm" href="#/">← 목록</a>
      </div>
    </div>
    ${lessons.length ? `<div class="tabs">
      <button data-lesson-tab="all" class="${sel === 'all' ? 'active' : ''}">전체</button>
      <button data-lesson-tab="0" class="${sel === 0 ? 'active' : ''}">공통 자료</button>
      ${lessons.map((l, i) => `<button data-lesson-tab="${l.id}" class="${sel === l.id ? 'active' : ''}">${lessonLabel(l, i)}</button>`).join('')}
    </div>` : ''}
    ${hasLeft
      ? `<div class="grid main-cols"><div class="col-stack">${leftHtml}</div><div class="col-stack">${rightHtml}</div></div>`
      : `<div class="col-stack" style="max-width:760px">${rightHtml}</div>`}`);

  document.querySelectorAll('[data-view]').forEach((b) => {
    b.onclick = () => openFileViewer(Number(b.dataset.view));
  });
  document.querySelectorAll('[data-slide]').forEach((b) => {
    b.onclick = () => openSlidePresent(Number(b.dataset.slide), b.dataset.slidename);
  });
  document.getElementById('new-board').onclick = () => {
    const back = openModal(`
      <h3>새 활동 보드</h3>
      <div class="m-sub">학년·반마다 하나씩 만들어 쓰면 좋아요. 참여 코드는 학생이 입력하는 값입니다.</div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr">
        <div style="grid-column:1/-1"><label>보드 이름 (반·주제)</label><input id="nb-title" placeholder="예: 2학년 2반 · 분수의 덧셈"></div>
        <div><label>수업 날짜</label><input id="nb-date" type="date"><div class="small muted" style="margin-top:5px">날짜별로 정리돼요. 비워도 됩니다.</div></div>
        <div><label>참여 코드 (영문·숫자 4~10자)</label>
          <input id="nb-code" maxlength="10" placeholder="예: bs2622" autocomplete="off" style="text-transform:uppercase;letter-spacing:2px;font-weight:700">
          <div class="small muted" style="margin-top:5px;line-height:1.6">비워두면 자동 생성 · 예: <code>bs2622</code></div></div>
        <div style="grid-column:1/-1"><label>학생 명단 (선택 — 한 줄에 한 명)</label>
          <textarea id="nb-roster" rows="3" placeholder="김민준&#10;이서연&#10;박도윤" style="resize:vertical"></textarea>
          <div class="small muted" style="margin-top:5px;line-height:1.6">명단을 넣으면 누가 냈고 안 냈는지 자동으로 대조해 줍니다. (아이디·비번 없이 이름만)</div></div>
      </div>
      <div class="m-actions">
        <button class="btn btn-ghost" id="nb-cancel">취소</button>
        <button class="btn btn-primary" id="nb-save">보드 만들기</button>
      </div>
      <div class="msg" id="nb-msg"></div>`);
    back.querySelector('#nb-cancel').onclick = () => back.remove();
    back.querySelector('#nb-save').onclick = async () => {
      const title = back.querySelector('#nb-title').value.trim();
      const code = back.querySelector('#nb-code').value.trim().toLowerCase();
      const class_date = back.querySelector('#nb-date').value || undefined;
      const roster = back.querySelector('#nb-roster').value;
      const msg = back.querySelector('#nb-msg');
      if (!title) { msg.textContent = '보드 이름을 입력하세요.'; msg.className = 'msg err'; return; }
      if (code && !/^[a-z0-9]{4,10}$/.test(code)) { msg.textContent = '참여 코드는 영문·숫자 4~10자여야 합니다.'; msg.className = 'msg err'; return; }
      try {
        const r = await api('POST', `/api/programs/${p.id}/boards`, { title, code: code || undefined, class_date, roster });
        back.remove();
        toast(`보드가 열렸습니다. 참여 코드: ${r.code.toUpperCase()}`);
        location.hash = `#/boardview/${r.id}`;
      } catch (err) { if (!err.handled) { msg.textContent = err.message; msg.className = 'msg err'; } }
    };
  };

  document.querySelectorAll('[data-lesson-tab]').forEach((b) => {
    b.onclick = () => {
      const v = b.dataset.lessonTab;
      detailLessonSel[p.id] = v === 'all' ? 'all' : Number(v);
      navigate();
    };
  });
  const pubBtn = document.getElementById('pub-toggle');
  if (pubBtn) pubBtn.onclick = async () => {
    await api('PATCH', `/api/programs/${p.id}`, { published: !p.published });
    toast(p.published ? '비공개로 전환되었습니다. 교사에게 즉시 숨겨집니다.' : '공개되었습니다.');
    navigate();
  };
});

/* ---------------- 보기 전용 파일 뷰어 (워터마크 + 우클릭 차단) ---------------- */
async function openFileViewer(fileId) {
  let v;
  try { v = await api('GET', `/api/files/${fileId}/view`); }
  catch (e) { if (!e.handled) toast(e.message, true); return; }
  const isImg = /^image\//.test(v.mime || '');
  const wm = `${state.me.name} (${state.me.username}) · ${new Date().toLocaleString('ko-KR')}`;
  const overlay = document.createElement('div');
  overlay.className = 'file-viewer';
  overlay.innerHTML = `
    <div class="fv-bar">
      <span class="fv-name">📎 ${esc(v.name)} <span class="badge amber plain">보기 전용</span></span>
      <button class="fv-close" type="button">✕ 닫기</button>
    </div>
    <div class="fv-body">
      ${isImg
        ? `<img src="${esc(v.url)}" alt="${esc(v.name)}" draggable="false">`
        : `<iframe src="${esc(v.url)}#toolbar=0&navpanes=0" title="${esc(v.name)}"></iframe>`}
      <div class="fv-wm" aria-hidden="true">${Array.from({ length: 12 }, () => `<span>${esc(wm)}</span>`).join('')}</div>
    </div>`;
  overlay.addEventListener('contextmenu', (e) => e.preventDefault());
  overlay.addEventListener('dragstart', (e) => e.preventDefault());
  overlay.querySelector('.fv-close').onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

/* ---------------- 수업 슬라이드 전체화면 발표 (HTML 웹앱) ---------------- */
function openSlidePresent(fileId, name) {
  const overlay = document.createElement('div');
  overlay.className = 'slide-present';
  overlay.innerHTML = `
    <iframe src="/api/files/${fileId}/open" title="${esc(name || '수업 슬라이드')}" allow="fullscreen; autoplay"></iframe>
    <div class="sp-ctrl">
      <button class="sp-btn" data-sp-full title="모니터 전체화면 (F11 대신)">⛶ 전체화면</button>
      <a class="sp-btn" href="/api/files/${fileId}/open" target="_blank" rel="noopener" title="새 탭에서 열기">↗ 새 탭</a>
      <button class="sp-btn" data-sp-close title="닫기 (Esc)">✕</button>
    </div>`;
  overlay.querySelector('[data-sp-full]').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else overlay.requestFullscreen?.().catch(() => {});
  };
  const close = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && !document.fullscreenElement) close(); };
  overlay.querySelector('[data-sp-close]').onclick = close;
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
}

/* ---------------- 학생 활동 보드 (#/board/:code — 로그인 불필요) ---------------- */
function postCardHtml(p, { forTeacher = false, manageable = false } = {}) {
  const fileChip = p.file_name && !p.previewUrl
    ? `<div class="pc-file">📄 ${esc(p.file_name)}</div>` : '';
  return `
    <div class="post-card ${p.hidden ? 'is-hidden' : ''}">
      <div class="pc-head"><span class="pc-name">${esc(p.student_name)}</span><span class="pc-time">${esc(String(p.created_at).slice(5, 16))}</span></div>
      ${p.previewUrl ? `<img class="pc-img" src="${esc(p.previewUrl)}" alt="" loading="lazy">` : ''}
      ${p.content ? `<div class="pc-body">${esc(p.content)}</div>` : ''}
      ${fileChip}
      ${forTeacher ? `
        <div class="pc-actions">
          ${p.hidden ? '<span class="badge red plain">숨김</span>' : ''}
          ${p.file_name ? `<a class="btn btn-primary btn-sm" href="/api/posts/${p.id}/download" target="_blank" rel="noopener">${icon('download')} 받기</a>` : ''}
          ${manageable ? `
            <button class="btn btn-ghost btn-sm" data-phide="${p.id}" data-val="${p.hidden ? 0 : 1}">${p.hidden ? '보이기' : '숨김'}</button>
            <button class="btn btn-danger btn-sm" data-pdel="${p.id}">${icon('trash')}</button>` : ''}
        </div>` : ''}
    </div>`;
}

// 학생 화면: 오늘의 수업자료 렌더 (교사가 공유한 링크·웹앱·영상·파일)
function studentMaterialsHtml(materials, code) {
  const links = (materials && materials.links) || [];
  const files = (materials && materials.files) || [];
  if (!links.length && !files.length) return '';
  const linkItem = (l) => {
    if (l.kind === 'video') {
      return `<div class="mat-video">${videoEmbed(l.url)}<div class="mat-cap">${esc(l.label || '영상')}</div></div>`;
    }
    const tag = l.kind === 'aiapp' ? '🖥 웹앱' : '🔗 링크';
    const label = l.label || (l.kind === 'aiapp' ? '웹앱 열기' : '링크 열기');
    return `<a class="mat-link" href="${esc(l.url)}" target="_blank" rel="noopener">${tag} <b>${esc(label)}</b><span class="mat-go">열기 →</span></a>`;
  };
  const fileItem = (f) => {
    const isHtml = /\.html?$/i.test(f.name) || f.mime === 'text/html';
    if (isHtml) {
      return `<a class="mat-link" href="/api/join-board/${code}/file/${f.id}/open" target="_blank" rel="noopener">🖥 <b>${esc(f.name)}</b><span class="mat-go">실행 →</span></a>`;
    }
    return `<button class="mat-link" data-matfile="${f.id}">📎 <b>${esc(f.name)}</b><span class="mat-go">열람 →</span></button>`;
  };
  return `
    <div class="card mat-card">
      <div class="mat-h">📚 오늘의 수업자료</div>
      <div class="mat-list">${links.map(linkItem).join('')}${files.map(fileItem).join('')}</div>
    </div>`;
}

// 학생: 공유된 파일 열람 (보기 전용 오버레이)
async function openStudentFile(code, fileId) {
  let v;
  try { v = await api('GET', `/api/join-board/${code}/file/${fileId}/view`); }
  catch (e) { if (!e.handled) toast(e.message, true); return; }
  const isImg = /^image\//.test(v.mime || '');
  const overlay = document.createElement('div');
  overlay.className = 'file-viewer';
  overlay.innerHTML = `
    <div class="fv-bar">
      <span class="fv-name">📎 ${esc(v.name)}</span>
      <button class="fv-close" type="button">✕ 닫기</button>
    </div>
    <div class="fv-body">
      ${isImg
        ? `<img src="${esc(v.url)}" alt="${esc(v.name)}" draggable="false">`
        : `<iframe src="${esc(v.url)}#toolbar=0&navpanes=0" title="${esc(v.name)}"></iframe>`}
    </div>`;
  overlay.addEventListener('contextmenu', (e) => e.preventDefault());
  overlay.querySelector('.fv-close').onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

route(/^#\/board\/([A-Za-z0-9]{4,10})$/, async (code) => {
  code = String(code).toLowerCase();
  let data;
  try { data = await api('GET', `/api/join-board/${code}`); }
  catch (e) {
    if (e.handled) return; // site_closed → 폐쇄 화면이 이미 렌더됨
    $app.innerHTML = `
      <div class="login-wrap"><div class="login-card" style="text-align:center">
        <div class="lmark">수업</div>
        <div class="logo">참여할 수 없어요</div>
        <div class="sub" style="margin-bottom:16px">${esc(e.message)}<br>선생님께 코드를 다시 확인해 보세요.</div>
        <a class="btn btn-primary" href="#/login" style="justify-content:center">처음으로</a>
      </div></div>`;
    return;
  }
  document.title = `${data.board.title} — 수업프로그램 허브`;
  const savedName = (() => { try { return localStorage.getItem('studentName') || ''; } catch { return ''; } })();
  $app.innerHTML = `
    <div class="sboard">
      <header class="sb-head">
        <div>
          <div class="sb-title">📌 ${esc(data.board.title)}</div>
          <div class="sb-sub">${esc(data.programTitle)} · 참여 코드 ${esc(code.toUpperCase())}</div>
        </div>
        <a class="btn btn-ghost btn-sm" href="#/login">나가기</a>
      </header>
      ${studentMaterialsHtml(data.materials, code)}
      <div class="card sb-form">
        <div class="form-grid" style="grid-template-columns:150px 1fr">
          <div><label>이름</label><input id="sb-name" maxlength="20" value="${esc(savedName)}" placeholder="이름"></div>
          <div><label>활동 내용</label><textarea id="sb-content" rows="2" class="input" maxlength="2000" placeholder="활동한 내용을 적어보세요"></textarea></div>
        </div>
        <div class="mt" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" id="sb-file-btn" type="button">📎 사진/활동지 첨부</button>
          <span class="small muted" id="sb-file-label">첨부 없음</span>
          <span style="flex:1"></span>
          <button class="btn btn-primary" id="sb-submit" type="button">올리기</button>
        </div>
        <input type="file" id="sb-file" accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.hwp,.hwpx,.png,.jpg,.jpeg,.webp,.gif" style="display:none">
        <div class="msg" id="sb-msg"></div>
      </div>
      <div class="sb-grid" id="sb-grid">
        ${data.posts.map((p) => postCardHtml(p)).join('') || '<p class="empty-note" style="grid-column:1/-1">아직 올라온 결과물이 없어요. 첫 번째로 올려보세요!</p>'}
      </div>
    </div>`;

  const onThisBoard = () => location.hash.toLowerCase().endsWith(`/board/${code}`);
  const refresh = async () => {
    if (!onThisBoard()) return;
    try {
      const d = await api('GET', `/api/join-board/${code}`);
      const grid = document.getElementById('sb-grid');
      if (grid) grid.innerHTML = d.posts.map((p) => postCardHtml(p)).join('') || '<p class="empty-note" style="grid-column:1/-1">아직 올라온 결과물이 없어요. 첫 번째로 올려보세요!</p>';
    } catch (e) { if (!e.handled) navigate(); } // 마감되면 안내 화면으로
  };
  // 수업 중 실시간처럼 보이도록 15초마다 갱신
  const timer = setInterval(() => {
    if (!onThisBoard()) { clearInterval(timer); return; }
    refresh();
  }, 15000);

  document.querySelectorAll('[data-matfile]').forEach((btn) => {
    btn.onclick = () => openStudentFile(code, btn.dataset.matfile);
  });
  document.getElementById('sb-file-btn').onclick = () => document.getElementById('sb-file').click();
  document.getElementById('sb-file').onchange = (e) => {
    const f = e.target.files[0];
    document.getElementById('sb-file-label').textContent = f ? `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)` : '첨부 없음';
  };
  document.getElementById('sb-submit').onclick = async () => {
    const name = document.getElementById('sb-name').value.trim();
    const content = document.getElementById('sb-content').value.trim();
    const file = document.getElementById('sb-file').files[0] || null;
    const msg = document.getElementById('sb-msg');
    if (!name) { msg.textContent = '이름을 입력하세요.'; msg.className = 'msg err'; return; }
    if (!content && !file) { msg.textContent = '내용을 쓰거나 파일을 첨부하세요.'; msg.className = 'msg err'; return; }
    if (file && file.size > 20 * 1024 * 1024) { msg.textContent = '파일은 20MB 이하여야 합니다.'; msg.className = 'msg err'; return; }
    msg.textContent = '올리는 중…'; msg.className = 'msg';
    try {
      let filePart = {};
      if (file) {
        const mime = guessMime(file.name, file.type);
        const sign = await api('POST', `/api/join-board/${code}/file-sign`, { name: file.name, size: file.size });
        const put = await fetch(sign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mime, 'x-upsert': 'true' }, body: file });
        if (!put.ok) throw new Error('파일 업로드에 실패했습니다.');
        filePart = { path: sign.path, file_name: file.name, mime, size: file.size };
      }
      await api('POST', `/api/join-board/${code}/posts`, { student_name: name, content, ...filePart });
      try { localStorage.setItem('studentName', name); } catch {}
      document.getElementById('sb-content').value = '';
      document.getElementById('sb-file').value = '';
      document.getElementById('sb-file-label').textContent = '첨부 없음';
      msg.textContent = '올라갔어요! 🎉'; msg.className = 'msg ok';
      refresh();
    } catch (err) { if (!err.handled) { msg.textContent = err.message; msg.className = 'msg err'; } }
  };
});

/* ---------------- 내 수업 대시보드 (#/myclass — 교사·관리자) ---------------- */
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
function dateLabel(iso) {
  if (!iso) return '날짜 미정';
  const [y, m, d] = iso.split('-').map(Number);
  const wd = WEEKDAY[new Date(y, m - 1, d).getDay()];
  return `${y}. ${m}. ${d} (${wd})`;
}
function rosterBadge(r) {
  if (!r || !r.hasRoster) return '';
  const done = r.missingCount === 0;
  return `<span class="badge ${done ? 'green' : 'amber'}" title="명단 ${r.total}명 중 제출 ${r.submittedCount}명">제출 ${r.submittedCount}/${r.total}</span>`;
}
route(/^#\/myclass$/, async () => {
  const data = await api('GET', '/api/my-boards');
  const boards = data.boards;
  const card = (b) => `
    <div class="class-card ${b.isOpen ? '' : 'closed'}">
      <div class="cc-top">
        <div class="cc-title">${esc(b.title)}</div>
        ${b.isOpen ? '<span class="badge green">진행 중</span>' : '<span class="badge gray">마감됨</span>'}
      </div>
      <div class="cc-prog small muted">${esc(b.programTitle)}${b.programPublished ? '' : ' · <span style="color:#c0392b">프로그램 비공개</span>'}</div>
      ${b.isOpen ? `<div class="cc-code">참여 코드 <b>${esc(b.code)}</b></div>` : ''}
      <div class="cc-stat small muted">🧑‍🎓 제출 ${b.postCount}개 · 📚 공유 자료 ${b.itemCount}개 ${rosterBadge(b.roster)}</div>
      <div class="cc-actions">
        <a class="btn btn-primary btn-sm" href="#/boardview/${b.id}">${icon('monitor')} 수업 열기</a>
        <a class="btn btn-ghost btn-sm" href="#/program/${b.programId}">프로그램</a>
      </div>
    </div>`;
  // 날짜별 그룹 (최신 날짜 먼저, 날짜 미정은 맨 아래)
  const groups = new Map();
  for (const b of boards) {
    const key = b.classDate || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (!a) return 1; if (!b) return -1; return a < b ? 1 : -1;
  });
  const body = keys.map((k) => `
    <div class="date-group">
      <div class="date-head">${icon('clock')} ${esc(dateLabel(k))} <span class="small muted">· ${groups.get(k).length}개 수업</span></div>
      <div class="class-grid">${groups.get(k).map(card).join('')}</div>
    </div>`).join('');
  shell('내 수업', `
    <div class="page-head">
      <div>
        <div class="ph-t">내 수업</div>
        <div class="desc">날짜·주제별로 수업을 여러 개 열고, 반마다 자료를 고르고 학생 활동을 모읍니다.</div>
      </div>
      <div><button class="btn btn-primary btn-sm" id="mc-new">${icon('plus')} 새 수업 열기</button></div>
    </div>
    ${boards.length ? body
      : `<div class="empty-note">아직 만든 수업이 없습니다. 위 <b>[새 수업 열기]</b> 로 첫 수업을 만들어 보세요.</div>`}
  `);
  document.getElementById('mc-new').onclick = () => openNewClassModal();
});

// 대시보드에서 바로 새 수업(보드) 열기 — 프로그램 선택 포함
async function openNewClassModal() {
  let programs = [];
  try { programs = (await api('GET', '/api/programs')).programs; }
  catch (e) { if (!e.handled) toast(e.message, true); return; }
  if (!programs.length) {
    toast('사용할 수 있는 공개 프로그램이 없습니다. 관리자에게 프로그램 공개를 요청하세요.', true);
    return;
  }
  const opts = programs.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('');
  const back = openModal(`
    <h3>새 수업 열기</h3>
    <div class="m-sub">프로그램을 고르고, 날짜·주제로 이름을 붙이면 날짜별로 정리됩니다.</div>
    <div class="form-grid" style="grid-template-columns:1fr 1fr">
      <div style="grid-column:1/-1"><label>프로그램</label><select id="nc-prog">${opts}</select></div>
      <div style="grid-column:1/-1"><label>수업 이름 (반·주제)</label><input id="nc-title" placeholder="예: 2학년 2반 · 분수의 덧셈"></div>
      <div><label>수업 날짜</label><input id="nc-date" type="date"></div>
      <div><label>참여 코드 (영문·숫자 4~10자)</label>
        <input id="nc-code" maxlength="10" placeholder="비워두면 자동" autocomplete="off" style="text-transform:uppercase;letter-spacing:2px;font-weight:700"></div>
      <div style="grid-column:1/-1"><label>학생 명단 (선택 — 한 줄에 한 명)</label>
        <textarea id="nc-roster" rows="3" placeholder="김민준&#10;이서연&#10;박도윤" style="resize:vertical"></textarea>
        <div class="small muted" style="margin-top:5px">명단을 넣으면 누가 냈고 안 냈는지 자동 대조합니다.</div></div>
    </div>
    <div class="m-actions">
      <button class="btn btn-ghost" id="nc-cancel">취소</button>
      <button class="btn btn-primary" id="nc-save">수업 만들기</button>
    </div>
    <div class="msg" id="nc-msg"></div>`);
  back.querySelector('#nc-cancel').onclick = () => back.remove();
  back.querySelector('#nc-save').onclick = async () => {
    const programId = back.querySelector('#nc-prog').value;
    const title = back.querySelector('#nc-title').value.trim();
    const code = back.querySelector('#nc-code').value.trim().toLowerCase();
    const class_date = back.querySelector('#nc-date').value || undefined;
    const roster = back.querySelector('#nc-roster').value;
    const msg = back.querySelector('#nc-msg');
    if (!title) { msg.textContent = '수업 이름을 입력하세요.'; msg.className = 'msg err'; return; }
    if (code && !/^[a-z0-9]{4,10}$/.test(code)) { msg.textContent = '참여 코드는 영문·숫자 4~10자여야 합니다.'; msg.className = 'msg err'; return; }
    try {
      const r = await api('POST', `/api/programs/${programId}/boards`, { title, code: code || undefined, class_date, roster });
      back.remove();
      toast(`수업이 열렸습니다. 참여 코드: ${r.code.toUpperCase()}`);
      location.hash = `#/boardview/${r.id}`;
    } catch (err) { if (!err.handled) { msg.textContent = err.message; msg.className = 'msg err'; } }
  };
}

/* ---------------- 보드 관리 (#/boardview/:id — 교사·관리자) ---------------- */
route(/^#\/boardview\/(\d+)$/, async (id) => {
  let data;
  try { data = await api('GET', `/api/boards/${id}/posts`); }
  catch (e) { if (!e.handled && state.me) { toast(e.message, true); location.hash = '#/'; } return; }
  const b = data.board;
  shell(b.title, `
    <div class="page-head">
      <div>
        <div class="ph-t">${esc(b.title)} ${b.isOpen ? '<span class="badge green">진행 중</span>' : '<span class="badge gray">마감됨</span>'}</div>
        <div class="desc">${esc(data.program.title)} · 게시물 ${data.posts.length}개 ${b.isOpen ? '· 마감하면 학생 제출·열람이 즉시 중단됩니다' : '· 결과물은 계속 보관됩니다'}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${data.manageable && data.hasFiles ? `<button class="btn btn-soft btn-sm" id="board-dlall">${icon('download')} 전체 다운로드</button>` : ''}
        ${data.manageable ? `<button class="btn ${b.isOpen ? 'btn-danger' : 'btn-primary'} btn-sm" id="board-toggle">${b.isOpen ? '마감하기' : '다시 열기'}</button>` : ''}
        ${isAdmin() ? `<button class="btn btn-danger btn-sm" id="board-del">${icon('trash')} 보드 삭제</button>` : ''}
        <a class="btn btn-ghost btn-sm" href="#/program/${data.program.id}">← 프로그램</a>
      </div>
    </div>
    ${b.classDate ? `<div class="small muted" style="margin:-6px 0 12px">${icon('clock')} 수업 날짜 ${esc(dateLabel(b.classDate))}</div>` : ''}
    ${b.isOpen ? `
    <div class="card sb-code-card">
      <div>
        <div class="small muted" style="font-weight:700">학생 참여 코드 — 칠판에 띄워 주세요</div>
        <div class="sb-code">${esc(String(b.code).toUpperCase())}</div>
      </div>
      <div class="small muted" style="line-height:1.8">학생은 사이트 첫 화면의 <b>[학생 참여]</b> 탭에서<br>이 코드를 입력하면 됩니다. (계정 불필요)</div>
    </div>` : ''}
    ${data.manageable ? rosterCardHtml(data.roster) : ''}
    ${data.manageable ? '<div class="card" id="share-card"><div class="small muted">수업자료 불러오는 중…</div></div>' : ''}
    <div class="sb-grid">
      ${data.posts.map((p) => postCardHtml(p, { forTeacher: true, manageable: data.manageable })).join('') || '<p class="empty-note" style="grid-column:1/-1">아직 게시물이 없습니다.</p>'}
    </div>`);

  const toggleBtn = document.getElementById('board-toggle');
  if (toggleBtn) toggleBtn.onclick = async () => {
    if (b.isOpen && !confirm('보드를 마감할까요? 학생 제출과 열람이 즉시 중단됩니다. (결과물은 보관됩니다)')) return;
    await api('PATCH', `/api/boards/${id}`, { is_open: !b.isOpen });
    toast(b.isOpen ? '마감되었습니다. 결과물은 이 화면에서 계속 볼 수 있습니다.' : '보드를 다시 열었습니다.');
    navigate();
  };
  const delBtn = document.getElementById('board-del');
  if (delBtn) delBtn.onclick = async () => {
    if (!confirm('보드를 삭제할까요? 모든 게시물과 첨부 원본이 함께 삭제되며 되돌릴 수 없습니다.')) return;
    await api('DELETE', `/api/boards/${id}`);
    toast('보드가 삭제되었습니다.');
    location.hash = `#/program/${data.program.id}`;
  };
  const dlAllBtn = document.getElementById('board-dlall');
  if (dlAllBtn) dlAllBtn.onclick = () => downloadAll(id, dlAllBtn);
  const rosterEditBtn = document.getElementById('roster-edit');
  if (rosterEditBtn) rosterEditBtn.onclick = () => openRosterModal(id, b.roster || '');
  document.querySelectorAll('[data-phide]').forEach((btn) => {
    btn.onclick = async () => {
      await api('PATCH', `/api/posts/${btn.dataset.phide}`, { hidden: btn.dataset.val === '1' });
      navigate();
    };
  });
  document.querySelectorAll('[data-pdel]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('이 게시물을 삭제할까요? 첨부 원본도 함께 삭제됩니다.')) return;
      await api('DELETE', `/api/posts/${btn.dataset.pdel}`);
      toast('삭제되었습니다.');
      navigate();
    };
  });

  // 학생에게 보여줄 수업자료 고르기 (보드 관리자만)
  const shareCard = document.getElementById('share-card');
  if (shareCard) loadShareCard(shareCard, id);
});

const KIND_TAG = { link: '🔗 링크', aiapp: '🖥 웹앱', video: '▶ 영상' };
async function loadShareCard(el, boardId) {
  let d;
  try { d = await api('GET', `/api/boards/${boardId}/items`); }
  catch (e) { el.innerHTML = `<div class="small muted">${esc(e.message)}</div>`; return; }
  const sharedL = new Set(d.sharedLinkIds);
  const sharedF = new Set(d.sharedFileIds);
  const total = d.links.length + d.files.length;
  if (!total) {
    el.innerHTML = `<h2 style="margin:0 0 6px">학생에게 보여줄 수업자료</h2>
      <div class="small muted">이 프로그램에 등록된 링크·자료가 없습니다. 관리자가 <a href="#/program/${d.program.id}">프로그램</a>에 자료를 먼저 올려야 합니다.</div>`;
    return;
  }
  const row = (checked, type, id, tag, label, sub) => `
    <label class="share-row">
      <input type="checkbox" data-share="${type}:${id}" ${checked ? 'checked' : ''}>
      <span class="sr-tag">${tag}</span>
      <span class="sr-label">${esc(label)}${sub ? ` <span class="small muted">${esc(sub)}</span>` : ''}</span>
    </label>`;
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div>
        <h2 style="margin:0 0 2px">학생에게 보여줄 수업자료</h2>
        <div class="small muted">체크한 자료만 학생이 참여 코드로 들어와서 볼 수 있어요. 체크를 풀면 즉시 사라집니다.</div>
      </div>
      <button class="btn btn-primary btn-sm" id="share-save">저장</button>
    </div>
    <div class="share-list" style="margin-top:12px">
      ${d.links.map((l) => row(sharedL.has(l.id), 'link', l.id, KIND_TAG[l.kind] || '🔗 링크', l.label || l.url, '')).join('')}
      ${d.files.map((f) => row(sharedF.has(f.id), 'file', f.id, '📎 자료', f.name, (f.size / 1024 / 1024).toFixed(1) + 'MB')).join('')}
    </div>
    <div class="msg" id="share-msg" style="margin-top:8px"></div>`;
  document.getElementById('share-save').onclick = async () => {
    const link_ids = []; const file_ids = [];
    el.querySelectorAll('[data-share]:checked').forEach((c) => {
      const [t, i] = c.dataset.share.split(':');
      (t === 'link' ? link_ids : file_ids).push(Number(i));
    });
    const msg = document.getElementById('share-msg');
    msg.textContent = '저장 중…'; msg.className = 'msg';
    try {
      await api('PUT', `/api/boards/${boardId}/items`, { link_ids, file_ids });
      msg.textContent = `저장됐어요 — 학생에게 ${link_ids.length + file_ids.length}개 자료가 보입니다.`;
      msg.className = 'msg ok';
    } catch (e) { if (!e.handled) { msg.textContent = e.message; msg.className = 'msg err'; } }
  };
}

/* ---- 제출 현황(명단 대조) 카드 ---- */
function rosterCardHtml(r) {
  const editBtn = '<button class="btn btn-ghost btn-sm" id="roster-edit">명단 편집</button>';
  if (!r || !r.hasRoster) {
    return `<div class="card roster-card">
      <div class="rc-head">
        <div><h2 style="margin:0 0 2px">제출 현황</h2>
          <div class="small muted">학생 명단을 넣으면 누가 냈고 안 냈는지 자동으로 대조해 줍니다. (계정 불필요)</div></div>
        ${editBtn}
      </div></div>`;
  }
  const chip = (name, done) => `<span class="name-chip ${done ? 'done' : 'miss'}">${done ? '✓' : '·'} ${esc(name)}</span>`;
  const extras = (r.extras || []).length
    ? `<div class="rc-extra small muted" style="margin-top:10px">명단 밖 제출: ${r.extras.map((n) => esc(n)).join(', ')}</div>` : '';
  return `<div class="card roster-card">
    <div class="rc-head">
      <div><h2 style="margin:0 0 2px">제출 현황
        <span class="badge ${r.missingCount === 0 ? 'green' : 'amber'}">${r.submittedCount}/${r.total} 제출</span></h2>
        <div class="small muted">명단 ${r.total}명 · 제출 ${r.submittedCount}명 · 미제출 ${r.missingCount}명</div></div>
      ${editBtn}
    </div>
    ${r.missing.length ? `<div class="rc-block"><div class="rc-label miss">아직 안 낸 학생 (${r.missingCount})</div>
      <div class="name-wrap">${r.missing.map((n) => chip(n, false)).join('')}</div></div>` : '<div class="rc-block ok small">모두 제출했어요 🎉</div>'}
    ${r.submitted.length ? `<div class="rc-block"><div class="rc-label done">제출한 학생 (${r.submittedCount})</div>
      <div class="name-wrap">${r.submitted.map((n) => chip(n, true)).join('')}</div></div>` : ''}
    ${extras}
  </div>`;
}

// 명단 편집 모달 (날짜도 함께 수정)
function openRosterModal(boardId, current) {
  const back = openModal(`
    <h3>학생 명단 편집</h3>
    <div class="m-sub">한 줄에 한 명씩 이름을 적으세요. 제출자 이름과 자동으로 대조합니다.</div>
    <div class="form-grid" style="grid-template-columns:1fr">
      <div><label>학생 명단</label>
        <textarea id="rm-roster" rows="8" style="resize:vertical" placeholder="김민준&#10;이서연&#10;박도윤">${esc(current)}</textarea></div>
    </div>
    <div class="m-actions">
      <button class="btn btn-ghost" id="rm-cancel">취소</button>
      <button class="btn btn-primary" id="rm-save">저장</button>
    </div>
    <div class="msg" id="rm-msg"></div>`);
  back.querySelector('#rm-cancel').onclick = () => back.remove();
  back.querySelector('#rm-save').onclick = async () => {
    const roster = back.querySelector('#rm-roster').value;
    try {
      await api('PATCH', `/api/boards/${boardId}`, { roster });
      back.remove();
      toast('명단을 저장했어요.');
      navigate();
    } catch (e) { if (!e.handled) { const m = back.querySelector('#rm-msg'); m.textContent = e.message; m.className = 'msg err'; } }
  };
}

// 학생 제출물 일괄 다운로드 — 서명 URL을 받아 순차 저장 (zip 의존성 없이)
async function downloadAll(boardId, btn) {
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '준비 중…';
  let files;
  try { ({ files } = await api('GET', `/api/boards/${boardId}/download-all`)); }
  catch (e) { if (!e.handled) toast(e.message, true); btn.disabled = false; btn.innerHTML = label; return; }
  if (!files.length) { toast('내려받을 제출 파일이 없습니다.', true); btn.disabled = false; btn.innerHTML = label; return; }
  toast(`${files.length}개 파일을 내려받습니다. 브라우저가 여러 파일 저장을 물어보면 허용해 주세요.`);
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const a = document.createElement('a');
    a.href = f.url; a.download = f.name || '';
    document.body.appendChild(a); a.click(); a.remove();
    btn.innerHTML = `${i + 1}/${files.length}`;
    await new Promise((r) => setTimeout(r, 700)); // 브라우저 다중 다운로드 차단 완화
  }
  btn.disabled = false;
  btn.innerHTML = label;
  toast('전체 다운로드를 시작했습니다.');
}

/* ---------------- 프로그램 관리 (#/manage, admin) ---------------- */
route(/^#\/manage$/, async () => {
  if (!isAdmin()) { location.hash = '#/'; return; }
  const data = await api('GET', '/api/programs');
  const row = (p) => `
    <div class="deck-line">
      <div class="dl-left">
        <span class="dl-ico">${p.published ? '🟢' : '⚪'}</span>
        <div class="dl-body">
          <div class="dl-title">${esc(p.title)}</div>
          <div class="dl-meta small muted">${p.grade ? `🎓 ${esc(p.grade)} · ` : ''}${p.category ? `📁 ${esc(p.category)} · ` : ''}${p.published ? '공개 중' : '비공개'} · 🔗${p.linkCount + p.aiappCount} ▶${p.videoCount} 📎${p.fileCount}</div>
        </div>
      </div>
      <div class="dl-actions">
        <button class="btn ${p.published ? 'btn-ghost' : 'btn-primary'} btn-sm" data-pub="${p.id}" data-val="${p.published ? 0 : 1}">${p.published ? '비공개로' : '공개하기'}</button>
        <a class="btn btn-ghost btn-sm" href="#/manage/${p.id}">${icon('edit')} 편집</a>
        <button class="btn btn-danger btn-sm" data-del="${p.id}">${icon('trash')}</button>
      </div>
    </div>`;

  shell('프로그램 관리', `
    <div class="page-head">
      <div><div class="ph-t">프로그램 관리</div><div class="desc">공개/비공개 토글은 즉시 반영됩니다 — 비공개로 바꾸면 교사 화면에서 바로 사라집니다.</div></div>
      <button class="btn btn-primary" id="btn-new">${icon('plus')} 새 프로그램</button>
    </div>
    <div class="card" style="padding:6px 12px"><div class="deck-list">
      ${data.programs.map(row).join('') || '<p class="empty-note">프로그램이 없습니다. 새로 만들어 보세요.</p>'}
    </div></div>`);

  document.getElementById('btn-new').onclick = () => {
    const back = openModal(`
      <h3>새 프로그램</h3>
      <div class="m-sub">만든 뒤 편집 화면에서 링크·영상·첨부자료를 추가하세요. 처음에는 비공개 상태입니다.</div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr">
        <div style="grid-column:1/-1"><label>제목</label><input id="np-title" placeholder="예: 진로탐색 젭 수업"></div>
        <div><label>학년</label><select id="np-grade">
          <option value="">미지정</option>
          ${GRADES.map((g) => `<option value="${g}">${g}</option>`).join('')}
        </select></div>
        <div><label>카테고리 (폴더)</label><input id="np-cat" placeholder="예: 진로, 과학, 창체" maxlength="50"></div>
        <div style="grid-column:1/-1"><label>설명</label><textarea id="np-desc" rows="4" class="input" placeholder="## 제목, - 목록, **강조** 문법을 쓸 수 있습니다"></textarea></div>
      </div>
      <div class="m-actions">
        <button class="btn btn-ghost" id="np-cancel">취소</button>
        <button class="btn btn-primary" id="np-save">만들기</button>
      </div>
      <div class="msg" id="np-msg"></div>`);
    back.querySelector('#np-cancel').onclick = () => back.remove();
    back.querySelector('#np-save').onclick = async () => {
      try {
        const r = await api('POST', '/api/programs', {
          title: back.querySelector('#np-title').value,
          grade: back.querySelector('#np-grade').value,
          category: back.querySelector('#np-cat').value,
          description: back.querySelector('#np-desc').value,
        });
        back.remove();
        toast('프로그램이 만들어졌습니다. 내용을 채워보세요.');
        location.hash = `#/manage/${r.id}`;
      } catch (err) {
        const msg = back.querySelector('#np-msg');
        msg.textContent = err.message; msg.className = 'msg err';
      }
    };
  };
  document.querySelectorAll('[data-pub]').forEach((b) => {
    b.onclick = async () => {
      await api('PATCH', `/api/programs/${b.dataset.pub}`, { published: b.dataset.val === '1' });
      toast(b.dataset.val === '1' ? '공개되었습니다.' : '비공개로 전환되었습니다.');
      navigate();
    };
  });
  document.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('이 프로그램을 삭제할까요? 첨부자료 원본도 저장소에서 함께 삭제되며 되돌릴 수 없습니다.')) return;
      await api('DELETE', `/api/programs/${b.dataset.del}`);
      toast('삭제되었습니다.');
      navigate();
    };
  });
});

/* ---------------- 프로그램 편집 (#/manage/:id, admin) ---------------- */
const KIND_OPTIONS = [['link', '🔗 수업 링크'], ['aiapp', '🖥️ 웹앱'], ['video', '▶ 영상 (유튜브)']];

route(/^#\/manage\/(\d+)$/, async (id) => {
  if (!isAdmin()) { location.hash = '#/'; return; }
  let data;
  try { data = await api('GET', `/api/programs/${id}`); }
  catch { location.hash = '#/manage'; return; }
  const p = data.program;
  const lessons = data.lessons || [];
  let links = data.links.map((l) => ({ kind: l.kind, label: l.label, url: l.url, lesson_id: l.lesson_id }));

  const lessonOptions = (selected) => `<option value="">공통</option>${lessons.map((ls, i) =>
    `<option value="${ls.id}" ${Number(selected) === ls.id ? 'selected' : ''}>${lessonLabel(ls, i)}</option>`).join('')}`;

  const linkRowHtml = (l, i) => `
    <div class="deck-line" data-row="${i}">
      <div class="dl-left" style="flex:1;gap:8px;flex-wrap:wrap">
        <select data-lk="${i}" style="width:140px">${KIND_OPTIONS.map(([k, label]) => `<option value="${k}" ${l.kind === k ? 'selected' : ''}>${label}</option>`).join('')}</select>
        ${lessons.length ? `<select data-lls="${i}" style="width:130px" title="소속 차시">${lessonOptions(l.lesson_id)}</select>` : ''}
        <input data-ll="${i}" placeholder="이름표 (예: 젭 교실)" value="${esc(l.label)}" style="width:170px">
        <input data-lu="${i}" placeholder="https:// 주소" value="${esc(l.url)}" style="flex:1;min-width:200px">
      </div>
      <div class="dl-actions">
        <button class="btn btn-ghost btn-sm" data-lmv="${i}" data-dir="-1" title="위로">${icon('up')}</button>
        <button class="btn btn-ghost btn-sm" data-lmv="${i}" data-dir="1" title="아래로">${icon('down')}</button>
        <button class="btn btn-danger btn-sm" data-ldel="${i}">${icon('x')}</button>
      </div>
    </div>`;

  const fileRowHtml = (f) => {
    const isHtml = /\.(html?|htm)$/i.test(f.name) || f.mime === 'text/html';
    return `
    <div class="deck-line">
      <div class="dl-left">
        <span class="dl-ico">${isHtml ? '🖥️' : '📎'}</span>
        <div class="dl-body">
          <div class="dl-title">${esc(f.name)} ${isHtml ? '<span class="badge blue plain">HTML 웹앱</span>' : (f.downloadable ? '' : '<span class="badge amber plain">보기 전용</span>')}</div>
          <div class="dl-meta small muted">${(f.size / 1024 / 1024).toFixed(1)}MB</div>
        </div>
      </div>
      <div class="dl-actions">
        ${lessons.length ? `<select data-fls="${f.id}" style="width:130px" title="소속 차시">${lessonOptions(f.lesson_id)}</select>` : ''}
        ${isHtml ? `<a class="btn btn-soft btn-sm" href="/api/files/${f.id}/open" target="_blank" rel="noopener">${icon('play')} 실행</a>` : `
        <label class="ir-toggle" title="끄면 교사는 화면 열람만 가능합니다">
          <input type="checkbox" data-fdl="${f.id}" ${f.downloadable ? 'checked' : ''}> 다운로드 허용
        </label>`}
        <a class="btn btn-ghost btn-sm" href="/api/files/${f.id}/download" target="_blank" rel="noopener">${icon('download')}</a>
        <button class="btn btn-danger btn-sm" data-fdel="${f.id}">${icon('trash')}</button>
      </div>
    </div>`;
  };

  shell(`편집 — ${p.title}`, `
    <div class="page-head">
      <div><div class="ph-t">프로그램 편집</div><div class="desc">${p.published ? '<span class="badge green">공개 중</span> 저장하면 교사 화면에 바로 반영됩니다.' : '<span class="badge gray">비공개</span> 공개 전까지 교사에게 보이지 않습니다.'}</div></div>
      <div style="display:flex;gap:8px">
        <button class="btn ${p.published ? 'btn-ghost' : 'btn-primary'} btn-sm" id="pub-toggle">${p.published ? '비공개로 전환' : '공개하기'}</button>
        <a class="btn btn-ghost btn-sm" href="#/program/${p.id}">미리보기</a>
        <a class="btn btn-ghost btn-sm" href="#/manage">← 목록</a>
      </div>
    </div>
    <div class="card" style="margin-bottom:18px">
      <h2>기본 정보</h2>
      <div class="form-grid" style="grid-template-columns:2fr 1fr 1fr">
        <div><label>제목</label><input id="ed-title" value="${esc(p.title)}"></div>
        <div><label>학년</label><select id="ed-grade">
          <option value="">미지정</option>
          ${GRADES.map((g) => `<option value="${g}" ${p.grade === g ? 'selected' : ''}>${g}</option>`).join('')}
        </select></div>
        <div><label>카테고리 (폴더)</label><input id="ed-cat" value="${esc(p.category)}" maxlength="50"></div>
      </div>
      <div class="form-grid mt" style="grid-template-columns:1fr">
        <div><label>설명</label><textarea id="ed-desc" rows="5" class="input">${esc(p.description)}</textarea>
        <div class="small muted" style="margin-top:5px"><code>## 제목</code> <code>- 목록</code> <code>**강조**</code> 문법을 쓸 수 있습니다.</div></div>
      </div>
      <div class="mt"><button class="btn btn-primary btn-sm" id="save-info">기본 정보 저장</button></div>
      <div class="msg" id="info-msg"></div>
    </div>
    <div class="card" style="margin-bottom:18px">
      <h2>차시 <span class="sub">차시를 만들면 링크·파일을 차시별로 묶고, 교사 화면에 차시 탭이 생깁니다</span></h2>
      <div class="deck-list" id="lesson-rows">
        ${lessons.map((l, i) => `
          <div class="deck-line">
            <div class="dl-left"><span class="dl-ico">${i + 1}</span>
              <div class="dl-body"><div class="dl-title">${lessonLabel(l, i)}</div></div></div>
            <div class="dl-actions">
              <button class="btn btn-ghost btn-sm" data-lmv2="${l.id}" data-dir="-1" title="위로">${icon('up')}</button>
              <button class="btn btn-ghost btn-sm" data-lmv2="${l.id}" data-dir="1" title="아래로">${icon('down')}</button>
              <button class="btn btn-ghost btn-sm" data-lrename="${l.id}">이름 변경</button>
              <button class="btn btn-danger btn-sm" data-ldel2="${l.id}" title="차시 삭제 (자료는 공통으로 이동)">${icon('trash')}</button>
            </div>
          </div>`).join('') || '<p class="empty-note">차시가 없습니다. 차시 없이 공통 자료만 써도 됩니다.</p>'}
      </div>
      <div class="mt" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-soft btn-sm" id="add-lesson">${icon('plus')} 차시 추가</button>
        <button class="btn btn-ghost btn-sm" id="auto-lessons" title='파일·링크 이름의 "1차시_" 같은 표기를 인식해 자동으로 차시를 만들고 배정합니다'>✨ 파일명으로 차시 자동 구성</button>
      </div>
    </div>
    <div class="card" style="margin-bottom:18px">
      <h2>링크 · 웹앱 · 영상 <span class="sub">순서대로 보여집니다. 저장을 눌러야 반영됩니다.</span></h2>
      <div id="link-rows" class="deck-list">${links.map(linkRowHtml).join('') || ''}</div>
      <div class="mt" style="display:flex;gap:8px">
        <button class="btn btn-soft btn-sm" id="add-link">${icon('plus')} 항목 추가</button>
        <button class="btn btn-primary btn-sm" id="save-links">링크 저장</button>
      </div>
      <div class="msg" id="link-msg"></div>
    </div>
    <div class="card">
      <h2>첨부자료 · HTML 웹앱 <span class="sub">PDF·PPT·한글·zip·이미지·<b>HTML</b>, 100MB 이하 — HTML 파일은 교사 화면에서 <b>수업 웹앱으로 바로 실행</b>됩니다. 새 파일은 기본 보기 전용(교사 다운로드 차단)</span></h2>
      <div id="file-rows" class="deck-list">${data.files.map(fileRowHtml).join('') || '<p class="empty-note">첨부자료가 없습니다.</p>'}</div>
      <div class="mt" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-soft btn-sm" id="up-btn">${icon('plus')} 파일 업로드</button>
        ${lessons.length ? `<label class="small muted" style="display:flex;gap:6px;align-items:center">올릴 차시:
          <select id="up-lesson" style="width:140px">${lessonOptions(null)}</select></label>` : ''}
        <input type="file" id="up-file" accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.hwp,.hwpx,.zip,.png,.jpg,.jpeg,.webp,.gif,.html,.htm" style="display:none">
      </div>
      <div class="msg" id="file-msg"></div>
    </div>`);

  // 기본 정보
  document.getElementById('save-info').onclick = async () => {
    const msg = document.getElementById('info-msg');
    try {
      await api('PATCH', `/api/programs/${p.id}`, {
        title: document.getElementById('ed-title').value,
        grade: document.getElementById('ed-grade').value,
        category: document.getElementById('ed-cat').value,
        description: document.getElementById('ed-desc').value,
      });
      toast('저장되었습니다.');
      msg.textContent = '';
    } catch (err) { msg.textContent = err.message; msg.className = 'msg err'; }
  };
  document.getElementById('pub-toggle').onclick = async () => {
    await api('PATCH', `/api/programs/${p.id}`, { published: !p.published });
    toast(p.published ? '비공개로 전환되었습니다.' : '공개되었습니다.');
    navigate();
  };

  // 파일·링크 이름의 "n차시" 표기를 인식해 차시 생성 + 자동 배정
  document.getElementById('auto-lessons').onclick = async () => {
    const pat = /(\d+)\s*차시/;
    const nums = new Set();
    data.files.forEach((f) => { const m = pat.exec(f.name); if (m) nums.add(Number(m[1])); });
    collectLinks();
    links.forEach((l) => { const m = pat.exec(l.label || ''); if (m) nums.add(Number(m[1])); });
    if (!nums.size) { toast('파일·링크 이름에서 "1차시" 같은 표기를 찾지 못했습니다.', true); return; }
    const sorted = [...nums].sort((a, b) => a - b);
    if (!confirm(`이름에서 ${sorted.map((n) => n + '차시').join(', ')}를 찾았습니다.\n차시를 만들고 파일·링크를 자동으로 배정할까요?`)) return;
    try {
      // 이미 있는 차시(제목이 "n차시"로 시작)는 재사용
      const byNum = {};
      lessons.forEach((l) => { const m = /^(\d+)\s*차시/.exec(l.title); if (m) byNum[Number(m[1])] = l.id; });
      for (const n of sorted) {
        if (!byNum[n]) {
          const r = await api('POST', `/api/programs/${p.id}/lessons`, { title: `${n}차시` });
          byNum[n] = r.id;
        }
      }
      for (const f of data.files) {
        const m = pat.exec(f.name);
        if (m && f.lesson_id !== byNum[Number(m[1])]) {
          await api('PATCH', `/api/files/${f.id}`, { lesson_id: byNum[Number(m[1])] });
        }
      }
      let linkChanged = false;
      links.forEach((l) => { const m = pat.exec(l.label || ''); if (m) { l.lesson_id = byNum[Number(m[1])]; linkChanged = true; } });
      if (linkChanged) await api('PUT', `/api/programs/${p.id}/links`, { links: links.filter((l) => l.url && l.url.trim()) });
      toast(`${sorted.length}개 차시로 자동 구성했습니다. 교사 화면에 차시 탭이 생깁니다.`);
      navigate();
    } catch (err) { toast(err.message, true); }
  };

  // 차시 관리
  const bindLessonRows = () => {
    document.getElementById('add-lesson').onclick = async () => {
      const title = prompt('차시 이름을 입력하세요. (예: 나를 알아보기)');
      if (!title || !title.trim()) return;
      await api('POST', `/api/programs/${p.id}/lessons`, { title: title.trim() });
      toast('차시가 추가되었습니다.');
      navigate();
    };
    document.querySelectorAll('[data-lrename]').forEach((b) => {
      b.onclick = async () => {
        const cur = lessons.find((l) => l.id === Number(b.dataset.lrename));
        const title = prompt('새 차시 이름', cur ? cur.title : '');
        if (!title || !title.trim()) return;
        await api('PATCH', `/api/lessons/${b.dataset.lrename}`, { title: title.trim() });
        navigate();
      };
    });
    document.querySelectorAll('[data-ldel2]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('이 차시를 삭제할까요? 소속된 링크·파일은 삭제되지 않고 공통 자료로 이동합니다.')) return;
        await api('DELETE', `/api/lessons/${b.dataset.ldel2}`);
        toast('차시가 삭제되었습니다. 자료는 공통으로 이동했습니다.');
        navigate();
      };
    });
    document.querySelectorAll('[data-lmv2]').forEach((b) => {
      b.onclick = async () => {
        const ids = lessons.map((l) => l.id);
        const i = ids.indexOf(Number(b.dataset.lmv2));
        const j = i + Number(b.dataset.dir);
        if (j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        await api('PUT', `/api/programs/${p.id}/lessons-order`, { ids });
        navigate();
      };
    });
  };
  bindLessonRows();

  // 링크 편집
  const collectLinks = () => {
    links = links.map((_, i) => ({
      kind: document.querySelector(`[data-lk="${i}"]`).value,
      label: document.querySelector(`[data-ll="${i}"]`).value,
      url: document.querySelector(`[data-lu="${i}"]`).value,
      lesson_id: (document.querySelector(`[data-lls="${i}"]`)?.value || null) && Number(document.querySelector(`[data-lls="${i}"]`).value) || null,
    }));
  };
  const redrawLinks = () => {
    document.getElementById('link-rows').innerHTML = links.map(linkRowHtml).join('');
    bindLinkRows();
  };
  const bindLinkRows = () => {
    document.querySelectorAll('[data-ldel]').forEach((b) => {
      b.onclick = () => { collectLinks(); links.splice(Number(b.dataset.ldel), 1); redrawLinks(); };
    });
    document.querySelectorAll('[data-lmv]').forEach((b) => {
      b.onclick = () => {
        collectLinks();
        const i = Number(b.dataset.lmv);
        const j = i + Number(b.dataset.dir);
        if (j < 0 || j >= links.length) return;
        [links[i], links[j]] = [links[j], links[i]];
        redrawLinks();
      };
    });
  };
  bindLinkRows();
  document.getElementById('add-link').onclick = () => {
    collectLinks();
    links.push({ kind: 'link', label: '', url: '' });
    redrawLinks();
  };
  document.getElementById('save-links').onclick = async () => {
    collectLinks();
    const msg = document.getElementById('link-msg');
    try {
      const cleaned = links.filter((l) => l.url.trim());
      await api('PUT', `/api/programs/${p.id}/links`, { links: cleaned });
      toast(`링크 ${cleaned.length}개가 저장되었습니다.`);
      msg.textContent = '';
    } catch (err) { msg.textContent = err.message; msg.className = 'msg err'; }
  };

  // 파일 업로드 (서명 업로드 3단계: sign → Supabase 직접 PUT → confirm)
  document.getElementById('up-btn').onclick = () => document.getElementById('up-file').click();
  document.getElementById('up-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const msg = document.getElementById('file-msg');
    if (file.size > 100 * 1024 * 1024) { msg.textContent = '파일은 100MB 이하여야 합니다.'; msg.className = 'msg err'; e.target.value = ''; return; }
    msg.textContent = '업로드 중…'; msg.className = 'msg';
    try {
      const mime = guessMime(file.name, file.type);
      const sign = await api('POST', `/api/programs/${p.id}/file-sign`, { name: file.name, size: file.size });
      const put = await fetch(sign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mime, 'x-upsert': 'true' }, body: file });
      if (!put.ok) throw new Error('저장소 업로드에 실패했습니다.');
      const lessonSel = document.getElementById('up-lesson');
      await api('POST', `/api/programs/${p.id}/file-confirm`, {
        path: sign.path, name: file.name, mime, size: file.size,
        lesson_id: lessonSel && lessonSel.value ? Number(lessonSel.value) : null,
      });
      toast('업로드되었습니다.');
      navigate();
    } catch (err) { msg.textContent = err.message; msg.className = 'msg err'; }
    e.target.value = '';
  };
  document.querySelectorAll('[data-fdel]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('이 첨부자료를 삭제할까요? 저장소 원본도 함께 삭제됩니다.')) return;
      await api('DELETE', `/api/files/${b.dataset.fdel}`);
      toast('삭제되었습니다.');
      navigate();
    };
  });
  document.querySelectorAll('[data-fdl]').forEach((el) => {
    el.onchange = async () => {
      try {
        await api('PATCH', `/api/files/${el.dataset.fdl}`, { downloadable: el.checked });
        toast(el.checked ? '교사 다운로드가 허용되었습니다.' : '보기 전용으로 전환되었습니다. 교사 다운로드가 즉시 차단됩니다.');
        navigate();
      } catch (err) { toast(err.message, true); el.checked = !el.checked; }
    };
  });
  document.querySelectorAll('[data-fls]').forEach((el) => {
    el.onchange = async () => {
      try {
        await api('PATCH', `/api/files/${el.dataset.fls}`, { lesson_id: el.value ? Number(el.value) : null });
        toast('차시가 변경되었습니다.');
      } catch (err) { toast(err.message, true); }
    };
  });
});

/* ---------------- 교사 계정 관리 (#/users, admin) ---------------- */
route(/^#\/users$/, async () => {
  if (!isAdmin()) { location.hash = '#/'; return; }
  const data = await api('GET', '/api/users');

  shell('교사 계정', `
    <div class="page-head">
      <div><div class="ph-t">교사 계정</div><div class="desc">계정을 <b>정지</b>하면 그 즉시 접속이 끊기고 다시 로그인할 수 없습니다.</div></div>
    </div>
    <div class="card" style="margin-bottom:18px">
      <h2>새 계정 만들기 <span class="sub">첫 로그인 시 비밀번호 변경이 요구됩니다</span></h2>
      <form id="user-form" class="form-grid">
        <div><label>아이디</label><input name="username" required minlength="3" placeholder="영문/숫자 3자 이상"></div>
        <div><label>이름</label><input name="name" required placeholder="홍길동"></div>
        <div><label>역할</label>
          <select name="role"><option value="teacher">교사</option><option value="admin">관리자</option></select></div>
        <div><label>초기 비밀번호 (8자 이상)</label><input name="password" type="text" required minlength="8"></div>
        <div><button class="btn btn-primary" type="submit" style="width:100%;justify-content:center">${icon('plus')} 계정 생성</button></div>
      </form>
      <div class="msg" id="user-msg"></div>
    </div>
    <div class="card">
      <div class="tbl-scroll">
        <table class="tbl resp">
          <thead><tr><th>아이디</th><th>이름</th><th>역할</th><th>상태</th><th>생성일</th><th style="width:250px">관리</th></tr></thead>
          <tbody>
            ${data.users.map((u) => `
              <tr>
                <td data-label="아이디" class="cell-main">${esc(u.username)}</td>
                <td data-label="이름">${esc(u.name)}</td>
                <td data-label="역할"><span class="badge ${u.role === 'admin' ? 'blue' : 'green'}">${esc(u.roleLabel)}</span></td>
                <td data-label="상태">${u.active ? '<span class="badge green">활성</span>' : '<span class="badge red">정지됨</span>'}</td>
                <td data-label="생성일" class="small muted">${esc(u.createdAt).slice(0, 10)}</td>
                <td>
                  ${!u.manageable ? '<span class="small muted">본인 계정</span>' : `
                  <div class="row-actions">
                    <button class="btn ${u.active ? 'btn-danger' : 'btn-primary'} btn-sm" data-act="${u.id}" data-val="${u.active ? 0 : 1}">${u.active ? '정지 (즉시 강퇴)' : '정지 해제'}</button>
                    <button class="btn btn-ghost btn-sm" data-rpw="${u.id}">비번 초기화</button>
                    <button class="btn btn-danger btn-sm" data-udel="${u.id}">${icon('trash')}</button>
                  </div>`}
                </td>
              </tr>`).join('') || '<tr><td colspan="6" class="empty-note">계정이 없습니다.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`);

  document.getElementById('user-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const msg = document.getElementById('user-msg');
    try {
      await api('POST', '/api/users', {
        username: f.get('username'), name: f.get('name'), role: f.get('role'), password: f.get('password'),
      });
      toast('계정이 생성되었습니다.');
      navigate();
    } catch (err) { msg.textContent = err.message; msg.className = 'msg err'; }
  };
  document.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = async () => {
      const activate = b.dataset.val === '1';
      if (!activate && !confirm('이 계정을 정지할까요? 접속 중이면 즉시 강퇴됩니다.')) return;
      await api('PATCH', `/api/users/${b.dataset.act}`, { active: activate });
      toast(activate ? '정지가 해제되었습니다.' : '정지되었습니다. 접속 중 세션도 끊었습니다.');
      navigate();
    };
  });
  document.querySelectorAll('[data-rpw]').forEach((b) => {
    b.onclick = async () => {
      const pw = prompt('새 임시 비밀번호 (8자 이상). 대상자는 첫 로그인 시 변경해야 합니다.');
      if (!pw) return;
      try { await api('POST', `/api/users/${b.dataset.rpw}/reset-password`, { password: pw }); toast('초기화되었습니다.'); }
      catch (err) { toast(err.message, true); }
    };
  });
  document.querySelectorAll('[data-udel]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('이 계정을 삭제할까요? 되돌릴 수 없습니다.')) return;
      await api('DELETE', `/api/users/${b.dataset.udel}`);
      toast('삭제되었습니다.');
      navigate();
    };
  });
});

/* ---------------- 사이트 설정 — 킬스위치 (#/site, admin) ---------------- */
route(/^#\/site$/, async () => {
  if (!isAdmin()) { location.hash = '#/'; return; }
  const data = await api('GET', '/api/settings');
  state.settings = data.settings;
  const open = !!state.settings.site_open;

  shell('사이트 설정', `
    <div class="page-head">
      <div><div class="ph-t">사이트 설정</div><div class="desc">사이트 전체를 즉시 닫거나 다시 열 수 있습니다.</div></div>
    </div>
    <div class="grid main-cols">
      <div class="card">
        <h2>사이트 전체 잠금 (킬스위치)</h2>
        <div class="sec-row">
          <div class="tile ${open ? 'green' : 'red'}">${icon('power')}</div>
          <div class="sx">
            <div class="sl">${open ? '사이트 열림 — 교사들이 정상 이용 중' : '사이트 닫힘 — 교사 접근 전면 차단 중'}</div>
            <div class="sd">닫으면 관리자를 제외한 모든 계정이 다음 요청부터 차단됩니다. 언제든 다시 열 수 있습니다.</div>
          </div>
          <label class="toggle"><input type="checkbox" id="site-open" ${open ? 'checked' : ''}><span class="tr"></span></label>
        </div>
        <div class="mt">
          <label>안내 문구 (닫힘 화면에 표시)</label>
          <input id="site-notice" value="${esc(state.settings.site_notice || '')}" maxlength="500" placeholder="예: 점검 중입니다. 내일 다시 열립니다.">
          <div class="mt"><button class="btn btn-primary btn-sm" id="save-notice">안내 문구 저장</button></div>
        </div>
      </div>
      <div class="card">
        <h2>회수(잠금) 수단 안내</h2>
        <div class="small" style="line-height:2">
          <b>① 프로그램별 비공개</b> — 프로그램 관리에서 토글. 해당 프로그램만 즉시 숨겨집니다.<br>
          <b>② 계정 정지</b> — 교사 계정에서 정지. 그 교사만 즉시 강퇴됩니다.<br>
          <b>③ 사이트 전체 잠금</b> — 이 화면의 킬스위치. 관리자 외 전원 차단됩니다.<br>
          <b>④ 첨부 삭제</b> — 편집 화면에서 파일 삭제 시 저장소 원본까지 소멸됩니다.
        </div>
      </div>
    </div>`);

  document.getElementById('site-open').onchange = async (e) => {
    const next = e.target.checked;
    if (!next && !confirm('사이트를 닫을까요? 관리자를 제외한 모든 교사가 즉시 차단됩니다.')) { e.target.checked = true; return; }
    try {
      const r = await api('PATCH', '/api/settings', { site_open: next });
      state.settings = r.settings;
      toast(next ? '사이트를 열었습니다.' : '사이트를 닫았습니다. 교사 접근이 차단됩니다.');
      navigate();
    } catch (err) { toast(err.message, true); e.target.checked = !next; }
  };
  document.getElementById('save-notice').onclick = async () => {
    const r = await api('PATCH', '/api/settings', { site_notice: document.getElementById('site-notice').value });
    state.settings = r.settings;
    toast('안내 문구가 저장되었습니다.');
  };
});

/* ---------------- 이용 기록 (#/logs, admin) ---------------- */
const LOG_LABELS = {
  login: ['접속', 'green'], login_failed: ['로그인 실패', 'red'], login_blocked: ['차단 (정지 계정)', 'red'],
  logout: ['로그아웃', 'gray'], password_changed: ['비밀번호 변경', 'gray'], password_reset: ['비밀번호 초기화', 'amber'],
  user_created: ['계정 생성', 'blue'], user_updated: ['계정 수정', 'amber'], user_deleted: ['계정 삭제', 'red'],
  program_created: ['프로그램 생성', 'blue'], program_updated: ['프로그램 수정', 'gray'], program_deleted: ['프로그램 삭제', 'red'],
  program_links_updated: ['링크 수정', 'gray'],
  file_uploaded: ['파일 업로드', 'blue'], file_downloaded: ['파일 다운로드', 'blue'], file_deleted: ['파일 삭제', 'red'],
  settings_updated: ['사이트 설정 변경', 'amber'],
};
function browserOf(ua) {
  if (!ua) return '-';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  return '기타';
}

route(/^#\/logs$/, async () => {
  if (!isAdmin()) { location.hash = '#/'; return; }
  const data = await api('GET', '/api/logs');
  shell('이용 기록', `
    <div class="page-head">
      <div><div class="ph-t">이용 기록</div><div class="desc">최근 300건의 접속·변경 기록입니다.</div></div>
    </div>
    <div class="card">
      ${data.logs.length ? `<div class="log-list">
        ${data.logs.map((l) => {
          const [label, color] = LOG_LABELS[l.action] || [l.action, 'gray'];
          return `<div class="log-item">
            <div class="li-main">
              <div class="li-top"><span class="badge ${color}">${esc(label)}</span><span class="li-who">${esc(l.username || '알 수 없음')}</span></div>
              ${l.detail ? `<div class="li-det">${esc(l.detail)}</div>` : ''}
            </div>
            <div class="li-meta">${esc(l.created_at)}<br>${l.ip ? `${esc(l.ip)} · ${esc(browserOf(l.ua))}` : ''}</div>
          </div>`;
        }).join('')}
      </div>` : '<div class="empty-note">기록이 없습니다.</div>'}
    </div>`);
});

/* ---------------- 비밀번호 변경 / 내 설정 ---------------- */
function passwordCardHtml(forced) {
  return `
    <div class="card" style="max-width:460px">
      <h2>비밀번호 변경</h2>
      ${forced ? '<p class="msg err" style="margin-bottom:12px">보안을 위해 비밀번호를 변경해야 서비스를 이용할 수 있습니다.</p>' : ''}
      <form id="pw-form" class="form-grid" style="grid-template-columns:1fr">
        <div><label>현재 비밀번호</label><input name="current" type="password" required autocomplete="current-password"></div>
        <div><label>새 비밀번호 (8자 이상)</label><input name="next" type="password" required minlength="8" autocomplete="new-password"></div>
        <div><label>새 비밀번호 확인</label><input name="next2" type="password" required minlength="8" autocomplete="new-password"></div>
        <button class="btn btn-primary" type="submit" style="justify-content:center">변경하기</button>
      </form>
      <div class="msg" id="pw-msg"></div>
    </div>`;
}
function bindPasswordForm() {
  document.getElementById('pw-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const msg = document.getElementById('pw-msg');
    if (f.get('next') !== f.get('next2')) {
      msg.textContent = '새 비밀번호가 서로 다릅니다.';
      msg.className = 'msg err';
      return;
    }
    try {
      await api('POST', '/api/password', { current: f.get('current'), next: f.get('next') });
      state.me.mustChangePassword = false;
      toast('비밀번호가 변경되었습니다.');
      setTimeout(() => { location.hash = '#/'; }, 500);
    } catch (err) { msg.textContent = err.message; msg.className = 'msg err'; }
  };
}

route(/^#\/password$/, async () => {
  shell('비밀번호 변경', passwordCardHtml(state.me.mustChangePassword));
  bindPasswordForm();
});

route(/^#\/settings$/, async () => {
  const u = state.me;
  shell('설정', `
    <div class="grid main-cols">
      <div class="col-stack">
        <div class="card">
          <h2>내 정보</h2>
          <div class="preview-kv" style="grid-template-columns:110px 1fr">
            <span class="k">이름</span><span class="v">${esc(u.name)}</span>
            <span class="k">아이디</span><span class="v">${esc(u.username)}</span>
            <span class="k">역할</span><span><span class="badge blue">${esc(u.roleLabel)}</span></span>
          </div>
        </div>
        ${passwordCardHtml(false)}
      </div>
      <div class="card">
        <h2>서비스 정보</h2>
        <div class="preview-kv" style="grid-template-columns:110px 1fr">
          <span class="k">서비스</span><span class="v">수업프로그램 허브</span>
        </div>
        <p class="small muted mt" style="line-height:1.9">
          같은 학교 선생님들을 위한 수업프로그램 모음 사이트입니다.
          계정·자료 관련 문의는 관리자 선생님에게 연락하세요.
        </p>
      </div>
    </div>`);
  bindPasswordForm();
});

/* ---------------- 부팅 ---------------- */
(async function boot() {
  try {
    const data = await api('GET', '/api/me');
    state.me = data.user;
    state.settings = data.settings;
  } catch { state.me = null; }
  if (!location.hash) location.hash = state.me ? '#/' : '#/login';
  navigate();
})();
