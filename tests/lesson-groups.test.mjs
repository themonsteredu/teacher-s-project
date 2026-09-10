import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const start = app.indexOf('const lessonLabel = ');
const source = app.slice(start, app.indexOf('\n}\n', app.indexOf('function groupByLesson(', start)) + 3);
const context = vm.createContext({ esc: v => String(v ?? '').replaceAll('<', '&lt;') });
vm.runInContext(source, context);
// vm 안에서 만든 배열은 프로토타입이 달라 deepStrictEqual이 실패하므로 JSON으로 평면화한다
const group = (items, lessons) => JSON.parse(JSON.stringify(vm.runInContext('groupByLesson', context)(items, lessons)));

const lessons = [{ id: 11, title: 'AI 단서를 찾아라!' }, { id: 12, title: '2차시 · 로봇 길 찾기' }, { id: 13, title: '<b>주의</b>' }];

test('전체 탭 묶음은 공통 자료가 먼저, 그다음 차시 순서이고 빈 차시는 빠진다', () => {
  const items = [{ id: 1, lesson_id: 12 }, { id: 2, lesson_id: null }, { id: 3, lesson_id: 11 }, { id: 4, lesson_id: 11 }];
  const groups = group(items, lessons);
  assert.deepEqual(groups.map(g => [g.name, g.items.map(i => i.id)]), [
    ['공통 자료', [2]], ['1차시 · AI 단서를 찾아라!', [3, 4]], ['2차시 · 로봇 길 찾기', [1]],
  ]);
  assert.equal(groups[0].common, true);
  assert.equal(groups[1].common, undefined);
});

test('사라진 차시에 남은 항목은 머리말 없이 맨 뒤로 가고, 차시 이름은 이스케이프된다', () => {
  const groups = group([{ id: 9, lesson_id: 99 }, { id: 8, lesson_id: 13 }], lessons);
  assert.deepEqual(groups.map(g => g.name), ['3차시 · &lt;b>주의&lt;/b>', '']);
  assert.deepEqual(groups[1].items.map(i => i.id), [9]);
});

test('공통 자료도 차시 항목도 없으면 빈 배열', () => {
  assert.deepEqual(group([], lessons), []);
});
