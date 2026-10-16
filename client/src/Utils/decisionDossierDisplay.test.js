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

  test('assessed sold cohort is price context and market context stays out of known', () => {
    const assessed = buyDossierView({
      buyRecommendation: null,
      evidence: {
        soldComparableSupport: {
          state: 'KNOWN',
          evidenceClass: 'SOLD_PRICE_CONTEXT',
          value: 'Sold-price context',
          limitation: 'Same-postcode official sales are price context. They are not this home\'s value, not a valuation, and not a recommendation to buy.',
          notAValuation: true,
          notExactUnitTransactions: true,
        },
        affordability: { state: 'UNKNOWN', value: null },
      },
    });
    const sold = assessed.known.find((row) => row.id === 'soldComparableSupport');
    expect(sold.value).toMatch(/not this home's value/i);
    expect(sold.value).toMatch(/not a valuation/i);
    expect(sold.value).not.toMatch(/£|fair value|undervalued/);
    expect(assessed.unknown.find((row) => row.id === 'affordability').value).toBe('Unknown');
    expect(assessed.conclusion).toBe('Purchase conclusion not available yet');

    const market = buyDossierView({
      buyRecommendation: null,
      evidence: {
        soldComparableSupport: {
          state: 'CONTEXT',
          evidenceClass: 'MARKET_CONTEXT',
          value: null,
          limitation: 'Local sold transactions are market context. A large transaction count does not make them evidence for this home.',
        },
      },
    });
    expect(market.known.find((row) => row.id === 'soldComparableSupport')).toBeUndefined();
    expect(market.context.find((line) => line.id === 'sold-market-context').text).toMatch(/market context/i);
    expect(market.context.find((line) => line.id === 'sold-market-context').text).toMatch(/does not make them evidence/i);

    const thin = buyDossierView({
      evidence: {
        soldComparableSupport: { state: 'UNKNOWN', value: null },
      },
    });
    expect(thin.unknown.find((row) => row.id === 'soldComparableSupport').value).toBe('Unknown');
    expect(thin.unknown.find((row) => row.id === 'soldComparableSupport').value).not.toBe('£0');
  });

  test('unresolved identity is unknown and is not replaced with a unit', () => {
    const view = buyDossierView(leaseholdBuyDecision());
    expect(view.unknown.find((row) => row.id === 'identity').value).toBe('Unknown');
    expect(view.conclusion).not.toMatch(/\bBuy\b|Recommended|Affordable|Suitable purchase/);
  });

  test('decision-critical investigation stays ahead of relevant items and old priorities still render', () => {
    const view = buyDossierView({
      buyRecommendation: null,
      investigationPriorities: [
        {
          id: 'deposit_unknown',
          importance: 'decision_relevant',
          title: 'Deposit unknown',
          explanation: 'A budget is not a deposit.',
          state: 'UNKNOWN',
          whatNext: 'Supply the deposit for this purchase.',
          resolution: 'user_input_required',
          evidenceKey: 'deposit',
        },
        {
          id: 'lease_years_unknown',
          importance: 'decision_critical',
          title: 'Lease length unknown',
          explanation: 'No lender rule is applied.',
          state: 'UNKNOWN',
          whatNext: 'Obtain the remaining term from the lease or title. This analysis has not retrieved it.',
          resolution: 'external_evidence_required',
          evidenceKey: 'leaseYearsRemaining',
        },
        {
          id: 'environment_evidence_unresolved',
          importance: 'worth_reviewing',
          title: 'Property or environment evidence unresolved',
          explanation: 'Unknown is not a clearance.',
        },
      ],
    });
    expect(view.investigation.map((item) => item.id)).toEqual(['deposit_unknown', 'lease_years_unknown']);
    expect(view.investigation[1].priorityLabel).toBe('Decision critical');
    expect(view.investigation[1].stateLabel).toBe('Unknown');
    expect(view.investigation[1].resolutionLabel).toMatch(/has not been retrieved/i);
    expect(view.context.find((line) => line.id === 'environment_evidence_unresolved').text).toMatch(/not a clearance/i);

    const saved = buyDossierView({
      investigationPriorities: [{ title: 'Lease years remaining unknown' }],
    });
    expect(saved.investigation).toHaveLength(1);
    expect(saved.investigation[0].title).toBe('Lease years remaining unknown');
    expect(saved.investigation[0].priorityLabel).toBeNull();
    expect(saved.investigation[0].resolutionLabel).toBeNull();
    expect(saved.conclusion).toBe('Purchase conclusion not available yet');
    expect(saved.relationships).toEqual([]);
  });

  test('stored relationships render and a saved decision without them does not invent any', () => {
    const view = buyDossierView({
      buyRecommendation: null,
      evidence: {
        leaseYearsRemaining: { state: 'UNKNOWN', value: null },
        serviceCharge: { state: 'KNOWN', value: 0 },
      },
      relationships: [
        {
          id: 'lease_length_limits_ownership_assessment',
          title: 'Lease length → decision completeness',
          evidenceKeys: ['tenure', 'leaseYearsRemaining'],
          state: 'UNKNOWN',
          implication: 'Ownership and financing implications of the remaining term are not assessed.',
          limitation: 'No lender rule is applied.',
        },
      ],
    });
    expect(view.relationships).toHaveLength(1);
    expect(view.relationships[0].title).toMatch(/Lease length/);
    expect(view.relationships[0].implication).toMatch(/not assessed/i);
    expect(view.known.find((row) => row.id === 'serviceCharge').value).toBe('\u00A30');
    expect(view.relationships.some((row) => /service charge/i.test(row.implication))).toBe(false);
  });
});
