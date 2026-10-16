/**
 * Release chronology is dated labels only. Text labels are not a timeline.
 * Run: node tests/releaseSelection.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  EFFECTIVE_SELECTION,
  compareDatedReleaseLabels,
  selectEffectiveRecords,
} = require('../services/market/releaseSelection');
const { createMemoryUkhpiStore } = require('../services/market/ukhpiStore');
const { ingestUkhpiCsv } = require('../services/market/ingestUkhpi');
const { createMemoryGeographyStore } = require('../services/market/geographyCrosswalkStore');
const { ingestGeographyCsv } = require('../services/market/ingestGeographyCrosswalk');

const HPI = 'Date,RegionName,AreaCode,AveragePrice,12m%Change';
const GEO = 'postcode,countrycode,localauthoritycode,ukhpiGeographycode';

function row(release, price = 100) {
  return {
    source: 'UK_HOUSE_PRICE_INDEX',
    geographyCode: 'E08000025',
    observationDate: '2024-01-01',
    propertyCategory: 'all',
    releaseLabel: release,
    averagePrice: price,
    annualChange: null,
  };
}

function choose(releases) {
  return selectEffectiveRecords(releases.map((release, index) => row(release, index + 1)), {
    identityFields: ['source', 'geographyCode', 'observationDate', 'propertyCategory'],
    succeededReleaseLabels: releases,
  });
}

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') throw new Error(`Use asyncTest for ${name}`);
  console.log(`✓ ${name}`);
}

const pending = [];
function asyncTest(name, fn) {
  pending.push({ name, fn });
}

test('dated releases order chronologically and text labels do not', () => {
  assert.ok(compareDatedReleaseLabels('2026-01', '2026-02') < 0);
  assert.ok(compareDatedReleaseLabels('2026-01-15', '2026-02-15') < 0);
  assert.strictEqual(compareDatedReleaseLabels('final-release', 'revised-release'), null);
  assert.strictEqual(compareDatedReleaseLabels('2026-09', 'final-release'), null);
  assert.strictEqual(compareDatedReleaseLabels('unspecified', '2026-09'), null);

  const newer = choose(['2026-01', '2026-02']);
  assert.strictEqual(newer.status, EFFECTIVE_SELECTION.RESOLVED);
  assert.strictEqual(newer.records.length, 1);
  assert.strictEqual(newer.records[0].releaseLabel, '2026-02');

  const days = choose(['2026-01-15', '2026-02-15']);
  assert.strictEqual(days.records[0].releaseLabel, '2026-02-15');

  const sole = choose(['final-release']);
  assert.strictEqual(sole.status, EFFECTIVE_SELECTION.RESOLVED);
  assert.strictEqual(sole.records[0].releaseLabel, 'final-release');

  ['final-release+revised', 'dated-plus-text', 'unspecified-plus-dated'].forEach((name) => {
    const labels = name === 'final-release+revised'
      ? ['final-release', 'revised-release']
      : name === 'dated-plus-text'
        ? ['2026-09', 'final-release']
        : ['unspecified', '2026-09'];
    const selected = choose(labels);
    assert.strictEqual(selected.status, EFFECTIVE_SELECTION.AMBIGUOUS, name);
    assert.strictEqual(selected.records.length, 0, name);
    assert.deepStrictEqual(selected.ambiguous[0].releases.slice().sort(), labels.slice().sort());
  });
});

test('release selection source does not use import time or growth', () => {
  const src = fs.readFileSync(path.join(__dirname, '../services/market/releaseSelection.js'), 'utf8');
  assert.ok(!/ingested_at|finished_at|localeCompare/.test(src));
  assert.ok(!/oneYear|threeYear|fiveYear|cagr/i.test(src));
});

asyncTest('import order does not replace a newer dated UKHPI release', async () => {
  const store = createMemoryUkhpiStore();
  await ingestUkhpiCsv(`${HPI}\n2024-01-01,Birmingham,E08000025,200000,\n`, {
    store,
    releaseLabel: '2026-02',
  });
  await ingestUkhpiCsv(`${HPI}\n2024-01-01,Birmingham,E08000025,100000,\n`, {
    store,
    releaseLabel: '2026-01',
  });
  const effective = await store.queryObservations({ geographyCode: 'E08000025' });
  assert.strictEqual(effective.effectiveSelection, EFFECTIVE_SELECTION.RESOLVED);
  assert.strictEqual(effective.observations.length, 1);
  assert.strictEqual(effective.observations[0].releaseLabel, '2026-02');
  assert.strictEqual(effective.observations[0].averagePrice, 200000);
  assert.strictEqual(effective.observations[0].annualChange, null);
  assert.notStrictEqual(effective.observations[0].annualChange, 0);
  assert.strictEqual(effective.growthCalculated, false);
  assert.strictEqual(effective.oneYearGrowth, undefined);
});

asyncTest('a failed UKHPI release does not become effective', async () => {
  const store = createMemoryUkhpiStore();
  await ingestUkhpiCsv(`${HPI}\n2024-01-01,Birmingham,E08000025,200000,\n`, {
    store,
    releaseLabel: '2026-02',
  });
  const run = await store.startRun({ release_label: 'final-release' });
  await store.upsert({
    source: 'UK_HOUSE_PRICE_INDEX',
    geographyCode: 'E08000025',
    observationDate: '2024-01-01',
    propertyCategory: 'all',
    releaseLabel: 'final-release',
    averagePrice: 1,
    annualChange: null,
    contentFingerprint: 'failed-release',
  });
  await store.finishRun(run.id, { status: 'FAILED', inserted_count: 1, rows_processed: 1 });
  const effective = await store.queryObservations({ geographyCode: 'E08000025' });
  assert.strictEqual(effective.effectiveSelection, EFFECTIVE_SELECTION.RESOLVED);
  assert.strictEqual(effective.observations[0].releaseLabel, '2026-02');
  assert.strictEqual(effective.observations[0].averagePrice, 200000);
  const history = await store.queryObservations({ geographyCode: 'E08000025', selection: 'history' });
  assert.strictEqual(history.observations.length, 2);
});

asyncTest('same UKHPI release duplicates or conflicts and mixed labels stay unresolved', async () => {
  const store = createMemoryUkhpiStore();
  const line = `${HPI}\n2024-01-01,Birmingham,E08000025,200000,\n`;
  const again = await ingestUkhpiCsv(line, { store, releaseLabel: '2026-02' });
  const duplicate = await ingestUkhpiCsv(line, { store, releaseLabel: '2026-02' });
  assert.strictEqual(again.inserted_count, 1);
  assert.strictEqual(duplicate.unchanged_count, 1);
  assert.strictEqual(duplicate.conflict_count, 0);
  const changed = await ingestUkhpiCsv(
    `${HPI}\n2024-01-01,Birmingham,E08000025,999999,1\n`,
    { store, releaseLabel: '2026-02' }
  );
  assert.strictEqual(changed.conflict_count, 1);
  assert.strictEqual(store.snapshot().filter((row) => row.releaseLabel === '2026-02').length, 1);

  await ingestUkhpiCsv(`${HPI}\n2024-01-01,Birmingham,E08000025,150000,\n`, {
    store,
    releaseLabel: 'final-release',
  });
  const mixed = await store.queryObservations({ geographyCode: 'E08000025' });
  assert.strictEqual(mixed.effectiveSelection, EFFECTIVE_SELECTION.AMBIGUOUS);
  assert.strictEqual(mixed.observations.length, 0);
  assert.notStrictEqual(mixed.effectiveSelection, 'NO_MATCH');
  assert.ok(mixed.ambiguous[0].releases.includes('2026-02'));
  assert.ok(mixed.ambiguous[0].releases.includes('final-release'));
  assert.strictEqual(mixed.growthCalculated, false);
});

asyncTest('a mixed geography release does not guess a postcode geography', async () => {
  const store = createMemoryGeographyStore();
  await ingestGeographyCsv(`${GEO}\nB1 2UJ,E92000001,E08000025,E08000025\n`, {
    store,
    releaseLabel: '2026-09',
  });
  await ingestGeographyCsv(`${GEO}\nB1 2UJ,E92000001,E08000026,E12000005\n`, {
    store,
    releaseLabel: 'final-release',
  });
  const lookup = await store.lookupByPostcode('B1 2UJ');
  assert.strictEqual(lookup.matchStatus, 'AMBIGUOUS');
  assert.strictEqual(lookup.effectiveSelection, EFFECTIVE_SELECTION.AMBIGUOUS);
  assert.strictEqual(lookup.matched, false);
  assert.strictEqual(lookup.geography, null);
  assert.notStrictEqual(lookup.matchStatus, 'NO_MATCH');
  assert.ok(lookup.ambiguousReleases.includes('2026-09'));
  assert.ok(lookup.ambiguousReleases.includes('final-release'));
  const history = await store.historyByPostcode('B1 2UJ');
  assert.strictEqual(history.length, 2);
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
