/**
 * Decision-relevant property evidence expansion — listing/legal facts + readiness.
 * Run: node server/tests/decisionRelevantEvidence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { applyPropertyDataEvidence } = require('../services/providers/propertyData/propertyDataEvidence');
const {
  TRUST,
  assemblePropertyFacts,
  publicPropertyFactsForExplanation,
} = require('../services/ai/propertyFacts');
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
const { calculateInvestmentMetrics } = require('../services/ai/financialEngine');

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
}

const UPRN = loadFixture('propertydata-uprn-open-data-min.json');

function factsFor(listing, data = UPRN) {
  const applied = applyPropertyDataEvidence(listing, {
    identity: { uprn: String(data.uprn || '4510093370') },
    enrichments: {
      uprn_profile: {
        success: true,
        data,
        provenance: {
          source: 'PropertyData',
          method: 'uprn_profile',
          providerEndpoint: '/uprn',
          retrievedAt: '2026-08-25T12:00:00.000Z',
        },
      },
    },
  });
  return assemblePropertyFacts({
    property: applied.property,
    evidence: applied.evidence,
  });
}

test('provenance survives canonicalisation for new listing facts', () => {
  const facts = factsFor({
    id: 1,
    has_garden: true,
    heating_type: 'gas',
    broadband_availability: 'fibre',
    bathrooms: 1,
  });
  assert.strictEqual(facts.facts.outdoorSpace.provenance.source, 'InternalListing');
  assert.strictEqual(facts.facts.heating.provenance.source, 'InternalListing');
  assert.strictEqual(facts.facts.broadband.provenance.source, 'InternalListing');
  assert.strictEqual(facts.implications.leaseRemaining.layer, 'implication');
  assert.ok(facts.facts.leaseStart.available);
  assert.strictEqual(facts.facts.leaseStart.source, 'PropertyData_registeredLeases');
});

test('property-specific vs area-context is preserved', () => {
  const facts = factsFor({ id: 2, zip_code: 'SO16 0AS' });
  assert.strictEqual(facts.facts.tenure.scope, 'property');
  assert.strictEqual(facts.facts.flood.scope, 'coordinate_point_in_polygon');
  assert.notStrictEqual(facts.facts.flood.trust, TRUST.areaContext);
  assert.strictEqual(facts.facts.epcRating.scope, 'property');
});

test('unknown remains unknown; zero/false only when genuinely evidenced', () => {
  const facts = factsFor({
    id: 3,
    has_garden: false,
    has_garage: false,
    parking_spaces: 0,
    heating_type: '',
  });
  assert.strictEqual(facts.facts.outdoorSpace.state, 'notAssessed');
  assert.strictEqual(facts.facts.garage.value, null);
  assert.strictEqual(facts.facts.parkingSpaces.value, null);
  assert.strictEqual(facts.facts.heating.value, null);
  assert.strictEqual(facts.facts.flood.value, null);
  assert.strictEqual(facts.facts.planning.value, null);
  assert.strictEqual(facts.facts.schools.value, null);
  assert.strictEqual(facts.facts.listedBuilding.value, null);
  assert.strictEqual(facts.facts.conservationArea.value, null);
  assert.strictEqual(facts.facts.article4.value, null);
});

test('conflicting sources are not silently collapsed', () => {
  const facts = factsFor(
    { id: 4, epc_rating: 'B', bathrooms: 1 },
    { ...UPRN, energyScore: 'C', bathrooms: 3 }
  );
  const epcConflict = facts.conflicts.find((row) => row.field === 'epc_rating');
  assert.ok(epcConflict);
  assert.strictEqual(epcConflict.averaged, false);
  assert.strictEqual(epcConflict.resolvedByLlm, false);
  assert.strictEqual(facts.facts.epcRating.value, 'B');
});

test('LLM cannot manufacture flood planning schools listed buildings conservation areas or garden absence', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'propertyExplanationService.js'),
    'utf8'
  );
  assert.ok(/must NOT invent/.test(src));
  assert.ok(/Nearby schools are not catchment/.test(src));
  assert.ok(/Do not invent schools, catchments/.test(src));
  assert.ok(/Do not invent listed-building status/.test(src));
  assert.ok(/Do not invent conservation-area membership/.test(src));
  assert.ok(/Do not invent Article 4 membership/.test(src));
  assert.ok(/Do not add investigation items/.test(src));
  const explained = publicPropertyFactsForExplanation(factsFor({ id: 5 }));
  assert.strictEqual(explained.flood, null);
  assert.strictEqual(explained.planning, null);
  assert.strictEqual(explained.schools, null);
  assert.strictEqual(explained.listedBuilding, null);
  assert.strictEqual(explained.conservationArea, null);
  assert.strictEqual(explained.article4, null);
  assert.strictEqual(explained.outdoorSpace, null);
});

test('new facts are report/context evidence and do not create a propertyFactScore', () => {
  const facts = factsFor({ id: 6, has_garden: true, parking_spaces: 1 });
  assert.strictEqual(facts.scoringActivated, false);
  assert.strictEqual(facts.propertyFactScore, null);
  assert.strictEqual(facts.facts.outdoorSpace.decisionClass, 'report_context_evidence');
  assert.strictEqual(facts.facts.flood.decisionClass, 'report_context_evidence');
  assert.strictEqual(facts.implications.leaseRemaining.decisionRelevanceImplemented, false);
});

test('regression freeze: weights, demand, valuation, finance, outcomes, backtesting', () => {
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(LANDLORD_WEIGHTS.grossYield, 0.18);
  assert.ok(!Object.prototype.hasOwnProperty.call(BUYER_GENERAL_WEIGHTS, 'demand'));
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
  assert.ok(BACKTEST_ENGINE_VERSION);
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    vacancyAssumption: 5,
    operatingCosts: 0,
  });
  assert.ok(Number.isFinite(metrics.grossYield));
  const landlord = scorePersonalDecision({
    profile: 'landlord',
    property: {
      id: 1,
      price: 200000,
      monthly_rent: 1000,
      bedrooms: 2,
      property_type: 'Terraced',
      zip_code: 'LS1 1AA',
      title: 'Evidence freeze',
      has_garden: true,
    },
    finance: {
      purchasePrice: 200000,
      expectedRent: 1000,
      deposit: 50000,
      interestRate: 5,
      mortgageTermYears: 25,
      vacancyAssumption: 5,
      maintenance: 1200,
      insurance: 600,
      managementFee: 0,
      serviceCharge: 0,
      groundRent: 0,
      taxes: 0,
    },
    intelligence: { confidence: { level: 'High', assessed: true }, risks: [] },
    asOf: '2026-08-25T12:00:00.000Z',
  });
  assert.strictEqual(landlord.dimensions.demand.state, 'no_demand_data_source');
  assert.ok(!Object.prototype.hasOwnProperty.call(landlord.dimensions, 'flood'));
  assert.ok(!Object.prototype.hasOwnProperty.call(landlord.dimensions, 'planning'));
});
