# 항공모빌리티 Career Log 연결

## 현재 초안의 범위와 연결 상태

이 문서는 학생 계정 기반 제출을 추가하는 현재 Hub 초안의 상태를 설명합니다. 항공·History의 기존 기록 규격을 검증하는 코드는 남아 있지만, 외부 앱에서 계정 Career Log로 자동 제출하는 연결은 아직 완료되지 않았습니다. 운영 병합은 보류합니다.

| 경로 | 현재 초안의 동작 | 아직 필요한 작업 |
| --- | --- | --- |
| Hub 학생 계정 → Hub 활동 결과물 제출 | 서버가 계정의 Career UUID를 결정하고 `hub-submission-v1` snapshot을 저장 경로로 보냄 | 환경 설정·운영 Edge 소스 확인·실제 학생 저장 검증 |
| Hub 내부 과학 식물 관찰 → Hub | 학생 UUID 없이 수업·차시 문맥을 전달하고 보드 세션·학생 계정·차시별 기록 설정으로 제출을 검증 | 새 Preview 및 실제 학생 저장 검증 |
| History 앱 내부 저장 버튼 → Hub | 기존 직접 요청은 Hub 학생 계정을 증명하지 못하며, 계정 연결 수업에서는 UUID query를 전달하지 않아 저장 UI 활성화 조건도 충족하지 않음 | History의 제출 통신과 문맥 규격 변경, Hub 중계 및 실제 회귀 검증 |
| 드론 앱 내부 제출 → Hub | 기존 클라이언트는 UUID query를 요구하고 인증 쿠키를 제외한 직접 요청을 사용하므로 계정 기록 자동 저장 미연결 | 드론의 제출 통신과 문맥 규격 변경, Hub 중계 및 실제 회귀 검증 |

Hub 활동 후 텍스트·사진·활동지를 제출하는 흐름과 외부 앱의 원본 상태를 자동으로 제출하는 흐름은 서로 다릅니다. Hub 제출이 성공해도 History·항공 앱의 자동 저장까지 성공한 것으로 간주하지 않습니다.

## 남아 있는 항공 기록 규격

- 허용 앱: `https://drone-six-smoky.vercel.app`과 `https://drone-<preview>-themonsteredu.vercel.app`.
- 프로그램: `aviation-mobility-01`.
- 학생 입장: `careerMaterialUrl`은 외부 앱에 Career UUID나 인증 토큰을 주지 않습니다. 같은 출처의 과학 앱만 수업·차시 문맥을 붙이며 History·항공 URL은 원래대로 반환합니다. 외부 앱에는 기존 저장 UI가 요구하는 문맥이 공급되지 않으므로 별도 통신 변경이 필요합니다.
- API: `/api/career-log/ingest`의 기존 rewrite와 Vercel OIDC 중계를 사용합니다.
- 기록: 항로 판단·사전 점검·운항 결과·돌아보기. 교사 점검, 진행 중인 임무, 불완전한 점검, 잘못된 학생/보드/시도 조합은 거절합니다.
- 기존 History·과학·항공 자동 저장의 실제 호환성을 통과했다고 주장하지 않습니다. 과학은 `/api/join-board/:code/science-career`로 전환해 기존 보드 쿠키 범위를 유지하고, 서버가 `draftScope`와 차시별 제출·기록 허용 및 자료 배정을 재검증합니다. 일반 ingest 경로로 과학 보드 세션 검사를 우회할 수 없습니다. 실제 저장 검증은 남아 있습니다.

## 저장과 동시 제출

기존 드론 클라이언트는 `aviation-mobility-01:<boardCode>:<studentId>:<attemptId>`를 `source_event_id`로 사용합니다. 첫 제출 본문은 클라이언트에서 고정하며 실패 시 동일한 본문을 재사용합니다. 이 규격은 계정 연결을 완료한 새 통신 계약이 아니며, 외부 앱에 계정 UUID를 전달하지 않는 방식으로 변경하기 전까지 호환성 검토가 필요합니다.

이 문서의 이전 검증 기록에 따르면 2026-09-06 운영 `career_log.records`에는 `(source, source_event_id)` 고유 제약이 없었습니다. 현재 운영 DB를 다시 확인했다는 의미는 아닙니다. 기존의 조회 후 삽입만으로는 동시 요청을 중복 방지할 수 없습니다. 현재 Git의 Edge 후보 소스는 허용된 모든 프로그램에 다음 순서를 적용합니다.

1. READ COMMITTED 트랜잭션에서 `(hashtext(source), hashtext(source_event_id))`의 `pg_advisory_xact_lock` 획득.
2. 잠금 이후 기존 기록 조회. 다른 학생이면 409. 기존 프로그램은 같은 학생의 기존 접수번호를 반환하고, `hub-submission-v1`은 snapshot도 같아야 기존 접수번호를 반환합니다.
3. 기록이 없으면 학생 행·활동 기록을 삽입하고 커밋.
4. 커밋 성공 후 HTTP 201 접수번호 반환. 잠금 또는 저장 실패는 503.

모든 항공 기록 쓰기는 이 함수 경로를 사용해야 합니다. 잠금은 같은 키를 사용하는 쓰기 경로 간에 작동하며, 직접 DB에 기록하는 별도 코드는 이 보장을 우회할 수 있습니다. 잠금은 트랜잭션 종료 시 해제되고 대기·쿼리에 시간 제한을 둡니다. 현재 초안은 DB 스키마를 변경하지 않습니다. 이 설명은 Git 후보 소스의 동작이며 운영 함수 반영을 뜻하지 않습니다.

근거: [PostgreSQL 트랜잭션 advisory lock](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS), [Postgres.js 트랜잭션 API](https://github.com/porsager/postgres#transactions).

## 실제 학생 연결의 의미

Hub는 열린 보드·공개 프로그램과 그 보드에 실제 배정된 드론 URL을 확인합니다. `session_ref`와 `raw_data.hub`는 서버의 보드 정보로 생성합니다. 요청이 임의로 전달한 검증 상태와 수업 ID를 신뢰하지 않습니다.

현재 초안은 학교에 연결된 수업과 유효한 학생 계정 세션을 요구합니다. Career UUID는 계정 발급 시 서버가 무작위로 생성하며, 기존 공개 수업 코드·브라우저가 보낸 UUID·서명 없는 UUID 쿠키를 학생 신원 근거로 사용하지 않습니다. 요청 본문의 UUID가 서버 계정과 다르면 거절합니다. 이름·학교·모둠·계정 PK로 Career UUID를 만들지 않습니다.

학생 세션은 Hub의 HttpOnly 쿠키를 사용합니다. 현재 History는 Hub로 직접 `fetch`하고, 드론은 직접 요청에서 `credentials: "omit"`을 사용하므로 이 계정 세션을 전달하지 못합니다. 두 앱에는 Hub 부모로 snapshot을 보내는 Career용 메시지 계약도 없습니다. 단순히 Hub 링크를 iframe으로 바꾸거나 CORS 허용 출처를 넓히는 것만으로 해결되지 않으며, 외부 저장소의 문맥·제출 통신 변경이 필요합니다. 현재 초안에서 History·드론 저장소는 수정하지 않았습니다.

비행 수치는 클라이언트에서 생성한 교육용 활동이며, 저장 허용 여부와 별개로 `verification_status`, `verified_by`, `verified_at`은 `null`입니다. 계정 인증은 학생 계정과의 연결을 확인할 뿐 실제 조종기 사용이나 활동 내용을 교사가 검증했다는 뜻이 아닙니다.

## 함수 소스와 배포 순서

`supabase/functions/career-log-ingest/index.ts`의 이전 기준은 2026-09-06 운영 함수 v8(프로젝트 `vypnobpmyadtcvxhtagn`, 함수 SHA `49a3dab5d8614517212476c57c1708d09bed364ebdf3fe2202d32fe0a2f8ca31`)입니다. 현재 Git 후보에는 항공 규격에 더해 `hub-submission-v1` 검증, snapshot 충돌 검사, 허용된 모든 프로그램의 트랜잭션 처리가 들어 있습니다. 기존 서명 검증, issuer/audience, Hub team/project/environment/subject 검증은 유지합니다. 현재 운영 함수의 버전·내용은 다시 확보하지 못했으므로 이 후보를 운영 소스와 동일하다고 간주하거나 그대로 덮어쓰지 않습니다.

`supabase/config.toml`의 `verify_jwt = false`는 기존 운영 설정과 같습니다. 함수 내부에서 Hub 전용 Vercel OIDC 서명을 검증하므로 익명 공개 쓰기가 아닙니다. 프런트엔드에는 OIDC나 서비스 키를 전달하지 않습니다.

운영 병합·배포는 아래 미완료 항목을 해결한 뒤 진행합니다.

1. 배포 직전에 운영 함수 버전·소스를 다시 확인합니다. v8 이후 변경이 있으면 해당 변경을 합친 뒤 진행합니다.
2. 학생 계정용 환경 설정과 `CAREER_LOG_INGEST_URL`을 대상 Hub Preview에 적용합니다. 계정 연결 설정은 [학생 계정 문서](student-accounts.md)를 따르며 브라우저에는 DB 비밀값을 전달하지 않습니다.
3. 운영 소스와 합친 후보의 검증을 마친 뒤, 허가된 중앙 프로젝트 `vypnobpmyadtcvxhtagn`의 기존 `career-log-ingest`에 필요한 변경만 반영합니다. 기존 `SUPABASE_DB_URL`을 사용하며 다른 DB로 대체하지 않습니다.
4. Preview에서 실제 학생 계정·일반 수업 참여·Hub 결과물 연속 제출·중앙 DB의 동일 Career UUID 저장을 확인합니다. 접근 차단과 공유 기기 계정 전환도 확인합니다.
5. History·항공의 기존 자동 저장 경로가 끊기는 문제를 별도로 해결하고 해당 앱의 실제 회귀 검증을 마칩니다. 현재 작업 범위에서 외부 앱을 수정하지 않으므로 이 항목은 미완료입니다.
6. 실제 저장·회귀·최신 리뷰·CI 조건을 모두 만족할 때 운영 브랜치 `claude/wonderful-babbage-ihufst` 병합 여부를 결정합니다. API나 Preview 배포 성공만으로 병합하지 않습니다.

현재 계정 연결 초안은 Hub Preview로 배포됐지만 운영 병합은 보류 중입니다. 이 초안의 운영 Edge 반영과 실제 학생 저장은 검증하지 않았습니다. 저장 테스트는 의존성을 대체한 계약 검사이며, 실서비스의 OIDC·계정 세션·DB 저장 전체 흐름을 대신하지 않습니다. 과거 Career Log 기록과 서버 저장 성공 사례도 이 초안의 실제 E2E 성공 근거로 대체하지 않습니다.

## 검증

`npm run check`가 기존 Hub 검사와 다음 항목을 실행합니다.

- 드론 실제 기록 생성기로 만든 두 임무의 제출 fixture를 모의 계정 인증 아래 Hub API가 수용하는지 확인. 외부 앱 브라우저 인증 성공 검증은 아님.
- 허용 출처·정확한 앱 URL·수업 공개 상태·배정 링크 검사.
- 교사 점검/미완료/누락 점검/잘못된 학생·보드·시도 차단.
- 서버가 실제 보드 ID와 미검증 상태를 사용하고 기존 OIDC를 전달하는지 확인.
- Edge 후보의 기존 프로그램 자료 형식, OIDC 검증 호출과 claim 제한, 저장 실패와 중복 접수 응답. 실제 History·항공 UI 호환 검증은 아님.
- 동시에 호출한 항공 기록이 조회 전에 트랜잭션 잠금을 획득하고 한 접수번호를 공유하는지 확인(모의 DB).
