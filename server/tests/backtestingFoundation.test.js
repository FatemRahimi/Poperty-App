/**
 * Property Intelligence backtesting foundation.
 * Synthetic fixtures are test mathematics only — not production evidence.
 * Run: node server/tests/backtestingFoundation.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  BACKTEST_ENGINE_VERSION,
  STATE,
  EXCLUSION,
  extractPredictionSnapshot,
  extractListingOutcomes,
  extractTransactionOutcome,
  pairSnapshotWithOutcome,
  valuationCaseMetrics,
  aggregateCases,
  runBacktest,
} = require('../services/ai/backtesting/backtestFoundation');
const { applyPropertyDataEvidence } = require('../services/providers/propertyData/propertyDataEvidence');
const { calculateInvestmentMetrics } = require('../services/ai/financialEngine');
const { CANONICAL_ENGINE_VERSION } = require('../services/ai/propertyIntelligenceEngine');
const { FACTOR_WEIGHTS, CONFIDENCE_MODEL } = require('../services/ai/confidenceEngine');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const {
  BUYER_GENERAL_WEIGHTS,
  LANDLORD_WEIGHTS,
} = require('../config/personalDecision.config');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`async not used for ${name}`);
  }
  console.log(`✓ ${name}`);
}

const SYNTHETIC = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'backtest-synthetic-snapshot.json'), 'utf8')
);

function snapshotRow(reportOverrides = {}, rowOverrides = {}) {
  return {
    id: 1,
    property_id: 10,
    created_at: '2025-01-15T12:00:00.000Z',
    synthetic: true,
    output_data: {
      ...SYNTHETIC,
      ...reportOverrides,
      property: { ...SYNTHETIC.property, ...(reportOverrides.property || {}) },
      identity: { ...SYNTHETIC.identity, ...(reportOverrides.identity || {}) },
      marketIntelligence: {
        ...SYNTHETIC.marketIntelligence,
        ...(reportOverrides.marketIntelligence || {}),
        sale: {
          ...SYNTHETIC.marketIntelligence.sale,
          ...(reportOverrides.marketIntelligence?.sale || {}),
        },
        rent: {
          ...SYNTHETIC.marketIntelligence.rent,
          ...(reportOverrides.marketIntelligence?.rent || {}),
        },
      },
      confidence: reportOverrides.confidence || SYNTHETIC.confidence,
    },
    ...rowOverrides,
  };
}

function saleOutcome(overrides = {}) {
  return {
    kind: 'sale',
    source: 'first_party_listing',
    matchBasis: 'listingId',
    listingId: 10,
    uprn: '1000123',
    value: 380000,
    observedAt: '2025-06-01T00:00:00.000Z',
    timestampSource: 'sold_at',
    provenance: { source: 'ApplicationDatabase', field: 'achieved_price' },
    ...overrides,
  };
}

function rentOutcome(overrides = {}) {
  return {
    kind: 'rent',
    source: 'first_party_listing',
    matchBasis: 'listingId',
    listingId: 10,
    uprn: '1000123',
    value: 1450,
    observedAt: '2025-06-01T00:00:00.000Z',
    timestampSource: 'let_at',
    provenance: { source: 'ApplicationDatabase', field: 'achieved_rent' },
    ...overrides,
  };
}

function buyerScore() {
  return scorePersonalDecision({
    profile: 'buyer_general',
    property: {
      id: 1,
      price: 380000,
      city: 'Manchester',
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
}

function landlordScore() {
  return scorePersonalDecision({
    profile: 'landlord',
    property: {
      id: 10,
      price: 200000,
      city: 'Leeds',
      zip_code: 'LS1 1AA',
      bedrooms: 2,
      property_type: 'Terraced',
      monthly_rent: 1200,
    },
    preferences: {},
    intelligence: {
      confidence: { level: 'High', assessed: true },
      rentIntel: {
        success: true,
        currentRent: 1200,
        recommendedRent: 1200,
        marketRange: { low: 1100, high: 1300 },
        comparables: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
      },
      risks: [],
    },
    finance: {
      expectedRent: 1200,
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
}

test('prediction before outcome is eligible', () => {
  const snapshot = extractPredictionSnapshot(snapshotRow());
  const paired = pairSnapshotWithOutcome(snapshot, saleOutcome());
  assert.strictEqual(paired.eligible, true);
  const result = runBacktest({
    snapshots: [snapshotRow()],
    outcomes: [saleOutcome()],
  });
  assert.strictEqual(result.valuation.state, STATE.available);
  assert.strictEqual(result.valuation.sampleSize, 1);
});

test('prediction after outcome is rejected', () => {
  const paired = pairSnapshotWithOutcome(
    extractPredictionSnapshot(snapshotRow()),
    saleOutcome({ observedAt: '2024-01-01T00:00:00.000Z' })
  );
  assert.strictEqual(paired.eligible, false);
  assert.strictEqual(paired.reason, EXCLUSION.prediction_not_before_outcome);
});

test('later evidence cannot leak into earlier snapshot', () => {
  const leaked = extractPredictionSnapshot(
    snapshotRow({
      marketIntelligence: {
        sale: {
          lastSold: { price: 500000, date: '2025-12-01T00:00:00.000Z' },
        },
      },
    })
  );
  const paired = pairSnapshotWithOutcome(leaked, saleOutcome({ observedAt: '2026-01-01T00:00:00.000Z' }));
  assert.strictEqual(paired.eligible, false);
  assert.strictEqual(paired.reason, EXCLUSION.later_evidence_leakage);
});

test('asking price is never achieved price', () => {
  const fromListing = extractListingOutcomes({
    id: 10,
    price: 400000,
    monthly_rent: 1500,
    updated_at: '2025-06-01T00:00:00.000Z',
    created_at: '2024-01-01T00:00:00.000Z',
    status: 'sold',
  });
  assert.strictEqual(fromListing.length, 0);
  const paired = pairSnapshotWithOutcome(
    extractPredictionSnapshot(snapshotRow()),
    saleOutcome({ value: 400000, timestampSource: 'asking', source: 'asking' })
  );
  assert.strictEqual(paired.eligible, false);
  assert.strictEqual(paired.reason, EXCLUSION.asking_used_as_achieved_price);
});

test('asking rent is never achieved rent', () => {
  const fromListing = extractListingOutcomes({
    id: 10,
    monthly_rent: 1500,
    price: 400000,
    updated_at: '2025-06-01T00:00:00.000Z',
  });
  assert.strictEqual(fromListing.length, 0);
  const paired = pairSnapshotWithOutcome(
    extractPredictionSnapshot(snapshotRow()),
    rentOutcome({ value: 1500, timestampSource: 'asking' })
  );
  assert.strictEqual(paired.eligible, false);
  assert.strictEqual(paired.reason, EXCLUSION.asking_used_as_achieved_rent);
});

test('updated_at is never sold_at or let_at', () => {
  const stamp = '2025-06-01T00:00:00.000Z';
  const fromListing = extractListingOutcomes({
    id: 10,
    achieved_price: 380000,
    achieved_rent: 1450,
    updated_at: stamp,
    created_at: stamp,
  });
  assert.strictEqual(fromListing.length, 0);
  assert.strictEqual(
    pairSnapshotWithOutcome(
      extractPredictionSnapshot(snapshotRow()),
      saleOutcome({ timestampSource: 'updated_at' })
    ).reason,
    EXCLUSION.updated_at_used_as_outcome_time
  );
  assert.strictEqual(
    pairSnapshotWithOutcome(
      extractPredictionSnapshot(snapshotRow()),
      rentOutcome({ timestampSource: 'created_at' })
    ).reason,
    EXCLUSION.created_at_used_as_outcome_time
  );
});

test('ambiguous identity is excluded', () => {
  const snapshot = extractPredictionSnapshot(snapshotRow());
  const paired = pairSnapshotWithOutcome(
    snapshot,
    saleOutcome({ listingId: 99, uprn: '999', matchBasis: 'listingId' })
  );
  assert.strictEqual(paired.reason, EXCLUSION.ambiguous_identity);
  const noUprn = pairSnapshotWithOutcome(
    snapshot,
    {
      ...saleOutcome(),
      matchBasis: 'uprn',
      listingId: null,
      uprn: null,
    }
  );
  assert.strictEqual(noUprn.reason, EXCLUSION.ambiguous_identity);
});

test('exact UPRN outcome match is accepted', () => {
  const tx = extractTransactionOutcome({
    uprn: '1000123',
    price: 375000,
    date: '2025-07-01T00:00:00.000Z',
    source: 'hmlr_via_propertydata',
  });
  const paired = pairSnapshotWithOutcome(extractPredictionSnapshot(snapshotRow()), tx);
  assert.strictEqual(paired.eligible, true);
  assert.strictEqual(paired.outcome.matchBasis, 'uprn');
});

test('missing outcome is notBacktestable', () => {
  const result = runBacktest({ snapshots: [snapshotRow()], outcomes: [] });
  assert.strictEqual(result.valuation.state, STATE.insufficientData);
  assert.strictEqual(result.valuation.sampleSize, 0);
  assert.strictEqual(result.valuation.mae, null);
  assert.ok(result.eligibility.exclusionReasons[EXCLUSION.missing_outcome]);
});

test('missing historical snapshot is notBacktestable', () => {
  const paired = pairSnapshotWithOutcome(
    extractPredictionSnapshot({ output_data: {} }),
    saleOutcome()
  );
  assert.strictEqual(paired.reason, EXCLUSION.missing_historical_snapshot);
  const result = runBacktest({
    snapshots: [{ output_data: null, created_at: '2025-01-01T00:00:00.000Z' }],
    outcomes: [saleOutcome()],
  });
  assert.ok(result.eligibility.exclusionReasons[EXCLUSION.missing_historical_snapshot]);
});

test('missing valuation bounds remain unavailable', () => {
  const snapshot = extractPredictionSnapshot(
    snapshotRow({
      marketIntelligence: {
        sale: {
          lowerEstimate: null,
          upperEstimate: null,
          boundsAvailable: false,
        },
      },
    })
  );
  assert.strictEqual(snapshot.sale.boundsAvailable, false);
  const metrics = valuationCaseMetrics(snapshot, saleOutcome());
  assert.strictEqual(metrics.withinBounds, null);
  const result = runBacktest({
    snapshots: [
      snapshotRow({
        marketIntelligence: {
          sale: { lowerEstimate: null, upperEstimate: null, boundsAvailable: false },
        },
      }),
    ],
    outcomes: [saleOutcome()],
  });
  assert.strictEqual(result.valuation.boundsCoverage, null);
});

test('central, percentage and signed valuation errors calculate correctly', () => {
  const snapshot = extractPredictionSnapshot(snapshotRow());
  const metrics = valuationCaseMetrics(snapshot, saleOutcome({ value: 380000 }));
  assert.strictEqual(metrics.predicted, 390000);
  assert.strictEqual(metrics.achieved, 380000);
  assert.strictEqual(metrics.absoluteError, 10000);
  assert.strictEqual(metrics.percentageError, 10000 / 380000);
  assert.strictEqual(metrics.signedError, 10000);
});

test('genuine historical bounds coverage calculates correctly', () => {
  const snapshot = extractPredictionSnapshot(snapshotRow());
  const inside = valuationCaseMetrics(snapshot, saleOutcome({ value: 380000 }));
  assert.strictEqual(inside.withinBounds, true);
  const outside = valuationCaseMetrics(snapshot, saleOutcome({ value: 500000 }));
  assert.strictEqual(outside.withinBounds, false);
  const agg = aggregateCases([inside, outside]);
  assert.strictEqual(agg.boundsCoverage.sampleSize, 2);
  assert.strictEqual(agg.boundsCoverage.covered, 1);
  assert.strictEqual(agg.boundsCoverage.rate, 0.5);
});

test('no bounds means no fabricated coverage', () => {
  const agg = aggregateCases([
    {
      absoluteError: 10,
      percentageError: 0.01,
      signedError: 10,
      boundsAvailable: false,
      withinBounds: null,
    },
  ]);
  assert.strictEqual(agg.boundsCoverage, null);
});

test('zero sample is insufficientData, not zero error', () => {
  const empty = runBacktest({ snapshots: [], outcomes: [] });
  assert.strictEqual(empty.state, STATE.insufficientData);
  assert.strictEqual(empty.valuation.mae, null);
  assert.notStrictEqual(empty.valuation.mae, 0);
  assert.strictEqual(empty.rent.sampleSize, 0);
  assert.strictEqual(empty.rent.mae, null);
});

test('rent backtest requires genuine achieved rent', () => {
  const areaRent = pairSnapshotWithOutcome(
    extractPredictionSnapshot(snapshotRow()),
    rentOutcome({ timestampSource: 'area_rents', source: 'propertydata_rents' })
  );
  assert.strictEqual(areaRent.reason, EXCLUSION.area_rents_used_as_achieved_rent);
  const genuine = runBacktest({
    snapshots: [snapshotRow()],
    outcomes: [rentOutcome()],
  });
  assert.strictEqual(genuine.rent.state, STATE.available);
  assert.strictEqual(genuine.rent.sampleSize, 1);
  assert.strictEqual(genuine.rent.mae, Math.abs(1400 - 1450));
});

test('confidence is evaluated but not modified', () => {
  const result = runBacktest({
    snapshots: [snapshotRow()],
    outcomes: [saleOutcome()],
  });
  assert.strictEqual(result.confidence.modelVersion, 'confidence-1.1.0');
  assert.strictEqual(result.confidence.calibrated, false);
  assert.strictEqual(CONFIDENCE_MODEL.baseVersion, 'confidence-1.1.0');
  assert.strictEqual(FACTOR_WEIGHTS.dataCompleteness, 0.06);
});

test('lifecycle events are not converted into demand', () => {
  const result = runBacktest({
    snapshots: [snapshotRow()],
    outcomes: [saleOutcome()],
  });
  assert.strictEqual(result.demand.lifecycleConvertedToDemand, false);
  assert.strictEqual(result.demand.propertySpecific.activated, false);
  assert.strictEqual(result.demand.propertySpecific.state, 'notAssessed');
  assert.strictEqual(result.demandScoreCreated, false);
});

test('landlord demand remains notAssessed', () => {
  const landlord = landlordScore();
  assert.strictEqual(landlord.dimensions.demand.state, 'no_demand_data_source');
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
});

test('buyer_general unchanged', () => {
  const buyer = buyerScore();
  assert.ok(Number.isFinite(buyer.score));
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.priceFairness, 0.15);
});

test('landlord unchanged', () => {
  const landlord = landlordScore();
  assert.ok(landlord.score >= 80);
  assert.strictEqual(LANDLORD_WEIGHTS.rentPosition, 0.2);
  assert.strictEqual(LANDLORD_WEIGHTS.grossYield, 0.18);
});

test('financialEngine unchanged', () => {
  const m = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    deposit: 50000,
    interestRate: 5,
    vacancyAssumption: 0,
    maintenance: 0,
    insurance: 0,
  });
  assert.strictEqual(m.grossYield, 6);
  assert.strictEqual(m.groundRent, null);
});

test('canonical intelligence path version unchanged', () => {
  assert.strictEqual(CANONICAL_ENGINE_VERSION, 'property-intelligence-v2');
  const engineSrc = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'propertyIntelligenceEngine.js'),
    'utf8'
  );
  assert.ok(!/backtesting/.test(engineSrc));
  assert.ok(!/runBacktest/.test(engineSrc));
});

test('open-data attribute precedence unchanged', () => {
  const { property, evidence } = applyPropertyDataEvidence(
    { id: 2, epc_rating: 'B', tenure: 'Freehold', council_tax_band: 'B', uprn: '1' },
    {
      identity: { uprn: '1' },
      enrichments: {
        uprn_profile: {
          success: true,
          data: {
            uprn: '1',
            energyScore: 'C',
            taxBand: 'D',
            registeredLeases: [{ lease_id: 'HP1', term_end_date: '2079-01-01' }],
          },
        },
      },
    }
  );
  assert.strictEqual(property.epc_rating, 'B');
  assert.strictEqual(property.tenure, 'Freehold');
  assert.strictEqual(property.council_tax_band, 'B');
  assert.strictEqual(evidence.fields.epc_rating.source, 'InternalListing');
});

test('outcome already known at prediction is excluded', () => {
  const snapshot = extractPredictionSnapshot(
    snapshotRow({
      marketIntelligence: {
        sale: { lastSold: { price: 380000, date: '2025-06-01T00:00:00.000Z' } },
      },
    })
  );
  const paired = pairSnapshotWithOutcome(snapshot, saleOutcome());
  assert.strictEqual(paired.reason, EXCLUSION.outcome_already_known_at_prediction);
});

test('status is not an achieved value', () => {
  const paired = pairSnapshotWithOutcome(
    extractPredictionSnapshot(snapshotRow()),
    saleOutcome({ timestampSource: 'status', value: 1 })
  );
  assert.strictEqual(paired.reason, EXCLUSION.status_used_as_achieved_value);
});

test('current recomputation is not a historical snapshot', () => {
  const paired = pairSnapshotWithOutcome(
    extractPredictionSnapshot(snapshotRow({}, { recomputed: true })),
    saleOutcome()
  );
  assert.strictEqual(paired.reason, EXCLUSION.current_provider_response_as_history);
});

test('personal decision scores are not labelled from sale outcomes', () => {
  const result = runBacktest({
    snapshots: [snapshotRow({ personalDecision: { profile: 'buyer_general', score: 81 } })],
    outcomes: [saleOutcome()],
  });
  assert.strictEqual(result.personalDecision.state, STATE.notEvaluated);
  assert.strictEqual(result.personalDecision.calibrated, false);
  assert.ok(result.personalDecision.requiredFutureLabels.length >= 2);
  assert.strictEqual(result.personalDecision.historicalScoresPreserved, 1);
});

test('production audit excludes synthetic fixtures', () => {
  const result = runBacktest({
    snapshots: [snapshotRow()],
    outcomes: [saleOutcome()],
    productionAudit: true,
  });
  assert.strictEqual(result.valuation.sampleSize, 0);
  assert.strictEqual(result.valuation.state, STATE.insufficientData);
  assert.ok(
    result.eligibility.exclusionReasons[EXCLUSION.synthetic_fixture_not_production_evidence]
  );
});

test('wrapValue historical estimates are read without fabricating bounds', () => {
  const snapshot = extractPredictionSnapshot(
    snapshotRow({
      marketIntelligence: {
        sale: {
          centralEstimate: { value: 400000 },
          lowerEstimate: { value: null, state: 'notAssessed' },
          upperEstimate: { value: null, state: 'notAssessed' },
          boundsAvailable: false,
        },
      },
    })
  );
  assert.strictEqual(snapshot.sale.central, 400000);
  assert.strictEqual(snapshot.sale.lower, null);
  assert.strictEqual(snapshot.sale.boundsAvailable, false);
});

test('backtest engine is observational', () => {
  const result = runBacktest({ snapshots: [snapshotRow()], outcomes: [saleOutcome()] });
  assert.strictEqual(result.observational, true);
  assert.strictEqual(result.productionFormulasChanged, false);
  assert.strictEqual(result.engineVersion, BACKTEST_ENGINE_VERSION);
  assert.ok(!result.cases.sale[0].title);
  assert.ok(!result.cases.sale[0].address);
});

console.log('\nAll backtesting foundation tests passed.');
