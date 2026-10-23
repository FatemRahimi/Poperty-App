/**
 * Phase 3I — Brownfield provider-attributed area evidence.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseBrownfieldEntity } = require('../services/market/brownfieldLandParser');
const { createMemoryBrownfieldLandStore } = require('../services/market/brownfieldLandStore');
const { createMemoryBrownfieldCoverageStore } = require('../services/market/brownfieldCoverageStore');
const { ingestBrownfieldOrganisationRecords, ingestBrownfieldLpaIdentities } = require('../services/market/ingestBrownfieldCoverage');
const { getOfficialBrownfieldCoverage } = require('../services/market/officialBrownfieldCoverage');
const { BROWNFIELD_COVERAGE_STATE } = require('../architecture/officialBrownfieldCoverage');
const { FORBIDDEN_PROVIDER_ATTRIBUTED_AREA_KEYS } = require('../architecture/officialBrownfieldProviderAttributedAreaEvidence');
const { getOfficialBrownfieldProviderAttributedAreaEvidence } = require('../services/market/officialBrownfieldProviderAttributedAreaEvidence');
const { AREA_EVIDENCE_FAMILY } = require('../architecture/officialAreaEvidenceProfileContract');

async function test(name, fn) {
  await fn();
  console.log(`ok ${name}`);
}

function entity(id, overrides = {}) {
  return {
    dataset: 'brownfield-land',
    entity: id,
    'entry-date': '2024-06-01',
    'organisation-entity': 100,
    reference: `REF-${id}`,
    name: `Site ${id}`,
    'minimum-net-dwellings': 4,
    'maximum-net-dwellings': 6,
    point: 'POINT (-0.120000 51.500000)',
    ...overrides,
  };
}

function row(id, overrides) {
  const parsed = parseBrownfieldEntity(entity(id, overrides));
  assert.strictEqual(parsed.ok, true);
  return parsed.row;
}

async function stores() {
  const coverageStore = createMemoryBrownfieldCoverageStore();
  const brownfieldStore = createMemoryBrownfieldLandStore();
  await ingestBrownfieldLpaIdentities({
    store: coverageStore,
    payload: {
      entities: [{
        dataset: 'local-planning-authority',
        entity: 1,
        name: 'Adur LPA',
        reference: 'E60000281',
      }],
    },
  });
  await ingestBrownfieldOrganisationRecords({
    store: coverageStore,
    payload: {
      organisations: [
        {
          entity: 100,
          name: 'Adur District Council',
          'local-planning-authority': 'E60000281',
          'statistical-geography': 'E07000223',
        },
        {
          entity: 101,
          name: 'Second Adur provider',
          'statistical-geography': 'E07000223',
        },
        {
          entity: 200,
          name: 'South Downs National Park Authority',
          'statistical-geography': 'E26000010',
        },
        {
          entity: 300,
          name: 'Other LAD',
          'statistical-geography': 'E08000025',
        },
      ],
    },
  });
  return { coverageStore, brownfieldStore };
}

(async () => {
  await test('valid LAD request returns provider-attributed evidence', async () => {
    const { coverageStore, brownfieldStore } = await stores();
    await brownfieldStore.importAcceptedBatch({ rows: [row(1)] });
    const evidence = await getOfficialBrownfieldProviderAttributedAreaEvidence({
      ladCode: 'E07000223',
      coverageStore,
      brownfieldStore,
      calculatedAt: '2026-10-23T16:00:00.000Z',
    });
    assert.strictEqual(evidence.status, 'SUFFICIENT');
    assert.strictEqual(evidence.geography.type, 'LAD');
    assert.strictEqual(evidence.geography.code, 'E07000223');
    assert.strictEqual(evidence.attributionBasis, 'PROVIDER_STATISTICAL_GEOGRAPHY');
    assert.strictEqual(evidence.notSiteLocation, true);
    assert.strictEqual(evidence.metrics.resolvedProviderAttributedRecordCount, 1);
    assert.strictEqual(evidence.factClass, 'AREA_CONTEXT');
    assert.ok(evidence.provenance.requestedLadCode);
    assert.strictEqual(evidence.provenance.calculatedAt, '2026-10-23T16:00:00.000Z');
  });

  await test('invalid LAD and LPA E60 codes are rejected', async () => {
    const { coverageStore, brownfieldStore } = await stores();
    const invalid = await getOfficialBrownfieldProviderAttributedAreaEvidence({
      ladCode: 'E60000281',
      coverageStore,
      brownfieldStore,
    });
    assert.strictEqual(invalid.status, 'UNAVAILABLE');
    assert.strictEqual(invalid.reason, 'unsupported_england_lad_district');
    assert.strictEqual(invalid.metrics.resolvedProviderAttributedRecordCount, 0);
    const text = await getOfficialBrownfieldProviderAttributedAreaEvidence({
      ladCode: 'Birmingham',
      coverageStore,
      brownfieldStore,
    });
    assert.strictEqual(text.status, 'UNAVAILABLE');
  });

  await test('only exact provider LAD attribution contributes', async () => {
    const { coverageStore, brownfieldStore } = await stores();
    await brownfieldStore.importAcceptedBatch({
      rows: [
        row(1, { 'organisation-entity': 100 }),
        row(2, { 'organisation-entity': 300, name: 'Birmingham site' }),
      ],
    });
    const evidence = await getOfficialBrownfieldProviderAttributedAreaEvidence({
      ladCode: 'E07000223',
      coverageStore,
      brownfieldStore,
    });
    assert.deepStrictEqual(evidence.provenance.resolvedSourceEntityIds, [1]);
    assert.strictEqual(evidence.providerContext.attributedProviderCount, 1);
  });

  await test('non-LAD provider and missing organisation are excluded', async () => {
    const { coverageStore, brownfieldStore } = await stores();
    const missingOrg = row(9, { 'organisation-entity': null, name: 'No org' });
    await brownfieldStore.importAcceptedBatch({
      rows: [
        row(1),
        row(8, { 'organisation-entity': 200, name: 'Park site' }),
        missingOrg,
      ],
    });
    const evidence = await getOfficialBrownfieldProviderAttributedAreaEvidence({
      ladCode: 'E07000223',
      coverageStore,
      brownfieldStore,
    });
    assert.deepStrictEqual(evidence.provenance.resolvedSourceEntityIds, [1]);
    assert.ok(evidence.limitations.some((line) => /without organisation_entity/i.test(line)));
    assert.ok(evidence.counterEvidence.some((item) => item.code === 'non_lad_providers_excluded'));
  });

  await test('resolved included, ambiguous excluded but counted, revisions not double counted', async () => {
    const { coverageStore, brownfieldStore } = await stores();
    await brownfieldStore.importAcceptedBatch({
      rows: [
        row(1, { 'entry-date': '2024-01-01', 'minimum-net-dwellings': 1, 'maximum-net-dwellings': 1, name: 'Old' }),
        row(1, { 'entry-date': '2025-06-01', 'minimum-net-dwellings': 9, 'maximum-net-dwellings': 11, name: 'New' }),
        row(2, { 'entry-date': '2024-06-01', name: 'Tie A', 'minimum-net-dwellings': 3, 'maximum-net-dwellings': 3 }),
        row(2, { 'entry-date': '2024-06-01', name: 'Tie B', 'minimum-net-dwellings': 8, 'maximum-net-dwellings': 8 }),
      ],
    });
    const evidence = await getOfficialBrownfieldProviderAttributedAreaEvidence({
      ladCode: 'E07000223',
      coverageStore,
      brownfieldStore,
    });
    assert.strictEqual(evidence.metrics.resolvedProviderAttributedRecordCount, 1);
    assert.strictEqual(evidence.metrics.ambiguousRecordCount, 1);
    assert.strictEqual(evidence.capacity.recordedMinimumDwellingCapacitySum, 9);
    assert.strictEqual(evidence.capacity.recordedMaximumDwellingCapacitySum, 11);
    assert.strictEqual(evidence.status, 'PARTIAL');
    assert.ok(evidence.counterEvidence.some((item) => item.code === 'ambiguous_revisions_excluded'));
    assert.ok(evidence.investigateNext.some((item) => item.code === 'investigate_ambiguous_source_revisions'));
  });

  await test('missing capacity is not zero and ended records stay in the resolved count', async () => {
    const { coverageStore, brownfieldStore } = await stores();
    await brownfieldStore.importAcceptedBatch({
      rows: [
        row(1, { 'minimum-net-dwellings': null, 'maximum-net-dwellings': 5 }),
        row(2, { 'minimum-net-dwellings': 2, 'maximum-net-dwellings': null, 'end-date': '2023-03-31' }),
      ],
    });
    const evidence = await getOfficialBrownfieldProviderAttributedAreaEvidence({
      ladCode: 'E07000223',
      coverageStore,
      brownfieldStore,
    });
    assert.strictEqual(evidence.metrics.resolvedProviderAttributedRecordCount, 2);
    assert.strictEqual(evidence.metrics.resolvedEndedRecordCount, 1);
    assert.strictEqual(evidence.metrics.resolvedWithoutEndDateCount, 1);
    assert.strictEqual(evidence.capacity.recordedMinimumDwellingCapacitySum, 2);
    assert.strictEqual(evidence.capacity.recordedMaximumDwellingCapacitySum, 5);
    assert.strictEqual(evidence.capacity.recordsMissingMinimumCapacity, 1);
    assert.strictEqual(evidence.capacity.recordsMissingMaximumCapacity, 1);
    assert.strictEqual(evidence.capacity.notGuaranteedFutureSupply, true);
    assert.ok(evidence.counterEvidence.some((item) => item.code === 'ended_register_rows_present'));
    assert.ok(!JSON.stringify(evidence).includes('completed'));
  });

  await test('zero result is not no Brownfield', async () => {
    const { coverageStore, brownfieldStore } = await stores();
    const evidence = await getOfficialBrownfieldProviderAttributedAreaEvidence({
      ladCode: 'E09000001',
      coverageStore,
      brownfieldStore,
    });
    assert.strictEqual(evidence.metrics.resolvedProviderAttributedRecordCount, 0);
    assert.strictEqual(evidence.notProofOfNoBrownfield, true);
    assert.strictEqual(evidence.reason, 'no_resolved_provider_attributed_records');
    assert.ok(evidence.counterEvidence.some((item) => item.code === 'zero_is_not_absence'));
    assert.ok(!JSON.stringify(evidence).includes('No Brownfield sites'));
  });

  await test('multiple providers for one LAD are counted without site-location claims', async () => {
    const { coverageStore, brownfieldStore } = await stores();
    await brownfieldStore.importAcceptedBatch({
      rows: [
        row(1, { 'organisation-entity': 100 }),
        row(2, { 'organisation-entity': 101, name: 'Second' }),
      ],
    });
    const evidence = await getOfficialBrownfieldProviderAttributedAreaEvidence({
      ladCode: 'E07000223',
      coverageStore,
      brownfieldStore,
    });
    assert.strictEqual(evidence.providerContext.attributedProviderCount, 2);
    assert.strictEqual(evidence.metrics.resolvedProviderAttributedRecordCount, 2);
    assert.ok(evidence.limitations.some((line) => /does NOT establish/i.test(line)));
    FORBIDDEN_PROVIDER_ATTRIBUTED_AREA_KEYS.forEach((key) => {
      assert.ok(!new RegExp(`"${key}"\\s*:`).test(JSON.stringify(evidence)));
    });
  });

  await test('Phase 3C mapping stays separate and profile stays unwired', async () => {
    const { coverageStore } = await stores();
    const coverage = await getOfficialBrownfieldCoverage({
      coverageStore,
      organisationEntity: 100,
    });
    assert.ok(coverage.states.includes(BROWNFIELD_COVERAGE_STATE.ORGANISATION_LPA_MAPPED));
    assert.ok(!Object.values(AREA_EVIDENCE_FAMILY).includes('brownfield'));
    const profile = fs.readFileSync(path.join(__dirname, '../services/market/officialAreaEvidenceProfile.js'), 'utf8');
    assert.ok(!/brownfield/i.test(profile));
    assert.ok(evidenceHasNoPercentage());
  });

  function evidenceHasNoPercentage() {
    const source = fs.readFileSync(
      path.join(__dirname, '../services/market/officialBrownfieldProviderAttributedAreaEvidence.js'),
      'utf8'
    );
    return !/completenessPercentage|coveragePercentage/.test(source);
  }

  await test('counter-evidence and investigate-next are deterministic', async () => {
    const { coverageStore, brownfieldStore } = await stores();
    await brownfieldStore.importAcceptedBatch({ rows: [row(1)] });
    const a = await getOfficialBrownfieldProviderAttributedAreaEvidence({
      ladCode: 'E07000223', coverageStore, brownfieldStore,
    });
    const b = await getOfficialBrownfieldProviderAttributedAreaEvidence({
      ladCode: 'E07000223', coverageStore, brownfieldStore,
    });
    assert.deepStrictEqual(a.counterEvidence, b.counterEvidence);
    assert.deepStrictEqual(a.investigateNext, b.investigateNext);
    assert.ok(a.investigateNext.some((item) => item.code === 'verify_physical_site_geography'));
    assert.ok(!JSON.stringify(a.investigateNext).match(/BUY|AVOID/));
  });

  console.log('officialBrownfieldProviderAttributedAreaEvidence: 10 passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
