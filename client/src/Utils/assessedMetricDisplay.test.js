import {
  displayForMetric,
  fieldSemanticsDisplay,
  financingDisplay,
  formatCurrency,
  formatPercent,
  grossYieldLabel,
  hasMetricAssessment,
  humanReason,
  resolveAssessedDisplay,
  resolveRentBasisKind,
} from './assessedMetricDisplay';

function assessed(extra = {}) {
  return { state: 'assessed', missingInputs: [], ...extra };
}

function notAssessed(reason) {
  return { state: 'notAssessed', missingInputs: [], reason };
}

function metricsFixture(overrides = {}) {
  return {
    metricAssessment: {
      grossYield: assessed(),
      netYield: assessed(),
      annualRent: assessed(),
      vacancyAdjustedIncome: assessed(),
      operatingCosts: assessed(),
      noi: assessed(),
      mortgagePayment: assessed(),
      cashFlow: assessed(),
      dscr: assessed(),
    },
    inputSemantics: {
      interestRate: { state: 'POSITIVE_VALUE', value: 5.5 },
      mortgageTermYears: { state: 'POSITIVE_VALUE', value: 25 },
      vacancyAssumption: { state: 'POSITIVE_VALUE', value: 5 },
    },
    financingState: { kind: 'EXPLICIT_MORTGAGE', amount: 150000 },
    rentBasis: { kind: 'LISTING' },
    grossYield: 6.6,
    netYield: 4.9,
    assumptions: { annualRent: 13200 },
    effectiveGrossRent: 12540,
    operatingExpenses: 2400,
    noi: 10140,
    monthlyDebtService: 850,
    annualDebtService: 10200,
    annualCashFlow: -60,
    monthlyCashFlow: -5,
    dscr: 0.994,
    ...overrides,
  };
}

describe('assessed metric display contract', () => {
  test('1. assessed positive gross yield renders number', () => {
    const d = resolveAssessedDisplay({
      assessment: assessed(),
      value: 6.6,
      format: 'percent',
    });
    expect(d.text).toBe('6.6%');
    expect(d.kind).toBe('assessed');
  });

  test('2. assessed zero where valid renders zero', () => {
    expect(resolveAssessedDisplay({ assessment: assessed(), value: 0, format: 'currency' }).text).toBe('£0');
    expect(resolveAssessedDisplay({ assessment: assessed(), value: 0, format: 'percent' }).text).toBe('0%');
    expect(fieldSemanticsDisplay({ state: 'EXPLICIT_ZERO', value: 0 }, 'percent').text).toBe('0%');
  });

  test('3-4. notAssessed gross yield does not render 0% or null%', () => {
    const d = resolveAssessedDisplay({
      assessment: notAssessed('Gross yield requires a valid purchase price and rent basis.'),
      value: null,
      format: 'percent',
    });
    expect(d.text).toBe('Not assessed');
    expect(d.text).not.toMatch(/0%/);
    expect(d.text).not.toMatch(/null/i);
    expect(formatPercent(null)).toBe('Not assessed');
    expect(formatPercent(undefined)).toBe('Not assessed');
  });

  test('5. notAssessed net yield does not render numeric substitute', () => {
    const d = displayForMetric(
      metricsFixture({
        netYield: null,
        metricAssessment: { netYield: notAssessed('Net yield requires assessed NOI.') },
      }),
      'netYield',
      'percent'
    );
    expect(d.text).toBe('Not assessed');
    expect(d.numeric).toBe(false);
  });

  test('6. notAssessed NOI does not render £0', () => {
    const d = resolveAssessedDisplay({
      assessment: notAssessed('NOI requires complete operating-cost evidence.'),
      value: null,
      format: 'currency',
    });
    expect(d.text).toBe('Not assessed');
    expect(d.text).not.toBe('£0');
    expect(formatCurrency(null)).not.toBe('£0');
  });

  test('7. notAssessed cash flow does not render £0', () => {
    const d = displayForMetric(
      metricsFixture({
        annualCashFlow: null,
        monthlyCashFlow: null,
        metricAssessment: { cashFlow: notAssessed('Cash flow requires assessed NOI.') },
      }),
      'annualCashFlow',
      'currency'
    );
    expect(d.text).toBe('Not assessed');
    expect(d.text).not.toBe('£0');
  });

  test('8. notAssessed DSCR does not render 0', () => {
    const d = resolveAssessedDisplay({
      assessment: notAssessed('DSCR requires assessed NOI.'),
      value: null,
      format: 'number',
    });
    expect(d.text).toBe('Not assessed');
    expect(d.text).not.toBe('0');
  });

  test('9. missing mortgage does not display cash purchase', () => {
    const d = financingDisplay({ kind: 'UNKNOWN', amount: null });
    expect(d.text).toBe('Not assessed');
    expect(d.text).not.toMatch(/cash/i);
    expect(d.isCash).toBeFalsy();
  });

  test('10. explicit cash financing remains distinguishable', () => {
    const cash = financingDisplay({ kind: 'EXPLICIT_CASH', amount: 0 });
    const unknown = financingDisplay({ kind: 'UNKNOWN', amount: null });
    expect(cash.text).toMatch(/cash purchase/i);
    expect(cash.isCash).toBe(true);
    expect(unknown.text).not.toEqual(cash.text);
  });

  test('11. missing interest does not display 0%', () => {
    const d = fieldSemanticsDisplay({ state: 'MISSING', value: null }, 'percent');
    expect(d.text).toBe('Not assessed');
    expect(d.text).not.toBe('0%');
  });

  test('12. missing term does not display default 25 years as fact', () => {
    const d = fieldSemanticsDisplay({ state: 'MISSING', value: null }, 'number');
    expect(d.text).toBe('Not assessed');
    expect(d.text).not.toMatch(/25/);
  });

  test('13. incomplete operating costs preserve NOT ASSESSED', () => {
    const d = displayForMetric(
      {
        noi: null,
        operatingExpenses: null,
        metricAssessment: {
          noi: notAssessed('NOI requires a valid rent basis and complete operating-cost evidence.'),
          operatingCosts: notAssessed('Missing operating costs are not a £0 cost assumption.'),
        },
      },
      'noi',
      'currency'
    );
    expect(d.kind).toBe('notAssessed');
    expect(d.text).toBe('Not assessed');
  });

  test('14. explicit £0 cost remains £0 when assessed', () => {
    const d = resolveAssessedDisplay({
      assessment: assessed(),
      value: 0,
      format: 'currency',
    });
    expect(d.text).toBe('£0');
  });

  test('15. explicit 0% vacancy remains 0%', () => {
    const d = fieldSemanticsDisplay({ state: 'EXPLICIT_ZERO', value: 0 }, 'percent');
    expect(d.text).toBe('0%');
  });

  test('16-18. rent basis labels', () => {
    expect(grossYieldLabel('LISTING')).toBe('Listing-rent-based gross yield');
    expect(grossYieldLabel('MARKET')).toBe('Market-rent-based gross yield');
    expect(grossYieldLabel('SCENARIO')).toBe('Scenario-rent-based gross yield');
    expect(grossYieldLabel(null)).toBe('Gross yield');
  });

  test('19. market rent never presented as observed listing rent', () => {
    const kind = resolveRentBasisKind({ rentBasis: { kind: 'MARKET' } });
    expect(kind).toBe('MARKET');
    expect(grossYieldLabel(kind)).not.toMatch(/listing/i);
    expect(grossYieldLabel(kind)).toMatch(/market-rent-based/i);
  });

  test('20. scenario rent never presented as observed rent', () => {
    const kind = resolveRentBasisKind({ rentBasis: { kind: 'SCENARIO' } });
    expect(grossYieldLabel(kind)).toMatch(/scenario/i);
    expect(grossYieldLabel(kind)).not.toMatch(/listing/i);
    expect(grossYieldLabel(kind)).not.toMatch(/observed/i);
  });

  test('21-23. invalid / undefined / null never render visibly', () => {
    expect(resolveAssessedDisplay({ value: Number.NaN, format: 'percent' }).text).toBe('Not assessed');
    expect(resolveAssessedDisplay({ value: undefined, format: 'currency' }).text).toBe('Not assessed');
    expect(resolveAssessedDisplay({ value: null, format: 'number' }).text).toBe('Not assessed');
    expect(formatCurrency(undefined)).not.toMatch(/undefined/);
    expect(formatPercent(null)).not.toMatch(/null/);
    expect(humanReason('null')).toBeNull();
  });

  test('24. legacy result does not gain unsupported assessment claim', () => {
    const legacy = resolveAssessedDisplay({ value: 6.2, format: 'percent' });
    expect(legacy.legacy).toBe(true);
    expect(legacy.kind).toBe('legacyNumeric');
    expect(legacy.text).toBe('6.2%');
    expect(hasMetricAssessment({ grossYield: 6.2 })).toBe(false);

    const missingLegacy = resolveAssessedDisplay({ value: null, format: 'percent' });
    expect(missingLegacy.legacy).toBe(true);
    expect(missingLegacy.kind).toBe('unavailable');
    expect(missingLegacy.reason).toBeNull();
  });

  test('does not use truthiness so assessed zero is kept', () => {
    const d = resolveAssessedDisplay({
      assessment: { state: 'assessed' },
      value: 0,
      format: 'currency',
    });
    expect(d.numeric).toBe(true);
    expect(d.text).toBe('£0');
  });

  test('machine-code reasons are not shown', () => {
    expect(humanReason('missing_field')).toBeNull();
    expect(humanReason('NOI requires complete operating-cost evidence.')).toMatch(/NOI/);
  });

  test('user-entered rent is labelled scenario only when requested', () => {
    expect(resolveRentBasisKind({}, { userEnteredRent: true })).toBe('SCENARIO');
    expect(resolveRentBasisKind({})).toBeNull();
  });
});
