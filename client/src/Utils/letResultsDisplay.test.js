import {
  deeperLetEconomicsIncomplete,
  fitCoverage,
  letKeyEconomics,
  letLimitationItems,
  letSaleSupportItems,
  listingAskingWhatIfCopy,
  listingRentWhatIfCopy,
  purchasePriceBasisRows,
  rentBasisCalloutText,
  rentEvidenceRows,
  reportHasListingProvenance,
} from './letResultsDisplay';

describe('letResultsDisplay', () => {
  test('does not treat a price number as listing provenance', () => {
    expect(
      reportHasListingProvenance({
        property: { price: 110000, source: 'external_lookup' },
        accessContext: { relationship: 'external_lookup' },
        financeRequest: { purchasePrice: { listingAskingPrice: 110000, scenarioPurchasePrice: 185000 } },
      })
    ).toBe(false);
    expect(
      reportHasListingProvenance(
        { property: { price: 110000 } },
        { listingSubject: false }
      )
    ).toBe(false);
    expect(
      reportHasListingProvenance(
        { property: { price: 300000, source: 'marketplace' } }
      )
    ).toBe(true);
  });

  test('suppresses listing asking and listing-rent-missing copy without listing provenance', () => {
    const report = {
      financeRequest: {
        purchasePrice: { listingAskingPrice: 110000, scenarioPurchasePrice: 185000 },
        expectedRent: { marketRentEvidence: 900, scenarioInput: 1100 },
      },
    };
    const prices = purchasePriceBasisRows(report, false);
    expect(prices.map((r) => r.id)).toEqual(['scenario_purchase']);
    expect(prices[0].label).toBe('Your purchase price');
    expect(prices.some((r) => /listing asking/i.test(r.label))).toBe(false);

    const rents = rentEvidenceRows(report, false);
    expect(rents.map((r) => r.id)).toEqual(['scenario_rent', 'market_rent']);
    expect(rents.find((r) => r.id === 'market_rent').label).toBe('Area asking-rent context');
    expect(rents.some((r) => /listing rent/i.test(r.label))).toBe(false);

    expect(listingAskingWhatIfCopy(false, '£110,000')).toBeNull();
    expect(listingRentWhatIfCopy(false, null)).toBeNull();
  });

  test('MARKET rent basis stays area asking-rent context', () => {
    expect(rentBasisCalloutText({ kind: 'MARKET' })).toMatch(/area asking-rent context/i);
    expect(rentBasisCalloutText({ kind: 'MARKET' })).not.toMatch(/achievable rent/i);
    expect(rentBasisCalloutText({ kind: 'SCENARIO' })).toMatch(/your rent assumption/i);
  });

  test('key economics include net yield from presented fields and demote sale tiles', () => {
    const items = letKeyEconomics(
      {
        investment: {
          presented: {
            grossYield: { available: true, value: 4.8 },
            noi: { available: true, value: 13610 },
            netYield: { available: true, value: 4.5 },
            annualCashFlow: { available: true, value: -2398 },
            dscr: { available: true, value: 0.85 },
          },
        },
      },
      {
        keyIntelligence: [
          { id: 'valuation_range', available: false, label: 'Residential valuation range' },
          { id: 'price_position', available: false, label: 'Asking-price position' },
          { id: 'grossYield', available: true, value: 4.8, label: 'Gross yield' },
        ],
      }
    );
    expect(items.map((i) => i.id)).toEqual([
      'grossYield',
      'noi',
      'netYield',
      'annualCashFlow',
      'dscr',
    ]);
    expect(items.find((i) => i.id === 'netYield').available).toBe(true);
    expect(letSaleSupportItems({
      keyIntelligence: [
        { id: 'valuation_range' },
        { id: 'grossYield' },
        { id: 'price_position' },
      ],
    }).map((i) => i.id)).toEqual(['valuation_range', 'price_position']);
  });

  test('fit coverage stays separate from the score and flags partial dimensions', () => {
    const coverage = fitCoverage({
      personalDecision: { available: true, score: 58 },
      scores: { coverage: { componentsScored: 4, componentsTotal: 6 } },
    });
    expect(coverage.score).toBe(58);
    expect(coverage.partial).toBe(true);
    expect(coverage.coverageLabel).toBe('4 of 6 dimensions assessed');
  });

  test('limitations dedupe the same missing vacancy across workspace and DI', () => {
    const items = letLimitationItems({
      economics: [{ id: 'noi', label: 'NOI', available: false, howToResolve: 'Needs vacancy', resolutionInputKeys: ['vacancyAssumption'], isUserInput: true }],
      workspace: {
        missingUnderwritingInputs: {
          items: [{ id: 'underwriting_input_vacancyAssumption', inputKey: 'vacancyAssumption', label: 'Vacancy assumption', cause: 'MISSING_USER_INPUT' }],
        },
        unresolved: [{ id: 'vacancyAssumption', label: 'Vacancy assumption', inputKey: 'vacancyAssumption' }],
      },
      intelligence: {
        investigationPriorities: [{ id: 'vacancy_assumption_missing', title: 'Vacancy assumption not supplied' }],
      },
    });
    const vacancyish = items.filter((row) => /vacancy/i.test(row.title || row.label || ''));
    expect(vacancyish.length).toBeLessThanOrEqual(2);
    expect(deeperLetEconomicsIncomplete([{ id: 'grossYield', available: true }, { id: 'noi', available: false }])).toBe(true);
  });

  test('existing legalTitleDomain findings surface as NOT_ASSESSED limitations, not defects', () => {
    const missing = letLimitationItems({
      legalTitleDomain: {
        assessment: {
          state: 'INSUFFICIENT_EVIDENCE',
          documentsPresent: false,
          titleRegisterAvailable: false,
          titlePlanAvailable: false,
          liveLegalAssessmentAvailable: false,
        },
        findings: [
          { id: 'title_register_not_available', text: 'Title register is not available.' },
          { id: 'title_plan_not_available', text: 'Title plan is not available.' },
          { id: 'legal_assessment_not_available', text: 'Legal/title evidence cannot be assessed as title quality, restriction, or ownership.' },
        ],
        limitations: [
          'TITLE REGISTER = NOT AVAILABLE.',
          'A property is not a title. One property may involve multiple titles.',
          'This is not legal advice.',
        ],
      },
    });
    expect(missing.map((row) => row.id)).toEqual(['legal_title_evidence_not_assessed']);
    expect(missing[0].state).toBe('NOT_ASSESSED');
    expect(missing[0].detail).toMatch(/title register and title plan not supplied/i);
    expect(missing[0].detail).toMatch(/limitation, not a clean-title conclusion/i);
    expect(missing[0].title).not.toMatch(/clean title|safe|defect/i);
    expect(missing[0].detail).not.toMatch(/legal score|solicitor|defective title/i);

    const supplied = letLimitationItems({
      legalTitleDomain: {
        assessment: { documentsPresent: true, titleRegisterAvailable: true, liveLegalAssessmentAvailable: false },
        findings: [{ id: 'document_not_substantively_assessed', text: 'Uploaded document has not been substantively assessed.' }],
        documents: [{ documentId: 'd1' }],
      },
    });
    expect(supplied).toHaveLength(1);
    expect(supplied[0].id).toBe('legal_title_contents_not_assessed');
    expect(supplied[0].state).toBe('NOT_ASSESSED');
    expect(supplied[0].detail).toMatch(/not a clean title/i);

    expect(letLimitationItems({}).some((row) => String(row.id || '').startsWith('legal_title'))).toBe(false);
  });
});
