import {
  EMPTY_FINANCE_SCENARIO,
  buildFinanceAnalyseRequest,
  serializeFinanceScenario,
  isScenarioStale,
  mapServerFinanceErrors,
  completenessLabel,
} from './financeScenario';

describe('finance scenario request builder', () => {
  test('empty form is omitted so analysis can run with no finance fields', () => {
    const built = buildFinanceAnalyseRequest({ ...EMPTY_FINANCE_SCENARIO });
    expect(built.ok).toBe(true);
    expect(built.payload).toEqual({});
  });

  test('blank optional field is omitted and not sent as zero', () => {
    const built = buildFinanceAnalyseRequest({
      ...EMPTY_FINANCE_SCENARIO,
      maintenance: '',
      vacancyAssumption: '',
      deposit: '',
      interestRate: '',
      mortgageTermYears: '',
    });
    expect(built.payload).toEqual({});
    expect(JSON.stringify(built.payload)).not.toMatch(/"vacancyAssumption":0/);
    expect(JSON.stringify(built.payload)).not.toMatch(/"deposit":0/);
  });

  test('blank vacancy differs from vacancy 0', () => {
    const blank = buildFinanceAnalyseRequest({ ...EMPTY_FINANCE_SCENARIO });
    const zero = buildFinanceAnalyseRequest({
      ...EMPTY_FINANCE_SCENARIO,
      vacancyAssumption: '0',
    });
    expect(blank.payload.finance).toBeUndefined();
    expect(zero.ok).toBe(true);
    expect(zero.payload.finance.operatingCosts.vacancyAssumption).toBe(0);
  });

  test('explicit £0 survives', () => {
    const built = buildFinanceAnalyseRequest({
      ...EMPTY_FINANCE_SCENARIO,
      managementFee: '0',
      managementFeeFrequency: 'annual',
    });
    expect(built.payload.finance.operatingCosts.managementFee).toEqual({
      value: 0,
      frequency: 'annual',
    });
  });

  test('purchasePrice and expectedRent scenarios are submitted', () => {
    const built = buildFinanceAnalyseRequest({
      ...EMPTY_FINANCE_SCENARIO,
      purchasePrice: '185000',
      expectedRent: '1100',
    });
    expect(built.payload.finance.purchasePrice).toBe(185000);
    expect(built.payload.finance.expectedRent).toBe(1100);
  });

  test('frequency is submitted unchanged and not annualised in the frontend', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'financeScenario.js'), 'utf8');
    expect(src).not.toMatch(/\* 12/);
    expect(src).not.toMatch(/\/ 12/);
    expect(src).not.toMatch(/\* 52/);
    const built = buildFinanceAnalyseRequest({
      ...EMPTY_FINANCE_SCENARIO,
      maintenance: '100',
      maintenanceFrequency: 'monthly',
    });
    expect(built.payload.finance.operatingCosts.maintenance).toEqual({
      value: 100,
      frequency: 'monthly',
    });
  });

  test('invalid numbers and negatives are rejected without coercion', () => {
    const negative = buildFinanceAnalyseRequest({
      ...EMPTY_FINANCE_SCENARIO,
      insurance: '-10',
    });
    expect(negative.ok).toBe(false);
    expect(negative.payload).toEqual({});
    const garbage = buildFinanceAnalyseRequest({
      ...EMPTY_FINANCE_SCENARIO,
      deposit: 'abc',
    });
    expect(garbage.ok).toBe(false);
  });

  test('stale detection compares the submitted scenario only', () => {
    const form = { ...EMPTY_FINANCE_SCENARIO, deposit: '50000' };
    const key = serializeFinanceScenario(form);
    expect(isScenarioStale(form, key)).toBe(false);
    expect(isScenarioStale({ ...form, deposit: '40000' }, key)).toBe(true);
  });

  test('backend validation errors map onto fields', () => {
    const mapped = mapServerFinanceErrors([
      { field: 'finance.operatingCosts.vacancyAssumption', reason: 'percent_out_of_range' },
    ]);
    expect(mapped[0].field).toBe('vacancyAssumption');
    expect(mapped[0].message).toMatch(/0 and 100/);
  });

  test('completeness labels are not scores', () => {
    expect(completenessLabel('COMPLETE_EVIDENCE')).toBe('Complete');
    expect(completenessLabel('PARTIAL_EVIDENCE')).toBe('Partial');
    expect(completenessLabel('NOT_ASSESSED')).toBe('Not assessed');
  });

  test('EMPTY scenario does not prefill mortgage term or vacancy', () => {
    expect(EMPTY_FINANCE_SCENARIO.mortgageTermYears).toBe('');
    expect(EMPTY_FINANCE_SCENARIO.vacancyAssumption).toBe('');
    expect(EMPTY_FINANCE_SCENARIO.interestRate).toBe('');
    expect(EMPTY_FINANCE_SCENARIO.deposit).toBe('');
  });
});
