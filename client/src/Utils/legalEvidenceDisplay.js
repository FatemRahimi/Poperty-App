/**
 * Frontend-only legal / title evidence presentation.
 * Does not invent access, scores, verification, or document assessment.
 */

export const LEGAL_EVIDENCE_LOAD_STATE = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  EMPTY: 'empty',
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
});

export const LEGAL_EVIDENCE_EMPTY_COPY = 'No private legal evidence supplied yet.';
export const LEGAL_EVIDENCE_UNAVAILABLE_COPY = 'Legal evidence could not be loaded.';
export const LEGAL_EVIDENCE_LOADING_COPY = 'Loading legal evidence…';

const INTERNAL_LEGAL_SOURCES = new Set(['legal-title-foundation']);

export function legalTitleProvenanceLabel(source) {
  if (!source || INTERNAL_LEGAL_SOURCES.has(String(source))) {
    return 'User-supplied private evidence';
  }
  return String(source);
}

export function legalEvidenceCompactStatus({ loadState, documentCount = 0 } = {}) {
  if (loadState === LEGAL_EVIDENCE_LOAD_STATE.LOADING) return 'Loading';
  if (loadState === LEGAL_EVIDENCE_LOAD_STATE.UNAVAILABLE) return 'Could not be loaded';
  if (loadState === LEGAL_EVIDENCE_LOAD_STATE.AVAILABLE) {
    const count = Number(documentCount) || 0;
    const noun = count === 1 ? 'document' : 'documents';
    return `${count} ${noun} supplied · Unverified · Not assessed`;
  }
  return '';
}

function findingIds(envelope) {
  return new Set(
    (Array.isArray(envelope?.findings) ? envelope.findings : [])
      .map((row) => row && row.id)
      .filter(Boolean)
  );
}

/**
 * Concise existing legalTitleDomain limitations for Step 5.
 * Missing documents stay NOT_ASSESSED — not a legal defect or clean title.
 */
export function legalTitleLimitationItems(envelope) {
  if (!envelope || typeof envelope !== 'object') return [];
  const ids = findingIds(envelope);
  const assessment = envelope.assessment || {};
  const documentsPresent = assessment.documentsPresent === true
    || (Array.isArray(envelope.documents) && envelope.documents.length > 0)
    || ids.has('document_not_substantively_assessed');

  if (documentsPresent) {
    return [{
      id: 'legal_title_contents_not_assessed',
      title: 'Legal / title documents supplied — contents not assessed',
      detail: 'Private user-supplied documents are unverified. They are not a clean title and have not been substantively assessed.',
      state: 'NOT_ASSESSED',
      source: 'legal_title',
    }];
  }

  const registerUnavailable = ids.has('title_register_not_available')
    || assessment.titleRegisterAvailable === false;
  const planUnavailable = ids.has('title_plan_not_available')
    || assessment.titlePlanAvailable === false;
  const insufficient = ids.has('legal_evidence_incomplete')
    || ids.has('legal_assessment_not_available')
    || assessment.state === 'INSUFFICIENT_EVIDENCE'
    || assessment.liveLegalAssessmentAvailable === false;

  if (!registerUnavailable && !planUnavailable && !insufficient) return [];

  const missingBits = [];
  if (registerUnavailable) missingBits.push('title register');
  if (planUnavailable) missingBits.push('title plan');
  const missing = missingBits.length
    ? `${missingBits.join(' and ')} not supplied.`
    : 'Insufficient legal / title evidence.';

  return [{
    id: 'legal_title_evidence_not_assessed',
    title: 'Legal / title evidence is not assessed',
    detail: `${missing} This is a limitation, not a clean-title conclusion.`,
    state: 'NOT_ASSESSED',
    source: 'legal_title',
  }];
}
