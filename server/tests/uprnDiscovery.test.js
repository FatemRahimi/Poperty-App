/**
 * Controlled /uprns unit-discovery integration.
 * Run: node server/tests/uprnDiscovery.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  UPRNS_STRICT,
  UPRNS_MAX_RESULTS,
  mapProviderDiscoveryRow,
  mapUprnDiscoveryResponse,
  classifyDiscoveryKind,
  queryLooksLikeNamedUnit,
  shouldSuppressShellAsExactUnit,
  isPostcodeOnlyQuery,
  mergeMatcherAndDiscovery,
  rankDiscoveryRows,
  creditsUsedFromProviderResponse,
  isSafeIntegerPropertyIdQuery,
  looksLikeUprnDigitString,
} = require('../utils/uprnDiscovery');
const { lookupPropertyIntelligence, resolveExternalSubject } = require('../services/ai/externalPropertyLookupService');
const { propertyIntelligenceConfig } = require('../config/propertyIntelligence.config');

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

const dbOnlyLookupDeps = {
  searchUserProperties: async () => [],
  searchPublicPropertiesForIntelligence: async () => [],
  getPostcodeMarketIntelligence: async () => ({ success: false }),
  isPropertyDataConfigured: () => true,
  checkExpensiveProviderQuota: async () => ({ allowed: true }),
};

function barcombeRows() {
  return [
    {
      uprn: 100023351679,
      address: 'FLAT 1, 198, BARCOMBE AVENUE, LONDON, SW2 3BD',
      addressParts: {
        secondary: 'FLAT 1',
        primary: '198',
        street: 'BARCOMBE AVENUE',
        town: 'LONDON',
        district: null,
        postcode: 'SW2 3BD',
      },
      classificationCode: 'RD06',
      classificationCodeDesc: 'Flat',
    },
    {
      uprn: 100023351680,
      address: 'FLAT 2, 198, BARCOMBE AVENUE, LONDON, SW2 3BD',
      addressParts: {
        secondary: 'FLAT 2',
        primary: '198',
        street: 'BARCOMBE AVENUE',
        town: 'LONDON',
        district: null,
        postcode: 'SW2 3BD',
      },
      classificationCode: 'RD06',
      classificationCodeDesc: 'Flat',
    },
    {
      uprn: 100023351677,
      address: '198, BARCOMBE AVENUE, LONDON, SW2 3BD',
      addressParts: {
        secondary: null,
        primary: '198',
        street: 'BARCOMBE AVENUE',
        town: 'LONDON',
        district: null,
        postcode: 'SW2 3BD',
      },
      classificationCode: 'P',
      classificationCodeDesc: 'Parent Shell',
    },
  ];
}

async function run() {
  const adapterSrc = fs.readFileSync(
    path.join(__dirname, '../services/providers/propertyData/PropertyDataAdapter.js'),
    'utf8'
  );
  const lookupSrc = fs.readFileSync(
    path.join(__dirname, '../services/ai/externalPropertyLookupService.js'),
    'utf8'
  );
  const searchSrc = fs.readFileSync(
    path.join(__dirname, '../services/ai/propertyIntelligenceSearch.js'),
    'utf8'
  );

  await test('1. postcode discovery calls /uprns semantics in adapter', () => {
    assert.ok(adapterSrc.includes("this.client.request('uprns', params)"));
    assert.ok(adapterSrc.includes('async listUprnsInPostcode'));
    assert.ok(lookupSrc.includes('listUprnsInPostcode'));
    assert.ok(lookupSrc.includes('runDiscovery'));
  });

  await test('2. strict=true', () => {
    assert.strictEqual(UPRNS_STRICT, 'true');
    assert.ok(adapterSrc.includes('strict: UPRNS_STRICT'));
  });

  await test('3+20. result count avoids default-10 trap', () => {
    assert.strictEqual(UPRNS_MAX_RESULTS, 200);
    assert.ok(adapterSrc.includes('results: UPRNS_MAX_RESULTS'));
    assert.ok(!lookupSrc.includes('slice(0, 8)'));
  });

  await test('4-8. structured rows mapped; secondary/primary/UPRN string/classification preserved', () => {
    const mapped = mapUprnDiscoveryResponse({
      status: 'success',
      api_calls_cost: 6,
      data: barcombeRows(),
    });
    assert.strictEqual(mapped.rows.length, 3);
    const flat1 = mapped.rows.find((r) => r.secondary === 'FLAT 1');
    assert.strictEqual(flat1.uprn, '100023351679');
    assert.strictEqual(typeof flat1.uprn, 'string');
    assert.strictEqual(flat1.primary, '198');
    assert.strictEqual(flat1.addressParts.street, 'BARCOMBE AVENUE');
    assert.strictEqual(flat1.classificationCode, 'RD06');
    assert.strictEqual(flat1.classificationCodeDesc, 'Flat');
    assert.strictEqual(flat1.kind, 'unit');
    const shell = mapped.rows.find((r) => r.uprn === '100023351677');
    assert.strictEqual(shell.kind, 'shell');
    assert.strictEqual(shell.secondary, null);
  });

  await test('9. shell distinguishable from unit', () => {
    const unit = classifyDiscoveryKind({
      secondary: 'FLAT 1',
      classificationCodeDesc: 'Flat',
      classificationCode: 'RD06',
    });
    const shell = classifyDiscoveryKind({
      secondary: null,
      classificationCodeDesc: 'Parent Shell',
      classificationCode: 'P',
    });
    const house = classifyDiscoveryKind({
      secondary: null,
      classificationCodeDesc: 'Terraced',
      classificationCode: 'RD04',
    });
    assert.strictEqual(unit, 'unit');
    assert.strictEqual(shell, 'shell');
    assert.strictEqual(house, 'address');
  });

  await test('10. postcode-only query is discovery, not a subject', async () => {
    assert.strictEqual(isPostcodeOnlyQuery('SW2 3BD', 'SW2 3BD'), true);
    let resolveCalls = 0;
    let discoveryCalls = 0;
    const result = await lookupPropertyIntelligence('SW2 3BD', 9, {
      ...dbOnlyLookupDeps,
      resolveIdentity: async () => {
        resolveCalls += 1;
        return { success: true, uprn: 'SHOULD_NOT_AUTO_SUBJECT' };
      },
      listUprnsInPostcode: async (pc) => {
        discoveryCalls += 1;
        assert.strictEqual(pc, 'SW2 3BD');
        return { success: true, rows: mapUprnDiscoveryResponse({ data: barcombeRows() }).rows };
      },
    });
    assert.strictEqual(resolveCalls, 0);
    assert.strictEqual(discoveryCalls, 1);
    assert.ok(result.external.matches.length > 0);
    assert.strictEqual(result.external.postcodeOnly, true);
    assert.ok(!result.subject);
    assert.ok(!result.selectedUprn);
  });

  await test('11. one discovery row does not auto-select', async () => {
    const one = mapProviderDiscoveryRow(barcombeRows()[0]);
    const result = await lookupPropertyIntelligence('SW2 3BD', 9, {
      ...dbOnlyLookupDeps,
      resolveIdentity: async () => ({ success: false }),
      listUprnsInPostcode: async () => ({ success: true, rows: [one] }),
    });
    assert.strictEqual(result.external.matches.length, 1);
    assert.ok(!result.preview);
    assert.ok(!result.subject);
    assert.ok(!lookupSrc.includes('autoSelect'));
  });

  await test('12. explicit unit selection still uses existing confirmation path', () => {
    assert.ok(lookupSrc.includes('resolveExternalSubject'));
    const piRoutes = fs.readFileSync(path.join(__dirname, '../routes/aiRoutes.js'), 'utf8');
    assert.ok(/subjects\/resolve/.test(piRoutes));
    assert.ok(!lookupSrc.includes('upsertSubject({') || lookupSrc.includes('finishResolvedSubject'));
  });

  await test('14. no fabricated units — only provider-returned rows', () => {
    const mapped = mapUprnDiscoveryResponse({ data: barcombeRows() });
    assert.ok(!mapped.rows.some((r) => /flat b/i.test(String(r.secondary || r.address))));
    const empty = mapUprnDiscoveryResponse({ data: [] });
    assert.strictEqual(empty.rows.length, 0);
  });

  await test('15. Flat B is not mapped to Flat 1/2', () => {
    const merged = mergeMatcherAndDiscovery({
      query: 'Flat B, 198 Barcombe Avenue, SW2 3BD',
      matcherRows: [],
      discoveryRows: mapUprnDiscoveryResponse({ data: barcombeRows() }).rows,
    });
    assert.ok(merged.some((r) => r.secondary === 'FLAT 1'));
    assert.ok(merged.some((r) => r.secondary === 'FLAT 2'));
    assert.ok(!merged.some((r) => /flat b/i.test(String(r.secondary || ''))));
    assert.ok(!merged.some((r) => r.aliasedFrom));
  });

  await test('16. Flat E is not mapped to 30E', () => {
    const discovery = [
      mapProviderDiscoveryRow({
        uprn: '30E',
        address: '30E, FULHAM PARK GARDENS',
        addressParts: { secondary: null, primary: '30E', street: 'FULHAM PARK GARDENS' },
        classificationCodeDesc: 'Flat',
      }),
      mapProviderDiscoveryRow({
        uprn: 'SHELL',
        address: '30, FULHAM PARK GARDENS',
        addressParts: { secondary: null, primary: '30', street: 'FULHAM PARK GARDENS' },
        classificationCode: 'P',
        classificationCodeDesc: 'Property Shell',
      }),
    ];
    const merged = mergeMatcherAndDiscovery({
      query: 'Flat E, 30 Fulham Park Gardens, SW6 4LH',
      matcherRows: [
        {
          uprn: 'SHELL',
          address: '30, FULHAM PARK GARDENS',
          classificationCodeDesc: 'Property Shell',
          classificationCode: 'P',
        },
      ],
      discoveryRows: discovery,
    });
    const selected = merged.find((r) => /flat e/i.test(String(r.secondary || r.address || '')));
    assert.strictEqual(selected, undefined);
    assert.ok(merged.some((r) => r.primary === '30E'));
    assert.ok(merged.some((r) => r.kind === 'shell'));
  });

  await test('17. named unit is not silently replaced by shell', () => {
    assert.strictEqual(queryLooksLikeNamedUnit('Flat E, 30 Fulham Park Gardens'), true);
    assert.strictEqual(
      shouldSuppressShellAsExactUnit('Flat E, 30 Fulham Park Gardens', {
        classificationCodeDesc: 'Property Shell',
        classificationCode: 'P',
        secondary: null,
      }),
      true
    );
    assert.strictEqual(
      shouldSuppressShellAsExactUnit('30 Fulham Park Gardens', {
        classificationCodeDesc: 'Property Shell',
        classificationCode: 'P',
      }),
      false
    );
  });

  await test('17b. lookup demotes matcher shell for named unit and keeps discovery units', async () => {
    const result = await lookupPropertyIntelligence('Flat E, 30 Fulham Park Gardens, SW6 4LH', 9, {
      ...dbOnlyLookupDeps,
      resolveIdentity: async () => ({
        success: true,
        uprn: '999',
        address: '30, FULHAM PARK GARDENS, LONDON, SW6 4LH',
        matchConfidence: 'high',
        classificationCode: 'P',
        classificationCodeDesc: 'Property Shell',
        alternativeMatches: [],
      }),
      listUprnsInPostcode: async () => ({
        success: true,
        rows: [
          mapProviderDiscoveryRow({
            uprn: '999',
            address: '30, FULHAM PARK GARDENS, LONDON, SW6 4LH',
            addressParts: { secondary: null, primary: '30', street: 'FULHAM PARK GARDENS' },
            classificationCode: 'P',
            classificationCodeDesc: 'Property Shell',
          }),
          mapProviderDiscoveryRow({
            uprn: '30A',
            address: '30A, FULHAM PARK GARDENS, LONDON, SW6 4LH',
            addressParts: { secondary: null, primary: '30A', street: 'FULHAM PARK GARDENS' },
            classificationCodeDesc: 'Flat',
          }),
        ],
      }),
    });
    assert.strictEqual(result.external.namedUnitUnconfirmed, true);
    const shell = result.external.matches.find((m) => String(m.uprn) === '999');
    assert.strictEqual(shell.kind, 'shell');
    assert.notStrictEqual(shell.matchConfidence, 'high');
    assert.ok(result.external.matches.some((m) => String(m.uprn) === '30A'));
  });

  await test('18. shell remains representable as a building', () => {
    const row = mapProviderDiscoveryRow(barcombeRows()[2]);
    assert.strictEqual(row.kind, 'shell');
    assert.strictEqual(row.address, '198, BARCOMBE AVENUE, LONDON, SW2 3BD');
  });

  await test('19. max-result truncation does not claim completeness', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      uprn: String(i + 1),
      address: `${i} TEST ROAD`,
      addressParts: { primary: String(i), street: 'TEST ROAD', postcode: 'B1 2UJ' },
    }));
    const mapped = mapUprnDiscoveryResponse({ data: rows });
    assert.strictEqual(mapped.potentiallyTruncated, true);
    assert.ok(!JSON.stringify(mapped).toLowerCase().includes('complete'));
  });

  await test('21. provider error fails safely', async () => {
    const result = await lookupPropertyIntelligence('SW2 3BD', 9, {
      ...dbOnlyLookupDeps,
      resolveIdentity: async () => ({ success: false }),
      listUprnsInPostcode: async () => {
        throw new Error('PropertyData HTTP 500');
      },
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.external.matches.length, 0);
    assert.ok(result.external.message);
    assert.ok(!/stack/i.test(result.external.message));
  });

  await test('22. existing address matcher still works', async () => {
    const result = await lookupPropertyIntelligence('12 High Street, B1 2UJ', 9, {
      ...dbOnlyLookupDeps,
      resolveIdentity: async () => ({
        success: true,
        uprn: '1000123',
        address: '12 High Street, B1 2UJ',
        matchConfidence: 'high',
        alternativeMatches: [],
      }),
      listUprnsInPostcode: async () => ({ success: true, rows: [] }),
    });
    assert.strictEqual(result.external.matches[0].uprn, '1000123');
    assert.strictEqual(result.external.matches[0].address, '12 High Street, B1 2UJ');
  });

  await test('23. listing path still returned alongside discovery', async () => {
    const result = await lookupPropertyIntelligence('B1 2UJ', 9, {
      ...dbOnlyLookupDeps,
      searchPublicPropertiesForIntelligence: async () => [
        { id: 42, address_display: 'City loft', zip_code: 'B1 2UJ', source: 'marketplace' },
      ],
      resolveIdentity: async () => ({ success: false }),
      listUprnsInPostcode: async () => ({
        success: true,
        rows: [mapProviderDiscoveryRow(barcombeRows()[0])],
      }),
    });
    assert.strictEqual(result.internal[0].id, 42);
    assert.ok(result.external.matches.length >= 1);
  });

  await test('24. non-listing subject confirmation still uses /uprn resolve', async () => {
    const resolved = await resolveExternalSubject({
      uprn: '100023351679',
      address: 'FLAT 1, 198, BARCOMBE AVENUE, LONDON, SW2 3BD',
      userId: 9,
      matchConfidence: 'high',
      deps: {
        findSubjectByUprn: async () => null,
        checkExpensiveProviderQuota: async () => ({ allowed: true }),
        getUprnProfile: async (uprn) => ({
          profile: { address: 'FLAT 1, 198, BARCOMBE AVENUE, LONDON, SW2 3BD', postcode: 'SW2 3BD' },
          creditsUsed: 10,
        }),
        linkSubjectToMarketplaceListing: async () => ({ linked: false, listing: null }),
        upsertSubject: async (row) => ({
          id: 77,
          uprn: row.uprn,
          normalized_address: row.normalizedAddress,
          postcode: row.postcode,
          attributes: {},
          profile_snapshot: {},
          provider: 'PropertyData',
        }),
        recordSubjectLookup: async () => {},
      },
    });
    assert.strictEqual(resolved.success, true);
    assert.strictEqual(resolved.subject.uprn, '100023351679');
    assert.strictEqual(resolved.property.subjectId, 77);
  });

  await test('25. typed UPRN is not bound as integer property id', () => {
    assert.strictEqual(isSafeIntegerPropertyIdQuery('42'), true);
    assert.strictEqual(isSafeIntegerPropertyIdQuery('100110469802'), false);
    assert.strictEqual(looksLikeUprnDigitString('100110469802'), true);
    assert.ok(searchSrc.includes('isSafeIntegerPropertyIdQuery'));
    const aggregatorSrc = fs.readFileSync(
      path.join(__dirname, '../services/ai/propertyDataAggregator.js'),
      'utf8'
    );
    assert.ok(aggregatorSrc.includes('isSafeIntegerPropertyIdQuery'));
    const { appendSearchFilter } = require('../services/ai/propertyDataAggregator');
    const mineParams = [9];
    appendSearchFilter('100110469802', mineParams, 'p.user_id = $1');
    assert.ok(!mineParams.some((p) => p === 100110469802));
    const idParams = [9];
    appendSearchFilter('42', idParams, 'p.user_id = $1');
    assert.ok(idParams.includes(42));
  });

  await test('credit config is 6 and live api_calls_cost wins', () => {
    assert.strictEqual(propertyIntelligenceConfig.providerCredits.propertydata.uprns, 6);
    assert.deepStrictEqual(propertyIntelligenceConfig.providerProtection.expensiveEndpoints, [
      'address-match-uprn',
      'uprn',
      'uprns',
    ]);
    assert.strictEqual(creditsUsedFromProviderResponse({ api_calls_cost: 9 }, 6), 9);
    assert.strictEqual(creditsUsedFromProviderResponse({}, 6), 6);
    assert.ok(adapterSrc.includes('creditsUsedFromProviderResponse'));
    assert.ok(adapterSrc.includes('getCached: async () => null'));
    assert.ok(adapterSrc.includes('persistentCacheUsed: false'));
  });

  await test('rank keeps shells but does not drop them', () => {
    const ranked = rankDiscoveryRows(
      mapUprnDiscoveryResponse({ data: barcombeRows() }).rows,
      '198 Barcombe Avenue, SW2 3BD',
      'SW2 3BD'
    );
    assert.strictEqual(ranked.length, 3);
    assert.ok(ranked.some((r) => r.kind === 'shell'));
    assert.ok(ranked.some((r) => r.kind === 'unit'));
  });

  console.log('uprnDiscovery.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
