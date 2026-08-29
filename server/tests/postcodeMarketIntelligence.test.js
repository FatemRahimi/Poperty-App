/**
 * Postcode market intelligence unit tests.
 * Covers segment matching rules, sparse-evidence guards, and the decision-context adapter.
 * Run: node server/tests/postcodeMarketIntelligence.test.js
 */

const assert = require('assert');
const {
  buildSegmentKey,
  normalizePropertyTypeLabel,
  findMatchedSegment,
  buildPropertyMarketContext,
  buildDecisionContext,
} = require('../services/ai/postcodeMarketIntelligenceService');

// --- Segment keys: residential only, commercial never mixed in ---
assert.strictEqual(buildSegmentKey({ category: 'sale', bedrooms: 2, property_type: 'Flat' }), '2|flat');
assert.strictEqual(
  buildSegmentKey({ category: 'lease', bedrooms: 2, property_type: 'Office' }),
  null,
  'Commercial lease must not enter residential segments'
);
assert.strictEqual(
  buildSegmentKey({ category: 'rent', bedrooms: 3, property_type: 'Terraced House' }),
  '3|terraced house'
);
assert.strictEqual(
  buildSegmentKey({ category: 'sale', bedrooms: 2, property_type: 'Flat', square_feet: 700 }, { includeSqftBand: true }),
  '2|flat|500_800',
  'Floor-area band is appended only when requested'
);

// --- Type normalisation ---
assert.strictEqual(normalizePropertyTypeLabel('Apartment'), 'flat');
assert.strictEqual(normalizePropertyTypeLabel('Semi-Detached'), 'semi-detached house');

// --- Matched segment lookup ---
const strongSegment = {
  key: '2|flat',
  label: '2-bed flat',
  saleSampleSize: 6,
  rentSampleSize: 5,
  typicalValue: {
    available: true,
    value: 240000,
    source: 'InternalMarketplace',
    sampleSize: 6,
    observationPeriod: 'sale listings from 2026-01-04 to 2026-07-19',
    confidence: { level: 'Medium', note: '6 records' },
    sparseEvidence: false,
  },
  typicalRent: {
    available: true,
    value: 1250,
    source: 'InternalMarketplace',
    sampleSize: 5,
    observationPeriod: 'rental listings from 2026-02-01 to 2026-08-01',
    confidence: { level: 'Medium', note: '5 records' },
    sparseEvidence: false,
  },
  indicativeGrossYield: {
    available: true,
    grossYieldPercent: 6.25,
    comparable: true,
    sparseEvidence: false,
    notTransactionBasedYield: true,
    basis: 'asking_rent_vs_asking_sale',
    confidence: { level: 'Medium' },
  },
};

const matched = findMatchedSegment(
  { category: 'sale', bedrooms: 2, property_type: 'Flat', price: 250000 },
  [strongSegment]
);
assert.ok(matched, 'Property should match a segment of the same type and bedrooms');
assert.strictEqual(matched.label, '2-bed flat');

assert.strictEqual(
  findMatchedSegment({ category: 'sale', bedrooms: 5, property_type: 'Detached' }, [strongSegment]),
  null,
  'A 5-bed house must not match a 2-bed flat segment'
);

// --- Property market context uses matched evidence and carries provenance ---
const postcodeMarket = {
  success: true,
  postcode: 'B19 2YF',
  retrievedAt: new Date().toISOString(),
  externalAvailable: false,
  confidence: { level: 'Low', summary: 'Marketplace listings only.' },
  snapshot: {
    typicalValue: {
      available: true,
      value: 230000,
      source: 'InternalMarketplace',
      sampleSize: 4,
      observationPeriod: 'sale listings from 2026-01-04 to 2026-07-19',
      sparseEvidence: false,
    },
    typicalRent: { available: true, value: 900, source: 'InternalMarketplace', sampleSize: 7, sparseEvidence: false },
    soldPriceEvidence: { available: false },
    indicativeAreaYield: { available: true, grossYieldPercent: 4.7, sparseEvidence: false, confidence: { level: 'Low' } },
  },
  investment: { segments: [strongSegment] },
};

const context = buildPropertyMarketContext(
  { category: 'sale', bedrooms: 2, property_type: 'Flat', price: 250000 },
  postcodeMarket
);
assert.ok(context, 'Context should be produced for a matched property');
assert.strictEqual(context.matchedSegment.label, '2-bed flat');
assert.strictEqual(context.vsMatchedEvidence.differencePercent, 4.17);
assert.ok(
  context.vsMatchedEvidence.summary.includes('above matched local evidence'),
  'Comparison must reference matched local evidence'
);
assert.strictEqual(context.typicalPostcodeValue.available, true);

// --- Decision context adapter: selection only, provenance preserved ---
const decision = buildDecisionContext(postcodeMarket, context);
assert.strictEqual(decision.available, true);
assert.strictEqual(decision.usage.role, 'context_only');
assert.strictEqual(decision.usage.recalculationOwner, 'financialEngine');
assert.strictEqual(decision.preferredValueBaseline.kind, 'matched_segment_value');
assert.strictEqual(decision.preferredValueBaseline.value, 240000);
assert.strictEqual(decision.preferredValueBaseline.usableAsBaseline, true);
assert.ok(decision.preferredValueBaseline.observationPeriod, 'Baseline must carry an observation period');
assert.strictEqual(decision.areaYield.scope, 'area_indicator_only');
assert.strictEqual(decision.segmentYield.scope, 'matched_segment_indicator');
assert.strictEqual(decision.marketDemand.available, false);
assert.strictEqual(decision.marketDemand.scope, 'area');
assert.strictEqual(decision.marketDemand.demandType, 'buyer_market');
assert.strictEqual(decision.marketDemand.propertyLevel, false);
assert.strictEqual(decision.marketDemand.rentalDemand, false);
assert.strictEqual(decision.marketDemand.state, 'notAssessed');
assert.strictEqual(decision.marketDemand.role, 'context_only');
assert.strictEqual(decision.rentalMarketDemand.available, false);
assert.strictEqual(decision.rentalMarketDemand.scope, 'area');
assert.strictEqual(decision.rentalMarketDemand.demandType, 'rental_market');
assert.strictEqual(decision.rentalMarketDemand.propertyLevel, false);
assert.strictEqual(decision.rentalMarketDemand.rentalDemand, true);
assert.strictEqual(decision.rentalMarketDemand.state, 'notAssessed');
assert.strictEqual(decision.rentalMarketDemand.role, 'context_only');
assert.strictEqual(decision.rentalMarketDemand.value, null);
assert.strictEqual(decision.rentalMarketDemand.band, null);

// --- Sparse evidence must not become a usable baseline ---
const sparseMarket = {
  ...postcodeMarket,
  snapshot: {
    ...postcodeMarket.snapshot,
    typicalValue: { ...postcodeMarket.snapshot.typicalValue, sampleSize: 2, sparseEvidence: true },
  },
  investment: {
    segments: [
      {
        ...strongSegment,
        typicalValue: { ...strongSegment.typicalValue, sampleSize: 1, sparseEvidence: true },
        indicativeGrossYield: { ...strongSegment.indicativeGrossYield, comparable: false, sparseEvidence: true },
      },
    ],
  },
};
const sparseContext = buildPropertyMarketContext(
  { category: 'sale', bedrooms: 2, property_type: 'Flat', price: 250000 },
  sparseMarket
);
const sparseDecision = buildDecisionContext(sparseMarket, sparseContext);
assert.strictEqual(
  sparseDecision.preferredValueBaseline,
  null,
  'Sparse evidence must not be offered as a scoring baseline'
);
assert.strictEqual(sparseDecision.valueBaselines.length, 2, 'Sparse baselines are still reported, flagged as unusable');
assert.strictEqual(sparseDecision.valueBaselines.every((b) => b.usableAsBaseline === false), true);
assert.strictEqual(sparseDecision.segmentYield.comparable, false);

// --- Provenance contract: metrics must declare source, sample size, period, confidence, sparse state ---
const REQUIRED_PROVENANCE = ['source', 'sampleSize', 'observationPeriod', 'confidence', 'sparseEvidence'];

function assertProvenance(metric, name) {
  assert.ok(metric, `${name} should exist`);
  REQUIRED_PROVENANCE.forEach((field) => {
    assert.ok(
      Object.prototype.hasOwnProperty.call(metric, field),
      `${name} is missing provenance field "${field}"`
    );
  });
}

assertProvenance(strongSegment.typicalValue, 'segment.typicalValue');
assertProvenance(strongSegment.typicalRent, 'segment.typicalRent');
assertProvenance(context.typicalPostcodeValue, 'marketContext.typicalPostcodeValue');

// Baselines handed to future scoring must carry the same provenance
decision.valueBaselines.concat(decision.rentBaselines).forEach((baseline) => {
  ['source', 'sampleSize', 'observationPeriod', 'confidence', 'sparseEvidence', 'usableAsBaseline'].forEach(
    (field) => {
      assert.ok(
        Object.prototype.hasOwnProperty.call(baseline, field),
        `decision baseline "${baseline.kind}" is missing "${field}"`
      );
    }
  );
});

// --- No market context without a successful postcode payload ---
assert.strictEqual(buildPropertyMarketContext({ price: 100000 }, { success: false }), null);
assert.strictEqual(buildDecisionContext({ success: false }).available, false);

assert.strictEqual(
  strongSegment.indicativeGrossYield.notTransactionBasedYield,
  true,
  'asking-based area yield must be labelled, not presented as a transaction yield'
);
assert.strictEqual(strongSegment.indicativeGrossYield.basis, 'asking_rent_vs_asking_sale');

const demandMarket = {
  ...postcodeMarket,
  snapshot: {
    ...postcodeMarket.snapshot,
    areaMarketDemand: {
      available: true,
      scope: 'area',
      demandType: 'buyer_market',
      propertyLevel: false,
      rentalDemand: false,
      band: "Buyer's market",
      value: null,
      sampleSize: null,
      observationPeriod: null,
      observedAt: null,
      retrievedAt: '2026-08-25T17:51:46.390Z',
      confidence: null,
      source: 'PropertyData',
      provider: 'propertydata',
      providerEndpoint: '/demand',
      totalForSale: 288,
      averageSalesPerMonth: 16,
      turnoverPerMonth: '6%',
      monthsOfInventory: 16.7,
      daysOnMarket: 507,
      state: 'observed',
      methodology: 'PropertyData /demand area sales-market snapshot.',
    },
  },
};
const demandDecision = buildDecisionContext(demandMarket, context);
assert.strictEqual(demandDecision.marketDemand.available, true);
assert.strictEqual(demandDecision.marketDemand.scope, 'area');
assert.strictEqual(demandDecision.marketDemand.demandType, 'buyer_market');
assert.strictEqual(demandDecision.marketDemand.propertyLevel, false);
assert.strictEqual(demandDecision.marketDemand.rentalDemand, false);
assert.strictEqual(demandDecision.marketDemand.band, "Buyer's market");
assert.strictEqual(demandDecision.marketDemand.value, null);
assert.strictEqual(demandDecision.marketDemand.sampleSize, null);
assert.strictEqual(demandDecision.marketDemand.confidence, null);
assert.strictEqual(demandDecision.marketDemand.observationPeriod, null);
assert.strictEqual(demandDecision.marketDemand.source, 'PropertyData');
assert.strictEqual(demandDecision.marketDemand.providerEndpoint, '/demand');
assert.strictEqual(demandDecision.marketDemand.role, 'context_only');
assert.strictEqual(demandDecision.usage.role, 'context_only');
assert.strictEqual(demandDecision.rentalMarketDemand.available, false);
assert.strictEqual(demandDecision.rentalMarketDemand.demandType, 'rental_market');
assert.strictEqual(demandDecision.rentalMarketDemand.role, 'context_only');

const demandRentMarket = {
  ...postcodeMarket,
  snapshot: {
    ...postcodeMarket.snapshot,
    areaRentalDemand: {
      available: true,
      scope: 'area',
      demandType: 'rental_market',
      propertyLevel: false,
      rentalDemand: true,
      band: "Landlord's market",
      value: null,
      sampleSize: null,
      observationPeriod: null,
      observedAt: null,
      retrievedAt: '2026-08-25T18:18:36.885Z',
      confidence: null,
      source: 'PropertyData',
      provider: 'propertydata',
      providerEndpoint: '/demand-rent',
      totalForRent: 592,
      transactionsPerMonth: 284,
      turnoverPerMonth: '48%',
      monthsOfInventory: 2.1,
      daysOnMarket: 63,
      radius: 0.7,
      radiusUnit: null,
      state: 'observed',
      methodology: 'PropertyData /demand-rent area rental-market snapshot.',
    },
  },
};
const demandRentDecision = buildDecisionContext(demandRentMarket, context);
assert.strictEqual(demandRentDecision.rentalMarketDemand.available, true);
assert.strictEqual(demandRentDecision.rentalMarketDemand.scope, 'area');
assert.strictEqual(demandRentDecision.rentalMarketDemand.demandType, 'rental_market');
assert.strictEqual(demandRentDecision.rentalMarketDemand.propertyLevel, false);
assert.strictEqual(demandRentDecision.rentalMarketDemand.rentalDemand, true);
assert.strictEqual(demandRentDecision.rentalMarketDemand.band, "Landlord's market");
assert.strictEqual(demandRentDecision.rentalMarketDemand.value, null);
assert.strictEqual(demandRentDecision.rentalMarketDemand.sampleSize, null);
assert.strictEqual(demandRentDecision.rentalMarketDemand.confidence, null);
assert.strictEqual(demandRentDecision.rentalMarketDemand.observationPeriod, null);
assert.strictEqual(demandRentDecision.rentalMarketDemand.radiusUnit, null);
assert.strictEqual(demandRentDecision.rentalMarketDemand.source, 'PropertyData');
assert.strictEqual(demandRentDecision.rentalMarketDemand.providerEndpoint, '/demand-rent');
assert.strictEqual(demandRentDecision.rentalMarketDemand.role, 'context_only');
assert.strictEqual(demandRentDecision.marketDemand.available, false);
assert.strictEqual(demandRentDecision.marketDemand.demandType, 'buyer_market');
assert.notStrictEqual(demandRentDecision.rentalMarketDemand.demandType, demandRentDecision.marketDemand.demandType);

console.log('postcodeMarketIntelligence.test.js — all passed');
