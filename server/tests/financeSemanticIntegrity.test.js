/**
 * Finance semantic integrity — UNKNOWN ≠ ZERO, MARKET ≠ LISTING, SCENARIO ≠ OBSERVED.
 * Run: node server/tests/financeSemanticIntegrity.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  parseCanonicalNumber,
  parseField,
  parseFinancePayload,
  assessFinanceMetrics,
  resolveRentBasis,
  resolvePurchasePriceBasis,
  NUMERIC_STATES,
  RENT_BASIS,
  FINANCING_KIND,
  FINANCE_SEMANTIC_VERSION,
} = require('../services/ai/financeInputContract');
const { calculateInvestmentMetrics } = require('../services/ai/financialEngine');
const {
  prepareEvidencedInvestment,
  presentEvidencedInvestment,
} = require('../services/ai/evidencedInvestment');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const { analysePortfolioProperty } = require('../services/ai/portfolioOptimiserService');
const { buildRisks } = require('../services/ai/legacyHeuristicIntelligence');
const { SAMPLE_SUFFICIENCY } = require('../services/ai/backtesting/constants');
const { ASSESSMENT_SAFETY_VERSION } = require('../services/ai/valuationAssessmentSafety');

const pending = [];

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`Use asyncTest for ${name}`);
  }
  console.log(`✓ ${name}`);
}

function asyncTest(name, fn) {
  pending.push({ name, fn });
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const COMPLETE_COSTS = {
  maintenance: 1200,
  insurance: 600,
  managementFee: 0,
  serviceCharge: 0,
  groundRent: 0,
  taxes: 0,
  vacancyAssumption: 0,
};

const COMPLETE_FINANCE = {
  deposit: 50000,
  interestRate: 5,
  mortgageTermYears: 25,
};

function listing(overrides = {}) {
  return {
    id: 1,
    title: 'Semantic integrity',
    city: 'Leeds',
    zip_code: 'LS1 1AA',
    category: 'sale',
    price: 200000,
    monthly_rent: 1000,
    ...overrides,
  };
}

function access() {
  return {
    allowed: true,
    userId: 1,
    role: 'owner',
    relationship: 'owner',
    accessLevel: 'professional_intelligence',
    propertyId: 1,
  };
}

function deps(rent = {}) {
  return {
    analyseRent: async () => ({
      success: true,
      recommendedRent: rent.recommendedRent ?? 1250,
      marketRange: { low: 1100, high: 1400 },
      comparables: [],
      ...rent,
    }),
    calculatePropertyValuation: async () => ({ success: false }),
    generatePropertyExplanation: async () => ({ summary: 'template', source: 'template', tokensUsed: 0 }),
  };
}

async function analyse(propertyOverrides = {}, options = {}) {
  return assemblePropertyIntelligenceReport({
    property: listing(propertyOverrides),
    access: access(),
    userId: 1,
    target: { propertyId: 1 },
    options: {
      skipExplanation: true,
      skipPostcodeMarket: true,
      skipPlanning: true,
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      asOf: '2026-06-01T00:00:00.000Z',
      deps: deps(options.rent),
      ...options,
    },
  });
}

test('1 missing rent remains missing', () => {
  const parsed = parseCanonicalNumber(undefined);
  assert.strictEqual(parsed.state, NUMERIC_STATES.MISSING);
  assert.strictEqual(parsed.value, null);
  const metrics = calculateInvestmentMetrics({ purchasePrice: 200000 });
  assert.strictEqual(metrics.metricAssessment.annualRent.state, 'notAssessed');
  assert.strictEqual(metrics.assumptions.annualRent, null);
  assert.notStrictEqual(metrics.assumptions.annualRent, 0);
});

test('2 explicit rent 0 is invalid under the rent contract, not a silent missing collapse', () => {
  const parsed = parseCanonicalNumber(0);
  assert.strictEqual(parsed.state, NUMERIC_STATES.EXPLICIT_ZERO);
  assert.strictEqual(parsed.value, 0);
  const field = parseField('expectedRent', 0);
  assert.strictEqual(field.state, 'invalid');
  assert.strictEqual(field.reason, 'zero_not_valid');
  assert.notStrictEqual(field.state, 'notAssessed');
});

test('3 invalid rent is rejected, not treated as missing', () => {
  const parsed = parseCanonicalNumber('abc');
  assert.strictEqual(parsed.state, NUMERIC_STATES.INVALID);
  const field = parseField('expectedRent', 'abc');
  assert.strictEqual(field.state, 'invalid');
  assert.strictEqual(field.reason, 'not_finite');
  assert.notStrictEqual(field.state, 'notAssessed');
});

test('4 missing purchase price remains missing', () => {
  const metrics = calculateInvestmentMetrics({ expectedRent: 1000 });
  assert.strictEqual(metrics.inputSemantics.purchasePrice.state, NUMERIC_STATES.MISSING);
  assert.strictEqual(metrics.grossYield, null);
  assert.strictEqual(metrics.metricAssessment.grossYield.state, 'notAssessed');
});

test('5 missing operating costs do not become a zero-cost assumption', () => {
  const metrics = calculateInvestmentMetrics({ purchasePrice: 200000, expectedRent: 1000 });
  assert.strictEqual(metrics.noi, null);
  assert.strictEqual(metrics.operatingExpenses, null);
  assert.strictEqual(metrics.metricAssessment.operatingCosts.state, 'notAssessed');
  assert.ok(metrics.metricAssessment.operatingCosts.missingInputs.includes('maintenance'));
});

test('6 explicit zero operating cost remains distinguishable', () => {
  const missing = parseCanonicalNumber(undefined);
  const zero = parseCanonicalNumber(0);
  assert.notStrictEqual(missing.state, zero.state);
  const field = parseField('managementFee', 0);
  assert.strictEqual(field.available, true);
  assert.strictEqual(field.value, 0);
});

test('7 partial operating costs remain incomplete', () => {
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    maintenance: 1200,
    insurance: 600,
    vacancyAssumption: 0,
  });
  assert.strictEqual(metrics.metricAssessment.operatingCosts.state, 'notAssessed');
  assert.strictEqual(metrics.noi, null);
});

test('8 complete operating costs assess NOI normally', () => {
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    ...COMPLETE_COSTS,
  });
  assert.strictEqual(metrics.metricAssessment.noi.state, 'assessed');
  assert.strictEqual(metrics.noi, 12000 - 1200 - 600);
});

test('9 missing vacancy does not become 0% vacancy', () => {
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    maintenance: 0,
    insurance: 0,
    managementFee: 0,
    serviceCharge: 0,
    groundRent: 0,
    taxes: 0,
  });
  assert.strictEqual(metrics.inputSemantics.vacancyAssumption.state, NUMERIC_STATES.MISSING);
  assert.strictEqual(metrics.assumptions.vacancyRate, null);
  assert.strictEqual(metrics.metricAssessment.vacancyAdjustedIncome.state, 'notAssessed');
  assert.strictEqual(metrics.noi, null);
});

test('10 explicit 0% vacancy remains valid', () => {
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    ...COMPLETE_COSTS,
    vacancyAssumption: 0,
  });
  assert.strictEqual(metrics.inputSemantics.vacancyAssumption.state, NUMERIC_STATES.EXPLICIT_ZERO);
  assert.strictEqual(metrics.assumptions.vacancyRate, 0);
  assert.strictEqual(metrics.metricAssessment.vacancyAdjustedIncome.state, 'assessed');
  assert.strictEqual(metrics.effectiveGrossRent, 12000);
});

test('11 missing interest rate does not become 0%', () => {
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    ...COMPLETE_COSTS,
    deposit: 50000,
    mortgageTermYears: 25,
  });
  assert.strictEqual(metrics.inputSemantics.interestRate.state, NUMERIC_STATES.MISSING);
  assert.strictEqual(metrics.assumptions.interestRate, null);
  assert.strictEqual(metrics.annualCashFlow, null);
  assert.strictEqual(metrics.dscr, null);
});

test('12 explicit 0% interest remains distinguishable', () => {
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    ...COMPLETE_COSTS,
    deposit: 50000,
    interestRate: 0,
    mortgageTermYears: 25,
  });
  assert.strictEqual(metrics.inputSemantics.interestRate.state, NUMERIC_STATES.EXPLICIT_ZERO);
  assert.strictEqual(metrics.assumptions.interestRate, 0);
  assert.strictEqual(metrics.metricAssessment.cashFlow.state, 'assessed');
  assert.notStrictEqual(metrics.annualDebtService, null);
});

test('13 missing mortgage amount does not imply cash purchase', () => {
  const assessment = assessFinanceMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    ...COMPLETE_COSTS,
    interestRate: 5,
    mortgageTermYears: 25,
  });
  assert.strictEqual(assessment.financing.kind, FINANCING_KIND.UNKNOWN);
  assert.strictEqual(assessment.financing.inferredCashFromOmission, false);
  assert.strictEqual(assessment.cashFlow.state, 'notAssessed');
});

test('14 explicit cash / no-mortgage state is distinguishable', () => {
  const cash = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    ...COMPLETE_COSTS,
    deposit: 200000,
    interestRate: 0,
    mortgageTermYears: 25,
    mortgageAmount: 0,
  });
  assert.strictEqual(cash.financingState.kind, FINANCING_KIND.EXPLICIT_CASH);
  assert.strictEqual(cash.annualDebtService, 0);
  assert.strictEqual(cash.metricAssessment.cashFlow.state, 'assessed');
  assert.strictEqual(cash.metricAssessment.dscr.state, 'notAssessed');
  assert.strictEqual(cash.dscr, null);
});

test('15 missing term does not create a payment', () => {
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    ...COMPLETE_COSTS,
    deposit: 50000,
    interestRate: 5,
  });
  assert.strictEqual(metrics.assumptions.mortgageTermYears, null);
  assert.strictEqual(metrics.annualDebtService, null);
  assert.strictEqual(metrics.metricAssessment.mortgagePayment.state, 'notAssessed');
});

test('16 annual rent requires a valid rent basis', () => {
  assert.strictEqual(calculateInvestmentMetrics({}).metricAssessment.annualRent.state, 'notAssessed');
  assert.strictEqual(
    calculateInvestmentMetrics({ expectedRent: 1000 }).metricAssessment.annualRent.state,
    'assessed'
  );
  assert.strictEqual(
    calculateInvestmentMetrics({ expectedRent: 0 }).metricAssessment.annualRent.state,
    'notAssessed'
  );
});

test('17 gross yield with listing rent works', () => {
  const basis = resolveRentBasis({ listingMonthlyRent: 1000, marketRent: 1250 });
  assert.strictEqual(basis.kind, RENT_BASIS.LISTING);
  const metrics = calculateInvestmentMetrics({ purchasePrice: 200000, expectedRent: 1000 });
  assert.strictEqual(metrics.grossYield, 6);
  assert.strictEqual(metrics.metricAssessment.grossYield.state, 'assessed');
});

test('18–20 rent bases are not interchangeable facts', () => {
  const listing = resolveRentBasis({ listingMonthlyRent: 1000, marketRent: 1250, scenarioExpectedRent: null });
  assert.strictEqual(listing.kind, RENT_BASIS.LISTING);
  assert.strictEqual(listing.expectedRentIsNotMarketRent, true);
  assert.strictEqual(listing.marketSubstitutedForMissingListing, false);

  const market = resolveRentBasis({ listingMonthlyRent: null, marketRent: 1250 });
  assert.strictEqual(market.kind, RENT_BASIS.MARKET);
  assert.strictEqual(market.label, 'MARKET_RENT');
  assert.strictEqual(market.marketSubstitutedForMissingListing, true);
  assert.strictEqual(market.expectedRentIsNotMarketRent, false);
  assert.strictEqual(market.expectedRentIsNotListingRent, true);

  const scenario = resolveRentBasis({
    listingMonthlyRent: 1000,
    marketRent: 1250,
    scenarioExpectedRent: 1100,
  });
  assert.strictEqual(scenario.kind, RENT_BASIS.SCENARIO);
  assert.strictEqual(scenario.selectedRent, 1100);
  assert.strictEqual(scenario.expectedRentIsNotListingRent, true);
  assert.strictEqual(scenario.expectedRentIsNotMarketRent, true);
});

test('21–22 NOI and net yield are not assessed when required costs are missing', () => {
  const metrics = calculateInvestmentMetrics({ purchasePrice: 200000, expectedRent: 1000, vacancyAssumption: 0 });
  assert.strictEqual(metrics.metricAssessment.noi.state, 'notAssessed');
  assert.strictEqual(metrics.metricAssessment.netYield.state, 'notAssessed');
  assert.strictEqual(metrics.noi, null);
  assert.strictEqual(metrics.netYield, null);
});

test('23–24 cash flow and DSCR are not assessed when financing inputs are missing', () => {
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    ...COMPLETE_COSTS,
  });
  assert.strictEqual(metrics.metricAssessment.cashFlow.state, 'notAssessed');
  assert.strictEqual(metrics.metricAssessment.dscr.state, 'notAssessed');
  assert.strictEqual(metrics.annualCashFlow, null);
  assert.strictEqual(metrics.dscr, null);
});

test('25–27 zero, missing and invalid stay distinct', () => {
  assert.strictEqual(parseCanonicalNumber(0).state, NUMERIC_STATES.EXPLICIT_ZERO);
  assert.strictEqual(parseCanonicalNumber(null).state, NUMERIC_STATES.MISSING);
  assert.strictEqual(parseCanonicalNumber('').state, NUMERIC_STATES.MISSING);
  assert.strictEqual(parseCanonicalNumber('x').state, NUMERIC_STATES.INVALID);
  assert.notStrictEqual(parseCanonicalNumber(0).state, parseCanonicalNumber(null).state);
  assert.notStrictEqual(parseCanonicalNumber('x').state, parseCanonicalNumber(null).state);
});

test('28 presented metrics agree with raw assessment state', () => {
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    ...COMPLETE_COSTS,
    ...COMPLETE_FINANCE,
  });
  const presented = presentEvidencedInvestment(metrics);
  ['grossYield', 'noi', 'netYield', 'annualCashFlow', 'dscr'].forEach((key) => {
    const raw = metrics.metricAssessment[key === 'annualCashFlow' ? 'cashFlow' : key];
    assert.strictEqual(presented[key].available, raw.state === 'assessed');
    if (raw.state === 'assessed') {
      assert.strictEqual(presented[key].value, metrics[key]);
    } else {
      assert.strictEqual(presented[key].value, null);
      assert.strictEqual(metrics[key], null);
    }
  });
});

test('29 explanation facts carry market-rent basis instead of relabelling listing rent', () => {
  const presented = presentEvidencedInvestment(
    calculateInvestmentMetrics({ purchasePrice: 200000, expectedRent: 1250 }),
    null,
    {
      rentBasis: resolveRentBasis({ listingMonthlyRent: null, marketRent: 1250 }),
    }
  );
  assert.strictEqual(presented.grossYield.basis, 'MARKET_RENT');
  assert.strictEqual(presented.expectedRentIsNotMarketRent, false);
  assert.strictEqual(presented.rentBasis.kind, RENT_BASIS.MARKET);
});

test('30 PD does not score fabricated finance values', () => {
  const decision = scorePersonalDecision({
    profile: 'landlord',
    property: listing(),
    preferences: {},
    intelligence: {
      presentedInvestment: presentEvidencedInvestment(
        calculateInvestmentMetrics({ purchasePrice: 200000, expectedRent: 1000 })
      ),
    },
  });
  assert.strictEqual(decision.dimensions.netOperating.available, false);
  assert.strictEqual(decision.dimensions.cashFlow.available, false);
  assert.strictEqual(decision.dimensions.dscr.available, false);
});

test('32 buildRisks does not receive a fabricated missing→zero yield', () => {
  const metrics = calculateInvestmentMetrics({ purchasePrice: 200000 });
  assert.strictEqual(metrics.grossYield, null);
  const risks = buildRisks(
    listing({ monthly_rent: null }),
    { success: false },
    { metrics, presented: presentEvidencedInvestment(metrics) },
    { score: 80 }
  );
  assert.ok(!risks.some((r) => /yield/i.test(r.title || '') && /0%/.test(r.evidence || '')));
});

test('33 standalone investment path is protected by the shared engine', () => {
  const metrics = calculateInvestmentMetrics({ purchasePrice: 185000, expectedRent: 1100 });
  assert.strictEqual(metrics.grossYield, 7.14);
  assert.strictEqual(metrics.noi, null);
  assert.strictEqual(metrics.annualCashFlow, null);
  assert.strictEqual(metrics.dscr, null);
});

test('34 portfolio path uses presented yield only', () => {
  const src = read('services/ai/portfolioOptimiserService.js');
  assert.ok(!src.includes('?? metrics?.grossYield'));
  const row = analysePortfolioProperty(listing({ status: 'approved' }));
  assert.strictEqual(row.grossYield, 6);
  assert.strictEqual(row.netYield, null);
  assert.strictEqual(row.annualCashFlow, null);
});

test('35 What-if inheritance contract is unchanged', () => {
  const src = read('services/ai/intelligenceWhatIfService.js');
  assert.ok(src.includes('numericOption(options.purchasePrice)'));
  assert.ok(src.includes('numericOption(property.monthly_rent)'));
  assert.ok(src.includes('listingRent'));
  const engine = read('services/ai/financialEngine.js');
  assert.ok(engine.includes('Number(baseInput.vacancyAssumption) || 0'));
});

test('36 historical snapshots are not rewritten', () => {
  const files = [
    'services/ai/financialEngine.js',
    'services/ai/financeInputContract.js',
    'services/ai/evidencedInvestment.js',
    'services/ai/propertyIntelligenceEngine.js',
  ];
  files.forEach((rel) => {
    const src = read(rel);
    assert.ok(!/UPDATE\s+ai_requests/i.test(src));
    assert.ok(!/output_data\s*=/.test(src));
  });
});

test('37–38 valuation and assessment-safety stay on their modules', () => {
  const engine = read('services/ai/financialEngine.js');
  assert.ok(!engine.includes('calculatePropertyValuation'));
  assert.ok(!engine.includes('ASSESSMENT_SAFETY_VERSION'));
  assert.strictEqual(ASSESSMENT_SAFETY_VERSION, 'assessment-safety-1.0.0');
});

test('39–43 provider, outcome, credit, LLM and extra-provider freezes', () => {
  const engine = read('services/ai/financialEngine.js');
  const contract = read('services/ai/financeInputContract.js');
  const evidenced = read('services/ai/evidencedInvestment.js');
  const joined = `${engine}\n${contract}\n${evidenced}`;
  assert.ok(!/callOpenAI/.test(joined));
  assert.ok(!/recordSaleOutcome/.test(joined));
  assert.ok(!/deductCredits/.test(joined));
  assert.ok(!/address-match-uprn/.test(joined));
  assert.ok(!joined.includes('SAMPLE_SUFFICIENCY'));
  assert.strictEqual(SAMPLE_SUFFICIENCY.noData, 'NO_DATA');
  assert.ok(engine.includes('assessFinanceMetrics'));
  assert.ok(contract.includes(FINANCE_SEMANTIC_VERSION));
});

test('invariants: assessed NOI / DSCR / cash flow imply required inputs', () => {
  const assessed = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    ...COMPLETE_COSTS,
    ...COMPLETE_FINANCE,
  });
  assert.strictEqual(assessed.metricAssessment.noi.state, 'assessed');
  assert.strictEqual(assessed.metricAssessment.annualRent.state, 'assessed');
  assert.strictEqual(assessed.metricAssessment.operatingCosts.state, 'assessed');
  assert.strictEqual(assessed.metricAssessment.dscr.state, 'assessed');
  assert.strictEqual(assessed.metricAssessment.cashFlow.state, 'assessed');
  assert.ok(assessed.noi != null);
  assert.ok(assessed.dscr != null);

  const blocked = calculateInvestmentMetrics({ purchasePrice: 200000, expectedRent: 1000 });
  assert.strictEqual(blocked.metricAssessment.noi.state, 'notAssessed');
  assert.strictEqual(blocked.noi, null);
  assert.strictEqual(blocked.metricAssessment.dscr.state, 'notAssessed');
  assert.strictEqual(blocked.dscr, null);
});

test('purchase-price basis prefers an explicit scenario over listing asking', () => {
  const basis = resolvePurchasePriceBasis({ listingAskingPrice: 200000, scenarioPurchasePrice: 185000 });
  assert.strictEqual(basis.kind, 'SCENARIO');
  assert.strictEqual(basis.selectedPrice, 185000);
  assert.strictEqual(resolvePurchasePriceBasis({ listingAskingPrice: 200000 }).kind, 'LISTING');
});

asyncTest('18b market-rent-based gross yield is labelled on a PI report', async () => {
  const report = await analyse({ monthly_rent: null, weekly_rent: null });
  assert.strictEqual(report.investment.presented.grossYield.available, true);
  assert.strictEqual(report.investment.presented.grossYield.basis, 'MARKET_RENT');
  assert.strictEqual(report.investment.expectedRentIsNotMarketRent, false);
  assert.strictEqual(report.investment.rentBasis.kind, RENT_BASIS.MARKET);
  assert.ok(report.investment.rentBasis.marketSubstitutedForMissingListing);
  assert.notStrictEqual(report.investment.presented.grossYield.basis, 'LISTING_RENT');
});

asyncTest('19 listing rent is not relabelled as market rent', async () => {
  const report = await analyse();
  assert.strictEqual(report.investment.rentBasis.kind, RENT_BASIS.LISTING);
  assert.strictEqual(report.investment.expectedRentIsNotMarketRent, true);
  assert.strictEqual(report.investment.presented.grossYield.basis, 'LISTING_RENT');
});

asyncTest('31 DI does not promote fabricated finance findings', async () => {
  const report = await analyse();
  const findings = report.decisionIntelligence?.materialFindings || [];
  findings.forEach((finding) => {
    if (/noi|cash flow|dscr|net yield/i.test(finding.title || finding.id || '')) {
      assert.notStrictEqual(finding.state, 'assessed');
    }
  });
  assert.strictEqual(report.investment.presented.noi.available, false);
});

async function runPending() {
  for (const item of pending) {
    await item.fn();
    console.log(`✓ ${item.name}`);
  }
}

runPending()
  .then(() => {
    console.log('\nAll financeSemanticIntegrity tests passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
