import {
  buyDossierView,
  buyEvidenceRows,
  purchaseConclusionText,
  yieldBasisText,
} from './decisionDossierDisplay';

function leaseholdBuyDecision(overrides = {}) {
  return {
    applicable: true,
    buyRecommendation: null,
    preferenceFit: { role: 'preference_fit', outcome: 'strong_fit', score: 88 },
    evidence: {
      identity: { state: 'UNKNOWN', value: null },
      askingPrice: { state: 'KNOWN', value: 250000 },
      affordability: { state: 'UNKNOWN', value: null },
      cashToComplete: { state: 'UNKNOWN', value: null },
      ongoingHousingCost: { state: 'UNKNOWN', value: null },
      deposit: { state: 'UNKNOWN', value: null },
      leaseYearsRemaining: { state: 'UNKNOWN', value: null },
      serviceCharge: { state: 'UNKNOWN', value: null },
      groundRent: { state: 'UNKNOWN', value: null },
      schools: {
        role: 'context',
        state: 'KNOWN',
        nearbyCount: 2,
        catchment: 'NOT_ASSESSED',
        admission: 'NOT_ASSESSED',
        quality: 'NOT_ASSESSED',
      },
    },
    areaMarketContext: {
      role: 'context_only',
      salesDemand: { available: true, band: 'High', notTenantDemand: true },
      rentalDemand: { available: false, band: null },
    },
    investigationPriorities: [
      {
        id: 'affordability_evidence_incomplete',
        importance: 'decision_relevant',
        title: 'Affordability evidence incomplete',
        explanation: 'Income was not assessed.',
      },
      {
        id: 'lease_years_unknown',
        importance: 'decision_relevant',
        title: 'Lease years remaining unknown',
        explanation: 'No lender rule is applied.',
      },
    ],
    ...overrides,
  };
}

describe('decision dossier display', () => {
  test('null recommendation stays an unavailable purchase conclusion', () => {
    expect(purchaseConclusionText({ buyRecommendation: null })).toBe('Purchase conclusion not available yet');
    expect(purchaseConclusionText(null)).toBe('Purchase conclusion not available yet');
  });

  test('missing lease, service charge and ground rent stay unknown, and explicit zero stays zero', () => {
    const missing = buyEvidenceRows(leaseholdBuyDecision());
    expect(missing.find((row) => row.id === 'leaseYearsRemaining').value).toBe('Unknown');
    expect(missing.find((row) => row.id === 'serviceCharge').value).toBe('Unknown');
    expect(missing.find((row) => row.id === 'groundRent').value).toBe('Unknown');
    expect(missing.find((row) => row.id === 'affordability').value).toBe('Unknown');

    const explicit = buyEvidenceRows({
      evidence: {
        groundRent: { state: 'KNOWN', value: 0, explicitZero: true },
        serviceCharge: { state: 'KNOWN', value: 0, explicitZero: true },
        deposit: { state: 'KNOWN', value: 0 },
        leaseYearsRemaining: { state: 'KNOWN', value: 0 },
      },
    });
    expect(explicit.find((row) => row.id === 'groundRent').value).toBe('\u00A30');
    expect(explicit.find((row) => row.id === 'serviceCharge').value).toBe('\u00A30');
    expect(explicit.find((row) => row.id === 'deposit').value).toBe('\u00A30');
    expect(explicit.find((row) => row.id === 'leaseYearsRemaining').value).toBe('0 years');
  });

  test('rent basis phrases do not call asking or area estimates achieved rent', () => {
    expect(yieldBasisText({ canonicalBasis: 'LISTING_ASKING_RENT', limitation: 'Yield uses asking rent, not achieved rent.' }))
      .toMatch(/LISTING_ASKING_RENT/);
    expect(yieldBasisText({ canonicalBasis: 'LISTING_ASKING_RENT' })).toMatch(/not achieved rent/i);
    expect(yieldBasisText({ canonicalBasis: 'AREA_ASKING_RENT_ESTIMATE' })).toMatch(/Area asking-rent estimate/i);
    expect(yieldBasisText({ canonicalBasis: 'AREA_ASKING_RENT_ESTIMATE' })).toMatch(/confirmed asking rent/i);
    expect(yieldBasisText({ canonicalBasis: 'ACHIEVED_RENT' })).toBe('ACHIEVED_RENT: Achieved rent');
    expect(yieldBasisText({ canonicalBasis: 'UNKNOWN' })).toMatch(/UNKNOWN/);
    expect(yieldBasisText(null)).toBeNull();
  });

  test('unresolved identity is unknown and is not replaced with a unit', () => {
    const view = buyDossierView(leaseholdBuyDecision());
    expect(view.unknown.find((row) => row.id === 'identity').value).toBe('Unknown');
    expect(view.conclusion).not.toMatch(/\bBuy\b|Recommended|Affordable|Suitable purchase/);
  });
});
