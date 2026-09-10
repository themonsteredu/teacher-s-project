import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { originAllowed, resolveIntegration } = require('../lib/career-log-integrations');
const { parseCookies } = require('../lib/cookies');
const scienceApp = readFileSync(new URL('../public/lessons/초2-인공지능/3차시-학생용-감각짝맞추기.html', import.meta.url), 'utf8');
const hubApp = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const careerStudent = readFileSync(new URL('../public/career-student-id.js', import.meta.url), 'utf8');
const careerRoute = readFileSync(new URL('../lib/career-log.js', import.meta.url), 'utf8');
const hubApi = readFileSync(new URL('../lib/api.js', import.meta.url), 'utf8');
const vercelConfig = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');

test('keeps History AI compatible while selecting the science observation integration explicitly', () => {
  assert.equal(resolveIntegration().programRef, 'history-ai-01');
  assert.equal(resolveIntegration('science-observation-ai-03').programRef, 'science-observation-ai-03');
  assert.equal(resolveIntegration('unknown-program'), null);
  assert.equal(resolveIntegration('constructor'), null);
  assert.equal(resolveIntegration('__proto__'), null);
});

test('science observation UI uses the protected board path and keeps actual observation input', () => {
  assert.match(scienceApp, /CAREER_PROGRAM_REF='science-observation-ai-03'/);
  assert.match(scienceApp, /science-career/);
  assert.match(scienceApp, /activity:'plant-observation'/);
  assert.match(scienceApp, /observation:\{plant_name:plant,features:feat\}/);
  assert.match(scienceApp, /reflection:null/);
  assert.doesNotMatch(scienceApp, /student_id|plantObs_|career_lens|fit_score|ability_score|career_recommendation/i);
});

test('normal Hub join trusts only the server context and keeps account UUIDs out of app URLs', () => {
  const join = hubApp.slice(hubApp.indexOf("route(/^#\\/board\\/"),hubApp.indexOf('/* ---------------- 내 수업 대시보드'));
  assert.doesNotMatch(join, /getOrCreate|searchParams.*student_id|candidateStudentId/);
  assert.match(hubApp, /target\.searchParams\.set\('hub_code', code\)/);
  assert.doesNotMatch(hubApp, /target\.searchParams\.set\('student_id'/);
  assert.match(hubApi, /joinContext\(req,res,ctx.params\[0\]\)/);
  assert.doesNotMatch(hubApi, /moakit_career_student_id/);
  assert.match(hubApi, /Cache-Control', 'no-store'/);
});

test('malformed unrelated cookies do not block public board identity parsing', () => {
  assert.deepEqual(parseCookies({ headers: { cookie: 'broken=%E0%A4%A; moakit_career_student_id=11111111-1111-4111-8111-111111111111' } }), {
    broken: '%E0%A4%A',
    moakit_career_student_id: '11111111-1111-4111-8111-111111111111',
  });
});

test('Career Log ingest follows the Hub site, board, and program access switches', () => {
  assert.match(careerRoute, /getSettings\(\)/);
  assert.match(careerRoute, /!settings\.site_open/);
  assert.match(careerRoute, /!board\.is_open/);
  assert.match(careerRoute, /!board\.published/);
  assert.match(careerRoute, /JOIN program_links pl ON pl\.id = bi\.link_id/);
  assert.match(careerRoute, /bi\.board_id = \$1/);
  assert.deepEqual(JSON.parse(vercelConfig).rewrites[0], {
    destination: '/career-log-ingest', source: '/api/career-log/ingest',
  });
});

test('scopes each integration to its app origin and assigned Hub link', () => {
  const history = resolveIntegration('history-ai-01');
  const science = resolveIntegration('science-observation-ai-03');

  assert.equal(originAllowed('https://ai-history-ar.vercel.app', history), true);
  assert.equal(originAllowed('https://hub.moakit.ai', history), false);
  assert.equal(originAllowed('https://hub.moakit.ai', science), true);
  assert.equal(originAllowed('https://evil.example', science), false);
  assert.equal(science.linkMatches({ label: '학생용 감각짝맞추기 체험', url: '/lessons/초2-인공지능/3차시-학생용-감각짝맞추기.html' }), true);
  assert.equal(science.linkMatches({ label: '관찰 활동', url: 'https://hub.moakit.ai/lessons/%EC%B4%882-%EC%9D%B8%EA%B3%B5%EC%A7%80%EB%8A%A5/3%EC%B0%A8%EC%8B%9C-%ED%95%99%EC%83%9D%EC%9A%A9-%EA%B0%90%EA%B0%81%EC%A7%9D%EB%A7%9E%EC%B6%94%EA%B8%B0.html' }), true);
  assert.equal(science.linkMatches({ label: '다른 앱', url: '/other.html' }), false);
});
