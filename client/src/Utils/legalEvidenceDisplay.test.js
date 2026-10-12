import {
  LEGAL_EVIDENCE_LOAD_STATE,
  legalEvidenceCompactStatus,
  legalTitleLimitationItems,
  legalTitleProvenanceLabel,
} from './legalEvidenceDisplay';

describe('legalEvidenceDisplay', () => {
  test('hides the internal legal-title-foundation adapter name', () => {
    expect(legalTitleProvenanceLabel('legal-title-foundation')).toBe('User-supplied private evidence');
    expect(legalTitleProvenanceLabel(null)).toBe('User-supplied private evidence');
    expect(legalTitleProvenanceLabel('User-supplied private evidence')).toBe('User-supplied private evidence');
  });

  test('compact status is textual for loading, unavailable, and available', () => {
    expect(legalEvidenceCompactStatus({ loadState: LEGAL_EVIDENCE_LOAD_STATE.LOADING })).toBe('Loading');
    expect(legalEvidenceCompactStatus({ loadState: LEGAL_EVIDENCE_LOAD_STATE.UNAVAILABLE })).toBe('Could not be loaded');
    expect(legalEvidenceCompactStatus({
      loadState: LEGAL_EVIDENCE_LOAD_STATE.AVAILABLE,
      documentCount: 2,
    })).toBe('2 documents supplied · Unverified · Not assessed');
    expect(legalEvidenceCompactStatus({ loadState: LEGAL_EVIDENCE_LOAD_STATE.EMPTY })).toBe('');
  });

  test('absence of a legal envelope is not labelled safe or clear', () => {
    expect(legalTitleLimitationItems(null)).toEqual([]);
    expect(legalTitleLimitationItems(undefined)).toEqual([]);
  });
});
