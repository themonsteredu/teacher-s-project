import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { originAllowed, resolveIntegration } = require('../lib/career-log-integrations');
const scienceApp = readFileSync(new URL('../public/lessons/초2-인공지능/3차시-학생용-감각짝맞추기.html', import.meta.url), 'utf8');

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
