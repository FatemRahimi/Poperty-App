/**
 * Open-data attribute fill — EPC, tenure/lease, council tax.
 * Uses verified PropertyData /uprn fields only. Area endpoints are not applied.
 * Run: node server/tests/openDataAttributes.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  parseUprnProfile,
  parseValuationSaleResponse,
  parseRentsResponse,
  parseDemandResponse,
  parseDemandRentResponse,
} = require('../services/providers/propertyData/propertyDataParsers');
const { applyPropertyDataEvidence } = require('../services/providers/propertyData/propertyDataEvidence');
const { listingObservedCharges, pickGroundRent, pickServiceCharge } = require('../services/ai/listingObservedFields');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const {
  BUYER_GENERAL_WEIGHTS,
  LANDLORD_WEIGHTS,
} = require('../config/personalDecision.config');
const { CURRENT_CONFIDENCE_MODEL } = require('../models/AiRequest');
const { CONFIDENCE_MODEL, FACTOR_WEIGHTS } = require('../services/ai/confidenceEngine');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { calculateInvestmentMetrics } = require('../services/ai/financialEngine');
const { weightedBlend } = require('../services/ai/valuationEngine');
const { buildEvidencedInvestmentInput } = require('../services/ai/evidencedInvestment');

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
const LIVE_RENTS = loadFixture('propertydata-rents-live-min.json');
const LIVE_DEMAND = loadFixture('propertydata-demand-live-min.json');
const LIVE_DEMAND_RENT = loadFixture('propertydata-demand-rent-live-min.json');

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

function buyerScore(extraProperty = {}) {
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
      ...extraProperty,
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

function landlordScore(extraProperty = {}, extraIntel = {}) {
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
      ...extraProperty,
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
      ...extraIntel,
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

test('genuine verified EPC fills missing EPC', () => {
  const parsed = parseUprnProfile(UPRN);
  assert.strictEqual(parsed.epcRating, 'C');
  assert.strictEqual(parsed.epcScore, 69);
  assert.strictEqual(parsed.epcCertificateNumber, '1234-5678-9012-3456-7890');

  const { property, evidence } = applyPropertyDataEvidence({ id: 1 }, matchedEnrichment());
  assert.strictEqual(property.epc_rating, 'C');
  assert.strictEqual(evidence.fields.epc_rating.source, 'PropertyData');
  assert.strictEqual(evidence.fields.epc_score.value, 69);
  assert.strictEqual(evidence.openDataAttributes.epc.rating.value, 'C');
  assert.strictEqual(evidence.openDataAttributes.epc.score.provenance.providerEndpoint, '/uprn');
  assert.strictEqual(evidence.openDataAttributes.epc.score.provenance.matchBasis, 'uprn');
  assert.strictEqual(evidence.openDataAttributes.epc.estimated, false);
  assert.ok(!evidence.fields.epc_rating.provenance.observedAt);
  assert.strictEqual(evidence.retrievedAt, '2026-08-25T12:00:00.000Z');
  assert.strictEqual(evidence.fields.epc_rating.provenance.retrievedAt, '2026-08-25T12:00:00.000Z');
});

test('listing EPC is not overwritten by weaker external EPC', () => {
  const { property, evidence } = applyPropertyDataEvidence(
    { id: 2, epc_rating: 'B' },
    matchedEnrichment()
  );
  assert.strictEqual(property.epc_rating, 'B');
  assert.strictEqual(evidence.fields.epc_rating.source, 'InternalListing');
  assert.strictEqual(evidence.fields.epc_score.value, null);
  assert.strictEqual(evidence.fields.epc_certificate_number.value, null);
  const conflict = evidence.conflicts.find((c) => c.field === 'epc_rating');
  assert.ok(conflict);
  assert.strictEqual(conflict.selected, 'B');
  assert.strictEqual(conflict.external, 'C');
});

test('missing EPC remains notAssessed', () => {
  const { property, evidence } = applyPropertyDataEvidence(
    { id: 3 },
    matchedEnrichment({ uprn: '1', taxBand: 'D' })
  );
  assert.strictEqual(property.epc_rating, null);
  assert.strictEqual(evidence.fields.epc_rating.state, 'notAssessed');
  assert.strictEqual(evidence.fields.epc_rating.value, null);
});

test('no EPC is inferred from age or property type', () => {
  const { property, evidence } = applyPropertyDataEvidence(
    { id: 4, property_type: 'Victorian terrace', year_built: 1890 },
    matchedEnrichment({ uprn: '1', constructionAgeBand: 'pre-1900', propertyType: 'House' })
  );
  assert.strictEqual(property.epc_rating, null);
  assert.strictEqual(evidence.fields.epc_rating.state, 'notAssessed');
  assert.strictEqual(property.year_built, 1890);
  assert.notStrictEqual(property.year_built, 'pre-1900');
});

test('genuine tenure from registered leases fills missing legal tenure', () => {
  const parsed = parseUprnProfile(UPRN);
  assert.strictEqual(parsed.legalTenure, 'Leasehold');
  assert.strictEqual(parsed.occupancyTenure, 'Owner-occupied');
  assert.notStrictEqual(parsed.legalTenure, parsed.occupancyTenure);
  assert.strictEqual(parsed.leaseYearsRemaining, 53);

  const { property, evidence } = applyPropertyDataEvidence({ id: 5 }, matchedEnrichment());
  assert.strictEqual(property.tenure, 'Leasehold');
  assert.strictEqual(evidence.fields.occupancy_tenure.value, 'Owner-occupied');
  assert.strictEqual(evidence.fields.lease_years_remaining.value, 53);
  assert.strictEqual(evidence.registeredLeases[0].termEndDate, '2079-01-01');
});

test('listing tenure wins over weaker external lease evidence', () => {
  const { property, evidence } = applyPropertyDataEvidence(
    { id: 6, tenure: 'Freehold' },
    matchedEnrichment()
  );
  assert.strictEqual(property.tenure, 'Freehold');
  const conflict = evidence.conflicts.find((c) => c.field === 'tenure');
  assert.ok(conflict);
  assert.strictEqual(conflict.listing, 'Freehold');
  assert.strictEqual(conflict.external, 'Leasehold');
  assert.strictEqual(conflict.selected, 'Freehold');
});

test('unknown tenure is not inferred from property type or occupancy', () => {
  const { property, evidence } = applyPropertyDataEvidence(
    { id: 7, property_type: 'Flat' },
    matchedEnrichment({
      uprn: '1',
      tenure: 'rented (private)',
      propertyType: 'Flat',
      registeredLeases: [],
    })
  );
  assert.strictEqual(property.tenure, null);
  assert.strictEqual(evidence.fields.tenure.state, 'notAssessed');
  assert.strictEqual(evidence.fields.occupancy_tenure.value, 'rented (private)');
  assert.notStrictEqual(property.tenure, 'Leasehold');
});

test('missing ground rent and service charge remain null, not 0', () => {
  const { property, evidence } = applyPropertyDataEvidence({ id: 8 }, matchedEnrichment());
  assert.strictEqual(property.ground_rent, undefined);
  assert.strictEqual(property.service_charges, undefined);
  assert.strictEqual(evidence.openDataAttributes.groundRent.value, null);
  assert.strictEqual(evidence.openDataAttributes.serviceCharge.value, null);
  assert.strictEqual(pickGroundRent(property).value, null);
  assert.strictEqual(pickServiceCharge(property).value, null);
  assert.notStrictEqual(pickGroundRent(property).value, 0);
  assert.notStrictEqual(pickServiceCharge(property).value, 0);
});

test('lease years are only calculated from real lease evidence', () => {
  const noDates = parseUprnProfile({
    uprn: '1',
    tenure: 'Leasehold',
    registeredLeases: [{ lease_id: 'X' }],
  });
  assert.strictEqual(noDates.legalTenure, 'Leasehold');
  assert.strictEqual(noDates.leaseYearsRemaining, null);

  const fromEnd = parseUprnProfile({
    uprn: '1',
    registeredLeases: [{ term_end_date: '2079-01-01', years_remaining: 53 }],
  });
  assert.strictEqual(fromEnd.leaseYearsRemaining, 53);

  const inferred = parseUprnProfile({
    uprn: '1',
    propertyType: 'Flat',
    tenure: 'Owner-occupied',
  });
  assert.strictEqual(inferred.leaseYearsRemaining, null);
  assert.strictEqual(inferred.legalTenure, null);
});

test('genuine property-level council tax band fills missing band', () => {
  const { property, evidence } = applyPropertyDataEvidence(
    { id: 9 },
    matchedEnrichment()
  );
  assert.strictEqual(property.council_tax_band, 'D');
  assert.strictEqual(evidence.fields.council_tax_band.source, 'PropertyData');
  assert.strictEqual(evidence.fields.council_tax_rate.value, 1890.12);
  assert.strictEqual(evidence.openDataAttributes.councilTax.annualRate.usedAsFinancialInput, false);
});

test('listing council tax band wins when stronger', () => {
  const { property, evidence } = applyPropertyDataEvidence(
    { id: 10, council_tax_band: 'B' },
    matchedEnrichment()
  );
  assert.strictEqual(property.council_tax_band, 'B');
  assert.strictEqual(evidence.fields.council_tax_band.source, 'InternalListing');
  const conflict = evidence.conflicts.find((c) => c.field === 'council_tax_band');
  assert.ok(conflict);
  assert.strictEqual(conflict.selected, 'B');
  assert.strictEqual(conflict.external, 'D');
});

test('missing council tax band remains null', () => {
  const { property, evidence } = applyPropertyDataEvidence(
    { id: 11 },
    matchedEnrichment({ uprn: '1', energyScore: 'C' })
  );
  assert.strictEqual(property.council_tax_band, null);
  assert.strictEqual(evidence.fields.council_tax_band.state, 'notAssessed');
});

test('postcode neighbour / area council-tax data does not become property band', () => {
  const { property, evidence } = applyPropertyDataEvidence(
    { id: 12 },
    {
      identity: { uprn: '1' },
      enrichments: {
        uprn_profile: { success: true, data: { uprn: '1' } },
        council_tax: {
          success: true,
          data: { postcode: 'LS1 1AA', average: { D: 1800 }, dominant_band: 'D' },
        },
      },
    }
  );
  assert.strictEqual(property.council_tax_band, null);
  assert.strictEqual(evidence.fields.council_tax_band.state, 'notAssessed');
});

test('unmatched identity does not write property-level evidence', () => {
  const { property, evidence } = applyPropertyDataEvidence(
    { id: 13, title: 'No UPRN' },
    {
      identity: {},
      enrichments: {
        uprn_profile: {
          success: true,
          data: { energyScore: 'A', taxBand: 'A', registeredLeases: UPRN.registeredLeases },
        },
      },
    }
  );
  assert.strictEqual(evidence.identity.propertyLevelMatch, false);
  assert.strictEqual(evidence.identity.matchBasis, 'none');
  assert.strictEqual(property.epc_rating, null);
  assert.strictEqual(property.tenure, null);
  assert.strictEqual(property.council_tax_band, null);
  assert.strictEqual(evidence.openDataAttributes.epc.rating.state, 'unavailable');
  assert.strictEqual(evidence.unmatchedPropertyLevelEvidence.writtenToCanonicalRecord, false);
  assert.strictEqual(evidence.unmatchedPropertyLevelEvidence.parsed.epcRating, 'A');
  assert.strictEqual(evidence.unmatchedPropertyLevelEvidence.parsed.councilTaxBand, 'A');
});

test('UPRN and listing identity remain separate', () => {
  const { evidence } = applyPropertyDataEvidence(
    { id: 77, uprn: '1000123' },
    matchedEnrichment()
  );
  assert.strictEqual(evidence.identity.listingId, 77);
  assert.strictEqual(evidence.identity.uprn, '1000123');
  assert.notStrictEqual(String(evidence.identity.listingId), String(evidence.identity.uprn));
  assert.strictEqual(evidence.identity.listingIdRemainsCanonicalForListings, true);
});

test('valuation, rent, demand and demand-rent parsers remain unchanged', () => {
  const avm = parseValuationSaleResponse({ result: { estimate: 250000, margin: 10000 } });
  assert.strictEqual(avm.centralEstimate, 250000);
  assert.strictEqual(avm.lowerEstimate, 240000);

  const rents = parseRentsResponse(LIVE_RENTS);
  assert.ok(rents);
  const demand = parseDemandResponse(LIVE_DEMAND);
  assert.ok(demand.demandRating);
  assert.strictEqual(demand.demandRating, LIVE_DEMAND.demand_rating);
  const rentDemand = parseDemandRentResponse(LIVE_DEMAND_RENT);
  assert.ok(rentDemand.rentalDemandRating);
});

test('no new financial assumptions from open-data attributes', () => {
  const charges = listingObservedCharges({ id: 1, price: 200000, monthly_rent: 1000 });
  assert.strictEqual(charges.groundRent.value, null);
  assert.strictEqual(charges.serviceCharge.value, null);
  const { evidence } = applyPropertyDataEvidence({ id: 1, price: 200000, monthly_rent: 1000 }, matchedEnrichment());
  assert.strictEqual(evidence.openDataAttributes.councilTax.annualRate.usedAsFinancialInput, false);
});

test('buyer_general numeric score is unchanged by attribute fill', () => {
  const base = buyerScore();
  const withAttrs = buyerScore({
    epc_rating: 'C',
    tenure: 'Leasehold',
    council_tax_band: 'D',
  });
  assert.strictEqual(withAttrs.score, base.score);
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
  assert.ok(!Object.prototype.hasOwnProperty.call(BUYER_GENERAL_WEIGHTS, 'epc'));
  assert.ok(!Object.prototype.hasOwnProperty.call(BUYER_GENERAL_WEIGHTS, 'tenure'));
  assert.ok(!Object.prototype.hasOwnProperty.call(BUYER_GENERAL_WEIGHTS, 'councilTax'));
});

test('landlord weights and demand remain unchanged', () => {
  const base = landlordScore();
  const withAttrs = landlordScore({
    epc_rating: 'C',
    tenure: 'Leasehold',
    council_tax_band: 'D',
  });
  assert.strictEqual(withAttrs.score, base.score);
  assert.strictEqual(withAttrs.dimensions.demand.state, 'no_demand_data_source');
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(LANDLORD_WEIGHTS.rentPosition, 0.2);
});

test('confidence model version remains confidence-1.1.0', () => {
  assert.strictEqual(CURRENT_CONFIDENCE_MODEL, 'confidence-1.1.0');
  assert.strictEqual(CONFIDENCE_MODEL.baseVersion, 'confidence-1.1.0');
  assert.strictEqual(FACTOR_WEIGHTS.dataCompleteness, 0.06);
  assert.strictEqual(FACTOR_WEIGHTS.sampleSize, 0.2);
});

test('lifecycle collectors are not used for attribute fill', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'providers', 'propertyData', 'propertyDataEvidence.js'),
    'utf8'
  );
  assert.ok(!/listingLifecycleService/.test(src));
  assert.ok(!/listing_events/.test(src));
});

test('gross yield and financialEngine inputs are unchanged by open-data fill', () => {
  const financeInput = {
    purchasePrice: 200000,
    expectedRent: 1000,
    deposit: 50000,
    interestRate: 5,
    vacancyAssumption: 0,
    maintenance: 0,
    insurance: 0,
  };
  const base = calculateInvestmentMetrics(financeInput);
  const { property, evidence } = applyPropertyDataEvidence(
    { id: 1, price: 200000, monthly_rent: 1000 },
    matchedEnrichment()
  );
  const after = calculateInvestmentMetrics(financeInput);
  assert.strictEqual(base.grossYield, 6);
  assert.strictEqual(after.grossYield, base.grossYield);
  assert.strictEqual(after.noi, base.noi);
  assert.ok(property.epc_rating);
  assert.ok(property.council_tax_band);
  const evidenced = buildEvidencedInvestmentInput({
    purchasePrice: 200000,
    expectedRent: 1000,
    property,
  });
  assert.strictEqual(evidenced.taxes, undefined);
  assert.strictEqual(evidenced.groundRent, undefined);
  assert.strictEqual(evidenced.serviceCharge, undefined);
  assert.strictEqual(evidence.openDataAttributes.councilTax.annualRate.usedAsFinancialInput, false);
});

test('valuation blend and bounds are unchanged', () => {
  const blend = weightedBlend([
    {
      centralEstimate: 500000,
      lowerEstimate: 480000,
      upperEstimate: 520000,
      method: 'valuation_sale_avm',
    },
  ]);
  assert.strictEqual(blend.central, 500000);
  assert.strictEqual(blend.lower, 480000);
  assert.strictEqual(blend.upper, 520000);
});

test('area-only PropertyData endpoints are not added for this fill', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'providers', 'propertyData', 'PropertyDataAdapter.js'),
    'utf8'
  );
  assert.ok(!/energy-efficiency/.test(src));
  assert.ok(!/council-tax/.test(src));
  assert.ok(!/tenure-types/.test(src));
  assert.ok(!/opendatacommunities/.test(src));
});

asyncTest('canonical report exposes filled open-data attributes without LLM numbers', async () => {
  const report = await assemblePropertyIntelligenceReport({
    property: { id: 1, title: 'Fill', city: 'Leeds', zip_code: 'LS1 1AA', category: 'sale', price: 200000 },
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
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      asOf: '2026-08-25T12:00:00.000Z',
      deps: {
        analyseRent: async () => ({ success: false, comparables: [] }),
        calculatePropertyValuation: async () => ({ success: false }),
        generatePropertyExplanation: async () => {
          throw new Error('LLM must not invent EPC/tenure/council tax');
        },
      },
    },
  });
  assert.strictEqual(report.property.epc_rating, 'C');
  assert.strictEqual(report.property.tenure, 'Leasehold');
  assert.strictEqual(report.property.council_tax_band, 'D');
  assert.strictEqual(report.property.openDataAttributes.epc.rating.value, 'C');
  assert.strictEqual(report.property.openDataAttributes.councilTax.annualRate.usedAsFinancialInput, false);
  assert.strictEqual(report.property.observedFields.councilTax.band.state, 'notAssessed');
  assert.strictEqual(report.explanation.source, 'template');
});

async function run() {
  for (const t of pending) {
    try {
      await t.fn();
      console.log(`✓ ${t.name}`);
    } catch (err) {
      console.error(`✗ ${t.name}`);
      throw err;
    }
  }
  console.log('\nAll open-data attribute tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
