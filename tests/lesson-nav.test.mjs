import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const start = app.indexOf('const lessonLabel = ');
const source = app.slice(start, app.indexOf('\n}\n', app.indexOf('function lessonNavItems(', start)) + 3);
const context = vm.createContext({ esc: v => String(v ?? '').replaceAll('<', '&lt;') });
vm.runInContext(source, context);
// vm 안에서 만든 배열은 프로토타입이 달라 deepStrictEqual이 실패하므로 JSON으로 평면화한다
const nav = (...args) => JSON.parse(JSON.stringify(vm.runInContext('lessonNavItems', context)(...args)));

const lessons = [{ id: 11, title: 'AI 단서를 찾아라!', topic: '인공지능이란 무엇일까?' }, { id: 12, title: '2차시 · 로봇 길 찾기' }, { id: 13, title: '<b>주의</b>' }];
const links = [{ id: 1, lesson_id: 11 }, { id: 2, lesson_id: 11 }, { id: 3, lesson_id: null }, { id: 4, lesson_id: 12 }];
const files = [{ id: 5, lesson_id: null }, { id: 6, lesson_id: 11 }];

test('세로 차시 목록은 수업 소개 → 공통 자료 → 차시 순이고, 묶음마다 링크+첨부 수를 센다', () => {
  assert.deepEqual(nav(lessons, links, files), [
    { key: 'all', name: '수업 소개' },
    { key: 0, name: '공통 자료', count: 2 },
    { key: 11, name: '1차시 · AI 단서를 찾아라!', topic: '인공지능이란 무엇일까?', count: 3 },
    { key: 12, name: '2차시 · 로봇 길 찾기', topic: '', count: 1 },
    { key: 13, name: '3차시 · &lt;b>주의&lt;/b>', topic: '', count: 0 },
  ]);
});

test('자료가 하나도 없어도 목록 자체는 나온다', () => {
  assert.deepEqual(nav(lessons, [], []).map(n => n.count), [undefined, 0, 0, 0, 0]);
});

// 본문 묶음: 소개 아래에 공통 자료 → 1차시 → … 순으로 쌓인다
const sectionSrc = app.slice(app.indexOf('function lessonSections('), app.indexOf('\n}\n', app.indexOf('function lessonSections(')) + 3);
vm.runInContext(sectionSrc, context);
// vm 안에서 만든 배열은 프로토타입이 달라 deepEqual이 실패하므로 값은 JSON으로 평면화해 비교한다
const sections = vm.runInContext('lessonSections', context)(lessons);
const flat = (v) => JSON.parse(JSON.stringify(v));

test('본문 묶음은 공통 자료가 먼저, 그다음 차시 순이다', () => {
  assert.deepEqual(flat(sections.map((s) => [s.key, s.name])), [
    [0, '공통 자료'],
    [11, '1차시 · AI 단서를 찾아라!'],
    [12, '2차시 · 로봇 길 찾기'],
    [13, '3차시 · &lt;b>주의&lt;/b>'],
  ]);
});

test('묶음의 match는 그 묶음 자료만 고른다 — 공통은 차시가 없는 것', () => {
  assert.deepEqual(links.filter(sections[0].match).map((l) => l.id), [3]);
  assert.deepEqual(links.filter(sections[1].match).map((l) => l.id), [1, 2]);
  assert.deepEqual(files.filter(sections[0].match).map((f) => f.id), [5]);
  assert.deepEqual(files.filter(sections[1].match).map((f) => f.id), [6]);
  assert.deepEqual(links.filter(sections[3].match), []);
});

test('차시에 주제가 없으면 빈 문자열이라 화면에 주제 줄이 생기지 않는다', () => {
  assert.deepEqual(flat(sections.map((s) => s.topic)), ['모든 차시에서 함께 쓰는 자료', '인공지능이란 무엇일까?', '', '']);
});
