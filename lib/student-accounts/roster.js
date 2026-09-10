'use strict';

// Human-readable membership metadata, never an account or Career identity.
// Keep the existing class_name column compatible with already deployed databases.
function fail(message) { throw Object.assign(new Error(message), {status:400}); }
function integer(value, max, label) {
  if (!['number','string'].includes(typeof value) || !/^\d+$/.test(String(value).trim()) || !Number.isSafeInteger(Number(value)) || Number(value)<1 || Number(value)>max) fail(`${label}${label==='번호'?'는':'은'} 1~${max} 사이의 숫자로 입력하세요.`);
  return Number(value);
}
function fromLabel(value) {
  const match = typeof value==='string' ? /^(\d{1,2})학년 +(\d{1,2})반 +(\d{1,3})번$/.exec(value) : null;
  if (!match) return {grade:null,classNumber:null,studentNumber:null};
  const [grade,classNumber,studentNumber]=match.slice(1).map(Number);
  return grade>=1&&grade<=6&&classNumber>=1&&classNumber<=99&&studentNumber>=1&&studentNumber<=999
    ? {grade,classNumber,studentNumber} : {grade:null,classNumber:null,studentNumber:null};
}
function normalize(row) {
  if (!row || typeof row.displayName!=='string' || !row.displayName.trim() || row.displayName.trim().length>80 || /[\u0000-\u001F\u007F]/.test(row.displayName.trim())) fail('학생 이름을 줄바꿈 없이 1~80자로 입력하세요.');
  const displayName=row.displayName.trim();
  // Legacy rows round-trip through list/edit with nullable structured fields.
  // A partial structured value still requires all three valid numbers.
  if (['grade','classNumber','studentNumber'].some(key=>row[key]!==undefined&&row[key]!==null)) {
    const grade=integer(row.grade,6,'학년'),classNumber=integer(row.classNumber,99,'반'),studentNumber=integer(row.studentNumber,999,'번호');
    return {displayName,grade,classNumber,studentNumber,className:`${grade}학년 ${classNumber}반 ${studentNumber}번`};
  }
  if (typeof row.className!=='string' || !row.className.trim() || row.className.trim().length>80 || /[\u0000-\u001F\u007F]/.test(row.className.trim())) fail('학생의 반 정보를 확인하세요.');
  const className=row.className.trim();
  return {displayName,className,...fromLabel(className)};
}
function key(row) {
  const parsed=row.grade&&row.classNumber&&row.studentNumber ? row : fromLabel(row.className||row.class_name);
  return parsed.grade ? `${parsed.grade}학년 ${parsed.classNumber}반 ${parsed.studentNumber}번` : null;
}
function validate(input) {
  if (!Array.isArray(input)||input.length<1||input.length>100) fail('한 번에 1~100명을 등록할 수 있습니다.');
  const rows=input.map(normalize),seen=new Set();
  for (const row of rows) { const value=key(row); if(value&&seen.has(value)) fail(`${value}이 명단에 중복되어 있습니다.`); if(value)seen.add(value); }
  return rows;
}
async function checkAvailable(client,school,rows,excludeId) {
  // Every membership write uses the same school lock: simultaneous issue/edit
  // requests cannot both claim a seat. No schema, policy or identity changes.
  // PostgreSQL UUID comparison is case insensitive; the lock key must be too.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`moakit-account-roster:${String(school).toLowerCase()}`]);
  const result=await client.query('SELECT account_id,class_name FROM moakit_accounts.memberships WHERE school_id=$1 AND active=true',[school]);
  const excluded=excludeId===undefined ? null : String(excludeId).toLowerCase();
  const occupied=new Set((result.rows||[]).filter(row=>excluded===null||String(row.account_id).toLowerCase()!==excluded).map(key).filter(Boolean));
  for (const row of rows) {
    const value=key(row);
    if (value&&occupied.has(value)) throw Object.assign(new Error(`${value}은 이미 등록되어 있습니다. 기존 학생의 소속 정보를 확인하세요.`),{status:409});
  }
}
function compare(a,b) {
  const x=fromLabel(a.class_name),y=fromLabel(b.class_name);
  if(x.grade&&y.grade)return x.grade-y.grade||x.classNumber-y.classNumber||x.studentNumber-y.studentNumber||String(a.display_name).localeCompare(String(b.display_name),'ko');
  if(x.grade||y.grade)return x.grade ? -1 : 1;
  return String(a.class_name).localeCompare(String(b.class_name),'ko',{numeric:true})||String(a.display_name).localeCompare(String(b.display_name),'ko');
}
module.exports={normalize,fromLabel,key,validate,checkAvailable,compare};
