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
    location.hash = '#/login';
    throw new Error(data.error || '로그인이 필요합니다.');
  }
  // 사이트 킬스위치: 폐쇄 중이면 교사에게 폐쇄 안내 화면
  if (res.status === 403 && data.error === 'site_closed') {
    renderClosed(data.notice);
    throw new Error('사이트가 일시 중단되었습니다.');
  }
  if (!res.ok) {
    const err = new Error(data.error || '요청에 실패했습니다.');
    err.data = data;
    throw err;
  }
  return data;
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
  if (!state.me && hash !== '#/login') { location.hash = '#/login'; return; }
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

/* ---------------- 셸 (사이드바 + 헤더) ---------------- */
function menuGroups() {
  if (isAdmin()) {
    return [
      ['수업', [
        ['#/', 'grid', '프로그램'],
      ]],
      ['운영', [
        ['#/manage', 'layers', '프로그램 관리'],
        ['#/users', 'users', '교사 계정'],
        ['#/site', 'power', '사이트 설정'],
        ['#/logs', 'fileText', '이용 기록'],
      ]],
      ['내 계정', [['#/settings', 'sliders', '설정']]],
    ];
  }
  return [
    ['수업', [['#/', 'grid', '프로그램']]],
    ['내 계정', [['#/settings', 'sliders', '설정']]],
  ];
}

function shell(title, contentHtml) {
  const u = state.me;
  const hash = (location.hash || '#/').split('/').slice(0, 2).join('/');
  $app.innerHTML = `
    <div class="shell" id="shell">
      <div class="side-overlay" id="side-overlay"></div>
      <aside class="sidebar">
        <div class="brand">
          <div class="mark">수업</div>
          <div><div class="bt">수업프로그램 허브</div><div class="bs">선생님용 수업자료 모음</div></div>
        </div>
        <nav>
          ${menuGroups().map(([label, items]) => `
            <div class="nav-label">${label}</div>
            ${items.map(([href, ic, text]) =>
              `<a href="${href}" class="${hash === href || (href === '#/' && (location.hash || '#/') === '#/') ? 'active' : ''}">${icon(ic)}${text}</a>`).join('')}
          `).join('')}
        </nav>
        <div class="side-foot">
          ${icon('clock')} ${esc(u.name)} (${esc(u.roleLabel)})<br>
          <span class="tz">문의는 관리자 선생님에게 연락하세요</span>
        </div>
      </aside>
      <div class="main">
        <header class="header">
          <button class="hamburger" id="btn-hamburger" aria-label="메뉴">${icon('menu')}</button>
          <div class="page-title">${esc(title)}</div>
          <div class="search-box">
            ${icon('search')}
            <input id="global-search" placeholder="프로그램 검색" autocomplete="off" value="${esc(state.search)}">
          </div>
          <button class="icon-btn" id="btn-help" aria-label="도움말">${icon('help')}</button>
          <div class="profile-chip">
            <div class="who"><div class="nm">${esc(u.name)}</div><div class="rl">${esc(u.roleLabel)}</div></div>
            <div class="avatar">${esc(u.name.slice(0, 1))}</div>
            <button class="icon-btn" id="btn-logout" title="로그아웃">${icon('logout')}</button>
          </div>
        </header>
        <div class="content">${contentHtml}</div>
      </div>
    </div>`;

  document.getElementById('btn-logout').onclick = async () => {
    await api('POST', '/api/logout').catch(() => {});
    state.me = null;
    location.hash = '#/login';
  };
  const shellEl = document.getElementById('shell');
  document.getElementById('btn-hamburger').onclick = () => shellEl.classList.toggle('side-open');
  document.getElementById('side-overlay').onclick = () => shellEl.classList.remove('side-open');
  document.getElementById('global-search').onkeydown = (e) => {
    if (e.key === 'Enter') {
      state.search = e.target.value.trim();
      if ((location.hash || '#/') === '#/') navigate(); else location.hash = '#/';
    }
  };
  document.getElementById('btn-help').onclick = () => {
    openModal(`
      <h3>도움말</h3>
      <div class="m-sub">수업프로그램 허브 사용 안내</div>
      <div style="font-size:13px;line-height:2">
        · <b>프로그램</b> 목록에서 수업에 쓸 프로그램을 골라 여세요.<br>
        · 프로그램 안에는 <b>수업 링크</b>(젭·패들렛 등), <b>웹앱</b>, <b>영상</b>, <b>첨부자료</b>가 있습니다.<br>
        · 첨부자료는 다운로드 버튼으로 받습니다.<br>
        ${isAdmin() ? '· <b>프로그램 관리</b>에서 만들기·공개/비공개·수정·삭제를 할 수 있습니다.<br>· <b>사이트 설정</b>에서 사이트 전체를 잠글 수 있습니다.' : '· 목록에 없는 자료는 관리자 선생님에게 문의하세요.'}
      </div>
      <div class="m-actions"><button class="btn btn-primary" id="m-close">확인</button></div>`)
      .querySelector('#m-close').onclick = (e) => e.target.closest('.modal-back').remove();
  };
}

/* ---------------- 로그인 ---------------- */
route(/^#\/login$/, () => {
  const render = (errMsg = '') => {
    $app.innerHTML = `
      <div class="login-wrap">
        <form class="login-card" id="login-form">
          <div class="lmark">수업</div>
          <div class="logo">수업프로그램 허브</div>
          <div class="sub">선생님용 수업자료 · 프로그램 모음</div>
          <label>아이디</label>
          <input class="input" name="username" autocomplete="username" required>
          <label>비밀번호</label>
          <input class="input" name="password" type="password" autocomplete="current-password" required>
          <button class="btn btn-primary" type="submit">로그인</button>
          <div class="login-error">${esc(errMsg)}</div>
        </form>
      </div>`;
    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
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

/* ---------------- 사이트 폐쇄 화면 (교사) ---------------- */
function renderClosed(notice) {
  shell('안내', `
    <div class="blocked-wrap">
      <div class="blocked-hero">${icon('lock')}</div>
      <h2>사이트 이용이 일시 중단되었습니다</h2>
      <p>${esc(notice || '관리자가 사이트를 잠시 닫아 두었습니다. 안내가 있을 때까지 기다려 주세요.')}</p>
      <p class="mt small muted">이 화면은 30초마다 자동으로 다시 확인합니다.</p>
    </div>`);
  setTimeout(() => { if (state.me) navigate(); }, 30000);
}

/* ---------------- 카탈로그 (#/) ---------------- */
const CARD_DECO = ['📚', '🧭', '🎨', '🔬'];
let catalogTab = 'all';

route(/^#\/$/, async () => {
  const data = await api('GET', '/api/programs');
  const all = data.programs;
  const categories = [...new Set(all.map((p) => p.category || ''))].filter(Boolean).sort();
  const hasEtc = all.some((p) => !p.category);
  const tabs = [['all', `전체 (${all.length})`],
    ...categories.map((c) => [c, `${c} (${all.filter((p) => p.category === c).length})`]),
    ...(hasEtc && categories.length ? [['', `미분류 (${all.filter((p) => !p.category).length})`]] : [])];
  if (catalogTab !== 'all' && !tabs.some(([k]) => k === catalogTab)) catalogTab = 'all';
  const kw = state.search.toLowerCase();
  const list = all.filter((p) =>
    (catalogTab === 'all' || (p.category || '') === catalogTab)
    && (!kw || p.title.toLowerCase().includes(kw) || String(p.description).toLowerCase().includes(kw)));

  const metaText = (p) => {
    const parts = [];
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
    ${tabs.length > 1 ? `<div class="tabs">${tabs.map(([k, label]) => `<button data-ctab="${esc(k)}" class="${catalogTab === k ? 'active' : ''}">${k === 'all' ? '' : '📁 '}${esc(label)}</button>`).join('')}</div>` : ''}
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

route(/^#\/program\/(\d+)$/, async (id) => {
  let data;
  try { data = await api('GET', `/api/programs/${id}`); }
  catch (e) { if (state.me) { toast(e.message, true); location.hash = '#/'; } return; }
  const p = data.program;
  const links = data.links.filter((l) => l.kind !== 'video');
  const videos = data.links.filter((l) => l.kind === 'video');

  const linkRow = (l) => {
    const [ic, label] = KIND_META[l.kind] || KIND_META.link;
    return `
      <a class="btn ${l.kind === 'aiapp' ? 'btn-primary' : 'btn-soft'}" style="justify-content:flex-start;gap:8px;padding-right:14px" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">
        ${icon(ic)} <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.label || l.url)}</span> <span class="small ${l.kind === 'aiapp' ? '' : 'muted'}" style="margin-left:auto;white-space:nowrap;flex-shrink:0;opacity:.75">${label} ↗</span>
      </a>`;
  };
  const fileRow = (f) => `
    <div class="deck-line">
      <div class="dl-left">
        <span class="dl-ico">📎</span>
        <div class="dl-body">
          <div class="dl-title">${esc(f.name)}</div>
          <div class="dl-meta small muted">${(f.size / 1024 / 1024).toFixed(1)}MB · ${esc(f.created_at)}</div>
        </div>
      </div>
      <div class="dl-actions">
        <a class="btn btn-primary btn-sm" href="/api/files/${f.id}/download" target="_blank" rel="noopener">${icon('download')} 다운로드</a>
      </div>
    </div>`;

  shell(p.title, `
    <div class="page-head">
      <div>
        <div class="ph-t">${esc(p.title)} ${p.published ? '' : '<span class="badge gray">비공개</span>'}</div>
        <div class="desc">${p.category ? `📁 ${esc(p.category)} · ` : ''}업데이트 ${esc(p.updated_at)}</div>
      </div>
      <div style="display:flex;gap:8px">
        ${isAdmin() ? `
          <button class="btn btn-ghost btn-sm" id="pub-toggle">${p.published ? `${icon('eyeOff')} 비공개로 전환` : `${icon('eye')} 공개하기`}</button>
          <a class="btn btn-ghost btn-sm" href="#/manage/${p.id}">${icon('edit')} 편집</a>` : ''}
        <a class="btn btn-ghost btn-sm" href="#/">← 목록</a>
      </div>
    </div>
    <div class="grid main-cols">
      <div class="col-stack">
        ${p.description ? `<div class="card"><h2>소개</h2><div class="doc-body" style="line-height:1.9">${renderBodyMd(p.description)}</div></div>` : ''}
        ${videos.length ? `<div class="card"><h2>영상</h2>${videos.map((v) => `
          ${v.label ? `<div class="field-label" style="margin:8px 0 6px">${esc(v.label)}</div>` : ''}
          ${videoEmbed(v.url)}`).join('')}</div>` : ''}
      </div>
      <div class="col-stack">
        ${links.length ? `<div class="card"><h2>수업 링크 · 웹앱</h2>
          <div style="display:flex;flex-direction:column;gap:8px">${links.map(linkRow).join('')}</div></div>` : ''}
        ${data.files.length ? `<div class="card"><h2>첨부자료</h2>${data.files.map(fileRow).join('')}</div>` : ''}
        ${!links.length && !data.files.length && !videos.length && !p.description ? '<div class="card"><p class="empty-note">아직 등록된 내용이 없습니다.</p></div>' : ''}
      </div>
    </div>`);

  const pubBtn = document.getElementById('pub-toggle');
  if (pubBtn) pubBtn.onclick = async () => {
    await api('PATCH', `/api/programs/${p.id}`, { published: !p.published });
    toast(p.published ? '비공개로 전환되었습니다. 교사에게 즉시 숨겨집니다.' : '공개되었습니다.');
    navigate();
  };
});

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
          <div class="dl-meta small muted">${p.category ? `📁 ${esc(p.category)} · ` : ''}${p.published ? '공개 중' : '비공개'} · 🔗${p.linkCount + p.aiappCount} ▶${p.videoCount} 📎${p.fileCount}</div>
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
      <div class="form-grid" style="grid-template-columns:1fr">
        <div><label>제목</label><input id="np-title" placeholder="예: 진로탐색 젭 수업"></div>
        <div><label>카테고리 (폴더)</label><input id="np-cat" placeholder="예: 진로, 과학, 창체" maxlength="50"></div>
        <div><label>설명</label><textarea id="np-desc" rows="4" class="input" placeholder="## 제목, - 목록, **강조** 문법을 쓸 수 있습니다"></textarea></div>
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
  let links = data.links.map((l) => ({ kind: l.kind, label: l.label, url: l.url }));

  const linkRowHtml = (l, i) => `
    <div class="deck-line" data-row="${i}">
      <div class="dl-left" style="flex:1;gap:8px">
        <select data-lk="${i}" style="width:150px">${KIND_OPTIONS.map(([k, label]) => `<option value="${k}" ${l.kind === k ? 'selected' : ''}>${label}</option>`).join('')}</select>
        <input data-ll="${i}" placeholder="이름표 (예: 젭 교실)" value="${esc(l.label)}" style="width:180px">
        <input data-lu="${i}" placeholder="https:// 주소" value="${esc(l.url)}" style="flex:1;min-width:200px">
      </div>
      <div class="dl-actions">
        <button class="btn btn-ghost btn-sm" data-lmv="${i}" data-dir="-1" title="위로">${icon('up')}</button>
        <button class="btn btn-ghost btn-sm" data-lmv="${i}" data-dir="1" title="아래로">${icon('down')}</button>
        <button class="btn btn-danger btn-sm" data-ldel="${i}">${icon('x')}</button>
      </div>
    </div>`;

  const fileRowHtml = (f) => `
    <div class="deck-line">
      <div class="dl-left">
        <span class="dl-ico">📎</span>
        <div class="dl-body">
          <div class="dl-title">${esc(f.name)}</div>
          <div class="dl-meta small muted">${(f.size / 1024 / 1024).toFixed(1)}MB</div>
        </div>
      </div>
      <div class="dl-actions">
        <a class="btn btn-ghost btn-sm" href="/api/files/${f.id}/download" target="_blank" rel="noopener">${icon('download')}</a>
        <button class="btn btn-danger btn-sm" data-fdel="${f.id}">${icon('trash')}</button>
      </div>
    </div>`;

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
      <div class="form-grid" style="grid-template-columns:2fr 1fr">
        <div><label>제목</label><input id="ed-title" value="${esc(p.title)}"></div>
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
      <h2>링크 · 웹앱 · 영상 <span class="sub">순서대로 보여집니다. 저장을 눌러야 반영됩니다.</span></h2>
      <div id="link-rows" class="deck-list">${links.map(linkRowHtml).join('') || ''}</div>
      <div class="mt" style="display:flex;gap:8px">
        <button class="btn btn-soft btn-sm" id="add-link">${icon('plus')} 항목 추가</button>
        <button class="btn btn-primary btn-sm" id="save-links">링크 저장</button>
      </div>
      <div class="msg" id="link-msg"></div>
    </div>
    <div class="card">
      <h2>첨부자료 <span class="sub">PDF·PPT·한글·zip·이미지, 100MB 이하 — 파일은 관리자의 Supabase 비공개 버킷에만 저장됩니다</span></h2>
      <div id="file-rows" class="deck-list">${data.files.map(fileRowHtml).join('') || '<p class="empty-note">첨부자료가 없습니다.</p>'}</div>
      <div class="mt">
        <button class="btn btn-soft btn-sm" id="up-btn">${icon('plus')} 파일 업로드</button>
        <input type="file" id="up-file" accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.hwp,.hwpx,.zip,.png,.jpg,.jpeg,.webp,.gif" style="display:none">
      </div>
      <div class="msg" id="file-msg"></div>
    </div>`);

  // 기본 정보
  document.getElementById('save-info').onclick = async () => {
    const msg = document.getElementById('info-msg');
    try {
      await api('PATCH', `/api/programs/${p.id}`, {
        title: document.getElementById('ed-title').value,
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

  // 링크 편집
  const collectLinks = () => {
    links = links.map((_, i) => ({
      kind: document.querySelector(`[data-lk="${i}"]`).value,
      label: document.querySelector(`[data-ll="${i}"]`).value,
      url: document.querySelector(`[data-lu="${i}"]`).value,
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
      const sign = await api('POST', `/api/programs/${p.id}/file-sign`, { name: file.name, size: file.size });
      const put = await fetch(sign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' }, body: file });
      if (!put.ok) throw new Error('저장소 업로드에 실패했습니다.');
      await api('POST', `/api/programs/${p.id}/file-confirm`, { path: sign.path, name: file.name, mime: file.type || 'application/octet-stream', size: file.size });
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
