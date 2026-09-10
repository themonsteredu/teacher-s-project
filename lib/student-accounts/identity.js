'use strict';
const S = require('./security');

// Only the host-scoped, server-issued cookie selects an account session. Do not
// accept tokens/UUIDs from request bodies, query parameters or client storage.
function createIdentityHelpers({getConfig,getService}) {
  function credentials(req, required) {
    const config=getConfig();
    const secure=Boolean(config.origin?.startsWith('https:'));
    const name=`${secure?'__Host-':''}moakit_student_session`;
    const cookies=String(req.headers?.cookie||'').split(';').map(value=>{
      const index=value.indexOf('=');
      return index<0?[value.trim(),'']:[value.slice(0,index).trim(),value.slice(index+1).trim()];
    }).filter(([key])=>key==='moakit_student_session'||key==='__Host-moakit_student_session');
    if (!cookies.length && !required) return null;
    if (!config.enabled || !config.origin) S.fail(503,'학생 계정 연결 설정이 필요합니다.');
    if (cookies.length!==1 || cookies[0][0]!==name || !/^[a-f0-9]{64}$/.test(cookies[0][1])) S.fail(401,'학생 로그인이 필요합니다.');
    return {api:getService(config),token:cookies[0][1]};
  }
  return {
    async resolveStudent(req,{required=false}={}) {
      const c=credentials(req,required);
      return c?c.api.resolveStudent(c.token):null;
    },
    async authorizeStudent(req,schoolId) {
      const c=credentials(req,true);return c.api.authorizeStudent(c.token,schoolId);
    },
    async authorizeSchool(user,schoolId) {
      const config=getConfig();
      if (!config.enabled || !config.origin) S.fail(503,'학생 계정 연결 설정이 필요합니다.');
      return getService(config).authorizeSchool(user,schoolId);
    },
    async readRecords(req,options) {
      const c=credentials(req,true);return c.api.readRecords(c.token,options);
    },
    async logoutStudent(req,res) {
      const c=credentials(req,false);
      if (!c) return;
      await c.api.logout(c.token);
      const clear=S.cookie('',getConfig().origin.startsWith('https:'),0);
      const existing=res.getHeader?.('Set-Cookie');
      res.setHeader('Set-Cookie',existing?[...(Array.isArray(existing)?existing:[existing]),clear]:clear);
    },
  };
}
module.exports={createIdentityHelpers};
