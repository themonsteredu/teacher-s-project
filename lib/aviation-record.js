'use strict';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MISSIONS = {
  'medical-delivery': {
    kind: 'medical_delivery', plans: ['medical-safe', 'medical-fast'], time: 180, targets: 1,
    checks: ['기상·강풍 구역 확인', '의약품 보관함 잠금', '임시 진료소 착륙장 확인'],
  },
  'disaster-search': {
    kind: 'disaster_search', plans: ['search-sweep', 'search-direct'], time: 210, targets: 3,
    checks: ['수색 순서 확인', '촬영·확인 기능 점검', '복귀 착륙장 확인'],
  },
};
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const number = (value, max) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
const count = (value) => number(value, 100000) && Number.isInteger(value);

// Client activity is shape-checked and stored unverified, just like other Career Log apps.
// This validation does not certify hardware use or authenticate the browser's student UUID.
function validAviationSubmission(body, { boardCode, studentId, sourceEventId }) {
  const record = body.raw_data?.record;
  if (body.raw_data?.activity !== 'aviation-flight' || !record || typeof record !== 'object') return false;
  const mission = Object.hasOwn(MISSIONS, record.mission?.id) ? MISSIONS[record.mission.id] : null;
  if (!mission || record.version !== 1 || record.practice !== false || !UUID.test(record.id)) return false;
  if (sourceEventId !== `aviation-mobility-01:${boardCode}:${studentId.toLowerCase()}:${record.id}`) return false;
  if (!text(record.recordedAt, 40) || !Number.isFinite(Date.parse(record.recordedAt)) || Date.parse(record.recordedAt) > Date.now() + 300000) return false;
  if (!text(record.participant, 40) || !text(record.reflection, 240) || body.reflection !== record.reflection) return false;
  if (record.mission.kind !== mission.kind || !text(record.mission.title, 100) || !text(record.mission.role, 100)) return false;
  if (!mission.plans.includes(record.plan?.id) || !text(record.plan?.label, 100) || !text(record.plan?.reason, 240)) return false;
  if (!Array.isArray(record.preflight) || record.preflight.length !== mission.checks.length ||
      !mission.checks.every(label => record.preflight.some(item => item?.label === label && item.checked === true))) return false;
  const outcome = record.outcome;
  if (!outcome || !['COMPLETED', 'EXPIRED'].includes(outcome.status) || outcome.timeLimitSeconds !== mission.time) return false;
  if (!number(outcome.elapsedSeconds, 100000) || !count(outcome.collisionCount) ||
      !count(outcome.corridorViolationCount) || !count(outcome.emergencyActivations)) return false;
  if (!number(outcome.batteryPercent, 100) || !number(outcome.payloadIntegrityPercent, 100) || typeof outcome.handoverCompleted !== 'boolean') return false;
  if (!Array.isArray(outcome.targets) || outcome.targets.length !== mission.targets ||
      !outcome.targets.every(target => text(target?.label, 100) && typeof target.found === 'boolean')) return false;
  if (outcome.status === 'COMPLETED' && (outcome.elapsedSeconds >= mission.time ||
      !outcome.targets.every(target => target.found) || (mission.kind === 'medical_delivery' && !outcome.handoverCompleted))) return false;
  if (outcome.status === 'EXPIRED' && outcome.elapsedSeconds < mission.time) return false;
  const result = record.result;
  if (!result || result.missionId !== record.mission.id || result.completed !== (outcome.status === 'COMPLETED') || !number(result.totalScore, 100)) return false;
  if (!['safety', 'stability', 'landing', 'objective', 'time'].every(key =>
    number(result[key]?.score, 100) && Number.isInteger(result[key]?.stars) && result[key].stars >= 1 && result[key].stars <= 5)) return false;
  return text(result.title, 100) && text(result.profileLabel, 100) && text(result.profileReason, 500) && text(result.careerMessage, 500);
}

module.exports = { validAviationSubmission };
