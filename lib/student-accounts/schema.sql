-- Review/test schema only. No runtime auto-migration. Apply to the configured
-- central Career Log database only after migration review and target verification.
BEGIN;
CREATE SCHEMA moakit_accounts;
REVOKE ALL ON SCHEMA moakit_accounts FROM PUBLIC;
CREATE TABLE moakit_accounts.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE moakit_accounts.managers (
  school_id uuid NOT NULL REFERENCES moakit_accounts.schools(id),
  issuer text NOT NULL,
  teacher_id text NOT NULL,
  PRIMARY KEY (school_id, issuer, teacher_id)
);
CREATE TABLE moakit_accounts.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  career_student_id uuid NOT NULL UNIQUE REFERENCES career_log.students(id),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE moakit_accounts.memberships (
  account_id uuid NOT NULL REFERENCES moakit_accounts.accounts(id),
  school_id uuid NOT NULL REFERENCES moakit_accounts.schools(id),
  display_name text NOT NULL,
  class_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (account_id, school_id)
);
CREATE TABLE moakit_accounts.sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES moakit_accounts.accounts(id),
  expires_at timestamptz NOT NULL
);
CREATE INDEX ON moakit_accounts.sessions(account_id);
CREATE TABLE moakit_accounts.login_limits (
  key_hash text PRIMARY KEY,
  attempts integer NOT NULL,
  resets_at timestamptz NOT NULL
);
CREATE TABLE moakit_accounts.audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES moakit_accounts.schools(id),
  actor text NOT NULL,
  action text NOT NULL,
  account_id uuid REFERENCES moakit_accounts.accounts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- No browser/Data API grants or policies. Access is through the authenticated
-- server service only. FORCE RLS fails closed for ordinary ungranted DB roles.
ALTER TABLE moakit_accounts.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE moakit_accounts.schools FORCE ROW LEVEL SECURITY;
ALTER TABLE moakit_accounts.managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE moakit_accounts.managers FORCE ROW LEVEL SECURITY;
ALTER TABLE moakit_accounts.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE moakit_accounts.accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE moakit_accounts.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE moakit_accounts.memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE moakit_accounts.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE moakit_accounts.sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE moakit_accounts.login_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE moakit_accounts.login_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE moakit_accounts.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE moakit_accounts.audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA moakit_accounts FROM PUBLIC, anon, authenticated;
COMMIT;
