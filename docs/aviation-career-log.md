# 항공모빌리티 Career Log 연결

## 반영 범위

`themonsteredu/drone`의 임무 결과를 기존 Career Log 제출 경로로 받습니다.

- 허용 앱: `https://drone-six-smoky.vercel.app`과 `https://drone-<preview>-themonsteredu.vercel.app`.
- 프로그램: `aviation-mobility-01`.
- 학생 입장: 기존 `careerMaterialUrl`이 배정된 드론 웹앱에 `hub_code`와 `student_id`를 전달합니다.
- API: `/api/career-log/ingest`의 기존 rewrite와 Vercel OIDC 중계를 사용합니다.
- 기록: 항로 판단·사전 점검·운항 결과·돌아보기. 교사 점검, 진행 중인 임무, 불완전한 점검, 잘못된 학생/보드/시도 조합은 거절합니다.
- 기존 History AI와 과학 관찰 프로그램의 입장·제출 규격은 유지합니다.

## 저장과 동시 제출

드론은 `aviation-mobility-01:<boardCode>:<studentId>:<attemptId>`를 `source_event_id`로 사용합니다. 첫 제출 본문은 클라이언트에서 고정하며 실패 시 동일한 본문을 재사용합니다.

2026-09-06에 확인한 운영 `career_log.records`에는 `(source, source_event_id)` 고유 제약이 없습니다. 기존의 조회 후 삽입만으로는 동시 요청을 중복 방지할 수 없습니다. 새 항공 프로그램은 Edge에서 다음 순서로 처리합니다.

1. READ COMMITTED 트랜잭션에서 `(hashtext(source), hashtext(source_event_id))`의 `pg_advisory_xact_lock` 획득.
2. 잠금 이후 기존 기록 조회. 같은 학생이면 기존 접수번호, 다른 학생이면 409.
3. 기록이 없으면 학생 행·활동 기록을 삽입하고 커밋.
4. 커밋 성공 후 HTTP 201 접수번호 반환. 잠금 또는 저장 실패는 503.

모든 항공 기록 쓰기는 이 함수 경로를 사용해야 합니다. 잠금은 같은 키를 사용하는 쓰기 경로 간에 작동하며, 직접 DB에 기록하는 별도 코드는 이 보장을 우회할 수 있습니다. 잠금은 트랜잭션 종료 시 해제되고 대기·쿼리에 시간 제한을 둡니다. 기존 두 프로그램의 저장 경로는 그대로입니다. DB 스키마 변경은 없습니다.

근거: [PostgreSQL 트랜잭션 advisory lock](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS), [Postgres.js 트랜잭션 API](https://github.com/porsager/postgres#transactions).

## 실제 학생 연결의 의미

Hub는 열린 보드·공개 프로그램과 그 보드에 실제 배정된 드론 URL을 확인합니다. `session_ref`와 `raw_data.hub`는 서버의 보드 정보로 생성합니다. 요청이 임의로 전달한 검증 상태와 수업 ID를 신뢰하지 않습니다.

학생 ID는 기존 Hub가 생성·보관하는 임의 브라우저 UUID입니다. 이 통합은 새 로그인 인증이나 학생 소유권 인증을 추가하지 않습니다. 비행 수치도 클라이언트에서 생성한 교육용 활동이며 `verification_status`, `verified_by`, `verified_at`은 `null`로 저장합니다. 이름/모둠은 표시 정보이며 학생 ID로 사용하지 않습니다.

## 함수 소스와 배포 순서

`supabase/functions/career-log-ingest/index.ts`는 2026-09-06 운영 함수 v8(프로젝트 `vypnobpmyadtcvxhtagn`, 함수 SHA `49a3dab5d8614517212476c57c1708d09bed364ebdf3fe2202d32fe0a2f8ca31`)에서 가져왔습니다. 새 프로그램 허용과 항공 기록의 트랜잭션 처리만 추가합니다. 기존 서명 검증, issuer/audience, Hub team/project/environment/subject 검증은 유지합니다.

`supabase/config.toml`의 `verify_jwt = false`는 기존 운영 설정과 같습니다. 함수 내부에서 Hub 전용 Vercel OIDC 서명을 검증하므로 익명 공개 쓰기가 아닙니다. 프런트엔드에는 OIDC나 서비스 키를 전달하지 않습니다.

운영 반영은 다음 순서입니다.

1. 배포 직전에 운영 함수 버전·소스를 다시 확인합니다. v8 이후 변경이 있으면 해당 변경을 합친 뒤 진행합니다.
2. 이 PR의 함수 소스를 프로젝트 `vypnobpmyadtcvxhtagn`의 `career-log-ingest`로 배포합니다. 기존 `SUPABASE_DB_URL` 설정을 사용하며 새 비밀값은 추가하지 않습니다.
3. Hub PR을 운영 브랜치 `claude/wonderful-babbage-ihufst`에 반영하여 API와 학생 보드 링크를 배포합니다.
4. 드론의 연동 PR을 배포합니다.
5. 대상 프로그램에 운영 드론 URL을 웹앱으로 등록하고 해당 학생 보드에 배정합니다. 사이트·프로그램·보드를 열어 실제 조종기로 임무 종료 → 제출 → 접수번호 확인을 수행합니다.

이 변경 작성 시점에는 운영 함수·Hub·드론 배포를 실행하지 않았고 실제 학생 기록도 만들지 않았습니다. 저장 테스트는 의존성을 대체한 계약 검사입니다. 실서비스의 OIDC·CORS·DB 저장 전체 흐름은 운영 반영 후 확인해야 합니다.

## 검증

`npm run check`가 기존 Hub 검사와 다음 항목을 실행합니다.

- 드론 실제 기록 생성기로 만든 두 임무의 제출 fixture를 Hub API가 수용하는지 확인.
- 허용 출처·정확한 앱 URL·수업 공개 상태·배정 링크 검사.
- 교사 점검/미완료/누락 점검/잘못된 학생·보드·시도 차단.
- 서버가 실제 보드 ID와 미검증 상태를 사용하고 기존 OIDC를 전달하는지 확인.
- Edge의 기존 프로그램 호환, OIDC 검증 호출과 claim 제한, 저장 실패와 중복 접수 응답.
- 동시에 호출한 항공 기록이 조회 전에 트랜잭션 잠금을 획득하고 한 접수번호를 공유하는지 확인(모의 DB).
