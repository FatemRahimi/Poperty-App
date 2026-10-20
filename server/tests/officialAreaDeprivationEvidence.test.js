/**
 * Phase 2A — IoD 2025 LAD evidence foundation.
 * Run: node tests/officialAreaDeprivationEvidence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const {
  parseIodFile10ImdCsv,
  parseIodFile10Xlsx,
  parseOptionalNumber,
} = require('../services/market/iod2025LadParser');
const {
  createMemoryIod2025LadStore,
} = require('../services/market/iod2025LadStore');
const { ingestIod2025Lad } = require('../services/market/ingestIod2025Lad');
const {
  getOfficialLadDeprivationEvidence,
  FORBIDDEN_INFERENCE_KEYS,
} = require('../services/market/officialAreaDeprivationEvidence');
const { createMemoryGeographyStore } = require('../services/market/geographyCrosswalkStore');
const { ingestGeographyCsv } = require('../services/market/ingestGeographyCrosswalk');
const {
  IOD2025_HEADERS,
  IOD2025_GEOGRAPHY_VINTAGE,
  IOD2025_RELEASE_LABEL,
  IOD2025_SOURCE_PRODUCT,
} = require('../architecture/officialAreaEconomicDataset');
const { EVIDENCE_CLASS } = require('../architecture/evidenceContract');
const { COVERAGE_STATE } = require('../architecture/officialMarketDataset');

const FIXTURE = fs.readFileSync(
  path.join(__dirname, 'fixtures/iod2025-file10-imd-min.csv'),
  'utf8'
);
const GEO_HEADER = 'postcode,countrycode,countryname,localauthoritycode,localauthorityname,ukhpigeographycode,ukhpigeographyname';

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

function fixtureXlsxBuffer() {
  const workbook = XLSX.utils.book_new();
  const rows = FIXTURE.trim().split(/\n/).map((line) => {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else current += ch;
    }
    fields.push(current);
    return fields;
  });
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, 'IMD');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

(async () => {
  await test('parser maps exact File 10 headers and preserves zero proportion', async () => {
    const parsed = parseIodFile10ImdCsv(FIXTURE);
    assert.strictEqual(parsed.header, true);
    assert.strictEqual(parsed.rows.length, 3);
    const birmingham = parsed.rows.find((row) => row.geographyCode === 'E08000025');
    assert.strictEqual(birmingham.imdAverageScore, 38.115);
    assert.strictEqual(birmingham.imdRankOfAverageScore, 5);
    assert.strictEqual(birmingham.imdProportionMostDeprived10, 0.4279);
    assert.strictEqual(birmingham.geographyVintage, IOD2025_GEOGRAPHY_VINTAGE);
    assert.strictEqual(birmingham.sourceProduct, IOD2025_SOURCE_PRODUCT);
    const york = parsed.rows.find((row) => row.geographyCode === 'E06000014');
    assert.strictEqual(york.imdProportionMostDeprived10, 0);
    assert.notStrictEqual(york.imdProportionMostDeprived10, null);
  });

  await test('integer ranks reject decimals without truncation', async () => {
    assert.deepStrictEqual(parseOptionalNumber(5, { integer: true }), { ok: true, value: 5, present: true });
    assert.deepStrictEqual(parseOptionalNumber('5', { integer: true }), { ok: true, value: 5, present: true });
    assert.deepStrictEqual(parseOptionalNumber(5.7, { integer: true }), { ok: false, reason: 'non_integer_metric' });
    assert.deepStrictEqual(parseOptionalNumber('5.7', { integer: true }), { ok: false, reason: 'non_integer_metric' });
    assert.deepStrictEqual(parseOptionalNumber(-3, { integer: true }), { ok: true, value: -3, present: true });
    assert.deepStrictEqual(parseOptionalNumber('-3', { integer: true }), { ok: true, value: -3, present: true });
    assert.deepStrictEqual(parseOptionalNumber('-3.2', { integer: true }), { ok: false, reason: 'non_integer_metric' });
    assert.deepStrictEqual(parseOptionalNumber(Number.NaN, { integer: true }), { ok: false, reason: 'non_numeric_metric' });
    assert.deepStrictEqual(parseOptionalNumber(Number.POSITIVE_INFINITY, { integer: true }), { ok: false, reason: 'non_numeric_metric' });
    assert.deepStrictEqual(parseOptionalNumber('rank', { integer: true }), { ok: false, reason: 'non_numeric_metric' });

    assert.deepStrictEqual(parseOptionalNumber(38.115), { ok: true, value: 38.115, present: true });
    assert.deepStrictEqual(parseOptionalNumber(0.4279), { ok: true, value: 0.4279, present: true });
    assert.deepStrictEqual(parseOptionalNumber(0), { ok: true, value: 0, present: true });
    assert.deepStrictEqual(parseOptionalNumber(''), { ok: true, value: null, present: false });
    assert.deepStrictEqual(parseOptionalNumber(null), { ok: true, value: null, present: false });
    assert.deepStrictEqual(parseOptionalNumber('abc'), { ok: false, reason: 'non_numeric_metric' });

    const decimalRankRow = parseIodFile10ImdCsv(
      `${FIXTURE.split('\n')[0]}\nE08000099,Test,1,2,10,5.7,0.1,6\n`
    );
    assert.strictEqual(decimalRankRow.rows.length, 0);
    assert.ok(decimalRankRow.rejected.some((item) => item.reason === 'non_integer_metric'));
  });

  await test('parser rejects missing headers, invalid LAD codes, and non-numeric metrics', async () => {
    const missing = parseIodFile10ImdCsv('wrong,headers\nE08000025,x\n');
    assert.strictEqual(missing.header, false);
    assert.ok(missing.rejected[0].missing.includes(IOD2025_HEADERS.geographyCode));

    const invalidLad = parseIodFile10ImdCsv(
      `${FIXTURE.split('\n')[0]}\nNOT_A_CODE,Name,1,2,3,4,5,6\n`
    );
    assert.strictEqual(invalidLad.rows.length, 0);
    assert.ok(invalidLad.rejected.some((item) => item.reason === 'invalid_lad_code'));

    const blankMetric = parseIodFile10ImdCsv(
      `${FIXTURE.split('\n')[0]}\nE08000099,Test,1,2,,4,,6\n`
    );
    assert.strictEqual(blankMetric.rows.length, 1);
    assert.strictEqual(blankMetric.rows[0].imdAverageScore, null);
    assert.strictEqual(blankMetric.rows[0].imdProportionMostDeprived10, null);

    const nonNumeric = parseIodFile10ImdCsv(
      `${FIXTURE.split('\n')[0]}\nE08000099,Test,1,2,abc,4,0.1,6\n`
    );
    assert.strictEqual(nonNumeric.rows.length, 0);
    assert.ok(nonNumeric.rejected.some((item) => item.reason === 'non_numeric_metric'));
  });

  await test('xlsx IMD sheet parses the same deterministic rows', async () => {
    const parsed = parseIodFile10Xlsx(fixtureXlsxBuffer());
    assert.strictEqual(parsed.header, true);
    assert.strictEqual(parsed.rows.length, 3);
    assert.strictEqual(parsed.rows[0].geographyCode, 'E08000025');
  });

  await test('store insert, duplicate, conflict, and coverage semantics', async () => {
    const empty = createMemoryIod2025LadStore();
    assert.strictEqual((await empty.datasetCoverage()).state, COVERAGE_STATE.NOT_IMPORTED);
    assert.strictEqual((await empty.queryByGeographyCode('E08000025')).matchStatus, 'NOT_IMPORTED');

    const imported = await ingestIod2025Lad({ csvText: FIXTURE });
    assert.strictEqual(imported.status, 'SUCCEEDED');
    assert.strictEqual(imported.inserted_count, 3);
    const store = imported.store;
    assert.strictEqual((await store.datasetCoverage()).state, COVERAGE_STATE.AVAILABLE);

    const again = await ingestIod2025Lad({ store, csvText: FIXTURE });
    assert.strictEqual(again.unchanged_count, 3);
    assert.strictEqual(again.inserted_count, 0);

    const conflictCsv = FIXTURE.replace('38.115', '99.001');
    const conflicted = await ingestIod2025Lad({ store, csvText: conflictCsv });
    assert.ok(conflicted.conflict_count >= 1);
    const kept = await store.queryByGeographyCode('E08000025');
    assert.strictEqual(kept.observations[0].imdAverageScore, 38.115);

    assert.strictEqual((await store.queryByGeographyCode('E09999999')).matchStatus, 'NO_MATCH');
    assert.strictEqual((await store.queryByGeographyCode('Birmingham')).matched, false);
  });

  await test('postcode resolves by exact LAD code to IoD evidence', async () => {
    const iod = (await ingestIod2025Lad({ csvText: FIXTURE })).store;
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

    const birmingham = await getOfficialLadDeprivationEvidence({
      iodStore: iod,
      geographyStore: geography,
      postcode: 'b1 2uj',
    });
    assert.strictEqual(birmingham.status, 'SUFFICIENT');
    assert.strictEqual(birmingham.subject.geographyCode, 'E08000025');
    assert.strictEqual(birmingham.metrics.imdAverageScore, 38.115);
    assert.strictEqual(birmingham.factClass, EVIDENCE_CLASS.AREA_CONTEXT);
    assert.strictEqual(birmingham.geographyVintage, 'LAD_2024');
    assert.strictEqual(birmingham.geographyVintageCompatibility, 'UNPROVEN_NATIONWIDE');
    assert.ok(birmingham.evidence.every((item) => item.classification === EVIDENCE_CLASS.AREA_CONTEXT));
    assert.ok(birmingham.limitations.some((line) => /England only/i.test(line)));
    assert.ok(birmingham.limitations.some((line) => /not a house-price forecast/i.test(line)));
    assert.strictEqual(birmingham.provenance.licence, 'Open Government Licence v3.0');
    assert.strictEqual(birmingham.observation.releaseLabel, IOD2025_RELEASE_LABEL);

    const westminster = await getOfficialLadDeprivationEvidence({
      iodStore: iod,
      geographyStore: geography,
      postcode: 'SW1A 1AA',
    });
    assert.strictEqual(westminster.subject.geographyCode, 'E09000033');
    assert.strictEqual(westminster.geographyResolution.localAuthorityCode, 'E09000033');
    assert.strictEqual(westminster.metrics.imdRankOfAverageScore, 92);

    const direct = await getOfficialLadDeprivationEvidence({
      iodStore: iod,
      geographyCode: 'E08000025',
    });
    assert.strictEqual(direct.status, 'SUFFICIENT');

    const named = await getOfficialLadDeprivationEvidence({
      iodStore: iod,
      geographyCode: 'Birmingham',
    });
    assert.strictEqual(named.status, 'UNAVAILABLE');
    assert.strictEqual(named.reason, 'invalid_lad_code');
    assert.strictEqual(named.metrics, undefined);

    const wales = await getOfficialLadDeprivationEvidence({
      iodStore: iod,
      geographyStore: geography,
      postcode: 'CF10 1AA',
    });
    assert.strictEqual(wales.status, 'UNAVAILABLE');
    assert.strictEqual(wales.reason, 'non_england_geography');
  });

  await test('failure states stay unavailable and never become zero metrics', async () => {
    const iod = (await ingestIod2025Lad({ csvText: FIXTURE })).store;
    const geography = createMemoryGeographyStore();

    const notImported = await getOfficialLadDeprivationEvidence({
      iodStore: iod,
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
    const ambiguous = await getOfficialLadDeprivationEvidence({
      iodStore: iod,
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
    const noMatch = await getOfficialLadDeprivationEvidence({
      iodStore: iod,
      geographyStore: cleanGeo,
      postcode: 'SW1A 1AA',
    });
    assert.strictEqual(noMatch.reason, 'postcode_no_match');

    const nullLad = await getOfficialLadDeprivationEvidence({
      iodStore: iod,
      geographyStore: cleanGeo,
      postcode: 'B1 2UJ',
    });
    assert.strictEqual(nullLad.reason, 'local_authority_code_null');

    const missingLad = await getOfficialLadDeprivationEvidence({
      iodStore: iod,
      geographyCode: 'E08000003',
    });
    assert.strictEqual(missingLad.reason, 'lad_missing_from_iod');
    assert.strictEqual(missingLad.observation, null);

    const emptyIod = createMemoryIod2025LadStore();
    const iodMissing = await getOfficialLadDeprivationEvidence({
      iodStore: emptyIod,
      geographyCode: 'E08000025',
    });
    assert.strictEqual(iodMissing.reason, 'iod_not_imported');

    const failed = createMemoryIod2025LadStore();
    const run = await failed.startRun({ release_label: IOD2025_RELEASE_LABEL });
    await failed.finishRun(run.id, { status: 'FAILED', failure_reason: 'boom' });
    const errored = await getOfficialLadDeprivationEvidence({
      iodStore: failed,
      geographyCode: 'E08000025',
    });
    assert.strictEqual(errored.reason, 'iod_error');

    const ok = await getOfficialLadDeprivationEvidence({ iodStore: iod, geographyCode: 'E08000025' });
    const blob = JSON.stringify(ok);
    FORBIDDEN_INFERENCE_KEYS.forEach((key) => {
      assert.strictEqual(Object.prototype.hasOwnProperty.call(ok, key), false, key);
      assert.strictEqual(new RegExp(`"${key}"`).test(blob), false, key);
    });
    assert.ok(!/forecast|buyRecommendation|opportunityScore/i.test(Object.keys(ok).join(',')));
  });

  if (process.exitCode) process.exit(process.exitCode);
  console.log(`${passed} passed`);
})();
