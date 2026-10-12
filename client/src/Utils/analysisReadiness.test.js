import { buildLetAnalysisReadiness, hasNumericInput, isPositiveInput, LET_OPERATING_COST_KEYS } from './analysisReadiness';

const COMPLETE_OPEX = {
  maintenance: '50',
  insurance: '0',
  managementFee: '0',
  serviceCharge: '0',
  groundRent: '0',
  taxes: '0',
  vacancyAssumption: '0',
};

describe('analysisReadiness', () => {
  test('blank is not zero; explicit zero counts as entered', () => {
    expect(hasNumericInput('')).toBe(false);
    expect(hasNumericInput(null)).toBe(false);
    expect(hasNumericInput('0')).toBe(true);
    expect(hasNumericInput(0)).toBe(true);
    expect(isPositiveInput('0')).toBe(false);
    expect(isPositiveInput('1200')).toBe(true);
  });

  test('does not treat non-numeric text as entered', () => {
    expect(hasNumericInput('abc')).toBe(false);
  });

  test('gross yield needs positive purchase-price basis and positive rent basis', () => {
    const needs = buildLetAnalysisReadiness({
      form: {},
      preview: { price: 200000 },
    });
    expect(needs.find((r) => r.id === 'grossYield').status).toBe('needs');
    expect(needs.find((r) => r.id === 'grossYield').statusLabel).toBe('Needs input');

    const listingRentReady = buildLetAnalysisReadiness({
      form: { expectedRent: '1200' },
      preview: { price: 200000 },
    });
    expect(listingRentReady.find((r) => r.id === 'grossYield').status).toBe('ready');
    expect(listingRentReady.find((r) => r.id === 'grossYield').statusLabel).toBe('Inputs ready');

    const zeroPrice = buildLetAnalysisReadiness({
      form: { purchasePrice: '0', expectedRent: '1200' },
      preview: null,
    });
    expect(zeroPrice.find((r) => r.id === 'grossYield').status).toBe('needs');
  });

  test('listing asking price can satisfy purchase basis; scenario price can too', () => {
    const listing = buildLetAnalysisReadiness({
      form: { expectedRent: '1100' },
      preview: { price: 275000 },
    });
    expect(listing.find((r) => r.id === 'grossYield').status).toBe('ready');

    const scenario = buildLetAnalysisReadiness({
      form: { purchasePrice: '185000', expectedRent: '1100' },
      preview: null,
    });
    expect(scenario.find((r) => r.id === 'grossYield').status).toBe('ready');
  });

  test('partial opex does not mark NOI inputs ready', () => {
    const partial = buildLetAnalysisReadiness({
      form: {
        purchasePrice: '200000',
        expectedRent: '1200',
        vacancyAssumption: '0',
        maintenance: '50',
      },
    });
    expect(partial.find((r) => r.id === 'noi').status).toBe('needs');
    expect(partial.find((r) => r.id === 'noi').detail).toMatch(/Insurance/i);
    expect(partial.find((r) => r.id === 'noi').statusLabel).not.toMatch(/assessed/i);
  });

  test('complete operating-cost set is required for NOI inputs ready', () => {
    const complete = buildLetAnalysisReadiness({
      form: {
        purchasePrice: '200000',
        expectedRent: '1200',
        ...COMPLETE_OPEX,
      },
    });
    expect(complete.find((r) => r.id === 'noi').status).toBe('ready');
    expect(complete.find((r) => r.id === 'noi').statusLabel).toBe('Inputs ready');
    expect(LET_OPERATING_COST_KEYS).toHaveLength(7);
  });

  test('listing/property service charge and ground rent may satisfy those opex keys', () => {
    const withListingCharges = buildLetAnalysisReadiness({
      form: {
        expectedRent: '1200',
        maintenance: '50',
        insurance: '0',
        managementFee: '0',
        taxes: '0',
        vacancyAssumption: '0',
      },
      preview: { service_charges: 200, ground_rent: 250 },
    });
    expect(withListingCharges.find((r) => r.id === 'noi').status).toBe('ready');
  });

  test('cash flow / DSCR needs complete NOI inputs plus deposit, rate and term; mortgage amount optional when derivable', () => {
    const opexOnly = buildLetAnalysisReadiness({
      form: {
        purchasePrice: '200000',
        expectedRent: '1200',
        ...COMPLETE_OPEX,
      },
    });
    expect(opexOnly.find((r) => r.id === 'cashFlowDscr').status).toBe('needs');

    const financeWithoutMortgageAmount = buildLetAnalysisReadiness({
      form: {
        purchasePrice: '200000',
        expectedRent: '1200',
        ...COMPLETE_OPEX,
        deposit: '40000',
        interestRate: '4.5',
        mortgageTermYears: '25',
      },
    });
    expect(financeWithoutMortgageAmount.find((r) => r.id === 'cashFlowDscr').status).toBe('ready');

    const zeroTerm = buildLetAnalysisReadiness({
      form: {
        purchasePrice: '200000',
        expectedRent: '1200',
        ...COMPLETE_OPEX,
        deposit: '40000',
        interestRate: '4.5',
        mortgageTermYears: '0',
      },
    });
    expect(zeroTerm.find((r) => r.id === 'cashFlowDscr').status).toBe('needs');
  });

  test('explicit mortgageAmount 0 is cash semantics, not missing', () => {
    const cash = buildLetAnalysisReadiness({
      form: {
        purchasePrice: '200000',
        expectedRent: '1200',
        ...COMPLETE_OPEX,
        deposit: '200000',
        mortgageAmount: '0',
        interestRate: '0',
        mortgageTermYears: '25',
      },
    });
    expect(cash.find((r) => r.id === 'cashFlowDscr').status).toBe('ready');
    expect(cash.find((r) => r.id === 'cashFlowDscr').detail).toMatch(/cash purchase/i);
  });

  test('readiness copy does not claim unrun metrics are assessed', () => {
    const ready = buildLetAnalysisReadiness({
      form: {
        purchasePrice: '200000',
        expectedRent: '1200',
        ...COMPLETE_OPEX,
        deposit: '40000',
        interestRate: '4.5',
        mortgageTermYears: '25',
      },
    });
    ready.forEach((row) => {
      expect(row.statusLabel).not.toMatch(/assessed/i);
      expect(row.detail).not.toMatch(/metric assessed/i);
    });
  });
});
