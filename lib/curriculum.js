'use strict';
/* 레포로 관리하는 교육과정 시드.
 * 콜드스타트 때 프로그램·차시·교안 링크를 "한 번만" 자동 생성한다(마커로 재시드 방지).
 * → 교안 파일(public/lessons/*)과 함께 푸시하면 배포 시 사이트에 자동 연결된다.
 *
 * 규칙:
 *  - 이미 같은 제목의 프로그램이 있으면 건드리지 않음(수동 편집 존중).
 *  - 시드는 최초 1회. 이후 라벨·공개여부 등은 사이트에서 자유롭게 수정.
 *  - 새 차시/교안을 나중에 추가할 때는 이 파일에 넣고 slug의 마커를 올리거나,
 *    사이트에서 직접 링크를 추가한다.
 */

const CURRICULUM = [
  {
    slug: '초2-인공지능-v1',
    title: '인공지능 융합수업',
    grade: '초2',
    category: '인공지능',
    description: '## 소개\n초등 2학년 인공지능 융합 수업입니다. 차시마다 선생님용 수업 슬라이드와 학생용 체험을 담았습니다.',
    published: true,
    lessons: [
      {
        title: '1차시 인공지능이해',
        links: [
          { label: '선생님용 수업슬라이드', url: '/lessons/초2-인공지능/1차시-선생님용-인공지능과의첫만남.html' },
        ],
      },
      {
        title: '2차시 소리로 소통하는 나와 AI',
        links: [
          { label: '선생님용 수업슬라이드', url: '/lessons/초2-인공지능/2차시-선생님용-소리로소통하는나와AI.html' },
          { label: '학생용 사람vsAI 체험', url: '/lessons/초2-인공지능/2차시-학생용-사람vsAI.html' },
        ],
      },
      {
        title: '3차시 자연을 관찰하는 AI의 눈',
        links: [
          { label: '선생님용 수업슬라이드', url: '/lessons/초2-인공지능/3차시-선생님용-자연을관찰하는AI의눈.html' },
          { label: '학생용 감각짝맞추기 체험', url: '/lessons/초2-인공지능/3차시-학생용-감각짝맞추기.html' },
        ],
      },
      {
        title: '4차시 데이터가 뭐예요?',
        links: [
          { label: '선생님용 수업슬라이드', url: '/lessons/초2-인공지능/4차시-선생님용-데이터가뭐예요.html' },
          { label: '학생용 데이터분류와그래프 체험', url: '/lessons/초2-인공지능/4차시-학생용-데이터분류와그래프.html' },
        ],
      },
    ],
  },
];

// q/one 은 db.js에서 주입 (순환 참조 방지)
async function seedCurriculum({ q, one }) {
  for (const c of CURRICULUM) {
    const marker = `seed:${c.slug}`;
    if (await one('SELECT 1 FROM settings WHERE key = $1', [marker])) continue; // 이미 시드함
    // 같은 제목 프로그램이 이미 있으면(수동 생성 등) 시드하지 않고 마커만 남김
    const exists = await one('SELECT id FROM programs WHERE title = $1', [c.title]);
    if (exists) {
      await q('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [marker, '1']);
      continue;
    }
    const prog = await one(
      'INSERT INTO programs (title, category, grade, description, published) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [c.title, c.category || '', c.grade || '', c.description || '', !!c.published]
    );
    let pos = 0;
    for (const [i, ls] of c.lessons.entries()) {
      const lesson = await one(
        'INSERT INTO lessons (program_id, position, title) VALUES ($1, $2, $3) RETURNING id',
        [prog.id, i, ls.title]
      );
      for (const l of ls.links) {
        await q(
          'INSERT INTO program_links (program_id, lesson_id, position, kind, label, url) VALUES ($1, $2, $3, $4, $5, $6)',
          [prog.id, lesson.id, pos++, 'aiapp', l.label, l.url]
        );
      }
    }
    await q('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [marker, '1']);
    console.log(`교육과정 시드: ${c.title} (${c.grade}) — 차시 ${c.lessons.length}개 생성`);
  }
}

module.exports = { seedCurriculum, CURRICULUM };
