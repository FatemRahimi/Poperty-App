/**
 * Provider-cost protection for lookup/resolve.
 * Run: node server/tests/providerCostProtection.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  coalesceCachedProviderRequest,
  resetLocalProviderInflight,
} = require('../services/providers/cache/providerExecutionGuard');
const {
  classifyProviderFailure,
  hasReusableUprnProfile,
  checkExpensiveProviderQuota,
  lookupQueryInvalid,
  PROVIDER_LOOKUP_LIMIT,
  PROVIDER_TEMPORARILY_UNAVAILABLE,
  LOOKUP_QUERY_INVALID,
} = require('../services/providers/cache/providerCostProtection');
const {
  lookupPropertyIntelligence,
  resolveExternalSubject,
} = require('../services/ai/externalPropertyLookupService');
const { ASSESSMENT_SAFETY_VERSION } = require('../services/ai/valuationAssessmentSafety');
const { CANONICAL_ENGINE_VERSION } = require('../services/ai/propertyIntelligenceEngine');
const { mapHistoryRow, annotateStoredAnalysis } = require('../models/AiRequest');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then(
      () => console.log(`✓ ${name}`),
      (e) => {
        console.error(`✗ ${name}`);
        throw e;
      }
    );
  }
  console.log(`✓ ${name}`);
  return Promise.resolve();
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function memoryCache() {
  const store = new Map();
  return {
    store,
    async get(key) {
      const row = store.get(key);
      if (!row) return null;
      if (row.expiresAt && row.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return row.value;
    },
    async set(key, value, ttlMs = 60_000) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
  };
}

const dbOnlyLookupDeps = {
  searchUserProperties: async () => [],
  searchPublicPropertiesForIntelligence: async () => [],
  getPostcodeMarketIntelligence: async () => ({ success: false }),
  isPropertyDataConfigured: () => true,
  checkExpensiveProviderQuota: async () => ({ allowed: true }),
};

async function run() {
  resetLocalProviderInflight();

  await test('unauthenticated lookup is rejected by route auth', () => {
    const routes = read('routes/aiRoutes.js');
    assert.ok(/router\.get\('\/intelligence\/lookup', authenticateAI, lookupIntelligence\)/.test(routes));
    assert.ok(!/router\.get\('\/intelligence\/lookup', lookupIntelligence\)/.test(routes));
  });

  await test('short/invalid query is rejected before provider', async () => {
    const invalid = lookupQueryInvalid('ab');
    assert.strictEqual(invalid.code, LOOKUP_QUERY_INVALID);
    let resolveCalls = 0;
    const result = await lookupPropertyIntelligence('ab', 9, {
      ...dbOnlyLookupDeps,
      resolveIdentity: async () => {
        resolveCalls += 1;
        return { success: true, uprn: '1' };
      },
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(resolveCalls, 0);
  });

  await test('legitimate lookup works and does not consume analyse credits', async () => {
    const result = await lookupPropertyIntelligence('12 High Street, B1 2UJ', 9, {
      ...dbOnlyLookupDeps,
      resolveIdentity: async () => ({
        success: true,
        uprn: '1000123',
        address: '12 High Street, B1 2UJ',
        matchConfidence: 'high',
        alternativeMatches: [],
      }),
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.external.matches[0].uprn, '1000123');
    const lookupSrc = read('services/ai/externalPropertyLookupService.js');
    const routes = read('routes/aiRoutes.js');
    assert.ok(!lookupSrc.includes('consumeCredit'));
    assert.ok(!/lookup', authenticateAI, requireCredits/.test(routes));
  });

  await test('repeated identical lookup does not re-execute provider when cached', async () => {
    const cache = memoryCache();
    let executions = 0;
    const runOnce = () =>
      coalesceCachedProviderRequest({
        cacheKey: 'addr:12-high-st',
        useSharedLock: false,
        getCached: (key) => cache.get(key),
        execute: async () => {
          executions += 1;
          return { uprn: '1' };
        },
        setCached: (value) => cache.set('addr:12-high-st', value),
      });
    const first = await runOnce();
    const second = await runOnce();
    assert.strictEqual(first.outcome, 'provider_execution');
    assert.strictEqual(second.outcome, 'cache_hit');
    assert.strictEqual(executions, 1);
  });

  await test('normalized equivalent query shares the identity cache key path', async () => {
    const { normalizeIdentitySearchAddress } = require('../utils/ukAddress');
    assert.strictEqual(
      normalizeIdentitySearchAddress('12 High Street, b12uj'),
      normalizeIdentitySearchAddress('12 HIGH STREET, B1 2UJ')
    );
  });

  await test('cache expiry causes provider refresh', async () => {
    const cache = memoryCache();
    let executions = 0;
    const runOnce = () =>
      coalesceCachedProviderRequest({
        cacheKey: 'ttl-key',
        useSharedLock: false,
        getCached: (key) => cache.get(key),
        execute: async () => {
          executions += 1;
          return { n: executions };
        },
        setCached: (value) => cache.set('ttl-key', value, 1),
      });
    await runOnce();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await runOnce();
    assert.strictEqual(executions, 2);
  });

  await test('concurrent identical lookups execute the provider once', async () => {
    resetLocalProviderInflight();
    const cache = memoryCache();
    let executions = 0;
    const started = [];
    const runOnce = () =>
      coalesceCachedProviderRequest({
        cacheKey: 'concurrent-addr',
        useSharedLock: false,
        getCached: (key) => cache.get(key),
        execute: async () => {
          executions += 1;
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { uprn: '9' };
        },
        setCached: (value) => cache.set('concurrent-addr', value),
      });
    const results = await Promise.all([runOnce(), runOnce(), runOnce(), runOnce(), runOnce()]);
    started.push(...results.map((row) => row.outcome));
    assert.strictEqual(executions, 1);
    assert.ok(results.some((row) => row.outcome === 'provider_execution'));
    assert.ok(results.filter((row) => row.outcome === 'deduplicated').length >= 4);
  });

  await test('different legitimate lookups remain independent', async () => {
    resetLocalProviderInflight();
    const cache = memoryCache();
    const executions = [];
    const run = (key) =>
      coalesceCachedProviderRequest({
        cacheKey: key,
        useSharedLock: false,
        getCached: (k) => cache.get(k),
        execute: async () => {
          executions.push(key);
          return { key };
        },
        setCached: (value) => cache.set(key, value),
      });
    await Promise.all([run('a'), run('b')]);
    assert.deepStrictEqual(executions.sort(), ['a', 'b']);
  });

  await test('10 identical cached requests stay at 1 provider execution', async () => {
    resetLocalProviderInflight();
    const cache = memoryCache();
    let executions = 0;
    const runOnce = () =>
      coalesceCachedProviderRequest({
        cacheKey: 'ten',
        useSharedLock: false,
        getCached: (key) => cache.get(key),
        execute: async () => {
          executions += 1;
          return { ok: true };
        },
        setCached: (value) => cache.set('ten', value),
      });
    await runOnce();
    await Promise.all(Array.from({ length: 9 }, () => runOnce()));
    assert.strictEqual(executions, 1);
  });

  await test('existing subject resolve avoids provider when reusable profile exists', async () => {
    let profileCalls = 0;
    const result = await resolveExternalSubject({
      uprn: '1000444',
      address: '12 High Street, B1 2UJ',
      userId: 3,
      deps: {
        findSubjectByUprn: async () => ({
          id: 77,
          uprn: '1000444',
          normalized_address: '12 High Street, B1 2UJ',
          postcode: 'B1 2UJ',
          profile_snapshot: { address: '12 High Street', bedrooms: 2 },
          updated_at: new Date().toISOString(),
          created_by: 1,
        }),
        getUprnProfile: async () => {
          profileCalls += 1;
          return { success: true, profile: { bedrooms: 9 } };
        },
        linkSubjectToMarketplaceListing: async () => ({ linked: false, listing: null }),
        recordSubjectLookup: async () => {},
        checkExpensiveProviderQuota: async () => ({ allowed: true }),
      },
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.providerExecution, 'reused_subject');
    assert.strictEqual(result.creditsUsed, 0);
    assert.strictEqual(profileCalls, 0);
    assert.strictEqual(result.accessContext.subjectId, 77);
  });

  await test('authorized resolve still records per-user relationship without exposing other analyses', async () => {
    const recorded = [];
    const result = await resolveExternalSubject({
      uprn: '1000444',
      userId: 8,
      deps: {
        findSubjectByUprn: async () => ({
          id: 77,
          uprn: '1000444',
          normalized_address: '12 High Street',
          profile_snapshot: { address: '12 High Street' },
          updated_at: new Date().toISOString(),
          created_by: 1,
        }),
        getUprnProfile: async () => ({ success: true, profile: {} }),
        linkSubjectToMarketplaceListing: async () => ({ linked: false }),
        recordSubjectLookup: async (userId, subjectId) => {
          recorded.push({ userId, subjectId });
        },
      },
    });
    assert.deepStrictEqual(recorded, [{ userId: 8, subjectId: 77 }]);
    assert.strictEqual(result.property.source, 'external_intelligence_subject');
    assert.ok(!result.history);
    assert.ok(!result.finance);
  });

  await test('repeated resolve does not call provider while profile is reusable', async () => {
    let profileCalls = 0;
    const deps = {
      findSubjectByUprn: async () => ({
        id: 5,
        uprn: '9',
        normalized_address: '1 King St',
        profile_snapshot: { uprn: '9' },
        updated_at: new Date().toISOString(),
      }),
      getUprnProfile: async () => {
        profileCalls += 1;
        return { success: true, profile: {} };
      },
      linkSubjectToMarketplaceListing: async () => ({ linked: false }),
      recordSubjectLookup: async () => {},
    };
    await resolveExternalSubject({ uprn: '9', userId: 1, deps });
    await resolveExternalSubject({ uprn: '9', userId: 1, deps });
    assert.strictEqual(profileCalls, 0);
  });

  await test('concurrent resolve is coalesced at the provider-execution layer', async () => {
    resetLocalProviderInflight();
    const cache = memoryCache();
    let executions = 0;
    await Promise.all(
      [1, 2, 3].map(() =>
        coalesceCachedProviderRequest({
          cacheKey: 'uprn:100',
          useSharedLock: false,
          getCached: (key) => cache.get(key),
          execute: async () => {
            executions += 1;
            await new Promise((resolve) => setTimeout(resolve, 15));
            return { profile: { uprn: '100' } };
          },
          setCached: (value) => cache.set('uprn:100', value),
        })
      )
    );
    assert.strictEqual(executions, 1);
  });

  await test('expired subject profile is not treated as reusable', () => {
    const stale = hasReusableUprnProfile(
      {
        profile_snapshot: { address: 'x' },
        updated_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      },
      Date.now(),
      30 * 24 * 60 * 60 * 1000
    );
    assert.strictEqual(stale, false);
    assert.strictEqual(
      hasReusableUprnProfile({
        profile_snapshot: { address: 'x' },
        updated_at: new Date().toISOString(),
      }),
      true
    );
  });

  await test('provider timeout / 429 / 500 / malformed stay generic', () => {
    const timeout = classifyProviderFailure({ name: 'AbortError', message: 'The operation was aborted' });
    const tooMany = classifyProviderFailure(new Error('PropertyData HTTP 429'));
    const server = classifyProviderFailure(new Error('PropertyData HTTP 500'));
    const malformed = classifyProviderFailure(new Error('PropertyData returned non-JSON response (200)'));
    [timeout, tooMany, server, malformed].forEach((row) => {
      assert.strictEqual(row.code, PROVIDER_TEMPORARILY_UNAVAILABLE);
      assert.ok(!/api[_-]?key/i.test(row.message));
      assert.ok(!/PropertyData HTTP/.test(row.message));
    });
  });

  await test('quota rejects further expensive executions without calling provider', async () => {
    let resolveCalls = 0;
    const lookup = await lookupPropertyIntelligence('12 High Street, B1 2UJ', 4, {
      ...dbOnlyLookupDeps,
      checkExpensiveProviderQuota: async () => ({
        allowed: false,
        code: PROVIDER_LOOKUP_LIMIT,
        message: 'Property lookup limit reached. Try again later.',
      }),
      resolveIdentity: async () => {
        resolveCalls += 1;
        return { success: true, uprn: '1' };
      },
    });
    assert.strictEqual(lookup.external.code, PROVIDER_LOOKUP_LIMIT);
    assert.strictEqual(resolveCalls, 0);

    const resolve = await resolveExternalSubject({
      uprn: '1',
      userId: 4,
      deps: {
        findSubjectByUprn: async () => null,
        checkExpensiveProviderQuota: async () => ({
          allowed: false,
          code: PROVIDER_LOOKUP_LIMIT,
          message: 'Property lookup limit reached. Try again later.',
        }),
        getUprnProfile: async () => {
          throw new Error('should not call');
        },
      },
    });
    assert.strictEqual(resolve.success, false);
    assert.strictEqual(resolve.code, PROVIDER_LOOKUP_LIMIT);
  });

  await test('quota helper uses injected execution count', async () => {
    const blocked = await checkExpensiveProviderQuota(9, {
      countRecentPaidExecutions: async () => 40,
    });
    assert.strictEqual(blocked.allowed, false);
    assert.strictEqual(blocked.code, PROVIDER_LOOKUP_LIMIT);
    const allowed = await checkExpensiveProviderQuota(9, {
      countRecentPaidExecutions: async () => 1,
    });
    assert.strictEqual(allowed.allowed, true);
  });

  await test('preview remains DB-only and analyse credit wiring is unchanged', () => {
    const routes = read('routes/aiRoutes.js');
    const preview = read('controllers/intelligenceController.js');
    const persist = read('services/ai/propertyIntelligenceProduction.js');
    assert.ok(/preview', authenticateAI, getSubjectPreviewEndpoint/.test(routes));
    assert.ok(!/subjects\/:subjectId\/preview', authenticateAI, requireCredits/.test(routes));
    assert.ok(!preview.includes('getUprnProfile'));
    assert.ok(
      /authenticateAI,\s*requireCredits,\s*requireIntelligenceAnalyseSlot,\s*analysePropertyIntelligence/.test(
        routes
      )
    );
    assert.ok(
      /authenticateAI,\s*requireCredits,\s*requireIntelligenceAnalyseSlot,\s*analyseSubjectIntelligence/.test(
        routes
      )
    );
    assert.ok(persist.includes('AiSubscription.consumeCredit'));
    assert.ok(/subjects\/resolve', authenticateAI, requireCredits, resolveIntelligenceSubject/.test(routes));
    assert.ok(!read('controllers/intelligenceController.js').includes('consumeCredit'));
  });

  await test('valuation assessment safety and engine version are unchanged', () => {
    assert.strictEqual(ASSESSMENT_SAFETY_VERSION, 'assessment-safety-1.0.0');
    assert.strictEqual(CANONICAL_ENGINE_VERSION, 'property-intelligence-v2');
    const protection = read('services/providers/cache/providerCostProtection.js');
    assert.ok(!protection.includes('calculatePropertyValuation'));
    assert.ok(!protection.includes('scorePersonalDecision'));
    assert.ok(!protection.includes('assembleDecisionIntelligence'));
    assert.ok(!protection.includes('runBacktest'));
  });

  await test('cache TTL defaults were not extended', () => {
    const { propertyIntelligenceConfig } = require('../config/propertyIntelligence.config');
    assert.strictEqual(propertyIntelligenceConfig.cacheTtl.identity, 30 * 24 * 60 * 60 * 1000);
    assert.strictEqual(propertyIntelligenceConfig.cacheTtl.uprnProfile, 30 * 24 * 60 * 60 * 1000);
    assert.ok(propertyIntelligenceConfig.providerProtection.maxPaidExecutionsPerUserHour <= 40);
  });

  await test('historical analysis mapping remains unmodified', () => {
    const stored = {
      id: 30,
      created_at: '2026-08-29T21:11:09.986Z',
      model_version: 'property-intelligence-v2',
      output_data: {
        sale: { success: true, centralEstimate: 232 },
      },
    };
    const mapped = mapHistoryRow(stored);
    assert.strictEqual(mapped.id, 30);
    const annotated = annotateStoredAnalysis(stored);
    assert.strictEqual(annotated.output_data.sale.centralEstimate, 232);
  });

  await test('usage logger no longer stores raw provider error text from adapter path', () => {
    const adapter = read('services/providers/propertyData/PropertyDataAdapter.js');
    assert.ok(adapter.includes('classified.usageCode'));
    assert.ok(!adapter.includes('errorMessage: error.message'));
    assert.ok(!adapter.includes('raw: result.data'));
  });

  console.log('\nAll providerCostProtection tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
