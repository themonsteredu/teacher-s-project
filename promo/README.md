# 모아허브(MoaHub) 홍보영상

- `moahub-promo.mp4` — 1920×1080, 30fps, 55초, 배경음악 + 하단 한국어 자막 포함
- 실제 모아허브 화면(수업 프로그램 목록, 차시별 수업자료·수업 실행, 새 수업 열기·참여 코드, 학생 참여·활동지 사진 제출, 제출 현황·학생별 보기, 학교 머리글 활동지 인쇄)을 녹화해 자막과 함께 편집했습니다.
- `moahub-promo.srt` — 자막 파일 (유튜브 등에 따로 올릴 때 사용)
- `source/` — 다시 만들 때 쓰는 녹화·편집 스크립트 (앱 배포에는 포함되지 않음)

화면에 나오는 학생 이름(김하늘·이바다 등)과 활동지 사진은 모두 녹화용으로 만든 가상 데이터입니다. 실제 학생 정보는 들어 있지 않습니다.

## 다시 만드는 순서 (개발자용)

`source/` 폴더에서 실행합니다. 녹화 중간 파일(`clips/`, `frames/`, `out/`, `music.wav`)은 저장소에 올리지 않습니다.

1. 로컬 서버 준비 — 빈 Postgres DB와 `DATABASE_URL`로 `server.js` 실행. 학생 사진 제출은 Supabase 저장소가 필요하므로, 녹화 때는 `SUPABASE_URL`을 로컬 가짜 저장소로 돌렸습니다(앱 코드는 고치지 않음). 첫 로그인 뒤 관리자 비밀번호를 `Promo5678!`로 바꿔 두면 스크립트가 그대로 들어갑니다(`ADMIN_PW`로 변경 가능).
2. 녹화 — `node go.mjs home` → `program` → `newclass` → (수업에 학생용 웹앱 공유) → `student` → `fill`(나머지 학생 제출) → `teacher` → `print` → `stills`
3. 프레임 추출 — `clips/<장면>.mp4`를 `frames/<장면>/%05d.jpg`로 풀기 (ffmpeg)
4. 편집 확인 — `node render.mjs test 3 12 30` (지정한 초의 스틸을 `shots/`에 저장)
5. 렌더 — `node render.mjs` → `out/*.jpg` 1,650장
6. 음악·자막 — `python3 music.py` (numpy로 직접 합성, 저작권 문제 없음), `python3 srt.py`
7. 합치기 — `ffmpeg -framerate 30 -i out/%05d.jpg -i music.wav -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -shortest -movflags +faststart ../moahub-promo.mp4`

색은 모아킷 티일(`#17b6a0`, 밝은 값 `#41e3ce`)을 쓰고, 따뜻한 색(테라코타 `#b04a12`)은 마지막 주소 버튼 한 곳에만 썼습니다. 글꼴은 앱과 같은 S-Core Dream(`public/fonts`)입니다.
