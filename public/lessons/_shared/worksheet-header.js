/* =====================================================
 * 학교별 활동지 머리글 (_shared/worksheet-header.js)
 *
 * 활동지 HTML의 <head>에 한 줄만 넣으면 된다:
 *   <script defer src="../_shared/worksheet-header.js"></script>
 *
 * 하는 일
 *  - 주소의 ?school=<학교코드> (예: ?school=boseong) 를 읽어 /api/worksheet-headers 에서 그 학교의
 *    머리글(왼쪽·오른쪽 문구, 로고, 제목)을 가져와 인쇄용 <article class="sheet"> 맨 위에
 *    학교 문서 양식(문구 → 로고 → 굵은 선 → 교육영역·학습주제 표)으로 그린다.
 *  - 활동지의 "활동지 학교명" 입력칸(#school)이 있으면 그 자리에 학교 선택 목록과
 *    교육영역·학습주제 입력칸을 붙인다. 선택은 이 브라우저에 기억된다.
 *  - 교육영역·학습주제 기본값은 window.LESSON.area / .topic 또는
 *    <article class="sheet" data-area="…" data-topic="…"> 에서 읽는다. 없으면 빈 칸(손글씨용).
 *
 * 학교를 고르지 않으면 활동지는 원래 모습 그대로 인쇄된다.
 * 학교 목록·로고는 관리자가 /worksheet-headers.html 에서 바꾼다.
 * ===================================================== */
(function () {
  'use strict';
  var STORE = 'moakit:ws:school';
  var SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
  var params = new URLSearchParams(location.search);
  var schools = [];
  var chosen = (params.get('school') || '').trim().slice(0, 60);
  var manual = { area: null, topic: null };

  try { if (!chosen) chosen = localStorage.getItem(STORE) || ''; } catch (e) { /* 저장 불가 브라우저 */ }

  var css = [
    '[data-ws-header]{display:none;font-family:"Noto Serif KR","Batang","BatangChe",serif;color:#111;margin:0 0 6mm}',
    '[data-ws-header].on{display:block}',
    '[data-ws-header].on ~ #sheet-school{display:none}',
    '.ws-top{display:flex;justify-content:space-between;gap:8mm;font-size:13px;letter-spacing:.02em;color:#222}',
    '.ws-logo{text-align:center;margin:3mm 0 2mm;min-height:10mm}',
    '.ws-logo img{max-height:22mm;max-width:78%;object-fit:contain;vertical-align:middle}',
    '.ws-logo b{font-family:"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif;font-size:26px;letter-spacing:.06em;font-weight:700}',
    '.ws-rule{border:0;border-top:1.3mm solid #2b2b2b;margin:1.5mm 0 4mm}',
    '.ws-meta{width:100%;border-collapse:collapse;border-top:2px solid #111;border-bottom:2px solid #111;font-size:16px;table-layout:fixed}',
    '.ws-meta th{width:23%;border-right:1px solid #333;border-bottom:1px solid #333;padding:2.5mm 3mm;font-weight:700;text-align:center;letter-spacing:.08em}',
    '.ws-meta td{border-bottom:1px solid #333;padding:2.5mm 4mm;text-align:left}',
    '.ws-meta tr:last-child th,.ws-meta tr:last-child td{border-bottom:0}',
    '.ws-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:end;width:100%}',
    '.ws-controls label{flex:1 1 160px;font-size:15px}',
    '.ws-controls select,.ws-controls input{display:block;width:100%;margin-top:4px;font:inherit;padding:10px;border:1px solid #a9bfb5;border-radius:6px;background:#fff}',
    '.ws-hint{flex-basis:100%;font-size:13px;color:#4a5d57;margin:0}',
  ].join('\n');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(s) { return document.querySelector(s); }

  // 활동지 파일은 최상위에서 `const LESSON={…}` 로 선언한다 (window 속성이 아니라 스크립트 전역 렉시컬 바인딩)
  function lesson() {
    try { if (typeof LESSON === 'object' && LESSON) return LESSON; } catch (e) { /* 미선언 */ }
    return (window.LESSON && typeof window.LESSON === 'object') ? window.LESSON : {};
  }
  function defaults() {
    var sheet = $('.sheet');
    var L = lesson();
    return {
      area: (sheet && sheet.getAttribute('data-area')) || L.area || '',
      topic: (sheet && sheet.getAttribute('data-topic')) || L.topic || L.title || '',
    };
  }
  function meta() {
    var d = defaults();
    return { area: manual.area == null ? d.area : manual.area, topic: manual.topic == null ? d.topic : manual.topic };
  }

  // 현재 고른 학교. 학교 코드가 아니면(예전 ?school=학교명) 이름으로 찾고, 없으면 이름만 가진 임시 학교.
  function current() {
    if (!chosen) return null;
    var i, s;
    for (i = 0; i < schools.length; i++) { s = schools[i]; if (s.slug === chosen || s.name === chosen) return s; }
    if (SLUG.test(chosen)) return null;
    return { slug: '', name: chosen, left: '', right: chosen, title: chosen + ' 활동지', logo: '' };
  }

  // 머리글 HTML. 관리자 미리보기도 같은 함수를 쓴다.
  function html(school, m) {
    m = m || {};
    var logo = school.logo
      ? '<img src="' + esc(school.logo) + '" alt="' + esc(school.title || school.name) + '">'
      : '<b>' + esc(school.title || (school.name + ' 활동지')) + '</b>';
    return '<div class="ws-top"><span>' + esc(school.left) + '</span><span>' + esc(school.right) + '</span></div>' +
      '<div class="ws-logo">' + logo + '</div><hr class="ws-rule">' +
      '<table class="ws-meta"><tr><th>교육영역</th><td>' + esc(m.area) + '</td></tr><tr><th>학습주제</th><td>' + esc(m.topic) + '</td></tr></table>';
  }

  function render() {
    var sheet = $('.sheet');
    if (!sheet) return;
    var box = sheet.querySelector('[data-ws-header]');
    if (!box) { box = document.createElement('div'); box.setAttribute('data-ws-header', ''); sheet.insertBefore(box, sheet.firstChild); }
    var s = current();
    if (!s) { box.className = ''; box.innerHTML = ''; return; }
    box.className = 'on';
    box.innerHTML = html(s, meta());
  }

  function choose(value) {
    chosen = String(value || '').trim().slice(0, 60);
    try { if (chosen) localStorage.setItem(STORE, chosen); else localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
    // 예전 방식의 학교명 입력칸이 있으면 이름을 맞춰 준다 (활동지 자체 코드가 그 값을 쓴다)
    var legacy = $('#school');
    var s = current();
    if (legacy) { legacy.value = s ? s.name : ''; legacy.dispatchEvent(new Event('input', { bubbles: true })); }
    render();
  }

  // 활동지의 "활동지 학교명" 입력칸 자리에 학교 선택·교육영역·학습주제를 붙인다.
  function adopt() {
    var legacy = $('#school');
    if (!legacy || $('[data-ws-controls]')) return;
    var label = legacy.closest('label');
    var host = document.createElement('div');
    host.className = 'ws-controls';
    host.setAttribute('data-ws-controls', '');
    var d = defaults();
    var opts = '<option value="">학교 머리글 없음 (기본)</option>' + schools.map(function (s) {
      return '<option value="' + esc(s.slug) + '"' + (s.slug === chosen || s.name === chosen ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
    host.innerHTML = '<label>활동지 학교<select data-ws-select>' + opts + '</select></label>' +
      '<label>교육영역<input data-ws-area maxlength="60" value="' + esc(d.area) + '" placeholder="예: 인공지능의 원리와 활용[데이터]"></label>' +
      '<label>학습주제<input data-ws-topic maxlength="60" value="' + esc(d.topic) + '" placeholder="예: 데이터 유형 알기"></label>' +
      '<p class="ws-hint">학교를 고르면 활동지 맨 위가 그 학교 양식(문구·로고·교육영역 표)으로 인쇄돼요. 학교 목록·로고는 관리자 메뉴 “활동지 머리글”에서 바꿉니다.</p>';
    if (label) { label.parentNode.insertBefore(host, label); label.style.display = 'none'; }
    else legacy.parentNode.insertBefore(host, legacy);
    host.querySelector('[data-ws-select]').onchange = function (e) { choose(e.target.value); };
    host.querySelector('[data-ws-area]').oninput = function (e) { manual.area = e.target.value; render(); };
    host.querySelector('[data-ws-topic]').oninput = function (e) { manual.topic = e.target.value; render(); };
    // 예전 ?school=학교명 링크로 열렸는데 목록에 없으면 이름 그대로 두고 알려 준다
    if (chosen && !current().slug && !SLUG.test(chosen)) {
      var o = document.createElement('option'); o.value = chosen; o.textContent = chosen + ' (이름만)'; o.selected = true;
      host.querySelector('[data-ws-select]').appendChild(o);
    }
    if (legacy && current()) { legacy.value = current().name; }
  }

  function load() {
    return fetch('/api/worksheet-headers', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : { schools: [] }; })
      .then(function (d) { schools = Array.isArray(d.schools) ? d.schools : []; })
      .catch(function () { schools = []; });
  }

  function init() {
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
    load().then(function () {
      if (chosen && !current()) chosen = '';
      adopt();
      render();
    });
    window.addEventListener('beforeprint', render);
  }

  window.MoakitWorksheetHeader = {
    html: html, render: render, choose: choose, load: load,
    schools: function () { return schools.slice(); }, current: current, css: css,
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
