/**
 * Canonical subject identity — exact UPRN, PAON/SAON, no fuzzy identity.
 * Run: node server/tests/canonicalIdentity.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  IDENTITY_VERIFICATION_STATE,
  IDENTITY_NON_EQUIVALENCE,
  CANONICAL_IDENTITY_VERSION,
  selectUniqueUprnMatch,
  createCanonicalIdentity,
} = require('../architecture');
const {
  extractCanonicalAddress,
  exactAddressKeysEqual,
} = require('../services/identity/canonicalAddress');
const { resolvePropertyIdentity } = require('../services/enrichment/propertyEnrichmentService');
const { queryOfficialSaleTransactions } = require('../services/market/officialSaleTransactionQuery');
const { MATCH_METHOD } = require('../architecture/officialSaleTransaction');
const { createMemoryOfficialSaleStore } = require('../services/market/officialSaleTransactionRepository');
const { importPricePaid } = require('../scripts/import-hmlr-price-paid');
const os = require('os');

function test(name, fn) {
  fn();
  console.log(`  ok  ${name}`);
}

const pending = [];
function asyncTest(name, fn) {
  pending.push({ name, fn });
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

function ppdLine({
  id = '{TX-1}',
  price = '250000',
  date = '2020-03-01',
  postcode = 'B1 2UJ',
  type = 'T',
  newBuild = 'N',
  tenure = 'F',
  paon = '12',
  saon = '',
  street = 'TEST STREET',
  locality = '',
  town = 'BIRMINGHAM',
  district = 'BIRMINGHAM',
  county = 'WEST MIDLANDS',
  category = 'A',
  status = 'A',
} = {}) {
  const quote = (value) => `"${value == null ? '' : value}"`;
  return [
    id, price, date, postcode, type, newBuild, tenure, paon, saon, street,
    locality, town, district, county, category, status,
  ].map(quote).join(',');
}

function writeTemp(name, contents) {
  const file = path.join(os.tmpdir(), `id-${name}-${process.pid}-${Date.now()}.csv`);
  fs.writeFileSync(file, contents);
  return file;
}

function memoryIdentityStore() {
  const identities = new Map();
  return {
    async findIdentityByPropertyId(id) {
      const row = identities.get(Number(id));
      return row ? { ...row } : null;
    },
    async upsertIdentity(row) {
      const prev = identities.get(Number(row.propertyId)) || {};
      const uprn = row.uprnMode === 'clear'
        ? null
        : (row.uprnMode === 'set' ? row.uprn : (row.uprn || prev.uprn || null));
      const next = { ...prev, ...row, uprn, id: row.propertyId };
      identities.set(Number(row.propertyId), next);
      return { ...next };
    },
  };
}

function listingDeps(store, provider) {
  return {
    findIdentityByPropertyId: store.findIdentityByPropertyId,
    upsertIdentity: store.upsertIdentity,
    createListingFallbackIdentity: async (property) => store.upsertIdentity({
      propertyId: property.id,
      normalizedAddress: 'fallback',
      matchMethod: 'listing_fields',
    }),
    identityProvider: provider,
    getProviderRegistry: () => ({
      getPrimaryIdentityProvider: () => provider,
    }),
  };
}

console.log('canonical subject identity\n');

test('contract version and non-equivalence', () => {
  assert.strictEqual(CANONICAL_IDENTITY_VERSION, 'canonical-subject-identity-1.0.0');
  assert.strictEqual(IDENTITY_NON_EQUIVALENCE.listingIsNotSubject, true);
  assert.strictEqual(IDENTITY_NON_EQUIVALENCE.uprnIsNotTitleNumber, true);
  assert.strictEqual(IDENTITY_NON_EQUIVALENCE.buildingIsNotUnit, true);
  const inferred = createCanonicalIdentity({ verificationState: IDENTITY_VERIFICATION_STATE.INFERRED });
  assert.notStrictEqual(inferred.verificationState, IDENTITY_VERIFICATION_STATE.VERIFIED_EXACT);
  assert.strictEqual(inferred.inferredIsNotVerified, true);
});

test('whitespace and postcode normalisation', () => {
  const got = extractCanonicalAddress({
    id: 1,
    house_number: '12 ',
    street_name: 'High Street',
    zip_code: ' b12uj ',
  });
  assert.strictEqual(got.paon, '12');
  assert.strictEqual(got.postcode, 'B1 2UJ');
  assert.strictEqual(got.postcodeCompact, 'B12UJ');
  const nbsp = extractCanonicalAddress({
    house_number: '10',
    zip_code: 'B4\u00A06EY ',
  });
  assert.strictEqual(nbsp.postcode, 'B4 6EY');
});

test('PAON from house_number including suffix and range', () => {
  assert.strictEqual(extractCanonicalAddress({ house_number: '12A', zip_code: 'B1 2UJ' }).paon, '12A');
  assert.strictEqual(extractCanonicalAddress({ house_number: '1-3', zip_code: 'B1 2UJ' }).paon, '1-3');
  assert.strictEqual(extractCanonicalAddress({ house_number: 'Rose Cottage', zip_code: 'B1 2UJ' }).paon, 'Rose Cottage');
});

test('SAON from flat/unit tokens without merging units', () => {
  const flat5 = extractCanonicalAddress({ house_number: 'Flat 5', zip_code: 'B1 2UJ' });
  const flat6 = extractCanonicalAddress({ house_number: 'Flat 6', zip_code: 'B1 2UJ' });
  assert.strictEqual(flat5.saon, 'Flat 5');
  assert.strictEqual(flat6.saon, 'Flat 6');
  assert.notStrictEqual(flat5.saon, flat6.saon);
  const apt = extractCanonicalAddress({ house_number: 'Apartment 5', zip_code: 'SW1A 1AA' });
  assert.strictEqual(apt.saon, 'Apartment 5');
});

test('named building / unit protection', () => {
  const named = extractCanonicalAddress({
    house_number: 'Flat 2',
    address_line1: 'Canterbury Tower',
    zip_code: 'B1 2UJ',
  });
  assert.strictEqual(named.saon, 'Flat 2');
  assert.notStrictEqual(named.paon, named.saon);
});

test('ambiguous two-number address is unresolved PAON', () => {
  const got = extractCanonicalAddress({
    address_line1: '122  12 Ballards Lane, Finchley Central',
    zip_code: 'N3 2BJ',
  });
  assert.strictEqual(got.paon, null);
  assert.ok(got.limitations.some((note) => /multiple number/i.test(note)));
});

test('leading PAON from address_line1 when house_number missing', () => {
  const got = extractCanonicalAddress({
    address_line1: '266 Hospital Street',
    zip_code: 'B19 2YF',
  });
  assert.strictEqual(got.paon, '266');
  assert.strictEqual(got.verificationState, IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED);
});

test('house_number that is a postcode is not PAON', () => {
  const got = extractCanonicalAddress({
    house_number: ' B15 3AP',
    address_line1: 'B15 3AP 100 Harborne Road',
    zip_code: 'B15 3AP',
  });
  assert.strictEqual(got.paon, null);
});

test('12 is not 12A', () => {
  const a = extractCanonicalAddress({ house_number: '12', zip_code: 'B1 2UJ' });
  const b = extractCanonicalAddress({ house_number: '12A', zip_code: 'B1 2UJ' });
  assert.strictEqual(exactAddressKeysEqual(a, b), false);
});

test('unique UPRN vs multiple candidates', () => {
  const unique = selectUniqueUprnMatch([{ uprn: '100' }, { uprn: '100' }]);
  assert.strictEqual(unique.unique, true);
  assert.strictEqual(unique.uprn, '100');
  const many = selectUniqueUprnMatch([{ uprn: '100' }, { uprn: '200' }]);
  assert.strictEqual(many.unique, false);
  assert.strictEqual(many.reason, 'MULTIPLE_CANDIDATE_UPRNS');
  assert.strictEqual(many.uprn, null);
});

asyncTest('exact UPRN is persisted only when unique', async () => {
  const store = memoryIdentityStore();
  const provider = {
    isAvailable: () => true,
    resolveIdentity: async () => ({
      success: true,
      uprn: '100012345',
      address: '12 High Street, B1 2UJ',
      provider: 'propertydata',
      matchConfidence: 'high',
      alternativeMatches: [],
    }),
  };
  const resolved = await resolvePropertyIdentity({
    id: 9,
    house_number: '12',
    street_name: 'High Street',
    zip_code: 'B1 2UJ',
  }, { allowPaidIdentity: true, deps: listingDeps(store, provider) });
  assert.strictEqual(resolved.identity.uprn, '100012345');
  assert.strictEqual(resolved.identity.verificationState, IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED);
  assert.notStrictEqual(resolved.identity.verificationState, IDENTITY_VERIFICATION_STATE.VERIFIED_EXACT);
});

asyncTest('multiple candidate UPRNs stay unresolved and persist no UPRN', async () => {
  const store = memoryIdentityStore();
  const provider = {
    isAvailable: () => true,
    resolveIdentity: async () => ({
      success: false,
      unresolved: true,
      uprn: null,
      provider: 'propertydata',
      alternativeMatches: [{ uprn: '1' }, { uprn: '2' }],
    }),
  };
  const resolved = await resolvePropertyIdentity({
    id: 10,
    house_number: '12',
    zip_code: 'B1 2UJ',
  }, { allowPaidIdentity: true, deps: listingDeps(store, provider) });
  assert.strictEqual(resolved.unresolved, true);
  assert.ok(!resolved.identity.uprn);
});

asyncTest('provider failure does not block listing identity', async () => {
  const store = memoryIdentityStore();
  const provider = {
    isAvailable: () => true,
    resolveIdentity: async () => {
      throw new Error('provider down');
    },
  };
  const resolved = await resolvePropertyIdentity({
    id: 11,
    house_number: '12',
    zip_code: 'B1 2UJ',
  }, { allowPaidIdentity: true, deps: listingDeps(store, provider) });
  assert.strictEqual(resolved.success, true);
  assert.strictEqual(resolved.identity.paon, '12');
  assert.ok(!resolved.identity.uprn);
});

asyncTest('idempotent enrichment does not repeat paid lookup', async () => {
  const store = memoryIdentityStore();
  let calls = 0;
  const provider = {
    isAvailable: () => true,
    resolveIdentity: async () => {
      calls += 1;
      return {
        success: true,
        uprn: '555',
        provider: 'propertydata',
        alternativeMatches: [],
      };
    },
  };
  const listing = { id: 12, house_number: '12', zip_code: 'B1 2UJ' };
  const deps = listingDeps(store, provider);
  await resolvePropertyIdentity(listing, { allowPaidIdentity: true, deps });
  await resolvePropertyIdentity(listing, { allowPaidIdentity: true, deps });
  assert.strictEqual(calls, 1);
});

asyncTest('analyse-style skip does not pay for identity', async () => {
  const store = memoryIdentityStore();
  let calls = 0;
  const provider = {
    isAvailable: () => true,
    resolveIdentity: async () => {
      calls += 1;
      return { success: true, uprn: '9', provider: 'propertydata' };
    },
  };
  await resolvePropertyIdentity({
    id: 13,
    house_number: '12',
    zip_code: 'B1 2UJ',
  }, { allowPaidIdentity: false, deps: listingDeps(store, provider) });
  assert.strictEqual(calls, 0);
});

asyncTest('HMLR exact canonical address uses persisted/canonical PAON including trim', async () => {
  const db = createMemoryOfficialSaleStore();
  const file = writeTemp('paon', `${ppdLine({ id: '{SUBJ}', paon: '12', postcode: 'B1 2UJ' })}\n`);
  await importPricePaid({ ppdPath: file, store: db, releaseLabel: 'p' });
  const listing = extractCanonicalAddress({
    house_number: '12 ',
    zip_code: 'B1 2UJ',
  });
  const exact = await queryOfficialSaleTransactions({
    identity: { listingId: 1, paon: listing.paon, postcode: listing.postcode },
    property: { house_number: '12 ', zip_code: 'B1 2UJ' },
    store: db,
  });
  assert.strictEqual(exact.matchMethod, MATCH_METHOD.EXACT_CANONICAL_ADDRESS);
  const wrongUnit = await queryOfficialSaleTransactions({
    identity: { listingId: 2, paon: '12', saon: 'FLAT 6', postcode: 'B1 2UJ' },
    property: { house_number: '12', zip_code: 'B1 2UJ' },
    store: db,
  });
  assert.notStrictEqual(wrongUnit.matchMethod, MATCH_METHOD.EXACT_CANONICAL_ADDRESS);
  const suffix = await queryOfficialSaleTransactions({
    identity: { listingId: 3, paon: '12A', postcode: 'B1 2UJ' },
    property: { house_number: '12A', zip_code: 'B1 2UJ' },
    store: db,
  });
  assert.notStrictEqual(suffix.matchMethod, MATCH_METHOD.EXACT_CANONICAL_ADDRESS);
  fs.unlinkSync(file);
});

asyncTest('HMLR exact UPRN when identity has unique UPRN', async () => {
  const db = createMemoryOfficialSaleStore();
  const file = writeTemp('uprn', `${ppdLine({ id: '{U}', paon: '99', postcode: 'B1 2UJ' })}\n`);
  await importPricePaid({ ppdPath: file, store: db, releaseLabel: 'u' });
  await db.applyLookups('uprn', [{ sourceTransactionId: '{U}', value: '100099' }]);
  const result = await queryOfficialSaleTransactions({
    identity: { listingId: 4, uprn: '100099' },
    property: { house_number: '12', zip_code: 'B1 2UJ' },
    store: db,
  });
  assert.strictEqual(result.matchMethod, MATCH_METHOD.EXACT_UPRN);
  fs.unlinkSync(file);
});

test('valuation and comparable engines remain isolated from identity/HMLR', () => {
  const comparable = read('../services/ai/comparableEngine.js');
  const valuation = read('../services/ai/valuationEngine.js');
  const sale = read('../services/ai/saleIntelligenceService.js');
  assert.ok(!/officialSale|hmlrPricePaid|canonicalIdentity/.test(comparable));
  assert.ok(!/officialSale|hmlrPricePaid|canonicalIdentity/.test(valuation));
  assert.ok(!/officialSale|hmlrPricePaid/.test(sale));
});

test('history renderer does not re-enrich identity or HMLR', () => {
  const history = read('../../client/src/Utils/savedIntelligenceReport.js');
  assert.ok(!/enrich-listing-identity|queryOfficialSaleTransactions|resolvePropertyIdentity/.test(history));
  assert.ok(/Does not rewrite stored output_data/.test(history));
});

test('geography safety is unchanged', () => {
  const query = read('../services/market/officialSaleTransactionQuery.js');
  assert.ok(/SOURCE_OUTSIDE_GEOGRAPHY/.test(query));
  assert.ok(/SCOTLAND_OR_NI/.test(query));
});

test('no similarity-based identity in canonicaliser', () => {
  const src = read('../services/identity/canonicalAddress.js');
  assert.ok(!/Levenshtein|diceCoefficient|jaroWinkler/i.test(src));
});

(async () => {
  for (const item of pending) {
    await item.fn();
    console.log(`  ok  ${item.name}`);
  }
  console.log('\ncanonicalIdentity.test.js — all passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
