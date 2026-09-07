'use strict';
// Program classification only: explicit grade/subject links, never student record tags.
(function(root) {
  const SCHOOLS = [
    { id: 'elementary', label: '초등학교', grades: [1, 2, 3, 4, 5, 6], subjects: ['국어', '수학', '통합교과', '사회', '과학', '영어', '도덕', '실과', '체육', '음악', '미술', '창의적 체험활동'] },
    { id: 'middle', label: '중학교', grades: [1, 2, 3], subjects: ['국어', '수학', '사회', '역사', '과학', '영어', '도덕', '기술·가정', '정보', '체육', '음악', '미술', '진로와 직업', '창의적 체험활동'] },
    { id: 'high', label: '고등학교', grades: [1, 2, 3], subjects: ['국어', '수학', '영어', '한국사', '사회', '과학', '정보', '체육', '음악', '미술', '진로와 직업', '창의적 체험활동'] },
  ];
  const owns = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
  function fail(message) { const e = new Error(message); e.status = 400; throw e; }
  function text(value, max, label) {
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail(`${label}의 형식과 길이를 확인하세요.`);
    return value.trim();
  }
  function normalize(input) {
    if (input === undefined) return { links: [], topic: '', purpose: 'teaching' };
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('교육과정 연결 정보를 확인하세요.');
    const links = input.links === undefined ? [] : input.links;
    if (!Array.isArray(links) || links.length > 40) fail('교육과정 연결은 40개 이내로 등록하세요.');
    const seen = new Set(), result = [];
    for (const link of links) {
      if (!link || typeof link !== 'object' || Array.isArray(link)) fail('학교·학년·교과 연결을 확인하세요.');
      const school = SCHOOLS.find(s => s.id === link.school);
      if (!school || !Number.isInteger(link.grade) || !school.grades.includes(link.grade)) fail('학교급에 맞는 학년을 선택하세요.');
      const subject = text(link.subject === undefined ? '' : link.subject, 40, '연계 교과');
      const value = { school: school.id, grade: link.grade, subject };
      const key = JSON.stringify(value);
      if (!seen.has(key)) { seen.add(key); result.push(value); }
    }
    const topic = text(input.topic === undefined ? '' : input.topic, 120, '학습 주제');
    const purpose = input.purpose === undefined ? 'teaching' : input.purpose;
    if (!['teaching', 'test'].includes(purpose)) fail('수업용 또는 테스트·검증용을 선택하세요.');
    return { links: result, topic, purpose };
  }
  function forProgram(program) {
    if (program && owns(program, 'curriculum')) {
      // A malformed saved classification must not guess a replacement from legacy metadata.
      try { return normalize(program.curriculum); } catch { return normalize(); }
    }
    const match = typeof program?.grade === 'string' && program.grade.trim().match(/^(초|중|고)([1-6])$/);
    const school = match && { 초: 'elementary', 중: 'middle', 고: 'high' }[match[1]];
    if (school && SCHOOLS.find(s => s.id === school).grades.includes(Number(match[2]))) {
      return normalize({ links: [{ school, grade: Number(match[2]), subject: '' }] });
    }
    return normalize();
  }
  function schoolLabel(id) { return SCHOOLS.find(s => s.id === id)?.label || ''; }
  function linkLabel(link) { return `${schoolLabel(link.school)} ${link.grade}학년 · ${link.subject || '교과 미지정'}`; }
  function matches(program, filter = {}) {
    const c = forProgram(program);
    if (filter.kind === 'unclassified') return c.links.length === 0;
    if (filter.kind === 'test') return c.purpose === 'test';
    if (filter.kind && filter.kind !== 'all') return false;
    if (!filter.school && filter.grade === undefined && filter.subject === undefined) return true;
    return c.links.some(link => (!filter.school || link.school === filter.school)
      && (filter.grade === undefined || link.grade === Number(filter.grade))
      && (filter.subject === undefined || link.subject === filter.subject));
  }
  function searchText(program) {
    const c = forProgram(program);
    return [program?.title, program?.category, owns(program || {}, 'curriculum') ? '' : program?.grade, program?.description, c.topic,
      ...c.links.map(link => `${linkLabel(link)} ${{ elementary: '초', middle: '중', high: '고' }[link.school]}${link.grade}`),
      c.purpose === 'test' ? '테스트 검증용' : '수업용'].filter(Boolean).join(' ').toLocaleLowerCase('ko');
  }
  const api = { SCHOOLS, normalize, forProgram, schoolLabel, linkLabel, matches, searchText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Curriculum = api;
})(globalThis);
