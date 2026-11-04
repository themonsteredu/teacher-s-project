'use strict';
// Source files are version-controlled; the served/uploadable HTML remains self-contained.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const questionsFile = path.join(root, 'lessons-src/grade2-ai-01/questions.json');
const runtimeFile = path.join(root, 'lessons-src/quiz-engine/student-quiz.js');
const outputFile = path.join(root, 'public/lessons/초2-인공지능/1차시-학생용-AI퀴즈.html');
const begin = '/* BEGIN GENERATED QUIZ SCRIPT: npm run lesson:build */\n';
const end = '/* END GENERATED QUIZ SCRIPT */';
const source = JSON.parse(fs.readFileSync(questionsFile, 'utf8'));
if (source.version !== 1 || !Array.isArray(source.questions) || !source.questions.length || source.questions.length > 50 || source.questions.some(q => !q || typeof q.emoji !== 'string' || !q.emoji.trim() || typeof q.name !== 'string' || !q.name.trim() || typeof q.ai !== 'boolean' || typeof q.why !== 'string' || !q.why.trim())) throw Error('퀴즈 문제의 형식을 확인하세요.');
const html = fs.readFileSync(outputFile, 'utf8');
const first = html.indexOf(begin), last = html.indexOf(end);
if (first < 0 || last < first || html.indexOf(begin, first + 1) !== -1 || html.indexOf(end, last + 1) !== -1) throw Error('HTML의 생성 영역을 확인하세요.');
const safeJson = JSON.stringify(source.questions, null, 2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const script = `const QUIZ = ${safeJson};\n${fs.readFileSync(runtimeFile, 'utf8')}`;
if (/<\/script/i.test(script)) throw Error('스크립트를 종료하는 문구를 확인하세요.');
const built = html.slice(0, first + begin.length) + script + html.slice(last);
if (process.argv.includes('--check')) {
  if (built !== html) { console.error('퀴즈 원본과 실행 HTML이 다릅니다. npm run lesson:build를 실행하세요.'); process.exitCode = 1; }
  else console.log('초2 AI 1차시 원본과 실행 HTML 일치');
} else { fs.writeFileSync(outputFile, built); console.log('초2 AI 1차시 실행 HTML 생성 완료'); }
