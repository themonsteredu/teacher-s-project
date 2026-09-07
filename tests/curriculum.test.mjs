import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../public/curriculum');
const links = [
  { school: 'elementary', grade: 2, subject: '국어' },
  { school: 'elementary', grade: 3, subject: '과학' },
];

test('explicit links preserve their pairing and normalize without mutating input', () => {
  const input = { links: [...links, { ...links[0], subject: ' 국어 ' }], topic: ' AI와 이야기 ', purpose: 'teaching' };
  const result = C.normalize(input);
  assert.deepEqual(result, { links, topic: 'AI와 이야기', purpose: 'teaching' });
  assert.equal(input.links.length, 3);
  const program = { curriculum: result };
  assert.equal(C.matches(program, { school: 'elementary', grade: 2, subject: '국어' }), true);
  assert.equal(C.matches(program, { school: 'elementary', grade: 2, subject: '과학' }), false);
  assert.equal(C.matches(program, { school: 'elementary', grade: 3, subject: '국어' }), false);
  assert.equal(C.matches(program, { school: 'elementary', grade: '3' }), true);
});

test('legacy grades are retained only when explicit curriculum is absent; category is not guessed', () => {
  assert.deepEqual(C.forProgram({ grade: '초2', category: 'AI 국어' }), { links: [{ school: 'elementary', grade: 2, subject: '' }], topic: '', purpose: 'teaching' });
  assert.deepEqual(C.forProgram({ grade: '중3' }).links, [{ school: 'middle', grade: 3, subject: '' }]);
  assert.equal(C.forProgram({ grade: '고1' }).links[0].school, 'high');
  for (const grade of ['', '중4', '초7', '초2,초3', '초등 2학년']) assert.deepEqual(C.forProgram({ grade }).links, []);
  assert.deepEqual(C.forProgram({ grade: '초2', curriculum: { links: [] } }).links, []);
  assert.deepEqual(C.forProgram({ grade: '초2', curriculum: null }).links, []);
  assert.doesNotMatch(C.searchText({ grade: '초5', curriculum: { links } }), /초5/);
  assert.match(C.searchText({ grade: '초5', curriculum: { links } }), /초2/);
  assert.doesNotMatch(C.searchText({ grade: '초5', curriculum: { links: [] } }), /초5/);
});

test('unclassified, test and unspecified-subject filters are distinct', () => {
  const legacy = { grade: '초2' }, classified = { curriculum: { links, purpose: 'test' } };
  assert.equal(C.matches(legacy, { school: 'elementary', grade: 2, subject: '' }), true);
  assert.equal(C.matches(classified, { school: 'elementary', grade: 2, subject: '' }), false);
  assert.equal(C.matches(legacy, { kind: 'unclassified' }), false);
  assert.equal(C.matches({ title: 'Career Log E2E' }, { kind: 'test' }), false);
  assert.equal(C.matches(classified, { kind: 'test' }), true);
  assert.equal(C.matches(classified, {}), true);
  assert.equal(C.matches({}, { kind: 'unclassified' }), true);
});

test('invalid classifications fail before persistence with a useful 400', () => {
  for (const input of [null, [], '국어', { links: {} }, { links: [null] }, { links: [{ school: 'unknown', grade: 2 }] },
    { links: [{ school: 'middle', grade: 4 }] }, { links: [{ school: 'high', grade: '2' }] },
    { links: [{ school: 'elementary', grade: 1, subject: 3 }] }, { links: [{ school: 'elementary', grade: 1, subject: 'x'.repeat(41) }] },
    { links: [{ school: 'elementary', grade: 1, subject: '국어\n수학' }] }, { links: Array.from({ length: 41 }, () => links[0]) },
    { topic: 'x'.repeat(121) }, { topic: null }, { purpose: 'recommendation' }]) {
    assert.throws(() => C.normalize(input), e => e.status === 400);
  }
});

test('browser and server use the same labels, filters and search text', () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../public/curriculum.js', import.meta.url), 'utf8'), context);
  const p = { title: 'AI 글쓰기', category: '융합', curriculum: { links, topic: '이야기 만들기' } };
  assert.deepEqual(JSON.parse(JSON.stringify(context.Curriculum.normalize(p.curriculum))), C.normalize(p.curriculum));
  assert.equal(context.Curriculum.searchText(p), C.searchText(p));
  assert.match(C.searchText(p), /이야기 만들기/);
  assert.match(C.searchText(p), /초2/);
  assert.equal(C.linkLabel(links[0]), '초등학교 2학년 · 국어');
});
