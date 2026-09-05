import assert from 'node:assert/strict';
import test from 'node:test';
import careerLog from '../lib/career-log.js';

const valid = {
  student_id: '6de61517-31ea-4a08-95bb-d296b75c1129',
  session_id: '1344b173-96f9-4295-ae6d-67a26f27f819',
  source_event_id: 'a43621fd-ad37-44c1-ae65-6e9f399b60d0',
  occurred_at: new Date().toISOString(),
  group: 1,
  heritage_id: 1,
  heritage: '무령왕릉',
  observation: '아치 모양의 벽돌 입구가 보인다.',
  question: '무령왕릉의 재료와 발견 장소는 어떤 관계가 있을까?',
  clues: ['아치 모양의 벽돌 입구'],
  data_fields: ['재료', '발견 장소'],
};

test('역사 AI 1차시 완료 이벤트만 엄격히 허용한다', () => {
  assert.deepEqual(careerLog.normalizeHistoryLessonOneEvent(valid), valid);
  assert.equal(careerLog.normalizeHistoryLessonOneEvent({ ...valid, heritage: '임의 유산' }), null);
  assert.equal(careerLog.normalizeHistoryLessonOneEvent({ ...valid, student_id: '학번-1' }), null);
  assert.equal(careerLog.normalizeHistoryLessonOneEvent({ ...valid, data_fields: ['직업 태그'] }), null);
});

test('역사 AI 운영·프리뷰 출처만 허용한다', () => {
  assert.equal(careerLog.isAllowedOrigin('https://ai-history-ar.vercel.app'), true);
  assert.equal(careerLog.isAllowedOrigin('https://ai-history-test-themonsteredu.vercel.app'), true);
  assert.equal(careerLog.isAllowedOrigin('https://example.com'), false);
});
