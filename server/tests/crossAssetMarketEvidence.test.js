/**
 * Cross-asset market evidence + acquisition safety.
 * Run: node server/tests/crossAssetMarketEvidence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { ASSET_CLASS, DOMAIN_ID, EVIDENCE_CLASS, SOURCE_TYPE } = require('../architecture');
const { residentialMethodologyGate } = require('../services/identity/assetClassificationRuntime');
const {
  resolveMarketAcquisitionPolicy,
  MARKET_ACQUISITION_VERSION,
} = require('../services/identity/marketAcquisitionPolicy');
const { adaptMarketDomain, attachMarketDomain } = require('../services/domains/marketDomain');
const { enrichPropertyForIntelligence } = require('../services/enrichment/propertyEnrichmentService');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { historicalReportIsReadable } = require('../architecture/domainEnvelope');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

function test(name, fn) {
  fn();
  console.log(`  ok  ${name}`);
}

const pending = [];
function asyncTest(name, fn) {
  pending.push({ name, fn });
}

function listing(overrides = {}) {
  return {
    id: 1,
    title: 'Subject property',
    category: 'sale',
    property_type: 'terraced',
    price: 250000,
    monthly_rent: 1100,
    city: 'Birmingham',
    zip_code: 'B1 2UJ',
    bedrooms: 2,
    bathrooms: 1,
    square_feet: 700,
    ...overrides,
  };
}

function declared(cls) {
  return {
    assetClass: cls,
    state: 'DECLARED',
    provenance: { source: 'UserDeclaration', sourceType: 'FIRST_PARTY' },
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
    calculatePropertyValuation: async () => ({
      success: true,
      centralEstimate: 195000,
      assessmentState: 'assessed',
      internalComparables: [{ id: 'c1' }],
    }),
    analyseRent: async () => ({
      success: true,
      recommendedRent: 1100,
      currentRent: 1100,
      marketRange: { low: 1000, high: 1200 },
      confidence: 50,
      comparables: [{ id: 'r1', similarity: 0.8 }],
    }),
    getPostcodeMarketIntelligence: async () => ({ success: false }),
    generatePropertyExplanation: async () => ({ summary: 'template', source: 'template', tokensUsed: 0 }),
    getFloodEvidence: async () => ({ available: false, state: 'notAssessed' }),
    getPlanningEvidence: async () => ({ available: false, state: 'notAssessed' }),
    getSchoolEvidence: async () => ({ available: false, state: 'notAssessed' }),
    getListedBuildingEvidence: async () => ({ available: false, state: 'notAssessed' }),
    getConservationAreaEvidence: async () => ({ available: false, state: 'notAssessed' }),
    getArticle4Evidence: async () => ({ available: false, state: 'notAssessed' }),
  };
}

async function analyse(propertyOverrides = {}, options = {}) {
  return assemblePropertyIntelligenceReport({
    property: listing(propertyOverrides),
    access: access(),
    target: { propertyId: 1 },
    userId: 1,
    options: {
      skipExplanation: true,
      skipPostcodeMarket: true,
      skipPlanning: true,
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      skipFlood: true,
      skipOfficialSales: true,
      asOf: '2026-08-31T00:00:00.000Z',
      deps: deps(),
      ...options,
    },
  });
}

function countingProvider() {
  const calls = {};
  const bump = (endpoint) => {
    calls[endpoint] = (calls[endpoint] || 0) + 1;
  };
  return {
    calls,
    isAvailable: () => true,
    getSoldPrices: async () => {
      bump('sold-prices');
      return { success: true, data: { sold: [] }, creditsUsed: 1 };
    },
    getSoldPricesPerSqf: async () => {
      bump('sold-prices-per-sqf');
      return { success: true, data: { sold: [] }, creditsUsed: 1 };
    },
    getRents: async () => {
      bump('rents');
      return { success: true, data: { rents: [] }, creditsUsed: 1 };
    },
    getDemand: async () => {
      bump('demand');
      return { success: true, data: { demand: 1 }, creditsUsed: 1 };
    },
    getDemandRent: async () => {
      bump('demand-rent');
      return { success: true, data: { demand: 1 }, creditsUsed: 1 };
    },
    getSaleValuation: async () => {
      bump('valuation-sale');
      return { success: true, valuation: { estimate: 240000 }, creditsUsed: 1 };
    },
  };
}

function memoryDeps(provider) {
  const enrichments = new Map();
  const identities = new Map();
  return {
    isExternalEnrichmentAvailable: () => true,
    getProviderRegistry: () => ({
      getPrimaryMarketDataProvider: () => provider,
      getPrimaryIdentityProvider: () => ({ isAvailable: () => false }),
      getAvailableProviders: () => ['PropertyData'],
    }),
    marketProvider: provider,
    findIdentityByPropertyId: async (id) => {
      if (!identities.has(Number(id))) {
        identities.set(Number(id), {
          id,
          propertyId: id,
          uprn: null,
          postcode: 'B12UJ',
          match_confidence: 'low',
          provider: 'InternalListing',
        });
      }
      return identities.get(Number(id));
    },
    upsertIdentity: async (row) => {
      const next = { ...row, id: row.propertyId };
      identities.set(Number(row.propertyId), next);
      return next;
    },
    findEnrichment: async (propertyId, type) => enrichments.get(`${propertyId}:${type}`) || null,
    upsertEnrichment: async (row) => {
      enrichments.set(`${row.propertyId}:${row.enrichmentType}`, {
        payload: row.payload,
        provenance: row.provenance,
      });
      return row;
    },
    findSubjectById: async () => null,
    findSubjectByUprn: async () => null,
    findSubjectByPropertyId: async () => null,
  };
}

async function enrichWithClass(assetClass, extraProperty = {}) {
  const provider = countingProvider();
  const property = listing({
    assetClassification: declared(assetClass),
    ...extraProperty,
  });
  const acquisition = resolveMarketAcquisitionPolicy({
    classification: declared(assetClass),
    property,
  });
  const result = await enrichPropertyForIntelligence(property, {
    userId: 1,
    acquisition,
    classification: declared(assetClass),
    deps: memoryDeps(provider),
  });
  return { provider, result, acquisition };
}

const GATED = [
  ASSET_CLASS.COMMERCIAL,
  ASSET_CLASS.INDUSTRIAL,
  ASSET_CLASS.AGRICULTURAL,
  ASSET_CLASS.LAND,
  ASSET_CLASS.DEVELOPMENT_SITE,
  ASSET_CLASS.MIXED_USE,
];

console.log('cross-asset market evidence\n');

test('1. residential acquisition still fetches AVM and rents', () => {
  const policy = resolveMarketAcquisitionPolicy({
    classification: declared(ASSET_CLASS.RESIDENTIAL),
    property: listing(),
  });
  assert.strictEqual(policy.version, MARKET_ACQUISITION_VERSION);
  assert.strictEqual(policy.fetchSaleValuation, true);
  assert.strictEqual(policy.fetchRents, true);
  assert.strictEqual(policy.fetchDemandRent, true);
  assert.strictEqual(policy.skipResidentialAvm, false);
});

test('2-7. proven non-residential classes skip residential AVM/rent', () => {
  GATED.forEach((cls) => {
    const policy = resolveMarketAcquisitionPolicy({
      classification: declared(cls),
      property: listing(),
    });
    assert.strictEqual(policy.fetchSaleValuation, false, cls);
    assert.strictEqual(policy.fetchRents, false, cls);
    assert.strictEqual(policy.fetchDemandRent, false, cls);
    assert.strictEqual(policy.fetchSoldPrices, true, cls);
    assert.strictEqual(residentialMethodologyGate(declared(cls)).allowed, false, cls);
  });
});

test('8. UNKNOWN remains legacy-residential eligible', () => {
  const policy = resolveMarketAcquisitionPolicy({
    classification: { assetClass: ASSET_CLASS.UNKNOWN },
    property: listing(),
  });
  assert.strictEqual(policy.fetchSaleValuation, true);
  assert.strictEqual(policy.methodologyGate.mode, 'LEGACY_RESIDENTIAL_COMPATIBILITY');
  assert.strictEqual(policy.methodologyGate.equivalentToResidentialClass, false);
});

test('9. analyse classifies and routes before enrich in source order', () => {
  const engine = read('../services/ai/propertyIntelligenceEngine.js');
  const policyIdx = engine.indexOf('resolveMarketAcquisitionPolicy');
  const enrichIdx = engine.indexOf('enrichPropertyForIntelligence(property');
  const classifyIdx = engine.indexOf('attachPersistedClassification(property, access, target)');
  assert.ok(classifyIdx > -1 && policyIdx > -1 && enrichIdx > policyIdx);
  assert.ok(classifyIdx < enrichIdx);
  assert.ok(engine.includes('skipResidentialRents: !methodologyGate.allowed'));
});

test('10. transaction evidence is not comparable evidence', () => {
  const adapted = adaptMarketDomain({
    property: listing({ last_sold_price: 200000, last_sold_date: '2022-01-01' }),
    identity: { listingId: 1 },
    assetClassification: declared(ASSET_CLASS.RESIDENTIAL),
    externalEnrichment: {
      enrichments: {
        sold_prices: {
          success: true,
          data: {
            raw_data: [{ price: 210000, address: 'Nearby', date: '2023-01-01' }],
            points: 1,
            average: 210000,
          },
          provenance: { retrievedAt: '2026-08-31T00:00:00.000Z' },
        },
      },
    },
    comparableCount: 1,
    saleComparableCount: 1,
    analysisAt: '2026-08-31T00:00:00.000Z',
  });
  const rentDemand = adaptMarketDomain({
    property: listing(),
    identity: { listingId: 1 },
    assetClassification: declared(ASSET_CLASS.RESIDENTIAL),
    externalEnrichment: {
      enrichments: {
        demand_rent: {
          success: true,
          data: { rental_demand_rating: 'high', total_for_rent: 8 },
        },
      },
    },
  }).envelope.evidence.find((row) => row.factType === 'areaRentalMarketActivity');
  assert.strictEqual(rentDemand.classification, EVIDENCE_CLASS.AREA_CONTEXT);
  assert.strictEqual(rentDemand.value.band, 'high');
  assert.strictEqual(adapted.envelope.assessment.transactionIsNotComparable, true);
  const tx = adapted.envelope.evidence.find((row) => row.factType === 'areaTransactionObservations');
  assert.strictEqual(tx.classification, EVIDENCE_CLASS.AREA_CONTEXT);
  assert.ok(!/comparable/i.test(tx.factType));
  assert.strictEqual(adapted.coverage.comparableCandidatesAreValuationComparables, true);
});

test('10b. area demand is AREA_CONTEXT and not a valuation input', () => {
  const adapted = adaptMarketDomain({
    property: listing(),
    identity: { listingId: 1 },
    assetClassification: declared(ASSET_CLASS.COMMERCIAL),
    externalEnrichment: {
      enrichments: {
        demand: {
          success: true,
          data: { demand_rating: 'balanced', total_for_sale: 12 },
          provenance: { retrievedAt: '2026-08-31T00:00:00.000Z' },
        },
        demand_rent: {
          success: true,
          data: { rental_demand_rating: 'high', total_for_rent: 4 },
        },
      },
    },
    analysisAt: '2026-08-31T00:00:00.000Z',
  });
  const saleDemand = adapted.envelope.evidence.find((row) => row.factType === 'areaSalesMarketActivity');
  const rentDemand = adapted.envelope.evidence.find((row) => row.factType === 'areaRentalMarketActivity');
  assert.strictEqual(saleDemand.classification, EVIDENCE_CLASS.AREA_CONTEXT);
  assert.strictEqual(saleDemand.value.band, 'balanced');
  assert.strictEqual(rentDemand, undefined);
  assert.strictEqual(adapted.coverage.areaSalesMarketActivityPresent, true);
  assert.strictEqual(adapted.coverage.areaRentalMarketActivityPresent, false);
  assert.strictEqual(adapted.envelope.assessment.specialisedValuation, 'NOT_ASSESSED');
});

test('11. area sold prices remain AREA_CONTEXT, not subject facts', () => {
  const adapted = adaptMarketDomain({
    property: listing(),
    identity: { listingId: 1 },
    assetClassification: declared(ASSET_CLASS.COMMERCIAL),
    externalEnrichment: {
      enrichments: {
        sold_prices: {
          success: true,
          data: { raw_data: [{ price: 400000, address: 'Unit nearby', date: '2024-01-01' }], average: 400000, points: 1 },
        },
      },
    },
    analysisAt: '2026-08-31T00:00:00.000Z',
  });
  const area = adapted.envelope.evidence.find((row) => row.factType === 'areaTransactionObservations');
  assert.strictEqual(area.classification, EVIDENCE_CLASS.AREA_CONTEXT);
  assert.strictEqual(adapted.envelope.assessment.areaContextIsNotSubjectFact, true);
  assert.strictEqual(adapted.coverage.classSpecificTransactionStatus, 'BLOCKED_BY_EVIDENCE');
  assert.strictEqual(adapted.coverage.comparableCandidateCount, null);
});

test('12. missing evidence is not zero', () => {
  const adapted = adaptMarketDomain({
    property: listing({ price: null }),
    identity: { listingId: 1 },
    assetClassification: declared(ASSET_CLASS.INDUSTRIAL),
    externalEnrichment: { enrichments: {} },
    analysisAt: '2026-08-31T00:00:00.000Z',
  });
  assert.strictEqual(adapted.envelope.assessment.missingIsNotZero, true);
  assert.strictEqual(adapted.coverage.transactionObservationCount, null);
  assert.strictEqual(adapted.coverage.listingAskingPricePresent, false);
  const asking = adapted.envelope.evidence.find((row) => row.factType === 'listingAskingPrice');
  assert.strictEqual(asking, undefined);
});

test('13. conflicting asking and last-sale observations are both preserved', () => {
  const adapted = adaptMarketDomain({
    property: listing({ price: 250000, last_sold_price: 180000, last_sold_date: '2019-05-01' }),
    identity: { listingId: 1 },
    assetClassification: declared(ASSET_CLASS.RESIDENTIAL),
    externalEnrichment: { enrichments: {} },
    analysisAt: '2026-08-31T00:00:00.000Z',
  });
  const asking = adapted.envelope.evidence.find((row) => row.factType === 'listingAskingPrice');
  const last = adapted.envelope.evidence.find((row) => row.factType === 'userReportedSubjectTransaction');
  assert.strictEqual(asking.value, 250000);
  assert.strictEqual(last.value, 180000);
  assert.strictEqual(last.sourceType, SOURCE_TYPE.USER_REPORTED);
  assert.ok(adapted.envelope.findings.some((row) => row.id === 'conflicting_price_observations_preserved'));
});

test('14. history renderer does not re-adapt Market', () => {
  const history = read('../../client/src/Utils/savedIntelligenceReport.js');
  const detail = read('../../client/src/pages/ai/AiHistoryDetail.js');
  assert.ok(!/attachMarketDomain|adaptMarketDomain|enrichPropertyForIntelligence/.test(history));
  assert.ok(!/attachMarketDomain|adaptMarketDomain/.test(detail));
  assert.strictEqual(historicalReportIsReadable({
    modelVersion: 'property-intelligence-v2',
    marketIntelligence: { sale: { success: true } },
  }), true);
});

test('15. What-if is not a Market source', () => {
  const src = read('../services/domains/marketDomain.js');
  assert.ok(!/whatIf|scenarioPurchasePrice|financeRequest/.test(src));
  const whatIf = read('../services/ai/intelligenceWhatIfService.js');
  assert.ok(!whatIf.includes('attachMarketDomain'));
});

test('16. provider failure does not fabricate transactions', () => {
  const adapted = adaptMarketDomain({
    property: listing(),
    identity: { listingId: 1 },
    assetClassification: declared(ASSET_CLASS.RESIDENTIAL),
    externalEnrichment: {
      enrichments: {
        sold_prices: { success: false, message: 'timeout' },
      },
    },
    analysisAt: '2026-08-31T00:00:00.000Z',
  });
  assert.strictEqual(adapted.coverage.transactionObservationCount, null);
  assert.ok(!adapted.envelope.evidence.some((row) => row.factType === 'areaTransactionObservations'));
  assert.ok(adapted.envelope.findings.some((row) => row.id === 'sold_price_source_failed'));
});

test('17. no new paid provider is introduced', () => {
  const policy = read('../services/identity/marketAcquisitionPolicy.js');
  const domain = read('../services/domains/marketDomain.js');
  assert.ok(!/axios|openai|anthropic|rightmove|zoopla|hmlr\.gov/i.test(policy));
  assert.ok(!/axios|openai|anthropic|rightmove|zoopla/i.test(domain));
});

asyncTest('18. residential assemble still values and rents', async () => {
  const report = await analyse({
    assetClassification: declared(ASSET_CLASS.RESIDENTIAL),
  });
  assert.strictEqual(report.marketIntelligence.sale.centralEstimate, 195000);
  assert.strictEqual(report.marketIntelligence.rent.recommendedRent, 1100);
  assert.strictEqual(report.marketDomain.domain, DOMAIN_ID.MARKET);
  assert.ok(report.domains.byId.MARKET);
  assert.strictEqual(report.personalDecision != null || report.decisionIntelligence != null, true);
});

GATED.forEach((cls) => {
  asyncTest(`19. ${cls} does not receive residential AVM/rent and has Market envelope`, async () => {
    const report = await analyse({
      assetClassification: declared(cls),
      property_type: cls.toLowerCase(),
    });
    assert.strictEqual(report.assetClassification.assetClass, cls);
    assert.strictEqual(report.marketIntelligence.sale.success, false);
    assert.strictEqual(report.marketIntelligence.sale.notAssessed, true);
    assert.notStrictEqual(report.marketIntelligence.sale.centralEstimate, 0);
    assert.ok(!report.marketIntelligence.rent.recommendedRent);
    assert.strictEqual(report.marketDomain.assessment.specialisedValuation, 'NOT_ASSESSED');
    assert.strictEqual(report.marketDomain.assessment.coverage.comparableCandidateCount, null);
    assert.ok(report.marketDomain.assessment.coverage.missingEvidenceTypes.includes('CLASS_SPECIFIC_TRANSACTIONS'));
  });
});

asyncTest('20. UNKNOWN stays safe and still runs residential compatibility', async () => {
  const report = await analyse({ property_type: 'unknown-dwelling' });
  assert.strictEqual(report.assetClassification.assetClass, ASSET_CLASS.UNKNOWN);
  assert.strictEqual(report.residentialMethodology.mode, 'LEGACY_RESIDENTIAL_COMPATIBILITY');
  assert.strictEqual(report.marketIntelligence.sale.centralEstimate, 195000);
});

asyncTest('21. gated enrich skips paid AVM/rent and still fetches sold prices', async () => {
  for (const cls of GATED) {
    const { provider, result } = await enrichWithClass(cls);
    assert.strictEqual(provider.calls['valuation-sale'], undefined, cls);
    assert.strictEqual(provider.calls.rents, undefined, cls);
    assert.strictEqual(provider.calls['demand-rent'], undefined, cls);
    assert.strictEqual(provider.calls.demand, 1, cls);
    assert.strictEqual(provider.calls['sold-prices'], 1, cls);
    assert.ok(!result.enrichments.valuation_sale, cls);
    assert.ok(!result.enrichments.rents, cls);
  }
});

asyncTest('21b. fetchDemand false skips the paid demand endpoint', async () => {
  const provider = countingProvider();
  const property = listing({ assetClassification: declared(ASSET_CLASS.RESIDENTIAL) });
  const acquisition = {
    ...resolveMarketAcquisitionPolicy({
      classification: declared(ASSET_CLASS.RESIDENTIAL),
      property,
    }),
    fetchDemand: false,
  };
  await enrichPropertyForIntelligence(property, {
    userId: 1,
    acquisition,
    classification: declared(ASSET_CLASS.RESIDENTIAL),
    deps: memoryDeps(provider),
  });
  assert.strictEqual(provider.calls.demand, undefined);
  assert.strictEqual(provider.calls.rents, 1);
});

asyncTest('22. residential enrich still requests AVM and rents', async () => {
  const { provider, result } = await enrichWithClass(ASSET_CLASS.RESIDENTIAL);
  assert.strictEqual(provider.calls['valuation-sale'], 1);
  assert.strictEqual(provider.calls.rents, 1);
  assert.strictEqual(provider.calls['demand-rent'], 1);
  assert.ok(result.enrichments.valuation_sale);
});

asyncTest('23. finance and decision isolation: Market does not zero missing finance', async () => {
  const report = await analyse({
    assetClassification: declared(ASSET_CLASS.COMMERCIAL),
    monthly_rent: null,
  });
  assert.ok(report.financeRequest);
  assert.notStrictEqual(report.investment?.presented?.grossYield?.value, 0);
  assert.ok(report.marketDomain.limitations.some((row) => /not a valuation/i.test(row)));
});

asyncTest('24. degraded attach still returns an envelope', async () => {
  const attached = attachMarketDomain({
    property: listing(),
    identity: { listingId: 1 },
    assetClassification: declared(ASSET_CLASS.LAND),
  });
  assert.strictEqual(attached.marketDomain.domain, DOMAIN_ID.MARKET);
});

(async () => {
  for (const item of pending) {
    await item.fn();
    console.log(`  ok  ${item.name}`);
  }
  console.log('\ncross-asset market evidence passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
