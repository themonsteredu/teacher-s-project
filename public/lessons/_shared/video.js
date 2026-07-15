/* 프로그램에서 주입한 영상(window.__LESSON_VIDEO__)을 .videoframe에 자동 삽입.
 * 교안 HTML은 <div class="videoframe" data-video></div> 만 두면 되고,
 * 실제 영상은 관리자가 프로그램 편집에서 링크만 바꾸면 교체된다(파일 수정 불필요). */
(function () {
  // 영상 출처: 주입된 전역값 또는 주소 파라미터(?video=…) — 둘 다 파일 수정 없이 교체 가능
  var url = window.__LESSON_VIDEO__;
  try { url = url || new URLSearchParams(location.search).get('video'); } catch (e) {}
  if (!url) return;
  var slots = document.querySelectorAll('.videoframe[data-video], [data-video-slot]');
  if (!slots.length) return;
  var yt = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,20})/.exec(url);
  var html;
  if (yt) {
    html = '<iframe src="https://www.youtube.com/embed/' + yt[1] +
      '?rel=0&modestbranding=1" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
  } else {
    html = '<video controls src="' + String(url).replace(/"/g, '&quot;') + '"></video>';
  }
  slots.forEach(function (s) { s.innerHTML = html; });
})();
