import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const { parseHTML } = require('linkedom');
const htmlPath = new URL('../public/lessons/초2-인공지능/1차시-학생용-AI퀴즈.html', import.meta.url);
const html = readFileSync(htmlPath, 'utf8');
const source = JSON.parse(readFileSync(new URL('../lessons-src/grade2-ai-01/questions.json', import.meta.url), 'utf8'));
test('생성 HTML은 원본과 일치하고 학생에게 기존 열 문항을 제공한다', () => {
  const r=spawnSync(process.execPath,['scripts/build-lesson-quiz.cjs','--check'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr); assert.equal(source.questions.length,10);
  assert.equal(source.questions[0].name,'AI 스피커'); assert.equal(source.questions[1].ai,false);
  assert.match(html,/BEGIN GENERATED QUIZ SCRIPT/);
  assert.doesNotMatch(html,/<script[^>]+src=/i);
});
test('학생이 첫 문항을 풀고 끝까지 진행해 기존 결과 활동에 진입한다', () => {
  const {window,document}=parseHTML(html);
  const script=html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  const context=vm.createContext({window,document,console,localStorage:{setItem(){}},setTimeout(){},SpeechSynthesisUtterance:function(){},speechSynthesis:{cancel(){},speak(){}},URL,Math});
  vm.runInContext(script,context);
  document.getElementById('soundBtn').click();
  document.getElementById('startBtn').click();
  assert.equal(document.getElementById('qName').textContent,'AI 스피커');
  for (const q of source.questions) {
    document.querySelector(q.ai?'[data-ans="ai"]':'[data-ans="no"]').click();
    assert.equal(document.getElementById('aVerdict').textContent,'정답이에요!');
    document.getElementById('nextBtn').click();
  }
  assert.equal(document.getElementById('endScore').textContent,'10개 중 10개 맞혔어요');
  document.getElementById('toActivityBtn').click();
  assert.equal(document.getElementById('activityView').classList.contains('hide'),false);
});
