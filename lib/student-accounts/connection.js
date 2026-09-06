'use strict';
const { Client } = require('pg');
const S = require('./security');

function accountConnectionOptions({ databaseUrl, databasePassword }) {
  if (!databaseUrl) S.fail(503, '학생 계정 연결 설정이 필요합니다.');
  const options = { connectionString: databaseUrl, max: 2, application_name: 'moakit-student-accounts' };
  if (databasePassword === undefined) return options;
  if (typeof databasePassword !== 'string' || databasePassword.length === 0) {
    S.fail(503, '학생 계정 DB 비밀번호 설정이 필요합니다.');
  }

  // Parse connection settings exactly as pg does, then supply the password as a
  // literal field. Never encode, decode or trim the separate secret. Omitting
  // connectionString prevents its old password (including a query override)
  // from overriding the explicitly supplied password in the real pool client.
  const params = new Client({ connectionString: databaseUrl }).connectionParameters;
  return { ...params, password: databasePassword, max: 2, application_name: options.application_name };
}

module.exports = { accountConnectionOptions };
