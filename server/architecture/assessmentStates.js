/**
 * Kernel assessment states. Existing valuation/finance names are mapped, not rewritten.
 */

const KERNEL_ASSESSMENT = Object.freeze({
  ASSESSED: 'ASSESSED',
  NOT_ASSESSED: 'NOT_ASSESSED',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  INVALID_INPUT: 'INVALID_INPUT',
  UNAVAILABLE: 'UNAVAILABLE',
});

/**
 * Adapter only. Live engines keep assessed / notAssessed / available.
 */
function mapExistingAssessment(input = {}) {
  const raw = input.state || input.assessmentState || null;
  if (raw === 'assessed' || raw === 'calculated' || raw === 'observed' || raw === KERNEL_ASSESSMENT.ASSESSED) {
    return KERNEL_ASSESSMENT.ASSESSED;
  }
  if (raw === 'invalid' || raw === KERNEL_ASSESSMENT.INVALID_INPUT) {
    return KERNEL_ASSESSMENT.INVALID_INPUT;
  }
  if (raw === 'notApplicable' || raw === KERNEL_ASSESSMENT.NOT_APPLICABLE) {
    return KERNEL_ASSESSMENT.NOT_APPLICABLE;
  }
  if (raw === 'unavailable' || raw === KERNEL_ASSESSMENT.UNAVAILABLE) {
    return KERNEL_ASSESSMENT.UNAVAILABLE;
  }
  if (raw === 'insufficient' || raw === 'insufficientData' || raw === KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE) {
    return KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE;
  }
  if (raw === 'notAssessed' || raw === 'notCurrentlyAssessable' || raw === KERNEL_ASSESSMENT.NOT_ASSESSED) {
    return KERNEL_ASSESSMENT.NOT_ASSESSED;
  }
  if (input.available === true && (input.value != null || input.value === 0)) {
    return KERNEL_ASSESSMENT.ASSESSED;
  }
  if (input.available === false) {
    return KERNEL_ASSESSMENT.NOT_ASSESSED;
  }
  return KERNEL_ASSESSMENT.NOT_ASSESSED;
}

const DOMAIN_STATUS = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  PARTIAL: 'PARTIAL',
  NOT_ASSESSED: 'NOT_ASSESSED',
  UNAVAILABLE: 'UNAVAILABLE',
});

module.exports = {
  KERNEL_ASSESSMENT,
  DOMAIN_STATUS,
  mapExistingAssessment,
};
