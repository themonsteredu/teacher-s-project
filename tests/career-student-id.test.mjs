import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { STORAGE_KEY, getOrCreate, isStudentId, resetMemoryForTests } = require('../public/career-student-id');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('creates a random school-independent UUID and retains it in the same browser', () => {
  resetMemoryForTests();
  const local = storage();
  const first = getOrCreate({ localStorage: local, sessionStorage: storage(), crypto });
  const second = getOrCreate({ localStorage: local, sessionStorage: storage(), crypto });
  assert.equal(isStudentId(first), true);
  assert.equal(second, first);
  assert.equal(STORAGE_KEY, 'moakit-career-student-id-v1');
  assert.doesNotMatch(STORAGE_KEY, /school|student.?name|class|board|code/i);
});

test('uses an inbound Hub UUID only for a fresh browser and never overwrites an existing identity', () => {
  resetMemoryForTests();
  const existing = '2d743c29-3483-46b6-89fb-086db077367f';
  const inbound = '1bb83fa3-7f39-4ac4-90af-5518025015c1';
  const fresh = storage();
  assert.equal(getOrCreate({ candidate: inbound, localStorage: fresh, sessionStorage: storage(), crypto }), inbound);
  const occupied = storage({ [STORAGE_KEY]: existing });
  assert.equal(getOrCreate({ candidate: inbound, localStorage: occupied, sessionStorage: storage(), crypto }), existing);
});

test('storage failures do not block UUID creation', () => {
  resetMemoryForTests();
  const broken = { getItem() { throw new Error('privacy mode'); }, setItem() { throw new Error('privacy mode'); } };
  const id = getOrCreate({ localStorage: broken, sessionStorage: broken, crypto });
  assert.equal(isStudentId(id), true);
});

test('a sandbox without Web Crypto uses the random UUID supplied by the Hub join response', () => {
  resetMemoryForTests();
  const candidate = 'b4c618df-a119-455d-b0cf-d93b16523f18';
  const id = getOrCreate({ candidate, localStorage: null, sessionStorage: null, crypto: null });
  assert.equal(id, candidate);
});
