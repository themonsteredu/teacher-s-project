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
  const api = {outline, variant, commonApp, fileHint};
  if (typeof module !== 'undefined') module.exports = api;
  else root.CourseAuthoring = api;
})(globalThis);
