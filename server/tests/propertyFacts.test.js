/**
 * Canonical property-fact layer — audit integration without scoring changes.
 * Run: node server/tests/propertyFacts.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { applyPropertyDataEvidence } = require('../services/providers/propertyData/propertyDataEvidence');
const {
  TRUST,
  LAYER,
  SOURCE_PRECEDENCE,
  DEPENDENCY_MODEL,
  assemblePropertyFacts,
  attachPropertyFactsToDecisionContext,
} = require('../services/ai/propertyFacts');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { extractCanonicalCoreFacts, projectPropertyOverview } = require('../services/ai/propertyIntelligenceService');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const {
  BUYER_GENERAL_WEIGHTS,
  LANDLORD_WEIGHTS,
} = require('../config/personalDecision.config');
const { CONFIDENCE_MODEL, FACTOR_WEIGHTS } = require('../services/ai/confidenceEngine');
const { calculateInvestmentMetrics } = require('../services/ai/financialEngine');
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

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
}

const UPRN = loadFixture('propertydata-uprn-open-data-min.json');

function matchedEnrichment(data = UPRN) {
  return {
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
  };
}

function factsFor(listing, enrichment = matchedEnrichment()) {
  const applied = applyPropertyDataEvidence(listing, enrichment);
  return {
    applied,
    facts: assemblePropertyFacts({
      property: applied.property,
      evidence: applied.evidence,
    }),
  };
}

test('verified /uprn facts parse into the canonical fact schema', () => {
  const { facts } = factsFor({ id: 1, zip_code: 'SO16 0AS' });
  assert.strictEqual(facts.facts.epcRating.value, 'C');
  assert.strictEqual(facts.facts.epcScore.value, 69);
  assert.strictEqual(facts.facts.epcCertificateNumber.value, '1234-5678-9012-3456-7890');
  assert.strictEqual(facts.facts.councilTaxBand.value, 'D');
  assert.strictEqual(facts.facts.councilTaxAmount.value, 1890.12);
  assert.strictEqual(facts.facts.tenure.value, 'Leasehold');
  assert.strictEqual(facts.implications.leaseRemaining.value, 53);
  assert.strictEqual(facts.implications.leaseRemaining.trust, TRUST.calculated);
  assert.strictEqual(facts.implications.leaseRemaining.layer, LAYER.implication);
  assert.ok(facts.implications.leaseRemaining.inputs.formula);
  assert.strictEqual(facts.facts.floorArea.value, 850);
  assert.strictEqual(facts.facts.leaseStart.value, '1980-01-01');
  assert.strictEqual(facts.facts.leaseEnd.value, '2079-01-01');
  assert.strictEqual(facts.facts.flood.available, false);
  assert.strictEqual(facts.facts.flood.unavailableReason, 'not_attached');
  assert.strictEqual(facts.facts.planning.available, false);
  assert.strictEqual(facts.facts.schools.available, false);
  assert.strictEqual(facts.identity.uprn.role, 'property_identity_candidate');
  assert.strictEqual(facts.identity.listingId.role, 'listing_identity');
  assert.strictEqual(facts.scoringActivated, false);
  assert.strictEqual(facts.propertyFactScore, null);
});

test('missing facts remain null/notAssessed', () => {
  const { facts } = factsFor({ id: 2, property_type: 'House' }, matchedEnrichment({ uprn: '1' }));
  assert.strictEqual(facts.facts.epcRating.available, false);
  assert.strictEqual(facts.facts.epcRating.state, 'notAssessed');
  assert.strictEqual(facts.facts.epcRating.value, null);
  assert.strictEqual(facts.facts.epcCertificateDate.available, false);
  assert.strictEqual(facts.facts.councilTaxAuthority.available, false);
  assert.strictEqual(facts.facts.councilTaxYear.available, false);
  assert.strictEqual(facts.facts.yearBuilt.value, null);
});

test('flat does not imply leasehold', () => {
  const { applied, facts } = factsFor(
    { id: 3, property_type: 'Flat' },
    matchedEnrichment({
      uprn: '1',
      propertyType: 'Flat',
      tenure: 'Owner-occupied',
      registeredLeases: [],
    })
  );
  assert.strictEqual(applied.property.property_type, 'Flat');
  assert.strictEqual(facts.facts.tenure.value, null);
  assert.strictEqual(facts.facts.freeholdOrLeasehold.inferredFromPropertyType, false);
  assert.notStrictEqual(facts.facts.tenure.value, 'Leasehold');
});

test('missing ground rent and service charge are not zero', () => {
  const { facts } = factsFor({ id: 4, price: 200000 });
  assert.strictEqual(facts.facts.groundRent.value, null);
  assert.notStrictEqual(facts.facts.groundRent.value, 0);
  assert.strictEqual(facts.facts.groundRent.state, 'notAssessed');
  assert.strictEqual(facts.facts.serviceCharge.value, null);
  assert.notStrictEqual(facts.facts.serviceCharge.value, 0);
});

test('known listing charges are labelled user supplied', () => {
  const { facts } = factsFor({
    id: 5,
    ground_rent: 250,
    service_charges: 1200,
    category: 'sale',
  });
  assert.strictEqual(facts.facts.groundRent.value, 250);
  assert.strictEqual(facts.facts.groundRent.trust, TRUST.userSupplied);
  assert.strictEqual(facts.facts.serviceCharge.value, 1200);
  assert.strictEqual(facts.facts.serviceCharge.trust, TRUST.userSupplied);
});

test('missing council tax amount is not fabricated from band', () => {
  const { facts } = factsFor(
    { id: 6, council_tax_band: 'E' },
    matchedEnrichment({ uprn: '1', taxBand: 'E' })
  );
  assert.strictEqual(facts.facts.councilTaxBand.value, 'E');
  assert.strictEqual(facts.facts.councilTaxAmount.value, null);
  assert.strictEqual(facts.facts.councilTaxAmount.derivedFromBand, false);
  assert.strictEqual(facts.facts.councilTaxAmount.usedAsFinancialInput, false);
});

test('missing EPC and floor area are not inferred; build year is not guessed', () => {
  const { applied, facts } = factsFor(
    { id: 7, property_type: 'Victorian terrace', year_built: 1890 },
    matchedEnrichment({
      uprn: '1',
      constructionAgeBand: 'pre-1900',
      propertyType: 'House',
    })
  );
  assert.strictEqual(facts.facts.epcRating.value, null);
  assert.strictEqual(facts.facts.epcRating.inferredFromAgeOrType, false);
  assert.strictEqual(facts.facts.floorArea.value, null);
  assert.strictEqual(facts.facts.floorArea.inferred, false);
  assert.strictEqual(facts.facts.yearBuilt.value, 1890);
  assert.strictEqual(applied.property.year_built, 1890);
  assert.strictEqual(facts.facts.constructionAgeBand.value, 'pre-1900');
  assert.strictEqual(facts.facts.constructionAgeBand.neverWrittenToYearBuilt, true);
});

test('source precedence is deterministic and listing asking is not overwritten', () => {
  assert.deepStrictEqual(SOURCE_PRECEDENCE.askingPrice, ['InternalListing']);
  const { applied, facts } = factsFor({
    id: 8,
    price: 400000,
    monthly_rent: 1500,
    epc_rating: 'B',
    tenure: 'Freehold',
  });
  assert.strictEqual(applied.property.price, 400000);
  assert.strictEqual(facts.facts.askingPrice.value, 400000);
  assert.strictEqual(facts.facts.askingPrice.trust, TRUST.userSupplied);
  assert.strictEqual(facts.facts.askingPrice.mustNotOverwrite, true);
  assert.strictEqual(facts.facts.askingRent.value, 1500);
  assert.strictEqual(facts.facts.epcRating.value, 'B');
  assert.strictEqual(facts.facts.epcRating.trust, TRUST.conflictingEvidence);
  assert.strictEqual(facts.facts.tenure.value, 'Freehold');
  assert.strictEqual(facts.facts.tenure.trust, TRUST.conflictingEvidence);
  assert.strictEqual(facts.facts.tenure.conflict.averaged, false);
});

test('conflicting evidence is not silently averaged', () => {
  const { facts } = factsFor({ id: 9, tenure: 'Freehold', epc_rating: 'B' });
  const tenureConflict = facts.conflicts.find((c) => c.field === 'tenure');
  assert.ok(tenureConflict);
  assert.strictEqual(tenureConflict.selected, 'Freehold');
  assert.strictEqual(tenureConflict.averaged, false);
  assert.strictEqual(tenureConflict.resolvedByLlm, false);
  assert.notStrictEqual(
    (String(tenureConflict.listing) + String(tenureConflict.external)).length / 2,
    tenureConflict.selected
  );
});

test('listing identity remains listing identity; UPRN is a property identity candidate', () => {
  const { facts } = factsFor({ id: 88, uprn: '999' });
  assert.strictEqual(facts.identity.listingId.value, 88);
  assert.strictEqual(facts.identity.listingId.listingIdRemainsCanonicalForListings, true);
  assert.strictEqual(facts.identity.uprn.role, 'property_identity_candidate');
  assert.notStrictEqual(facts.identity.uprn.role, 'listing_identity');
});

test('decisionContext receives facts as context without activating scoring', () => {
  const { facts } = factsFor({ id: 12, zip_code: 'SO16 0AS' });
  const attached = attachPropertyFactsToDecisionContext({ existing: true }, facts);
  assert.strictEqual(attached.existing, true);
  assert.strictEqual(attached.propertyFacts.role, 'fact_context');
  assert.strictEqual(attached.propertyFacts.scoringActivated, false);
  assert.strictEqual(attachPropertyFactsToDecisionContext(null, facts), null);
});

test('area evidence is not treated as a property fact', () => {
  const { facts } = factsFor({ id: 10, monthly_rent: 1400 });
  assert.strictEqual(facts.facts.askingRent.value, 1400);
  assert.strictEqual(facts.facts.askingRent.trust, TRUST.userSupplied);
  assert.strictEqual(facts.facts.askingRent.areaRentsAreNotPropertyFact, true);
  assert.notStrictEqual(facts.facts.askingRent.source, 'PropertyData');
});

test('user input is labelled user supplied; derived lease remaining identifies inputs', () => {
  const { facts } = factsFor({ id: 11, epc_rating: 'C', square_feet: 850 });
  assert.strictEqual(facts.facts.epcRating.trust, TRUST.userSupplied);
  assert.strictEqual(facts.facts.floorArea.trust, TRUST.userSupplied);
  assert.strictEqual(facts.implications.leaseRemaining.trust, TRUST.calculated);
  assert.ok(Array.isArray(facts.implications.leaseRemaining.inputs.registeredLeases));
  assert.strictEqual(facts.implications.leaseRemaining.decisionRelevanceImplemented, false);
});

test('boolean listing defaults are not treated as no garden or no parking', () => {
  const { facts } = factsFor({
    id: 8,
    has_garden: false,
    has_garage: false,
    parking_spaces: 0,
  });
  assert.strictEqual(facts.facts.outdoorSpace.available, false);
  assert.strictEqual(facts.facts.outdoorSpace.value, null);
  assert.strictEqual(facts.facts.garage.available, false);
  assert.strictEqual(facts.facts.parkingSpaces.available, false);
  assert.notStrictEqual(facts.facts.outdoorSpace.value, false);
  assert.notStrictEqual(facts.facts.parkingSpaces.value, 0);
});

test('explicit garden, parking, heating and broadband are observed listing facts', () => {
  const { facts } = factsFor({
    id: 9,
    has_garden: true,
    has_garage: true,
    parking_spaces: 2,
    heating_type: 'gas',
    broadband_availability: 'fibre',
    bathrooms: 2,
  });
  assert.strictEqual(facts.facts.outdoorSpace.available, true);
  assert.strictEqual(facts.facts.outdoorSpace.value, true);
  assert.strictEqual(facts.facts.outdoorSpace.source, 'InternalListing');
  assert.strictEqual(facts.facts.garage.value, true);
  assert.strictEqual(facts.facts.parkingSpaces.value, 2);
  assert.strictEqual(facts.facts.heating.value, 'gas');
  assert.strictEqual(facts.facts.broadband.value, 'fibre');
  assert.strictEqual(facts.facts.bathrooms.value, 2);
  assert.strictEqual(facts.facts.outdoorSpace.scoringActivated, false);
  assert.strictEqual(facts.version, 'property-facts-1.1.0');
});

test('LLM explanation contract forbids inventing facts', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'propertyExplanationService.js'),
    'utf8'
  );
  assert.ok(/must NOT invent/.test(src));
  assert.ok(/tenure, EPC, council tax/.test(src));
  assert.ok(!/generateEpc/.test(src));
});

test('dependency model exists and does not activate production scoring', () => {
  assert.strictEqual(DEPENDENCY_MODEL.serviceCharge.productionScoringActivated, false);
  assert.strictEqual(DEPENDENCY_MODEL.epc.productionScoringActivated, false);
  assert.ok(DEPENDENCY_MODEL.groundRent.mayAffect.includes('NOI'));
});

asyncTest('canonical report exposes propertyFacts without a second engine', async () => {
  const report = await assemblePropertyIntelligenceReport({
    property: { id: 1, title: 'Facts', city: 'Leeds', zip_code: 'LS1 1AA', category: 'sale', price: 200000 },
    access: {
      allowed: true,
      userId: 1,
      role: 'owner',
      relationship: 'owner',
      accessLevel: 'professional_intelligence',
      propertyId: 1,
      uprn: String(UPRN.uprn),
    },
    externalEnrichment: matchedEnrichment(),
    userId: 1,
    target: { propertyId: 1 },
    options: {
      skipExplanation: true,
      skipPostcodeMarket: true,
      skipPlanning: true,
      asOf: '2026-08-25T12:00:00.000Z',
      deps: {
        analyseRent: async () => ({ success: false, comparables: [] }),
        calculatePropertyValuation: async () => ({ success: false }),
        generatePropertyExplanation: async () => {
          throw new Error('LLM must not invent property facts');
        },
      },
    },
  });
  assert.strictEqual(report.analysisMode, 'canonical');
  assert.strictEqual(report.propertyFacts.facts.epcRating.value, 'C');
  assert.strictEqual(report.property.propertyFacts.facts.tenure.value, 'Leasehold');
  assert.strictEqual(report.propertyFacts.scoringActivated, false);
  assert.strictEqual(report.propertyFacts.facts.flood.available, false);
  assert.strictEqual(report.propertyFacts.facts.flood.unavailableReason, 'property_location_unavailable');
  const extracted = extractCanonicalCoreFacts({ output_data: report, id: 9 });
  assert.strictEqual(extracted.propertyFacts.facts.epcRating.value, 'C');
  const overview = projectPropertyOverview(
    { id: 1, title: 'Facts', price: 200000 },
    { canonicalReport: { output_data: report, id: 9 } }
  );
  assert.strictEqual(overview.propertyFacts.facts.epcRating.value, 'C');
  assert.strictEqual(overview.coreFactsSource, 'canonical_snapshot');
});

test('buyer_general landlord demand valuation rent finance confidence outcomes and backtesting remain unchanged', () => {
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
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    deposit: 50000,
    interestRate: 5,
    mortgageTermYears: 25,
    vacancyAssumption: 0,
    maintenance: 0,
    insurance: 0,
  });
  assert.strictEqual(metrics.grossYield, 6);
  const demand = parseDemandResponse({ demand_rating: 3 });
  const demandRent = parseDemandRentResponse({ rental_demand_rating: 4 });
  assert.ok(demand);
  assert.ok(demandRent);
  assert.deepStrictEqual([...OUTCOME_TYPES].sort(), ['let', 'sold', 'under_offer', 'withdrawn']);
  assert.strictEqual(BACKTEST_ENGINE_VERSION, 'backtest-foundation-1.0.0');
  const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'ai', 'propertyFacts.js'), 'utf8');
  assert.ok(!/scorePersonalDecision/.test(src));
  assert.ok(!/calculateInvestmentMetrics/.test(src));
  assert.ok(!/runBacktest/.test(src));
});

async function run() {
  for (const t of pending) {
    await t.fn();
    console.log(`✓ ${t.name}`);
  }
  console.log('\npropertyFacts.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
