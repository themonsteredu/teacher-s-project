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
    linkMatches: (link) => /3차시-학생용-감각짝맞추기\.html$/i.test(link.url) || /감각짝맞추기|자연을 관찰하는 AI/i.test(link.label),
  },
};

function resolveIntegration(programRef) {
  return INTEGRATIONS[programRef || 'history-ai-01'] || null;
}

function originAllowed(origin, integration = null) {
  const candidates = integration ? [integration] : Object.values(INTEGRATIONS);
  return candidates.some((candidate) => candidate.origins.some((pattern) => pattern.test(origin)));
}

module.exports = { INTEGRATIONS, originAllowed, resolveIntegration };
