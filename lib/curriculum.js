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
  "slug": "초1-인공지능-v1",
  "title": "1학년 인공지능 융합수업 · 나의 하루",
  "grade": "초1",
  "category": "인공지능",
  "description": "## 소개\n초등 1학년 2학기 인공지능 융합 수업 1~5차시입니다. 말하기·선택·그림 중심으로 구성했습니다.\n\n각 차시에서 교사용 진행 안내와 학생 활동을 열 수 있으며, 활동지·저장 관리에서 학교명을 바꿔 인쇄할 수 있습니다.",
  "published": true,
  "lessons": [
    {
      "title": "1차시 반가워, 인공지능!",
      "links": [
        {
          "label": "선생님용 수업슬라이드",
          "url": "/lessons/초1-인공지능/1차시-선생님용.html"
        },
        {
          "label": "학생용 활동 · 활동지",
          "url": "/lessons/초1-인공지능/1차시-학생용.html"
        }
      ]
    },
    {
      "title": "2차시 인공지능이 배우는 자료",
      "links": [
        {
          "label": "선생님용 수업슬라이드",
          "url": "/lessons/초1-인공지능/2차시-선생님용.html"
        },
        {
          "label": "학생용 활동 · 활동지",
          "url": "/lessons/초1-인공지능/2차시-학생용.html"
        }
      ]
    },
    {
      "title": "3차시 그림으로 소개하는 나의 하루",
      "links": [
        {
          "label": "선생님용 수업슬라이드",
          "url": "/lessons/초1-인공지능/3차시-선생님용.html"
        },
        {
          "label": "학생용 활동 · 활동지",
          "url": "/lessons/초1-인공지능/3차시-학생용.html"
        }
      ]
    },
    {
      "title": "4차시 기억에 남는 하루를 그려요",
      "links": [
        {
          "label": "선생님용 수업슬라이드",
          "url": "/lessons/초1-인공지능/4차시-선생님용.html"
        },
        {
          "label": "학생용 활동 · 활동지",
          "url": "/lessons/초1-인공지능/4차시-학생용.html"
        }
      ]
    },
    {
      "title": "5차시 나의 그림일기를 소개해요",
      "links": [
        {
          "label": "선생님용 수업슬라이드",
          "url": "/lessons/초1-인공지능/5차시-선생님용.html"
        },
        {
          "label": "학생용 활동 · 활동지",
          "url": "/lessons/초1-인공지능/5차시-학생용.html"
        }
      ]
    }
  ]
},
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
          { label: '학생용 AI 퀴즈 체험', url: '/lessons/초2-인공지능/1차시-학생용-AI퀴즈.html' },
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
      {
        title: '5차시 그래프 탐정',
        links: [
          { label: '선생님용 수업슬라이드', url: '/lessons/초2-인공지능/5차시-선생님용-그래프탐정.html' },
          { label: '학생용 그래프탐정 체험', url: '/lessons/초2-인공지능/5차시-학생용-그래프탐정.html' },
        ],
      },
      {
        title: '6차시 나만의 AI 만들기',
        links: [
          { label: '선생님용 수업슬라이드', url: '/lessons/초2-인공지능/6차시-선생님용-나만의AI만들기.html' },
          { label: '학생용 가르치는기계 체험', url: '/lessons/초2-인공지능/6차시-학생용-가르치는기계.html' },
        ],
      },
      {
        title: '7차시 착한 AI, 바르게 쓰기',
        links: [
          { label: '선생님용 수업슬라이드', url: '/lessons/초2-인공지능/7차시-선생님용-착한AI바르게쓰기.html' },
          { label: '학생용 착한AI판단왕 체험', url: '/lessons/초2-인공지능/7차시-학생용-착한AI판단왕.html' },
        ],
      },
      {
        title: '8차시 AI와 함께하는 우리 하루',
        links: [
          { label: '선생님용 수업슬라이드', url: '/lessons/초2-인공지능/8차시-선생님용-AI와함께하는우리하루.html' },
          { label: '학생용 꿈의AI만들기 체험', url: '/lessons/초2-인공지능/8차시-학생용-꿈의AI만들기.html' },
        ],
      },
    ],
  },
  {
    slug: '초5-사회AI-삼국가야-v1',
    title: '5학년 사회·인공지능 융합수업 · 삼국과 가야 생활 탐구실',
    grade: '초5',
    category: '인공지능',
    description: '## 소개\n초등 5학년 사회 · 인공지능 융합 수업 1~10차시입니다. 비상교육 사회 5-2(2022 개정) 25~31쪽 「삼국과 가야의 생활 모습」과 연계합니다.\n\n유물 사진을 모으고 분류하는 활동으로 시작해, 모둠별 온라인 역사관을 만들고 서로 검증한 뒤 발표하는 흐름입니다(Look → Explore → Act → Practice).\n\n차시마다 선생님용 수업자료와 학생용 활동이 따로 열립니다. 자료실·박물관·연구 노트는 학생 활동 화면 안에서 이동할 수 있습니다.',
    published: true,
    lessons: [
      {
        title: '1차시 삼국과 가야에 대한 궁금증 발견하기',
        links: [
          { label: '선생님용 수업자료', url: 'https://5class.vercel.app/#lesson/1' },
          { label: '학생용 활동', url: 'https://5class.vercel.app/#activity/1' },
        ],
      },
      {
        title: '2차시 우리 질문 조사와 유물 설명 검증',
        links: [
          { label: '선생님용 수업자료', url: 'https://5class.vercel.app/#lesson/2' },
          { label: '학생용 활동', url: 'https://5class.vercel.app/#activity/2' },
        ],
      },
      {
        title: '3차시 우리 모둠의 유물 자료 모으기',
        links: [
          { label: '선생님용 수업자료', url: 'https://5class.vercel.app/#lesson/3' },
          { label: '학생용 활동', url: 'https://5class.vercel.app/#activity/3' },
        ],
      },
      {
        title: '4차시 어떤 기준으로 나눌까?',
        links: [
          { label: '선생님용 수업자료', url: 'https://5class.vercel.app/#lesson/4' },
          { label: '학생용 활동', url: 'https://5class.vercel.app/#activity/4' },
        ],
      },
      {
        title: '5차시 유물과 사람은 어떻게 연결될까?',
        links: [
          { label: '선생님용 수업자료', url: 'https://5class.vercel.app/#lesson/5' },
          { label: '학생용 활동', url: 'https://5class.vercel.app/#activity/5' },
        ],
      },
      {
        title: '6차시 설명 속에 어떤 말이 많이 나올까?',
        links: [
          { label: '선생님용 수업자료', url: 'https://5class.vercel.app/#lesson/6' },
          { label: '학생용 활동', url: 'https://5class.vercel.app/#activity/6' },
        ],
      },
      {
        title: '7차시 우리 모둠 역사관을 설계하자',
        links: [
          { label: '선생님용 수업자료', url: 'https://5class.vercel.app/#lesson/7' },
          { label: '학생용 활동', url: 'https://5class.vercel.app/#activity/7' },
        ],
      },
      {
        title: '8차시 근거가 있는 역사관을 만들자',
        links: [
          { label: '선생님용 수업자료', url: 'https://5class.vercel.app/#lesson/8' },
          { label: '학생용 활동', url: 'https://5class.vercel.app/#activity/8' },
        ],
      },
      {
        title: '9차시 다른 모둠 역사관을 검증하자',
        links: [
          { label: '선생님용 수업자료', url: 'https://5class.vercel.app/#lesson/9' },
          { label: '학생용 활동', url: 'https://5class.vercel.app/#activity/9' },
        ],
      },
      {
        title: '10차시 우리 역사관을 소개합니다',
        links: [
          { label: '선생님용 수업자료', url: 'https://5class.vercel.app/#lesson/10' },
          { label: '학생용 활동', url: 'https://5class.vercel.app/#activity/10' },
        ],
      },
    ],
  },
];

// q/one 은 db.js에서 주입 (순환 참조 방지)
// academy=true(전환 모드): settings 가 hub 뷰라 ON CONFLICT 를 쓸 수 없다 — INSTEAD OF INSERT 트리거가 upsert 한다.
async function seedCurriculum({ q, one, academy = false }) {
  const mark = (key) => q(
    academy
      ? 'INSERT INTO settings (key, value) VALUES ($1, $2)'
      : 'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
    [key, '1']);
  for (const c of CURRICULUM) {
    const marker = `seed:${c.slug}`;
    if (await one('SELECT 1 FROM settings WHERE key = $1', [marker])) continue; // 이미 시드함
    // 같은 제목 프로그램이 이미 있으면(수동 생성 등) 시드하지 않고 마커만 남김
    const exists = await one('SELECT id FROM programs WHERE title = $1', [c.title]);
    if (exists) {
      await mark(marker);
      continue;
    }
    // 공개 여부는 따로 UPDATE 한다 — 전환 모드의 hub 뷰는 화면과 같은 컬럼 조합으로만 INSERT 를 받는다
    const prog = await one(
      'INSERT INTO programs (title, category, grade, description) VALUES ($1, $2, $3, $4) RETURNING id',
      [c.title, c.category || '', c.grade || '', c.description || '']
    );
    if (c.published) await q('UPDATE programs SET published = true WHERE id = $1', [prog.id]);
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
    await mark(marker);
    console.log(`교육과정 시드: ${c.title} (${c.grade}) — 차시 ${c.lessons.length}개 생성`);
  }

  // 최초 시드가 이미 끝난 프로그램에 "새로 추가된 교안 링크"만 보충한다.
  // - 넣기만 함(insert-only): 기존 링크·라벨·순서·수동 편집은 절대 건드리지 않음.
  // - 판단 기준은 url. 같은 url이 이미 연결돼 있으면 건너뜀 → 몇 번 배포돼도 안전(멱등).
  await ensureCurriculumLinks({ q, one });
}

// 시드로 만든 프로그램에 CURRICULUM의 링크 중 빠진 것을 채운다(추가만).
// 프로그램마다 딱 2번의 SELECT로 현재 상태를 메모리에 올린 뒤, 빠진 것만 INSERT한다.
// → 콜드스타트 왕복(round-trip)을 최소화해 서버리스 타임아웃으로 일부 차시만 생기는 문제를 방지.
async function ensureCurriculumLinks({ q, one }) {
  for (const c of CURRICULUM) {
    const prog = await one('SELECT id FROM programs WHERE title = $1', [c.title]);
    if (!prog) continue;

    // 현재 상태를 한 번에 로드
    const lessonRows = await q('SELECT id, title, position FROM lessons WHERE program_id = $1', [prog.id]);
    const linkRows = await q('SELECT url, position FROM program_links WHERE program_id = $1', [prog.id]);
    const lessonByTitle = new Map(lessonRows.map((r) => [r.title, r.id]));
    const urls = new Set(linkRows.map((r) => r.url));
    let lessonPos = lessonRows.reduce((m, r) => Math.max(m, Number(r.position)), -1);
    let linkPos = linkRows.reduce((m, r) => Math.max(m, Number(r.position)), -1);

    for (const ls of c.lessons) {
      // 차시(레슨) 없으면 생성 — 커리큘럼에 새 차시를 추가하면 배포 시 자동 생성
      let lessonId = lessonByTitle.get(ls.title);
      if (!lessonId) {
        const created = await one(
          'INSERT INTO lessons (program_id, position, title) VALUES ($1, $2, $3) RETURNING id',
          [prog.id, ++lessonPos, ls.title]
        );
        lessonId = created.id;
        lessonByTitle.set(ls.title, lessonId);
        console.log(`차시 보충: ${c.title} / ${ls.title} 생성`);
      }
      for (const l of ls.links) {
        if (urls.has(l.url)) continue; // 이미 연결됨(url 기준) → 멱등
        await q(
          'INSERT INTO program_links (program_id, lesson_id, position, kind, label, url) VALUES ($1, $2, $3, $4, $5, $6)',
          [prog.id, lessonId, ++linkPos, 'aiapp', l.label, l.url]
        );
        urls.add(l.url);
        console.log(`교안 링크 보충: ${c.title} / ${ls.title} → ${l.label}`);
      }
    }
  }
}

module.exports = { seedCurriculum, ensureCurriculumLinks, CURRICULUM };
