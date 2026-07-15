/* 교안 주입: 제목 + 영상 — 파일을 고치지 않고 사이트(프로그램 링크)에서 값을 바꾼다.
 *
 *  제목:  [data-title] 요소의 글자를 ?title= 값으로 교체 (링크 라벨 = 교안 제목, 한 곳에서 관리)
 *  영상:  [data-video]/.videoframe 에 ?video= 또는 window.__LESSON_VIDEO__ 영상 삽입
 *
 * 사용: 교안 <head> 에  <script defer src="../_shared/inject.js"></script>
 *        제목 자리   <h1 class="title" data-title>기본 제목</h1>
 *        영상 자리   <div class="videoframe" data-video></div>
 */
(function () {
  var params;
  try { params = new URLSearchParams(location.search); } catch (e) { params = null; }
  var get = function (k) { return params ? params.get(k) : null; };

  // ---- 제목 ----
  var title = get('title');
  if (title) {
    document.querySelectorAll('[data-title]').forEach(function (el) { el.textContent = title; });
    try { document.title = title; } catch (e) {}
  }

  // ---- 영상 ----
  var url = window.__LESSON_VIDEO__ || get('video');
  if (url) {
    var slots = document.querySelectorAll('.videoframe[data-video], [data-video-slot]');
    if (slots.length) {
      var yt = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,20})/.exec(url);
      var html = yt
        ? '<iframe src="https://www.youtube.com/embed/' + yt[1] +
            '?rel=0&modestbranding=1" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>'
        : '<video controls src="' + String(url).replace(/"/g, '&quot;') + '"></video>';
      slots.forEach(function (s) { s.innerHTML = html; });
    }
  }
})();
