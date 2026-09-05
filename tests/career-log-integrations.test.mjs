import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { originAllowed, resolveIntegration } = require('../lib/career-log-integrations');
const scienceApp = readFileSync(new URL('../public/lessons/초2-인공지능/3차시-학생용-감각짝맞추기.html', import.meta.url), 'utf8');
const hubApp = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const careerStudent = readFileSync(new URL('../public/career-student-id.js', import.meta.url), 'utf8');
const careerRoute = readFileSync(new URL('../lib/career-log.js', import.meta.url), 'utf8');

test('keeps History AI compatible while selecting the science observation integration explicitly', () => {
  assert.equal(resolveIntegration().programRef, 'history-ai-01');
  assert.equal(resolveIntegration('science-observation-ai-03').programRef, 'science-observation-ai-03');
  assert.equal(resolveIntegration('unknown-program'), null);
});

test('science observation UI sends only the real observation through the shared Career Log route', () => {
  assert.match(scienceApp, /CAREER_PROGRAM_REF='science-observation-ai-03'/);
  assert.match(scienceApp, /fetch\('\/api\/career-log\/ingest'/);
  assert.match(scienceApp, /activity:'plant-observation'/);
  assert.match(scienceApp, /observation:\{plant_name:plant,features:feat\|\|null\}/);
  assert.match(scienceApp, /reflection:null/);
  assert.doesNotMatch(scienceApp, /career_lens|fit_score|ability_score|career_recommendation/i);
});

test('Hub board creates a browser UUID and passes it only to assigned Career Log apps', () => {
  assert.match(hubApp, /careerMaterialUrl\(l, code, studentId\)/);
  assert.match(hubApp, /MoakitCareerStudent\?\.getOrCreate/);
  assert.match(hubApp, /target\.searchParams\.set\('hub_code', code\)/);
  assert.match(hubApp, /target\.searchParams\.set\('student_id', studentId\)/);
  assert.match(hubApp, /ai-history-ar\.vercel\.app/);
  assert.match(careerStudent, /randomUUID/);
  assert.match(careerStudent, /sessionStorage/);
  assert.match(scienceApp, /\^\[a-z0-9\]\{4,10\}\$/i);
  assert.match(scienceApp, /hub_code'\)\|\|'\'\)\.trim\(\)\.toLowerCase\(\)/);
});

test('Career Log ingest follows the Hub site, board, and program access switches', () => {
  assert.match(careerRoute, /getSettings\(\)/);
  assert.match(careerRoute, /!settings\.site_open/);
  assert.match(careerRoute, /!board\.is_open/);
  assert.match(careerRoute, /!board\.published/);
});

test('scopes each integration to its app origin and assigned Hub link', () => {
  const history = resolveIntegration('history-ai-01');
  const science = resolveIntegration('science-observation-ai-03');

  assert.equal(originAllowed('https://ai-history-ar.vercel.app', history), true);
  assert.equal(originAllowed('https://hub.moakit.ai', history), false);
  assert.equal(originAllowed('https://hub.moakit.ai', science), true);
  assert.equal(originAllowed('https://evil.example', science), false);
  assert.equal(science.linkMatches({ label: '학생용 감각짝맞추기 체험', url: '/lessons/초2-인공지능/3차시-학생용-감각짝맞추기.html' }), true);
  assert.equal(science.linkMatches({ label: '다른 앱', url: '/other.html' }), false);
});
