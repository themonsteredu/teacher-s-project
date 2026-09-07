# 학생 제출 → Career Log

## 학생과 교사 흐름

학생은 일반 수업 코드로 입장해 차시별 활동을 한 뒤 사진·문서(최대 20MB, 1개) 또는 글을 제출한다. 새 제출은 항상 교사에게 먼저 보인다. 우리 반 공개는 교사의 별도 행동이며 진로기록 저장/교사 검증과 별개다.

교사가 차시의 `record.mode=submission`을 선택했다면 게시물과 함께 제출 순간의 Career snapshot을 서버에 보관한다. Hub 서버가 서명된 Vercel OIDC로 Edge를 호출한다. 설정이 none이면 게시판 제출만 한다. 외부 웹앱 내부의 제출은 여전히 앱별 연동이 필요하다.

학생의 **내 진로기록**은 이번 학생 세션의 제출 snapshot·실제 저장 영수증·원본 첨부를 보여준다. 교사는 수업 제출 설정의 **이 수업의 진로기록 확인**과 제출 카드에서 저장 결과를 본다. 기존 History/Science/항공모빌리티 기록을 포함한 전체 계정 통합 조회 기능으로 주장하지 않는다.

| 상태 | 근거 |
|---|---|
| 게시판 제출만 | 기록 모드가 아니었던 실제 제출 |
| 진로기록 저장 대기 | Hub 제출 snapshot은 커밋됐지만 Edge 성공 응답 미확인 |
| 진로기록 저장 완료 | Edge가 record_id와 동일 student_id를 성공 응답한 뒤 영수증 저장 |

## 학생 식별의 범위

서버가 256-bit 무작위 세션 토큰과 별도의 random v4 Career UUID를 생성한다. 쿠키 `moakit_submission_<boardId>`는 HttpOnly / SameSite=Strict / HTTPS Secure / 8시간 / `/api/join-board/` 범위이며 서버에는 토큰 해시를 저장한다. 일반 join도 이 서버 상태의 UUID를 돌려준다. 브라우저의 student_id query/localStorage/unsigned UUID cookie를 채택하지 않는다.

같은 보드의 살아 있는 학생 세션에서는 차시가 달라도 UUID가 유지된다. 수업 나가기는 서버 세션을 폐기한다. 공유기기 학생 교체 시 반드시 나가기를 사용한다. 계정 없는 임시 세션이므로 다른 브라우저·새 보드·만료 이후의 동일인 복원은 제공하지 않는다. 기존 검증 UUID/기록을 새 세션으로 승격하거나 UPDATE하지 않는다. 장기 학생 계정 연결은 별도 작업이다.

이 변경은 기존 외부 앱 ingest의 브라우저 UUID 소유 증명 문제를 해결했다고 주장하지 않는다. 신뢰 경계는 이번 Hub 제출 endpoint까지다.

## 저장와 멱등성

- 브라우저는 제목·설명·첨부 정보 snapshot과 request UUID를 만들고 재시도 때 유지한다. sessionStorage 실패 시 메모리로 유지하며 저장 버튼은 finally에서 복구한다.
- Hub transaction은 event lock → 접근 재확인(board open/program published/site open/학생 세션/차시 제출 형식) → board_posts INSERT + settings snapshot + event receipt를 원자적으로 커밋한다.
- Career UUID는 서버 세션에서만 읽는다. 이름·학교·모둠·참여코드·브라우저 body는 UUID 생성 근거가 아니다.
- source_event_id는 서버에서 `hub-submission-v1:<randomUUID>`로 한 번 생성하고 snapshot에 보존한다. 실제 새로운 제출은 새 UUID다. 재시도 때 시간·설명·원본을 다시 만들지 않는다.
- downstream 실패는 Hub 제출을 취소하지 않는다. 내 진로기록에서 해당 snapshot만 재시도한다. 서버는 소유자/board/program/site/세션을 다시 검사한다. Edge 영수증 유실 후에도 같은 이벤트로 재시도한다.
- Edge는 기존 Hub project/team/issuer/audience/environment OIDC 검증을 유지한다. `hub-submission-v1`만 추가하고 기존 공개 앱 ingest allowlist에는 이 프로그램을 추가하지 않는다.
- 새 프로그램은 단일 READ COMMITTED transaction의 advisory event lock → SELECT existing → INSERT를 사용한다. 같은 event는 직렬화하고 다른 이벤트는 별도 잠금이다. 기존 기록 UPDATE/DELETE/TRUNCATE, schema migration은 없다.
- 늦은 재시도도 제출 당시 occurred_at을 보존하도록 Hub snapshot 프로그램에만 24시간 과거 제한을 적용하지 않는다. 미래 시간은 5분까지 허용한다. 기존 앱 시간 계약은 유지한다.
- reflection/verification_status/verified_by/verified_at/supersedes_id는 NULL이다. raw_data는 실제 학생 제목·설명·검증된 첨부 메타데이터와 수업 문맥이며 점수·정답 상수는 보내지 않는다.

## 첨부와 열람

파일 검증 후 서버가 같은 비공개 버킷의 `career-originals/`에 독립 복사한다. 원본 기록에는 만료되는 signed URL 대신 보관 경로/이름/크기/MIME를 둔다. 일반 게시판 파일 삭제 함수는 Career 보관 경로 삭제를 거부한다. 게시물을 삭제해도 저장 snapshot/영수증과 보관본은 유지한다. 학생 첨부 열람은 같은 학생 세션과 열린 수업을 검증한 뒤 60초 서명 URL을 발급한다. 기존 일반 파일의 삭제/공개 정책은 유지한다.

서버 crash로 생긴 고아 보관본의 주기적 정리는 구현하지 않았다. 향후 정리 시 저장/대기 snapshot의 참조를 먼저 확인해야 한다. 학생 세션 만료 후 장기 열람이나 삭제된 보드의 포털 복구는 계정 연결 작업에 포함해야 한다.

## 배포 전 체크

1. 운영 Edge 소스와 Git 차이를 확인하고 기존 앱 지원을 보존한 채 이 버전 배포를 준비한다.
2. Hub 서버 환경에 `CAREER_LOG_INGEST_URL=https://<중앙프로젝트>/functions/v1/career-log-ingest`를 설정한다. 프로젝트명을 새 코드에 하드코딩하지 않는다. 클라이언트에는 비밀값을 전달하지 않는다.
3. 실제 HEAD Preview에서 교사 구성 등록/적용 → 일반 학생 join → 실제 글/파일 제출 → 두 Career Records SELECT → 동일 UUID/원본/NULL 검증을 한다.
4. 학생 교체·다른 학생 접근·마감/비공개/site off·네트워크 재시도·기기별 UI를 검증한다. 기존 History/Science 실제 E2E 및 리뷰 병합 조건도 유지한다.

테스트는 격리된 DB/Storage/Edge 대역과 Node VM UI 이벤트를 사용한다. 운영 DB 적용·실제 저장·실기기 검증 성공과 구분한다. 이번 구현만으로 운영 반영 완료를 선언하지 않는다.
