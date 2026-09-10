import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { parseRoster, csv, safeFilePart } = require('../public/account-roster.js');
const selectedClass = { mode: 'class', grade: 2, classNumber: 3 };

test('one-class Excel paste uses the selected grade/class and keeps same-name students with different numbers', () => {
  assert.deepEqual(parseRoster('\uFEFF번호\t이름\r\n1\t김하나\r\n\r\n2\t김하나\r\n', selectedClass), [
    { grade: 2, classNumber: 3, studentNumber: 1, displayName: '김하나' },
    { grade: 2, classNumber: 3, studentNumber: 2, displayName: '김하나' },
  ]);
});

test('school CSV maps exact headers in any order and supports escaped quotes and commas', () => {
  assert.deepEqual(parseRoster('학생이름,번호,반,학년\n"김,하나 ""별""",01,2,3\n박세나,1,3,3', { mode: 'school' }), [
    { grade: 3, classNumber: 2, studentNumber: 1, displayName: '김,하나 "별"' },
    { grade: 3, classNumber: 3, studentNumber: 1, displayName: '박세나' },
  ]);
});

test('headerless class CSV and school TSV normalize numeric fields', () => {
  assert.deepEqual(parseRoster('01, 김하나 ', selectedClass), [{ grade: 2, classNumber: 3, studentNumber: 1, displayName: '김하나' }]);
  assert.deepEqual(parseRoster('2\t03\t001\t이두나', { mode: 'school' }), [{ grade: 2, classNumber: 3, studentNumber: 1, displayName: '이두나' }]);
});

test('blank rows preserve physical line numbers for an incomplete student', () => {
  assert.throws(() => parseRoster('번호\t이름\r\n\r\n1\t김하나\r\n2\t', selectedClass), /4행: 이름/);
  assert.throws(() => parseRoster('학년,반,번호,이름\n2,1,1', { mode: 'school' }), /2행: 학년, 반, 번호, 이름 네 칸/);
});

test('school data cannot override one-class grade/class selection', () => {
  assert.throws(() => parseRoster('2,1,1,김하나', selectedClass), /1행: 번호와 이름 두 칸/);
  assert.throws(() => parseRoster('1,김하나', { mode: 'class', grade: 7, classNumber: 1 }), /1행: 선택한 학년/);
});

test('only complete exact headers are treated as headers', () => {
  assert.throws(() => parseRoster('학년,반,학번,이름\n2,1,1,김하나', { mode: 'school' }), /1행: 학년/);
  assert.throws(() => parseRoster('학년,반,번호,번호\n2,1,1,김하나', { mode: 'school' }), /1행: 학년/);
});

test('empty and header-only input explain that student rows are needed', () => {
  assert.throws(() => parseRoster('\uFEFF\r\n \r\n', selectedClass), /1행: 학생 명단이 비어/);
  assert.throws(() => parseRoster('번호,이름\n', selectedClass), /1행: 제목 아래/);
});

test('same grade/class/number is rejected even if names differ', () => {
  assert.throws(() => parseRoster('번호,이름\n1,김하나\n01,박세나', selectedClass), /3행: 2학년 3반 1번이 2행과 중복/);
});

test('100 students are accepted and student 101 is rejected with its line number', () => {
  const rows = Array.from({ length: 101 }, (_, i) => `${i + 1},학생${i + 1}`);
  assert.equal(parseRoster(rows.slice(0, 100).join('\n'), selectedClass).length, 100);
  assert.throws(() => parseRoster(`번호,이름\n${rows.join('\n')}`, selectedClass), /102행: 한 번에 최대 100명/);
});

test('numeric ranges reject missing numbers, exponents, decimals and invalid grades', () => {
  for (const value of ['', '0', '-1', '1.5', '1e2', '1000', '1번']) {
    assert.throws(() => parseRoster(`${value},학생`, selectedClass), /1행: 번호는/);
  }
  assert.throws(() => parseRoster('7,1,1,학생', { mode: 'school' }), /1행: 학년/);
  assert.throws(() => parseRoster('1,100,1,학생', { mode: 'school' }), /1행: 반은/);
});

test('malformed quoted input is rejected without silently moving columns', () => {
  assert.throws(() => parseRoster('1,"김하나', selectedClass), /1행: 닫히지 않은 따옴표/);
  assert.throws(() => parseRoster('1,"김하나"뒤', selectedClass), /1행: 닫는 따옴표 뒤/);
  assert.throws(() => parseRoster('1,김"하나', selectedClass), /1행: 따옴표 형식/);
  assert.throws(() => parseRoster('1,"김\n하나"\n2,박세나', selectedClass), /1행: 이름은 줄바꿈 없이/);
});

test('CSV delimiter detection ignores commas inside quoted TSV names and leading blank rows', () => {
  assert.deepEqual(parseRoster('\r\n1\t"김,하나"', selectedClass), [{ grade: 2, classNumber: 3, studentNumber: 1, displayName: '김,하나' }]);
});

test('download CSV has UTF-8 BOM, CRLF, full quotes and quote escaping', () => {
  assert.equal(csv(['이름', '아이디'], [['김"하나,학생', 'moa123'], ['이두나', null]]), '\uFEFF"이름","아이디"\r\n"김""하나,학생","moa123"\r\n"이두나",""\r\n');
});

test('download CSV neutralizes formula injection including leading whitespace and controls', () => {
  for (const value of ['=HYPERLINK("bad")', '+cmd', '-1+1', '@SUM(1)', '  =1', '\t+cmd', '\r=1', '\n=1', '\u0000=1', '\ttext']) {
    const encoded = csv(['값'], [[value]]);
    assert.ok(encoded.startsWith('\uFEFF"값"\r\n"\''), JSON.stringify(value));
  }
  assert.equal(csv(['비밀번호'], [['Ab2!-safe']]), '\uFEFF"비밀번호"\r\n"Ab2!-safe"\r\n');
});

test('download CSV refuses mismatched row widths', () => {
  assert.throws(() => csv(['이름', '번호'], [['김하나']]), /열 수/);
});

test('filename components remove separators, controls, reserved punctuation and excessive length', () => {
  assert.equal(safeFilePart('../학교\\2반:\u0000?. '), '학교2반');
  assert.equal(safeFilePart('...'), '학생계정');
  assert.equal(safeFilePart('가'.repeat(100)).length, 60);
  assert.equal(safeFilePart('가\u202E학교'), '가학교');
});

test('the same helper is available in a browser without Node dependencies', async () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(await readFile(new URL('../public/account-roster.js', import.meta.url), 'utf8'), context);
  assert.equal(typeof context.window.AccountRoster.parseRoster, 'function');
  assert.equal(context.window.AccountRoster.parseRoster('1,김하나', selectedClass)[0].studentNumber, 1);
});
