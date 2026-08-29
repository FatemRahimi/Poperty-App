/**
 * Landlord Personal Decision on the canonical Property Intelligence report.
 * Run: node server/tests/landlordPersonalDecisionReport.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { parseAnalyseFinanceRequest } = require('../services/ai/financeInputContract');
const {
  executeIntelligenceWhatIf,
} = require('../services/ai/intelligenceWhatIfService');
const {
  intelligenceFromCanonicalReport,
  scoreCanonicalLandlordDecision,
  scorePublicLandlordPersonalDecision,
} = require('../services/ai/personalDecisionCanonical');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const {
  BUYER_GENERAL_WEIGHTS,
  LANDLORD_WEIGHTS,
  WHAT_IF_VERSION,
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

const COMPLETE_COSTS = {
  maintenance: 1200,
  insurance: 600,
  managementFee: 0,
  taxes: 0,
  serviceCharge: 0,
  groundRent: 0,
  vacancyAssumption: 5,
};

const COMPLETE_FINANCE = {
  deposit: 50000,
  interestRate: 5,
  mortgageTermYears: 25,
};

function listing(overrides = {}) {
  return {
    id: 1,
    title: 'Landlord decision listing',
    city: 'Leeds',
    zip_code: 'LS1 1AA',
    category: 'sale',
    price: 200000,
    monthly_rent: 1000,
    service_charges: 100,
    ground_rent: 250,
    bedrooms: 2,
    property_type: 'Terraced',
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
      recommendedRent: 1050,
      currentRent: 1000,
      marketRange: { low: 950, high: 1150 },
      comparables: [{ id: 1, similarity: 0.8 }, { id: 2, similarity: 0.7 }, { id: 3, similarity: 0.6 }, { id: 4, similarity: 0.5 }, { id: 5, similarity: 0.5 }],
    }),
    calculatePropertyValuation: async () => ({
      success: true,
      centralEstimate: 195000,
      lowerEstimate: 180000,
      upperEstimate: 210000,
      evidenceCount: 6,
    }),
    generatePropertyExplanation: async () => ({ summary: 'template', source: 'template', tokensUsed: 0 }),
  };
}

async function analyse(body = {}, listingOverrides = {}) {
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

test('canonical PI report includes landlord Personal Decision from the existing scorer', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'propertyIntelligenceEngine.js'),
    'utf8'
  );
  assert.ok(src.includes('scorePublicLandlordPersonalDecision'));
  assert.ok(src.includes('personalDecision'));
  assert.ok(!src.includes('BUYER_GENERAL_WEIGHTS'));
});

asyncTest('report score equals What-if baseScore and dimensions for identical inputs', async () => {
  const body = {
    finance: {
      purchasePrice: 185000,
      expectedRent: 1100,
      operatingCosts: { ...COMPLETE_COSTS },
      ...COMPLETE_FINANCE,
    },
  };
  const { parsed, report } = await analyse(body);
  assert.strictEqual(parsed.ok, true);
  assert.ok(report.personalDecision);
  assert.strictEqual(report.personalDecision.profile, 'landlord');
  assert.strictEqual(report.personalDecision.scoreLabel, 'Landlord fit score');
  assert.strictEqual(report.personalDecision.notConfidence, true);
  assert.strictEqual(report.personalDecision.model.profile, 'landlord');
  assert.ok(report.personalDecision.model.version.startsWith('personal-decision-1.0.0'));

  const originalPrice = listing().price;
  const whatIf = executeIntelligenceWhatIf({
    property: listing(),
    profile: 'landlord',
    baselineOptions: parsed.options,
    scenarioOptions: {},
    intelligence: intelligenceFromCanonicalReport(report),
    asOf: ASOF,
  });
  assert.strictEqual(listing().price, originalPrice);
  assert.strictEqual(whatIf.listing.askingPrice, 200000);
  assert.strictEqual(report.personalDecision.score, whatIf.change.score.before);
  assert.strictEqual(report.personalDecision.outcome, whatIf.baseline.decision.outcome);

  Object.keys(report.personalDecision.dimensions).forEach((key) => {
    const reportDim = report.personalDecision.dimensions[key];
    const whatIfDim = whatIf.baseline.decision.dimensions[key];
    assert.strictEqual(reportDim.available, whatIfDim.available, `${key} availability`);
    assert.strictEqual(reportDim.score, whatIfDim.score, `${key} score`);
    assert.strictEqual(reportDim.state, whatIfDim.state, `${key} state`);
  });

  const direct = scoreCanonicalLandlordDecision({
    property: listing(),
    finance: parsed.options,
    intelligence: intelligenceFromCanonicalReport(report),
    asOf: ASOF,
  });
  assert.strictEqual(report.personalDecision.score, direct.score);
});

asyncTest('same finance snapshot is used; listing asking is not silently substituted', async () => {
  const { parsed, report } = await analyse({
    finance: {
      purchasePrice: 185000,
      expectedRent: 1100,
      operatingCosts: { ...COMPLETE_COSTS },
      ...COMPLETE_FINANCE,
    },
  });
  const atAsking = scorePersonalDecision({
    profile: 'landlord',
    property: listing(),
    finance: parsed.options,
    intelligence: intelligenceFromCanonicalReport(report),
    asOf: ASOF,
  });
  assert.notStrictEqual(report.personalDecision.score, atAsking.score);
  assert.strictEqual(report.property.price, 200000);
  assert.strictEqual(report.financeRequest.purchasePrice.listingAskingPrice, 200000);
  assert.strictEqual(report.financeRequest.purchasePrice.scenarioPurchasePrice, 185000);
});

asyncTest('missing finance and incomplete costs stay notAssessed; demand stays notAssessed', async () => {
  const sparse = await analyse({ finance: { purchasePrice: 185000, expectedRent: 1100 } });
  const pd = sparse.report.personalDecision;
  assert.strictEqual(pd.dimensions.demand.available, false);
  assert.ok(/no_demand_data_source|notAssessed/i.test(pd.dimensions.demand.state));
  assert.strictEqual(pd.dimensions.cashFlow.available, false);
  assert.strictEqual(pd.dimensions.dscr.available, false);
  assert.notStrictEqual(pd.score, 0);
  if (!pd.available) {
    assert.strictEqual(pd.score, null);
    assert.strictEqual(pd.state, 'notAssessed');
  }

  const withDemandRent = scorePublicLandlordPersonalDecision({
    property: listing(),
    finance: { expectedRent: 1100, purchasePrice: 185000, ...COMPLETE_COSTS, ...COMPLETE_FINANCE },
    intelligence: {
      areaRentalDemand: {
        available: true,
        band: 'high',
        source: 'PropertyData',
        providerEndpoint: '/demand-rent',
      },
      decisionContext: {
        rentalMarketDemand: {
          available: true,
          band: 'high',
          source: 'PropertyData',
          providerEndpoint: '/demand-rent',
        },
      },
    },
    asOf: ASOF,
  });
  assert.strictEqual(withDemandRent.dimensions.demand.available, false);
  assert.strictEqual(withDemandRent.dimensions.demand.state, 'no_demand_data_source');
});

asyncTest('confidence remains separate from landlord fit; property facts do not bonus the score', async () => {
  const { report } = await analyse({
    finance: {
      purchasePrice: 185000,
      expectedRent: 1100,
      operatingCosts: { ...COMPLETE_COSTS },
      ...COMPLETE_FINANCE,
    },
  });
  assert.ok(report.confidence);
  assert.notStrictEqual(report.personalDecision.score, report.confidence.score);
  assert.strictEqual(report.personalDecision.confidence.model, 'confidence-1.1.0');
  assert.ok(/separate/i.test(report.personalDecision.confidence.note || ''));

  const withFactsContext = scorePublicLandlordPersonalDecision({
    property: listing(),
    finance: parseAnalyseFinanceRequest({
      finance: {
        purchasePrice: 185000,
        expectedRent: 1100,
        operatingCosts: { ...COMPLETE_COSTS },
        ...COMPLETE_FINANCE,
      },
    }).options,
    intelligence: {
      ...intelligenceFromCanonicalReport(report),
      decisionContext: {
        available: true,
        propertyFacts: {
          completeness: 'COMPLETE',
          facts: {
            epc: { value: 'B' },
            councilTaxBand: { value: 'C' },
            yearBuilt: { value: 1998 },
          },
        },
      },
    },
    asOf: ASOF,
  });
  assert.strictEqual(withFactsContext.score, report.personalDecision.score);
  assert.strictEqual(
    withFactsContext.dimensions.demand.available,
    report.personalDecision.dimensions.demand.available
  );
});

test('regression freeze: weights, buyer_general, valuation, rent, demand, outcomes, backtesting, what-if version', () => {
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(LANDLORD_WEIGHTS.grossYield, 0.18);
  assert.strictEqual(LANDLORD_WEIGHTS.rentPosition, 0.2);
  assert.deepStrictEqual(Object.keys(LANDLORD_WEIGHTS).sort(), [
    'cashFlow',
    'demand',
    'dscr',
    'grossYield',
    'netOperating',
    'rentPosition',
    'risk',
    'vacancy',
  ]);
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
  assert.ok(!Object.prototype.hasOwnProperty.call(BUYER_GENERAL_WEIGHTS, 'demand'));
  assert.strictEqual(CONFIDENCE_MODEL.baseVersion, 'confidence-1.1.0');
  assert.strictEqual(WHAT_IF_VERSION, 'personal-decision-whatif-1.0.0');
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
  assert.ok(BACKTEST_ENGINE_VERSION);

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
      },
    },
    finance: { deposit: 50000, interestRate: 5, mortgageTermYears: 25 },
    asOf: ASOF,
  });
  assert.ok(Number.isFinite(buyer.score));
});

(async () => {
  for (const item of pending) {
    try {
      await item.fn();
      console.log(`✓ ${item.name}`);
    } catch (err) {
      console.error(`✗ ${item.name}`);
      throw err;
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
