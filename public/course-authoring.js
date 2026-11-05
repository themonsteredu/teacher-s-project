'use strict';
// Shared by the registration screen and its behavioral tests.
(function(root) {
  const clone = value => JSON.parse(JSON.stringify(value));
  function outline(value, blank, appUrl = '') {
    const lines = value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length || lines.length > 50) throw new Error('차시 제목을 한 줄씩, 1~50개 입력하세요.');
    return lines.map(line => {
      const [title, url = ''] = line.split('\t').map(s => s.trim());
      if (!title || title.length > 120) throw new Error('차시 제목은 120자 이내로 입력하세요.');
      const s = blank(); s.title = title; s.assets.app.url = url || appUrl;
      return s;
    });
  }
  function variant(source, indices, id, name) {
    if (!name.trim() || !indices.length || new Set(indices).size !== indices.length || indices.some(i => !Number.isInteger(i) || !source.sessions[i])) throw new Error('구성 이름과 사용할 원본 차시를 선택하세요.');
    return {id, name:name.trim(), sessions:indices.map(i => clone(source.sessions[i]))};
  }
  function commonApp(plan) {
    let count = 0;
    if (!plan.appUrl.trim()) throw new Error('공통 웹앱 주소를 먼저 입력하세요.');
    for (const v of plan.variants) for (const s of v.sessions) {
      if (!s.assets.app.url && !s.assets.app.fileId) { s.assets.app.url = plan.appUrl.trim(); count++; }
    }
    return count;
  }
  // Filename hints are suggestions only; the teacher reviews all assignments before upload.
  function fileHint(name) {
    const text = String(name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    const match = text.match(/(?:^|\s)([1-9]\d?)\s*차시(?:\s|$|[·.:])/);
    const number = match ? Number(match[1]) : null;
    const slot = /활동지|워크시트|학습지/.test(text) ? 'worksheet' : /교안|지도안|선생님용|교사용/.test(text) ? 'guide' : /ppt|슬라이드|발표자료/i.test(text) ? 'ppt' : /학생용|학생앱|웹앱/i.test(text) ? 'app' : '';
    const title = text.replace(/(?:^|\s)[1-9]\d?\s*차시(?:\s|$|[·.:])/,' ').replace(/학생용|학생앱|웹앱|선생님용|교사용|지도안|교안|활동지|워크시트|학습지|ppt|슬라이드|발표자료/gi,' ').replace(/\s+/g,' ').trim();
    return {number:number && number <= 50 ? number : null, slot, title};
  }
  // Curated from the published Joseon six-lesson course; no arbitrary URL crawling.
  function historyJoseon(url, blank) {
    let u; try { u = new URL(String(url).trim()); } catch { throw new Error('역사 수업 사이트 주소를 확인하세요.'); }
    if (u.protocol !== 'https:' || u.host !== 'ai-history-ar.vercel.app' || u.username || u.password || !/^\/(?:joseon(?:\/course\/[1-6])?)?\/?$/.test(u.pathname)) throw new Error('이 가져오기는 역사 AR 사이트의 조선 6차시만 지원합니다.');
    const titles = ['AI의 답을 자료로 확인하기','문장을 표로 정리하고 정제하기','학급 전체 그래프 만들고 읽기','조선 유산 AR 전시 준비하기','해설 녹음과 관람 문제 만들기','우리 반 AR 박물관과 개인 퀴즈'];
    const objectives = ['조선 유산에 관한 문장을 원문과 비교하고 근거와 출처를 남길 수 있어요.','한 행에 한 가지 사실을 놓고 분류·중복·출처를 점검할 수 있어요.','여섯 모둠의 근거 표를 합쳐 이야기종류별 문장 수와 한계를 설명할 수 있어요.','유산의 특징을 관찰하고 AR 사진 또는 모형에 설명할 위치를 정할 수 있어요.','근거에 맞는 해설을 녹음하고 해설에서 답을 찾을 수 있는 문제를 만들 수 있어요.','다른 모둠 전시의 해설을 근거로 문제를 풀고 배운 점을 설명할 수 있어요.'];
    return titles.map((title,i)=>{
      const s=blank(), n=i+1, base='https://ai-history-ar.vercel.app';
      s.title=title; s.minutes=40; s.bridge=objectives[i];
      s.assets.app.url=`${base}/joseon/course/${n}?view=activity`;
      s.assets.ppt.url=`${base}/joseon/course/${n}?view=ppt`;
      s.assets.worksheet.url=`${base}/downloads/joseon/course/lesson-${n}-student.pdf`;
      s.assets.guide.url=`${base}/teacher/joseon/course/${n}`;
      return s;
    });
  }
  const api = {outline, variant, commonApp, fileHint, historyJoseon};
  if (typeof module !== 'undefined') module.exports = api;
  else root.CourseAuthoring = api;
})(globalThis);
