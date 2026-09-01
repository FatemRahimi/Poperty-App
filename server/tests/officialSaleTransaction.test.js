/**
 * Official HMLR Price Paid sale-transaction evidence.
 * Run: node server/tests/officialSaleTransaction.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ASSET_CLASS,
  EVIDENCE_CLASS,
  SOURCE_TYPE,
  MATCH_METHOD,
  IMPORT_STATUS,
  OFFICIAL_SALE_FACT_TYPE,
  OFFICIAL_AREA_SALE_FACT_TYPE,
  toCanonicalTransaction,
  ppdTypeIsNotAssetClass,
} = require('../architecture');
const { parsePpdRow, parseLookupRow, parsePositivePrice } = require('../services/market/hmlrPricePaidParser');
const { createMemoryOfficialSaleStore } = require('../services/market/officialSaleTransactionRepository');
const {
  queryOfficialSaleTransactions,
  isOutsideSourceGeography,
} = require('../services/market/officialSaleTransactionQuery');
const { importPricePaid } = require('../scripts/import-hmlr-price-paid');
const { adaptMarketDomain } = require('../services/domains/marketDomain');
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
  const file = path.join(os.tmpdir(), `hmlr-${name}-${process.pid}-${Date.now()}.csv`);
  fs.writeFileSync(file, contents);
  return file;
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
    house_number: '12',
    bedrooms: 2,
    bathrooms: 1,
    square_feet: 700,
    last_sold_price: 180000,
    last_sold_date: '2015-01-01',
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

function analyseDeps() {
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

async function analyse(propertyOverrides = {}, extra = {}) {
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
      asOf: '2026-08-31T00:00:00.000Z',
      deps: { ...analyseDeps(), ...extra.deps },
      ...extra.options,
    },
  });
}

test('1. valid HMLR transaction parses without invented fields', () => {
  const parsed = parsePpdRow(ppdLine(), { datasetVersion: '2026-07', retrievedAt: '2026-08-31T00:00:00.000Z' });
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.row.source, 'HMLR_PRICE_PAID_DATA');
  assert.strictEqual(parsed.row.source_transaction_id, '{TX-1}');
  assert.strictEqual(parsed.row.price_gbp, 250000);
  assert.strictEqual(parsed.row.price_present, true);
  assert.strictEqual(parsed.row.transfer_date, '2020-03-01');
  assert.strictEqual(parsed.row.property_type_code, 'T');
  assert.strictEqual(parsed.row.paon, '12');
  assert.strictEqual(parsed.row.uprn, null);
  assert.strictEqual(parsed.row.inspire_id, null);
});

test('2. missing numeric price does not become zero', () => {
  const parsed = parsePpdRow(ppdLine({ price: '' }));
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.row.price_gbp, null);
  assert.strictEqual(parsed.row.price_present, false);
  const canonical = toCanonicalTransaction(parsed.row);
  assert.strictEqual(canonical.priceGbp, null);
  assert.strictEqual(canonical.pricePresent, false);
});

test('3. invalid and non-positive prices are rejected', () => {
  assert.strictEqual(parsePositivePrice('0').invalid, true);
  assert.strictEqual(parsePositivePrice('-10').invalid, true);
  assert.strictEqual(parsePpdRow(ppdLine({ price: '0' })).ok, false);
  assert.strictEqual(parsePpdRow(ppdLine({ price: '-5' })).reason, 'invalid_price');
  assert.strictEqual(parsePpdRow(ppdLine({ price: 'abc' })).ok, false);
});

test('4–5. transfer date, source and provenance are preserved separately', () => {
  const parsed = parsePpdRow(ppdLine({ date: '2018-11-20' }), {
    datasetVersion: 'ppd-2018-11',
    retrievedAt: '2026-08-01T12:00:00.000Z',
  });
  const canonical = toCanonicalTransaction(parsed.row);
  assert.strictEqual(canonical.transferDate, '2018-11-20');
  assert.strictEqual(canonical.observedAt, '2018-11-20');
  assert.strictEqual(canonical.evidenceAsOf, '2018-11-20');
  assert.strictEqual(canonical.retrievedAt, '2026-08-01T12:00:00.000Z');
  assert.strictEqual(canonical.datasetVersion, 'ppd-2018-11');
  assert.strictEqual(canonical.source, 'HMLR_PRICE_PAID_DATA');
  assert.notStrictEqual(canonical.factType, 'HMLR_TRANSACTION');
  assert.strictEqual(canonical.factType, OFFICIAL_SALE_FACT_TYPE);
});

asyncTest('6–8. repeated import is idempotent and corrections replace in place', async () => {
  const store = createMemoryOfficialSaleStore();
  const first = writeTemp('first', `${ppdLine({ price: '200000' })}\n`);
  const firstResult = await importPricePaid({
    ppdPath: first,
    store,
    releaseLabel: '2026-07',
    retrievedAt: '2026-08-01T00:00:00.000Z',
  });
  assert.strictEqual(firstResult.ok, true);
  assert.strictEqual(firstResult.inserted_count, 1);
  const second = writeTemp('second', `${ppdLine({ price: '210000', status: 'C' })}\n`);
  const secondResult = await importPricePaid({
    ppdPath: second,
    store,
    releaseLabel: '2026-08',
    retrievedAt: '2026-08-31T00:00:00.000Z',
  });
  assert.strictEqual(secondResult.ok, true);
  assert.strictEqual(store.snapshot().length, 1);
  assert.strictEqual(store.snapshot()[0].price_gbp, 210000);
  assert.strictEqual(store.snapshot()[0].record_status, 'C');
  fs.unlinkSync(first);
  fs.unlinkSync(second);
});

asyncTest('7b. source delete marks the live flag false rather than duplicating', async () => {
  const store = createMemoryOfficialSaleStore();
  const add = writeTemp('add', `${ppdLine()}\n`);
  await importPricePaid({ ppdPath: add, store, releaseLabel: 'a' });
  const del = writeTemp('del', `${ppdLine({ status: 'D' })}\n`);
  const result = await importPricePaid({ ppdPath: del, store, releaseLabel: 'b' });
  assert.strictEqual(result.deleted_count, 1);
  assert.strictEqual(store.snapshot().length, 1);
  assert.strictEqual(store.snapshot()[0].live, false);
  fs.unlinkSync(add);
  fs.unlinkSync(del);
});

asyncTest('9. large import path is batched and does not load the file as one array', async () => {
  const store = createMemoryOfficialSaleStore();
  let batches = 0;
  const inner = store.upsertBatch.bind(store);
  store.upsertBatch = async (rows) => {
    batches += 1;
    assert.ok(rows.length <= 50);
    return inner(rows);
  };
  const lines = [];
  for (let i = 0; i < 120; i += 1) {
    lines.push(ppdLine({ id: `{TX-${i}}`, paon: String(i) }));
  }
  const file = writeTemp('batch', `${lines.join('\n')}\n`);
  const importer = read('../scripts/import-hmlr-price-paid.js');
  assert.ok(importer.includes('createReadStream'));
  assert.ok(!importer.includes('readFileSync(ppdPath'));
  const result = await importPricePaid({
    ppdPath: file,
    store,
    batchSize: 50,
    releaseLabel: 'batch',
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.inserted_count, 120);
  assert.strictEqual(batches, 3);
  fs.unlinkSync(file);
});

asyncTest('10–12. exact UPRN association works and does not imply title', async () => {
  const store = createMemoryOfficialSaleStore();
  const ppd = writeTemp('uprn-ppd', `${ppdLine()}\n`);
  const uprn = writeTemp('uprn', '"{TX-1}","100012345678"\n');
  await importPricePaid({ ppdPath: ppd, uprnPath: uprn, store, releaseLabel: 'u' });
  assert.strictEqual(store.snapshot()[0].uprn, '100012345678');
  const queried = await queryOfficialSaleTransactions({
    identity: { uprn: '100012345678', listingId: 1 },
    property: listing(),
    store,
  });
  assert.strictEqual(queried.matchMethod, MATCH_METHOD.EXACT_UPRN);
  assert.strictEqual(queried.status, IMPORT_STATUS.TRANSACTION_FOUND);
  const canonical = toCanonicalTransaction(queried.subjectTransactions[0], {
    matchMethod: queried.matchMethod,
  });
  assert.strictEqual(canonical.uprnIsNotTitle, true);
  assert.strictEqual(canonical.inspireIsNotTitleNumber, true);
  assert.ok(!canonical.titleNumber);
  fs.unlinkSync(ppd);
  fs.unlinkSync(uprn);
});

asyncTest('11. missing UPRN remains missing and is not invented', async () => {
  const store = createMemoryOfficialSaleStore();
  const ppd = writeTemp('noup', `${ppdLine()}\n`);
  await importPricePaid({ ppdPath: ppd, store, releaseLabel: 'n' });
  assert.strictEqual(store.snapshot()[0].uprn, null);
  const queried = await queryOfficialSaleTransactions({
    identity: { listingId: 1 },
    property: listing(),
    store,
  });
  assert.notStrictEqual(queried.matchMethod, MATCH_METHOD.EXACT_UPRN);
  assert.strictEqual(queried.subjectTransactions[0].uprn, null);
  fs.unlinkSync(ppd);
});

asyncTest('11b. historical PPD reimport without lookups preserves existing UPRN and does not invent INSPIRE', async () => {
  const store = createMemoryOfficialSaleStore();
  const ppd = writeTemp('hist-ppd', `${ppdLine({ date: '1995-01-31 00:00', saon: 'FLAT 10' })}\n`);
  const uprn = writeTemp('hist-uprn', '"{TX-1}","100012345678"\n');
  await importPricePaid({ ppdPath: ppd, uprnPath: uprn, store, releaseLabel: '2026-07' });
  assert.strictEqual(store.snapshot()[0].uprn, '100012345678');
  const historical = writeTemp('hist-year', `${ppdLine({ date: '1995-01-31 00:00', saon: 'FLAT 10', price: '19000' })}\n`);
  await importPricePaid({ ppdPath: historical, store, releaseLabel: '1995' });
  const row = store.snapshot()[0];
  assert.strictEqual(row.uprn, '100012345678');
  assert.strictEqual(row.inspire_id == null || row.inspire_id === '', true);
  assert.strictEqual(Number(row.price_gbp), 19000);
  assert.strictEqual(row.saon, 'FLAT 10');
  fs.unlinkSync(ppd);
  fs.unlinkSync(uprn);
  fs.unlinkSync(historical);
});

asyncTest('13–14. INSPIRE ID is associated without becoming a title number; leasehold stays leasehold', async () => {
  const store = createMemoryOfficialSaleStore();
  const ppd = writeTemp('ins', `${ppdLine({ tenure: 'L' })}\n`);
  const inspire = writeTemp('inspire', '"{TX-1}","INSPIRE-99"\n');
  await importPricePaid({ ppdPath: ppd, inspirePath: inspire, store, releaseLabel: 'i' });
  const row = store.snapshot()[0];
  const canonical = toCanonicalTransaction(row);
  assert.strictEqual(canonical.inspireId, 'INSPIRE-99');
  assert.strictEqual(canonical.inspireIsNotTitleNumber, true);
  assert.strictEqual(canonical.leasehold, true);
  assert.strictEqual(canonical.freehold, false);
  assert.ok(!canonical.titleNumber);
  fs.unlinkSync(ppd);
  fs.unlinkSync(inspire);
});

asyncTest('14b. multiple official INSPIRE IDs are all preserved', async () => {
  const store = createMemoryOfficialSaleStore();
  const ppd = writeTemp('ins-many', `${ppdLine({ id: '{TX-MANY}' })}\n`);
  const inspire = writeTemp('inspire-many', '"{TX-MANY}","111"\n"{TX-MANY}","222"\n"{TX-MANY}","333"\n');
  await importPricePaid({ ppdPath: ppd, inspirePath: inspire, store, releaseLabel: 'm' });
  const row = store.snapshot()[0];
  const canonical = toCanonicalTransaction(row);
  assert.deepStrictEqual(canonical.inspireIds.slice().sort(), ['111', '222', '333']);
  assert.strictEqual(canonical.inspireCardinality, 'MANY');
  assert.strictEqual(canonical.inspireId, null);
  assert.strictEqual(canonical.inspireIsNotTitleNumber, true);
  fs.unlinkSync(ppd);
  fs.unlinkSync(inspire);
});

test('4b. transfer datetime with time component keeps the date', () => {
  const parsed = parsePpdRow(ppdLine({ date: '2021-06-28 00:00' }));
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.row.transfer_date, '2021-06-28');
});

asyncTest('15–16. exact subject sale is distinct from postcode-only area context', async () => {
  const store = createMemoryOfficialSaleStore();
  const lines = [
    ppdLine({ id: '{SUBJ}', paon: '12', postcode: 'B1 2UJ' }),
    ppdLine({ id: '{NEAR}', paon: '99', postcode: 'B1 2UJ', price: '300000' }),
  ].join('\n');
  const file = writeTemp('area', `${lines}\n`);
  await importPricePaid({ ppdPath: file, store, releaseLabel: 'a' });
  const exact = await queryOfficialSaleTransactions({
    identity: { listingId: 1 },
    property: listing({ house_number: '12', zip_code: 'B1 2UJ' }),
    store,
  });
  assert.strictEqual(exact.matchMethod, MATCH_METHOD.EXACT_CANONICAL_ADDRESS);
  assert.strictEqual(exact.subjectTransactions.length, 1);
  assert.strictEqual(exact.subjectTransactions[0].source_transaction_id, '{SUBJ}');
  assert.strictEqual(exact.areaTransactions.length, 1);
  assert.strictEqual(exact.areaTransactions[0].source_transaction_id, '{NEAR}');
  const postcodeOnly = await queryOfficialSaleTransactions({
    identity: { listingId: 2 },
    property: listing({ house_number: null, zip_code: 'B1 2UJ' }),
    store,
  });
  assert.strictEqual(postcodeOnly.matchMethod, MATCH_METHOD.UNMATCHED);
  assert.strictEqual(postcodeOnly.status, IMPORT_STATUS.NO_MATCH);
  assert.strictEqual(postcodeOnly.subjectTransactions.length, 0);
  assert.ok(postcodeOnly.areaTransactions.length >= 1);
  const adapted = adaptMarketDomain({
    property: listing({ house_number: null }),
    identity: { listingId: 2 },
    assetClassification: declared(ASSET_CLASS.RESIDENTIAL),
    officialSales: postcodeOnly,
    analysisAt: '2026-08-31T00:00:00.000Z',
  });
  assert.ok(!adapted.envelope.evidence.some((row) => row.factType === OFFICIAL_SALE_FACT_TYPE));
  const area = adapted.envelope.evidence.find((row) => row.factType === OFFICIAL_AREA_SALE_FACT_TYPE);
  assert.strictEqual(area.classification, EVIDENCE_CLASS.AREA_CONTEXT);
  fs.unlinkSync(file);
});

test('17. transaction does not automatically become a comparable', () => {
  const comparable = read('../services/ai/comparableEngine.js');
  const sale = read('../services/ai/saleIntelligenceService.js');
  const valuation = read('../services/ai/valuationEngine.js');
  assert.ok(!/officialSale|hmlrPricePaid|HMLR_PRICE_PAID/.test(comparable));
  assert.ok(!/officialSale|hmlrPricePaid/.test(sale));
  assert.ok(!/officialSale|hmlrPricePaid/.test(valuation));
  const canonical = toCanonicalTransaction(parsePpdRow(ppdLine()).row);
  assert.strictEqual(canonical.transactionIsNotComparable, true);
});

asyncTest('18/40. official sales do not alter residential valuation output', async () => {
  const store = createMemoryOfficialSaleStore();
  const file = writeTemp('val', `${ppdLine()}\n`);
  await importPricePaid({ ppdPath: file, store, releaseLabel: 'v' });
  const withSales = await analyse({}, {
    deps: { officialSaleStore: store },
  });
  const skipped = await analyse({}, { options: { skipOfficialSales: true } });
  assert.strictEqual(withSales.marketIntelligence.sale.centralEstimate, 195000);
  assert.strictEqual(skipped.marketIntelligence.sale.centralEstimate, 195000);
  assert.strictEqual(withSales.marketIntelligence.rent.recommendedRent, 1100);
  fs.unlinkSync(file);
});

asyncTest('19–24. proven non-residential classes do not gain residential valuation from PPD', async () => {
  const store = createMemoryOfficialSaleStore();
  const file = writeTemp('cls', `${ppdLine({ type: 'O' })}\n`);
  await importPricePaid({ ppdPath: file, store, releaseLabel: 'c' });
  const classes = [
    ASSET_CLASS.COMMERCIAL,
    ASSET_CLASS.INDUSTRIAL,
    ASSET_CLASS.AGRICULTURAL,
    ASSET_CLASS.LAND,
    ASSET_CLASS.DEVELOPMENT_SITE,
    ASSET_CLASS.MIXED_USE,
  ];
  for (const cls of classes) {
    const report = await assemblePropertyIntelligenceReport({
      property: listing({ property_type: cls.toLowerCase(), assetClassification: declared(cls) }),
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
        asOf: '2026-08-31T00:00:00.000Z',
        deps: { ...analyseDeps(), officialSaleStore: store },
      },
    });
    assert.strictEqual(report.assetClassification.assetClass, cls, cls);
    assert.strictEqual(report.marketIntelligence.sale.success, false, cls);
    assert.strictEqual(report.marketIntelligence.sale.notAssessed, true, cls);
    assert.notStrictEqual(report.marketIntelligence.sale.centralEstimate, 0, cls);
    assert.ok(!report.marketIntelligence.rent.recommendedRent, cls);
    assert.strictEqual(report.marketDomain.assessment.specialisedValuation, 'NOT_ASSESSED', cls);
  }
  fs.unlinkSync(file);
});

test('25–26. UNKNOWN stays UNKNOWN; PPD Other is not an asset class', () => {
  const other = ppdTypeIsNotAssetClass('O');
  assert.strictEqual(other.notAuthoritativeAssetClass, true);
  assert.strictEqual(other.notCommercial, true);
  assert.strictEqual(other.notAgricultural, true);
  assert.strictEqual(other.notLand, true);
  assert.strictEqual(other.notDevelopmentSite, true);
  const canonical = toCanonicalTransaction(parsePpdRow(ppdLine({ type: 'O' })).row);
  assert.strictEqual(canonical.propertyTypeCode, 'O');
  assert.strictEqual(canonical.typeCodeIsNotAssetClass.notCommercial, true);
  const engine = read('../services/ai/propertyIntelligenceEngine.js');
  assert.ok(!/property_type_code.*COMMERCIAL|PPD.*assetClass/.test(engine));
});

asyncTest('27–28. England/Wales coverage; Scotland/NI is unavailable not zero', async () => {
  assert.strictEqual(isOutsideSourceGeography('EH1 1BB'), true);
  assert.strictEqual(isOutsideSourceGeography('BT1 5GS'), true);
  assert.strictEqual(isOutsideSourceGeography('B1 2UJ'), false);
  const outside = await queryOfficialSaleTransactions({
    identity: { listingId: 1 },
    property: listing({ zip_code: 'EH1 1BB' }),
    store: createMemoryOfficialSaleStore(),
  });
  assert.strictEqual(outside.status, IMPORT_STATUS.SOURCE_OUTSIDE_GEOGRAPHY);
  assert.strictEqual(outside.subjectOfficialTransactionCount, null);
  assert.strictEqual(outside.areaOfficialTransactionCount, null);
  const adapted = adaptMarketDomain({
    property: listing({ zip_code: 'EH1 1BB' }),
    identity: { listingId: 1 },
    assetClassification: declared(ASSET_CLASS.RESIDENTIAL),
    officialSales: outside,
    analysisAt: '2026-08-31T00:00:00.000Z',
  });
  assert.ok(adapted.coverage.missingEvidenceTypes.includes('OFFICIAL_SALE_SOURCE_GEOGRAPHY'));
  assert.notStrictEqual(adapted.coverage.subjectOfficialTransactionCount, 0);
});

asyncTest('29. import failure does not become no-transactions', async () => {
  const store = createMemoryOfficialSaleStore();
  store.upsertBatch = async () => {
    throw new Error('import exploded');
  };
  const file = writeTemp('fail', `${ppdLine()}\n`);
  const result = await importPricePaid({ ppdPath: file, store, releaseLabel: 'f' });
  assert.strictEqual(result.ok, false);
  const queried = await queryOfficialSaleTransactions({
    identity: { listingId: 1 },
    property: listing(),
    store,
  });
  assert.strictEqual(queried.status, IMPORT_STATUS.IMPORT_FAILED);
  assert.strictEqual(queried.subjectOfficialTransactionCount, null);
  const adapted = adaptMarketDomain({
    property: listing(),
    identity: { listingId: 1 },
    assetClassification: declared(ASSET_CLASS.RESIDENTIAL),
    officialSales: queried,
    analysisAt: '2026-08-31T00:00:00.000Z',
  });
  assert.ok(adapted.envelope.findings.some((row) => row.id === 'official_sale_import_failed'));
  fs.unlinkSync(file);
});

asyncTest('30–33. Market envelope keeps official, asking, user-reported and PropertyData distinct', async () => {
  const store = createMemoryOfficialSaleStore();
  const file = writeTemp('mkt', `${ppdLine({ price: '325000' })}\n`);
  await importPricePaid({ ppdPath: file, store, releaseLabel: 'm' });
  const officialSales = await queryOfficialSaleTransactions({
    identity: { listingId: 1, uprn: null },
    property: listing(),
    store,
  });
  const adapted = adaptMarketDomain({
    property: listing(),
    identity: { listingId: 1 },
    assetClassification: declared(ASSET_CLASS.RESIDENTIAL),
    officialSales,
    externalEnrichment: {
      enrichments: {
        sold_prices: {
          success: true,
          data: {
            raw_data: [{ price: 240000, address: 'Nearby', date: '2023-01-01' }],
            points: 1,
            average: 240000,
          },
          provenance: { retrievedAt: '2026-08-31T00:00:00.000Z' },
        },
      },
    },
    analysisAt: '2026-08-31T00:00:00.000Z',
  });
  const types = adapted.envelope.evidence.map((row) => row.factType);
  assert.ok(types.includes('listingAskingPrice'));
  assert.ok(types.includes('userReportedSubjectTransaction'));
  assert.ok(types.includes(OFFICIAL_SALE_FACT_TYPE));
  assert.ok(types.includes('areaTransactionObservations'));
  const asking = adapted.envelope.evidence.find((row) => row.factType === 'listingAskingPrice');
  const user = adapted.envelope.evidence.find((row) => row.factType === 'userReportedSubjectTransaction');
  const official = adapted.envelope.evidence.find((row) => row.factType === OFFICIAL_SALE_FACT_TYPE);
  assert.strictEqual(asking.value, 250000);
  assert.strictEqual(user.value, 180000);
  assert.strictEqual(user.sourceType, SOURCE_TYPE.USER_REPORTED);
  assert.strictEqual(official.sourceType, SOURCE_TYPE.OFFICIAL);
  assert.notStrictEqual(official.value.priceGbp, asking.value);
  assert.strictEqual(adapted.coverage.officialMatchMethod, MATCH_METHOD.EXACT_CANONICAL_ADDRESS);
  fs.unlinkSync(file);
});

test('34–35. history renderer does not re-query official sales', () => {
  const history = read('../../client/src/Utils/savedIntelligenceReport.js');
  const detail = read('../../client/src/pages/ai/AiHistoryDetail.js');
  const engine = read('../services/ai/propertyIntelligenceEngine.js');
  assert.ok(!/queryOfficialSaleTransactions|importPricePaid/.test(history));
  assert.ok(!/queryOfficialSaleTransactions|importPricePaid/.test(detail));
  assert.ok(engine.includes('skipOfficialSales'));
  assert.strictEqual(historicalReportIsReadable({
    modelVersion: 'property-intelligence-v2',
    marketIntelligence: { sale: { success: true } },
  }), true);
});

test('36. What-if remains isolated from official transactions', () => {
  const whatIf = read('../services/ai/intelligenceWhatIfService.js');
  const market = read('../services/domains/marketDomain.js');
  assert.ok(!/queryOfficialSaleTransactions|importPricePaid/.test(whatIf));
  assert.ok(!/whatIf|scenarioPurchasePrice/.test(read('../services/market/officialSaleTransactionQuery.js')));
  assert.ok(market.includes('officialSaleImportNotOnAnalysePath'));
});

test('37–39/41. finance, PD, DI, rent engines are not rewritten by this phase', () => {
  const files = [
    '../services/ai/financialEngine.js',
    '../services/ai/personalDecisionEngine.js',
    '../config/personalDecision.config.js',
    '../services/ai/decisionIntelligence.js',
    '../services/ai/rentIntelligenceService.js',
    '../services/ai/valuationAssessmentSafety.js',
  ];
  files.forEach((file) => {
    const src = read(file);
    assert.ok(!/officialSale|hmlrPricePaid|HMLR_PRICE_PAID/.test(src), file);
  });
});

test('42–44. no new paid provider; no commercial PropertyData or CRE execution', () => {
  const policy = read('../services/identity/marketAcquisitionPolicy.js');
  const importer = read('../scripts/import-hmlr-price-paid.js');
  const engine = read('../services/ai/propertyIntelligenceEngine.js');
  const enrichment = read('../services/enrichment/propertyEnrichmentService.js');
  assert.ok(!/valuation-commercial|costar|kato atlas/i.test(policy));
  assert.ok(!/valuation-commercial|costar|kato/i.test(engine));
  assert.ok(!/valuation-commercial|costar|kato/i.test(enrichment));
  assert.ok(!/axios|https:\/\//.test(importer));
  assert.ok(importer.includes('Offline HMLR'));
});

test('45. outcome/calibration logic is unchanged', () => {
  const outcome = read('../services/ai/listingOutcomeService.js');
  const backtest = read('../services/ai/backtesting/backtestFoundation.js');
  assert.ok(!/officialSale|hmlrPricePaid/.test(outcome));
  assert.ok(!/officialSale|hmlrPricePaid/.test(backtest));
});

test('identity safety flags remain on canonical transactions', () => {
  const canonical = toCanonicalTransaction(parsePpdRow(ppdLine({ tenure: 'L' })).row);
  assert.ok(canonical.identityNonEquivalence);
  assert.strictEqual(canonical.uprnIsNotTitle, true);
  assert.strictEqual(canonical.leasehold, true);
});

test('lookup parser requires both identity fields', () => {
  assert.deepStrictEqual(parseLookupRow('"{TX-1}","1000"'), { sourceTransactionId: '{TX-1}', value: '1000' });
  assert.strictEqual(parseLookupRow('"{TX-1}",'), null);
});

test('postgres upsert SQL is a single batched INSERT', () => {
  const repo = read('../services/market/officialSaleTransactionRepository.js');
  assert.ok(repo.includes('buildBatchUpsertSql'));
  assert.ok(repo.includes('unnest'));
});

test('migration 023 is wired and does not block listing schema', () => {
  const sql = read('../db/migrations/023_official_sale_transactions.sql');
  const ensure = read('../db/ensureIntelligenceSchema.js');
  const migrate = read('../scripts/migrate-intelligence-schema.js');
  assert.ok(sql.includes('official_sale_transactions'));
  assert.ok(sql.includes('UNIQUE (source, source_transaction_id)'));
  assert.ok(ensure.includes('023_official_sale_transactions.sql'));
  assert.ok(ensure.includes('Official sale transaction schema could not be applied'));
  assert.ok(migrate.includes('023_official_sale_transactions.sql'));
  assert.ok(ensure.includes('024_official_sale_lookup_links.sql'));
  assert.ok(migrate.includes('024_official_sale_lookup_links.sql'));
  assert.ok(ensure.includes('025_canonical_subject_identity.sql'));
  assert.ok(migrate.includes('025_canonical_subject_identity.sql'));
});

(async () => {
  console.log('\nofficialSaleTransaction.test.js');
  for (const item of pending) {
    await item.fn();
    console.log(`  ok  ${item.name}`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
