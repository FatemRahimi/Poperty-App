/**
 * Evidenced landlord cost & finance capture.
 * Run: node server/tests/financeInputContract.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  FINANCE_INPUT_VERSION,
  FIELD_CONTRACT,
  METRIC_DEPENDENCIES,
  parseFinancePayload,
  parseField,
} = require('../services/ai/financeInputContract');
const { assemblePropertyFacts, TRUST } = require('../services/ai/propertyFacts');
const {
  prepareEvidencedInvestment,
  presentEvidencedInvestment,
} = require('../services/ai/evidencedInvestment');
const { calculateInvestmentMetrics } = require('../services/ai/financialEngine');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
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

function presentFrom(options, listing = {}) {
  const facts = assemblePropertyFacts({
    property: { id: 1, price: 200000, monthly_rent: 1000, category: 'sale', ...listing },
  });
  const prepared = prepareEvidencedInvestment({
    purchasePrice: 200000,
    expectedRent: 1000,
    options,
    propertyFacts: facts,
    property: { id: 1, price: 200000, monthly_rent: 1000, ...listing },
  });
  const metrics = calculateInvestmentMetrics(prepared.input, prepared.provenanceHints);
  return {
    facts,
    prepared,
    metrics,
    presented: presentEvidencedInvestment(metrics, prepared.operatingCostEvidence),
  };
}

test('maintenance insurance management fee and taxes can be explicitly user supplied', () => {
  const parsed = parseFinancePayload({
    finance: {
      maintenance: 1200,
      insurance: 600,
      managementFee: 0,
      taxes: 150,
    },
  });
  assert.strictEqual(parsed.fields.maintenance.sourceKind, 'user_supplied');
  assert.strictEqual(parsed.engineInputs.maintenance, 1200);
  assert.strictEqual(parsed.engineInputs.insurance, 600);
  assert.strictEqual(parsed.engineInputs.managementFee, 0);
  assert.strictEqual(parsed.engineInputs.taxes, 150);
  assert.strictEqual(parsed.notMarketEvidence, true);
  assert.strictEqual(FIELD_CONTRACT.taxes.note.includes('Not council tax'), true);
});

test('landlord taxes are not council tax', () => {
  const { prepared, facts } = presentFrom(
    { taxes: 400 },
    { council_tax_band: 'E' }
  );
  assert.strictEqual(prepared.input.taxes, 400);
  assert.notStrictEqual(prepared.input.taxes, facts.facts.councilTaxAmount.value);
  assert.strictEqual(prepared.financeInputs.councilTaxMappedToTaxes, false);
});

test('explicit vacancy 0% differs from missing vacancy', () => {
  const missing = presentFrom({});
  assert.ok(!Object.prototype.hasOwnProperty.call(missing.prepared.input, 'vacancyAssumption'));
  assert.strictEqual(missing.metrics.assumptionCoverage.assumptions.vacancyAssumption.source, 'application_default');
  assert.strictEqual(missing.presented.costEvidence.completeness !== 'COMPLETE_EVIDENCE', true);
  assert.ok(missing.presented.costEvidence.missing.includes('vacancyAssumption'));

  const zero = presentFrom({ vacancyAssumption: 0 });
  assert.strictEqual(zero.prepared.input.vacancyAssumption, 0);
  assert.strictEqual(zero.prepared.provenanceHints.vacancyAssumption, 'user_supplied');
  assert.strictEqual(zero.metrics.assumptionCoverage.assumptions.vacancyAssumption.source, 'user_supplied');
});

test('missing operating cost is not genuine zero; explicit zero remains user supplied', () => {
  const missing = presentFrom({});
  assert.ok(!Object.prototype.hasOwnProperty.call(missing.prepared.input, 'maintenance'));
  assert.notStrictEqual(missing.prepared.input.maintenance, 0);
  const zero = parseField('managementFee', 0);
  assert.strictEqual(zero.available, true);
  assert.strictEqual(zero.value, 0);
  assert.strictEqual(zero.sourceKind, 'user_supplied');
});

test('monthly weekly and annual conversions are deterministic; unknown frequency is not guessed', () => {
  const monthly = parseFinancePayload({ maintenance: { value: 100, frequency: 'monthly' } });
  assert.strictEqual(monthly.engineInputs.maintenance, 1200);
  assert.strictEqual(monthly.fields.maintenance.conversionMethod, 'monthly_times_12');
  const weekly = parseFinancePayload({ insurance: { value: 20, frequency: 'weekly' } });
  assert.strictEqual(weekly.engineInputs.insurance, 1040);
  const annual = parseFinancePayload({ managementFee: { value: 900, frequency: 'annual' } });
  assert.strictEqual(annual.engineInputs.managementFee, 900);
  const unknown = parseFinancePayload({ taxes: { value: 50, frequency: 'quarterly' } });
  assert.ok(!Object.prototype.hasOwnProperty.call(unknown.engineInputs, 'taxes'));
  assert.strictEqual(unknown.fields.taxes.reason, 'unknown_frequency');
});

test('service charge and ground rent still come from propertyFacts unless a user scenario override is supplied', () => {
  const fromFacts = presentFrom({}, { service_charges: 100, ground_rent: 250 });
  assert.strictEqual(fromFacts.facts.facts.serviceCharge.value, 100);
  assert.strictEqual(fromFacts.prepared.input.serviceCharge, 1200);
  assert.strictEqual(fromFacts.prepared.input.groundRent, 250);
  assert.strictEqual(fromFacts.prepared.scenarioOverrides.serviceCharge, undefined);

  const override = presentFrom(
    { serviceCharge: 5000, groundRent: 1 },
    { service_charges: 100, ground_rent: 250 }
  );
  assert.strictEqual(override.facts.facts.serviceCharge.value, 100);
  assert.strictEqual(override.prepared.input.serviceCharge, 5000);
  assert.strictEqual(override.prepared.input.groundRent, 1);
  assert.strictEqual(override.prepared.scenarioOverrides.serviceCharge, true);
  assert.notStrictEqual(override.facts.facts.serviceCharge.value, override.prepared.input.serviceCharge);
});

test('user-supplied values retain provenance and are not observed market evidence', () => {
  const { prepared } = presentFrom({ maintenance: 800, deposit: 40000, interestRate: 4.5, mortgageTermYears: 25 });
  assert.strictEqual(prepared.financeInputs.fields.maintenance.sourceKind, 'user_supplied');
  assert.strictEqual(prepared.financeInputs.notMarketEvidence, true);
  assert.strictEqual(prepared.provenanceHints.maintenance, 'user_supplied');
  assert.strictEqual(prepared.provenanceHints.deposit, 'user_supplied');
  assert.notStrictEqual(prepared.financeInputs.fields.maintenance.sourceKind, 'observed');
});

test('COMPLETE_EVIDENCE requires the defined cost contract including vacancy', () => {
  const partial = presentFrom({
    maintenance: 1200,
    insurance: 600,
    managementFee: 0,
    taxes: 0,
    serviceCharge: 0,
    groundRent: 0,
  });
  assert.strictEqual(partial.presented.costEvidence.completeness, 'PARTIAL_EVIDENCE');
  assert.strictEqual(partial.presented.noi.available, false);
  assert.strictEqual(partial.presented.grossYield.available, true);
  assert.strictEqual(partial.presented.grossYield.value, 6);

  const complete = presentFrom({
    maintenance: 1200,
    insurance: 600,
    managementFee: 0,
    taxes: 0,
    serviceCharge: 0,
    groundRent: 0,
    vacancyAssumption: 0,
  });
  assert.strictEqual(complete.presented.costEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(complete.presented.noi.available, true);
  assert.strictEqual(complete.presented.netYield.available, true);
  assert.strictEqual(complete.metrics.noi, 12000 - 1200 - 600);
  assert.notStrictEqual(complete.presented.netYield.value, complete.presented.grossYield.value);
});

test('missing finance keeps cash flow and DSCR notAssessed; explicit finance uses existing formulas', () => {
  const costs = {
    maintenance: 0,
    insurance: 0,
    managementFee: 0,
    taxes: 0,
    serviceCharge: 0,
    groundRent: 0,
    vacancyAssumption: 0,
  };
  const noFinance = presentFrom(costs);
  assert.strictEqual(noFinance.presented.financeEvidence.completeness, 'NOT_ASSESSED');
  assert.strictEqual(noFinance.presented.annualCashFlow.available, false);
  assert.strictEqual(noFinance.presented.dscr.available, false);
  assert.strictEqual(noFinance.metrics.assumptionCoverage.assumptions.mortgageTermYears.source, 'application_default');
  assert.notStrictEqual(noFinance.metrics.assumptionCoverage.assumptions.mortgageTermYears.source, 'user_supplied');

  const withFinance = presentFrom({
    ...costs,
    deposit: 50000,
    interestRate: 5,
    mortgageTermYears: 25,
  });
  assert.strictEqual(withFinance.presented.financeEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(withFinance.presented.annualCashFlow.available, true);
  assert.strictEqual(withFinance.presented.dscr.available, true);
  const expected = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    ...costs,
    deposit: 50000,
    interestRate: 5,
    mortgageTermYears: 25,
  });
  assert.strictEqual(withFinance.metrics.annualCashFlow, expected.annualCashFlow);
  assert.strictEqual(withFinance.metrics.dscr, expected.dscr);
});

test('listing tenancy deposit is not mortgage deposit; expected rent is not market rent', () => {
  const parsed = parseFinancePayload({ deposit_amount: 1800 });
  assert.ok(!Object.prototype.hasOwnProperty.call(parsed.engineInputs, 'deposit'));
  assert.strictEqual(parsed.listingDepositUsedAsMortgageDeposit, false);
  const { presented, prepared } = presentFrom({ expectedRent: 1100 });
  assert.strictEqual(prepared.input.expectedRent, 1100);
  assert.strictEqual(presented.expectedRentIsNotMarketRent, true);
  assert.strictEqual(presented.scenarioIsNotObservedResult, true);
  assert.strictEqual(prepared.analysisKind, 'user_scenario');
});

test('area context and council tax are not landlord operating costs', () => {
  const facts = assemblePropertyFacts({
    property: { id: 2, price: 200000, monthly_rent: 1000, council_tax_band: 'D' },
  });
  facts.facts.serviceCharge = {
    available: true,
    value: 50,
    trust: TRUST.areaContext,
    scope: 'area',
    originalFrequency: 'annual',
  };
  const prepared = prepareEvidencedInvestment({
    purchasePrice: 200000,
    expectedRent: 1000,
    propertyFacts: facts,
    options: {},
  });
  assert.ok(!Object.prototype.hasOwnProperty.call(prepared.input, 'serviceCharge'));
  assert.ok(!Object.prototype.hasOwnProperty.call(prepared.input, 'taxes'));
});

test('LLM cannot generate financial inputs or results', () => {
  const explanation = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'propertyExplanationService.js'),
    'utf8'
  );
  const contract = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'financeInputContract.js'),
    'utf8'
  );
  const engine = fs.readFileSync(path.join(__dirname, '..', 'services', 'ai', 'financialEngine.js'), 'utf8');
  assert.ok(/must NOT invent/.test(explanation));
  assert.ok(/maintenance, insurance, management fee, taxes, vacancy, deposit/.test(explanation));
  assert.ok(!/callOpenAI/.test(contract));
  assert.ok(!/callOpenAI/.test(engine));
  assert.strictEqual(METRIC_DEPENDENCIES.dscr.includes('noi'), true);
});

asyncTest('canonical report consumes the finance contract without a second engine', async () => {
  const report = await assemblePropertyIntelligenceReport({
    property: {
      id: 1,
      title: 'Finance',
      city: 'Leeds',
      zip_code: 'LS1 1AA',
      category: 'sale',
      price: 200000,
      monthly_rent: 1000,
      service_charges: 100,
      ground_rent: 250,
    },
    access: {
      allowed: true,
      userId: 1,
      role: 'owner',
      relationship: 'owner',
      accessLevel: 'professional_intelligence',
      propertyId: 1,
    },
    userId: 1,
    target: { propertyId: 1 },
    options: {
      skipExplanation: true,
      skipPostcodeMarket: true,
      skipPlanning: true,
      asOf: '2026-08-25T12:00:00.000Z',
      maintenance: 1200,
      insurance: 600,
      managementFee: 0,
      taxes: 0,
      vacancyAssumption: 0,
      deposit: 50000,
      interestRate: 5,
      mortgageTermYears: 25,
      deps: {
        analyseRent: async () => ({ success: false, comparables: [] }),
        calculatePropertyValuation: async () => ({ success: false }),
        generatePropertyExplanation: async () => {
          throw new Error('LLM must not invent finance inputs');
        },
      },
    },
  });
  assert.strictEqual(report.analysisMode, 'canonical');
  assert.strictEqual(report.propertyFacts.facts.serviceCharge.value, 100);
  assert.strictEqual(report.investment.presented.costEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(report.investment.presented.financeEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(report.investment.presented.noi.available, true);
  assert.strictEqual(report.investment.presented.annualCashFlow.available, true);
  assert.strictEqual(report.investment.presented.dscr.available, true);
  assert.strictEqual(report.investment.financeInputs.sourceKind, 'user_supplied');
  assert.strictEqual(report.investment.expectedRentIsNotMarketRent, true);
});

test('regression freeze: scores weights demand confidence valuation demand-rent facts and outcomes', () => {
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
});

async function run() {
  for (const t of pending) {
    await t.fn();
    console.log(`✓ ${t.name}`);
  }
  console.log('\nfinanceInputContract.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
