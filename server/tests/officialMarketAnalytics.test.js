const assert = require('assert');
const { createMemoryUkhpiStore } = require('../services/market/ukhpiStore');
const { createMemoryOfficialSaleStore } = require('../services/market/officialSaleTransactionRepository');
const {
  analyseOfficialMarket,
  median,
  observedPercentChange,
} = require('../services/market/officialMarketAnalytics');

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

async function seedUkhpi(observations, releases) {
  const store = createMemoryUkhpiStore();
  const groups = releases || [{ label: '2026-06', rows: observations }];
  for (const group of groups) {
    const run = await store.startRun({ release_label: group.label });
    for (const row of group.rows) {
      await store.upsert({
        source: 'UK_HOUSE_PRICE_INDEX',
        dataset: 'UK House Price Index',
        geographyCode: 'E08000025',
        geographyName: 'Birmingham',
        geographyType: 'local authority',
        propertyCategory: 'all',
        annualChange: 99,
        ...row,
        releaseLabel: row.releaseLabel || group.label,
      });
    }
    await store.finishRun(run.id, { status: 'SUCCEEDED', inserted_count: group.rows.length || 1 });
  }
  return store;
}

async function seedSales(rows, status = 'SUCCEEDED') {
  const store = createMemoryOfficialSaleStore();
  const run = await store.startImportRun({ release_label: 'pp-2026-06' });
  if (rows.length) await store.upsertBatch(rows);
  await store.finishImportRun(run.id, {
    status,
    inserted_count: status === 'SUCCEEDED' ? Math.max(rows.length, 1) : 0,
  });
  return store;
}

function sale(id, price, date, present = true) {
  return {
    source: 'HMLR_PRICE_PAID_DATA',
    source_transaction_id: id,
    live: true,
    postcode: 'B1 2UJ',
    postcode_compact: 'B12UJ',
    transfer_date: date,
    price_gbp: price,
    price_present: present,
  };
}

function baseSeries() {
  return [
    { observationDate: '2021-06-01', indexValue: 50 },
    { observationDate: '2023-06-01', indexValue: 80 },
    { observationDate: '2025-06-01', indexValue: 100 },
    { observationDate: '2026-06-01', indexValue: 110 },
  ];
}

(async () => {
  await test('exact 1Y, 3Y, and 5Y observed change', async () => {
    const store = await seedUkhpi(baseSeries());
    const result = await analyseOfficialMarket({
      ukhpiStore: store,
      geographyCode: 'E08000025',
      geographyName: 'Birmingham',
      geographyType: 'local authority',
    });
    assert.strictEqual(result.hpi.oneYear.percentageChange, 10);
    assert.strictEqual(result.hpi.oneYear.startDate, '2025-06-01');
    assert.strictEqual(result.hpi.oneYear.endDate, '2026-06-01');
    assert.strictEqual(result.hpi.threeYear.percentageChange, observedPercentChange(80, 110));
    assert.strictEqual(result.hpi.threeYear.startDate, '2023-06-01');
    assert.strictEqual(result.hpi.fiveYear.percentageChange, 120);
    assert.strictEqual(result.hpi.fiveYear.startDate, '2021-06-01');
    assert.strictEqual(result.hpi.oneYear.calculationMethod, 'observed_to_observed');
    assert.notStrictEqual(result.hpi.oneYear.percentageChange, 99);
  });

  await test('genuine zero and negative historical change', async () => {
    const store = await seedUkhpi([
      { observationDate: '2025-06-01', indexValue: 100 },
      { observationDate: '2026-06-01', indexValue: 100 },
    ]);
    const zero = await analyseOfficialMarket({ ukhpiStore: store, geographyCode: 'E08000025' });
    assert.strictEqual(zero.hpi.oneYear.percentageChange, 0);
    assert.strictEqual(zero.hpi.oneYear.status, 'SUFFICIENT');
    const down = await seedUkhpi([
      { observationDate: '2025-06-01', indexValue: 100 },
      { observationDate: '2026-06-01', indexValue: 80 },
    ]);
    const negative = await analyseOfficialMarket({ ukhpiStore: down, geographyCode: 'E08000025' });
    assert.strictEqual(negative.hpi.oneYear.percentageChange, -20);
  });

  await test('missing exact prior month is unavailable and not a neighbour', async () => {
    const store = await seedUkhpi([
      { observationDate: '2025-05-01', indexValue: 90 },
      { observationDate: '2025-07-01', indexValue: 95 },
      { observationDate: '2026-06-01', indexValue: 110 },
    ]);
    const result = await analyseOfficialMarket({ ukhpiStore: store, geographyCode: 'E08000025' });
    assert.strictEqual(result.hpi.oneYear.percentageChange, null);
    assert.strictEqual(result.hpi.oneYear.sufficiency.reason, 'missing_start_observation');
    assert.notStrictEqual(result.hpi.oneYear.percentageChange, 0);
  });

  await test('null, zero, geography, and category gaps do not become zero', async () => {
    const nullStart = await seedUkhpi([
      { observationDate: '2025-06-01', indexValue: null },
      { observationDate: '2026-06-01', indexValue: 110 },
    ]);
    const start = await analyseOfficialMarket({ ukhpiStore: nullStart, geographyCode: 'E08000025' });
    assert.strictEqual(start.hpi.oneYear.percentageChange, null);
    assert.strictEqual(start.hpi.oneYear.sufficiency.reason, 'null_index');

    const nullEnd = await seedUkhpi([
      { observationDate: '2025-06-01', indexValue: 100 },
      { observationDate: '2026-06-01', indexValue: null },
    ]);
    const end = await analyseOfficialMarket({ ukhpiStore: nullEnd, geographyCode: 'E08000025' });
    assert.strictEqual(end.hpi.oneYear.percentageChange, null);
    assert.strictEqual(end.hpi.oneYear.sufficiency.reason, 'null_index');

    const zero = await seedUkhpi([
      { observationDate: '2025-06-01', indexValue: 0 },
      { observationDate: '2026-06-01', indexValue: 110 },
    ]);
    const denominator = await analyseOfficialMarket({ ukhpiStore: zero, geographyCode: 'E08000025' });
    assert.strictEqual(denominator.hpi.oneYear.percentageChange, null);
    assert.strictEqual(denominator.hpi.oneYear.sufficiency.reason, 'zero_denominator');

    const other = await analyseOfficialMarket({ ukhpiStore: zero, geographyCode: 'E08000026' });
    assert.strictEqual(other.hpi.oneYear.percentageChange, null);
    assert.strictEqual(other.hpi.oneYear.sufficiency.reason, 'missing_end_observation');

    const category = await analyseOfficialMarket({
      ukhpiStore: zero,
      geographyCode: 'E08000025',
      propertyCategory: 'detached',
    });
    assert.strictEqual(category.hpi.oneYear.percentageChange, null);
  });

  await test('ambiguous release does not calculate and a later older release does not win', async () => {
    const ambiguous = await seedUkhpi([], [
      { label: 'final-release', rows: [{ observationDate: '2026-06-01', indexValue: 110 }, { observationDate: '2025-06-01', indexValue: 100 }] },
      { label: 'revised-release', rows: [{ observationDate: '2026-06-01', indexValue: 140 }, { observationDate: '2025-06-01', indexValue: 100 }] },
    ]);
    const blocked = await analyseOfficialMarket({ ukhpiStore: ambiguous, geographyCode: 'E08000025' });
    assert.strictEqual(blocked.hpi.oneYear.percentageChange, null);
    assert.strictEqual(blocked.hpi.oneYear.status, 'UNRESOLVED');

    const dated = await seedUkhpi([], [
      { label: '2026-06', rows: [{ observationDate: '2026-06-01', indexValue: 110 }, { observationDate: '2025-06-01', indexValue: 100 }] },
      { label: '2026-01', rows: [{ observationDate: '2026-06-01', indexValue: 50 }, { observationDate: '2025-06-01', indexValue: 40 }] },
    ]);
    const resolved = await analyseOfficialMarket({ ukhpiStore: dated, geographyCode: 'E08000025' });
    assert.strictEqual(resolved.hpi.oneYear.percentageChange, 10);
    assert.strictEqual(resolved.hpi.oneYear.observationsUsed[1].releaseLabel, '2026-06');
    assert.strictEqual(resolved.hpi.oneYear.observationsUsed[1].recordKind, 'OFFICIAL_OBSERVATION');
    assert.strictEqual(resolved.hpi.oneYear.recordKind, 'DERIVED_METRIC');
  });

  await test('evidence keeps lineage and omits forecast, recommendation, and ranking', async () => {
    const store = await seedUkhpi(baseSeries());
    const result = await analyseOfficialMarket({
      ukhpiStore: store,
      geographyCode: 'E08000025',
      geographyType: 'local authority',
    });
    const item = result.evidence[0];
    assert.strictEqual(item, result.hpi.oneYear);
    ['metric', 'value', 'unit', 'geographyCode', 'startDate', 'endDate', 'calculationMethod', 'sufficiency', 'limitations', 'provenance', 'observationsUsed'].forEach((key) => {
      assert.notStrictEqual(item[key], undefined, key);
    });
    assert.strictEqual(item.unit, 'PERCENT');
    assert.strictEqual(item.provenance.geographyCode, 'E08000025');
    assert.strictEqual(item.observationsUsed[0].recordKind, 'OFFICIAL_OBSERVATION');
    const keys = JSON.stringify(Object.keys(result));
    assert.strictEqual(result.forecast, undefined);
    assert.strictEqual(result.recommendation, undefined);
    assert.strictEqual(result.ranking, undefined);
    assert.strictEqual(/forecast|recommendation|ranking|opportunityScore|bestArea/.test(keys), false);
    assert.strictEqual(result.subject.hpiScope, 'UKHPI_GEOGRAPHY');
  });

  await test('transaction count, median, period, and coverage truth', async () => {
    assert.strictEqual(median([200, 100, 300]), 200);
    assert.strictEqual(median([100, 400, 200, 300]), 250);
    const rows = [
      sale('1', 100000, '2025-07-01'),
      sale('2', 200000, '2025-08-01'),
      sale('3', 300000, '2025-09-01'),
      sale('4', 400000, '2025-10-01'),
      sale('5', null, '2025-11-01', false),
      sale('6', 0, '2025-12-01', true),
      sale('7', 500000, '2025-06-30'),
    ];
    const store = await seedSales(rows);
    const result = await analyseOfficialMarket({
      ukhpiStore: await seedUkhpi(baseSeries()),
      saleStore: store,
      geographyCode: 'E08000025',
      postcode: 'B1 2UJ',
      asOf: '2026-06-30',
    });
    assert.strictEqual(result.transactions.period.start, '2025-07-01');
    assert.strictEqual(result.transactions.period.end, '2026-06-30');
    assert.strictEqual(result.transactions.count, 6);
    assert.strictEqual(result.transactions.sampleCount, 5);
    assert.strictEqual(result.transactions.medianSoldPrice, 200000);
    assert.strictEqual(result.transactions.sufficiency.median.state, 'SUFFICIENT');
    assert.strictEqual(result.transactions.scope, 'POSTCODE');
    assert.strictEqual(result.transactions.provenance.postcode, 'B1 2UJ');
    assert.notStrictEqual(result.subject.hpiScope, result.subject.transactionScope);

    const thin = await seedSales([
      sale('1', 100000, '2026-01-01'),
      sale('2', 300000, '2026-02-01'),
      sale('3', 500000, '2026-03-01'),
    ]);
    const small = await analyseOfficialMarket({
      ukhpiStore: await seedUkhpi(baseSeries()),
      saleStore: thin,
      geographyCode: 'E08000025',
      postcode: 'B1 2UJ',
      asOf: '2026-06-30',
    });
    assert.strictEqual(small.transactions.medianSoldPrice, 300000);
    assert.strictEqual(small.transactions.sufficiency.median.reason, 'insufficient_transaction_sample');

    const empty = await seedSales([sale('9', 100000, '2026-01-01')]);
    const none = await analyseOfficialMarket({
      ukhpiStore: await seedUkhpi(baseSeries()),
      saleStore: empty,
      geographyCode: 'E08000025',
      postcode: 'SW1A 1AA',
      asOf: '2026-06-30',
    });
    assert.strictEqual(none.transactions.count, 0);
    assert.strictEqual(none.transactions.medianSoldPrice, null);

    const missing = await analyseOfficialMarket({
      ukhpiStore: await seedUkhpi(baseSeries()),
      saleStore: createMemoryOfficialSaleStore(),
      geographyCode: 'E08000025',
      postcode: 'B1 2UJ',
      asOf: '2026-06-30',
    });
    assert.strictEqual(missing.transactions.count, null);
    assert.strictEqual(missing.transactions.sufficiency.reason, 'dataset_not_imported');

    const failed = await seedSales([sale('1', 100000, '2026-01-01')], 'FAILED');
    const errored = await analyseOfficialMarket({
      ukhpiStore: await seedUkhpi(baseSeries()),
      saleStore: failed,
      geographyCode: 'E08000025',
      postcode: 'B1 2UJ',
      asOf: '2026-06-30',
    });
    assert.strictEqual(errored.transactions.count, null);
    assert.strictEqual(errored.transactions.sufficiency.reason, 'coverage_error');
  });

  await test('benchmark difference stays factual', async () => {
    const store = await seedUkhpi([
      { observationDate: '2021-06-01', indexValue: 100, geographyCode: 'E08000025' },
      { observationDate: '2026-06-01', indexValue: 150, geographyCode: 'E08000025' },
      { observationDate: '2021-06-01', indexValue: 100, geographyCode: 'E92000001' },
      { observationDate: '2026-06-01', indexValue: 125, geographyCode: 'E92000001' },
    ]);
    const result = await analyseOfficialMarket({
      ukhpiStore: store,
      geographyCode: 'E08000025',
      benchmarkGeographyCode: 'E92000001',
    });
    assert.strictEqual(result.benchmark.horizons.fiveYear.differencePercentagePoints, 25);
    assert.strictEqual(result.benchmark.horizons.fiveYear.calculationMethod, 'observed_to_observed_difference');
    assert.strictEqual(result.benchmark.horizons.oneYear.differencePercentagePoints, null);

    const absent = await analyseOfficialMarket({ ukhpiStore: store, geographyCode: 'E08000025' });
    assert.strictEqual(absent.benchmark.status, 'UNAVAILABLE');
    assert.strictEqual(absent.benchmark.reason, 'benchmark_not_requested');

    const category = await analyseOfficialMarket({
      ukhpiStore: store,
      geographyCode: 'E08000025',
      benchmarkGeographyCode: 'E92000001',
      benchmarkPropertyCategory: 'detached',
    });
    assert.strictEqual(category.benchmark.reason, 'incompatible_category');

    const shifted = await seedUkhpi([
      { observationDate: '2021-06-01', indexValue: 100, geographyCode: 'E08000025' },
      { observationDate: '2026-06-01', indexValue: 150, geographyCode: 'E08000025' },
      { observationDate: '2020-06-01', indexValue: 100, geographyCode: 'E92000001' },
      { observationDate: '2025-06-01', indexValue: 125, geographyCode: 'E92000001' },
    ]);
    const period = await analyseOfficialMarket({
      ukhpiStore: shifted,
      geographyCode: 'E08000025',
      benchmarkGeographyCode: 'E92000001',
    });
    assert.strictEqual(period.benchmark.horizons.fiveYear.differencePercentagePoints, null);
    assert.strictEqual(period.benchmark.horizons.fiveYear.reason, 'incompatible_period');

    const ambiguousBench = await seedUkhpi([], [
      {
        label: '2026-06',
        rows: [
          { observationDate: '2025-06-01', indexValue: 100, geographyCode: 'E08000025' },
          { observationDate: '2026-06-01', indexValue: 110, geographyCode: 'E08000025' },
        ],
      },
      {
        label: 'alpha-release',
        rows: [
          { observationDate: '2025-06-01', indexValue: 100, geographyCode: 'E92000001' },
          { observationDate: '2026-06-01', indexValue: 140, geographyCode: 'E92000001' },
        ],
      },
      {
        label: 'beta-release',
        rows: [
          { observationDate: '2025-06-01', indexValue: 100, geographyCode: 'E92000001' },
          { observationDate: '2026-06-01', indexValue: 180, geographyCode: 'E92000001' },
        ],
      },
    ]);
    const unresolved = await analyseOfficialMarket({
      ukhpiStore: ambiguousBench,
      geographyCode: 'E08000025',
      benchmarkGeographyCode: 'E92000001',
    });
    assert.strictEqual(unresolved.benchmark.horizons.oneYear.differencePercentagePoints, null);
    assert.strictEqual(unresolved.benchmark.horizons.oneYear.reason, 'ambiguous_official_release');
    assert.strictEqual(unresolved.benchmark.recommendation, undefined);
    assert.strictEqual(unresolved.benchmark.horizons.fiveYear.recommendation, undefined);
  });

  if (process.exitCode) process.exit(process.exitCode);
  console.log(`${passed} passed`);
})();
