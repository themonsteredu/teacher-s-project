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
- **모아랩 진로 관찰 기록**(`raw_data.job.entry_kind='career_observation'`, 정정본은 `observation_kind`)은 `artifact` 칸이 "드러난 강점·흥미"라서 그대로 두면 관찰 내용이 제목이 된다. `observationOf()`로 가려내 제목은 `job.title`을 쓰고, 강점·다음 활동은 **선생님이 쓴 내용**으로 이름표를 붙인다(`내가 남긴 생각` 아님). 활동 사진은 모아랩에만 있다(aiapp `career_record_photos`). 표시 규칙을 바꾸면 aiapp 쪽도 맞춘다 — 설계는 aiapp `docs/job-career-log.md` 하단
- 모아랩도 같은 계정을 발급한다(issuer `moakit-lab`). 학교를 다른 제품에 여는 표는 `moakit_accounts.school_access` — 정의 `db/moakit-accounts-0002-school-access.sql`. 관리 화면의 `모아랩에 열기` 체크박스가 그 스위치이고, 이 값은 **모아랩 쪽 권한**을 연다
- **모아허브 관리자(`role='admin'`)는 모든 학교를 제한 없이 관리한다** (2026-09-15). `service.js`의 `authorize()`는 관리자면 담당자(`managers`)·열기(`school_access`) 조회 없이 통과시키고, `schools()`도 관리자에게 전체 목록을 준다. 교사는 예전대로 담당자로 지정된 학교만 만진다
- 관리자 경로도 **학교 존재 확인(`SELECT 1 FROM schools … FOR SHARE`)은 남긴다.** 이게 없으면 없는 학교 UUID 가 403 대신 알 수 없는 오류로 터진다
- `schools()`의 `via` 는 세 값이다 — `manager`(담당자 지정) · `open`(다른 제품이 열어 줌) · `admin`(관리자 권한으로만 보임). 예전 두 값 시절에는 관리자에게 보이는 모든 학교가 `open` 으로 찍혀, 모아허브가 직접 만든 학교에도 "모아랩에서 열어 주었다"는 거짓 안내가 나왔다
- 모아허브 관리자가 넓어진 만큼 **모아랩(`aiapp`) 쪽은 그대로다** — 모아랩 관리자는 여전히 담당자 지정이나 `school_access` 가 있어야 한다. 한쪽만 넓힌 상태라는 것을 알고 있어야 한다

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

## 확인

```bash
node --check server.js && node --check public/app.js
DATABASE_URL='postgresql://u:p@127.0.0.1:5432/none' PORT=3998 node --no-warnings server.js
# 더미 DB로도 정적 라우팅은 확인된다: / (랜딩) · /app (SPA 셸) · /style.css · /brand/...
```

이 컨테이너는 외부 사이트 직접 접속이 막혀 있다. 배포 확인은 Vercel MCP(`list_deployments`, `web_fetch_vercel_url`)로, 화면 확인은 로컬 서버 + 헤드리스 크롬으로 한다.
