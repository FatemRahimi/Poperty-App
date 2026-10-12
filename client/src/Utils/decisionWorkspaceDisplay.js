export const ASSESSMENT_STATE_LABEL = {
  ASSESSED: 'Assessed',
  NOT_ASSESSED: 'Not assessed',
  INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
  NOT_APPLICABLE: 'Not applicable',
  INVALID_INPUT: 'Invalid input',
  UNAVAILABLE: 'Unavailable',
};

export function assessmentLabel(state) {
  return ASSESSMENT_STATE_LABEL[state] || ASSESSMENT_STATE_LABEL.NOT_ASSESSED;
}

export function isLegacyLandlordSnapshot(report) {
  if (!report || typeof report !== 'object') return false;
  const job = report.residentialDecisionContext?.decisionJob || report.decisionJob;
  if (job) return Boolean(report.residentialDecisionContext?.provenance?.legacySnapshot);
  return Boolean(report.personalDecision?.profile === 'landlord' || report.decisionIntelligence);
}
