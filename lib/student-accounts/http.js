'use strict';
const { Pool } = require('pg');
const { createService } = require('./service');
const S = require('./security');
const { parseCookies } = require('../cookies');
let service;
function configured() { return process.env.STUDENT_ACCOUNTS_ENABLED === '1'; }
function getService() {
  if (!process.env.CAREER_ACCOUNTS_DATABASE_URL || !process.env.STUDENT_ACCOUNT_ISSUER || !process.env.STUDENT_ACCOUNT_ORIGIN) S.fail(503,'학생 계정 연결 설정이 필요합니다.');
  if (!service) service=createService(new Pool({connectionString:process.env.CAREER_ACCOUNTS_DATABASE_URL,max:2}),process.env.STUDENT_ACCOUNT_ISSUER);
  return service;
}
async function handle(req,res,path,body,{getSessionUser,getSettings,findTeacher}) {
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
    if (!configured()) return send(503,{error:'학생 계정 기능은 아직 준비 중입니다.'});
    const origin=new URL(process.env.STUDENT_ACCOUNT_ORIGIN).origin;
    const secure=origin.startsWith('https:');
    if (req.method!=='GET') S.sameOrigin(req,origin);
    const api=getService();
    const token=parseCookies(req)[`${secure?'__Host-':''}moakit_student_session`];
    if (path==='/api/student-accounts/logout' && req.method==='POST') {
      await api.logout(token);res.setHeader('Set-Cookie',S.cookie('',secure,0));return send(200,{ok:true});
    }
    const settings=await getSettings();
    if (!settings.site_open) return send(403,{error:'site_closed'});
    if (path==='/api/student-accounts/login' && req.method==='POST') {
      const result=await api.login(body?.username,body?.password,req.socket?.remoteAddress||'unknown');
      res.setHeader('Set-Cookie',S.cookie(result.token,secure));return send(200,{mustChangePassword:result.mustChangePassword});
    }
    if (path==='/api/student-accounts/me' && req.method==='GET') {
      const a=await api.me(token);return send(200,{username:a.username,mustChangePassword:a.must_change_password});
    }
    if (path==='/api/student-accounts/password' && req.method==='POST') {
      await api.changePassword(token,body?.current,body?.next);res.setHeader('Set-Cookie',S.cookie('',secure,0));return send(200,{ok:true});
    }
    const session=await getSessionUser(req);
    if (!session || !['admin','teacher'].includes(session.user.role)) S.fail(401,'교사 로그인이 필요합니다.');
    const user=session.user;
    if (path==='/api/student-accounts/schools') {
      if (req.method==='GET') return send(200,{schools:await api.schools(user)});
      if (req.method==='POST') return send(201,await api.createSchool(user,body?.name));
    }
    const m=/^\/api\/student-accounts\/schools\/([0-9a-f-]+)\/(students|managers)(?:\/([0-9a-f-]+)(\/reset)?)?$/.exec(path);
    if (!m) return send(404,{error:'찾을 수 없습니다.'});
    const [,school,resource,id,reset]=m;
    if (resource==='managers' && !id && req.method==='POST') {
      if (typeof body?.teacherId!=='string'||!/^\d{1,18}$/.test(body.teacherId)) S.fail(400,'교사 ID를 확인하세요.');
      const teacher=await findTeacher(body.teacherId);
      if (!teacher || !teacher.active || !['teacher','admin'].includes(teacher.role)) S.fail(400,'활성 교사 계정을 확인하세요.');
      await api.grantManager(user,school,body.teacherId);return send(200,{ok:true});
    }
    if (resource==='students') {
      if (!id && req.method==='GET') return send(200,{students:await api.list(user,school)});
      if (!id && req.method==='POST') return send(201,{students:await api.provision(user,school,body?.students)});
      if (id && reset && req.method==='POST') return send(200,await api.reset(user,school,id));
      if (id && !reset && req.method==='PATCH') {await api.updateMember(user,school,id,body||{});return send(200,{ok:true});}
    }
    return send(405,{error:'허용되지 않은 요청입니다.'});
  } catch(e) {return send(e.status||500,{error:e.status?e.message:'학생 계정 처리 중 오류가 발생했습니다.'});}
}
module.exports={handle,configured};
