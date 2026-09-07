# School-issued student accounts and Career Log — integration draft

This branch ports the account implementation from Hub PR #21 onto the current Hub
production code and prepares authenticated submission integration. It is NOT
production enabled. Porting files does not change or merge PR #21 or History PR #6.

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
- Server-only account helpers resolve the HttpOnly cookie through the central
  session/account tables. Active school membership is required for school-bound
  class participation; first-password change must be completed. The board owner
  must also be an explicitly assigned school manager, including platform admins.
- `GET /api/student-accounts/records` reads only the authenticated account's Career
  UUID. It accepts `limit` (1–100, default 30) and an optional previous-record UUID
  `before` cursor. Both the page and cursor query are scoped to that same UUID;
  callers cannot supply `student_id`. Historical own records remain readable
  independently of the current school membership while the account stays active.
- Student account page shows saved original records and safely returns to
  `/app#/board/<code>` from `?board=<4–10 letters/digits>`. No token or UUID is added
  to that link. Pending responses are discarded when changing accounts or leaving
  the page, so an earlier account response cannot repopulate the next account view.

## Central database and feature gate

Production runtime requires ALL of:

- `STUDENT_ACCOUNTS_ENABLED=1` (default OFF)
- `CAREER_ACCOUNTS_DATABASE_URL`: explicit server-only central DB connection; NEVER
  fall back to Hub's existing `DATABASE_URL`. Current authorized target is aiapp,
  project ref `vypnobpmyadtcvxhtagn`; names/refs are not embedded in account runtime.
- `STUDENT_ACCOUNT_ISSUER`: stable namespace for the verified Hub teacher identity.
- `STUDENT_ACCOUNT_ORIGIN`: exact public HTTPS origin of this account UI deployment.
- `CAREER_LOG_INGEST_URL`: the server-only HTTPS endpoint ending in
  `/functions/v1/career-log-ingest`. Both Hub submission delivery and the legacy
  app gateway use this setting; neither guesses a project from a name.

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

For easier secret entry, optionally set `CAREER_ACCOUNTS_DATABASE_PASSWORD` in
the same private environment to the CURRENT database password exactly as written.
Paste only the password, with no surrounding quotes or URL encoding. The server
uses the existing URL for its target/user/TLS settings and passes this separate
password directly to pg. It overrides both the URL password and any password query
parameter. An explicitly empty override fails closed; when absent, the existing
URI-only configuration is unchanged. This does not change the Supabase password
or other applications. Never send the password through chat, logs, or browser code.

The previous account branch's `lib/student-accounts/schema.sql` was applied to aiapp as migration
`20260905220759_moakit_student_accounts_v1`. It does not alter Career Log tables
or grant public API access. New tables
are in `moakit_accounts` with RLS/FORCE RLS and no browser grants. Deployment needs a
server DB role with explicit reviewed privileges; the current no-policy schema is
fail-closed for ordinary roles. Do not add broad client policies to bypass this.

The operational account transaction test completed with ROLLBACK and left no test
accounts or Career records. Runtime DB credentials/privileges and actual account
login still require deployment verification. Do not rerun the migration to diagnose
a connection error. No server start or HTTP request executes schema.sql.

## Server integration contract

- `resolveStudent(req, {required:false})`: no cookie returns `null` without opening
  an account database connection. A present cookie with disabled configuration or
  an invalid/expired/revoked session fails closed; it never becomes a guest.
- `authorizeStudent(req, schoolId)`: revalidates session, active account, completed
  password setup and active membership for this exact school.
- `authorizeSchool(user, schoolId)`: checks the authenticated teacher/admin's
  manager binding under `STUDENT_ACCOUNT_ISSUER`.
- The first two return `{accountId, careerStudentId, sessionHash, expiresAt,
  mustChangePassword}` to server code only. Use `sessionHash` to rotate private
  board ownership when the account session changes. Never send that hash to clients.
- `logoutStudent(req,res)`: revokes the current central account session and appends
  an expired account cookie without replacing a board logout cookie. The enclosing
  route must enforce same-origin requests. Guest logout makes no account DB call.
- `readRecords(req,options)`: returns `{username,records,nextBefore}` with the account's
  original Career fields only, never authentication tokens or password hashes.
  The server-resolved username lets the page detect account switches even when
  the next account has no records. It is never accepted as a query selector.
- `GET /api/student-accounts/status` exposes the activation flag only. It requires
  no database connection and does not claim that the live database is reachable.

## Remaining release gates — do not advertise verified common login yet

- Real Preview teacher/student login, active membership, shared-device switch,
  two distinct activities, actual central record SELECT and same UUID verification.
- Actual board/program/site closure requests and existing History UI regression.
- Live Edge source comparison and approved `hub-submission-v1` ingest handling.
  Do not treat a public board code or external-app `student_id` parameter as
  authenticated identity; authenticated integrations must use the helpers above.
- The old direct cross-origin History/aviation calls do not carry the new
  host-only account cookie. They are intentionally refused without proof of
  account identity and school access. This is a compatibility change, not a
  completed History regression. Keep this branch out of production until a
  separately reviewed Hub-parent relay or signed handoff preserves their flow.
  No external app repository is modified in this integration draft.
- Job cross-site login/handoff, challenge/replay checks, iframe submission bridges,
  QR credentials, transfers, and existing-record claims are NOT implemented here.
- No real student roster has been imported. Tests use generated placeholders only.

## Verification and limits

`npm run check` includes crypto, CSRF, school authorization, batch rollback, session
hashing/expiry/reset, duplicate-name, membership, cookie downgrade, per-session
ownership and account-scoped record query tests. Database responses are mocked;
these are not real-Postgres or operational UI E2E results. During this integration
work the Supabase connector cannot access the authorized aiapp project. Keep the
production feature OFF until connection access and the release gates pass. No
migration or operational record mutation is part of this account code port.

## Hub submission connection

1. A school manager issues a student account. The central transaction creates an
   independent random Career UUID and binds it to that account. Existing unsigned
   browser UUIDs and earlier test records are never claimed or rewritten.
2. Curriculum authoring sets each lesson's submission instructions, original
   result description and one-line activity summary. This metadata alone stores
   no record. The teacher selects the school in the actual board's submission
   settings and explicitly enables Career recording.
3. The student changes the temporary password, signs in and enters the ordinary
   4–10-character alphanumeric class code. The Hub checks active school membership.
   Once a board is school-bound, switching recording off retains the school gate;
   another school needs a new board.
4. A real text/photo/document submission creates one committed Hub snapshot. Its
   random source event UUID stays fixed for all retries. The server, not the
   browser, inserts the verified account Career UUID into the payload.
5. An independent private attachment copy under `career-originals/` preserves
   the accepted result when the ordinary Hub post or board is later deleted.
  Hub metadata stores the pending snapshot and the Edge acknowledgement. A lost
  response remains pending until the same event's actual record ID is confirmed.
  Board/program deletion is refused while any of its snapshots remain pending.
  The pending check and deletion share row locks and one Hub transaction; ordinary
  files are removed only after commit. This preserves the authorized retry path.
6. The board shows pending/saved receipts. The student account's record page reads
   actual `career_log.records` for that server-resolved UUID across classes.
   Guest boards continue to accept ordinary submissions without Career writes.

The temporary opaque board token and public draft nonce rotate on account session
changes. A stale tab cannot submit a prior student's snapshot under the next
student's cookies. Logout also revokes the central student session. School-manager
checks apply to legacy teacher download/delete/sharing paths as well as new record
paths; removing a manager must not leave access through board ownership alone.

The Edge file in this branch is a candidate, not a copy verified against the
current deployment. It adds `hub-submission-v1`, validates text or real archived
attachment originals, serializes duplicate event insertion with a transaction
advisory lock, and rejects a changed snapshot reusing the same Hub event. No new
table, index, policy or trigger is needed. Operational source comparison and live
tests remain mandatory before any Edge deployment.

## Temporary E2E cleanup

Known resources from prior work: Hub board 16 / code CLV1R9, program 11, links 27/28.
The teacher UI was inspected again: board title matched and posts=0. Browser deletion
confirmation hung; deletion is NOT confirmed. Do not delete Career Log records.
