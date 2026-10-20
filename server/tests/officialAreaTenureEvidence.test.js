/**
 * Phase 2C — Census 2021 TS054 LAD household tenure evidence.
 * Run: node tests/officialAreaTenureEvidence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  parseCensus2021Ts054TenureCsv,
  parseHouseholdCount,
  buildTenureAggregates,
} = require('../services/market/census2021Ts054TenureParser');
const {
  createMemoryCensus2021Ts054TenureStore,
} = require('../services/market/census2021Ts054TenureStore');
const { ingestCensus2021Ts054Tenure } = require('../services/market/ingestCensus2021Ts054Tenure');
const {
  getOfficialLadTenureEvidence,
  FORBIDDEN_INFERENCE_KEYS,
} = require('../services/market/officialAreaTenureEvidence');
const { createMemoryGeographyStore } = require('../services/market/geographyCrosswalkStore');
const { ingestGeographyCsv } = require('../services/market/ingestGeographyCrosswalk');
const {
  CENSUS2021_TS054_HEADERS,
  CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
  CENSUS2021_TS054_RELEASE_LABEL,
  CENSUS2021_TS054_REFERENCE_PERIOD,
  CENSUS2021_TS054_RELEASE_DATE,
  CENSUS2021_TS054_VERSION_DATE,
  CENSUS2021_TS054_CATEGORIES,
  CENSUS2021_TS054_PROVENANCE,
  CENSUS2021_TS054_LIMITATIONS,
  MARKET_RECORD_KIND,
} = require('../architecture/officialAreaEconomicDataset');
const { EVIDENCE_CLASS } = require('../architecture/evidenceContract');
const { COVERAGE_STATE } = require('../architecture/officialMarketDataset');
const { UNIT } = require('../architecture/units');

const FIXTURE = fs.readFileSync(
  path.join(__dirname, 'fixtures/census2021-ts054-tenure-min.csv'),
  'utf8'
);
const GEO_HEADER = 'postcode,countrycode,countryname,localauthoritycode,localauthorityname,ukhpigeographycode,ukhpigeographyname';
const HEADER = Object.values(CENSUS2021_TS054_HEADERS).join(',');

let passed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`ok ${name}`);
    })
    .catch((error) => {
      console.error(`FAIL ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

(async () => {
  await test('parser maps exact TS054 headers and preserves all official categories', async () => {
    const parsed = parseCensus2021Ts054TenureCsv(FIXTURE);
    assert.strictEqual(parsed.header, true);
    assert.strictEqual(parsed.rows.length, 27);
    const birmingham = parsed.rows.filter((row) => row.geographyCode === 'E08000025');
    assert.strictEqual(birmingham.length, 9);
    Object.values(CENSUS2021_TS054_CATEGORIES).forEach((category) => {
      assert.ok(birmingham.some((row) => row.categoryCode === category.code && row.categoryLabel === category.label));
    });
    const shared = birmingham.find((row) => row.categoryCode === '2');
    assert.strictEqual(shared.categoryLabel, 'Shared ownership: Shared ownership');
    assert.strictEqual(shared.householdCount, 3641);
    assert.strictEqual(shared.referencePeriod, '2021-03-21');
    assert.strictEqual(shared.geographyVintage, CENSUS2021_TS054_GEOGRAPHY_VINTAGE);
    assert.strictEqual(shared.historicalCensusContext, true);
    assert.strictEqual(shared.provenance.releaseDate, CENSUS2021_TS054_VERSION_DATE);
    assert.strictEqual(shared.provenance.originalReleaseDate, CENSUS2021_TS054_RELEASE_DATE);
    assert.notStrictEqual(shared.provenance.releaseDate, shared.referencePeriod);
  });

  await test('integer household counts reject decimals, negatives, and malformed text', async () => {
    assert.deepStrictEqual(parseHouseholdCount(0), { ok: true, value: 0, present: true });
    assert.deepStrictEqual(parseHouseholdCount('0'), { ok: true, value: 0, present: true });
    assert.deepStrictEqual(parseHouseholdCount(114970), { ok: true, value: 114970, present: true });
    assert.deepStrictEqual(parseHouseholdCount(''), { ok: false, reason: 'missing_household_count' });
    assert.deepStrictEqual(parseHouseholdCount(null), { ok: false, reason: 'missing_household_count' });
    assert.deepStrictEqual(parseHouseholdCount(12.5), { ok: false, reason: 'non_integer_household_count' });
    assert.deepStrictEqual(parseHouseholdCount('12.5'), { ok: false, reason: 'non_integer_household_count' });
    assert.deepStrictEqual(parseHouseholdCount(-1), { ok: false, reason: 'negative_household_count' });
    assert.deepStrictEqual(parseHouseholdCount('abc'), { ok: false, reason: 'non_numeric_household_count' });
  });

  await test('parser rejects missing headers, invalid GSS, fuzzy categories, and blank counts', async () => {
    const missing = parseCensus2021Ts054TenureCsv('wrong,headers\nE08000025,x\n');
    assert.strictEqual(missing.header, false);
    assert.ok(missing.rejected[0].missing.includes(CENSUS2021_TS054_HEADERS.geographyCode));

    const invalidLad = parseCensus2021Ts054TenureCsv(
      `${HEADER}\nNOT_A_CODE,Name,0,Owned: Owns outright,10\n`
    );
    assert.ok(invalidLad.rejected.some((item) => item.reason === 'invalid_lad_code'));

    const blank = parseCensus2021Ts054TenureCsv(
      `${HEADER}\nE08000099,Test,0,Owned: Owns outright,\n`
    );
    assert.ok(blank.rejected.some((item) => item.reason === 'missing_household_count'));

    const fuzzy = parseCensus2021Ts054TenureCsv(
      `${HEADER}\nE08000099,Test,0,Owner occupied,10\n`
    );
    assert.ok(fuzzy.rejected.some((item) => item.reason === 'tenure_category_label_mismatch'));

    const scotland = parseCensus2021Ts054TenureCsv(
      `${HEADER}\nS12000036,Edinburgh,0,Owned: Owns outright,10\n`
    );
    assert.ok(scotland.rejected.some((item) => item.reason === 'invalid_lad_code'));
  });

  await test('Shared Ownership stays separate and social rented combine uses exact categories', async () => {
    const birmingham = parseCensus2021Ts054TenureCsv(FIXTURE).rows
      .filter((row) => row.geographyCode === 'E08000025');
    const aggregates = buildTenureAggregates(birmingham);
    const owner = aggregates.find((item) => item.aggregateId === 'OWNER_OCCUPIED_CORE');
    const shared = aggregates.find((item) => item.aggregateId === 'SHARED_OWNERSHIP');
    const social = aggregates.find((item) => item.aggregateId === 'SOCIAL_RENTED_COMBINED');
    const privateRented = aggregates.find((item) => item.aggregateId === 'PRIVATE_RENTED_COMBINED');

    assert.strictEqual(owner.householdCount, 114970 + 108046);
    assert.deepStrictEqual(owner.componentCodes, ['0', '1']);
    assert.ok(!owner.componentCodes.includes('2'));
    assert.strictEqual(shared.householdCount, 3641);
    assert.deepStrictEqual(shared.componentCodes, ['2']);
    assert.strictEqual(social.householdCount, 58609 + 40890);
    assert.deepStrictEqual(social.componentCodes, ['3', '4']);
    assert.strictEqual(privateRented.householdCount, 86669 + 9050);
    assert.strictEqual(owner.recordKind, MARKET_RECORD_KIND.DERIVED_METRIC);
    assert.strictEqual(social.aggregationKind, 'SOURCE_DIRECTED_AGGREGATION');
    assert.ok(birmingham.some((row) => row.categoryCode === '3' && row.householdCount === 58609));
    assert.ok(birmingham.some((row) => row.categoryCode === '4' && row.householdCount === 40890));
  });

  await test('store insert, duplicate, conflict, and coverage semantics', async () => {
    const empty = createMemoryCensus2021Ts054TenureStore();
    assert.strictEqual((await empty.datasetCoverage()).state, COVERAGE_STATE.NOT_IMPORTED);

    const imported = await ingestCensus2021Ts054Tenure({ csvText: FIXTURE });
    assert.strictEqual(imported.status, 'SUCCEEDED');
    assert.strictEqual(imported.inserted_count, 27);
    const store = imported.store;
    assert.strictEqual((await store.datasetCoverage()).state, COVERAGE_STATE.AVAILABLE);

    const again = await ingestCensus2021Ts054Tenure({ store, csvText: FIXTURE });
    assert.strictEqual(again.unchanged_count, 27);

    const conflictCsv = FIXTURE.replace('114970', '999999');
    const conflicted = await ingestCensus2021Ts054Tenure({ store, csvText: conflictCsv });
    assert.ok(conflicted.conflict_count >= 1);
    const kept = await store.queryByGeographyCode('E08000025');
    assert.strictEqual(
      kept.observations.find((row) => row.categoryCode === '0').householdCount,
      114970
    );
    assert.strictEqual((await store.queryByGeographyCode('E09999999')).matchStatus, 'NO_MATCH');
    assert.strictEqual((await store.queryByGeographyCode('Birmingham')).matched, false);
  });

  await test('postcode resolves by exact LAD code to historical Census tenure evidence', async () => {
    const tenure = (await ingestCensus2021Ts054Tenure({ csvText: FIXTURE })).store;
    const geography = createMemoryGeographyStore();
    await ingestGeographyCsv(
      [
        GEO_HEADER,
        'B1 2UJ,E92000001,England,E08000025,Birmingham,E08000025,Birmingham',
        'CF10 1AA,W92000004,Wales,W06000015,Cardiff,,',
      ].join('\n'),
      { store: geography, releaseLabel: '2024-02' }
    );

    const birmingham = await getOfficialLadTenureEvidence({
      tenureStore: tenure,
      geographyStore: geography,
      postcode: 'b1 2uj',
    });
    assert.strictEqual(birmingham.status, 'SUFFICIENT');
    assert.strictEqual(birmingham.subject.geographyCode, 'E08000025');
    assert.strictEqual(birmingham.subject.referencePeriod, '2021-03-21');
    assert.strictEqual(birmingham.factClass, EVIDENCE_CLASS.AREA_CONTEXT);
    assert.strictEqual(birmingham.contextKind, 'HISTORICAL_CENSUS_CONTEXT');
    assert.strictEqual(birmingham.historicalCensusContext, true);
    assert.strictEqual(birmingham.sharesImplemented, false);
    assert.strictEqual(birmingham.geographyVintage, 'CENSUS_2021_LTLA');
    assert.strictEqual(birmingham.geographyVintageCompatibility, 'UNPROVEN_NATIONWIDE');
    assert.strictEqual(birmingham.observations.length, 9);
    assert.ok(birmingham.observations.every((row) => row.recordKind === 'OFFICIAL_OBSERVATION'));
    assert.ok(birmingham.observations.every((row) => row.unit === UNIT.HOUSEHOLDS));
    assert.ok(birmingham.aggregates.some((item) => (
      item.aggregateId === 'SOCIAL_RENTED_COMBINED'
      && item.recordKind === MARKET_RECORD_KIND.DERIVED_METRIC
      && item.householdCount === 58609 + 40890
    )));
    assert.ok(birmingham.aggregates.some((item) => (
      item.aggregateId === 'SHARED_OWNERSHIP' && item.householdCount === 3641
    )));
    assert.ok(birmingham.evidence.some((item) => item.classification === EVIDENCE_CLASS.AREA_CONTEXT));
    assert.ok(birmingham.evidence.some((item) => item.classification === EVIDENCE_CLASS.DERIVED));
    assert.strictEqual(birmingham.provenance.releaseDate, CENSUS2021_TS054_VERSION_DATE);
    assert.strictEqual(birmingham.provenance.referencePeriod, CENSUS2021_TS054_REFERENCE_PERIOD);
    assert.notStrictEqual(birmingham.provenance.releaseDate, birmingham.provenance.referencePeriod);
    assert.ok(birmingham.limitations.some((line) => /HISTORICAL_CENSUS_CONTEXT/i.test(line)));
    assert.ok(birmingham.limitations.some((line) => /cell key perturbation/i.test(line)));
    assert.ok(birmingham.limitations.some((line) => /not current 2026 tenure/i.test(line)));
    assert.ok(!Object.prototype.hasOwnProperty.call(birmingham, 'privateRentedShare'));
    assert.ok(!/current 2026 tenure/i.test(JSON.stringify(birmingham.observations)));

    const wales = await getOfficialLadTenureEvidence({
      tenureStore: tenure,
      geographyStore: geography,
      postcode: 'CF10 1AA',
    });
    assert.strictEqual(wales.status, 'SUFFICIENT');
    assert.strictEqual(wales.subject.geographyCode, 'W06000015');

    const named = await getOfficialLadTenureEvidence({
      tenureStore: tenure,
      geographyCode: 'Birmingham',
    });
    assert.strictEqual(named.status, 'UNAVAILABLE');
    assert.strictEqual(named.reason, 'invalid_lad_code');
  });

  await test('failure states stay unavailable and never become zero households', async () => {
    const tenure = (await ingestCensus2021Ts054Tenure({ csvText: FIXTURE })).store;
    const geography = createMemoryGeographyStore();

    const notImported = await getOfficialLadTenureEvidence({
      tenureStore: tenure,
      geographyStore: geography,
      postcode: 'B1 2UJ',
    });
    assert.strictEqual(notImported.reason, 'crosswalk_not_imported');
    assert.deepStrictEqual(notImported.observations, []);

    await ingestGeographyCsv(
      `${GEO_HEADER}\nB1 2UJ,E92000001,England,E08000025,Birmingham,E08000025,Birmingham\n`,
      { store: geography, releaseLabel: 'alpha-release' }
    );
    await ingestGeographyCsv(
      `${GEO_HEADER}\nB1 2UJ,E92000001,England,E08000025,Birmingham,E08000025,Birmingham\n`,
      { store: geography, releaseLabel: 'beta-release' }
    );
    const ambiguous = await getOfficialLadTenureEvidence({
      tenureStore: tenure,
      geographyStore: geography,
      postcode: 'B1 2UJ',
    });
    assert.strictEqual(ambiguous.status, 'UNRESOLVED');
    assert.strictEqual(ambiguous.reason, 'crosswalk_ambiguous');

    const empty = createMemoryCensus2021Ts054TenureStore();
    const missing = await getOfficialLadTenureEvidence({
      tenureStore: empty,
      geographyCode: 'E08000025',
    });
    assert.strictEqual(missing.reason, 'tenure_not_imported');

    const failed = createMemoryCensus2021Ts054TenureStore();
    const run = await failed.startRun({ release_label: CENSUS2021_TS054_RELEASE_LABEL });
    await failed.finishRun(run.id, { status: 'FAILED', failure_reason: 'boom' });
    const errored = await getOfficialLadTenureEvidence({
      tenureStore: failed,
      geographyCode: 'E08000025',
    });
    assert.strictEqual(errored.reason, 'tenure_error');

    const ok = await getOfficialLadTenureEvidence({
      tenureStore: tenure,
      geographyCode: 'E08000025',
    });
    const blob = JSON.stringify(ok);
    FORBIDDEN_INFERENCE_KEYS.forEach((key) => {
      assert.strictEqual(Object.prototype.hasOwnProperty.call(ok, key), false, key);
      assert.strictEqual(new RegExp(`"${key}"`).test(blob), false, key);
    });
    assert.ok(!/"buyRecommendation"|"letRecommendation"|"opportunityScore"/i.test(blob));
    assert.strictEqual(CENSUS2021_TS054_PROVENANCE.releaseDate, CENSUS2021_TS054_VERSION_DATE);
    assert.notStrictEqual(CENSUS2021_TS054_PROVENANCE.releaseDate, CENSUS2021_TS054_REFERENCE_PERIOD);
    assert.ok(CENSUS2021_TS054_LIMITATIONS.some((line) => /property legal tenure/i.test(line)));
  });

  if (process.exitCode) process.exit(process.exitCode);
  console.log(`${passed} passed`);
})();
