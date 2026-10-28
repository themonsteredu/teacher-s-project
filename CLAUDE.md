# CLAUDE.md

**모아허브(MoaHub)** — `hub.moakit.ai`. 모아킷의 선생님 수업자료 허브다.
모아킷은 사업자명이자 우산 브랜드이고, 모아허브는 그 안의 사업 분야다. **독립 업체로 읽히면 안 된다.**

프로젝트 전체 맥락(기능·데이터 구조·회수권 설계·운영 정책)은 **`인수인계서.md`** 와 `README.md`에 있다. 여기 옮겨 적지 않는다. 이 문서는 그 뒤에 바뀐 것과 작업 규칙만 적는다.

## 배포

- Vercel 프로젝트 `teacher-s-project` (팀 `themonsteredu`)
- **프로덕션 브랜치는 `main`이 아니라 `claude/wonderful-babbage-ihufst`다.** PR base를 여기로 잡아야 배포된다
- 형제 레포: `themonsteredu/pinpoint`(모아킷 홈 `moakit.ai`, 브랜드 원본), `themonsteredu/aiapp`(모아랩 `job.moakit.ai`)
- **수업 콘텐츠는 레포가 따로다.** 허브 프로그램에 붙는 활동지 PDF 는 이 레포가 아니라 그쪽에 있다 — 예: `themonsteredu/culture_bosung`(보성초 2학년 AI 교재 · `culture-bosung.vercel.app`). 여기 `public/lessons/` 만 보고 "활동지가 없다"고 답하지 않는다. 실제로 한 번 그렇게 잘못 답했다
- **함수 리전은 `vercel.json`의 `regions: ["icn1"]`(서울)이 정한다.** 2026-09-10 확인: 직접 배포(CLI/MCP 번들)로 올린 프로덕션(`dpl_CipQ…`)이 `iad1`(미국 동부)에서 실행돼 로그인·비밀번호 변경이 요청마다 수 초씩 걸렸다. 배포 뒤에는 `get_deployment`의 `regions`가 `icn1`인지 확인한다 — 함수는 DB와 같은 리전에 둔다(이 계정의 Supabase 프로젝트는 모두 서울 `ap-northeast-2`)
- 원래 DB인 Supabase `lesson-hub` 프로젝트는 2026-09-10 기준 INACTIVE(일시정지)였는데 프로덕션 로그인은 됐다 → `DATABASE_URL`이 다른 DB를 가리킨다. 어느 DB인지는 Vercel 환경변수에서만 알 수 있다(MCP로는 안 보임). 관리자 계정은 그 DB에 새로 시드된 `superadmin`이었다

## 주소 구조 (바뀐 부분)

원래는 모든 경로를 `index.html`로 넘기는 캐치올이었고 루트에 로그인 화면이 그대로 나왔다. 지금은 갈라져 있다.

| 주소 | 내용 |
|---|---|
| `/` | 모아허브 소개 랜딩 (`public/index.html` — 단일 파일, CSS·스크립트 인라인) |
| `/app`, `/app/*` | 기존 허브 SPA (`public/app.html` + `public/app.js`) |
| `/app#/board/<6자리코드>` | 학생 활동 보드 (로그인 없이 접근) |
| `/api/*` | Vercel Node 서버 (`server.js` → `lib/api.js`, 공개 pathname 유지) |

- 라우팅 변경 시 **`vercel.json`과 `server.js`를 함께 확인**한다. `framework: node`는 `server.js`를 실행하므로 일반 `/api/*`를 `/api/index`로 rewrite하지 않는다. Career Log 전용 rewrite는 일반 API보다 먼저 처리한다
- 해시 라우팅이라, 랜딩 `<head>`에 `#/`로 시작하는 해시만 `/app`으로 넘기는 스크립트를 둬서 예전 링크를 살린다. 페이지 내부 앵커(`#what` 등)는 건드리지 않는다
- `/lessons/*`는 발표 iframe에 같은 출처로 임베드되므로 `X-Frame-Options: SAMEORIGIN` — `server.js`의 예외 처리를 지운다면 발표 화면이 깨진다

## 이름

서비스명은 **모아허브(MoaHub)** 로 통일했다. 예전 이름 `수업프로그램 허브`가 남아 있으면 갱신 대상이다 (`public/app.js`의 상단바·로그인 로고·서비스 정보, `app.html` 타이틀, `server.js` 기동 로그, `package.json`).

## 브랜드

- 심볼: `public/brand/moakit-symbol.svg` — pinpoint와 같은 파일
- 기본색은 모아킷 티일(`--teal #17b6a0` / `--teal-deep #0a6f61` — 딥 값은 텍스트도 겸하므로 6.07:1). **제품별 색 규칙은 접었다** — 예전에는 "허브 = 오렌지"였지만, 제품 구분은 색이 아니라 티일 명도 단계로 한다
- **따뜻한 색은 행동 유도 한 곳에만.** `--accent` 는 테라코타 `#b04a12`(진한 값 `#8f3a0d`)이고 로그인·허브 열기 같은 주 행동 버튼에 흰 글자로 쓴다(5.48:1). 예전 오렌지 `#ff8a3d`는 흰 글자가 2.35:1이라 CTA 로 못 쓴다
- 새 강조색을 만들지 않는다 — 화면에 남는 색은 티일 계열 + 테라코타뿐이다
- 헤더 워드마크 옆 `by MoaKit`, 헤더 CTA에 모아킷 홈, 푸터에 형제 제품 링크와 **모아킷 사업자 정보**(상호·대표·사업자등록번호·이메일)가 있어야 한다
- 한글은 `word-break: keep-all` 필수

## 랜딩 히어로

우측 카드는 **실제 화면 캡처가 아니라** 프로그램에 담기는 것(수업 링크·웹앱/영상·첨부자료·학생 활동 보드)을 보여주는 도식이다. 허브 화면 캡처가 준비되면 교체한다. 캡처로 바꿀 때는 모아랩(`aiapp`)의 `public/brand/showcase/` 규격(800×500, 16:10)을 따르면 두 사이트가 같은 결이 된다.

성과 수치처럼 확인되지 않은 값은 넣지 않는다.

## 학생 계정 (모아랩 공통)

- 학교 학생 계정(`lib/student-accounts/`, 중앙 테이블 `moakit_accounts`)은 모아랩(`aiapp`)도 같은 아이디·비밀번호로 받는다. 진로기록 `student_id`는 계정의 `career_student_id`라서 학교 수업·진로 수업 기록이 한 학생으로 모인다. 자세한 건 `docs/student-accounts.md` 2026-09-12 항목과 aiapp `docs/job-career-log.md`
- 비밀번호 형식(`scrypt1`)·잠금 규칙(`login_limits`)을 바꾸면 aiapp `lib/school-accounts.js`도 같이 바꿔야 한다
- 학생 화면(`public/student-accounts.js`)의 기록 목록에는 모아랩 기록(`source='job'`)도 나온다
- **모아랩 진로 관찰 기록**(`raw_data.job.entry_kind='career_observation'`, 정정본은 `observation_kind`)은 `artifact` 칸이 "드러난 강점·흥미"라서 그대로 두면 관찰 내용이 제목이 된다. `observationOf()`로 가려내 제목은 `job.title`을 쓰고, 강점·다음 활동은 **진로 강사가 쓴 내용**으로 이름표를 붙인다(`내가 남긴 생각` 아님 — 관찰은 학교 선생님이 아니라 수업에 찾아온 진로 강사가 쓴다. 표시는 `진로 강사 관찰`·`강사가 본 나의 강점·흥미`). 쓴 사람 줄은 `writerOf()` — 담당자가 쓴 기록(관찰·담당자 기록, 정정본은 `program_ref`로 가린다)은 `작성: job.author_name`, 정정됐으면 ` · 정정: job.revised_by_name`을 붙이고, 학생 글을 담당자가 고친 정정본은 `정정: job.revised_by_name`만 보인다(모아랩 정정은 `author_name`을 처음 쓴 사람 그대로 두고, 학생 글 정정본에는 넣지 않는다). 예전 정정본(`revised_by_name` 없음)은 `author_name`이 고친 사람이라 `정정:`으로 읽는다. 관찰 기록에 `job.deck_title`이 있으면 `웹앱:` 줄을 붙인다 — 웹앱 이름을 관찰 기록 제목으로 쓰지 않는다. 활동 사진은 모아랩에만 있다(aiapp `career_record_photos`). 같은 규칙을 모아랩 학생 화면(`#/career-records`)이 aiapp `public/career-log-ui.js`의 `recordHeading`·`recordDeckLine`·`recordWriter`로 쓰고(담당자 기록 화면도 `recordWriter`), 목록 API(`lib/career-log.js`)가 `title`과 `deck_title`, 정정본의 `revised_by_name`을 따로 내려 준다. 모아랩은 쓴 사람·웹앱을 한 줄로 잇고 여기는 줄을 나눈다 — 배치만 다르고 문구는 같다. 표시 규칙을 바꾸면 aiapp 쪽도 맞춘다 — 설계는 aiapp `docs/job-career-log.md` 2026-10-02 항목(표시 문구)
- 모아랩도 같은 계정을 발급한다(issuer `moakit-lab`). 학교를 다른 제품에 여는 표는 `moakit_accounts.school_access` — 정의 `db/moakit-accounts-0002-school-access.sql`. 관리 화면의 `모아랩에 열기` 체크박스가 그 스위치이고, 이 값은 **모아랩 쪽 권한**을 연다
- **모아허브 관리자(`role='admin'`)는 모든 학교를 제한 없이 관리한다** (2026-09-15). `service.js`의 `authorize()`는 관리자면 담당자(`managers`)·열기(`school_access`) 조회 없이 통과시키고, `schools()`도 관리자에게 전체 목록을 준다. 교사는 예전대로 담당자로 지정된 학교만 만진다
- 관리자 경로도 **학교 존재 확인(`SELECT 1 FROM schools … FOR SHARE`)은 남긴다.** 이게 없으면 없는 학교 UUID 가 403 대신 알 수 없는 오류로 터진다
- `schools()`의 `via` 는 세 값이다 — `manager`(담당자 지정) · `open`(다른 제품이 열어 줌) · `admin`(관리자 권한으로만 보임). 예전 두 값 시절에는 관리자에게 보이는 모든 학교가 `open` 으로 찍혀, 모아허브가 직접 만든 학교에도 "모아랩에서 열어 주었다"는 거짓 안내가 나왔다
- 모아허브 관리자가 넓어진 만큼 **모아랩(`aiapp`) 쪽은 그대로다** — 모아랩 관리자는 여전히 담당자 지정이나 `school_access` 가 있어야 한다. 한쪽만 넓힌 상태라는 것을 알고 있어야 한다

## 학생 입장 — 참여 코드만으로 들어오는가 (2026-09-23)

학생이 참여 코드를 넣었는데 계정 로그인을 또 요구한다는 신고가 있었다. 원인은 둘이었다.

- **학교가 연결된 수업(`sb:config:` 의 `career.schoolId`)은 학생 계정 로그인이 필요하다** — 이건 설계다. 진로기록 저장을 꺼도(`career.enabled=false`) 학교는 남고 로그인도 계속 필요하다("조용히 공개 수업이 되지 않게"). 문제는 **되돌릴 방법이 화면에 없던 것**이었다. `saveSettings` 가 `career.disconnect === true`(진로기록을 끈 상태 + 학교 비움 + 해당 학교 담당 권한)일 때만 연결을 해제한다. 다른 학교로 갈아타는 것은 예전대로 409. 교사 화면에는 상태 안내(`.sbt-gate`)와 `학생 계정 연결 해제` 버튼이 있고, 누르면 "코드만 알면 누구나 제출할 수 있다"고 확인을 받는다
- **계정이 필요 없는 수업에서 기기에 남은 학생 세션이 입장을 막았다.** `resolveStudent()` 는 만료·해지 세션에 401을 던지는데 `accountFor()` 가 그대로 올려 보내, 공유 태블릿으로 참여 코드를 넣은 학생이 이유 없이 로그인 화면에 걸렸다. 지금은 **학교가 연결되지 않은 수업에서만** 이 실패를 삼키고 손님으로 들여보낸다(연결된 수업은 그대로 막는다)

## 관리자 전권 (2026-09-15)

관리자가 시험용으로 만든 수업을 지우지 못해 막힌 적이 있다. 원인은 두 가지였고 둘 다 풀었다.

- `lib/api.js`의 `authorizeSchoolBoard()`는 **관리자면 학교 확인을 건너뛴다.** 수업에 연결된 학교가 이미 삭제됐거나 학생 계정 연결이 잠시 안 될 때(503)도 관리자가 수업을 못 지우는 일이 없다. 교사는 그대로 학교 담당자여야 한다
- `noPendingCareer()`도 **관리자는 예외다.** 다만 건너뛰지 않고 **건수를 세어** 이용 기록에 `careerPending=N` 으로 남긴다 — 그냥 통과시키면 몇 건이 사라졌는지 아무도 모른다. 교사에게는 여전히 409로 막힌다. 삭제 확인 문구에도 "아직 저장되지 않은 진로기록"이 사라진다고 적혀 있다
- **수업을 지우면 그 수업에 딸린 `sb:` settings 행도 함께 지운다** (`purgeBoardSettings`). `settings` 에는 `boards` 로 향하는 외래키가 없어서, 예전에는 `sb:config:`·`sb:post:`(학생 이름·제출 내용·첨부 경로 포함)·`sb:session:`·`sb:upload:`·`sb:event:` 가 주인 없이 영원히 남았다. `board_posts` 가 아직 살아 있어야 `sb:post:` 를 찾을 수 있으므로 **수업 행을 지우기 전에** 돌린다. `sb:rate:` 는 접속 IP 단위라 대상이 아니다
- 프로그램 삭제(`DELETE /api/programs/:id`)는 원래 관리자 전용이라, 이 변경 뒤로는 학교 확인이 사실상 돌지 않는다 — 의도된 결과다

## 학생 제출물 — 한 제출에 사진 여러 장 (2026-09-15)

활동지를 앞뒤로 찍으면 두 장인데 한 장만 올라갔다. 이제 한 제출에 **최대 5장**이다.

- **첫 장은 예전대로 `board_posts` 에 남고, 전체 목록은 `sb:post:<id>` 메타의 `attachments`에 있다.** `board_posts` 에 칸을 늘리지 않은 이유는 전환 모드(`ACADEMY_ID`)에서 이 테이블이 `hub` 호환 뷰라 마이그레이션이 돌지 않기 때문이다. 옛 제출은 메타에 목록이 없으므로 `attachmentsOf()` 가 `board_posts` 한 칸으로 한 장짜리 목록을 만든다 — 읽는 쪽은 전부 이 함수를 쓴다
- **지울 때는 `storagePathsOf()` 로 모아야 한다.** 두 번째 장부터는 `board_posts` 에 경로가 없어서, `SELECT storage_path FROM board_posts` 만 보면 사진이 저장소에 남는다 (프로그램 삭제·수업 삭제는 `boardAttachmentPaths()`, 제출물 하나 삭제는 직접). `career-originals/` 는 저장된 진로기록이 가리키는 원본이라 `storage.removeObject` 가 애초에 거부한다
- 제출물 하나를 지우면 `sb:post:` 행도 함께 지운다 — 예전에는 남았다
- 첨부 열람 주소 끝에 몇 번째 장인지 붙는다: `/api/posts/:id/download/:i`, `/api/join-board/:code/submission-file/:id/:i`, `.../career-records/:id/file/:i`. 번호를 빼면 첫 장이라 예전 링크도 산다
- 진로기록 스냅샷은 `attachment`(첫 장)를 그대로 두고 `attachments`(전체)를 더한다. **모아랩 표시가 `attachment` 를 읽으므로 그 칸을 없애면 안 된다**
- 한 장이라도 검증에 걸리면 제출 전체가 롤백된다(같은 트랜잭션). 학생은 올린 사진을 다시 쓸 수 있다
- 학생 화면은 고른 장을 이어 붙이고(사진 찍기를 여러 번 눌러도 쌓인다), 통신이 끊기면 **이미 올린 장은 건너뛰고 남은 장부터** 다시 올린다(`snapshot.uploadIds` 가 그 표시). `SB_MAX_FILES` 는 `lib/student-board.js` 의 `MAX_FILES` 와 같아야 한다

## 수업 보드 사진 모아 인쇄 (2026-10-27)

보성초 선생님 요청: 아이들이 낸 그림(8차시 '그림 카드' — 내 그림과 오토드로우 그림을 한 장으로 만든 것)을 반 전체 한꺼번에 인쇄하고 싶다.

- `#/boardview/:id` 에 **사진 모아 인쇄** 단추(보드 관리자 + 파일이 있을 때). 학생 이름순, 같은 학생은 낸 차례대로, 한 쪽에 두 칸(이름 · 차시 꼬리표). **한 제출에 사진이 여러 장이면 두 장씩 한 칸에 나란히** — 이미 종이에 그린 아이는 활동지 사진과 오토드로우 화면을 한 번에 두 장 올리면 인쇄에서 짝이 된다. 사진이 있는 차시가 둘 이상이면 차시를 고르게 한다. 문서 파일은 뺀다
- 화면 인쇄는 기본으로 막혀 있으므로(`@media print { body > #app { display:none } }`) **인쇄할 사진만 담은 `#photo-print` 를 body 에 붙이고 `body.photo-print` 일 때만 그것을 찍는다.** `afterprint` 에서 둘 다 지운다. 내보내기 화면의 `allow-print` 와 섞지 않는다
- 미리보기 주소는 만료되므로 단추를 누를 때마다 `/api/boards/:id/posts` 를 새로 받고, 사진을 다 불러온 뒤(최대 15초) 인쇄 창을 연다
- 묶기·꼬리표는 `photoLessons()`·`photoPrintHtml()` (교사 카드 코드와 같은 구간이라 `tests/board-student-view.test.mjs` 가 떼어 시험한다)

## 수업 보드 — 선생님이 결과 보기 편하게 (2026-10-27)

선생님 말씀: "교사가 학생들이 올린 파일을 보는 게 너무 불편하게 돼 있더라", 담임선생님이 8차시 그림 파일을 내려받고 싶어 했다.

- **제출물이 있으면 제출물 칸을 참여 코드·제출 현황 바로 아래로 올린다.** 차시별 제출 설정·수업자료 카드는 그 아래로 내려간다(제출물이 없을 때는 예전 차례). 예전에는 한 화면 넘게 내려가야 아이들 것이 보였다
- 보기 방식에 **사진 크게**를 더했다(`moakit:boardview` 값 `photo`). 이름순으로 사진만 큰 바둑판에 두고, 누르면 `openGalleryLightbox` 가 크게 띄운다 — ←/→ 와 단추로 다음 아이, Esc·바깥으로 닫기, 그 장 `받기`. 기존 `.pc-img` 위임 확대는 다른 보기에서 그대로 쓴다
- **차시 고르기**(`postLessons`·`postsOfLesson`): 제출의 `sessionTitle` 이 둘 이상이면 칩이 나오고 세 보기 모두에 적용된다. 고른 차시는 저장하지 않는다
- **ZIP 받기**: 위쪽 `전체 다운로드`와 차시를 고르면 나오는 `이 차시만 받기(ZIP)` 가 `downloadZip` 으로 파일을 ZIP 하나에 담는다(`zipStore` — 압축 없이 담기, 이름은 UTF-8 표시 비트를 켬, 서버 `download-all` 이 준 `학생이름_번호_원래이름`). 서명 주소를 브라우저가 못 받으면(CORS·네트워크) 예전처럼 한 장씩 받기(`saveOneByOne`)로 물러난다. 예전 `downloadAll` 은 이것으로 바뀌었다
- 보드를 보고 받을 수 있는 사람: 수업을 만든 계정 + 관리자(`canManageBoard`) + **함께 보는 선생님**(아래)

## 함께 보는 선생님 — 담임선생님 보기 (2026-10-27)

선생님 요청: "담임선생님도 볼 수 있게". 링크 공유 대신 계정 방식으로 정했다(링크는 새면 아이 이름·그림이 누구에게나 보인다).

- 수업 화면의 **함께 보는 선생님** 카드에서 수업을 연 선생님(또는 관리자)이 모아허브 **아이디**로 더한다. 저장은 `settings` 의 `sb:viewers:<보드>` (사용자 id JSON 배열, 20명까지). 수업을 지우면 `purgeBoardSettings` 가 함께 지운다
- 함께 보는 선생님은 `boardAccess()` 가 `'view'` 를 준다 — **제출물 보기·전체/한 장 받기·사진 모아 인쇄만.** 공개·숨김·삭제·마감·설정·명단·함께 볼 사람 정하기는 그대로 `canManageBoard` 다. 보기 응답에 `viewOnly: true`, 화면에 보기 전용 안내
- 함께 보는 선생님에게는 학교 담당자 확인을 하지 않는다(`teacherPosts` 의 `opts.viewer`) — 대신 **넘겨준 선생님이 지금도 볼 수 있어야 한다**(`ownerStillAllowed`: 계정이 있고, 쉬는 계정이 아니고, 그 수업의 학교 권한이 있음). 넘겨준 쪽이 권한을 잃으면 함께 보기도 멈춘다. 빼기(`DELETE /viewers/:id`)는 학교 권한을 잃은 뒤에도 된다
- `GET /api/my-boards` 에 함께 보는 수업이 `shared: true` 로 섞인다. `내 수업` 화면은 관리자 문구(`전체 수업`)를 관리자에게만 쓰고, 함께 보는 수업 카드에는 이름 수정·삭제 단추가 없다
- 같은 변경에서: 제출물 기본 상태(선생님만 열람)는 흐리게 하지 않는다(`is-hidden` 은 숨긴 일반 게시물만), `.sb-grid` 를 신문 단에서 줄 맞춘 바둑판으로, 보기 이름 `이름별 · 사진 크게 · 올린 순서` 와 기본 `이름별`(아이마다 한 칸 바둑판)

## 도구함 — 웹사이트 주소 (2026-10-28)

원장님 요청: 패들렛·캔바·오토드로우 같은 사이트 주소를 도구함에 모아 두고, 수업에 붙여 아이들이 학생 화면(`#/board/<코드>`)에서 바로 열게 하고 싶다.

- **웹사이트도 `tools` 표의 한 줄이다.** `mime = 'text/uri-list'`(`SITE_MIME`)가 표식이고 `size = 0`, `storage_path` 에 저장소 경로 대신 **주소**가 들어간다. 칸(kind·url)을 늘리지 않은 이유는 전환 모드(`ACADEMY_ID`)에서 `lib/db.js` 의 DDL 이 돌지 않기 때문이다. 넣는 칸도 웹앱 등록(`confirm`)과 같은 조합이다
- 주소 검사는 `siteUrl()` — 수업 링크 저장과 같은 `URL_RE`(https 만, 빈칸·꺾쇠·따옴표 불가)에 2000자·제어문자·`new URL` 해석·아이디/비밀번호 금지를 더했다. 화면의 `siteAddress()` 는 `padlet.com` 처럼 앞부분이 아예 없을 때만 `https://` 를 붙이고 `http://`·`javascript:` 는 받지 않는다
- `GET /api/tools` 는 줄마다 `kind: 'site' | 'app'` 를 싣고, 웹사이트만 `url` 을 준다. **웹앱의 `storage_path` 는 내보내지 않는다.** 웹사이트 삭제는 `storage.removeObject` 를 부르지 않는다(주소를 저장소 경로로 넘기게 된다). 주소 고치기(`PATCH`)는 웹사이트 줄만 받고, 실패하면 이름도 그대로 둔다
- **피커에서 웹사이트를 고르면 `/api/tools/:id/open` 이 아니라 주소를 그대로 복사한 보통 링크(`kind: 'link'`)가 붙는다**(`toolLink()`). 그래서 링크 저장 검사를 그대로 타고, 학생 화면에서도 보통 링크로 열리며, 도구함에서 지우거나 주소를 고쳐도 이미 붙인 수업은 예전 주소 그대로다 — 삭제 확인 문구가 이것을 알린다. 웹앱은 예전대로 `/api/tools/:id/open`
- **도구함 웹앱의 학생 경로** `GET /api/join-board/:code/tool/:id/open`: 교사 경로는 로그인이 있어야 해서 학생 태블릿에서는 401 이었다. 학생 파일 경로와 같은 관문(`siteClosed` → `authorizeAccess` → 열린 보드·공개 프로그램)을 거친 뒤, 그 보드의 `board_items`(`item_type='link'`)에 **주소가 글자 그대로 `/api/tools/<id>/open` 인 링크**가 있어야 연다(없으면 403 `not_shared`). 응답은 교사 경로와 같은 `sendTool()`. 화면은 `careerMaterialUrl()` 이 그 주소를 학생 경로로 바꾸므로 `studentMaterialsHtml` 과 학생 수업 화면(`student-board.js` 활동 링크)이 함께 고쳐진다

## 내 수업 — 반별로 묶기 (2026-10-28)

한 반(보성초 2학년 3반)이 커리큘럼(프로그램)을 여러 개 하면 프로그램마다 수업을 따로 열고 참여 코드도 따로다. 수업 이름에 반을 적어 두는 것만으로는 [내 수업]에서 같은 반 수업이 날짜마다 흩어졌다.

- **반 정보는 `settings` 의 `sb:class:<보드>`** (JSON `{school, grade, room}`)다. `boards` 에 칸을 늘리지 않은 이유는 전환 모드(`ACADEMY_ID`)에서 `boards` 가 뷰라 `lib/db.js` 의 DDL 이 돌지 않기 때문이다. 쓰기는 `saveBoardViewerIds()` 와 같은 방식(전환 모드는 평범한 INSERT, 아니면 `ON CONFLICT`)이고, 수업을 지우면 `purgeBoardSettings` 가 함께 지운다
- 정리는 `normClassInfo()` 한 곳: 학교 40자(빈칸 정리), 학년은 1~6 정수(`'2'`·`2`·`'2학년'`·`'초2'` 모두 받음, 그 밖은 `null`), 반은 끝의 `반`을 떼고 10자. 세 칸이 모두 비면 줄을 지운다(반 미지정). 화면의 `normClassFields()` 가 같은 규칙이고 `tests/class-groups.test.mjs` 가 두 쪽의 답을 맞춰 본다
- 새 수업(`POST /api/programs/:id/boards`)은 학교·학년·반을 받는다. 이름을 비우고 학년·반을 고르면 `2학년 3반 · <프로그램>` 이 붙는다(`autoBoardTitle` ↔ 화면 `autoClassTitle`, 학교는 넣지 않는다 — 묶음 제목에 이미 나온다). 반 저장만 실패하면 수업은 그대로 열고 `classSaved: false` 로 알린다 — 오류를 내면 선생님이 같은 수업을 또 만든다. `PATCH /api/boards/:id` 는 보낸 반 칸만 바꾼다
- `GET /api/my-boards` 는 줄마다 `classInfo`(없으면 `null`)를 settings 조회 **한 번**(`key=ANY`)으로 붙인다. `GET /api/boards/:id/posts` 의 `board.classInfo` 로 수업 화면 머리에 `보성초 · 2학년 3반` 이 나온다
- **묶음 열쇠는 `학교|학년|반`** — 학교가 들어가야 다른 학교의 2학년 3반과 섞이지 않는다. 차례는 학교(가나다, 학교 미지정은 뒤) → 학년 → 반(둘 다 숫자면 숫자 차례), 반 미지정은 맨 뒤. 한 반 안에서는 진행 중 → 프로그램 이름 → 최근 날짜. 학교가 둘 이상이면 학교 칩이 나온다. 묶기는 전부 브라우저에서 한다(`public/app.js` 의 `/* ---- 반별로 묶기 */` 구간 — 시험이 이 구간을 떼어 쓴다)
- 기본 보기는 **반별**이고 `날짜별`은 예전 날짜 묶음 그대로다. 고른 보기는 `localStorage['moakit:myclass']`, 새 수업의 학교 기본값은 `localStorage['moakit:lastSchool']`(지난번에 고른 학교)
- 반 미지정 줄에는 `[수업 정보 수정]` 자리에 `[반 정하기]` 가 나온다(같은 창을 반 칸부터 연다). 함께 보는 수업에는 수정·삭제·반 정하기가 없다. 자동 이름을 그대로 쓰던 수업은 반을 바꾸면 이름 칸도 따라 바뀐다
- **반 개설(아래 절) 이후 `sb:class` 에 `classId` 가 붙을 수 있다** — `{school, grade, room, classId}`. `parseClassInfo()` 는 `classId` 가 있을 때만 싣고(옛 수업의 모양은 그대로), 세 칸이 비어도 `classId` 가 있으면 줄을 지우지 않는다. `PATCH /api/boards/:id` 의 반 칸 고치기는 `classId` 를 지키고, `classId` 를 보내면 반에 붙이거나(null·'' 이면 뗀다) — 붙일 때는 반의 학교·학년·반을 그대로 받는다. `GET /api/my-boards`·`GET /api/boards/:id/posts` 의 `classInfo` 에도 `classId` 가 실린다
- 묶음 열쇠는 그대로 `학교|학년|반` 이다. 반 개설 화면에서 학교·학년·반을 고치면 서버가 그 반 과정들의 `sb:class` 를 함께 고쳐 묶음이 갈라지지 않는다

## 반 개설 — 반 먼저, 과정·도구는 나중에 (2026-10-28)

원장님 결정: `수업 열기` 를 프로그램 고르기로 시작하지 않는다. 선생님이 **반을 먼저 연다**(학교·학년·반), 그 뒤에 그 반이 쓸 **과정(프로그램)** 과 **도구함 도구(웹사이트·웹앱)** 를 더한다. 반마다 참여 코드는 **하나** — 아이들은 반 코드를 넣고 그 반의 과정·도구 목록에서 고른다. 예전 과정별(수업별) 코드는 그대로 산다.

- **전부 `settings` 줄이다**(전환 모드에서 `lib/db.js` DDL 이 안 돌므로 표·칸을 새로 만들지 않는다). 쓰기는 `saveSbRow()` — 전환 모드는 평범한 INSERT, 아니면 `ON CONFLICT`
  - 반: `sb:cls:<id>` (id = `crypto.randomBytes(6)` 16진수 12자) JSON `{id, school, grade, room, name, code, roster, tools: [도구 id…], isOpen, createdBy, createdAt}`. 학교·학년·반은 `normClassInfo()`. 이름표는 `classLabel()` = `name` 이 있으면 그것, 없으면 `2학년 3반`(학교는 따로 보인다)
  - 코드 색인: `sb:clscode:<코드>` → 반 id. `classByCode()` 는 색인이 가리키는 반이 있고 그 반의 `code` 가 같을 때만 믿는다 — 반 줄 쓰기가 끊겨 색인만 남아도 코드가 영영 막히지 않는다. 만들 때는 색인 → 반 줄(반 줄 실패 시 색인 거둠), 코드 바꿀 때는 새 색인 → 반 줄 → 옛 색인 지우기, 반을 지우면 색인도 지운다(자기 반을 가리킬 때만)
  - **반의 과정은 따로 적지 않는다.** 보드의 `sb:class` 에 `classId` 가 붙은 수업이 그 반의 과정이다(`classBoardIds()`). 수업을 지우면 `purgeBoardSettings` 가 `sb:class` 를 지우므로 반 쪽은 손댈 것이 없다
- **코드는 수업 코드와 반 코드를 통틀어 하나뿐이다.** 같은 규칙(`BOARD_CODE_RE`, 영문 소문자·숫자 4~10자)이고, 반을 만들·고칠 때는 `boards.code` 와 색인을, 수업을 만들 때(`createBoard()` — 예전 `POST /api/programs/:id/boards` 와 반 과정 더하기가 함께 쓴다)는 직접 넣은 코드든 자동 6자리든 반 코드도 피한다(`codeTaken()`)
- 교사 경로(반을 연 사람 또는 관리자 — `canManageClass`): `GET/POST /api/classes`(관리자는 전체 + `ownerName`), `GET/PATCH/DELETE /api/classes/:id`, `POST /api/classes/:id/curricula {programId}`, `PUT /api/classes/:id/tools {toolIds}`, 피커용 `GET /api/tool-library`(교사도 봄, 저장소 경로 없음 — `GET /api/tools` 는 관리자 전용 그대로)
  - 반을 만들려면 학년·반·반 이름 중 하나는 있어야 한다(이름표가 비지 않게). 고칠 때도 같다
  - 반의 학교·학년·반을 고치면 그 반 과정들의 `sb:class` 를 다시 쓰고, **반 명단을 고치면 과정들의 `boards.roster` 도 함께 바꾼다**(반 명단이 그 반 아이들 명단이다)
  - 과정이 남은 반은 지울 수 없다(409 `과정을 먼저 지우거나 다른 반으로 옮기세요`) — 과정에는 제출물이 있다
  - 과정 더하기는 `createBoard()` 로 보드를 만든다: 이름 `<반 이름표> · <프로그램>`(100자), 명단 = 반 명단, 자동 코드, `sb:class` = 반의 학교·학년·반 + `classId`. 교사는 비공개 프로그램을 못 넣는다(예전과 같은 규칙). 수업 주인(`created_by`)은 **반을 연 선생님** — 관리자가 대신 넣어도 그 선생님의 [내 수업]에 나온다
  - 도구: 숫자만, 같은 것은 한 번, 30개까지, 도구함에 있는 것만. 고른 차례가 학생 목록 차례다. 도구함에서 지운 도구는 목록에서 빠진다
- **학생 경로**(로그인 없음, `siteClosed` 먼저, `Cache-Control: no-store`)
  - `GET /api/join-class/:code` — 없는 코드 404 `class_not_found`, 닫힌 반(`isOpen=false`) 403 `class_closed`. 응답은 `{class: {label, school, grade, room}, curricula: [{title: 프로그램 이름, code: 수업 코드}], tools: [{id, title, kind, url(웹사이트만)}]}` — **열린 수업 + 공개 프로그램만**(`openBoardByCode` 기준과 같다). 이름·명단·선생님·내부 번호(도구 번호 말고)는 싣지 않는다. 과정을 누르면 예전 수업 화면 `#/board/<수업 코드>` 로 가서 기존 관문(학교 연결 수업의 학생 계정 등)을 그대로 탄다
  - `GET /api/join-class/:code/tool/:id/open` — 반이 열려 있고 그 도구가 반의 `tools` 에 있어야 연다(아니면 403 `not_shared`). 응답은 교사·수업 경로와 같은 `sendTool()`
  - 반을 닫아도(`isOpen=false`) 과정별 수업 코드는 각 수업의 마감 상태를 따른다 — 반 코드 입구만 닫힌다
- 같은 변경에서 #57 리뷰 반영: `sendTool()` 은 302 `Location` 에 `new URL(url).href`(한글 주소를 %인코딩)를 넣는다 — 한글을 머리에 그대로 넣으면 `ERR_INVALID_CHAR` 로 500 이었다. `tool_opened` 기록은 응답 머리를 쓴 뒤에 남긴다
- 시험: `tests/classes.test.mjs`

## 제출물 학생별 보기 (2026-09-15)

수업 중에는 시간순 바둑판이 맞지만, 끝난 뒤 평가할 때는 한 학생 것을 모아 봐야 한다. `#/boardview/:id` 에 **시간순 · 학생별** 전환을 두었다.

- 같은 학생인지는 **학생 계정(`studentKey` = 메타의 `accountId`)** 으로 본다. 계정 없이 낸 옛 제출만 이름으로 묶으므로, 동명이인을 가르려면 학생 계정으로 참여해야 한다
- 명단(`roster`)에 있는데 한 장도 안 낸 학생은 뒤에 `아직 제출 없음` 으로 따로 나온다
- 고른 보기 방식은 `localStorage['moakit:boardview']` 에 남는다. 서버는 이 구분을 모른다 — 묶기는 전부 브라우저에서 한다

## 학교별 활동지 머리글

- 활동지(인쇄용 `<article class="sheet">`가 있는 `/lessons/**.html`)는 `<head>`에 `<script defer src="../_shared/worksheet-header.js"></script>` 한 줄을 넣으면 `?school=<학교코드>`(예: `?school=boseong`)로 열릴 때 맨 위가 그 학교 양식(왼쪽·오른쪽 문구 → 로고 → 굵은 선 → 교육영역·학습주제 표)으로 인쇄된다. 학교를 안 고르면 원래 모습 그대로다
- 메모(`note`)는 관리자 전용 칸이라 공개 API(`GET /api/worksheet-headers`)에서는 빼고 내보낸다 — 이 경로는 활동지가 로그인 없이 읽는다
- 화면은 `/worksheet-headers.html` 하나다. 메뉴 이름은 **활동지 인쇄**이고 교사·관리자 모두 들어간다. 교사는 학교를 고르고 차시별 인쇄용 활동지를 열 수 있고, 학교 목록·로고·문구 편집은 관리자에게만 보인다. 인쇄할 수 있는 차시 목록은 `public/lessons/worksheets.json`(인쇄용 `.sheet` + 머리글 스크립트가 둘 다 있는 파일만) 이다 — 새 활동지를 만들면 여기에 한 줄 추가한다. 저장은 `settings`의 `ws:school:<slug>` 키(JSON, `lib/worksheet-headers.js`). 보성초는 코드에 내장돼 있어 DB가 비어도 나오고, 저장하면 DB 값이 우선한다. `ws:` 접두사도 `getSettings()`가 프런트에 내보내지 않는다
- **Vercel은 `public/` 정적 파일을 `server.js`를 거치지 않고 직접 내보낸다** (2026-09-14 확인: `/lessons/_shared/base.css` 응답에 `X-Frame-Options`가 없음). 그래서 교안 HTML에 스크립트를 서버에서 끼워 넣을 수 없고, 파일마다 `<script>` 한 줄을 직접 넣는다
- 교육영역·학습주제 기본값은 활동지의 `LESSON.area`·`LESSON.topic`(또는 `.sheet`의 `data-area`·`data-topic`)이고, 인쇄 전에 "활동지 · 저장 관리" 칸에서 고칠 수 있다

## 부팅(콜드스타트)

- `lib/db.js`의 `ready()`는 콜드스타트마다 불리지만, `settings`의 `sys:bootstrap` 지문(SCHEMA·MIGRATIONS·CURRICULUM 본문 해시)이 현재 코드와 같고 admin 계정이 있으면 **조회 1번으로 끝난다**. 스키마·교육과정을 바꾸면 지문이 달라져 다음 콜드스타트에 전체 초기화(DDL·시드)가 한 번 돈다. 강제로 다시 돌리려면 `DELETE FROM settings WHERE key = 'sys:bootstrap'`
- `sys:` 접두사 설정은 `getSettings()`가 프런트에 내보내지 않는다 (`course_plan:`·`sb:`와 같은 취급)
- **전환 모드(`ACADEMY_ID`)에서도 교육과정 시드는 돈다** (2026-09-22). 예전에는 `ready()`가 통째로 건너뛰어서 `lib/curriculum.js`에 프로그램을 추가해도 프로덕션에 영원히 안 나왔다(프로덕션·프리뷰 모두 `ACADEMY_ID`가 켜져 있다). 지금은 스키마·관리자 시드는 그대로 건너뛰고 `seedCurriculumOnly()`가 교육과정만 붙인다 — 지문은 `sys:curriculum`(CURRICULUM 본문 해시)이고 같으면 조회 1번으로 끝난다. 다시 돌리려면 `DELETE FROM settings WHERE key = 'sys:curriculum'`
- 전환 모드의 `hub` 뷰는 **화면이 쓰는 컬럼 조합으로만 INSERT를 받는다.** 그래서 시드도 프로그램을 `title·category·grade·description` 으로 넣고 공개 여부는 뒤에 `UPDATE programs SET published` 로 따로 켠다. `settings` 는 `ON CONFLICT` 가 안 되므로 `academy` 플래그로 평범한 INSERT를 쓴다(뷰의 INSTEAD OF 트리거가 upsert)

## 확인

```bash
node --check server.js && node --check public/app.js
DATABASE_URL='postgresql://u:p@127.0.0.1:5432/none' PORT=3998 node --no-warnings server.js
# 더미 DB로도 정적 라우팅은 확인된다: / (랜딩) · /app (SPA 셸) · /style.css · /brand/...
```

이 컨테이너는 외부 사이트 직접 접속이 막혀 있다. 배포 확인은 Vercel MCP(`list_deployments`, `web_fetch_vercel_url`)로, 화면 확인은 로컬 서버 + 헤드리스 크롬으로 한다.
