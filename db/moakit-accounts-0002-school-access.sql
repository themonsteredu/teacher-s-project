-- 학교를 다른 모아킷 제품의 관리자에게 여는 표.
-- 행 (school_id, issuer) 가 있으면 그 제품(issuer)의 관리자(admin 이상)가 담당자 지정 없이도
-- 학교를 보고 학생 계정을 발급·관리하고 담당 교사를 지정할 수 있다.
-- issuer: 'moakit-hub' = 모아허브(hub.moakit.ai) · 'moakit-lab' = 모아랩(job.moakit.ai)
-- 여는 쪽: 모아허브 lib/student-accounts/service.js setAccess · 모아랩 lib/school-registry.js setAccess
-- 적용: Supabase 프로젝트 vypnobpmyadtcvxhtagn, migration moakit_accounts_school_access (2026-09-12)
CREATE TABLE IF NOT EXISTS moakit_accounts.school_access (
  school_id uuid NOT NULL REFERENCES moakit_accounts.schools(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  issuer text NOT NULL CHECK (issuer ~ '^moakit-[a-z]{2,20}$'),
  opened_by text NOT NULL CHECK (btrim(opened_by) <> ''),   -- '<issuer>:<관리자 ID>'
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, issuer)
);
ALTER TABLE moakit_accounts.school_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE moakit_accounts.school_access FORCE ROW LEVEL SECURITY;
REVOKE ALL ON moakit_accounts.school_access FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE moakit_accounts.school_access IS
  'School opened to another MoaKit product: admins of that issuer may manage the school without a manager binding. Server-only.';
