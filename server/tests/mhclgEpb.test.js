/**
 * Official MHCLG EPB acquisition, matching, persistence, and isolation.
 * Run: node server/tests/mhclgEpb.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  EPB_ATTACHMENT,
  EPB_CAPABILITY,
  EPB_ERROR,
  CERTIFICATE_TYPE,
  isOfficialMissing,
  officialNumber,
  normalizeCertificateNumber,
  stripRestrictedAddress,
  OFFICIAL_EPB_EVIDENCE_VERSION,
  IDENTITY_VERIFICATION_STATE,
  DOMAIN_ID,
  platformRegistry,
} = require('../architecture');
const { parseSearchCandidate, parseCertificate, parseDomesticFacts, latestCertificate } = require('../services/providers/mhclgEpb/mhclgEpbParser');
const { epbGeographyStatus } = require('../services/providers/mhclgEpb/mhclgEpbGeography');
const { evaluateEpbCandidates, paonEqual, unitsEqual } = require('../services/providers/mhclgEpb/mhclgEpbMatcher');
const { createMhclgEpbClient, classifyHttp, redactHeaders } = require('../services/providers/mhclgEpb/mhclgEpbClient');
const { acquireOfficialEpbEvidence, getEpbCapability, toClientSnapshot } = require('../services/providers/mhclgEpb/mhclgEpbAcquisition');
const { createMemoryEpbStore } = require('../services/providers/mhclgEpb/mhclgEpbRepository');
const { persistOfficialEpbUprn } = require('../services/identity/canonicalIdentityService');
const { adaptBuildingConditionFoundation } = require('../services/domains/buildingConditionDomain');
const { assemblePropertyFacts } = require('../services/ai/propertyFacts');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`Use asyncTest for ${name}`);
  }
  console.log(`  ok  ${name}`);
}

const pending = [];
function asyncTest(name, fn) {
  pending.push({ name, fn });
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

function listing(overrides = {}) {
  return {
    id: 12,
    house_number: '12',
    street_name: 'High Street',
    address_line1: '12 High Street',
    zip_code: 'B1 2UJ',
    title: 'EPB fixture',
    category: 'sale',
    property_type: 'terraced',
    price: 200000,
    ...overrides,
  };
}

function candidate(overrides = {}) {
  return {
    certificateNumber: '1111-2222-3333-4444-5555',
    certificateType: CERTIFICATE_TYPE.DOMESTIC,
    uprn: '100012345678',
    currentEnergyRating: 'C',
    registrationDate: '2022-03-01',
    inspectionDate: '2022-02-20',
    address: {
      addressLine1: '12 High Street',
      addressLine2: null,
      postcode: 'B1 2UJ',
    },
    ...overrides,
  };
}

function mockClient({
  domestic = [],
  nonDomestic = [],
  certificate = null,
  searchError = null,
  fetchStatus = 200,
  rateLimitedOnce = false,
} = {}) {
  let searchCalls = 0;
  let fetchCalls = 0;
  let rateHits = 0;
  return {
    searchCalls: () => searchCalls,
    fetchCalls: () => fetchCalls,
    async search(type) {
      searchCalls += 1;
      if (searchError) {
        return { ok: false, capability: EPB_CAPABILITY.SOURCE_ERROR, errorCode: searchError, rows: [], pagination: {} };
      }
      const rows = type === CERTIFICATE_TYPE.NON_DOMESTIC ? nonDomestic : domestic;
      return {
        ok: true,
        rows,
        pagination: { totalRecords: rows.length, pageSize: 100, currentPage: 1, totalPages: 1 },
      };
    },
    async fetchCertificate() {
      fetchCalls += 1;
      if (rateLimitedOnce && rateHits === 0) {
        rateHits += 1;
        return { ok: false, errorCode: EPB_ERROR.RATE_LIMITED, status: 429, data: null };
      }
      if (fetchStatus >= 500) {
        return { ok: false, errorCode: EPB_ERROR.HTTP_5XX, status: fetchStatus, data: null };
      }
      if (fetchStatus >= 400) {
        return { ok: false, errorCode: EPB_ERROR.HTTP_4XX, status: fetchStatus, data: null };
      }
      if (!certificate) return { ok: true, empty: true, data: null };
      return { ok: true, empty: false, data: { data: certificate } };
    },
  };
}

const configWithToken = {
  enabled: true,
  bearerToken: 'test-token-not-for-production',
  baseUrl: 'https://api.get-energy-performance-data.communities.gov.uk',
  timeoutMs: 1000,
  maxRetries: 1,
  pageSize: 100,
  maxCandidates: 200,
  refreshTtlMs: 30 * 24 * 60 * 60 * 1000,
};

console.log('official MHCLG EPB evidence\n');

test('contract version and LMK_KEY independence', () => {
  assert.strictEqual(OFFICIAL_EPB_EVIDENCE_VERSION, 'official-epb-evidence-1.0.0');
  const parser = read('../services/providers/mhclgEpb/mhclgEpbParser.js');
  const matcher = read('../services/providers/mhclgEpb/mhclgEpbMatcher.js');
  const repo = read('../db/migrations/026_official_epb_certificates.sql');
  assert.ok(parser.includes('certificateNumber'));
  assert.ok(parser.includes('lmkKeyIgnored'));
  assert.ok(!matcher.includes('lmk-key') && !matcher.includes('lmkKey'));
  assert.ok(repo.includes('certificate_number'));
  assert.ok(!repo.includes('lmk_key'));
});

test('missing credential fails safely and is not assessed', () => {
  const cap = getEpbCapability({ enabled: true, bearerToken: '' });
  assert.strictEqual(cap.capability, EPB_CAPABILITY.UNAVAILABLE_MISSING_CREDENTIAL);
  assert.strictEqual(cap.available, false);
});

asyncTest('missing credential acquisition does not pretend assessment', async () => {
  const result = await acquireOfficialEpbEvidence({
    property: listing(),
    deps: { config: { enabled: true, bearerToken: '' }, skipCoalesce: true },
  });
  assert.strictEqual(result.status, EPB_ATTACHMENT.UNAVAILABLE_MISSING_CREDENTIAL);
  assert.ok(!result.client.current?.energyRating);
  assert.ok(JSON.stringify(result).includes('not configured') || result.limitations.join(' ').includes('bearer token'));
});

test('geography gate Scotland and NI', () => {
  assert.strictEqual(epbGeographyStatus('EH1 1YZ').status, EPB_ATTACHMENT.SOURCE_OUTSIDE_GEOGRAPHY);
  assert.strictEqual(epbGeographyStatus('BT1 1AA').status, EPB_ATTACHMENT.SOURCE_OUTSIDE_GEOGRAPHY);
  assert.strictEqual(epbGeographyStatus('B1 2UJ').inside, true);
  assert.strictEqual(epbGeographyStatus(null).status, EPB_ATTACHMENT.GEOGRAPHY_NOT_ESTABLISHED);
  assert.strictEqual(epbGeographyStatus('').status, EPB_ATTACHMENT.GEOGRAPHY_NOT_ESTABLISHED);
  assert.strictEqual(epbGeographyStatus('TD15 1AA').inside, true);
});

asyncTest('geography gate does not become false zero energy', async () => {
  const result = await acquireOfficialEpbEvidence({
    property: listing({ zip_code: 'G1 1AA' }),
    deps: { config: configWithToken, skipCoalesce: true },
  });
  assert.strictEqual(result.status, EPB_ATTACHMENT.SOURCE_OUTSIDE_GEOGRAPHY);
  const { envelope } = adaptBuildingConditionFoundation({
    identity: { listingId: 12 },
    epbEvidence: result,
  });
  assert.ok(!/no EPC|NO ENERGY DATA|NO BUILDING/.test(JSON.stringify(envelope.findings).toUpperCase()));
  assert.ok(envelope.findings.some((row) => /England and Wales only/i.test(row.text)));
});

test('domestic search parsing uses certificateNumber', () => {
  const row = parseSearchCandidate({
    certificateNumber: '1111-2222-3333-4444-5555',
    addressLine1: '12 High Street',
    postcode: 'B1 2UJ',
    currentEnergyEfficiencyBand: 'C',
    registrationDate: '2022-03-01',
    uprn: 100012345678,
    'lmk-key': 'should-be-ignored',
  }, CERTIFICATE_TYPE.DOMESTIC);
  assert.strictEqual(row.certificateNumber, '1111-2222-3333-4444-5555');
  assert.strictEqual(row.uprn, '100012345678');
  assert.strictEqual(row.lmkKeyIgnored, true);
});

test('non-domestic search parsing', () => {
  const row = parseSearchCandidate({
    certificate_number: '9999-8888-7777-6666-5555',
    address_line_1: 'Warehouse 12',
    postcode: 'B1 2UJ',
    asset_rating_band: 'D',
    uprn: '000000111222',
  }, CERTIFICATE_TYPE.NON_DOMESTIC);
  assert.strictEqual(row.certificateType, CERTIFICATE_TYPE.NON_DOMESTIC);
  assert.strictEqual(row.certificateNumber, '9999-8888-7777-6666-5555');
  assert.strictEqual(row.uprn, '111222');
});

test('certificate fetch parsing snake_case and sentinels', () => {
  const parsed = parseCertificate({
    data: {
      certificate_number: '1111-2222-3333-4444-5555',
      total_floor_area: 'NO DATA!',
      current_energy_rating: 'C',
      potential_energy_rating: 'N/A',
      construction_age_band: 'Not recorded',
      built_form: 'Mid Terrace',
      walls_description: 'INVALID',
      inspection_date: '2022-02-20',
      address_line_1: '12 High Street',
      postcode: 'B1 2UJ',
    },
  }, CERTIFICATE_TYPE.DOMESTIC);
  assert.strictEqual(parsed.facts.currentEnergyRating, 'C');
  assert.ok(!parsed.facts.totalFloorAreaSqm);
  assert.ok(!parsed.facts.potentialEnergyRating);
  assert.ok(!parsed.facts.constructionAgeBand);
  assert.ok(!parsed.facts.wallDescription);
  assert.strictEqual(parsed.facts.builtForm, 'Mid Terrace');
  assert.ok(!parsed.facts.postcode);
  assert.ok(!parsed.facts.addressLine1);
});

test('official sentinels never become zero or factual strings', () => {
  assert.strictEqual(isOfficialMissing('NO DATA!'), true);
  assert.strictEqual(isOfficialMissing('N/A'), true);
  assert.strictEqual(officialNumber('NO DATA!'), null);
  assert.strictEqual(officialNumber(0), null);
  assert.strictEqual(officialNumber('74'), 74);
  const facts = parseDomesticFacts({ total_floor_area: '', current_energy_rating: 'INVALID' });
  assert.strictEqual(facts.totalFloorAreaSqm, null);
  assert.strictEqual(facts.currentEnergyRating, null);
});

test('12 vs 12A and Flat 5 vs Flat 6 never attach wrongly', () => {
  assert.strictEqual(paonEqual('12', '12A'), false);
  assert.strictEqual(unitsEqual('Flat 5', 'Flat 6'), false);
  const twelveA = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '12' },
    [candidate({ address: { addressLine1: '12A High Street', postcode: 'B1 2UJ' } })]
  );
  assert.strictEqual(twelveA.status, EPB_ATTACHMENT.NO_MATCH_FOUND);
  const flats = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '12', saon: 'Flat 5' },
    [
      candidate({
        certificateNumber: '1111-0000-0000-0000-0005',
        address: { addressLine1: 'Flat 6', addressLine2: '12 High Street', postcode: 'B1 2UJ' },
        uprn: '1',
      }),
    ]
  );
  assert.strictEqual(flats.status, EPB_ATTACHMENT.NO_MATCH_FOUND);
});

test('postcode-only never attaches; multiple units unresolved', () => {
  const postcodeOnly = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: null },
    [candidate()]
  );
  assert.strictEqual(postcodeOnly.status, EPB_ATTACHMENT.UNRESOLVED_IDENTITY);
  assert.strictEqual(postcodeOnly.reason, 'POSTCODE_ONLY');
  const multi = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '12' },
    [
      candidate({
        certificateNumber: 'a',
        address: { addressLine1: 'Flat 5', addressLine2: '12 High Street', postcode: 'B1 2UJ' },
        uprn: '1',
      }),
      candidate({
        certificateNumber: 'b',
        address: { addressLine1: 'Flat 6', addressLine2: '12 High Street', postcode: 'B1 2UJ' },
        uprn: '2',
      }),
    ]
  );
  assert.strictEqual(multi.status, EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY);
  assert.ok(['MULTIPLE_UNITS', 'BUILDING_VS_UNIT', 'MULTIPLE_UPRNS', 'MISSING_SAON'].includes(multi.reason));
});

test('building vs unit and multiple UPRNs stay unresolved', () => {
  const building = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '12' },
    [candidate({
      address: { addressLine1: 'Flat 5', addressLine2: '12 High Street', postcode: 'B1 2UJ' },
    })]
  );
  assert.strictEqual(building.status, EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY);
  const uprns = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '12', saon: 'Flat 5' },
    [
      candidate({ certificateNumber: 'a', uprn: '111', address: { addressLine1: 'Flat 5', addressLine2: '12 High Street', postcode: 'B1 2UJ' } }),
      candidate({ certificateNumber: 'b', uprn: '222', address: { addressLine1: 'Flat 5', addressLine2: '12 High Street', postcode: 'B1 2UJ' } }),
    ]
  );
  assert.strictEqual(uprns.status, EPB_ATTACHMENT.UNRESOLVED_IDENTITY);
  assert.strictEqual(uprns.reason, 'MULTIPLE_UPRNS');
});

test('unique house attach; UPRN missing still attaches physical facts', () => {
  const matched = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '12' },
    [candidate({ uprn: null }), candidate({
      certificateNumber: '1111-2222-3333-4444-0002',
      uprn: null,
      registrationDate: '2018-01-01',
      address: { addressLine1: '12 High Street', postcode: 'B1 2UJ' },
    })]
  );
  assert.strictEqual(matched.status, EPB_ATTACHMENT.UNIQUE_ATTACH);
  assert.strictEqual(matched.uprn, null);
  assert.strictEqual(matched.matches.length, 2);
  const current = latestCertificate(matched.matches.map((row) => ({
    ...row,
    lodgementDate: row.registrationDate,
  })));
  assert.strictEqual(current.certificateNumber, '1111-2222-3333-4444-5555');
});

test('named building exact match; adjacent house does not attach', () => {
  const named = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: 'Rose Cottage' },
    [candidate({ address: { addressLine1: 'Rose Cottage', addressLine2: 'High Street', postcode: 'B1 2UJ' } })]
  );
  assert.strictEqual(named.status, EPB_ATTACHMENT.UNIQUE_ATTACH);
  const adjacent = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '12' },
    [candidate({ address: { addressLine1: '14 High Street', postcode: 'B1 2UJ' } })]
  );
  assert.strictEqual(adjacent.status, EPB_ATTACHMENT.NO_MATCH_FOUND);
});

test('house number on addressLine3 still exact-matches PAON', () => {
  const match = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '12' },
    [candidate({
      address: { addressLine1: 'High Street', addressLine2: 'Birmingham', addressLine3: '12', postcode: 'B1 2UJ' },
    })]
  );
  assert.strictEqual(match.status, EPB_ATTACHMENT.UNIQUE_ATTACH);
  const noMatch = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '14' },
    [candidate({
      address: { addressLine1: 'High Street', addressLine2: 'Birmingham', addressLine3: '12', postcode: 'B1 2UJ' },
    })]
  );
  assert.strictEqual(noMatch.status, EPB_ATTACHMENT.NO_MATCH_FOUND);
});

test('live fetch JSON without certificateNumber keeps fallback and nested fabric', () => {
  const parsed = parseCertificate({
    data: {
      current_energy_efficiency_band: 'C',
      potential_energy_efficiency_band: 'B',
      total_floor_area: 74,
      built_form: 'Mid Terrace',
      walls: [{ description: 'Solid brick' }],
      roofs: [{ description: 'Pitched, insulated' }],
      property_type: 2,
      tenure: 1,
      address_line_1: '12 High Street',
      postcode: 'B1 2UJ',
    },
  }, CERTIFICATE_TYPE.DOMESTIC, '1111-2222-3333-4444-5555');
  assert.strictEqual(parsed.certificateNumber, '1111-2222-3333-4444-5555');
  assert.strictEqual(parsed.facts.currentEnergyRating, 'C');
  assert.strictEqual(parsed.facts.wallDescription, 'Solid brick');
  assert.strictEqual(parsed.facts.propertyType, undefined);
  assert.strictEqual(parsed.facts.occupancyTenure, undefined);
  assert.ok(!parsed.facts.postcode);
});

test('unit listing without SAON never attaches a building certificate', () => {
  const buildingCert = candidate({
    address: { addressLine1: '12 High Street', postcode: 'B1 2UJ' },
  });
  const flatListing = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '12', propertyType: 'flat' },
    [buildingCert]
  );
  assert.strictEqual(flatListing.status, EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY);
  assert.strictEqual(flatListing.reason, 'MISSING_SAON');
  const maisonette = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '12', propertyType: 'maisonette' },
    [buildingCert]
  );
  assert.strictEqual(maisonette.status, EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY);
  const mixedUse = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '12', propertyCategory: 'mixed_use' },
    [buildingCert]
  );
  assert.strictEqual(mixedUse.status, EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY);
  const suite = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '12', addressLine1: 'Suite 3, 12 High Street', propertyType: 'office' },
    [buildingCert]
  );
  assert.strictEqual(suite.status, EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY);
});

test('Flat 5 listing does not attach Flat 6 or a building certificate', () => {
  const buildingVsFlat = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '12', saon: 'Flat 5' },
    [candidate({ address: { addressLine1: '12 High Street', postcode: 'B1 2UJ' } })]
  );
  assert.notStrictEqual(buildingVsFlat.status, EPB_ATTACHMENT.UNIQUE_ATTACH);
  const flat5 = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '12', saon: 'Flat 5' },
    [
      candidate({
        certificateNumber: '1111-0000-0000-0000-0005',
        address: { addressLine1: 'Flat 5', addressLine2: '12 High Street', postcode: 'B1 2UJ' },
        uprn: '5',
      }),
    ]
  );
  assert.strictEqual(flat5.status, EPB_ATTACHMENT.UNIQUE_ATTACH);
});

test('DEC 9999 and JSON-only present fields', () => {
  const { officialEnergyScore } = require('../architecture/epbEvidenceContract');
  assert.strictEqual(officialEnergyScore(9999), null);
  const facts = parseDomesticFacts({
    current_energy_rating: 'C',
    unknown_csv_only_field: 'should-not-be-copied',
  });
  assert.strictEqual(facts.currentEnergyRating, 'C');
  assert.strictEqual(facts.unknown_csv_only_field, undefined);
  assert.strictEqual(facts.builtForm, null);
});

asyncTest('unique attach persists idempotently and keeps certificate history', async () => {
  const store = createMemoryEpbStore();
  const client = mockClient({
    domestic: [
      candidate({ certificateNumber: '1111-2222-3333-4444-0001', registrationDate: '2018-01-01' }),
      candidate({ certificateNumber: '1111-2222-3333-4444-0002', registrationDate: '2022-03-01' }),
    ],
    certificate: {
      certificateNumber: '1111-2222-3333-4444-0002',
      current_energy_rating: 'C',
      total_floor_area: 74,
      built_form: 'Mid Terrace',
      construction_age_band: '1996-2002',
      potential_energy_rating: 'B',
      inspection_date: '2022-02-20',
      uprn: 100012345678,
    },
  });
  const first = await acquireOfficialEpbEvidence({
    property: listing(),
    deps: {
      config: configWithToken,
      client,
      store,
      skipCoalesce: true,
      persistOfficialEpbUprn: async () => null,
    },
  });
  assert.strictEqual(first.status, EPB_ATTACHMENT.UNIQUE_ATTACH);
  assert.strictEqual(first.currentCertificate.facts.totalFloorAreaSqm, 74);
  const second = await acquireOfficialEpbEvidence({
    property: listing(),
    deps: {
      config: configWithToken,
      client,
      store,
      skipCoalesce: true,
      persistOfficialEpbUprn: async () => null,
    },
  });
  assert.strictEqual(second.cacheHit, true);
  assert.strictEqual(store._certificates.length, 2);
  const again = await acquireOfficialEpbEvidence({
    property: listing(),
    deps: {
      config: { ...configWithToken, refreshTtlMs: 0 },
      client,
      store,
      skipCoalesce: true,
      skipCache: true,
      persistOfficialEpbUprn: async () => null,
    },
  });
  assert.strictEqual(store._certificates.length, 2);
  assert.strictEqual(again.status, EPB_ATTACHMENT.UNIQUE_ATTACH);
});

asyncTest('provider search is postcode discovery and does not send PAON as address', async () => {
  const calls = [];
  const client = {
    async search(type, params) {
      calls.push({ type, address: params.address, postcode: params.postcode, page: params.page });
      if (type === CERTIFICATE_TYPE.NON_DOMESTIC) {
        return { ok: true, rows: [], pagination: { totalPages: 1, totalRecords: 0 } };
      }
      return {
        ok: true,
        rows: [candidate()],
        pagination: { totalPages: 1, totalRecords: 1, currentPage: 1 },
      };
    },
    async fetchCertificate() {
      return {
        ok: true,
        data: { data: { certificateNumber: '1111-2222-3333-4444-5555', current_energy_rating: 'C' } },
      };
    },
  };
  const result = await acquireOfficialEpbEvidence({
    property: listing(),
    deps: {
      config: configWithToken,
      client,
      store: createMemoryEpbStore(),
      skipCoalesce: true,
      persistOfficialEpbUprn: async () => null,
    },
  });
  assert.strictEqual(result.status, EPB_ATTACHMENT.UNIQUE_ATTACH);
  assert.ok(calls.length >= 2);
  assert.ok(calls.every((row) => row.address == null || row.address === undefined));
  assert.ok(calls.every((row) => Boolean(row.postcode)));
});

asyncTest('bounded pagination can attach a PAON that is not on page 1', async () => {
  const client = {
    async search(type, params) {
      if (type === CERTIFICATE_TYPE.NON_DOMESTIC) {
        return { ok: true, rows: [], pagination: { totalPages: 1, totalRecords: 0 } };
      }
      if ((params.page || 1) === 1) {
        return {
          ok: true,
          rows: [candidate({
            certificateNumber: 'OTHER-0000-0000-0000-0099',
            address: { addressLine1: '99 Other Street', postcode: 'B1 2UJ' },
          })],
          pagination: { totalPages: 2, totalRecords: 2, currentPage: 1, pageSize: 1 },
        };
      }
      return {
        ok: true,
        rows: [candidate()],
        pagination: { totalPages: 2, totalRecords: 2, currentPage: 2, pageSize: 1 },
      };
    },
    async fetchCertificate() {
      return {
        ok: true,
        data: { data: { certificateNumber: '1111-2222-3333-4444-5555', current_energy_rating: 'C' } },
      };
    },
  };
  const result = await acquireOfficialEpbEvidence({
    property: listing(),
    deps: {
      config: { ...configWithToken, pageSize: 1, maxSearchPages: 5 },
      client,
      store: createMemoryEpbStore(),
      skipCoalesce: true,
      persistOfficialEpbUprn: async () => null,
    },
  });
  assert.strictEqual(result.status, EPB_ATTACHMENT.UNIQUE_ATTACH);
});

asyncTest('new certificate does not destroy old evidence', async () => {
  const store = createMemoryEpbStore();
  const firstClient = mockClient({
    domestic: [candidate({ certificateNumber: 'OLD-CERT-0000-0000-0001', registrationDate: '2018-01-01' })],
    certificate: {
      certificateNumber: 'OLD-CERT-0000-0000-0001',
      current_energy_rating: 'E',
      total_floor_area: 70,
    },
  });
  await acquireOfficialEpbEvidence({
    property: listing(),
    deps: {
      config: { ...configWithToken, refreshTtlMs: 0 },
      client: firstClient,
      store,
      skipCoalesce: true,
      persistOfficialEpbUprn: async () => null,
    },
  });
  const secondClient = mockClient({
    domestic: [
      candidate({ certificateNumber: 'OLD-CERT-0000-0000-0001', registrationDate: '2018-01-01' }),
      candidate({ certificateNumber: 'NEW-CERT-0000-0000-0002', registrationDate: '2024-06-01' }),
    ],
    certificate: {
      certificateNumber: 'NEW-CERT-0000-0000-0002',
      current_energy_rating: 'C',
      total_floor_area: 74,
    },
  });
  const refreshed = await acquireOfficialEpbEvidence({
    property: listing(),
    deps: {
      config: { ...configWithToken, refreshTtlMs: 0 },
      client: secondClient,
      store,
      skipCache: true,
      skipCoalesce: true,
      persistOfficialEpbUprn: async () => null,
    },
  });
  assert.strictEqual(store._certificates.length, 2);
  assert.strictEqual(normalizeCertificateNumber(refreshed.currentCertificate.certificateNumber), 'NEW-CERT-0000-0000-0002');
  assert.ok(store._certificates.some((row) => row.certificate_number === 'OLD-CERT-0000-0000-0001'));
});

asyncTest('timeout and 5xx map to SOURCE_ERROR not negative evidence', async () => {
  const timeout = await acquireOfficialEpbEvidence({
    property: listing(),
    deps: {
      config: configWithToken,
      client: mockClient({ searchError: EPB_ERROR.TIMEOUT }),
      store: createMemoryEpbStore(),
      skipCoalesce: true,
    },
  });
  assert.strictEqual(timeout.status, EPB_ATTACHMENT.SOURCE_ERROR);
  assert.strictEqual(timeout.errorCode, EPB_ERROR.TIMEOUT);
  const http = await acquireOfficialEpbEvidence({
    property: listing(),
    deps: {
      config: configWithToken,
      client: mockClient({ searchError: EPB_ERROR.HTTP_5XX }),
      store: createMemoryEpbStore(),
      skipCoalesce: true,
    },
  });
  assert.strictEqual(http.status, EPB_ATTACHMENT.SOURCE_ERROR);
});

asyncTest('rate-limit and 4xx are source errors', async () => {
  const limited = await acquireOfficialEpbEvidence({
    property: listing(),
    deps: {
      config: configWithToken,
      client: mockClient({ searchError: EPB_ERROR.RATE_LIMITED }),
      store: createMemoryEpbStore(),
      skipCoalesce: true,
    },
  });
  assert.strictEqual(limited.errorCode, EPB_ERROR.RATE_LIMITED);
  assert.strictEqual(classifyHttp(429), EPB_ERROR.RATE_LIMITED);
  assert.strictEqual(classifyHttp(400), EPB_ERROR.HTTP_4XX);
});

asyncTest('fetched certificate UPRN persists when search rows omit UPRN', async () => {
  const upserts = [];
  const client = mockClient({
    domestic: [candidate({ uprn: null })],
    certificate: {
      certificateNumber: '1111-2222-3333-4444-5555',
      current_energy_rating: 'C',
      uprn: 100012345678,
    },
  });
  await acquireOfficialEpbEvidence({
    property: listing(),
    deps: {
      config: configWithToken,
      client,
      store: createMemoryEpbStore(),
      skipCoalesce: true,
      persistOfficialEpbUprn: async (property, resolved) => {
        upserts.push(resolved);
        return resolved;
      },
    },
  });
  assert.strictEqual(String(upserts[0].uprn), '100012345678');
});

asyncTest('UPRN persist is SOURCE_ASSERTED not VERIFIED_EXACT and conflicts stay visible', async () => {
  const events = [];
  const upserts = [];
  const saved = await persistOfficialEpbUprn(
    listing(),
    { uprn: '1000999', certificateNumber: '1111-2222-3333-4444-5555', retrievedAt: '2026-09-01T00:00:00.000Z' },
    null,
    {
      findIdentityByPropertyId: async () => ({ property_id: 12, uprn: null, paon: '12' }),
      upsertIdentity: async (row) => {
        upserts.push(row);
        return row;
      },
      recordIdentityEvent: async (row) => events.push(row),
    }
  );
  assert.strictEqual(saved.verificationState, IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED);
  assert.notStrictEqual(saved.verificationState, IDENTITY_VERIFICATION_STATE.VERIFIED_EXACT);
  assert.strictEqual(saved.identitySource, 'MHCLG_EPBD');
  const conflicted = await persistOfficialEpbUprn(
    listing(),
    { uprn: '2000002', certificateNumber: 'x' },
    { uprn: '1000999', identity_state: 'SOURCE_ASSERTED' },
    {
      findIdentityByPropertyId: async () => ({ uprn: '1000999' }),
      upsertIdentity: async (row) => row,
      recordIdentityEvent: async (row) => events.push(row),
    }
  );
  assert.strictEqual(conflicted.uprn, '1000999');
  assert.strictEqual(events[0].payload.silentlyOverwritten, false);
});

test('restricted address is stripped from client snapshot and persistence facts', () => {
  const client = toClientSnapshot({
    status: EPB_ATTACHMENT.UNIQUE_ATTACH,
    attachmentStatus: EPB_ATTACHMENT.UNIQUE_ATTACH,
    currentCertificate: {
      certificateNumber: '1111-2222-3333-4444-5555',
      certificateType: 'DOMESTIC',
      facts: {
        currentEnergyRating: 'C',
        totalFloorAreaSqm: 74,
        addressLine1: '12 High Street',
        postcode: 'B1 2UJ',
      },
    },
    certificates: [],
    retrievedAt: '2026-09-01T00:00:00.000Z',
    limitations: [],
  });
  const blob = JSON.stringify(client);
  assert.ok(!blob.includes('12 High Street'));
  assert.ok(!/B1 2UJ/.test(blob) || blob.includes('MHCLG'));
  assert.ok(!blob.includes('addressLine1'));
  const stripped = stripRestrictedAddress({ postcode: 'B1 2UJ', addressLine1: 'secret', currentEnergyRating: 'C' });
  assert.strictEqual(stripped.postcode, undefined);
  assert.strictEqual(stripped.currentEnergyRating, 'C');
});

test('token is never exposed or logged by client helpers', () => {
  const redacted = redactHeaders({ Authorization: 'Bearer super-secret-token' });
  assert.strictEqual(redacted.Authorization, 'Bearer [redacted]');
  const clientSrc = read('../services/providers/mhclgEpb/mhclgEpbClient.js');
  assert.ok(clientSrc.includes('[redacted]'));
  assert.ok(!clientSrc.includes('console.info(config.bearerToken)'));
  const acq = read('../services/providers/mhclgEpb/mhclgEpbAcquisition.js');
  assert.ok(!acq.includes('console.info') || acq.includes('logEpb'));
});

test('client snapshot does not include candidate lists', () => {
  const client = toClientSnapshot({
    status: EPB_ATTACHMENT.UNRESOLVED_IDENTITY,
    matches: [candidate()],
    candidates: [candidate()],
    limitations: [],
  });
  assert.ok(!client.matches);
  assert.ok(!client.candidates);
});

test('building domain activates energy/physical only', () => {
  const { envelope } = adaptBuildingConditionFoundation({
    identity: { listingId: 12 },
    epbEvidence: {
      attachmentStatus: 'UNIQUE_ATTACH',
      certificateNumber: '1111-2222-3333-4444-5555',
      inspectionDate: '2022-02-20',
      current: { energyRating: 'C', floorAreaSqm: 74, builtForm: 'Mid-terrace' },
    },
  });
  assert.strictEqual(envelope.assessment.energyPhysicalEvidenceAssessed, true);
  assert.strictEqual(envelope.assessment.professionalBuildingConditionAssessed, false);
  assert.strictEqual(envelope.assessment.liveConditionAssessmentAvailable, false);
  assert.ok(envelope.findings.some((row) => /ENERGY \/ PHYSICAL EVIDENCE ASSESSED/.test(row.text)));
  assert.ok(envelope.findings.some((row) => /PROFESSIONAL BUILDING CONDITION NOT ASSESSED/.test(row.text)));
  const blob = JSON.stringify(envelope);
  assert.ok(!/structurally sound|defect conclusion|capex|subsidence/i.test(blob));
});

test('property facts consume official EPB without scoring activation', () => {
  const facts = assemblePropertyFacts({
    property: listing({ epc_rating: 'D', square_feet: 800 }),
    epbEvidence: {
      attachmentStatus: 'UNIQUE_ATTACH',
      certificateNumber: '1111-2222-3333-4444-5555',
      current: { energyRating: 'C', floorAreaSqm: 74, constructionAgeBand: '1996-2002', builtForm: 'Mid-terrace', potentialEnergyRating: 'B' },
    },
  });
  assert.strictEqual(facts.facts.epcRating.value, 'C');
  assert.strictEqual(facts.facts.epcRating.source, 'MHCLG_EPBD');
  assert.strictEqual(facts.facts.floorArea.value, 74);
  assert.strictEqual(facts.facts.floorArea.unit, 'SQM');
  assert.strictEqual(facts.facts.floorArea.scoringActivated, false);
  assert.strictEqual(facts.facts.epcPotentialRating.modelledImprovement, true);
  assert.notStrictEqual(facts.facts.epcPotentialRating.value, facts.facts.epcRating.value);
});

test('asset class is not inferred from EPC type', () => {
  const facts = assemblePropertyFacts({
    property: listing({ property_type: 'unknown' }),
    epbEvidence: {
      attachmentStatus: 'UNIQUE_ATTACH',
      current: { propertyType: 'Non-Domestic', energyRating: 'C' },
    },
  });
  const runtime = read('../services/identity/assetClassificationRuntime.js');
  assert.ok(!runtime.includes('MHCLG_EPBD'));
  assert.ok(facts.facts.epcRating.available);
});

test('no PropertyData paid identity on EPB path', () => {
  const acq = read('../services/providers/mhclgEpb/mhclgEpbAcquisition.js');
  const engine = read('../services/ai/propertyIntelligenceEngine.js');
  assert.ok(!acq.includes('address-match-uprn'));
  assert.ok(!acq.includes('PropertyDataAdapter'));
  assert.ok(engine.includes('allowPaidIdentity: false'));
});

test('HMLR matcher, valuation, comparable, finance, PD, DI isolation', () => {
  const hmlr = read('../services/market/officialSaleTransactionQuery.js');
  const valuation = read('../services/ai/valuationEngine.js');
  const comparable = read('../services/ai/comparableEngine.js');
  const finance = read('../services/ai/financialEngine.js');
  const pd = read('../services/ai/personalDecisionEngine.js');
  const di = read('../services/ai/decisionIntelligence.js');
  const safety = read('../services/ai/valuationAssessmentSafety.js');
  ['mhclgEpb', 'MHCLG_EPBD', 'acquireOfficialEpbEvidence', 'totalFloorAreaSqm'].forEach((needle) => {
    assert.ok(!hmlr.includes(needle), `HMLR matcher must not reference ${needle}`);
    assert.ok(!valuation.includes(needle), `valuation must not reference ${needle}`);
    assert.ok(!comparable.includes(needle), `comparable must not reference ${needle}`);
    assert.ok(!finance.includes(needle), `finance must not reference ${needle}`);
    assert.ok(!pd.includes(needle), `PD must not reference ${needle}`);
    assert.ok(!di.includes(needle), `DI must not reference ${needle}`);
    assert.ok(!safety.includes(needle), `assessment safety must not reference ${needle}`);
  });
});

test('history path does not re-query EPB', () => {
  const history = read('../../client/src/Utils/savedIntelligenceReport.js');
  const detail = read('../../client/src/pages/ai/AiHistoryDetail.js');
  assert.ok(!/acquireOfficialEpbEvidence|mhclgEpb/.test(history));
  assert.ok(!/acquireOfficialEpbEvidence/.test(detail));
});

test('BUILDING_CONDITION is live for energy evidence only', () => {
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.BUILDING_CONDITION).wiredIntoLiveAnalysis, true);
  assert.ok(platformRegistry.getDomain(DOMAIN_ID.BUILDING_CONDITION).dataAccess.includes('OPEN_DATA'));
});

asyncTest('analyse snapshots sanitised EPB evidence and does not pay PropertyData', async () => {
  // Focused hang cause: assemble still queried legal-evidence and HMLR stores.
  // Those paths are isolated here with explicit stubs so this file does not depend on a live DB.
  const store = createMemoryEpbStore();
  const client = mockClient({
    domestic: [candidate()],
    certificate: {
      certificateNumber: '1111-2222-3333-4444-5555',
      current_energy_rating: 'C',
      total_floor_area: 74,
      built_form: 'Mid Terrace',
      address_line_1: '12 High Street',
      postcode: 'B1 2UJ',
    },
  });
  const report = await assemblePropertyIntelligenceReport({
    property: listing(),
    access: {
      allowed: true,
      userId: 1,
      role: 'owner',
      relationship: 'owner',
      accessLevel: 'professional_intelligence',
      propertyId: 12,
    },
    userId: 1,
    target: { propertyId: 12 },
    options: {
      skipExplanation: true,
      skipPostcodeMarket: true,
      skipFlood: true,
      skipPlanning: true,
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      skipOfficialSales: true,
      asOf: '2026-09-01T00:00:00.000Z',
      deps: {
        acquireOfficialEpbEvidence: (args) => acquireOfficialEpbEvidence({
          ...args,
          deps: {
            config: configWithToken,
            client,
            store,
            skipCoalesce: true,
            persistOfficialEpbUprn: async () => null,
          },
        }),
        analyseRent: async () => ({ success: true, recommendedRent: 1100, marketRange: { low: 1000, high: 1200 }, comparables: [] }),
        calculatePropertyValuation: async () => ({ success: true, centralEstimate: 195000, assessmentState: 'assessed' }),
        generatePropertyExplanation: async () => ({ summary: 'template', source: 'template', tokensUsed: 0 }),
        queryOfficialSaleTransactions: async () => null,
        loadLegalEvidenceForAnalysis: async () => ({ documents: [], titleRefs: [] }),
      },
    },
  });
  assert.strictEqual(report.epbEvidence.attachmentStatus, EPB_ATTACHMENT.UNIQUE_ATTACH);
  assert.ok(!JSON.stringify(report.epbEvidence).includes('12 High Street'));
  assert.ok(!JSON.stringify(report.epbEvidence).includes('test-token'));
  assert.ok(report.buildingConditionDomain);
  assert.strictEqual(report.buildingConditionDomain.assessment.professionalBuildingConditionAssessed, false);
  assert.strictEqual(report.marketIntelligence.sale.centralEstimate, 195000);
  assert.strictEqual(report.marketIntelligence.rent.recommendedRent, 1100);
});

test('V1.1 tag unchanged', () => {
  const versions = read('../architecture/versions.js');
  assert.ok(versions.includes("propertyIntelligenceV11: 'property-intelligence-v1.1'"));
});

(async () => {
  for (const item of pending) {
    await item.fn();
    console.log(`  ok  ${item.name}`);
  }
  console.log('\nofficial MHCLG EPB evidence passed');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
