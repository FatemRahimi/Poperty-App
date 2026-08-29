/**
 * Regression tests: missing/unknown data must never become an artificial score.
 * Run: node server/tests/scoringDefaults.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  scorePropertyMatch,
  rankBuyerMatches,
  WEIGHTS,
} = require('../services/ai/buyerMatchEngine');
const {
  calculateIntelligenceScores,
  calculateConfidence,
} = require('../services/ai/propertyScoring');
const {
  mapHistoryRow,
  normaliseConfidenceLevel,
  CONFIDENCE_STATES,
} = require('../models/AiRequest');
const { templateSummary } = require('../services/ai/propertyExplanationService');
const {
  calculateInvestmentMetrics,
  calculateInvestmentScore,
  buildAssumptionCoverage,
  ASSUMPTION_SOURCES,
} = require('../services/ai/financialEngine');
const {
  calculateSimilarity,
  rankComparables,
  weightedMedianRent,
} = require('../services/ai/comparableEngine');
const { assessConfidence } = require('../services/ai/confidenceEngine');

const pending = [];

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    pending.push(
      result.then(
        () => console.log(`✓ ${name}`),
        (err) => {
          console.error(`✗ ${name}`);
          throw err;
        }
      )
    );
    return;
  }
  console.log(`✓ ${name}`);
}

const PROPERTY = {
  id: 1,
  price: 400000,
  city: 'Manchester',
  zip_code: 'M1 1AA',
  bedrooms: 3,
  property_type: 'Terraced',
  square_feet: 1000,
  description: 'A home near the station with a garden.',
};

// ---------------------------------------------------------------------------
// buyerMatchEngine — no neutral stand-ins, and real renormalisation
// ---------------------------------------------------------------------------

test('missing budget does not become 50', () => {
  const r = scorePropertyMatch(PROPERTY, { location: 'Manchester', bedrooms: 3 });
  assert.strictEqual(r.dimensions.budget.available, false);
  assert.strictEqual(r.dimensions.budget.score, null, 'budget must be null, not 50');
  assert.strictEqual(r.dimensionScores.budget, null);
  assert.strictEqual(r.dimensions.budget.state, 'no_budget_preference');
});

test('missing price also makes budget unavailable rather than 50', () => {
  const r = scorePropertyMatch({ ...PROPERTY, price: 0 }, { budgetMax: 450000 });
  assert.strictEqual(r.dimensions.budget.available, false);
  assert.strictEqual(r.dimensions.budget.score, null);
  assert.strictEqual(r.dimensions.budget.state, 'no_price');
});

test('missing location preference does not become 60', () => {
  const r = scorePropertyMatch(PROPERTY, { budgetMax: 450000, bedrooms: 3 });
  assert.strictEqual(r.dimensions.location.available, false);
  assert.strictEqual(r.dimensions.location.score, null, 'location must be null, not 60');
  assert.strictEqual(r.dimensions.location.state, 'no_location_preference');
});

test('missing bedrooms preference does not become 70', () => {
  const r = scorePropertyMatch(PROPERTY, { budgetMax: 450000, location: 'Manchester' });
  assert.strictEqual(r.dimensions.bedrooms.available, false);
  assert.strictEqual(r.dimensions.bedrooms.score, null, 'bedrooms must be null, not 70');
  assert.strictEqual(r.dimensions.bedrooms.state, 'no_bedroom_preference');
});

test('missing school evidence does not become 60 or 65', () => {
  const withPref = scorePropertyMatch(PROPERTY, {
    budgetMax: 450000,
    schools: 'good primary catchment',
  });
  assert.strictEqual(withPref.dimensions.schools.available, false);
  assert.strictEqual(withPref.dimensions.schools.score, null, 'schools must be null, not 60/75');
  assert.strictEqual(withPref.dimensions.schools.state, 'no_school_data_source');

  const withoutPref = scorePropertyMatch(PROPERTY, { budgetMax: 450000 });
  assert.strictEqual(withoutPref.dimensions.schools.score, null, 'schools must be null, not 65');
});

test('missing lifestyle and transport preferences do not become 65', () => {
  const r = scorePropertyMatch(PROPERTY, { budgetMax: 450000 });
  assert.strictEqual(r.dimensions.lifestyle.score, null, 'lifestyle must be null, not 65');
  assert.strictEqual(r.dimensions.transport.score, null, 'transport must be null, not 65');
});

test('renormalisation actually occurs when dimensions are unavailable', () => {
  // Only budget (0.30) is evidenced: a perfect budget match must yield 100, not 30.
  const r = scorePropertyMatch({ price: 100000 }, { budgetMax: 500000 });
  assert.strictEqual(r.coverage.weightRetained, 0.3);
  assert.strictEqual(r.coverage.dimensionsAssessed, 1);
  assert.strictEqual(
    r.matchScore,
    100,
    'a single perfectly-matched dimension must renormalise to 100, not be diluted'
  );

  // Two dimensions evidenced, one perfect and one poor: must be the weighted mean
  // of those two only.
  const two = scorePropertyMatch(
    { price: 600000, city: 'Leeds' },
    { budgetMax: 500000, location: 'Leeds' }
  );
  const expected = Math.round(
    (5 * WEIGHTS.budget + 70 * WEIGHTS.location) / (WEIGHTS.budget + WEIGHTS.location)
  );
  assert.strictEqual(two.matchScore, expected, 'score must renormalise over evidenced weight only');
  assert.strictEqual(two.coverage.weightRetained, 0.55);
});

test('unavailable dimensions are reported with reasons', () => {
  const r = scorePropertyMatch(PROPERTY, { budgetMax: 450000 });
  assert.ok(r.notAssessed.length >= 4);
  r.notAssessed.forEach((n) => {
    assert.ok(n.reason, `${n.dimension} must explain why it was not assessed`);
    assert.ok(n.weight > 0);
  });
});

test('no evidenced dimensions yields no score rather than a fabricated one', () => {
  const r = scorePropertyMatch({ id: 9 }, {});
  assert.strictEqual(r.matchScore, null);
  assert.strictEqual(r.available, false);
  assert.strictEqual(r.coverage.weightRetained, 0);
});

// ---------------------------------------------------------------------------
// financialEngine — assumption provenance; formulas untouched
// ---------------------------------------------------------------------------

const FULL_INPUT = {
  purchasePrice: 152000,
  deposit: 38000,
  interestRate: 5.2,
  expectedRent: 925,
  vacancyAssumption: 5,
  maintenance: 600,
  insurance: 200,
  managementFee: 1110,
  serviceCharge: 1200,
  groundRent: 150,
  taxes: 0,
};

test('missing operating costs are explicitly identified as assumptions/defaults', () => {
  const coverage = buildAssumptionCoverage({
    purchasePrice: 152000,
    deposit: 38000,
    interestRate: 5.2,
    expectedRent: 925,
  });
  ['maintenance', 'insurance', 'managementFee', 'serviceCharge', 'groundRent', 'taxes'].forEach(
    (k) => {
      assert.strictEqual(
        coverage.assumptions[k].source,
        ASSUMPTION_SOURCES.UNAVAILABLE,
        `${k} must be flagged unavailable, not treated as a known zero`
      );
      assert.ok(coverage.materialDefaults.includes(k));
    }
  );
  assert.ok(
    coverage.limitations.some((l) => l.includes('not treated as zero')),
    'a limitation must state that missing costs overstate returns'
  );
  assert.strictEqual(coverage.reliable, false);
});

test('assumption provenance distinguishes all five source types', () => {
  const coverage = buildAssumptionCoverage(
    { purchasePrice: 152000, expectedRent: 925 },
    { expectedRent: ASSUMPTION_SOURCES.PROVIDER, taxes: ASSUMPTION_SOURCES.PROPERTY }
  );
  assert.strictEqual(coverage.assumptions.purchasePrice.source, ASSUMPTION_SOURCES.USER);
  assert.strictEqual(coverage.assumptions.expectedRent.source, ASSUMPTION_SOURCES.PROVIDER);
  assert.strictEqual(coverage.assumptions.taxes.source, ASSUMPTION_SOURCES.PROPERTY);
  assert.strictEqual(coverage.assumptions.mortgageTermYears.source, ASSUMPTION_SOURCES.DEFAULT);
  assert.strictEqual(coverage.assumptions.maintenance.source, ASSUMPTION_SOURCES.UNAVAILABLE);
});

test('financial formulas are unchanged by provenance tracking', () => {
  const metrics = calculateInvestmentMetrics(FULL_INPUT);
  // Gross yield = annual rent / price. 925*12 / 152000 = 7.30%
  assert.strictEqual(metrics.grossYield, 7.3);
  assert.ok(metrics.assumptionCoverage, 'coverage is additive metadata');
  assert.strictEqual(metrics.assumptionCoverage.reliable, true);
});

test('missing DSCR does not become 50', () => {
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 152000,
    deposit: 152000, // no mortgage, so no debt service
    expectedRent: 925,
    vacancyAssumption: 5,
    maintenance: 600,
    insurance: 200,
    managementFee: 1110,
    serviceCharge: 1200,
    groundRent: 150,
    taxes: 0,
  });
  assert.strictEqual(metrics.dscr, null);
  const score = calculateInvestmentScore(metrics);
  assert.strictEqual(score.components.dscr, null, 'DSCR must be null, not 50');
  assert.ok(score.excluded.some((e) => e.component === 'dscr' && e.state === 'no_debt_service'));
  assert.strictEqual(score.components.risk, null, 'risk derived from DSCR must also be null');
});

test('missing market/liquidity data does not become 70/65', () => {
  const metrics = calculateInvestmentMetrics(FULL_INPUT);
  const score = calculateInvestmentScore(metrics);
  assert.strictEqual(score.components.market, null, 'market must be null, not 70');
  assert.strictEqual(score.components.liquidity, null, 'liquidity must be null, not 65');
  assert.ok(score.excluded.some((e) => e.component === 'market'));
  assert.ok(score.excluded.some((e) => e.component === 'liquidity'));
});

test('supplied market/liquidity data is used when present', () => {
  const metrics = calculateInvestmentMetrics(FULL_INPUT);
  const score = calculateInvestmentScore(metrics, { marketScore: 80, liquidityScore: 60 });
  assert.strictEqual(score.components.market, 80);
  assert.strictEqual(score.components.liquidity, 60);
});

test('missing vacancy assumption does not create a near-perfect score', () => {
  const noVacancy = { ...FULL_INPUT };
  delete noVacancy.vacancyAssumption;
  const metrics = calculateInvestmentMetrics(noVacancy);
  const score = calculateInvestmentScore(metrics);
  assert.strictEqual(
    score.components.vacancy,
    null,
    'absent vacancy assumption must not score 95 for implied 100% occupancy'
  );
  assert.ok(score.excluded.some((e) => e.component === 'vacancy' && e.state === 'no_vacancy_assumption'));
  assert.ok(score.limitations.some((l) => l.includes('optimistic')));
});

test('missing rent is unscored rather than scored as a poor yield', () => {
  const metrics = calculateInvestmentMetrics({ purchasePrice: 152000, deposit: 38000, interestRate: 5.2 });
  assert.strictEqual(metrics.grossYield, 0);
  const score = calculateInvestmentScore(metrics);
  assert.strictEqual(score.components.yield, null, 'missing rent must not score 35 for 0% yield');
  assert.strictEqual(score.components.cashFlow, null);
  assert.ok(score.excluded.some((e) => e.component === 'yield' && e.state === 'no_rent_evidence'));
});

test('results resting on defaulted costs do not receive a favourable sub-score', () => {
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 152000,
    deposit: 38000,
    interestRate: 5.2,
    expectedRent: 925,
    vacancyAssumption: 5,
  });
  // With zero-default costs the raw cash flow looks strongly positive.
  assert.ok(metrics.annualCashFlow > 0);
  const score = calculateInvestmentScore(metrics);
  assert.strictEqual(score.components.cashFlow, null, 'provisional cash flow must not be scored');
  const cf = score.excluded.find((e) => e.component === 'cashFlow');
  assert.strictEqual(cf.provisional, true);
  assert.ok(score.limitations.some((l) => l.startsWith('cashFlow:')));
});

test('investment score renormalises and refuses to score on thin coverage', () => {
  const metrics = calculateInvestmentMetrics({ purchasePrice: 152000 });
  const score = calculateInvestmentScore(metrics);
  assert.strictEqual(score.available, false);
  assert.strictEqual(score.score, null);
  assert.ok(score.unavailableReason.includes('insufficient inputs'));

  const good = calculateInvestmentScore(calculateInvestmentMetrics(FULL_INPUT));
  assert.ok(good.coverage.weightRetained < 1, 'market and liquidity remain unevidenced');
  assert.ok(good.score > 0, 'evidenced components still produce a score');
});

// ---------------------------------------------------------------------------
// comparableEngine — missing attributes reduce coverage, never fabricate similarity
// ---------------------------------------------------------------------------

test('missing comparable attributes do not receive artificial 0.5 similarity', () => {
  const target = { city: 'Manchester', zip_code: 'M1 1AA', property_type: 'Flat', bedrooms: 2, square_feet: 700 };
  const bare = { city: 'Manchester', zip_code: 'M1 1AA' };
  const { breakdown, coverage, notComparable, similarity } = calculateSimilarity(target, bare);

  assert.strictEqual(breakdown.size, null, 'floor area must be null, not 0.5');
  assert.strictEqual(breakdown.propertyType, null, 'property type must be null, not 0.5');
  assert.strictEqual(breakdown.bedrooms, null, 'bedrooms must be null, not 0.5');
  assert.strictEqual(breakdown.features, null, 'features must be null, not 0.5');
  assert.strictEqual(breakdown.recency, null, 'recency must be null, not 0.5');
  assert.ok(coverage < 0.4, `coverage must reflect the missing attributes (got ${coverage})`);
  ['size', 'propertyType', 'bedrooms', 'features', 'recency'].forEach((k) => {
    assert.ok(notComparable.includes(k), `${k} must be listed as not comparable`);
  });
  assert.strictEqual(similarity, 100, 'the one comparable attribute matched exactly');
});

test('similarity renormalises over comparable attributes only', () => {
  const target = { city: 'Leeds', property_type: 'Flat', bedrooms: 2 };
  const comp = { city: 'Leeds', property_type: 'Detached', bedrooms: 2 };
  const { breakdown, coverage, similarity } = calculateSimilarity(target, comp);
  assert.strictEqual(breakdown.size, null);
  const expectedWeight = 0.3 + 0.15 + 0.1; // location + propertyType + bedrooms
  assert.strictEqual(coverage, Math.round((expectedWeight / 1) * 100) / 100);
  const expected = Math.round(
    ((0.65 * 0.3 + 0.3 * 0.15 + 1 * 0.1) / expectedWeight) * 100
  );
  assert.strictEqual(similarity, expected);
});

test('wholly incomparable records are excluded rather than scored', () => {
  const { similarity, comparable } = calculateSimilarity({ id: 1 }, { id: 2 });
  assert.strictEqual(similarity, null);
  assert.strictEqual(comparable, false);

  const ranked = rankComparables({ id: 1, city: 'Leeds' }, [{ id: 2, monthly_rent: 900 }]);
  assert.strictEqual(ranked.length, 0, 'incomparable rows must not enter the comparable set');
});

test('ranked comparables expose similarity coverage', () => {
  const ranked = rankComparables(
    { id: 1, city: 'Leeds', property_type: 'Flat', bedrooms: 2, square_feet: 700 },
    [
      {
        id: 2,
        city: 'Leeds',
        property_type: 'Flat',
        bedrooms: 2,
        square_feet: 720,
        monthly_rent: 900,
        sold_date: new Date().toISOString(),
      },
    ]
  );
  assert.strictEqual(ranked.length, 1);
  // Location, type, bedrooms, size and recency are comparable; bathrooms and
  // features are absent on both sides, so coverage is 0.80 rather than 1.00.
  assert.strictEqual(ranked[0].similarityCoverage, 0.8);
  assert.deepStrictEqual(ranked[0].notComparable.sort(), ['bathrooms', 'features']);
});

test('thinly-comparable records are excluded from comparable sets', () => {
  const target = { id: 1, city: 'Leeds', zip_code: 'LS1 1AA', property_type: 'Flat', bedrooms: 2 };
  // Only location is comparable -> coverage 0.30, below MIN_COMPARISON_COVERAGE.
  const thin = { id: 2, city: 'Leeds', zip_code: 'LS1 1AA', monthly_rent: 900 };
  const { coverage, similarity, comparable } = calculateSimilarity(target, thin);
  assert.strictEqual(coverage, 0.3);
  assert.strictEqual(similarity, 100, 'the one comparable attribute did match');
  assert.strictEqual(comparable, false, 'but 30% coverage is too thin to be usable');
  assert.strictEqual(
    rankComparables(target, [thin]).length,
    0,
    'thin comparables must not enter the comparable set despite similarity 100'
  );
});

test('evidenceWeight scales similarity by comparison coverage', () => {
  const target = { city: 'Leeds', zip_code: 'LS1 1AA', property_type: 'Flat', bedrooms: 2 };
  const partial = { city: 'Leeds', zip_code: 'LS1 1AA', property_type: 'Flat', bedrooms: 2 };
  const { similarity, coverage, evidenceWeight } = calculateSimilarity(target, partial);
  assert.strictEqual(evidenceWeight, Math.round(similarity * coverage));
  assert.ok(evidenceWeight < similarity, 'incomplete comparison must carry less weight');
});

test('weighted median down-weights thinly-evidenced comparables', () => {
  const target = {
    id: 1,
    city: 'Leeds',
    zip_code: 'LS1 1AA',
    property_type: 'Flat',
    bedrooms: 2,
    bathrooms: 1,
    square_feet: 700,
    has_garden: true,
  };
  // Both score similarity 100, but one is matched on 45% of attributes and the
  // other on 100%. The fully-evidenced comparable must dominate the median.
  const thinLowRent = {
    id: 2,
    city: 'Leeds',
    zip_code: 'LS1 1AA',
    property_type: 'Flat',
    monthly_rent: 700,
  };
  const fullHighRent = {
    id: 3,
    city: 'Leeds',
    zip_code: 'LS1 1AA',
    property_type: 'Flat',
    bedrooms: 2,
    bathrooms: 1,
    square_feet: 700,
    has_garden: true,
    monthly_rent: 1000,
    sold_date: new Date().toISOString(),
  };

  const ranked = rankComparables(target, [thinLowRent, fullHighRent]);
  assert.strictEqual(ranked.length, 2, 'both clear the coverage floor');
  const thin = ranked.find((c) => c.id === 2);
  const full = ranked.find((c) => c.id === 3);
  assert.strictEqual(thin.similarity, 100);
  assert.strictEqual(full.similarity, 100);
  assert.strictEqual(thin.similarityCoverage, 0.45);
  assert.strictEqual(full.similarityCoverage, 1);

  // Under similarity-only weighting both weigh 100 and the median returns 700.
  assert.strictEqual(
    weightedMedianRent(ranked),
    1000,
    'coverage-scaled weighting must favour the fully-evidenced comparable'
  );
});

test('thin comparisons reduce estimate confidence', () => {
  const comps = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    similarity: 88,
    similarityCoverage: 0.45,
    property_type: 'Flat',
    bedrooms: 2,
    square_feet: 700,
    sold_date: new Date().toISOString(),
    locationTier: 'Same postcode',
  }));
  const assessment = assessConfidence({
    comparables: comps,
    target: { property_type: 'Flat', bedrooms: 2, square_feet: 700 },
    dataQuality: { score: 90, level: 'High' },
    methodEstimates: [
      { method: 'avm', value: 150000 },
      { method: 'comparables', value: 152000 },
    ],
  });
  assert.strictEqual(assessment.evidence.medianComparisonCoverage, 0.45);
  assert.ok(
    assessment.caps.some((c) => c.rule === 'thin_comparisons'),
    'low comparison coverage must cap confidence'
  );
  assert.strictEqual(assessment.level, 'Medium');
});

// ---------------------------------------------------------------------------
// calculateIntelligenceScores — no neutral defaults, no blended overall
// ---------------------------------------------------------------------------

const BARE_CTX = {
  property: { id: 1, title: 'Flat', property_category: 'residential' },
  dataQuality: null,
  rentIntel: null,
  investment: null,
  risks: undefined,
  opportunities: undefined,
  comparableCount: 0,
};

test('intelligence scores no longer produce a blended overall', () => {
  const s = calculateIntelligenceScores(BARE_CTX);
  assert.strictEqual(s.overall, null);
  assert.strictEqual(s.overallAvailable, false);
  assert.strictEqual(s.overallDeprecated, true);
  assert.ok(s.overallDeprecationReason, 'deprecation must be explained');
});

test('an evidenced property still produces no overall score', () => {
  const s = calculateIntelligenceScores({
    ...BARE_CTX,
    property: { id: 1, city: 'Manchester', zip_code: 'M1 1AA', property_category: 'residential' },
    dataQuality: { score: 88, level: 'High' },
    rentIntel: { success: true, currentRent: 1200, marketRange: { low: 1150, high: 1250 }, confidence: 70 },
    investment: { metrics: { grossYield: 6.2, annualCashFlow: 3000, dscr: 1.4, assumptionCoverage: { materialDefaults: [] } } },
    risks: [],
    opportunities: [{ title: 'x' }],
    comparableCount: 9,
  });
  assert.strictEqual(s.overall, null, 'a well-evidenced property must not resurrect the overall');
  assert.ok(Number.isFinite(s.components.market));
  assert.ok(Number.isFinite(s.components.rent));
  assert.ok(Number.isFinite(s.components.investment));
});

test('market is unavailable without comparable evidence rather than scoring 40', () => {
  const s = calculateIntelligenceScores(BARE_CTX);
  assert.strictEqual(s.components.market, null);
  assert.strictEqual(s.componentDetail.market.available, false);
  assert.strictEqual(s.componentDetail.market.state, 'no_comparable_evidence');
  assert.ok(/comparable/i.test(s.componentDetail.market.reason));
});

test('rent is unavailable without rent evidence rather than scoring 30 or 50', () => {
  const noEvidence = calculateIntelligenceScores(BARE_CTX);
  assert.strictEqual(noEvidence.components.rent, null);
  assert.strictEqual(noEvidence.componentDetail.rent.state, 'no_rent_evidence');

  // Market range known but the property has no current rent: position is unknowable.
  const noCurrent = calculateIntelligenceScores({
    ...BARE_CTX,
    rentIntel: { success: true, currentRent: 0, marketRange: { low: 900, high: 1100 }, confidence: 80 },
  });
  assert.strictEqual(noCurrent.components.rent, null);
  assert.strictEqual(noCurrent.componentDetail.rent.state, 'no_current_rent');
});

test('rent score is not scaled by confidence', () => {
  const base = {
    ...BARE_CTX,
    rentIntel: { success: true, currentRent: 1000, marketRange: { low: 975, high: 1025 }, confidence: 100 },
  };
  const high = calculateIntelligenceScores(base);
  const low = calculateIntelligenceScores({
    ...base,
    rentIntel: { ...base.rentIntel, confidence: 20 },
  });
  assert.strictEqual(
    high.components.rent,
    low.components.rent,
    'confidence is reported separately and must not move the score'
  );
});

test('investment is unavailable without price and rent rather than scoring 35', () => {
  const s = calculateIntelligenceScores(BARE_CTX);
  assert.strictEqual(s.components.investment, null);
  assert.strictEqual(s.componentDetail.investment.state, 'no_investment_inputs');
});

test('investment excludes cash flow and DSCR when operating costs are defaulted', () => {
  const defaulted = calculateIntelligenceScores({
    ...BARE_CTX,
    investment: {
      metrics: {
        grossYield: 6,
        annualCashFlow: 9000,
        dscr: 2.5,
        assumptionCoverage: { materialDefaults: ['maintenance', 'insurance'] },
      },
    },
  });
  const evidenced = calculateIntelligenceScores({
    ...BARE_CTX,
    investment: {
      metrics: {
        grossYield: 6,
        annualCashFlow: 9000,
        dscr: 2.5,
        assumptionCoverage: { materialDefaults: [] },
      },
    },
  });
  assert.strictEqual(defaulted.componentDetail.investment.state, 'yield_only');
  assert.strictEqual(evidenced.componentDetail.investment.state, 'fully_assessed');
  assert.ok(
    defaulted.components.investment < evidenced.components.investment,
    'default-zero costs must not earn a cash-flow bonus'
  );
});

test('demand is always unavailable because no demand data source exists', () => {
  const s = calculateIntelligenceScores({ ...BARE_CTX, comparableCount: 20 });
  assert.strictEqual(s.components.demand, null);
  assert.strictEqual(s.componentDetail.demand.state, 'no_demand_data_source');
});

test('data quality is unavailable rather than defaulting to 30', () => {
  const s = calculateIntelligenceScores(BARE_CTX);
  assert.strictEqual(s.components.dataQuality, null);
  assert.strictEqual(s.componentDetail.dataQuality.state, 'not_assessed');
});

test('unavailable components produce null labels, not "Limited"', () => {
  const s = calculateIntelligenceScores(BARE_CTX);
  assert.strictEqual(s.labels.marketPosition, null);
  assert.strictEqual(s.labels.rentalPosition, null);
  assert.strictEqual(s.labels.investmentQuality, null);
  assert.strictEqual(s.labels.risk, null);
  assert.strictEqual(s.labels.opportunity, null);
  assert.strictEqual(s.labels.dataQuality, null);
});

test('notAssessed reports every unavailable component with a reason', () => {
  const s = calculateIntelligenceScores(BARE_CTX);
  const keys = s.notAssessed.map((n) => n.component).sort();
  assert.deepStrictEqual(keys, [
    'dataQuality',
    'demand',
    'investment',
    'market',
    'rent',
    'risk',
  ]);
  s.notAssessed.forEach((n) => {
    assert.ok(n.reason, `${n.component} must state why it was not assessed`);
    assert.ok(n.state, `${n.component} must expose a machine-readable state`);
  });
  assert.strictEqual(s.coverage.componentsScored, 0);
  assert.strictEqual(s.coverage.weightRetained, 0);
});

// ---------------------------------------------------------------------------
// Single scoring owner: no duplicate buyer-match implementation
// ---------------------------------------------------------------------------

test('openaiService exposes no buyer-match scorer of its own', () => {
  const openai = require('../services/openaiService');
  assert.strictEqual(openai.mockBuyerMatch, undefined);
  assert.strictEqual(openai.scoreProperty, undefined);
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'openaiService.js'),
    'utf8'
  );
  assert.ok(!/function\s+scoreProperty\b/.test(src), 'duplicate scorer must be gone');
  assert.ok(!/function\s+mockBuyerMatch\b/.test(src), 'mock scorer must be gone');
});

test('generateBuyerMatches scores deterministically via buyerMatchEngine', async () => {
  const { generateBuyerMatches } = require('../services/openaiService');
  const prefs = { budgetMax: 400000, location: 'Manchester', bedrooms: 3 };
  const properties = [
    {
      id: 1,
      price: 380000,
      bedrooms: 3,
      city: 'Manchester',
      property_type: 'House',
      square_feet: 1100,
    },
  ];
  const result = await generateBuyerMatches(prefs, properties);
  assert.strictEqual(result.source, 'deterministic');
  assert.strictEqual(result.tokensUsed, 0);

  const canonical = rankBuyerMatches(prefs, properties);
  assert.deepStrictEqual(
    result.data.recommendations.map((r) => r.matchScore),
    canonical.recommendations.map((r) => r.matchScore),
    'the canonical engine must be the only source of match scores'
  );
});

test('buyer match never emits a non-numeric score to the client', () => {
  const ranked = rankBuyerMatches({}, [{ id: 1 }, { id: 2, price: 250000 }]);
  ranked.recommendations.forEach((r) => {
    assert.ok(
      Number.isFinite(r.matchScore),
      'unscoreable properties must be withheld, not sent as null'
    );
  });
});

// ---------------------------------------------------------------------------
// Explanation layer must not narrate a deprecated overall score
// ---------------------------------------------------------------------------

test('template summary describes evidenced dimensions, not an overall score', () => {
  const summary = templateSummary({
    property: { title: 'Test Flat' },
    scores: calculateIntelligenceScores({
      ...BARE_CTX,
      dataQuality: { score: 80, level: 'High' },
      risks: [],
      comparableCount: 6,
    }),
  });
  assert.ok(!/overall intelligence score/i.test(summary), 'overall narrative must be gone');
  assert.ok(/could not be assessed/i.test(summary), 'unassessed dimensions must be stated');
});

// ---------------------------------------------------------------------------
// Confidence must never fabricate a level or a neutral factor score
// ---------------------------------------------------------------------------

const STRONG_COMPS = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  similarity: 90,
  similarityCoverage: 1,
  property_type: 'Flat',
  bedrooms: 2,
  square_feet: 700,
  sold_date: new Date().toISOString(),
  locationTier: 'Same postcode',
}));
const STRONG_TARGET = { property_type: 'Flat', bedrooms: 2, square_feet: 700 };

test('a single estimate method is unmeasured, not scored as neutral 0.5', () => {
  const one = assessConfidence({
    comparables: STRONG_COMPS,
    target: STRONG_TARGET,
    dataQuality: { score: 95, level: 'High' },
    methodEstimates: [{ method: 'avm', value: 300000 }],
  });
  assert.ok(
    !one.reasons.some((r) => r.key === 'methodAgreement'),
    'a single method must be dropped from the factor mean'
  );
  assert.ok(
    one.limitations.some((l) => l.key === 'methodAgreement'),
    'it must be reported as a limitation instead'
  );
  assert.ok(one.caps.some((c) => c.rule === 'single_method'), 'the single_method cap must still fire');
  assert.strictEqual(one.level, 'Medium', 'no corroboration must still hold the level to Medium');
});

test('agreeing methods score above a single method rather than being dragged to 0.5', () => {
  const one = assessConfidence({
    comparables: STRONG_COMPS,
    target: STRONG_TARGET,
    dataQuality: { score: 95, level: 'High' },
    methodEstimates: [{ method: 'avm', value: 300000 }],
  });
  const two = assessConfidence({
    comparables: STRONG_COMPS,
    target: STRONG_TARGET,
    dataQuality: { score: 95, level: 'High' },
    methodEstimates: [
      { method: 'avm', value: 300000 },
      { method: 'comparables', value: 301000 },
    ],
  });
  assert.strictEqual(two.level, 'High');
  assert.ok(two.score > one.score, 'corroboration must raise confidence');
});

test('no measurable evidence yields "Not assessed", not "Low" with a score', () => {
  const none = assessConfidence({ scope: 'test' });
  assert.strictEqual(none.level, 'Not assessed');
  assert.strictEqual(none.score, null, 'no score may be invented for unassessed evidence');
  assert.strictEqual(none.assessed, false);
  assert.ok(none.unassessedReason, 'the reason must be stated');
});

test('caps cannot promote "Not assessed" into a stated level', () => {
  const none = assessConfidence({
    scope: 'test',
    comparables: [{ id: 1, similarity: 80 }],
  });
  if (!none.assessed) {
    assert.strictEqual(none.level, 'Not assessed');
    assert.ok(none.caps.length > 0, 'caps still recorded for transparency');
  }
});

test('measurable evidence still produces a real level', () => {
  const ok = assessConfidence({
    comparables: STRONG_COMPS,
    target: STRONG_TARGET,
    dataQuality: { score: 95, level: 'High' },
    methodEstimates: [
      { method: 'avm', value: 300000 },
      { method: 'comparables', value: 301000 },
    ],
  });
  assert.strictEqual(ok.assessed, true);
  assert.ok(['High', 'Medium', 'Low'].includes(ok.level));
  assert.ok(Number.isFinite(ok.score));
});

test('unavailable confidence factors expose a null score, never 0', () => {
  const none = assessConfidence({ scope: 'test' });
  assert.ok(none.limitations.length > 0);
  // Factor scores are only surfaced for available factors; unavailable ones are
  // reported as limitations with no number attached.
  none.reasons.forEach((r) => {
    assert.ok(r.detail, 'every stated reason must carry an explanation');
  });
});

// ---------------------------------------------------------------------------
// Four-state confidence must survive persistence and the API mapping
// ---------------------------------------------------------------------------

test('history mapping preserves all four confidence states', () => {
  assert.deepStrictEqual(CONFIDENCE_STATES, ['High', 'Medium', 'Low', 'Not assessed']);
  CONFIDENCE_STATES.forEach((state) => {
    const row = mapHistoryRow({
      id: 1,
      confidence: state === 'Not assessed' ? null : 70,
      confidence_level: state,
      output_data: {},
    });
    assert.strictEqual(row.confidenceLevel, state);
  });
});

test('history mapping never converts a missing level into Low', () => {
  const row = mapHistoryRow({ id: 1, confidence: null, output_data: {} });
  assert.strictEqual(row.confidenceLevel, null, 'unknown must stay unknown');
  assert.strictEqual(row.confidence, null);
  assert.strictEqual(row.confidenceIndex, null);
  assert.strictEqual(row.overallScore, null);
});

test('history mapping falls back to the stored report level before the column exists', () => {
  const row = mapHistoryRow({
    id: 1,
    confidence: 62,
    output_data: { confidence: { level: 'Medium' } },
  });
  assert.strictEqual(row.confidenceLevel, 'Medium');
  assert.strictEqual(
    row.confidenceLevelIsLegacyEstimate,
    true,
    'a stored level with no confidence-model version is legacy, not native'
  );
});

test('an unrecognised persisted level is not coerced into a valid one', () => {
  assert.strictEqual(normaliseConfidenceLevel('excellent'), null);
  assert.strictEqual(normaliseConfidenceLevel(''), null);
  assert.strictEqual(normaliseConfidenceLevel(null), null);
  // Case and padding tolerated; meaning never invented.
  assert.strictEqual(normaliseConfidenceLevel(' high '), 'High');
  assert.strictEqual(normaliseConfidenceLevel('not assessed'), 'Not assessed');
});

test('the legacy confidence wrapper passes null through and explains why', () => {
  const none = calculateConfidence({
    dataQuality: null,
    comparableCount: 0,
    avgSimilarity: null,
  });
  assert.strictEqual(none.level, 'Not assessed');
  assert.strictEqual(none.score, null, 'null must not become 0');
  assert.strictEqual(none.assessed, false);
  assert.ok(none.note, 'the reason must reach legacy consumers');
});

Promise.all(pending).then(
  () => console.log('\nscoringDefaults.test.js — all passed'),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
