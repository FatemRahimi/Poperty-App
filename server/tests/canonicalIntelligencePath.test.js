/**
 * Canonical Property Intelligence path unification.
 * Run: node server/tests/canonicalIntelligencePath.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const {
  BUYER_GENERAL_WEIGHTS,
  LANDLORD_WEIGHTS,
} = require('../config/personalDecision.config');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const {
  projectPropertyOverview,
  extractCanonicalCoreFacts,
} = require('../services/ai/propertyIntelligenceService');
const { evidencedValue } = require('../services/ai/evidencedInvestment');
const { applyPropertyDataEvidence } = require('../services/providers/propertyData/propertyDataEvidence');
const { mapToPropertyDataType } = require('../services/providers/propertyData/propertyTypeMapping');

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

const LIVE_DEMAND = loadFixture('propertydata-demand-live-min.json');
const LIVE_DEMAND_RENT = loadFixture('propertydata-demand-rent-live-min.json');

const ASOF = '2026-08-25T12:00:00.000Z';

const LISTING = {
  id: 7,
  title: '2 bed terrace',
  city: 'Leeds',
  zip_code: 'LS1 1AA',
  address_display: '1 Test Street, Leeds, LS1 1AA',
  category: 'sale',
  property_type: 'Terraced',
  price: 200000,
  monthly_rent: 1000,
  bedrooms: 2,
  bathrooms: 1,
  square_feet: 700,
  status: 'approved',
};

function ownerAccess(property = LISTING) {
  return {
    allowed: true,
    userId: 1,
    role: 'owner',
    relationship: 'owner',
    accessLevel: 'professional_intelligence',
    propertyId: property.id ?? null,
    subjectId: property.subjectId ?? null,
    uprn: property.uprn ?? null,
  };
}

function defaultDeps(overrides = {}) {
  const calls = { rent: 0, valuation: 0, postcode: 0, explain: 0 };
  return {
    calls,
    deps: {
      analyseRent: async (...args) => {
        calls.rent += 1;
        if (overrides.analyseRent) return overrides.analyseRent(...args);
        return { success: false, message: 'No rental information on file.', comparables: [] };
      },
      calculatePropertyValuation: async (...args) => {
        calls.valuation += 1;
        if (overrides.calculatePropertyValuation) return overrides.calculatePropertyValuation(...args);
        return { success: false, insufficientEvidence: true, message: 'No valuation evidence' };
      },
      getPostcodeMarketIntelligence: async (...args) => {
        calls.postcode += 1;
        if (overrides.getPostcodeMarketIntelligence) {
          return overrides.getPostcodeMarketIntelligence(...args);
        }
        return { success: false };
      },
      generatePropertyExplanation: async () => {
        calls.explain += 1;
        throw new Error('LLM must not run when skipExplanation is set');
      },
    },
  };
}

async function runCanonical(property, extra = {}) {
  const providerCallLog = extra.providerCallLog || [];
  const wired = defaultDeps(extra.depOverrides || {});
  const report = await assemblePropertyIntelligenceReport({
    property,
    access: extra.access || ownerAccess(property),
    externalEnrichment: extra.externalEnrichment || { available: false, enrichments: {} },
    userId: 1,
    target: extra.target || { propertyId: property.id },
    options: {
      skipExplanation: true,
      skipPostcodeMarket: extra.skipPostcodeMarket !== false,
      skipPlanning: extra.skipPlanning !== false,
      asOf: extra.asOf || ASOF,
      providerCallLog,
      deps: wired.deps,
      ...(extra.options || {}),
    },
  });
  return { report, calls: wired.calls, providerCallLog };
}

function coreFacts(report) {
  return {
    analysisMode: report.analysisMode,
    engineVersion: report.engineVersion,
    identity: report.identity,
    price: report.property.price,
    monthly_rent: report.property.monthly_rent,
    property_type: report.property.property_type,
    year_built: report.property.year_built,
    sale: report.marketIntelligence.sale,
    rentSuccess: report.marketIntelligence.rent?.success || false,
    rentRecommended: report.marketIntelligence.rent?.recommendedRent || null,
    underRented: report.marketIntelligence.rent?.underRented || false,
    grossYield: evidencedValue(report.investment?.presented?.grossYield),
    noiState: report.investment?.presented?.noi?.state || null,
    cashFlowState: report.investment?.presented?.annualCashFlow?.state || null,
    dscrState: report.investment?.presented?.dscr?.state || null,
    areaDemandType: report.marketIntelligence.areaMarketDemand?.demandType || null,
    areaDemandValue: report.marketIntelligence.areaMarketDemand?.value ?? null,
    areaDemandAvailable: report.marketIntelligence.areaMarketDemand?.available || false,
    rentalDemandType: report.marketIntelligence.areaRentalDemand?.demandType || null,
    rentalDemandValue: report.marketIntelligence.areaRentalDemand?.value ?? null,
    propertyDemand: report.marketIntelligence.propertySpecificDemand,
    tenantDemand: report.marketIntelligence.propertySpecificTenantDemand,
    confidenceLevel: report.confidence?.level || null,
    dataQualityScore: report.dataQuality?.score,
  };
}

test('subject preview is imported from externalPropertyLookupService', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'intelligenceController.js'),
    'utf8'
  );
  assert.ok(
    /const \{[\s\S]*getSubjectPreview[\s\S]*\} = require\('\.\.\/services\/ai\/externalPropertyLookupService'\)/.test(
      src
    ),
    'getSubjectPreview must be destructured from externalPropertyLookupService'
  );
  const lookup = require('../services/ai/externalPropertyLookupService');
  assert.strictEqual(typeof lookup.getSubjectPreview, 'function');
});

asyncTest('subject preview endpoint no longer fails due to a missing import', async () => {
  const lookup = require('../services/ai/externalPropertyLookupService');
  const original = lookup.getSubjectPreview;
  let calledWith = null;
  lookup.getSubjectPreview = async (subjectId) => {
    calledWith = subjectId;
    return {
      success: true,
      property: { id: null, subjectId, title: 'Preview fixture', uprn: '1000123' },
      accessContext: { subjectId, uprn: '1000123' },
    };
  };
  try {
    delete require.cache[require.resolve('../controllers/intelligenceController')];
    const ctrl = require('../controllers/intelligenceController');
    let body;
    let status = 200;
    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(payload) {
        body = payload;
        return this;
      },
    };
    await ctrl.getSubjectPreviewEndpoint({ params: { subjectId: '42' } }, res);
    assert.notStrictEqual(calledWith, null, 'imported getSubjectPreview must be invoked');
    assert.strictEqual(calledWith, 42);
    assert.strictEqual(status, 200);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.property.subjectId, 42);
    assert.notStrictEqual(body.message, 'Failed to load property preview');
  } finally {
    lookup.getSubjectPreview = original;
    delete require.cache[require.resolve('../controllers/intelligenceController')];
  }
});

test('overview and portfolio no longer call analyseRent', () => {
  const overviewSrc = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'propertyIntelligenceService.js'),
    'utf8'
  );
  const portfolioSrc = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'portfolioOptimiserService.js'),
    'utf8'
  );
  assert.ok(!/require\('\.\/rentIntelligenceService'\)/.test(overviewSrc));
  assert.ok(!/analyseRent\(/.test(overviewSrc));
  assert.ok(!/require\('\.\/rentIntelligenceService'\)/.test(portfolioSrc));
  assert.ok(!/analyseRent\(/.test(portfolioSrc));
  assert.ok(/projectPropertyOverview/.test(portfolioSrc));
});

test('personal-decision weights are unchanged', () => {
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.location, 0.22);
  assert.strictEqual(LANDLORD_WEIGHTS.rentPosition, 0.2);
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
});

asyncTest('canonical engine runs with sparse evidence', async () => {
  const { report, calls, providerCallLog } = await runCanonical({
    title: 'Sparse record',
    city: 'Leeds',
  });
  assert.strictEqual(report.success, true);
  assert.strictEqual(report.analysisMode, 'canonical');
  assert.strictEqual(report.engineVersion, 'property-intelligence-v2');
  assert.strictEqual(calls.valuation, 0);
  assert.strictEqual(calls.rent, 0);
  assert.ok(!providerCallLog.includes('postcode_market'));
  assert.strictEqual(report.marketIntelligence.areaMarketDemand.available, false);
  assert.strictEqual(report.marketIntelligence.areaMarketDemand.state, 'notAssessed');
});

asyncTest('missing optional provider data remains notAssessed', async () => {
  const { report } = await runCanonical(LISTING);
  assert.strictEqual(report.marketIntelligence.areaMarketDemand.available, false);
  assert.strictEqual(report.marketIntelligence.areaRentalDemand.available, false);
  assert.strictEqual(report.marketIntelligence.propertySpecificDemand.state, 'notAssessed');
  assert.strictEqual(report.marketIntelligence.propertySpecificTenantDemand.state, 'notAssessed');
  assert.strictEqual(report.marketIntelligence.sale?.success, false);
});

asyncTest('valuation and rent each come from one canonical path', async () => {
  const providerCallLog = [];
  const { report, calls } = await runCanonical(LISTING, {
    providerCallLog,
    depOverrides: {
      calculatePropertyValuation: async () => ({
        success: true,
        centralEstimate: { value: 205000 },
        lowerEstimate: { value: null, available: false, state: 'notAssessed' },
        upperEstimate: { value: null, available: false, state: 'notAssessed' },
        boundsAvailable: false,
        components: [{ method: 'internal_sale_comparables', centralEstimate: 205000 }],
        internalComparables: [],
      }),
      analyseRent: async () => ({
        success: true,
        recommendedRent: 1000,
        marketRange: { low: 950, high: 1100 },
        underRented: false,
        comparables: [{ id: 1, similarity: 0.9 }],
        confidence: 55,
        dataQuality: { level: 'Medium' },
      }),
    },
  });
  assert.strictEqual(calls.valuation, 1);
  assert.strictEqual(calls.rent, 1);
  assert.strictEqual(providerCallLog.filter((n) => n === 'valuation').length, 1);
  assert.strictEqual(providerCallLog.filter((n) => n === 'rent').length, 1);
  assert.strictEqual(report.marketIntelligence.sale.centralEstimate.value, 205000);
  assert.strictEqual(report.marketIntelligence.rent.recommendedRent, 1000);
  assert.strictEqual(report.marketIntelligence.rent.currentRent, 1000);
});

asyncTest('financial outputs use canonical financialEngine evidence gating', async () => {
  const { report } = await runCanonical(LISTING);
  assert.strictEqual(evidencedValue(report.investment.presented.grossYield), 6);
  assert.strictEqual(report.investment.presented.noi.state, 'notAssessed');
  assert.strictEqual(report.investment.presented.netYield.state, 'notAssessed');
  assert.strictEqual(report.investment.presented.annualCashFlow.state, 'notAssessed');
  assert.strictEqual(report.investment.presented.dscr.state, 'notAssessed');
  assert.strictEqual(report.investment.presented.noi.value, null);
  assert.strictEqual(report.investment.hasMortgageAssumptions, false);
});

asyncTest('/demand stays area buyer-market context and /demand-rent stays rental context', async () => {
  const { report } = await runCanonical(LISTING, {
    externalEnrichment: {
      available: true,
      identity: { uprn: '1000999' },
      enrichments: {
        demand: { success: true, data: LIVE_DEMAND, provenance: { retrievedAt: ASOF } },
        demand_rent: {
          success: true,
          data: LIVE_DEMAND_RENT,
          provenance: { retrievedAt: ASOF },
        },
      },
    },
  });
  const buyer = report.marketIntelligence.areaMarketDemand;
  const rental = report.marketIntelligence.areaRentalDemand;
  assert.strictEqual(buyer.available, true);
  assert.strictEqual(buyer.demandType, 'buyer_market');
  assert.strictEqual(buyer.propertyLevel, false);
  assert.strictEqual(buyer.value, null);
  assert.strictEqual(buyer.rentalDemand, false);
  assert.strictEqual(rental.available, true);
  assert.strictEqual(rental.demandType, 'rental_market');
  assert.strictEqual(rental.propertyLevel, false);
  assert.strictEqual(rental.value, null);
  assert.strictEqual(report.marketIntelligence.propertySpecificDemand.available, false);
  assert.strictEqual(report.marketIntelligence.propertySpecificTenantDemand.available, false);
  assert.ok(!Object.prototype.hasOwnProperty.call(report, 'demandScore'));
});

asyncTest('no property-specific demand is fabricated', async () => {
  const { report } = await runCanonical({
    ...LISTING,
    listingEvents: [{ event_type: 'listing_created' }, { event_type: 'price_changed' }],
  });
  assert.strictEqual(report.marketIntelligence.propertySpecificDemand.state, 'notAssessed');
  assert.strictEqual(report.marketIntelligence.propertySpecificTenantDemand.state, 'notAssessed');
  assert.strictEqual(report.scores?.componentDetail?.demand?.available, false);
});

asyncTest('lifecycle evidence does not alter numeric analysis', async () => {
  const base = { ...LISTING };
  const withLifecycle = {
    ...LISTING,
    listingEvents: [
      { event_type: 'listing_created' },
      { event_type: 'first_published' },
      { event_type: 'price_changed' },
    ],
  };
  const a = await runCanonical(base);
  const b = await runCanonical(withLifecycle);
  assert.deepStrictEqual(coreFacts(a.report), coreFacts(b.report));
  const engineSrc = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'propertyIntelligenceEngine.js'),
    'utf8'
  );
  assert.ok(!/listingLifecycleService/.test(engineSrc));
});

asyncTest('confidence remains separate from data quality and scores', async () => {
  const { report } = await runCanonical(LISTING);
  assert.ok(report.confidence);
  assert.ok(report.dataQuality);
  assert.notStrictEqual(report.confidence, report.dataQuality);
  assert.ok(report.scores);
  assert.strictEqual(report.overallScore, undefined);
});

asyncTest('listing evidence outranks weaker external evidence', async () => {
  const { report } = await runCanonical(
    { ...LISTING, property_type: 'Terraced', year_built: 1998, epc_rating: 'C' },
    {
      externalEnrichment: {
        available: true,
        identity: { uprn: '1000123' },
        enrichments: {
          uprn_profile: {
            success: true,
            data: {
              property_type: 'Flat',
              year_built: 1914,
              epc_rating: 'G',
            },
          },
        },
      },
    }
  );
  assert.strictEqual(report.property.property_type, 'Terraced');
  assert.strictEqual(report.property.year_built, 1998);
  assert.strictEqual(report.property.epc_rating, 'C');
  assert.strictEqual(report.property.propertyDataEvidence.fields.property_type.source, 'InternalListing');
});

asyncTest('unknown PropertyData type remains omitted and is not sent as flat', async () => {
  assert.strictEqual(mapToPropertyDataType('office'), null);
  const { property, evidence } = applyPropertyDataEvidence(
    { id: 3, title: 'Office', property_type: 'office' },
    { enrichments: { uprn_profile: { success: true, data: {} } }, identity: {} }
  );
  assert.strictEqual(property.property_type, 'office');
  assert.notStrictEqual(property.property_type, 'flat');
  assert.strictEqual(evidence.fields.property_type.value, 'office');
  const { report } = await runCanonical({ ...LISTING, property_type: 'office' });
  assert.strictEqual(report.property.property_type, 'office');
});

asyncTest('unknown build year remains omitted', async () => {
  const { report } = await runCanonical(
    { ...LISTING, year_built: null },
    {
      externalEnrichment: {
        available: true,
        enrichments: { uprn_profile: { success: true, data: {} } },
        identity: {},
      },
    }
  );
  assert.strictEqual(report.property.year_built, null);
});

asyncTest('missing valuation bounds remain null', async () => {
  const { report } = await runCanonical(LISTING, {
    depOverrides: {
      calculatePropertyValuation: async () => ({
        success: true,
        centralEstimate: { value: 200000 },
        lowerEstimate: {
          value: null,
          available: false,
          state: 'notAssessed',
        },
        upperEstimate: {
          value: null,
          available: false,
          state: 'notAssessed',
        },
        boundsAvailable: false,
        components: [{ method: 'internal_sale_comparables', centralEstimate: 200000 }],
        internalComparables: [],
      }),
    },
  });
  assert.strictEqual(report.marketIntelligence.sale.lowerEstimate.value, null);
  assert.strictEqual(report.marketIntelligence.sale.lowerEstimate.state, 'notAssessed');
  assert.strictEqual(report.marketIntelligence.sale.upperEstimate.value, null);
  assert.strictEqual(report.marketIntelligence.sale.boundsAvailable, false);
});

asyncTest('missing finance remains unavailable', async () => {
  const { report } = await runCanonical(LISTING);
  assert.strictEqual(report.investment.scenarios.available, false);
  assert.strictEqual(report.investment.scenarios.state, 'notAssessed');
  assert.strictEqual(report.investment.sensitivity.state, 'notAssessed');
});

asyncTest('LLM is not needed for numeric analysis', async () => {
  const { report, calls } = await runCanonical(LISTING);
  assert.strictEqual(calls.explain, 0);
  assert.strictEqual(report.explanation.source, 'template');
  assert.strictEqual(evidencedValue(report.investment.presented.grossYield), 6);
  assert.ok(report.explanation.tokensUsed === 0);
});

asyncTest('repeated canonical input produces identical deterministic output', async () => {
  const first = await runCanonical(LISTING);
  const second = await runCanonical(LISTING);
  assert.deepStrictEqual(coreFacts(first.report), coreFacts(second.report));
  assert.strictEqual(first.report.analysisDate, ASOF);
  assert.strictEqual(second.report.evidenceAsOf, ASOF);
  assert.deepStrictEqual(first.report.explanation, second.report.explanation);
  assert.deepStrictEqual(first.report.investment.presented, second.report.investment.presented);
});

asyncTest('overview/lightweight output cannot conflict with canonical core facts', async () => {
  const { report } = await runCanonical(LISTING, {
    depOverrides: {
      analyseRent: async () => ({
        success: true,
        recommendedRent: 1200,
        marketRange: { low: 1100, high: 1300 },
        underRented: true,
        comparables: [{ id: 1, similarity: 0.8 }, { id: 2, similarity: 0.7 }],
        potentialAnnualUplift: { low: 2400, high: 3600 },
        confidence: 62,
        dataQuality: { level: 'Medium' },
      }),
    },
  });
  const overview = projectPropertyOverview(LISTING, {
    canonicalReport: { id: 88, output_data: report },
  });
  assert.strictEqual(overview.analysisMode, 'lightweight');
  assert.strictEqual(overview.coreFactsSource, 'canonical_snapshot');
  const rentOpp = overview.opportunities.find((o) => o.id === 'rent-below-market');
  assert.ok(rentOpp, 'lightweight must project canonical under-rented, not recalculate rent');
  const yieldOpp = overview.opportunities.find((o) => o.id === 'strong-yield');
  assert.ok(yieldOpp.reason.includes('6'));
  const withoutSnapshot = projectPropertyOverview(LISTING);
  assert.strictEqual(withoutSnapshot.coreFactsSource, 'listing_evidence');
  assert.ok(
    !withoutSnapshot.opportunities.some((o) => o.id === 'rent-below-market'),
    'lightweight must not invent rent-below-market without a canonical snapshot'
  );
  const facts = extractCanonicalCoreFacts({ output_data: report });
  assert.strictEqual(facts.grossYield, 6);
  assert.strictEqual(facts.underRented, true);
  assert.strictEqual(facts.valuation, null);
});

asyncTest('provider calls are not duplicated inside canonical assemble', async () => {
  const providerCallLog = [];
  const { calls } = await runCanonical(LISTING, {
    providerCallLog,
    skipPostcodeMarket: true,
    depOverrides: {
      analyseRent: async () => ({ success: false, comparables: [] }),
      calculatePropertyValuation: async () => ({ success: false }),
    },
  });
  assert.strictEqual(calls.valuation, 1);
  assert.strictEqual(calls.rent, 1);
  assert.strictEqual(calls.postcode, 0);
  assert.strictEqual(providerCallLog.filter((n) => n === 'valuation').length, 1);
  assert.strictEqual(providerCallLog.filter((n) => n === 'rent').length, 1);
  assert.ok(!providerCallLog.includes('postcode_market'));
});

asyncTest('identity boundary keeps listing id distinct from UPRN/subject', async () => {
  const property = {
    ...LISTING,
    subjectId: 99,
    uprn: '100012345678',
    source: 'linked_marketplace_listing',
  };
  const { report } = await runCanonical(property, {
    access: {
      ...ownerAccess(property),
      propertyId: 7,
      linkedPropertyId: 7,
      subjectId: 99,
      uprn: '100012345678',
    },
    target: { subjectId: 99, propertyId: 7 },
  });
  assert.strictEqual(report.identity.listingId, 7);
  assert.strictEqual(report.identity.subjectId, 99);
  assert.strictEqual(report.identity.uprn, '100012345678');
  assert.strictEqual(report.identity.listingIdIsNotUprn, true);
  assert.strictEqual(report.property.listingId, 7);
  assert.notStrictEqual(String(report.identity.listingId), String(report.identity.uprn));
});

asyncTest('canonical PI output remains compatible with personal decision engines', async () => {
  const { report } = await runCanonical({
    ...LISTING,
    price: 380000,
    monthly_rent: 1200,
    bedrooms: 3,
    property_type: 'Terraced',
    has_garden: true,
    description: 'Family home with garden.',
    zip_code: 'M1 1AA',
    city: 'Manchester',
  });

  const buyer = scorePersonalDecision({
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
    intelligence: report,
    asOf: '2026-06-01T00:00:00.000Z',
  });
  assert.strictEqual(buyer.available, true);
  assert.ok(Number.isFinite(buyer.score));

  const landlord = scorePersonalDecision({
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
    intelligence: report,
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
  assert.strictEqual(landlord.available, true);
  assert.strictEqual(landlord.dimensions.demand.state, 'no_demand_data_source');
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
  console.log('\nAll canonical intelligence path tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
