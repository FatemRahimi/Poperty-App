/**
 * Phase 3A — Official Brownfield Land Evidence Foundation.
 * Run: node tests/officialAreaBrownfieldEvidence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  BROWNFIELD_SOURCE,
  BROWNFIELD_DATASET,
  BROWNFIELD_GEOGRAPHIC_SCOPE,
  BROWNFIELD_DWELLING_NATURE,
  BROWNFIELD_ATTRIBUTION,
  FORBIDDEN_BROWNFIELD_INFERENCE_KEYS,
  MARKET_RECORD_KIND,
} = require('../architecture/officialBrownfieldLandDataset');
const {
  parseBrownfieldEntity,
  parseBrownfieldEntitiesPayload,
  parseDwellingCount,
} = require('../services/market/brownfieldLandParser');
const {
  createMemoryBrownfieldLandStore,
} = require('../services/market/brownfieldLandStore');
const { ingestBrownfieldLand } = require('../services/market/ingestBrownfieldLand');
const {
  getOfficialBrownfieldLandEvidence,
} = require('../services/market/officialAreaBrownfieldEvidence');
const {
  BROWNFIELD_SELECTION,
  selectEffectiveBrownfieldObservation,
} = require('../services/market/brownfieldLandRevisionSelection');
const {
  mapApplication,
  DATASET: PLANNING_APPLICATION_DATASET,
} = require('../services/providers/planningData/planningApplicationClient');
const fsProfileContract = require('../architecture/officialAreaEvidenceProfileContract');

const FIXTURE = fs.readFileSync(
  path.join(__dirname, 'fixtures/planningdata-brownfield-land-min.json'),
  'utf8'
);

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

function assertNoForbidden(payload) {
  const blob = JSON.stringify(payload);
  FORBIDDEN_BROWNFIELD_INFERENCE_KEYS.forEach((key) => {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(payload, key), false, key);
    assert.strictEqual(new RegExp(`"${key}"\\s*:`).test(blob), false, key);
  });
  assert.ok(!/regenerat/i.test(blob) || blob.includes('notRegenerationEvidence'));
  assert.ok(!/"underConstruction"\s*:/.test(blob));
  assert.ok(!/"developer"\s*:/.test(blob));
}

(async () => {
  await test('valid official brownfield entity preserves identity and raw statuses', async () => {
    const parsed = parseBrownfieldEntity(JSON.parse(FIXTURE).entities[0], {
      retrievedAt: '2026-10-20T12:00:00.000Z',
      ingestedAt: '2026-10-20T12:00:00.000Z',
    });
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.row.source, BROWNFIELD_SOURCE);
    assert.strictEqual(parsed.row.dataset, BROWNFIELD_DATASET);
    assert.strictEqual(parsed.row.sourceEntityId, 1700000);
    assert.strictEqual(parsed.row.organisationEntity, 336);
    assert.strictEqual(parsed.row.reference, 'BFR001');
    assert.strictEqual(parsed.row.planningPermissionStatus, 'permissioned');
    assert.strictEqual(parsed.row.planningPermissionType, 'full-planning-permission');
    assert.strictEqual(parsed.row.ownershipStatus, 'not-owned-by-a-public-authority');
    assert.strictEqual(parsed.row.recordKind, MARKET_RECORD_KIND.OFFICIAL_OBSERVATION);
    assert.strictEqual(parsed.row.geographicScope, BROWNFIELD_GEOGRAPHIC_SCOPE);
    assert.ok(!Object.prototype.hasOwnProperty.call(parsed.row, 'developer'));
    assert.ok(!Object.prototype.hasOwnProperty.call(parsed.row, 'underConstruction'));
  });

  await test('missing optional fields remain null; missing entity rejected', async () => {
    const missingEntity = parseBrownfieldEntity({
      dataset: 'brownfield-land',
      reference: 'X',
      'minimum-net-dwellings': '1',
    });
    assert.strictEqual(missingEntity.ok, false);
    assert.strictEqual(missingEntity.reason, 'missing_source_entity_id');

    const optionalNulls = parseBrownfieldEntity({
      entity: 99,
      dataset: 'brownfield-land',
      reference: 'OPT',
      'organisation-entity': '',
      'minimum-net-dwellings': '',
      'maximum-net-dwellings': '',
      'planning-permission-status': '',
      'ownership-status': '',
      point: '',
      'entry-date': '',
      'start-date': '',
      'end-date': '',
      'planning-permission-date': '',
    });
    assert.strictEqual(optionalNulls.ok, true);
    assert.strictEqual(optionalNulls.row.organisationEntity, null);
    assert.strictEqual(optionalNulls.row.minimumNetDwellings, null);
    assert.strictEqual(optionalNulls.row.maximumNetDwellings, null);
    assert.strictEqual(optionalNulls.row.planningPermissionStatus, null);
    assert.strictEqual(optionalNulls.row.ownershipStatus, null);
    assert.strictEqual(optionalNulls.row.pointWkt, null);
    assert.strictEqual(optionalNulls.row.entryDate, null);
    assert.strictEqual(optionalNulls.row.planningPermissionDate, null);
  });

  await test('dwelling null != 0; explicit zero preserved; invalid rejected; no midpoint', async () => {
    assert.deepStrictEqual(parseDwellingCount('', 'minimum_net_dwellings'), {
      ok: true,
      value: null,
      present: false,
    });
    assert.deepStrictEqual(parseDwellingCount('0', 'minimum_net_dwellings'), {
      ok: true,
      value: 0,
      present: true,
    });
    assert.strictEqual(parseDwellingCount('1.5', 'minimum_net_dwellings').ok, false);
    assert.strictEqual(parseDwellingCount('abc', 'minimum_net_dwellings').ok, false);
    assert.strictEqual(parseDwellingCount('-1', 'minimum_net_dwellings').ok, false);

    const payload = parseBrownfieldEntitiesPayload(FIXTURE);
    const withNull = payload.rows.find((row) => row.sourceEntityId === 1700002);
    const withZero = payload.rows.find((row) => row.sourceEntityId === 1700001);
    assert.strictEqual(withNull.minimumNetDwellings, null);
    assert.strictEqual(withNull.maximumNetDwellings, null);
    assert.notStrictEqual(withNull.minimumNetDwellings, 0);
    assert.strictEqual(withZero.minimumNetDwellings, 0);
    assert.strictEqual(withZero.maximumNetDwellings, 0);
    assert.ok(!Object.prototype.hasOwnProperty.call(withNull, 'midpointDwellings'));
    assert.ok(!Object.prototype.hasOwnProperty.call(withNull, 'expectedDwellings'));
    assert.strictEqual(withNull.dwellingNature, BROWNFIELD_DWELLING_NATURE);
  });

  await test('permissioned does not create construction; dates stay separate', async () => {
    const row = parseBrownfieldEntity(JSON.parse(FIXTURE).entities[0]).row;
    assert.strictEqual(row.planningPermissionStatus, 'permissioned');
    assert.strictEqual(row.planningPermissionDate, '2001-10-26');
    assert.strictEqual(row.entryDate, '2024-12-16');
    assert.strictEqual(row.startDate, '2017-11-01');
    assert.strictEqual(row.endDate, null);
    assert.ok(!Object.prototype.hasOwnProperty.call(row, 'underConstruction'));
    assert.ok(!Object.prototype.hasOwnProperty.call(row, 'activeDevelopment'));
    assert.ok(!Object.prototype.hasOwnProperty.call(row, 'planningDate'));
    assert.ok(!Object.prototype.hasOwnProperty.call(row, 'dataDate'));
  });

  await test('geometry/point preserved with EPSG:4326 semantics', async () => {
    const row = parseBrownfieldEntity(JSON.parse(FIXTURE).entities[0]).row;
    assert.strictEqual(row.pointWkt, 'POINT (-3.493786 50.549744)');
    assert.strictEqual(row.longitude, -3.493786);
    assert.strictEqual(row.latitude, 50.549744);
    assert.strictEqual(row.coordinateReferenceSystem, 'EPSG:4326');
  });

  await test('same fingerprint duplicate; changed fingerprint retained as revision', async () => {
    const store = createMemoryBrownfieldLandStore();
    const first = await ingestBrownfieldLand({ store, entitiesJson: FIXTURE });
    assert.strictEqual(first.status, 'SUCCEEDED');
    assert.ok(first.inserted_count >= 3);

    const again = await ingestBrownfieldLand({ store, entitiesJson: FIXTURE });
    assert.strictEqual(again.status, 'SUCCEEDED');
    assert.strictEqual(again.unchanged_count, first.inserted_count);
    assert.strictEqual(again.inserted_count, 0);

    const changed = JSON.parse(FIXTURE);
    changed.entities[0]['minimum-net-dwellings'] = '20';
    changed.entities[0]['maximum-net-dwellings'] = '20';
    changed.entities[0]['entry-date'] = '2025-01-01';
    const revised = await ingestBrownfieldLand({ store, entitiesJson: JSON.stringify(changed) });
    assert.strictEqual(revised.inserted_count, 1);
    assert.strictEqual(revised.conflict_count, 0);

    const listed = await store.listRevisionsBySourceEntityId(1700000);
    assert.strictEqual(listed.revisions.length, 2);
    assert.strictEqual(listed.selection.selectionStatus, BROWNFIELD_SELECTION.RESOLVED);
    assert.strictEqual(listed.selection.selectionBasis, 'source_entry_date');
    assert.strictEqual(listed.selection.effectiveObservation.minimumNetDwellings, 20);
    assert.strictEqual(listed.selection.effectiveObservation.entryDate, '2025-01-01');

    const olderStillPresent = listed.revisions.some((row) => (
      row.minimumNetDwellings === 15 && row.entryDate === '2024-12-16'
    ));
    assert.strictEqual(olderStillPresent, true);
  });

  await test('later source entry-date wins even when older revision imported afterward', async () => {
    const store = createMemoryBrownfieldLandStore();
    const newerFirst = {
      entities: [{
        entity: 5001,
        dataset: 'brownfield-land',
        reference: 'REV-NEW',
        'organisation-entity': 1,
        'entry-date': '2025-06-01',
        'minimum-net-dwellings': '30',
        'maximum-net-dwellings': '30',
        'planning-permission-status': 'permissioned',
        'ownership-status': 'unknown-ownership',
        point: 'POINT (-1 51)',
      }],
    };
    const olderLater = {
      entities: [{
        entity: 5001,
        dataset: 'brownfield-land',
        reference: 'REV-OLD',
        'organisation-entity': 1,
        'entry-date': '2024-01-01',
        'minimum-net-dwellings': '10',
        'maximum-net-dwellings': '10',
        'planning-permission-status': 'not-permissioned',
        'ownership-status': 'unknown-ownership',
        point: 'POINT (-1 51)',
      }],
    };
    await ingestBrownfieldLand({ store, entities: newerFirst });
    await ingestBrownfieldLand({ store, entities: olderLater });
    const evidence = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      sourceEntityId: 5001,
    });
    assert.strictEqual(evidence.status, 'SUFFICIENT');
    assert.strictEqual(evidence.observations[0].minimumNetDwellings, 30);
    assert.strictEqual(evidence.observations[0].entryDate, '2025-06-01');
    assert.strictEqual(evidence.revisionSelection.selectionBasis, 'source_entry_date');
    assert.strictEqual(evidence.revisions.length, 2);
  });

  await test('missing chronology with changed revisions is AMBIGUOUS and not current fact', async () => {
    const store = createMemoryBrownfieldLandStore();
    const a = {
      entities: [{
        entity: 5002,
        dataset: 'brownfield-land',
        reference: 'AMB-A',
        'organisation-entity': 1,
        'entry-date': '',
        'minimum-net-dwellings': '5',
        'maximum-net-dwellings': '5',
        'planning-permission-status': 'permissioned',
        point: 'POINT (-1 51)',
      }],
    };
    const b = {
      entities: [{
        entity: 5002,
        dataset: 'brownfield-land',
        reference: 'AMB-B',
        'organisation-entity': 1,
        'entry-date': '',
        'minimum-net-dwellings': '8',
        'maximum-net-dwellings': '8',
        'planning-permission-status': 'not-permissioned',
        point: 'POINT (-1 51)',
      }],
    };
    await ingestBrownfieldLand({ store, entities: a });
    await ingestBrownfieldLand({ store, entities: b });
    const evidence = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      sourceEntityId: 5002,
    });
    assert.strictEqual(evidence.status, 'UNRESOLVED');
    assert.strictEqual(evidence.reason, 'brownfield_revision_ambiguous');
    assert.deepStrictEqual(evidence.observations, []);
    assert.strictEqual(evidence.revisionSelection.selectionStatus, BROWNFIELD_SELECTION.AMBIGUOUS);
    assert.strictEqual(evidence.revisionSelection.effectiveObservation, null);
    assert.ok(evidence.revisions.length >= 2);
    assert.ok(!Object.prototype.hasOwnProperty.call(evidence, 'developer'));
  });

  await test('tied entry-date and ingest/retrieval time are not used as chronology', async () => {
    const tied = selectEffectiveBrownfieldObservation([
      {
        sourceEntityId: 1,
        contentFingerprint: 'aaa',
        entryDate: '2025-01-01',
        ingestedAt: '2026-01-01T00:00:00.000Z',
        retrievedAt: '2026-02-01T00:00:00.000Z',
      },
      {
        sourceEntityId: 1,
        contentFingerprint: 'bbb',
        entryDate: '2025-01-01',
        ingestedAt: '2026-03-01T00:00:00.000Z',
        retrievedAt: '2026-04-01T00:00:00.000Z',
      },
    ]);
    assert.strictEqual(tied.selectionStatus, BROWNFIELD_SELECTION.AMBIGUOUS);
    assert.strictEqual(tied.effectiveObservation, null);
    assert.strictEqual(tied.ambiguityReason, 'tied_source_entry_date');

    const one = selectEffectiveBrownfieldObservation([
      { sourceEntityId: 1, contentFingerprint: 'only', entryDate: null },
    ]);
    assert.strictEqual(one.selectionStatus, BROWNFIELD_SELECTION.RESOLVED);
    assert.strictEqual(one.selectionBasis, 'single_observation');
  });

  await test('areaEvidenceProfile.v1 remains unwired to brownfield', async () => {
    assert.ok(!Object.values(fsProfileContract.AREA_EVIDENCE_FAMILY).includes('brownfield'));
    assert.ok(!fsProfileContract.AREA_EVIDENCE_FAMILY_ORDER.includes('brownfield'));
    assert.ok(!fsProfileContract.AREA_EVIDENCE_FAMILY_ORDER.some((id) => /brownfield/i.test(id)));
  });

  await test('coverage NOT_IMPORTED EMPTY ERROR and empty != no development', async () => {
    const emptyStore = createMemoryBrownfieldLandStore();
    const notImported = await getOfficialBrownfieldLandEvidence({ brownfieldStore: emptyStore });
    assert.strictEqual(notImported.status, 'UNAVAILABLE');
    assert.strictEqual(notImported.reason, 'brownfield_not_imported');
    assert.strictEqual(notImported.notProofOfNoDevelopment, true);
    assert.deepStrictEqual(notImported.observations, []);

    const emptyRunStore = createMemoryBrownfieldLandStore();
    const run = await emptyRunStore.startRun({ release_label: 'BROWNFIELD_LAND' });
    await emptyRunStore.finishRun(run.id, {
      status: 'SUCCEEDED',
      inserted_count: 0,
      rows_processed: 0,
    });
    const empty = await getOfficialBrownfieldLandEvidence({ brownfieldStore: emptyRunStore });
    assert.strictEqual(empty.status, 'UNAVAILABLE');
    assert.ok(['brownfield_empty', 'brownfield_no_match'].includes(empty.reason));
    assert.strictEqual(empty.coverage.state, 'EMPTY');
    assert.strictEqual(empty.notProofOfNoDevelopment, true);
    assert.ok(empty.limitations.some((line) => /does NOT prove that no brownfield/i.test(line)));

    const failed = createMemoryBrownfieldLandStore();
    const failedRun = await failed.startRun({ release_label: 'BROWNFIELD_LAND' });
    await failed.finishRun(failedRun.id, { status: 'FAILED', failure_reason: 'boom' });
    const errored = await getOfficialBrownfieldLandEvidence({ brownfieldStore: failed });
    assert.strictEqual(errored.status, 'UNAVAILABLE');
    assert.strictEqual(errored.reason, 'brownfield_error');
  });

  await test('evidence getter returns provenance attribution England scope and no scores', async () => {
    const { store } = await ingestBrownfieldLand({ entitiesJson: FIXTURE });
    const byId = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      sourceEntityId: 1700000,
    });
    assert.strictEqual(byId.status, 'SUFFICIENT');
    assert.strictEqual(byId.observations.length, 1);
    assert.strictEqual(byId.observations[0].sourceEntityId, 1700000);
    assert.strictEqual(byId.observations[0].dwellingNature, BROWNFIELD_DWELLING_NATURE);
    assert.strictEqual(byId.geographicScope, 'England');
    assert.ok(byId.provenance);
    assert.ok(
      (byId.provenance.requiredAttribution || '').includes('Open Government Licence')
      || BROWNFIELD_ATTRIBUTION.includes('Open Government Licence')
    );
    assert.strictEqual(byId.provenance.licence, 'Open Government Licence v3.0');
    assert.strictEqual(byId.provenance.notLegalAdvice, true);
    assert.strictEqual(byId.provenance.notACommercialClearance, true);
    assert.strictEqual(byId.notConstructionEvidence, true);
    assert.strictEqual(byId.notHousingDelivery, true);
    assert.strictEqual(byId.notRegenerationEvidence, true);
    assertNoForbidden(byId);

    const byOrg = await getOfficialBrownfieldLandEvidence({
      brownfieldStore: store,
      organisationEntity: 336,
    });
    assert.strictEqual(byOrg.status, 'SUFFICIENT');
    assert.ok(byOrg.observations.length >= 2);
    const ids = byOrg.observations.map((row) => row.sourceEntityId);
    assert.deepStrictEqual(ids, [...ids].sort((a, b) => a - b));
  });

  await test('deterministic ordering of listed observations', async () => {
    const { store } = await ingestBrownfieldLand({ entitiesJson: FIXTURE });
    const a = await getOfficialBrownfieldLandEvidence({ brownfieldStore: store });
    const b = await getOfficialBrownfieldLandEvidence({ brownfieldStore: store });
    assert.deepStrictEqual(
      a.observations.map((row) => row.sourceEntityId),
      b.observations.map((row) => row.sourceEntityId)
    );
    assert.deepStrictEqual(
      a.observations.map((row) => row.sourceEntityId),
      [1700000, 1700001, 1700002]
    );
  });

  await test('existing planning-application client mapping still works and is separate dataset', async () => {
    assert.strictEqual(PLANNING_APPLICATION_DATASET, 'planning-application');
    assert.notStrictEqual(PLANNING_APPLICATION_DATASET, BROWNFIELD_DATASET);
    const mapped = mapApplication({
      entity: 10000021617,
      reference: '2015/3212/P',
      description: 'Change of use',
      'address-text': 'High Holborn',
      point: 'POINT (-0.114869 51.518336)',
      'planning-application-status': 'Final Decision',
      'planning-decision-type': 'Granted',
      'decision-date': '2015-10-13',
      'start-date': '',
      'entry-date': '2025-09-09',
      'organisation-entity': 90,
    });
    assert.strictEqual(mapped.entityId, 10000021617);
    assert.strictEqual(mapped.nativeStatus, 'Final Decision');
    assert.strictEqual(mapped.reference, '2015/3212/P');
  });

  if (process.exitCode) process.exit(process.exitCode);
  console.log(`${passed} passed`);
})();
