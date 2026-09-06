# School-issued student accounts — implementation draft

This branch adds an isolated first implementation. It is NOT production enabled.
It is stacked on Hub PR #21; that PR and History PR #6 are unchanged and unmerged.

## Implemented

- `/student-accounts.html`: teacher school management, batch issue (1–100 students),
  one-time display of random initial credentials, member name/class updates,
  password resets; student login, first-password change, logout/student switch.
- `/api/student-accounts/*`: existing Hub teacher session verification, school-manager
  authorization on every management request, exact configured Origin checks on all
  mutations, site-open enforcement, private hashed student sessions (8 hour expiry).
- Async salted scrypt passwords, persistent per-account and client attempt limits.
- School admins explicitly grant a current Hub teacher ID as school manager. A Hub
  platform admin can create schools but still needs a manager binding to access them.
- New account ID, random username and Career UUID are independent; the school is a
  membership. There is no name-based merge or takeover of an old anonymous UUID.
- Batch issuance runs in one transaction with student binding and audit. Password
  reset/change revokes all student sessions. Membership edits leave identity unchanged.

## Central database and feature gate

Production runtime requires ALL of:

- `STUDENT_ACCOUNTS_ENABLED=1` (default OFF)
- `CAREER_ACCOUNTS_DATABASE_URL`: explicit server-only central DB connection; NEVER
  fall back to Hub's existing `DATABASE_URL`. Current authorized target is aiapp,
  project ref `vypnobpmyadtcvxhtagn`; names/refs are not embedded in account runtime.
- `STUDENT_ACCOUNT_ISSUER`: stable namespace for the verified Hub teacher identity.
- `STUDENT_ACCOUNT_ORIGIN`: exact public HTTPS origin of this account UI deployment.

For the authorized `career-log-science-observation` Vercel Preview only,
`lib/student-accounts/config.js` supplies the non-secret activation flag,
`moakit-hub` issuer and HTTPS origin from Vercel's `VERCEL_BRANCH_URL`.
`VERCEL=1`, `VERCEL_ENV=preview` and an exact Git branch match are all required.
No request header, body or query selects the origin or enables the feature.
Explicit environment settings take priority; `STUDENT_ACCOUNTS_ENABLED=0` keeps
the feature disabled. Production, local runs and other branches do not inherit
these Preview defaults. Use the branch URL for account UI testing, not a unique
deployment URL, so its Origin matches after each redeployment.

`CAREER_ACCOUNTS_DATABASE_URL` is still required from Vercel's private environment.
It is never committed, printed, replaced with Hub's `DATABASE_URL`, or exposed to
the browser. The pool identifies itself as `moakit-student-accounts` so operators
can verify the target database connection without exposing credentials.

`lib/student-accounts/schema.sql` was applied to aiapp as migration
`20260905220759_moakit_student_accounts_v1`. It does not alter Career Log tables
or grant public API access. New tables
are in `moakit_accounts` with RLS/FORCE RLS and no browser grants. Deployment needs a
server DB role with explicit reviewed privileges; the current no-policy schema is
fail-closed for ordinary roles. Do not add broad client policies to bypass this.

The operational account transaction test completed with ROLLBACK and left no test
accounts or Career records. Runtime DB credentials/privileges and actual account
login still require deployment verification. Do not rerun the migration to diagnose
a connection error. No server start or HTTP request executes schema.sql.

## Remaining integration gates — do not advertise common login yet

- Account login is currently isolated from legacy anonymous Hub board sessions. The
  page deliberately has no automatic class-entry button: that would create an
  anonymous identity rather than prove this account owns the record.
- Bind teacher-owned boards to schools and check active student membership at join
  and submit. Do not treat a public board code as proof of membership.
- Make Career Log submission use only server-resolved account identity. Existing
  external-app `student_id` parameters/body are NOT proof of authenticated identity.
  This draft does not modify that legacy E2E path.
- Job cross-site login/handoff, challenge/replay checks, iframe submission bridges,
  QR credentials, transfers, and existing-record claims are NOT implemented here.
- No real student roster has been imported. Tests use generated placeholders only.

## Verification and limits

`npm run check` includes crypto, CSRF, school authorization, batch rollback, session
hashing/expiry/reset and duplicate-name tests. Database responses are mocked; these
are not real-Postgres or operational UI E2E results. Browser UI validation is blocked
by repeated browser connection timeouts. Keep the production feature OFF until those
gates pass; the authorized Preview is used to perform the remaining runtime checks.

## Temporary E2E cleanup

Known resources from prior work: Hub board 16 / code CLV1R9, program 11, links 27/28.
The teacher UI was inspected again: board title matched and posts=0. Browser deletion
confirmation hung; deletion is NOT confirmed. Do not delete Career Log records.
