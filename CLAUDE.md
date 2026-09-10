# CLAUDE.md

**모아허브(MoaHub)** — `hub.moakit.ai`. 모아킷의 선생님 수업자료 허브다.
모아킷은 사업자명이자 우산 브랜드이고, 모아허브는 그 안의 사업 분야다. **독립 업체로 읽히면 안 된다.**

프로젝트 전체 맥락(기능·데이터 구조·회수권 설계·운영 정책)은 **`인수인계서.md`** 와 `README.md`에 있다. 여기 옮겨 적지 않는다. 이 문서는 그 뒤에 바뀐 것과 작업 규칙만 적는다.

## 배포

- Vercel 프로젝트 `teacher-s-project` (팀 `themonsteredu`)
- **프로덕션 브랜치는 `main`이 아니라 `claude/wonderful-babbage-ihufst`다.** PR base를 여기로 잡아야 배포된다
- 형제 레포: `themonsteredu/pinpoint`(모아킷 홈 `moakit.ai`, 브랜드 원본), `themonsteredu/aiapp`(모아랩 `job.moakit.ai`)
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
