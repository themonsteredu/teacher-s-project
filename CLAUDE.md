# CLAUDE.md

**모아허브(MoaHub)** — `hub.moakit.ai`. 모아킷의 선생님 수업자료 허브다.
모아킷은 사업자명이자 우산 브랜드이고, 모아허브는 그 안의 사업 분야다. **독립 업체로 읽히면 안 된다.**

프로젝트 전체 맥락(기능·데이터 구조·회수권 설계·운영 정책)은 **`인수인계서.md`** 와 `README.md`에 있다. 여기 옮겨 적지 않는다. 이 문서는 그 뒤에 바뀐 것과 작업 규칙만 적는다.

## 배포

- Vercel 프로젝트 `teacher-s-project` (팀 `themonsteredu`)
- **프로덕션 브랜치는 `main`이 아니라 `claude/wonderful-babbage-ihufst`다.** PR base를 여기로 잡아야 배포된다
- 형제 레포: `themonsteredu/pinpoint`(모아킷 홈 `moakit.ai`, 브랜드 원본), `themonsteredu/aiapp`(모아랩 `job.moakit.ai`)

## 주소 구조 (바뀐 부분)

원래는 모든 경로를 `index.html`로 넘기는 캐치올이었고 루트에 로그인 화면이 그대로 나왔다. 지금은 갈라져 있다.

| 주소 | 내용 |
|---|---|
| `/` | 모아허브 소개 랜딩 (`public/index.html` — 단일 파일, CSS·스크립트 인라인) |
| `/app`, `/app/*` | 기존 허브 SPA (`public/app.html` + `public/app.js`) |
| `/app#/board/<6자리코드>` | 학생 활동 보드 (로그인 없이 접근) |
| `/api/*` | 서버리스 (`api/index.js` → `lib/api.js`) |

- 라우팅 규칙은 **`vercel.json`과 `server.js` 양쪽에 같이** 넣는다. 한쪽만 고치면 Vercel과 로컬 동작이 갈린다
- 해시 라우팅이라, 랜딩 `<head>`에 `#/`로 시작하는 해시만 `/app`으로 넘기는 스크립트를 둬서 예전 링크를 살린다. 페이지 내부 앵커(`#what` 등)는 건드리지 않는다
- `/lessons/*`는 발표 iframe에 같은 출처로 임베드되므로 `X-Frame-Options: SAMEORIGIN` — `server.js`의 예외 처리를 지운다면 발표 화면이 깨진다

## 이름

서비스명은 **모아허브(MoaHub)** 로 통일했다. 예전 이름 `수업프로그램 허브`가 남아 있으면 갱신 대상이다 (`public/app.js`의 상단바·로그인 로고·서비스 정보, `app.html` 타이틀, `server.js` 기동 로그, `package.json`).

## 브랜드

- 심볼: `public/brand/moakit-symbol.svg` — pinpoint와 같은 파일
- 기본색은 모아킷 티일(`#17b6a0` / `#0e8f7e`), **강조색은 오렌지(`#ff8a3d`)**. moakit.ai 제품 카드에서 허브가 오렌지인 규칙을 사이트로 이어받은 것이라, 같은 가족으로 읽히면서 제품은 구분된다
- 헤더 워드마크 옆 `by MoaKit`, 헤더 CTA에 모아킷 홈, 푸터에 형제 제품 링크와 **모아킷 사업자 정보**(상호·대표·사업자등록번호·이메일)가 있어야 한다
- 한글은 `word-break: keep-all` 필수

## 랜딩 히어로

우측 카드는 **실제 화면 캡처가 아니라** 프로그램에 담기는 것(수업 링크·웹앱/영상·첨부자료·학생 활동 보드)을 보여주는 도식이다. 허브 화면 캡처가 준비되면 교체한다. 캡처로 바꿀 때는 모아랩(`aiapp`)의 `public/brand/showcase/` 규격(800×500, 16:10)을 따르면 두 사이트가 같은 결이 된다.

성과 수치처럼 확인되지 않은 값은 넣지 않는다.

## 확인

```bash
node --check server.js && node --check public/app.js
DATABASE_URL='postgresql://u:p@127.0.0.1:5432/none' PORT=3998 node --no-warnings server.js
# 더미 DB로도 정적 라우팅은 확인된다: / (랜딩) · /app (SPA 셸) · /style.css · /brand/...
```

이 컨테이너는 외부 사이트 직접 접속이 막혀 있다. 배포 확인은 Vercel MCP(`list_deployments`, `web_fetch_vercel_url`)로, 화면 확인은 로컬 서버 + 헤드리스 크롬으로 한다.
