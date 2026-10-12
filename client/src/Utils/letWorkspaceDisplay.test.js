import {
  askingPriceEvidenceCopy,
  defaultLetStage,
  listingRentEvidenceCopy,
  LET_UNDERWRITING_STAGES,
  subjectHasListingEvidence,
} from './letWorkspaceDisplay';
import { letAnalyseConsequenceCopy } from './analysisReadiness';

describe('letWorkspaceDisplay', () => {
  test('Deal & rent is the default stage', () => {
    expect(defaultLetStage(null)).toBe('property_rent');
    expect(defaultLetStage(undefined)).toBe('property_rent');
    expect(LET_UNDERWRITING_STAGES.map((s) => s.id)).toEqual([
      'property_rent',
      'operating',
      'financing',
    ]);
  });

  test('non-listing exact subject is not treated as a missing listing', () => {
    expect(
      subjectHasListingEvidence(
        { address_display: '12 Acacia Avenue', source: 'external_lookup', uprn: '1' },
        { accessContext: { relationship: 'external_lookup' } }
      )
    ).toBe(false);

    const asking = askingPriceEvidenceCopy(
      { source: 'external_lookup' },
      false
    );
    expect(asking.show).toBe(false);

    const rent = listingRentEvidenceCopy({ source: 'external_lookup' }, false);
    expect(rent.show).toBe(false);
  });

  test('platform listing asking price is labelled as asking, not fair value', () => {
    const asking = askingPriceEvidenceCopy({ price: 275000, source: 'marketplace' }, true);
    expect(asking.show).toBe(true);
    expect(asking.label).toBe('Listing asking price');
    expect(asking.value).toBe('£275,000');
    expect(asking.note).toMatch(/not a valuation or fair value/i);
  });

  test('consequence copy never claims full underwriting or assessed metrics', () => {
    const limited = letAnalyseConsequenceCopy([
      { id: 'grossYield', status: 'needs' },
      { id: 'noi', status: 'needs' },
      { id: 'cashFlowDscr', status: 'needs' },
    ]);
    expect(limited).toMatch(/not-assessed|not assessed/i);
    expect(limited).not.toMatch(/full underwriting/i);

    const gy = letAnalyseConsequenceCopy([
      { id: 'grossYield', status: 'ready' },
      { id: 'noi', status: 'needs' },
      { id: 'cashFlowDscr', status: 'needs' },
    ]);
    expect(gy).toMatch(/gross yield/i);
    expect(gy).not.toMatch(/full underwriting/i);
  });
});
