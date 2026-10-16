/**
 * Official market-data foundation. Fixtures only. No network.
 * Run: node server/tests/officialMarketDataFoundation.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parsePpdRow, parsePositivePrice } = require('../services/market/hmlrPricePaidParser');
const { createMemoryOfficialSaleStore } = require('../services/market/officialSaleTransactionRepository');
const { importPricePaid } = require('../scripts/import-hmlr-price-paid');
const { parseUkhpiCsv, parseMetric } = require('../services/market/ukhpiParser');
const { createMemoryUkhpiStore } = require('../services/market/ukhpiStore');
const { ingestUkhpiCsv } = require('../services/market/ingestUkhpi');
const {
  COVERAGE_STATE,
  HMLR_PRICE_PAID_PROVENANCE,
  UKHPI_PROVENANCE,
  classifyImportCoverage,
  annualChangeFromObservation,
} = require('../architecture/officialMarketDataset');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`Use asyncTest for ${name}`);
  }
  console.log(`✓ ${name}`);
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
  category = 'A',
  status = 'A',
} = {}) {
  const quote = (value) => `"${value == null ? '' : value}"`;
  return [
    id, price, date, postcode, type, newBuild, tenure, '12', '', 'TEST STREET',
    '', 'BIRMINGHAM', 'BIRMINGHAM', 'WEST MIDLANDS', category, status,
  ].map(quote).join(',');
}

test('a valid Price Paid row keeps market fields and does not invent a zero price', () => {
  const parsed = parsePpdRow(ppdLine());
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.row.source_transaction_id, '{TX-1}');
  assert.strictEqual(parsed.row.price_gbp, 250000);
  assert.strictEqual(parsed.row.transfer_date, '2020-03-01');
  assert.strictEqual(parsed.row.postcode, 'B1 2UJ');
  assert.strictEqual(parsed.row.property_type_code, 'T');
  assert.strictEqual(parsed.row.new_build_indicator, 'N');
  assert.strictEqual(parsed.row.tenure_code, 'F');
  assert.strictEqual(parsed.row.category_type, 'A');
  assert.strictEqual(parsed.row.record_status, 'A');
  const missing = parsePositivePrice('');
  assert.strictEqual(missing.value, null);
  assert.notStrictEqual(missing.value, 0);
  const blankRow = parsePpdRow(ppdLine({ price: '' }));
  assert.strictEqual(blankRow.ok, true);
  assert.strictEqual(blankRow.row.price_gbp, null);
  assert.strictEqual(blankRow.row.price_present, false);
});

test('a malformed Price Paid row is rejected', () => {
  const parsed = parsePpdRow(ppdLine({ price: 'not-a-price' }));
  assert.strictEqual(parsed.ok, false);
  assert.strictEqual(parsed.reason, 'invalid_price');
  assert.strictEqual(parsePpdRow('').ok, false);
});

asyncTest('a repeated Price Paid fixture does not insert the same transaction twice', async () => {
  const file = path.join(os.tmpdir(), `ppd-foundation-${process.pid}.csv`);
  fs.writeFileSync(file, `${ppdLine()}\n`);
  const store = createMemoryOfficialSaleStore();
  const first = await importPricePaid({ ppdPath: file, releaseLabel: 'fixture-2020-03', store, retrievedAt: '2026-01-01T00:00:00.000Z' });
  const second = await importPricePaid({ ppdPath: file, releaseLabel: 'fixture-2020-03', store, retrievedAt: '2026-01-02T00:00:00.000Z' });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.inserted_count, 1);
  assert.strictEqual(second.inserted_count, 0);
  assert.strictEqual(store.snapshot().length, 1);
  assert.strictEqual(store.snapshot()[0].price_gbp, 250000);
  fs.unlinkSync(file);
});

test('a UKHPI row keeps supplied metrics and leaves blanks null', () => {
  const csv = [
    'Date,RegionName,AreaCode,AveragePrice,Index,1m%Change,12m%Change',
    '2024-01-01,United Kingdom,K02000001,280000,100.5,0.2,1.5',
    '2024-02-01,United Kingdom,K02000001,,,,',
  ].join('\n');
  const parsed = parseUkhpiCsv(csv, { releaseLabel: '2024-03', ingestedAt: '2026-01-01T00:00:00.000Z' });
  assert.strictEqual(parsed.rows.length, 2);
  assert.strictEqual(parsed.rows[0].averagePrice, 280000);
  assert.strictEqual(parsed.rows[0].indexValue, 100.5);
  assert.strictEqual(parsed.rows[0].monthlyChange, 0.2);
  assert.strictEqual(parsed.rows[0].annualChange, 1.5);
  assert.strictEqual(parsed.rows[0].provenance.dataset, UKHPI_PROVENANCE.dataset);
  assert.strictEqual(parsed.rows[0].provenance.requiredAttribution, UKHPI_PROVENANCE.requiredAttribution);
  assert.strictEqual(parsed.rows[0].provenance.notLegalAdvice, true);
  assert.strictEqual(parsed.rows[1].averagePrice, null);
  assert.strictEqual(parsed.rows[1].indexValue, null);
  assert.strictEqual(parsed.rows[1].annualChange, null);
  assert.notStrictEqual(parsed.rows[1].annualChange, 0);
  assert.strictEqual(parseMetric('').value, null);
  assert.strictEqual(annualChangeFromObservation(parsed.rows[1]), null);
  assert.strictEqual(annualChangeFromObservation(parsed.rows[0]), 1.5);
});

test('a UKHPI row without geography or date is rejected', () => {
  const csv = [
    'Date,RegionName,AreaCode,AveragePrice',
    ',United Kingdom,K02000001,280000',
    '2024-01-01,United Kingdom,,280000',
  ].join('\n');
  const parsed = parseUkhpiCsv(csv);
  assert.strictEqual(parsed.rows.length, 0);
  assert.strictEqual(parsed.rejected.length, 2);
});

asyncTest('UKHPI re-ingestion is idempotent and a conflict does not overwrite', async () => {
  const header = 'Date,RegionName,AreaCode,AveragePrice,12m%Change';
  const firstText = `${header}\n2024-01-01,United Kingdom,K02000001,280000,1.5\n`;
  const store = createMemoryUkhpiStore();
  const first = await ingestUkhpiCsv(firstText, { store, releaseLabel: '2024-03', ingestedAt: '2026-01-01T00:00:00.000Z' });
  const second = await ingestUkhpiCsv(firstText, { store, releaseLabel: '2024-03', ingestedAt: '2026-02-01T00:00:00.000Z' });
  assert.strictEqual(first.inserted_count, 1);
  assert.strictEqual(second.inserted_count, 0);
  assert.strictEqual(second.unchanged_count, 1);
  assert.strictEqual(store.snapshot().length, 1);
  assert.strictEqual(store.snapshot()[0].provenance.licence, 'Open Government Licence v3.0');
  const conflict = await ingestUkhpiCsv(
    `${header}\n2024-01-01,United Kingdom,K02000001,999999,9.9\n`,
    { store, releaseLabel: '2024-04', ingestedAt: '2026-03-01T00:00:00.000Z' }
  );
  assert.strictEqual(conflict.conflict_count, 1);
  assert.strictEqual(store.snapshot()[0].averagePrice, 280000);
  assert.strictEqual(store.snapshot()[0].annualChange, 1.5);
});

test('NOT_IMPORTED, EMPTY, and ERROR are distinct and none of them prove there were no sales', () => {
  const notImported = classifyImportCoverage({ latestRun: null });
  assert.strictEqual(notImported.state, COVERAGE_STATE.NOT_IMPORTED);
  assert.strictEqual(notImported.proofOfNoSales, false);
  const empty = classifyImportCoverage({
    latestRun: { status: 'SUCCEEDED', inserted_count: 0, updated_count: 0, unchanged_count: 0 },
  });
  assert.strictEqual(empty.state, COVERAGE_STATE.EMPTY);
  assert.notStrictEqual(empty.state, COVERAGE_STATE.NOT_IMPORTED);
  assert.strictEqual(empty.proofOfNoSales, false);
  const error = classifyImportCoverage({ latestRun: { status: 'FAILED' } });
  assert.strictEqual(error.state, COVERAGE_STATE.ERROR);
  assert.notStrictEqual(error.state, COVERAGE_STATE.EMPTY);
  assert.strictEqual(error.proofOfNoSales, false);
  const available = classifyImportCoverage({
    latestRun: { status: 'SUCCEEDED', inserted_count: 2, finished_at: '2026-01-01T00:00:00.000Z' },
  });
  assert.strictEqual(available.state, COVERAGE_STATE.AVAILABLE);
  const stale = classifyImportCoverage({
    latestRun: { status: 'SUCCEEDED', inserted_count: 2, finished_at: '2020-01-01T00:00:00.000Z' },
    staleAfterMs: 1000,
    now: Date.parse('2026-01-01T00:00:00.000Z'),
  });
  assert.strictEqual(stale.state, COVERAGE_STATE.STALE);
  assert.strictEqual(stale.proofOfZeroGrowth, false);
});

asyncTest('an empty HMLR store is not an import and is not proof that no sales occurred', async () => {
  const store = createMemoryOfficialSaleStore();
  const coverage = classifyImportCoverage({ latestRun: await store.latestSuccessfulRun() });
  assert.strictEqual(store.snapshot().length, 0);
  assert.strictEqual(coverage.state, COVERAGE_STATE.NOT_IMPORTED);
  assert.strictEqual(coverage.proofOfNoSales, false);
});

test('an absent HPI change is not zero growth and HMLR provenance is metadata', () => {
  assert.strictEqual(annualChangeFromObservation(null), null);
  assert.strictEqual(annualChangeFromObservation({ annualChange: null }), null);
  assert.notStrictEqual(annualChangeFromObservation({ annualChange: null }), 0);
  assert.strictEqual(HMLR_PRICE_PAID_PROVENANCE.licence, 'Open Government Licence v3.0');
  assert.strictEqual(HMLR_PRICE_PAID_PROVENANCE.notLegalAdvice, true);
  assert.strictEqual(HMLR_PRICE_PAID_PROVENANCE.notACommercialClearance, true);
  assert.ok(HMLR_PRICE_PAID_PROVENANCE.limitations.some((line) => /not a national gazetteer/i.test(line)));
  assert.ok(!/legally safe|commercially unrestricted|fully licensed/i.test(JSON.stringify(HMLR_PRICE_PAID_PROVENANCE)));
  assert.ok(!/legally safe|commercially unrestricted|fully licensed/i.test(JSON.stringify(UKHPI_PROVENANCE)));
});

(async () => {
  for (const item of pending) {
    try {
      await item.fn();
      console.log(`✓ ${item.name}`);
    } catch (error) {
      console.error(`✗ ${item.name}`);
      console.error(error);
      process.exit(1);
    }
  }
})();
