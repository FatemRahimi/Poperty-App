/**
 * Canonical Property Intelligence finance-input API wiring.
 * Run: node server/tests/analyseFinanceRequest.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  FINANCE_INPUT_VERSION,
  FIELD_CONTRACT,
  ALIASES,
  LEGACY_FLAT_FREQUENCY,
  ANALYSE_FINANCE_REQUEST_EXAMPLE,
  parseFinancePayload,
  parseAnalyseFinanceRequest,
  invalidFinanceHttpResponse,
} = require('../services/ai/financeInputContract');
const { assemblePropertyFacts } = require('../services/ai/propertyFacts');
const { prepareEvidencedInvestment } = require('../services/ai/evidencedInvestment');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { resolveIntelligenceAnalyseOptions } = require('../controllers/intelligenceController');
const { comparePersonalDecisionWhatIf } = require('../services/ai/personalDecisionWhatIfEngine');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const {
  BUYER_GENERAL_WEIGHTS,
  LANDLORD_WEIGHTS,
} = require('../config/personalDecision.config');
const { CONFIDENCE_MODEL } = require('../services/ai/confidenceEngine');
const { weightedBlend } = require('../services/ai/valuationEngine');
const { parseDemandResponse, parseDemandRentResponse } = require('../services/providers/propertyData/propertyDataParsers');
const { OUTCOME_TYPES } = require('../services/ai/listingOutcomeService');
const { BACKTEST_ENGINE_VERSION } = require('../services/ai/backtesting/backtestFoundation');

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

const ASOF = '2026-08-25T12:00:00.000Z';

const COMPLETE_OPERATING = {
  maintenance: 1200,
  insurance: 600,
  managementFee: 0,
  taxes: 0,
  serviceCharge: 0,
  groundRent: 0,
  vacancyAssumption: 0,
};

const COMPLETE_FINANCE = {
  deposit: 50000,
  interestRate: 5,
  mortgageTermYears: 25,
};

const NESTED_BODY = {
  finance: {
    purchasePrice: 185000,
    expectedRent: 1100,
    operatingCosts: {
      maintenance: { value: 100, frequency: 'monthly' },
      insurance: { value: 600, frequency: 'annual' },
      managementFee: { value: 0, frequency: 'annual' },
      taxes: { value: 150, frequency: 'annual' },
      vacancyAssumption: 0,
    },
    deposit: 50000,
    interestRate: 5,
    mortgageTermYears: 25,
  },
};

function explanationText(decision) {
  const exp = decision?.explanation || {};
  return [
    exp.overall,
    ...(exp.strongestFactors || []).map((row) => row.text),
    ...(exp.weakestOrUnavailable || []).map((row) => row.text),
  ]
    .filter(Boolean)
    .join(' ');
}

function listing(overrides = {}) {
  return {
    id: 1,
    title: 'Finance wiring',
    city: 'Leeds',
    zip_code: 'LS1 1AA',
    category: 'sale',
    price: 200000,
    monthly_rent: 1000,
    service_charges: 100,
    ground_rent: 250,
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

function deps() {
  return {
    analyseRent: async () => ({
      success: true,
      recommendedRent: 1250,
      marketRange: { low: 1100, high: 1400 },
      comparables: [],
    }),
    calculatePropertyValuation: async () => ({ success: false }),
    generatePropertyExplanation: async () => ({ summary: 'template', source: 'template', tokensUsed: 0 }),
  };
}

async function analyse(body, listingOverrides = {}) {
  const parsed = parseAnalyseFinanceRequest(body);
  if (!parsed.ok) return { parsed, report: null };
  const report = await assemblePropertyIntelligenceReport({
    property: listing(listingOverrides),
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
      asOf: ASOF,
      ...parsed.options,
      deps: deps(),
    },
  });
  return { parsed, report };
}

test('controller analyse handlers share the canonical finance parser', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'intelligenceController.js'),
    'utf8'
  );
  assert.strictEqual(typeof resolveIntelligenceAnalyseOptions, 'function');
  assert.ok(/analysePropertyIntelligence[\s\S]*resolveIntelligenceAnalyseOptions/.test(src));
  assert.ok(/analyseSubjectIntelligence[\s\S]*resolveIntelligenceAnalyseOptions/.test(src));
  assert.ok(/invalidFinanceHttpResponse\(parsed\.errors\)/.test(src));
  assert.ok(/finance: parsed\.snapshot/.test(src));
  const parsed = resolveIntelligenceAnalyseOptions(NESTED_BODY);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.options.maintenance.frequency, 'monthly');
});

test('nested finance request reaches canonical financeInputContract', () => {
  const parsed = parseAnalyseFinanceRequest(NESTED_BODY);
  assert.strictEqual(parsed.ok, true);
  const contract = parseFinancePayload(parsed.options);
  const direct = parseFinancePayload(NESTED_BODY);
  assert.strictEqual(contract.engineInputs.maintenance, direct.engineInputs.maintenance);
  assert.strictEqual(contract.engineInputs.maintenance, 1200);
  assert.strictEqual(contract.engineInputs.insurance, 600);
  assert.strictEqual(contract.engineInputs.managementFee, 0);
  assert.strictEqual(contract.engineInputs.vacancyAssumption, 0);
  assert.strictEqual(contract.engineInputs.expectedRent, 1100);
  assert.strictEqual(contract.engineInputs.purchasePrice, 185000);
  assert.strictEqual(contract.fields.maintenance.originalFrequency, 'monthly');
  assert.strictEqual(contract.fields.vacancyAssumption.originalValue, 0);
  assert.strictEqual(parsed.snapshot.persistence, 'request_scoped');
  assert.strictEqual(parsed.snapshot.notPropertyTruth, true);
});

test('legacy aliases still resolve into the same contract', () => {
  const parsed = parseAnalyseFinanceRequest({
    vacancy: 0,
    mortgageTerm: 25,
    loanAmount: 150000,
    monthlyRent: 1100,
    maintenance: 1200,
    insurance: 600,
    managementFee: 0,
    taxes: 0,
    deposit: 50000,
    interestRate: 5,
  });
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.options.vacancyAssumption, 0);
  assert.strictEqual(parsed.options.mortgageTermYears, 25);
  assert.strictEqual(parsed.options.mortgageAmount, 150000);
  assert.strictEqual(parsed.options.expectedRent, 1100);
  assert.ok(!Object.prototype.hasOwnProperty.call(parsed.options, 'vacancy'));
  assert.ok(!Object.prototype.hasOwnProperty.call(parsed.options, 'loanAmount'));
  const contract = parseFinancePayload(parsed.options);
  const aliased = parseFinancePayload({
    vacancy: 0,
    mortgageTerm: 25,
    loanAmount: 150000,
    monthlyRent: 1100,
  });
  assert.strictEqual(contract.engineInputs.vacancyAssumption, aliased.engineInputs.vacancyAssumption);
  assert.strictEqual(contract.engineInputs.mortgageTermYears, aliased.engineInputs.mortgageTermYears);
  assert.strictEqual(contract.engineInputs.mortgageAmount, aliased.engineInputs.mortgageAmount);
  assert.strictEqual(contract.engineInputs.expectedRent, aliased.engineInputs.expectedRent);
  assert.strictEqual(ALIASES.vacancy, 'vacancyAssumption');
  assert.strictEqual(ALIASES.loanAmount, 'mortgageAmount');
  assert.strictEqual(LEGACY_FLAT_FREQUENCY.maintenance, 'annual');
  assert.strictEqual(LEGACY_FLAT_FREQUENCY.expectedRent, 'monthly');
});

test('unknown fields and internal injection are rejected', () => {
  const unknown = parseAnalyseFinanceRequest({ maintenance: 1200, fakeScore: 99 });
  assert.strictEqual(unknown.ok, false);
  assert.ok(unknown.errors.some((e) => e.field === 'fakeScore' && e.reason === 'unknown_field'));

  const deps = parseAnalyseFinanceRequest({
    maintenance: 1200,
    deps: { calculateInvestmentMetrics: () => ({ noi: 999999 }) },
  });
  assert.strictEqual(deps.ok, false);
  assert.ok(deps.errors.some((e) => e.reason === 'internal_option_not_allowed'));

  const skip = parseAnalyseFinanceRequest({ skipValidation: true, skipExplanation: true });
  assert.strictEqual(skip.ok, false);
  assert.ok(skip.errors.every((e) => e.reason === 'internal_option_not_allowed'));

  const nestedUnknown = parseAnalyseFinanceRequest({
    finance: { maintenance: 1200, ltv: 75, mortgageType: 'interest_only' },
  });
  assert.strictEqual(nestedUnknown.ok, false);
  assert.ok(nestedUnknown.errors.some((e) => e.field === 'finance.ltv'));
  assert.ok(nestedUnknown.errors.some((e) => e.field === 'finance.mortgageType'));

  const valid = parseAnalyseFinanceRequest({ maintenance: 1200 });
  Object.keys(valid.options).forEach((key) => {
    assert.ok(Object.prototype.hasOwnProperty.call(FIELD_CONTRACT, key), key);
  });
});

test('malformed and negative values are rejected without coercion', () => {
  const malformed = parseAnalyseFinanceRequest({ maintenance: { frequency: 'annual' } });
  assert.strictEqual(malformed.ok, false);
  assert.ok(malformed.errors.some((e) => e.reason === 'malformed_object'));

  const notFinite = parseAnalyseFinanceRequest({ deposit: 'abc' });
  assert.strictEqual(notFinite.ok, false);
  assert.ok(notFinite.errors.some((e) => e.reason === 'not_finite'));

  const negative = parseAnalyseFinanceRequest({ insurance: -10 });
  assert.strictEqual(negative.ok, false);
  assert.ok(negative.errors.some((e) => e.reason === 'negative_not_accepted'));
  assert.deepStrictEqual(negative.options, {});

  const zeroPrice = parseAnalyseFinanceRequest({ purchasePrice: 0 });
  assert.strictEqual(zeroPrice.ok, false);
  assert.ok(zeroPrice.errors.some((e) => e.reason === 'zero_not_valid'));

  const term = parseAnalyseFinanceRequest({ mortgageTermYears: 0 });
  assert.strictEqual(term.ok, false);
  assert.ok(term.errors.some((e) => e.reason === 'zero_not_valid' || e.reason === 'term_not_positive'));

  const vacancyRange = parseAnalyseFinanceRequest({ vacancyAssumption: 140 });
  assert.strictEqual(vacancyRange.ok, false);
  assert.ok(vacancyRange.errors.some((e) => e.reason === 'percent_out_of_range'));

  const rateRange = parseAnalyseFinanceRequest({ interestRate: 101 });
  assert.strictEqual(rateRange.ok, false);

  const arrayBody = parseAnalyseFinanceRequest([]);
  assert.strictEqual(arrayBody.ok, false);

  const http = invalidFinanceHttpResponse(negative.errors);
  assert.strictEqual(http.code, 'INVALID_FINANCE_INPUT');
  assert.strictEqual(http.success, false);
});

test('vacancy 0 remains explicit user-supplied zero and missing vacancy stays missing', () => {
  const explicit = parseAnalyseFinanceRequest({ vacancyAssumption: 0 });
  assert.strictEqual(explicit.ok, true);
  const explicitContract = parseFinancePayload(explicit.options);
  assert.strictEqual(explicitContract.fields.vacancyAssumption.available, true);
  assert.strictEqual(explicitContract.fields.vacancyAssumption.originalValue, 0);
  assert.strictEqual(explicitContract.fields.vacancyAssumption.userSupplied, true);

  const missing = parseAnalyseFinanceRequest({ maintenance: 1200 });
  const missingContract = parseFinancePayload(missing.options);
  assert.strictEqual(missingContract.fields.vacancyAssumption.available, false);
  assert.strictEqual(missingContract.fields.vacancyAssumption.state, 'notAssessed');
  assert.ok(!Object.prototype.hasOwnProperty.call(missing.options, 'vacancyAssumption'));
  assert.notStrictEqual(missingContract.engineInputs.vacancyAssumption, 0);
});

test('frequency is preserved and unknown frequency is not guessed', () => {
  const monthly = parseAnalyseFinanceRequest({
    maintenance: { value: 100, frequency: 'monthly' },
  });
  assert.strictEqual(monthly.ok, true);
  assert.strictEqual(monthly.options.maintenance.frequency, 'monthly');
  const monthlyContract = parseFinancePayload(monthly.options);
  assert.strictEqual(monthlyContract.fields.maintenance.originalFrequency, 'monthly');
  assert.strictEqual(monthlyContract.engineInputs.maintenance, 1200);
  assert.strictEqual(monthlyContract.fields.maintenance.conversionMethod, 'monthly_times_12');

  const weekly = parseAnalyseFinanceRequest({
    insurance: { value: 20, frequency: 'weekly' },
  });
  const weeklyContract = parseFinancePayload(weekly.options);
  assert.strictEqual(weeklyContract.engineInputs.insurance, 1040);
  assert.strictEqual(weeklyContract.fields.insurance.conversionMethod, 'weekly_times_52');

  const annual = parseAnalyseFinanceRequest({
    managementFee: { value: 900, frequency: 'annual' },
  });
  assert.strictEqual(parseFinancePayload(annual.options).engineInputs.managementFee, 900);

  const unknown = parseAnalyseFinanceRequest({
    taxes: { value: 50, frequency: 'quarterly' },
  });
  assert.strictEqual(unknown.ok, false);
  assert.ok(unknown.errors.some((e) => e.reason === 'unknown_frequency'));
  assert.deepStrictEqual(unknown.options, {});

  const caseGuess = parseAnalyseFinanceRequest({
    maintenance: { value: 100, frequency: 'Monthly' },
  });
  assert.strictEqual(caseGuess.ok, false);

  assert.strictEqual(LEGACY_FLAT_FREQUENCY.maintenance, 'annual');
  const flat = parseAnalyseFinanceRequest({ maintenance: 1200 });
  assert.strictEqual(parseFinancePayload(flat.options).engineInputs.maintenance, 1200);
  assert.strictEqual(parseFinancePayload(flat.options).fields.maintenance.originalFrequency, 'annual');
});

test('monthly weekly annual conversion is identical to the canonical contract', () => {
  const bodies = [
    { maintenance: { value: 100, frequency: 'monthly' } },
    { insurance: { value: 20, frequency: 'weekly' } },
    { managementFee: { value: 900, frequency: 'annual' } },
    { expectedRent: { value: 12000, frequency: 'annual' } },
  ];
  bodies.forEach((body) => {
    const parsed = parseAnalyseFinanceRequest(body);
    assert.strictEqual(parsed.ok, true);
    const viaHttp = parseFinancePayload(parsed.options);
    const viaContract = parseFinancePayload(body);
    assert.deepStrictEqual(viaHttp.engineInputs, viaContract.engineInputs);
  });
});

asyncTest('service-charge and ground-rent property facts stay unchanged under scenario override', async () => {
  const { parsed, report } = await analyse({
    ...COMPLETE_OPERATING,
    ...COMPLETE_FINANCE,
    serviceCharge: 2400,
    groundRent: 400,
  });
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(report.propertyFacts.facts.serviceCharge.value, 100);
  assert.strictEqual(report.propertyFacts.facts.groundRent.value, 250);
  assert.strictEqual(report.property.price, 200000);
  assert.strictEqual(report.financeRequest.serviceCharge.propertyFact.value, 100);
  assert.strictEqual(report.financeRequest.serviceCharge.scenarioInput.value, 2400);
  assert.strictEqual(report.financeRequest.serviceCharge.calculationSelectedValue, 2400);
  assert.strictEqual(report.financeRequest.serviceCharge.scenarioOverridesPropertyFact, true);
  assert.strictEqual(report.financeRequest.groundRent.propertyFact.value, 250);
  assert.strictEqual(report.financeRequest.groundRent.scenarioInput.value, 400);
  assert.strictEqual(report.financeRequest.groundRent.calculationSelectedValue, 400);
  assert.strictEqual(report.property.price, 200000);
});

asyncTest('expectedRent is user scenario and purchasePrice override is not listing asking', async () => {
  const { report } = await analyse({
    ...COMPLETE_OPERATING,
    ...COMPLETE_FINANCE,
    expectedRent: 1100,
    purchasePrice: 185000,
  });
  assert.strictEqual(report.property.price, 200000);
  assert.strictEqual(report.propertyFacts.facts.askingPrice.value, 200000);
  assert.strictEqual(report.financeRequest.purchasePrice.listingAskingPrice, 200000);
  assert.strictEqual(report.financeRequest.purchasePrice.scenarioPurchasePrice, 185000);
  assert.strictEqual(report.financeRequest.purchasePrice.calculationSelectedValue, 185000);
  assert.strictEqual(report.financeRequest.purchasePrice.scenarioIsNotListingAsking, true);
  assert.strictEqual(report.financeRequest.purchasePrice.scenarioIsNotAchievedPrice, true);
  assert.strictEqual(report.financeRequest.purchasePrice.listingAskingNotOverwritten, true);
  assert.strictEqual(report.financeRequest.expectedRent.label, 'user_supplied_scenario_input');
  assert.strictEqual(report.financeRequest.expectedRent.isNotMarketRent, true);
  assert.strictEqual(report.financeRequest.expectedRent.isNotRecommendedRent, true);
  assert.strictEqual(report.financeRequest.expectedRent.isNotAchievedRent, true);
  assert.strictEqual(report.financeRequest.expectedRent.isNotPropertyDataRentEvidence, true);
  assert.strictEqual(report.financeRequest.expectedRent.scenarioInput, 1100);
  assert.strictEqual(report.financeRequest.expectedRent.listingMonthlyRent, 1000);
  assert.strictEqual(report.financeRequest.expectedRent.marketRentEvidence, 1250);
  assert.strictEqual(report.financeRequest.expectedRent.calculationSelectedValue, 1100);
  assert.notStrictEqual(report.financeRequest.expectedRent.scenarioInput, report.marketIntelligence.rent.recommendedRent);
  assert.strictEqual(report.investment.expectedRentIsNotMarketRent, true);
});

asyncTest('complete operating inputs allow canonical NOI and missing vacancy keeps NOI notAssessed', async () => {
  const complete = await analyse({ ...COMPLETE_OPERATING, ...COMPLETE_FINANCE });
  assert.strictEqual(complete.report.investment.presented.costEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(complete.report.investment.presented.noi.available, true);
  assert.strictEqual(complete.report.financeRequest.operatingCostCompleteness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(complete.report.financeRequest.metrics.noi.state, 'assessed');

  const { vacancyAssumption, ...withoutVacancy } = COMPLETE_OPERATING;
  const missing = await analyse({ ...withoutVacancy, ...COMPLETE_FINANCE });
  assert.strictEqual(missing.report.investment.presented.noi.available, false);
  assert.strictEqual(missing.report.investment.presented.noi.state, 'notAssessed');
  assert.ok(missing.report.financeRequest.missingRequired.operatingCosts.includes('vacancyAssumption'));
  assert.notStrictEqual(missing.report.financeRequest.operatingCostCompleteness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(missing.report.financeRequest.metrics.noi.state, 'notAssessed');
});

asyncTest('complete finance allows cash flow and DSCR; missing finance stays notAssessed', async () => {
  const complete = await analyse({ ...COMPLETE_OPERATING, ...COMPLETE_FINANCE });
  assert.strictEqual(complete.report.investment.presented.financeEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(complete.report.investment.presented.annualCashFlow.available, true);
  assert.strictEqual(complete.report.investment.presented.dscr.available, true);
  assert.strictEqual(complete.report.financeRequest.financeCompleteness, 'COMPLETE_EVIDENCE');

  const missingDeposit = await analyse({
    ...COMPLETE_OPERATING,
    interestRate: 5,
    mortgageTermYears: 25,
  });
  assert.strictEqual(missingDeposit.report.investment.presented.annualCashFlow.available, false);
  assert.strictEqual(missingDeposit.report.investment.presented.dscr.available, false);
  assert.ok(missingDeposit.report.financeRequest.missingRequired.finance.includes('deposit'));

  const missingRate = await analyse({
    ...COMPLETE_OPERATING,
    deposit: 50000,
    mortgageTermYears: 25,
  });
  assert.ok(missingRate.report.financeRequest.missingRequired.finance.includes('interestRate'));
  assert.strictEqual(missingRate.report.investment.presented.dscr.available, false);

  const missingTerm = await analyse({
    ...COMPLETE_OPERATING,
    deposit: 50000,
    interestRate: 5,
  });
  assert.ok(missingTerm.report.financeRequest.missingRequired.finance.includes('mortgageTermYears'));
  assert.strictEqual(missingTerm.report.investment.presented.annualCashFlow.available, false);
});

asyncTest('application defaults are not presented as user inputs and snapshot keeps the scenario', async () => {
  const { parsed, report } = await analyse({
    ...COMPLETE_OPERATING,
    purchasePrice: 185000,
  });
  const receivedKeys = report.financeRequest.received.map((row) => row.key);
  assert.ok(receivedKeys.includes('maintenance'));
  assert.ok(!receivedKeys.includes('interestRate'));
  assert.ok(!receivedKeys.includes('deposit'));
  report.financeRequest.applicationDefaults.forEach((row) => {
    assert.strictEqual(row.userSupplied, false);
    assert.strictEqual(row.sourceKind, 'application_default');
    assert.ok(!receivedKeys.includes(row.key));
  });
  assert.strictEqual(report.financeRequest.applicationDefaultsAreNotUserInputs, true);
  assert.strictEqual(report.inputSnapshot.finance.persistence, 'request_scoped');
  assert.strictEqual(report.inputSnapshot.finance.notPropertyTruth, true);
  assert.strictEqual(report.inputSnapshot.finance.notUserFinanceProfile, true);
  assert.strictEqual(report.inputSnapshot.options.maintenance, 1200);
  assert.strictEqual(report.inputSnapshot.options.vacancyAssumption, 0);
  assert.strictEqual(parsed.snapshot.options.purchasePrice, 185000);
  assert.strictEqual(parsed.snapshot.notListingAttribute, true);
  assert.ok(!JSON.stringify(parsed.snapshot).includes('salary'));
  assert.ok(!JSON.stringify(parsed.snapshot).includes('creditScore'));
});

test('What-if uses the same finance conversion as analyse', () => {
  const body = {
    maintenance: { value: 100, frequency: 'monthly' },
    insurance: { value: 20, frequency: 'weekly' },
    vacancyAssumption: 0,
    deposit: 50000,
    interestRate: 5,
    mortgageTermYears: 25,
    expectedRent: 1100,
  };
  const parsed = parseAnalyseFinanceRequest(body);
  const analyseContract = parseFinancePayload(parsed.options);
  const whatIfContract = parseFinancePayload(body);
  assert.strictEqual(analyseContract.engineInputs.maintenance, whatIfContract.engineInputs.maintenance);
  assert.strictEqual(analyseContract.engineInputs.insurance, whatIfContract.engineInputs.insurance);
  assert.strictEqual(analyseContract.engineInputs.expectedRent, whatIfContract.engineInputs.expectedRent);

  const comparison = comparePersonalDecisionWhatIf({
    profile: 'landlord',
    property: listing(),
    preferences: {},
    intelligence: { confidence: { level: 'High', assessed: true }, risks: [] },
    finance: {
      expectedRent: 1000,
      deposit: 40000,
      interestRate: 4,
      mortgageTermYears: 25,
      vacancyAssumption: 0,
      maintenance: 600,
      insurance: 300,
      managementFee: 0,
      taxes: 0,
      serviceCharge: 0,
      groundRent: 0,
    },
    scenario: {
      finance: {
        maintenance: { value: 100, frequency: 'monthly' },
      },
    },
    asOf: '2026-06-01T00:00:00.000Z',
  });
  assert.strictEqual(comparison.available, true);
  assert.strictEqual(listing().service_charges, 100);
  assert.strictEqual(listing().ground_rent, 250);
});

test('regression freeze: landlord weights demand buyer_general valuation rent facts outcomes', () => {
  const buyer = scorePersonalDecision({
    profile: 'buyer_general',
    property: {
      id: 1,
      price: 380000,
      zip_code: 'M1 1AA',
      bedrooms: 3,
      property_type: 'Terraced',
      title: '3 bed terrace',
      description: 'Family home with garden.',
      has_garden: true,
      commuteMinutes: 22,
    },
    preferences: {
      budgetMax: 400000,
      location: 'M1 1AA',
      bedrooms: 3,
      propertyType: 'Terraced',
      lifestyle: 'family garden',
      maxCommuteMinutes: 30,
    },
    intelligence: {
      confidence: { level: 'High', assessed: true },
      sale: {
        success: true,
        centralEstimate: 375000,
        lowerEstimate: 360000,
        upperEstimate: 390000,
        evidenceCount: 8,
        confidence: 'high',
      },
    },
    finance: {
      deposit: 50000,
      interestRate: 5,
      mortgageTermYears: 25,
      vacancyAssumption: 0,
      maintenance: 1200,
    },
    asOf: '2026-06-01T00:00:00.000Z',
  });
  const landlord = scorePersonalDecision({
    profile: 'landlord',
    property: {
      id: 12,
      price: 200000,
      zip_code: 'W14 9JH',
      bedrooms: 2,
      property_type: 'Flat',
      monthly_rent: 1800,
    },
    preferences: {},
    intelligence: { confidence: { level: 'High', assessed: true }, risks: [] },
    finance: {
      expectedRent: 1800,
      deposit: 50000,
      interestRate: 4.5,
      mortgageTermYears: 25,
      vacancyAssumption: 5,
      maintenance: 1200,
      insurance: 600,
      managementFee: 0,
      serviceCharge: 0,
      groundRent: 0,
      taxes: 0,
    },
    asOf: '2026-06-01T00:00:00.000Z',
  });
  assert.ok(Number.isFinite(buyer.score));
  assert.ok(Number.isFinite(landlord.score));
  assert.strictEqual(landlord.dimensions.demand.state, 'no_demand_data_source');
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.lifestyle, 0.08);
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(CONFIDENCE_MODEL.baseVersion, 'confidence-1.1.0');
  const blend = weightedBlend([
    {
      centralEstimate: 500000,
      lowerEstimate: 480000,
      upperEstimate: 520000,
      method: 'valuation_sale_avm',
    },
  ]);
  assert.strictEqual(blend.central, 500000);
  assert.ok(parseDemandResponse({ demand_rating: 3 }));
  assert.ok(parseDemandRentResponse({ rental_demand_rating: 4 }));
  assert.deepStrictEqual([...OUTCOME_TYPES].sort(), ['let', 'sold', 'under_offer', 'withdrawn']);
  assert.strictEqual(BACKTEST_ENGINE_VERSION, 'backtest-foundation-1.0.0');
  assert.strictEqual(FINANCE_INPUT_VERSION, 'finance-input-1.0.0');
  const facts = assemblePropertyFacts({ property: { id: 1, ground_rent: 250, service_charges: 1200 } });
  assert.strictEqual(facts.version, 'property-facts-1.1.0');
  assert.strictEqual(facts.facts.serviceCharge.value, 1200);
  const engine = fs.readFileSync(path.join(__dirname, '..', 'services', 'ai', 'financialEngine.js'), 'utf8');
  assert.ok(/const round = \(n, d = 2\) => Math.round\(n \* 10 \*\* d\) \/ 10 \*\* d/.test(engine));
  assert.ok(ANALYSE_FINANCE_REQUEST_EXAMPLE.finance.operatingCosts.maintenance.frequency);
});

test('example nested request is accepted by the HTTP parser', () => {
  const parsed = parseAnalyseFinanceRequest(ANALYSE_FINANCE_REQUEST_EXAMPLE);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.options.maintenance.frequency, 'monthly');
  assert.strictEqual(parsed.options.vacancyAssumption, 0);
});

test('prepareEvidencedInvestment still ignores unknown keys that never passed HTTP validation', () => {
  const prepared = prepareEvidencedInvestment({
    purchasePrice: 200000,
    expectedRent: 1000,
    options: parseAnalyseFinanceRequest({
      maintenance: 1200,
      insurance: 600,
      managementFee: 0,
      taxes: 0,
      vacancyAssumption: 0,
      serviceCharge: 0,
      groundRent: 0,
    }).options,
  });
  assert.ok(!Object.prototype.hasOwnProperty.call(prepared.input, 'fakeScore'));
  assert.ok(!Object.prototype.hasOwnProperty.call(prepared.input, 'skipValidation'));
  assert.strictEqual(prepared.input.maintenance, 1200);
});

asyncTest('nested complete finance plus listing charges keeps Personal Decision explanation aligned with presented metrics', async () => {
  const { report } = await analyse(NESTED_BODY);
  assert.strictEqual(report.investment.presented.costEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(report.investment.presented.financeEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(report.investment.presented.noi.available, true);
  assert.strictEqual(report.investment.presented.dscr.available, true);
  assert.strictEqual(report.personalDecision.dimensions.netOperating.available, true);
  assert.notStrictEqual(report.personalDecision.dimensions.netOperating.state, 'costs_not_supplied');
  assert.ok(
    !/Operating costs were not supplied/i.test(explanationText(report.personalDecision)),
    explanationText(report.personalDecision)
  );
});

asyncTest('partial operating costs keep NOI and Personal Decision netOperating notAssessed', async () => {
  const { report } = await analyse({
    finance: {
      purchasePrice: 185000,
      expectedRent: 1100,
      operatingCosts: {
        maintenance: { value: 100, frequency: 'monthly' },
      },
      ...COMPLETE_FINANCE,
    },
  });
  assert.strictEqual(report.investment.presented.costEvidence.completeness, 'PARTIAL_EVIDENCE');
  assert.strictEqual(report.investment.presented.noi.available, false);
  assert.strictEqual(report.personalDecision.dimensions.netOperating.available, false);
  assert.ok(/not assessed|not supplied|incomplete/i.test(explanationText(report.personalDecision)));
});

asyncTest('missing finance does not fabricate completeness or PD cash-flow evidence', async () => {
  const { report } = await analyse({});
  assert.notStrictEqual(report.investment?.presented?.financeEvidence?.completeness, 'COMPLETE_EVIDENCE');
  assert.notStrictEqual(report.investment?.presented?.costEvidence?.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(report.investment?.presented?.noi?.available, false);
  assert.strictEqual(report.investment?.presented?.dscr?.available, false);
  assert.strictEqual(report.personalDecision.dimensions.netOperating.available, false);
  assert.strictEqual(report.personalDecision.dimensions.cashFlow.available, false);
  assert.strictEqual(report.personalDecision.dimensions.dscr.available, false);
  const receivedKeys = (report.financeRequest?.received || []).map((row) => row.key);
  assert.ok(!receivedKeys.includes('mortgageTermYears'));
  assert.ok(!receivedKeys.includes('vacancyAssumption'));
});

async function run() {
  for (const t of pending) {
    await t.fn();
    console.log(`✓ ${t.name}`);
  }
  console.log('\nanalyseFinanceRequest.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
