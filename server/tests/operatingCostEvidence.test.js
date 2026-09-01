/**
 * Evidenced operating-cost integration — propertyFacts into existing financialEngine.
 * Run: node server/tests/operatingCostEvidence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assemblePropertyFacts, TRUST, DEPENDENCY_MODEL } = require('../services/ai/propertyFacts');
const { financialCostsFromPropertyFacts } = require('../services/ai/operatingCostEvidence');
const {
  prepareEvidencedInvestment,
  buildEvidencedInvestmentInput,
  presentEvidencedInvestment,
} = require('../services/ai/evidencedInvestment');
const { calculateInvestmentMetrics } = require('../services/ai/financialEngine');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const {
  BUYER_GENERAL_WEIGHTS,
  LANDLORD_WEIGHTS,
} = require('../config/personalDecision.config');
const { CONFIDENCE_MODEL, FACTOR_WEIGHTS } = require('../services/ai/confidenceEngine');
const { weightedBlend } = require('../services/ai/valuationEngine');
const {
  parseDemandResponse,
  parseDemandRentResponse,
} = require('../services/providers/propertyData/propertyDataParsers');
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

function listingFacts(extra = {}) {
  return assemblePropertyFacts({
    property: {
      id: 1,
      price: 200000,
      monthly_rent: 1000,
      category: 'sale',
      ...extra,
    },
  });
}

test('known annual service charge is consumed after monthly normalisation', () => {
  const facts = listingFacts({ service_charges: 1200 });
  assert.strictEqual(facts.facts.serviceCharge.value, 1200);
  assert.strictEqual(facts.facts.serviceCharge.originalFrequency, 'monthly');
  const adapter = financialCostsFromPropertyFacts(facts);
  assert.strictEqual(adapter.inputs.serviceCharge, 14400);
  assert.strictEqual(adapter.evidence.serviceCharge.conversionMethod, 'monthly_times_12');
  assert.strictEqual(adapter.evidence.source, 'propertyFacts');
  const prepared = prepareEvidencedInvestment({
    purchasePrice: 200000,
    expectedRent: 1000,
    propertyFacts: facts,
  });
  assert.strictEqual(prepared.input.serviceCharge, 14400);
  assert.strictEqual(prepared.operatingCostEvidence.source, 'propertyFacts');
});

test('known annual ground rent is consumed correctly', () => {
  const facts = listingFacts({ ground_rent: 250 });
  assert.strictEqual(facts.facts.groundRent.value, 250);
  assert.strictEqual(facts.facts.groundRent.originalFrequency, 'annual');
  const adapter = financialCostsFromPropertyFacts(facts);
  assert.strictEqual(adapter.inputs.groundRent, 250);
  assert.strictEqual(adapter.evidence.groundRent.conversionMethod, 'annual_passthrough');
  const prepared = prepareEvidencedInvestment({
    purchasePrice: 200000,
    expectedRent: 1000,
    propertyFacts: facts,
  });
  assert.strictEqual(prepared.input.groundRent, 250);
  const metrics = calculateInvestmentMetrics(prepared.input, prepared.provenanceHints);
  assert.strictEqual(metrics.groundRent, 250);
  assert.strictEqual(metrics.groundRentState, 'observed');
  assert.strictEqual(metrics.metricAssessment.noi.state, 'notAssessed');
  assert.strictEqual(metrics.groundRentIncludedInNoi, false);
});

test('missing service charge is not zero', () => {
  const facts = listingFacts();
  assert.strictEqual(facts.facts.serviceCharge.value, null);
  assert.notStrictEqual(facts.facts.serviceCharge.value, 0);
  const prepared = prepareEvidencedInvestment({
    purchasePrice: 200000,
    expectedRent: 1000,
    propertyFacts: facts,
  });
  assert.ok(!Object.prototype.hasOwnProperty.call(prepared.input, 'serviceCharge'));
  assert.notStrictEqual(prepared.input.serviceCharge, 0);
  const presented = presentEvidencedInvestment(
    calculateInvestmentMetrics(prepared.input, prepared.provenanceHints),
    prepared.operatingCostEvidence
  );
  assert.strictEqual(presented.noi.state, 'notAssessed');
});

test('missing ground rent is not zero', () => {
  const facts = listingFacts();
  assert.strictEqual(facts.facts.groundRent.value, null);
  assert.notStrictEqual(facts.facts.groundRent.value, 0);
  const prepared = prepareEvidencedInvestment({
    purchasePrice: 200000,
    expectedRent: 1000,
    propertyFacts: facts,
  });
  assert.ok(!Object.prototype.hasOwnProperty.call(prepared.input, 'groundRent'));
  const metrics = calculateInvestmentMetrics(prepared.input, prepared.provenanceHints);
  assert.strictEqual(metrics.groundRent, null);
  assert.notStrictEqual(metrics.groundRent, 0);
});

test('unknown frequency is not guessed and is excluded from arithmetic', () => {
  const facts = listingFacts({ service_charges: 500, ground_rent: 100 });
  facts.facts.serviceCharge.originalFrequency = null;
  facts.facts.serviceCharge.financiallyUsable = false;
  const adapter = financialCostsFromPropertyFacts(facts);
  assert.strictEqual(adapter.inputs.serviceCharge, undefined);
  assert.strictEqual(adapter.evidence.serviceCharge.excluded, true);
  assert.strictEqual(adapter.evidence.serviceCharge.reason, 'unknown_frequency');
  assert.strictEqual(adapter.inputs.groundRent, 100);
  const prepared = prepareEvidencedInvestment({
    purchasePrice: 200000,
    expectedRent: 1000,
    propertyFacts: facts,
  });
  assert.ok(!Object.prototype.hasOwnProperty.call(prepared.input, 'serviceCharge'));
});

test('propertyFacts is the source of the evidence', () => {
  const facts = listingFacts({ service_charges: 100, ground_rent: 250 });
  const prepared = prepareEvidencedInvestment({
    purchasePrice: 200000,
    expectedRent: 1000,
    propertyFacts: facts,
  });
  assert.strictEqual(prepared.operatingCostEvidence.source, 'propertyFacts');
  assert.strictEqual(prepared.propertyFacts.engine, 'propertyFacts');
  const adapterSrc = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'operatingCostEvidence.js'),
    'utf8'
  );
  const engineSrc = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'financialEngine.js'),
    'utf8'
  );
  assert.ok(!/assemblePropertyFacts/.test(engineSrc));
  assert.ok(!/listingObservedCharges/.test(engineSrc));
  assert.ok(/propertyFacts/.test(adapterSrc));
});

test('provenance survives into financial evidence', () => {
  const facts = listingFacts({ service_charges: 80, ground_rent: 200 });
  const prepared = prepareEvidencedInvestment({
    purchasePrice: 200000,
    expectedRent: 1000,
    propertyFacts: facts,
  });
  assert.ok(prepared.operatingCostEvidence.serviceCharge.fact.provenance);
  assert.strictEqual(prepared.operatingCostEvidence.serviceCharge.fact.source, 'InternalListing');
  assert.strictEqual(prepared.provenanceHints.serviceCharge, 'user_supplied');
  assert.strictEqual(prepared.provenanceHints.groundRent, 'user_supplied');
  const metrics = calculateInvestmentMetrics(prepared.input, prepared.provenanceHints);
  assert.strictEqual(metrics.assumptionCoverage.assumptions.serviceCharge.source, 'user_supplied');
  assert.strictEqual(metrics.assumptionCoverage.assumptions.groundRent.source, 'user_supplied');
});

test('partial costs are explicitly partial and do not masquerade as complete NOI', () => {
  const facts = listingFacts({ service_charges: 100, ground_rent: 250 });
  const prepared = prepareEvidencedInvestment({
    purchasePrice: 200000,
    expectedRent: 1000,
    propertyFacts: facts,
  });
  const metrics = calculateInvestmentMetrics(prepared.input, prepared.provenanceHints);
  const presented = presentEvidencedInvestment(metrics, prepared.operatingCostEvidence);
  assert.strictEqual(presented.costEvidence.completeness, 'PARTIAL_EVIDENCE');
  assert.ok(presented.costEvidence.included.includes('serviceCharge'));
  assert.ok(presented.costEvidence.included.includes('groundRent'));
  assert.ok(presented.costEvidence.missing.includes('maintenance'));
  assert.strictEqual(presented.costsAssessed, false);
  assert.strictEqual(presented.noi.available, false);
  assert.strictEqual(presented.noi.state, 'notAssessed');
  assert.strictEqual(presented.netYield.available, false);
  assert.ok(/partial/i.test(presented.noi.reason));
});

test('gross yield remains distinct from net yield', () => {
  const facts = listingFacts({ service_charges: 100, ground_rent: 250 });
  const prepared = prepareEvidencedInvestment({
    purchasePrice: 200000,
    expectedRent: 1000,
    propertyFacts: facts,
  });
  const metrics = calculateInvestmentMetrics(prepared.input, prepared.provenanceHints);
  const presented = presentEvidencedInvestment(metrics, prepared.operatingCostEvidence);
  assert.strictEqual(presented.grossYield.available, true);
  assert.strictEqual(presented.grossYield.value, 6);
  assert.strictEqual(presented.netYield.available, false);
  assert.notStrictEqual(presented.grossYield.value, presented.netYield.value);
});

test('council tax is not automatically charged to landlord', () => {
  const facts = assemblePropertyFacts({
    property: { id: 3, price: 200000, monthly_rent: 1000, council_tax_band: 'E' },
    evidence: {
      fields: {
        council_tax_rate: {
          available: true,
          value: 1890.12,
          state: 'observed',
          source: 'PropertyData',
          propertyScope: 'property',
          provenance: { source: 'PropertyData', method: 'uprn_profile' },
        },
      },
      identity: { propertyLevelMatch: true },
    },
  });
  const prepared = prepareEvidencedInvestment({
    purchasePrice: 200000,
    expectedRent: 1000,
    propertyFacts: facts,
  });
  assert.ok(!Object.prototype.hasOwnProperty.call(prepared.input, 'taxes'));
  assert.strictEqual(prepared.operatingCostEvidence.councilTax.treatedAsLandlordOperatingCost, false);
  assert.strictEqual(prepared.operatingCostEvidence.councilTax.mappedToTaxesInput, false);
  assert.strictEqual(facts.facts.councilTaxAmount.usedAsFinancialInput, false);
});

test('area context is not used as property operating cost', () => {
  const facts = listingFacts();
  facts.facts.serviceCharge = {
    available: true,
    value: 9999,
    trust: TRUST.areaContext,
    scope: 'area',
    originalFrequency: 'annual',
    source: 'PropertyData',
  };
  const adapter = financialCostsFromPropertyFacts(facts);
  assert.ok(!Object.prototype.hasOwnProperty.call(adapter.inputs, 'serviceCharge'));
});

test('LLM cannot create financial inputs', () => {
  const explanation = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'propertyExplanationService.js'),
    'utf8'
  );
  const adapter = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'operatingCostEvidence.js'),
    'utf8'
  );
  const engine = fs.readFileSync(path.join(__dirname, '..', 'services', 'ai', 'financialEngine.js'), 'utf8');
  assert.ok(/must NOT invent/.test(explanation));
  assert.ok(/operating costs, NOI, net yield, cash flow, DSCR/.test(explanation));
  assert.ok(!/callOpenAI/.test(adapter));
  assert.ok(!/callOpenAI/.test(engine));
  assert.ok(!/Number\(input.serviceCharge\) \|\| 0/.test(engine));
  assert.ok(/assessFinanceMetrics/.test(engine));
});

test('complete cost set still uses existing financialEngine arithmetic', () => {
  const facts = listingFacts({ service_charges: 100, ground_rent: 250 });
  const prepared = prepareEvidencedInvestment({
    purchasePrice: 200000,
    expectedRent: 1000,
    propertyFacts: facts,
    options: {
      maintenance: 1200,
      insurance: 600,
      managementFee: 0,
      taxes: 0,
      vacancyAssumption: 0,
    },
  });
  const metrics = calculateInvestmentMetrics(prepared.input, prepared.provenanceHints);
  const presented = presentEvidencedInvestment(metrics, prepared.operatingCostEvidence);
  assert.strictEqual(prepared.input.serviceCharge, 1200);
  assert.strictEqual(prepared.input.groundRent, 250);
  assert.strictEqual(presented.costEvidence.completeness, 'COMPLETE_EVIDENCE');
  assert.strictEqual(presented.noi.available, true);
  assert.strictEqual(metrics.noi, 12000 - 1200 - 600 - 0 - 1200 - 250 - 0);
  assert.strictEqual(presented.grossYield.value, 6);
  assert.ok(presented.netYield.value !== presented.grossYield.value);
});

asyncTest('canonical report exposes operating-cost evidence without a second engine', async () => {
  const report = await assemblePropertyIntelligenceReport({
    property: {
      id: 1,
      title: 'Costs',
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
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      asOf: '2026-08-25T12:00:00.000Z',
      deps: {
        analyseRent: async () => ({ success: false, comparables: [] }),
        calculatePropertyValuation: async () => ({ success: false }),
        generatePropertyExplanation: async () => {
          throw new Error('LLM must not invent operating costs');
        },
      },
    },
  });
  assert.strictEqual(report.analysisMode, 'canonical');
  assert.strictEqual(report.propertyFacts.facts.serviceCharge.value, 100);
  assert.strictEqual(report.investment.operatingCostEvidence.completeness, 'PARTIAL_EVIDENCE');
  assert.strictEqual(report.investment.presented.noi.state, 'notAssessed');
  assert.strictEqual(report.investment.presented.grossYield.value, 6);
  assert.strictEqual(report.investment.operatingCostEvidence.councilTax.treatedAsLandlordOperatingCost, false);
});

test('valuation rent demand confidence personal-decision lifecycle outcomes backtesting and property facts remain unchanged', () => {
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
    intelligence: {
      confidence: { level: 'High', assessed: true },
      rentIntel: {
        success: true,
        currentRent: 1800,
        recommendedRent: 1900,
        marketRange: { low: 1700, high: 2100 },
        comparables: [],
      },
      risks: [],
    },
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
  assert.strictEqual(FACTOR_WEIGHTS.dataCompleteness, 0.06);
  const blend = weightedBlend([
    {
      centralEstimate: 500000,
      lowerEstimate: 480000,
      upperEstimate: 520000,
      method: 'valuation_sale_avm',
    },
  ]);
  assert.strictEqual(blend.central, 500000);
  const demand = parseDemandResponse({ demand_rating: 3 });
  const demandRent = parseDemandRentResponse({ rental_demand_rating: 4 });
  assert.ok(demand);
  assert.ok(demandRent);
  assert.deepStrictEqual([...OUTCOME_TYPES].sort(), ['let', 'sold', 'under_offer', 'withdrawn']);
  assert.strictEqual(BACKTEST_ENGINE_VERSION, 'backtest-foundation-1.0.0');
  const facts = listingFacts({ ground_rent: 250, service_charges: 1200 });
  assert.strictEqual(facts.version, 'property-facts-1.1.0');
  assert.strictEqual(facts.facts.serviceCharge.value, 1200);
  assert.strictEqual(facts.scoringActivated, false);
  assert.strictEqual(DEPENDENCY_MODEL.serviceCharge.productionScoringActivated, false);
  assert.strictEqual(DEPENDENCY_MODEL.groundRent.productionScoringActivated, false);
  const inputOnlyPriceRent = buildEvidencedInvestmentInput({
    purchasePrice: 200000,
    expectedRent: 1000,
  });
  assert.deepStrictEqual(inputOnlyPriceRent, { purchasePrice: 200000, expectedRent: 1000 });
});

async function run() {
  for (const t of pending) {
    await t.fn();
    console.log(`✓ ${t.name}`);
  }
  console.log('\noperatingCostEvidence.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
