'use strict';

const HISTORY_ORIGINS = [
  /^https:\/\/ai-history-ar\.vercel\.app$/,
  /^https:\/\/ai-history-[a-z0-9-]+-themonsteredu\.vercel\.app$/,
];
const HUB_ORIGINS = [
  /^https:\/\/hub\.moakit\.ai$/,
  /^https:\/\/teacher-s-project-[a-z0-9-]+-themonsteredu\.vercel\.app$/,
];

const INTEGRATIONS = {
  'history-ai-01': {
    programRef: 'history-ai-01',
    origins: HISTORY_ORIGINS,
    sourceEventPrefix: 'history-ai-01:',
    linkMatches: (link) => /ai-history-ar/i.test(link.url) || /역사.*AI/i.test(link.label),
  },
  'science-observation-ai-03': {
    programRef: 'science-observation-ai-03',
    origins: HUB_ORIGINS,
    sourceEventPrefix: 'science-observation-ai-03:',
    linkMatches: (link) => scienceLessonPath(link.url) || /감각짝맞추기|자연을 관찰하는 AI/i.test(link.label),
  },
};

function scienceLessonPath(rawUrl) {
  try {
    const pathname = decodeURIComponent(new URL(String(rawUrl || ''), 'https://hub.moakit.ai').pathname);
    return /3차시-학생용-감각짝맞추기\.html$/i.test(pathname);
  } catch {
    return false;
  }
}

function resolveIntegration(programRef) {
  const key = programRef || 'history-ai-01';
  return Object.prototype.hasOwnProperty.call(INTEGRATIONS, key) ? INTEGRATIONS[key] : null;
}

function originAllowed(origin, integration = null) {
  const candidates = integration ? [integration] : Object.values(INTEGRATIONS);
  return candidates.some((candidate) => candidate.origins.some((pattern) => pattern.test(origin)));
}

module.exports = { INTEGRATIONS, originAllowed, resolveIntegration };
