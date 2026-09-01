/**
 * Canonical analyse enrichment reuse — paid PropertyData execution counts.
 * Does not change valuation, credits, quota limits, outcomes, or backtest.
 * Run: node server/tests/analyseEnrichmentReuse.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  enrichPropertyForIntelligence,
  resolvePropertyIdentity,
  reusedUprnProfileFromSubject,
} = require('../services/enrichment/propertyEnrichmentService');
const {
  lookupPropertyIntelligence,
  resolveExternalSubject,
  enrichSubjectForIntelligence,
} = require('../services/ai/externalPropertyLookupService');
const { hasReusableUprnProfile } = require('../services/providers/cache/providerCostProtection');
const { normalizeIdentitySearchAddress } = require('../utils/ukAddress');
const { ASSESSMENT_SAFETY_VERSION } = require('../services/ai/valuationAssessmentSafety');
const { CANONICAL_ENGINE_VERSION } = require('../services/ai/propertyIntelligenceEngine');
const { CONFIDENCE_MODEL } = require('../services/ai/confidenceEngine');
const { propertyIntelligenceConfig } = require('../config/propertyIntelligence.config');
const { OUTCOME_TRUST, SAMPLE_SUFFICIENCY } = require('../services/ai/backtesting/constants');
const { deriveSaleOutcomeState, SALE_OUTCOME_STATE } = require('../services/ai/listingOutcomeService');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`Use asyncTest for ${name}`);
  }
  console.log(`✓ ${name}`);
}

async function asyncTest(name, fn) {
  await fn();
  console.log(`✓ ${name}`);
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const FRESH_AT = '2026-08-29T10:00:00.000Z';
const UPRN_A = '100012345';
const UPRN_B = '200098765';

function listing(overrides = {}) {
  return {
    id: 7,
    user_id: 1,
    category: 'sale',
    status: 'approved',
    title: '12 High Street',
    house_number: '12',
    street_name: 'High Street',
    city: 'Birmingham',
    zip_code: 'B1 2UJ',
    address_line1: '12 High Street',
    property_type: 'Terraced',
    bedrooms: 2,
    bathrooms: 1,
    square_feet: 700,
    price: 250000,
    ...overrides,
  };
}

function freshSubject(overrides = {}) {
  return {
    id: 55,
    uprn: UPRN_A,
    property_id: 7,
    normalized_address: '12 High Street, B1 2UJ',
    postcode: 'B1 2UJ',
    provider: 'PropertyData',
    match_confidence: 'high',
    updated_at: FRESH_AT,
    created_at: FRESH_AT,
    profile_snapshot: {
      uprn: UPRN_A,
      bedrooms: 2,
      internal_area: 700,
      retrieved_marker: 'original-resolve',
    },
    ...overrides,
  };
}

function countingProvider() {
  const calls = {};
  const bump = (endpoint) => {
    calls[endpoint] = (calls[endpoint] || 0) + 1;
  };
  return {
    calls,
    isAvailable: () => true,
    resolveIdentity: async () => {
      bump('address-match-uprn');
      return {
        success: true,
        uprn: UPRN_A,
        address: '12 High Street, B1 2UJ',
        matchConfidence: 'high',
        matchMethod: 'propertydata_address_match',
        provider: 'propertydata',
      };
    },
    getUprnProfile: async (uprn) => {
      bump('uprn');
      return {
        success: true,
        profile: { uprn: String(uprn), bedrooms: 2, internal_area: 700 },
        provenance: { source: 'PropertyData', retrievedAt: FRESH_AT },
        cacheHit: false,
        creditsUsed: 10,
      };
    },
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

function memoryEnrichmentStore() {
  const identities = new Map();
  const enrichments = new Map();
  const subjects = new Map();
  const key = (...parts) => parts.join(':');
  return {
    identities,
    enrichments,
    subjects,
    seedSubject(subject) {
      subjects.set(String(subject.id), { ...subject });
      if (subject.uprn) subjects.set(`uprn:${subject.uprn}`, subject.id);
      if (subject.property_id) subjects.set(`property:${subject.property_id}`, subject.id);
    },
    async findIdentityByPropertyId(id) {
      const row = identities.get(Number(id));
      return row ? { ...row } : null;
    },
    async upsertIdentity(row) {
      const next = { ...identities.get(Number(row.propertyId)), ...row, id: row.propertyId };
      identities.set(Number(row.propertyId), next);
      return { ...next };
    },
    async findEnrichment(propertyId, type) {
      return enrichments.get(key('p', propertyId, type)) || null;
    },
    async upsertEnrichment(row) {
      const stored = {
        payload: row.payload,
        provenance: row.provenance,
        expires_at: row.expiresAt,
      };
      enrichments.set(key('p', row.propertyId, row.enrichmentType), stored);
      return stored;
    },
    async findEnrichmentBySubject(subjectId, type) {
      return enrichments.get(key('s', subjectId, type)) || null;
    },
    async upsertSubjectEnrichment(row) {
      const stored = {
        payload: row.payload,
        provenance: row.provenance,
        expires_at: row.expiresAt,
      };
      enrichments.set(key('s', row.subjectId, row.enrichmentType), stored);
      return stored;
    },
    async findSubjectById(id) {
      const row = subjects.get(String(id));
      return row ? { ...row } : null;
    },
    async findSubjectByUprn(uprn) {
      const id = subjects.get(`uprn:${uprn}`);
      return id ? { ...subjects.get(String(id)) } : null;
    },
    async findSubjectByPropertyId(propertyId) {
      const id = subjects.get(`property:${propertyId}`);
      return id ? { ...subjects.get(String(id)) } : null;
    },
  };
}

function listingDeps(store, provider, extra = {}) {
  return {
    isExternalEnrichmentAvailable: () => true,
    getProviderRegistry: () => ({
      getPrimaryMarketDataProvider: () => provider,
      getPrimaryIdentityProvider: () => provider,
      getAvailableProviders: () => ['PropertyData'],
    }),
    marketProvider: provider,
    identityProvider: provider,
    findIdentityByPropertyId: (id) => store.findIdentityByPropertyId(id),
    upsertIdentity: (row) => store.upsertIdentity(row),
    findEnrichment: (id, type) => store.findEnrichment(id, type),
    upsertEnrichment: (row) => store.upsertEnrichment(row),
    findSubjectById: (id) => store.findSubjectById(id),
    findSubjectByUprn: (uprn) => store.findSubjectByUprn(uprn),
    findSubjectByPropertyId: (id) => store.findSubjectByPropertyId(id),
    ...extra,
  };
}

async function run() {
  await asyncTest('1. direct listing analyse still works and pays identity + uprn when unknown', async () => {
    const store = memoryEnrichmentStore();
    const provider = countingProvider();
    const result = await enrichPropertyForIntelligence(listing(), {
      userId: 1,
      deps: listingDeps(store, provider),
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.identity.uprn, UPRN_A);
    assert.strictEqual(provider.calls['address-match-uprn'], 1);
    assert.strictEqual(provider.calls.uprn, 1);
    assert.ok(provider.calls['valuation-sale'] >= 1);
  });

  await asyncTest('2–4. lookup → resolve → listing analyse reuses UPRN and fresh subject profile', async () => {
    const store = memoryEnrichmentStore();
    const provider = countingProvider();
    const subject = freshSubject();
    store.seedSubject(subject);

    const lookup = await lookupPropertyIntelligence('12 High Street, B1 2UJ', 1, {
      searchUserProperties: async () => [],
      searchPublicPropertiesForIntelligence: async () => [],
      getPostcodeMarketIntelligence: async () => ({ success: false }),
      isPropertyDataConfigured: () => true,
      checkExpensiveProviderQuota: async () => ({ allowed: true }),
      resolveIdentity: provider.resolveIdentity,
    });
    assert.strictEqual(lookup.success, true);
    assert.strictEqual(provider.calls['address-match-uprn'], 1);

    const resolved = await resolveExternalSubject({
      uprn: UPRN_A,
      address: '12 High Street, B1 2UJ',
      userId: 1,
      deps: {
        findSubjectByUprn: () => store.findSubjectByUprn(UPRN_A),
        getUprnProfile: provider.getUprnProfile,
        linkSubjectToMarketplaceListing: async () => ({ linked: true, listing: { id: 7 } }),
        upsertSubject: async () => subject,
        recordSubjectLookup: async () => {},
        checkExpensiveProviderQuota: async () => ({ allowed: true }),
      },
    });
    assert.strictEqual(resolved.providerExecution, 'reused_subject');
    assert.strictEqual(provider.calls.uprn, undefined);

    const analysed = await enrichPropertyForIntelligence(listing(), {
      userId: 1,
      subjectId: subject.id,
      uprn: UPRN_A,
      deps: listingDeps(store, provider),
    });
    assert.strictEqual(analysed.identity.uprn, UPRN_A);
    assert.strictEqual(analysed.enrichments.uprn_profile.fromSubject, true);
    assert.strictEqual(analysed.enrichments.uprn_profile.provenance.retrievedAt, new Date(FRESH_AT).toISOString());
    assert.strictEqual(analysed.enrichments.uprn_profile.data.retrieved_marker, 'original-resolve');
    assert.strictEqual(provider.calls['address-match-uprn'], 1);
    assert.strictEqual(provider.calls.uprn, undefined);
  });

  await asyncTest('5. repeated listing analyse does not re-pay identity or uprn while snapshot is fresh', async () => {
    const store = memoryEnrichmentStore();
    const provider = countingProvider();
    store.seedSubject(freshSubject());
    await store.upsertIdentity({
      propertyId: 7,
      uprn: UPRN_A,
      match_confidence: 'high',
      normalizedAddress: '12 High Street, B1 2UJ',
    });
    const first = await enrichPropertyForIntelligence(listing(), {
      userId: 1,
      deps: listingDeps(store, provider),
    });
    const second = await enrichPropertyForIntelligence(listing(), {
      userId: 1,
      deps: listingDeps(store, provider),
    });
    assert.strictEqual(first.enrichments.uprn_profile.fromSubject, true);
    assert.strictEqual(second.enrichments.uprn_profile.fromSubject, true);
    assert.strictEqual(provider.calls['address-match-uprn'], undefined);
    assert.strictEqual(provider.calls.uprn, undefined);
  });

  await asyncTest('6. same UPRN with differently formatted address reuses subject identity', async () => {
    assert.strictEqual(
      normalizeIdentitySearchAddress('12 High Street, b12uj'),
      normalizeIdentitySearchAddress('12 HIGH STREET, B1 2UJ')
    );
    const store = memoryEnrichmentStore();
    const provider = countingProvider();
    store.seedSubject(freshSubject());
    const result = await enrichPropertyForIntelligence(
      listing({ address_line1: '12 HIGH STREET', zip_code: 'b12uj' }),
      { userId: 1, uprn: UPRN_A, deps: listingDeps(store, provider) }
    );
    assert.strictEqual(result.identity.uprn, UPRN_A);
    assert.strictEqual(provider.calls['address-match-uprn'], undefined);
    assert.strictEqual(provider.calls.uprn, undefined);
  });

  await asyncTest('7. different UPRNs do not collide', async () => {
    const store = memoryEnrichmentStore();
    const provider = countingProvider();
    store.seedSubject(freshSubject());
    store.seedSubject(
      freshSubject({
        id: 56,
        uprn: UPRN_B,
        property_id: 8,
        profile_snapshot: { uprn: UPRN_B, bedrooms: 2, internal_area: 700 },
      })
    );
    const a = await enrichPropertyForIntelligence(listing({ id: 7 }), {
      userId: 1,
      uprn: UPRN_A,
      deps: listingDeps(store, provider),
    });
    const b = await enrichPropertyForIntelligence(listing({ id: 8 }), {
      userId: 1,
      uprn: UPRN_B,
      deps: listingDeps(store, provider),
    });
    assert.strictEqual(a.identity.uprn, UPRN_A);
    assert.strictEqual(b.identity.uprn, UPRN_B);
    assert.notStrictEqual(a.enrichments.uprn_profile.data.uprn, b.enrichments.uprn_profile.data.uprn);
  });

  await asyncTest('8–9. expired identity/profile refreshes paid uprn, not address-match when UPRN known', async () => {
    const store = memoryEnrichmentStore();
    const provider = countingProvider();
    store.seedSubject(
      freshSubject({
        updated_at: '2020-01-01T00:00:00.000Z',
        created_at: '2020-01-01T00:00:00.000Z',
      })
    );
    assert.strictEqual(hasReusableUprnProfile(await store.findSubjectByUprn(UPRN_A)), false);
    const result = await enrichPropertyForIntelligence(listing(), {
      userId: 1,
      uprn: UPRN_A,
      deps: listingDeps(store, provider),
    });
    assert.strictEqual(provider.calls['address-match-uprn'], undefined);
    assert.strictEqual(provider.calls.uprn, 1);
    assert.strictEqual(result.enrichments.uprn_profile.fromSubject, undefined);
  });

  await asyncTest('10. fresh subject read does not refresh TTL / updated_at', async () => {
    const store = memoryEnrichmentStore();
    const provider = countingProvider();
    const subject = freshSubject();
    store.seedSubject(subject);
    await enrichPropertyForIntelligence(listing(), {
      userId: 1,
      subjectId: subject.id,
      deps: listingDeps(store, provider),
    });
    const again = await store.findSubjectById(subject.id);
    assert.strictEqual(again.updated_at, FRESH_AT);
  });

  test('11–12. reused evidence preserves retrievedAt, source, and endpoint', () => {
    const reused = reusedUprnProfileFromSubject(freshSubject());
    assert.strictEqual(reused.provenance.source, 'PropertyData');
    assert.strictEqual(reused.provenance.providerEndpoint, '/uprn');
    assert.strictEqual(reused.provenance.retrievedAt, new Date(FRESH_AT).toISOString());
    assert.ok(/Not newly retrieved/.test(reused.provenance.notes));
    assert.strictEqual(reused.data.retrieved_marker, 'original-resolve');
  });

  test('13. cache-hit path in adapter does not treat reuse as a new retrieval timestamp source', () => {
    const src = read('services/providers/propertyData/PropertyDataAdapter.js');
    assert.ok(/cacheEnvelope/.test(src));
    assert.ok(/envelope && coalesced.result.retrievedAt/.test(src));
  });

  test('14–16. analyse credits, slot, and consumeCredit wiring are unchanged', () => {
    const persist = read('services/ai/propertyIntelligenceProduction.js');
    const guard = read('services/ai/propertyIntelligenceAnalyseGuard.js');
    const routes = read('routes/aiRoutes.js');
    assert.ok(/const amount = creditsUsed \|\| 1/.test(persist));
    assert.ok(/AiSubscription\.consumeCredit\(userId, amount\)/.test(persist));
    assert.ok(/requireIntelligenceAnalyseSlot/.test(guard) || /ANALYSIS_IN_PROGRESS/.test(guard));
    assert.ok(/requireCredits/.test(routes));
    assert.ok(/requireIntelligenceAnalyseSlot/.test(routes));
  });

  test('17. provider quota defaults are unchanged', () => {
    assert.strictEqual(propertyIntelligenceConfig.providerProtection.maxPaidExecutionsPerUserHour, 40);
    assert.deepStrictEqual(propertyIntelligenceConfig.providerProtection.expensiveEndpoints, [
      'address-match-uprn',
      'uprn',
    ]);
  });

  await asyncTest('18. concurrent listing enrich with known UPRN does not fan out identity/uprn', async () => {
    const store = memoryEnrichmentStore();
    const provider = countingProvider();
    store.seedSubject(freshSubject());
    const deps = listingDeps(store, provider);
    await Promise.all([
      enrichPropertyForIntelligence(listing(), { userId: 1, uprn: UPRN_A, deps }),
      enrichPropertyForIntelligence(listing(), { userId: 1, uprn: UPRN_A, deps }),
    ]);
    assert.strictEqual(provider.calls['address-match-uprn'], undefined);
    assert.strictEqual(provider.calls.uprn, undefined);
  });

  await asyncTest('19–21. subject analyse reuses snapshot; listing and subject converge on same UPRN', async () => {
    const store = memoryEnrichmentStore();
    const provider = countingProvider();
    const subject = freshSubject();
    store.seedSubject(subject);
    const subjectResult = await enrichSubjectForIntelligence(
      subject,
      listing({ id: null, subjectId: 55, uprn: UPRN_A, zip_code: 'B1 2UJ' }),
      1,
      {
        marketProvider: provider,
        findEnrichmentBySubject: (id, type) => store.findEnrichmentBySubject(id, type),
        upsertSubjectEnrichment: (row) => store.upsertSubjectEnrichment(row),
      }
    );
    const listingResult = await enrichPropertyForIntelligence(listing(), {
      userId: 1,
      uprn: UPRN_A,
      subjectId: 55,
      deps: listingDeps(store, provider),
    });
    assert.strictEqual(subjectResult.identity.uprn, listingResult.identity.uprn);
    assert.strictEqual(subjectResult.enrichments.uprn_profile.fromSubject, true);
    assert.strictEqual(listingResult.enrichments.uprn_profile.fromSubject, true);
    assert.strictEqual(provider.calls.uprn, undefined);
    assert.strictEqual(provider.calls['address-match-uprn'], undefined);
  });

  await asyncTest('subject analyse refreshes expired profile via provider', async () => {
    const store = memoryEnrichmentStore();
    const provider = countingProvider();
    const stale = freshSubject({
      updated_at: '2020-01-01T00:00:00.000Z',
      created_at: '2020-01-01T00:00:00.000Z',
    });
    const result = await enrichSubjectForIntelligence(
      stale,
      listing({ id: null, uprn: UPRN_A, zip_code: 'B1 2UJ', square_feet: 700 }),
      1,
      {
        marketProvider: provider,
        findEnrichmentBySubject: (id, type) => store.findEnrichmentBySubject(id, type),
        upsertSubjectEnrichment: (row) => store.upsertSubjectEnrichment(row),
      }
    );
    assert.strictEqual(provider.calls.uprn, 1);
    assert.ok(result.enrichments.uprn_profile);
    assert.notStrictEqual(result.enrichments.uprn_profile.fromSubject, true);
  });

  test('22–30. valuation safety, confidence, engine version, and history mapping stay frozen', () => {
    assert.strictEqual(ASSESSMENT_SAFETY_VERSION, 'assessment-safety-1.0.0');
    assert.ok(CANONICAL_ENGINE_VERSION);
    assert.strictEqual(CONFIDENCE_MODEL.baseVersion, 'confidence-1.1.0');
    const enrichSrc = read('services/enrichment/propertyEnrichmentService.js');
    assert.ok(!/scorePersonalDecision/.test(enrichSrc));
    assert.ok(!/buildDecisionIntelligence/.test(enrichSrc));
    assert.ok(!/openai|anthropic|chat\.completions/i.test(enrichSrc));
    const history = read('models/AiRequest.js');
    assert.ok(/mapHistoryRow/.test(history));
  });

  test('31–33. outcome collection, completion, and backtest semantics unchanged', () => {
    assert.strictEqual(OUTCOME_TRUST.userReported, 'USER_REPORTED');
    assert.strictEqual(SAMPLE_SUFFICIENCY.noData, 'NO_DATA');
    assert.strictEqual(
      deriveSaleOutcomeState({ status: 'sold', sold_at: '2026-07-01T00:00:00.000Z' }),
      SALE_OUTCOME_STATE.INCOMPLETE_SALE_OUTCOME
    );
    const outcomeSrc = read('services/ai/listingOutcomeService.js');
    assert.ok(/sale_outcome_completed/.test(outcomeSrc));
    assert.ok(/completionOfIncompleteOutcome/.test(outcomeSrc));
  });

  test('34–35. no LLM and no new provider added', () => {
    const enrichSrc = read('services/enrichment/propertyEnrichmentService.js');
    const adapterSrc = read('services/providers/propertyData/PropertyDataAdapter.js');
    assert.ok(!/openai|anthropic|sprift|hometrack/i.test(enrichSrc));
    assert.ok(/propertydata/.test(adapterSrc));
    assert.ok(!/new PropertyDataAdapter|Sprift|Hometrack/.test(enrichSrc));
  });

  await asyncTest('resolvePropertyIdentity skips provider when canonical UPRN is already known', async () => {
    const store = memoryEnrichmentStore();
    const provider = countingProvider();
    store.seedSubject(freshSubject());
    const resolved = await resolvePropertyIdentity(listing({ uprn: UPRN_A }), {
      userId: 1,
      deps: listingDeps(store, provider),
    });
    assert.strictEqual(resolved.identity.uprn, UPRN_A);
    assert.strictEqual(resolved.externalResolution, false);
    assert.strictEqual(provider.calls['address-match-uprn'], undefined);
  });

  console.log('\nanalyseEnrichmentReuse.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
