'use strict';
const crypto = require('node:crypto');
const S = require('./security');
// All SQL runs against the explicitly configured central account pool.
// Transaction boundaries include authorization, account mutation and audit.
function createService(pool, issuer) {
  async function tx(fn) {
    const c = await pool.connect();
    try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result; }
    catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
    finally { c.release(); }
  }
  const actor = user => `${issuer}:${user.id}`;
  async function authorize(c, user, school) {
    if (!user || !S.uuid(school)) S.fail(403, '학교 관리 권한이 없습니다.');
    const r = await c.query('SELECT 1 FROM moakit_accounts.managers WHERE school_id=$1 AND issuer=$2 AND teacher_id=$3 FOR SHARE', [school, issuer, String(user.id)]);
    if (!r.rowCount) S.fail(403, '학교 관리 권한이 없습니다.');
  }
  const audit = (c, user, school, action, account = null) => c.query('INSERT INTO moakit_accounts.audit(school_id,actor,action,account_id) VALUES($1,$2,$3,$4)', [school, actor(user), action, account]);
  async function session(c, token, lock = false) {
    if (!/^[a-f0-9]{64}$/.test(token || '')) S.fail(401, '학생 로그인이 필요합니다.');
    const r = await c.query(`SELECT a.id,a.career_student_id,a.username,a.must_change_password FROM moakit_accounts.sessions s JOIN moakit_accounts.accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.active=true${lock ? ' FOR UPDATE OF a,s' : ''}`, [S.hash(token)]);
    if (!r.rowCount) S.fail(401, '학생 로그인이 필요합니다.');
    return r.rows[0];
  }
  return {
    async schools(user) {
      return tx(async c => (await c.query('SELECT s.id,s.name FROM moakit_accounts.schools s JOIN moakit_accounts.managers m ON m.school_id=s.id WHERE m.issuer=$1 AND m.teacher_id=$2 ORDER BY s.name', [issuer, String(user.id)])).rows);
    },
    async createSchool(user, name) {
      if (user?.role !== 'admin') S.fail(403, '관리자만 학교를 등록할 수 있습니다.');
      name = S.text(name, 120);
      return tx(async c => {
        const school = (await c.query('INSERT INTO moakit_accounts.schools(name) VALUES($1) RETURNING id,name', [name])).rows[0];
        await c.query('INSERT INTO moakit_accounts.managers VALUES($1,$2,$3)', [school.id, issuer, String(user.id)]);
        await audit(c, user, school.id, 'school_created'); return school;
      });
    },
    async grantManager(user, school, teacherId) {
      if (user?.role !== 'admin') S.fail(403, '관리자만 담당자를 지정할 수 있습니다.');
      return tx(async c => { await authorize(c,user,school); await c.query('INSERT INTO moakit_accounts.managers VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [school,issuer,String(teacherId)]); await audit(c,user,school,'manager_granted'); });
    },
    async list(user, school) {
      return tx(async c => { await authorize(c,user,school); return (await c.query('SELECT a.id,a.username,a.active,a.must_change_password,m.display_name,m.class_name FROM moakit_accounts.memberships m JOIN moakit_accounts.accounts a ON a.id=m.account_id WHERE m.school_id=$1 AND m.active=true ORDER BY m.class_name,m.display_name', [school])).rows; });
    },
    async provision(user, school, input) {
      const rows = S.roster(input);
      return tx(async c => {
        await authorize(c,user,school);
        const result = [];
        for (const row of rows) {
          const studentId = crypto.randomUUID();
          const username = 'm' + crypto.randomBytes(10).toString('hex');
          const temporaryPassword = crypto.randomBytes(12).toString('base64url');
          await c.query('INSERT INTO career_log.students(id) VALUES($1)', [studentId]);
          const a = (await c.query('INSERT INTO moakit_accounts.accounts(career_student_id,username,password_hash) VALUES($1,$2,$3) RETURNING id', [studentId,username,await S.passwordHash(temporaryPassword)])).rows[0];
          await c.query('INSERT INTO moakit_accounts.memberships(account_id,school_id,display_name,class_name) VALUES($1,$2,$3,$4)', [a.id,school,row.displayName,row.className]);
          await audit(c,user,school,'account_issued',a.id);
          result.push({ id: a.id, username, temporaryPassword, ...row });
        }
        return result;
      });
    },
    async updateMember(user, school, id, input) {
      if (!S.uuid(id)) S.fail(400,'학생을 확인해 주세요.');
      const name = S.text(input.displayName,80), className = S.text(input.className,80);
      return tx(async c => { await authorize(c,user,school); const r=await c.query('UPDATE moakit_accounts.memberships SET display_name=$1,class_name=$2 WHERE account_id=$3 AND school_id=$4 AND active=true RETURNING account_id',[name,className,id,school]); if (!r.rowCount) S.fail(404,'학생을 찾을 수 없습니다.'); await audit(c,user,school,'membership_updated',id); });
    },
    async reset(user, school, id) {
      if (!S.uuid(id)) S.fail(400,'학생을 확인해 주세요.');
      return tx(async c => {
        await authorize(c,user,school);
        const r=await c.query('SELECT a.id FROM moakit_accounts.accounts a JOIN moakit_accounts.memberships m ON m.account_id=a.id WHERE a.id=$1 AND m.school_id=$2 AND m.active=true FOR UPDATE OF a',[id,school]);
        if (!r.rowCount) S.fail(404,'학생을 찾을 수 없습니다.');
        const temporaryPassword=crypto.randomBytes(12).toString('base64url');
        await c.query('UPDATE moakit_accounts.accounts SET password_hash=$1,must_change_password=true WHERE id=$2',[await S.passwordHash(temporaryPassword),id]);
        await c.query('DELETE FROM moakit_accounts.sessions WHERE account_id=$1',[id]);
        await audit(c,user,school,'password_reset',id); return { temporaryPassword };
      });
    },
    async login(username, password, clientKey) {
      if (typeof username!=='string' || !/^m[a-f0-9]{20}$/.test(username) || typeof password!=='string' || password.length>128) S.fail(401,'아이디 또는 비밀번호가 올바르지 않습니다.');
      // Persist limits in a separate transaction so failed logins do not roll back the counter.
      await tx(async c => {
        for (const [key, limit] of [[S.hash('user:'+username),20],[S.hash('client:'+clientKey),500]]) {
          const r=await c.query("INSERT INTO moakit_accounts.login_limits VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN moakit_accounts.login_limits.resets_at<now() THEN 1 ELSE moakit_accounts.login_limits.attempts+1 END,resets_at=CASE WHEN moakit_accounts.login_limits.resets_at<now() THEN now()+interval '15 minutes' ELSE moakit_accounts.login_limits.resets_at END RETURNING attempts",[key]);
          if (r.rows[0].attempts>limit) S.fail(429,'로그인 시도가 많습니다. 15분 후 다시 시도하세요.');
        }
      });
      return tx(async c => {
        const a=(await c.query('SELECT * FROM moakit_accounts.accounts WHERE username=$1 FOR UPDATE',[username])).rows[0];
        if (!a || !a.active || !await S.passwordMatches(password,a.password_hash)) S.fail(401,'아이디 또는 비밀번호가 올바르지 않습니다.');
        const token=crypto.randomBytes(32).toString('hex');
        await c.query("INSERT INTO moakit_accounts.sessions VALUES($1,$2,now()+interval '8 hours')",[S.hash(token),a.id]);
        return { token, mustChangePassword:a.must_change_password };
      });
    },
    async me(token) { return tx(c=>session(c,token)); },
    async logout(token) { if (/^[a-f0-9]{64}$/.test(token||'')) await tx(c=>c.query('DELETE FROM moakit_accounts.sessions WHERE token_hash=$1',[S.hash(token)])); },
    async changePassword(token, current, next) {
      S.passwordInput(next);
      if (current===next) S.fail(400,'새 비밀번호를 다르게 입력하세요.');
      return tx(async c=>{
        const a=await session(c,token,true);
        const stored=(await c.query('SELECT password_hash FROM moakit_accounts.accounts WHERE id=$1',[a.id])).rows[0];
        if (!await S.passwordMatches(current,stored.password_hash)) S.fail(401,'현재 비밀번호를 확인하세요.');
        await c.query('UPDATE moakit_accounts.accounts SET password_hash=$1,must_change_password=false WHERE id=$2',[await S.passwordHash(next),a.id]);
        await c.query('DELETE FROM moakit_accounts.sessions WHERE account_id=$1',[a.id]);
        // Reauthentication rotates the session and clears all shared-device sessions.
      });
    },
  };
}
module.exports={createService};
