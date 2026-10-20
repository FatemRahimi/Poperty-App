/**
 * Phase 2B — ONS mid-year LAD population evidence foundation.
 * Run: node tests/officialAreaPopulationEvidence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  parseOnsMyeLadPopulationCsv,
  parsePopulationCount,
  parseObservationDate,
} = require('../services/market/onsMyeLadPopulationParser');
const {
  createMemoryOnsMyeLadPopulationStore,
} = require('../services/market/onsMyeLadPopulationStore');
const { ingestOnsMyeLadPopulation } = require('../services/market/ingestOnsMyeLadPopulation');
const {
  getOfficialLadPopulationEvidence,
  FORBIDDEN_INFERENCE_KEYS,
} = require('../services/market/officialAreaPopulationEvidence');
const { createMemoryGeographyStore } = require('../services/market/geographyCrosswalkStore');
const { ingestGeographyCsv } = require('../services/market/ingestGeographyCrosswalk');
const {
  ONS_MYE_HEADERS,
  ONS_MYE_GEOGRAPHY_VINTAGE,
  ONS_MYE_RELEASE_LABEL,
  ONS_MYE_REFERENCE_PERIOD,
  ONS_MYE_RELEASE_DATE,
  ONS_MYE_SOURCE_PRODUCT,
  ONS_MYE_INDICATOR,
  ONS_MYE_PROVENANCE,
  ONS_MYE_LIMITATIONS,
} = require('../architecture/officialAreaEconomicDataset');
const { EVIDENCE_CLASS } = require('../architecture/evidenceContract');
const { COVERAGE_STATE } = require('../architecture/officialMarketDataset');
const { UNIT } = require('../architecture/units');

const FIXTURE = fs.readFileSync(
  path.join(__dirname, 'fixtures/ons-mye-ltla-population-min.csv'),
  'utf8'
);
const GEO_HEADER = 'postcode,countrycode,countryname,localauthoritycode,localauthorityname,ukhpigeographycode,ukhpigeographyname';
const HEADER = Object.values(ONS_MYE_HEADERS).join(',');

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
  await test('parser maps exact Explore Local Statistics headers and preserves period', async () => {
    const parsed = parseOnsMyeLadPopulationCsv(FIXTURE);
    assert.strictEqual(parsed.header, true);
    assert.strictEqual(parsed.rows.length, 5);
    const birmingham = parsed.rows.find((row) => (
      row.geographyCode === 'E08000025' && row.observationDate === '2024-06-30'
    ));
    assert.strictEqual(birmingham.totalUsualResidentPopulation, 1171466);
    assert.strictEqual(birmingham.geographyVintage, ONS_MYE_GEOGRAPHY_VINTAGE);
    assert.strictEqual(birmingham.sourceProduct, ONS_MYE_SOURCE_PRODUCT);
    assert.strictEqual(birmingham.indicator, ONS_MYE_INDICATOR);
    assert.strictEqual(birmingham.observationDate, ONS_MYE_REFERENCE_PERIOD);
    assert.strictEqual(birmingham.provenance.metricNature, 'ESTIMATE');
    assert.strictEqual(birmingham.provenance.referencePeriod, '2024-06-30');
    assert.strictEqual(birmingham.provenance.releaseDate, ONS_MYE_RELEASE_DATE);
    assert.notStrictEqual(birmingham.provenance.releaseDate, birmingham.observationDate);
    assert.notStrictEqual(ONS_MYE_PROVENANCE.releaseDate, ONS_MYE_REFERENCE_PERIOD);
    assert.strictEqual(ONS_MYE_PROVENANCE.releaseDate, '2025-09-26');
    assert.strictEqual(ONS_MYE_REFERENCE_PERIOD, '2024-06-30');
    const historical = parsed.rows.find((row) => (
      row.geographyCode === 'E08000025' && row.observationDate === '2023-06-30'
    ));
    assert.strictEqual(historical.totalUsualResidentPopulation, 1149000);
    assert.ok(!Object.prototype.hasOwnProperty.call(historical, 'populationGrowth'));
  });

  await test('provenance separates reference period from publication release date', async () => {
    assert.strictEqual(ONS_MYE_REFERENCE_PERIOD, '2024-06-30');
    assert.strictEqual(ONS_MYE_RELEASE_DATE, '2025-09-26');
    assert.notStrictEqual(ONS_MYE_RELEASE_DATE, ONS_MYE_REFERENCE_PERIOD);
    assert.strictEqual(ONS_MYE_PROVENANCE.releaseDate, ONS_MYE_RELEASE_DATE);
    assert.notStrictEqual(ONS_MYE_PROVENANCE.releaseDate, '2024-06-30');
    assert.strictEqual(ONS_MYE_PROVENANCE.datasetVersion, ONS_MYE_RELEASE_LABEL);
    assert.ok(ONS_MYE_LIMITATIONS.some((line) => /reference date/i.test(line)));
    assert.ok(ONS_MYE_LIMITATIONS.some((line) => /publication date/i.test(line)));
    assert.ok(ONS_MYE_LIMITATIONS.some((line) => /MYE_MID_2024 names the mid-2024 observation edition family/i.test(line)));

    const population = (await ingestOnsMyeLadPopulation({ csvText: FIXTURE })).store;
    const evidence = await getOfficialLadPopulationEvidence({
      populationStore: population,
      geographyCode: 'E08000025',
    });
    assert.strictEqual(evidence.status, 'SUFFICIENT');
    assert.strictEqual(evidence.subject.referencePeriod, '2024-06-30');
    assert.strictEqual(evidence.observation.referencePeriod, '2024-06-30');
    assert.strictEqual(evidence.observation.recordKind, 'OFFICIAL_OBSERVATION');
    assert.strictEqual(evidence.provenance.releaseDate, '2025-09-26');
    assert.notStrictEqual(evidence.provenance.releaseDate, evidence.subject.referencePeriod);
    assert.strictEqual(evidence.evidence[0].provenance.referencePeriod, '2024-06-30');
    assert.strictEqual(evidence.evidence[0].provenance.releaseDate, '2025-09-26');
    assert.strictEqual(evidence.evidence[0].provenance.metricNature, 'ESTIMATE');
    assert.strictEqual(evidence.evidence[0].observedAt, '2024-06-30');
    assert.strictEqual(evidence.derivedGrowth, false);
    assert.ok(!Object.prototype.hasOwnProperty.call(evidence, 'populationGrowth'));
  });

  await test('integer population rejects decimals, negatives, and malformed text', async () => {
    assert.deepStrictEqual(parsePopulationCount(1171466), { ok: true, value: 1171466, present: true });
    assert.deepStrictEqual(parsePopulationCount('1171466'), { ok: true, value: 1171466, present: true });
    assert.deepStrictEqual(parsePopulationCount(0), { ok: true, value: 0, present: true });
    assert.deepStrictEqual(parsePopulationCount('0'), { ok: true, value: 0, present: true });
    assert.deepStrictEqual(parsePopulationCount(''), { ok: false, reason: 'missing_population' });
    assert.deepStrictEqual(parsePopulationCount(null), { ok: false, reason: 'missing_population' });
    assert.deepStrictEqual(parsePopulationCount(12.5), { ok: false, reason: 'non_integer_population' });
    assert.deepStrictEqual(parsePopulationCount('12.5'), { ok: false, reason: 'non_integer_population' });
    assert.deepStrictEqual(parsePopulationCount(-1), { ok: false, reason: 'negative_population' });
    assert.deepStrictEqual(parsePopulationCount('-3'), { ok: false, reason: 'negative_population' });
    assert.deepStrictEqual(parsePopulationCount('abc'), { ok: false, reason: 'non_numeric_population' });
    assert.deepStrictEqual(parsePopulationCount('1e3'), { ok: false, reason: 'non_numeric_population' });
    assert.deepStrictEqual(parseObservationDate('2024-06-30'), { ok: true, value: '2024-06-30' });
    assert.deepStrictEqual(parseObservationDate('2024'), { ok: false, reason: 'invalid_period' });
  });

  await test('parser rejects missing headers, blank population, invalid LAD codes', async () => {
    const missing = parseOnsMyeLadPopulationCsv('wrong,headers\nTotal population,E08000025\n');
    assert.strictEqual(missing.header, false);
    assert.ok(missing.rejected[0].missing.includes(ONS_MYE_HEADERS.geographyCode));

    const invalidLad = parseOnsMyeLadPopulationCsv(
      `${HEADER}\nTotal population,NOT_A_CODE,Name,2024-06-30,100\n`
    );
    assert.strictEqual(invalidLad.rows.length, 0);
    assert.ok(invalidLad.rejected.some((item) => item.reason === 'invalid_lad_code'));

    const blank = parseOnsMyeLadPopulationCsv(
      `${HEADER}\nTotal population,E08000099,Test,2024-06-30,\n`
    );
    assert.strictEqual(blank.rows.length, 0);
    assert.ok(blank.rejected.some((item) => item.reason === 'missing_population'));

    const decimal = parseOnsMyeLadPopulationCsv(
      `${HEADER}\nTotal population,E08000099,Test,2024-06-30,12.5\n`
    );
    assert.strictEqual(decimal.rows.length, 0);
    assert.ok(decimal.rejected.some((item) => item.reason === 'non_integer_population'));

    const zero = parseOnsMyeLadPopulationCsv(
      `${HEADER}\nTotal population,E08000099,Test,2024-06-30,0\n`
    );
    assert.strictEqual(zero.rows.length, 1);
    assert.strictEqual(zero.rows[0].totalUsualResidentPopulation, 0);

    const wrongIndicator = parseOnsMyeLadPopulationCsv(
      `${HEADER}\nMedian age,E08000099,Test,2024-06-30,40\n`
    );
    assert.strictEqual(wrongIndicator.rows.length, 0);
    assert.ok(wrongIndicator.rejected.some((item) => item.reason === 'unsupported_indicator'));
  });

  await test('store insert, period query, duplicate, conflict, and coverage semantics', async () => {
    const empty = createMemoryOnsMyeLadPopulationStore();
    assert.strictEqual((await empty.datasetCoverage()).state, COVERAGE_STATE.NOT_IMPORTED);
    assert.strictEqual((await empty.queryByGeographyCode('E08000025')).matchStatus, 'NOT_IMPORTED');

    const imported = await ingestOnsMyeLadPopulation({ csvText: FIXTURE });
    assert.strictEqual(imported.status, 'SUCCEEDED');
    assert.strictEqual(imported.inserted_count, 5);
    const store = imported.store;
    assert.strictEqual((await store.datasetCoverage()).state, COVERAGE_STATE.AVAILABLE);

    const byYear = await store.queryByGeographyCode('E08000025', {
      observationDate: '2024-06-30',
    });
    assert.strictEqual(byYear.observations.length, 1);
    assert.strictEqual(byYear.observations[0].totalUsualResidentPopulation, 1171466);

    const history = await store.queryByGeographyCode('E08000025');
    assert.strictEqual(history.observations.length, 2);
    assert.ok(!history.observations.some((row) => Object.prototype.hasOwnProperty.call(row, 'populationGrowth')));

    const again = await ingestOnsMyeLadPopulation({ store, csvText: FIXTURE });
    assert.strictEqual(again.unchanged_count, 5);
    assert.strictEqual(again.inserted_count, 0);

    const conflictCsv = FIXTURE.replace('1171466', '9999999');
    const conflicted = await ingestOnsMyeLadPopulation({ store, csvText: conflictCsv });
    assert.ok(conflicted.conflict_count >= 1);
    const kept = await store.queryByGeographyCode('E08000025', { observationDate: '2024-06-30' });
    assert.strictEqual(kept.observations[0].totalUsualResidentPopulation, 1171466);

    assert.strictEqual((await store.queryByGeographyCode('E09999999')).matchStatus, 'NO_MATCH');
    assert.strictEqual((await store.queryByGeographyCode('Birmingham')).matched, false);

    const failed = createMemoryOnsMyeLadPopulationStore();
    const run = await failed.startRun({ release_label: ONS_MYE_RELEASE_LABEL });
    await failed.finishRun(run.id, { status: 'FAILED', failure_reason: 'boom' });
    assert.strictEqual((await failed.datasetCoverage()).state, COVERAGE_STATE.ERROR);
    assert.notStrictEqual((await failed.datasetCoverage()).state, 0);
  });

  await test('postcode resolves by exact LAD code to population evidence', async () => {
    const population = (await ingestOnsMyeLadPopulation({ csvText: FIXTURE })).store;
    const geography = createMemoryGeographyStore();
    await ingestGeographyCsv(
      [
        GEO_HEADER,
        'B1 2UJ,E92000001,England,E08000025,Birmingham,E08000025,Birmingham',
        'SW1A 1AA,E92000001,England,E09000033,Westminster,E09000033,Westminster',
        'CF10 1AA,W92000004,Wales,W06000015,Cardiff,,',
      ].join('\n'),
      { store: geography, releaseLabel: '2024-02' }
    );

    const birmingham = await getOfficialLadPopulationEvidence({
      populationStore: population,
      geographyStore: geography,
      postcode: 'b1 2uj',
    });
    assert.strictEqual(birmingham.status, 'SUFFICIENT');
    assert.strictEqual(birmingham.subject.geographyCode, 'E08000025');
    assert.strictEqual(birmingham.metrics.totalUsualResidentPopulation, 1171466);
    assert.strictEqual(birmingham.factClass, EVIDENCE_CLASS.AREA_CONTEXT);
    assert.strictEqual(birmingham.recordKind, 'OFFICIAL_OBSERVATION');
    assert.strictEqual(birmingham.geographyVintage, 'LTLA_MID_2024');
    assert.strictEqual(birmingham.geographyVintageCompatibility, 'UNPROVEN_NATIONWIDE');
    assert.strictEqual(birmingham.derivedGrowth, false);
    assert.strictEqual(birmingham.subject.referencePeriod, '2024-06-30');
    assert.strictEqual(birmingham.evidence[0].unit, UNIT.PERSONS);
    assert.strictEqual(birmingham.evidence[0].classification, EVIDENCE_CLASS.AREA_CONTEXT);
    assert.strictEqual(birmingham.evidence[0].sharedPropertyEvidence, false);
    assert.ok(birmingham.limitations.some((line) => /ESTIMATE/i.test(line)));
    assert.ok(birmingham.limitations.some((line) => /not calculated/i.test(line)));
    assert.strictEqual(birmingham.provenance.licence, 'Open Government Licence v3.0');
    assert.strictEqual(birmingham.observation.releaseLabel, ONS_MYE_RELEASE_LABEL);

    const wales = await getOfficialLadPopulationEvidence({
      populationStore: population,
      geographyStore: geography,
      postcode: 'CF10 1AA',
    });
    assert.strictEqual(wales.status, 'SUFFICIENT');
    assert.strictEqual(wales.subject.geographyCode, 'W06000015');
    assert.strictEqual(wales.metrics.totalUsualResidentPopulation, 372089);

    const historical = await getOfficialLadPopulationEvidence({
      populationStore: population,
      geographyCode: 'E08000025',
      observationDate: '2023-06-30',
    });
    assert.strictEqual(historical.status, 'SUFFICIENT');
    assert.strictEqual(historical.metrics.totalUsualResidentPopulation, 1149000);
    assert.strictEqual(historical.derivedGrowth, false);
    assert.ok(!Object.prototype.hasOwnProperty.call(historical, 'populationGrowth'));
    assert.ok(!Object.prototype.hasOwnProperty.call(historical.metrics, 'oneYearGrowth'));

    const named = await getOfficialLadPopulationEvidence({
      populationStore: population,
      geographyCode: 'Birmingham',
    });
    assert.strictEqual(named.status, 'UNAVAILABLE');
    assert.strictEqual(named.reason, 'invalid_lad_code');
    assert.strictEqual(named.metrics, undefined);
  });

  await test('failure states stay unavailable and never become zero population', async () => {
    const population = (await ingestOnsMyeLadPopulation({ csvText: FIXTURE })).store;
    const geography = createMemoryGeographyStore();

    const notImported = await getOfficialLadPopulationEvidence({
      populationStore: population,
      geographyStore: geography,
      postcode: 'B1 2UJ',
    });
    assert.strictEqual(notImported.reason, 'crosswalk_not_imported');
    assert.strictEqual(notImported.observation, null);

    await ingestGeographyCsv(
      `${GEO_HEADER}\nB1 2UJ,E92000001,England,E08000025,Birmingham,E08000025,Birmingham\n`,
      { store: geography, releaseLabel: 'alpha-release' }
    );
    await ingestGeographyCsv(
      `${GEO_HEADER}\nB1 2UJ,E92000001,England,E08000025,Birmingham,E08000025,Birmingham\n`,
      { store: geography, releaseLabel: 'beta-release' }
    );
    const ambiguous = await getOfficialLadPopulationEvidence({
      populationStore: population,
      geographyStore: geography,
      postcode: 'B1 2UJ',
    });
    assert.strictEqual(ambiguous.status, 'UNRESOLVED');
    assert.strictEqual(ambiguous.reason, 'crosswalk_ambiguous');

    const cleanGeo = createMemoryGeographyStore();
    await ingestGeographyCsv(
      `${GEO_HEADER}\nM1 1AE,E92000001,England,E08000003,Manchester,E08000003,Manchester\nB1 2UJ,E92000001,England,,,E08000025,Birmingham\n`,
      { store: cleanGeo, releaseLabel: '2024-02' }
    );
    const noMatch = await getOfficialLadPopulationEvidence({
      populationStore: population,
      geographyStore: cleanGeo,
      postcode: 'SW1A 1AA',
    });
    assert.strictEqual(noMatch.reason, 'postcode_no_match');

    const nullLad = await getOfficialLadPopulationEvidence({
      populationStore: population,
      geographyStore: cleanGeo,
      postcode: 'B1 2UJ',
    });
    assert.strictEqual(nullLad.reason, 'local_authority_code_null');

    const missingLad = await getOfficialLadPopulationEvidence({
      populationStore: population,
      geographyCode: 'E08000003',
    });
    assert.strictEqual(missingLad.reason, 'lad_missing_from_population');
    assert.strictEqual(missingLad.observation, null);
    assert.notStrictEqual(missingLad.metrics?.totalUsualResidentPopulation, 0);

    const emptyPop = createMemoryOnsMyeLadPopulationStore();
    const popMissing = await getOfficialLadPopulationEvidence({
      populationStore: emptyPop,
      geographyCode: 'E08000025',
    });
    assert.strictEqual(popMissing.reason, 'population_not_imported');

    const failed = createMemoryOnsMyeLadPopulationStore();
    const run = await failed.startRun({ release_label: ONS_MYE_RELEASE_LABEL });
    await failed.finishRun(run.id, { status: 'FAILED', failure_reason: 'boom' });
    const errored = await getOfficialLadPopulationEvidence({
      populationStore: failed,
      geographyCode: 'E08000025',
    });
    assert.strictEqual(errored.reason, 'population_error');

    const noStore = await getOfficialLadPopulationEvidence({});
    assert.strictEqual(noStore.reason, 'population_store_not_provided');

    const ok = await getOfficialLadPopulationEvidence({
      populationStore: population,
      geographyCode: 'E08000025',
    });
    const blob = JSON.stringify(ok);
    FORBIDDEN_INFERENCE_KEYS.forEach((key) => {
      assert.strictEqual(Object.prototype.hasOwnProperty.call(ok, key), false, key);
      assert.strictEqual(new RegExp(`"${key}"`).test(blob), false, key);
    });
    assert.ok(!/"oneYearGrowth"|"threeYearGrowth"|"fiveYearGrowth"|"cagr"/i.test(blob));
    assert.ok(!Object.prototype.hasOwnProperty.call(ok, 'buyRecommendation'));
    assert.ok(!Object.prototype.hasOwnProperty.call(ok, 'letRecommendation'));
    assert.ok(!Object.prototype.hasOwnProperty.call(ok, 'opportunityScore'));
  });

  if (process.exitCode) process.exit(process.exitCode);
  console.log(`${passed} passed`);
})();
