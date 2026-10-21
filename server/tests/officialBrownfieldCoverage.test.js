/**
 * Phase 3C — Official Brownfield provider coverage foundation.
 * Run: node tests/officialBrownfieldCoverage.test.js
 */

const assert = require('assert');

const {
  BROWNFIELD_COVERAGE_STATE,
  FORBIDDEN_COVERAGE_INFERENCE_KEYS,
  COVERAGE_LIMITATIONS,
} = require('../architecture/officialBrownfieldCoverage');
const { createMemoryBrownfieldCoverageStore } = require('../services/market/brownfieldCoverageStore');
const {
  ingestBrownfieldLpaIdentities,
  ingestBrownfieldProviderIndex,
  ingestBrownfieldOrganisationRecords,
  recordBrownfieldCoverageFailure,
} = require('../services/market/ingestBrownfieldCoverage');
const { getOfficialBrownfieldCoverage } = require('../services/market/officialBrownfieldCoverage');
const { selectEffectiveBrownfieldObservation, BROWNFIELD_SELECTION } = require('../services/market/brownfieldLandRevisionSelection');
const profileContract = require('../architecture/officialAreaEvidenceProfileContract');

const RETRIEVED_AT = '2026-10-21T18:00:00.000Z';

const PROVIDER_HTML = `
<html><body>
<p>Planning Data <a href="/data-provider/brownfield-land">brownfield-land</a> data providers</p>
<a class="govuk-link" href="/entity/73">Carlisle City Council</a>
<a href="/entity/336">Teignbridge District Council</a>
<!-- <a href="/entity/10">Shared manager</a> -->
</body></html>
`;

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

function assertNoInference(payload) {
  const blob = JSON.stringify(payload);
  FORBIDDEN_COVERAGE_INFERENCE_KEYS.forEach((key) => {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(payload, key), false, key);
    assert.strictEqual(new RegExp(`"${key}"\\s*:`).test(blob), false, key);
  });
  assert.strictEqual(blob.includes('ZERO_MATCHING_SITES'), false);
  assert.strictEqual(blob.includes('NO_BROWNFIELD'), false);
  assert.strictEqual(blob.includes('FULL_ENGLAND_COVERAGE'), false);
  assert.strictEqual(/%/.test(blob), false);
  assert.strictEqual(payload.notProofOfNoBrownfieldLand, true);
  assert.strictEqual(payload.notZeroMatchingSites, true);
  assert.strictEqual(payload.notNationalCompleteness, true);
  assert.strictEqual(payload.provenance.notACommercialClearance, true);
  assert.strictEqual(payload.provenance.releaseDate, null);
}

async function loadFoundation(store) {
  const lpas = await ingestBrownfieldLpaIdentities({
    store,
    retrievedAt: RETRIEVED_AT,
    payload: {
      entities: [
        {
          entity: 626195,
          dataset: 'local-planning-authority',
          name: 'Lambeth LPA',
          reference: 'E60000195',
          'entry-date': '2024-06-30',
          'organisation-entity': 10,
          geometry: 'MULTIPOLYGON(((0 0, 1 0, 1 1, 0 0)))',
          point: 'POINT(-0.1 51.4)',
        },
        {
          entity: 700021,
          name: 'Carlisle LPA',
          reference: 'E60000021',
          'entry-date': '2024-06-30',
          'organisation-entity': 10,
        },
        {
          entity: 700334,
          name: 'Cumberland LPA',
          reference: 'E60000334',
          'entry-date': '2024-06-30',
          'start-date': '2023-04-01',
        },
      ],
    },
  });
  const providers = await ingestBrownfieldProviderIndex({
    store,
    retrievedAt: RETRIEVED_AT,
    payload: PROVIDER_HTML,
  });
  const organisations = await ingestBrownfieldOrganisationRecords({
    store,
    retrievedAt: RETRIEVED_AT,
    payload: {
      organisations: [
        {
          entity: 10,
          dataset: 'organisation',
          name: 'Shared dataset manager',
          'statistical-geography': 'E60000195',
        },
        {
          entity: 73,
          dataset: 'local-authority',
          name: 'Carlisle City Council',
          'local-planning-authority': 'E60000021',
          'statistical-geography': 'E07000028',
          'end-date': '2023-03-31',
        },
        {
          entity: 10000,
          dataset: 'local-authority',
          name: 'Cumberland Council',
          'local-planning-authority': 'E60000334',
          'statistical-geography': 'E06000063',
          'start-date': '2023-04-01',
        },
        {
          entity: 356,
          dataset: 'local-authority',
          name: 'Waveney District Council',
          'end-date': '2019-03-31',
          'statistical-geography': 'E07000206',
        },
      ],
    },
  });
  return { lpas, providers, organisations };
}

(async () => {
  await test('LPA identity ingestion keeps reference and dates and drops geometry and manager id', async () => {
    const store = createMemoryBrownfieldCoverageStore();
    const result = await ingestBrownfieldLpaIdentities({
      store,
      retrievedAt: RETRIEVED_AT,
      payload: {
        entities: [{
          entity: 626195,
          name: 'Lambeth LPA',
          reference: 'E60000195',
          'entry-date': '2024-06-30',
          'organisation-entity': 10,
          geometry: 'MULTIPOLYGON(((0 0)))',
        }],
      },
    });
    assert.strictEqual(result.status, 'SUCCEEDED');
    assert.strictEqual(result.acceptedCount, 1);
    const row = await store.getLpaByReference('E60000195');
    assert.strictEqual(row.sourceEntityId, 626195);
    assert.strictEqual(row.name, 'Lambeth LPA');
    assert.strictEqual(row.entryDate, '2024-06-30');
    assert.strictEqual(row.retrievedAt, RETRIEVED_AT);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(row, 'organisationEntity'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(row, 'geometry'), false);
    assert.strictEqual(row.provenance.releaseDate, null);
    assert.strictEqual(row.provenance.notACommercialClearance, true);
  });

  await test('provider-index HTML ingestion is deterministic and ignores comments', async () => {
    const store = createMemoryBrownfieldCoverageStore();
    const result = await ingestBrownfieldProviderIndex({
      store,
      retrievedAt: RETRIEVED_AT,
      payload: PROVIDER_HTML,
    });
    assert.strictEqual(result.status, 'SUCCEEDED');
    assert.strictEqual(result.acceptedCount, 2);
    const carlisle = await store.getProvider(73);
    assert.strictEqual(carlisle.name, 'Carlisle City Council');
    assert.strictEqual(await store.getProvider(10), null);
    assert.strictEqual(carlisle.provenance.sourceUrl.includes('/data-provider/brownfield-land'), true);
  });

  await test('unrecognised provider HTML is a source error and not an empty index', async () => {
    const store = createMemoryBrownfieldCoverageStore();
    const result = await ingestBrownfieldProviderIndex({
      store,
      retrievedAt: RETRIEVED_AT,
      payload: '<html><body>Maintenance page</body></html>',
    });
    assert.strictEqual(result.status, 'SOURCE_ERROR');
    assert.strictEqual(result.reason, 'provider_index_structure_unrecognised');
    const evidence = await getOfficialBrownfieldCoverage({
      coverageStore: store,
      organisationEntity: 73,
    });
    assert.ok(evidence.states.includes(BROWNFIELD_COVERAGE_STATE.SOURCE_ERROR));
    assert.strictEqual(evidence.organisation.providerIndex.state, null);
    assert.strictEqual(evidence.states.includes(BROWNFIELD_COVERAGE_STATE.PROVIDER_INDEX_ABSENT), false);
    assertNoInference(evidence);
  });

  await test('organisation ingestion and exact LPA reference mapping', async () => {
    const store = createMemoryBrownfieldCoverageStore();
    await loadFoundation(store);
    const evidence = await getOfficialBrownfieldCoverage({
      coverageStore: store,
      organisationEntity: 10000,
    });
    assert.strictEqual(evidence.organisation.record.present, true);
    assert.strictEqual(evidence.organisation.record.localPlanningAuthorityCode, 'E60000334');
    assert.strictEqual(evidence.organisation.record.mappingState, BROWNFIELD_COVERAGE_STATE.ORGANISATION_LPA_MAPPED);
    assert.strictEqual(evidence.organisation.record.matchedLpaReference, 'E60000334');
    assert.strictEqual(evidence.organisation.record.startDate, '2023-04-01');
    assert.strictEqual(evidence.organisation.providerIndex.state, BROWNFIELD_COVERAGE_STATE.PROVIDER_INDEX_ABSENT);
    assertNoInference(evidence);
  });

  await test('shared LPA organisation-entity 10 does not map Lambeth to that organisation', async () => {
    const store = createMemoryBrownfieldCoverageStore();
    await loadFoundation(store);
    const manager = await getOfficialBrownfieldCoverage({
      coverageStore: store,
      organisationEntity: 10,
    });
    assert.strictEqual(manager.organisation.record.mappingState, BROWNFIELD_COVERAGE_STATE.ORGANISATION_LPA_UNMAPPED);
    assert.strictEqual(manager.organisation.record.matchedLpaReference, null);
    assert.strictEqual(manager.organisation.record.statisticalGeography, 'E60000195');
    const lambeth = await getOfficialBrownfieldCoverage({
      coverageStore: store,
      lpaReference: 'E60000195',
    });
    assert.strictEqual(lambeth.lpa.identityPresent, true);
    assert.ok(lambeth.states.includes(BROWNFIELD_COVERAGE_STATE.LPA_IDENTITY_PRESENT));
    assert.deepStrictEqual(lambeth.lpa.mappedOrganisations, []);
    assert.strictEqual(lambeth.lpa.notCompleteProviderCoverage, true);
    assertNoInference(lambeth);
  });

  await test('lowercase LPA code does not match and statistical geography is not a mapping key', async () => {
    const store = createMemoryBrownfieldCoverageStore();
    await ingestBrownfieldLpaIdentities({
      store,
      payload: [{ entity: 1, name: 'Cumberland LPA', reference: 'E60000334' }],
    });
    await ingestBrownfieldOrganisationRecords({
      store,
      payload: [{
        entity: 10000,
        name: 'Cumberland Council',
        'local-planning-authority': 'e60000334',
        'statistical-geography': 'E60000334',
      }],
    });
    const evidence = await getOfficialBrownfieldCoverage({
      coverageStore: store,
      organisationEntity: 10000,
    });
    assert.strictEqual(evidence.organisation.record.mappingState, BROWNFIELD_COVERAGE_STATE.ORGANISATION_LPA_UNMAPPED);
    assert.strictEqual(evidence.organisation.record.matchedLpaReference, null);
  });

  await test('provider listed and provider absent stay distinct from brownfield absence', async () => {
    const store = createMemoryBrownfieldCoverageStore();
    await loadFoundation(store);
    const listed = await getOfficialBrownfieldCoverage({
      coverageStore: store,
      organisationEntity: 73,
    });
    assert.ok(listed.states.includes(BROWNFIELD_COVERAGE_STATE.PROVIDER_LISTED));
    assert.strictEqual(listed.organisation.providerIndex.name, 'Carlisle City Council');
    const absent = await getOfficialBrownfieldCoverage({
      coverageStore: store,
      organisationEntity: 10000,
    });
    assert.ok(absent.states.includes(BROWNFIELD_COVERAGE_STATE.PROVIDER_INDEX_ABSENT));
    assert.strictEqual(absent.states.includes(BROWNFIELD_COVERAGE_STATE.PROVIDER_LISTED), false);
    assertNoInference(listed);
    assertNoInference(absent);
  });

  await test('missing LPA code is unmapped and a later exact LPA identity can map it', async () => {
    const store = createMemoryBrownfieldCoverageStore();
    await ingestBrownfieldOrganisationRecords({
      store,
      retrievedAt: RETRIEVED_AT,
      payload: [{ entity: 356, name: 'Waveney District Council', 'end-date': '2019-03-31' }],
    });
    const before = await getOfficialBrownfieldCoverage({
      coverageStore: store,
      organisationEntity: 356,
    });
    assert.strictEqual(before.organisation.record.mappingState, BROWNFIELD_COVERAGE_STATE.ORGANISATION_LPA_UNMAPPED);
    assert.strictEqual(before.organisation.record.endDate, '2019-03-31');
    await ingestBrownfieldLpaIdentities({
      store,
      payload: [{ entity: 9, name: 'Example LPA', reference: 'E60000999' }],
    });
    const still = await getOfficialBrownfieldCoverage({
      coverageStore: store,
      organisationEntity: 356,
    });
    assert.strictEqual(still.organisation.record.mappingState, BROWNFIELD_COVERAGE_STATE.ORGANISATION_LPA_UNMAPPED);
    await ingestBrownfieldOrganisationRecords({
      store,
      payload: [{
        entity: 10000,
        name: 'Cumberland Council',
        'local-planning-authority': 'E60000334',
      }],
    });
    const waiting = await getOfficialBrownfieldCoverage({
      coverageStore: store,
      organisationEntity: 10000,
    });
    assert.strictEqual(waiting.organisation.record.mappingState, BROWNFIELD_COVERAGE_STATE.ORGANISATION_LPA_UNMAPPED);
    await ingestBrownfieldLpaIdentities({
      store,
      payload: [{ entity: 700334, name: 'Cumberland LPA', reference: 'E60000334' }],
    });
    const mapped = await getOfficialBrownfieldCoverage({
      coverageStore: store,
      organisationEntity: 10000,
      lpaReference: 'E60000334',
    });
    assert.strictEqual(mapped.organisation.record.mappingState, BROWNFIELD_COVERAGE_STATE.ORGANISATION_LPA_MAPPED);
    assert.strictEqual(mapped.lpa.identityPresent, true);
    assert.strictEqual(mapped.lpa.mappedOrganisations.length, 1);
    assert.strictEqual(mapped.lpa.mappedOrganisations[0].organisationEntity, 10000);
  });

  await test('retrieval not run is distinct from a successful empty provider index', async () => {
    const notRun = await getOfficialBrownfieldCoverage({
      coverageStore: createMemoryBrownfieldCoverageStore(),
      organisationEntity: 73,
    });
    assert.deepStrictEqual(notRun.states, [BROWNFIELD_COVERAGE_STATE.COVERAGE_RETRIEVAL_NOT_RUN]);
    assert.strictEqual(notRun.organisation.providerIndex.state, null);
    const emptyStore = createMemoryBrownfieldCoverageStore();
    const empty = await ingestBrownfieldProviderIndex({
      store: emptyStore,
      payload: { providers: [] },
    });
    assert.strictEqual(empty.status, 'SUCCEEDED');
    assert.strictEqual(empty.acceptedCount, 0);
    const absent = await getOfficialBrownfieldCoverage({
      coverageStore: emptyStore,
      organisationEntity: 73,
    });
    assert.ok(absent.states.includes(BROWNFIELD_COVERAGE_STATE.PROVIDER_INDEX_ABSENT));
    assert.strictEqual(absent.states.includes(BROWNFIELD_COVERAGE_STATE.COVERAGE_RETRIEVAL_NOT_RUN), true);
    assertNoInference(notRun);
    assertNoInference(absent);
  });

  await test('retrieval failure is not provider absence', async () => {
    const store = createMemoryBrownfieldCoverageStore();
    await ingestBrownfieldProviderIndex({
      store,
      payload: PROVIDER_HTML,
    });
    const failure = await recordBrownfieldCoverageFailure({
      store,
      family: 'PROVIDER_INDEX',
      status: 'RETRIEVAL_FAILED',
      reason: 'timeout',
      retrievedAt: RETRIEVED_AT,
      sourceUrl: 'https://www.planning.data.gov.uk/data-provider/brownfield-land',
    });
    assert.strictEqual(failure.status, 'RETRIEVAL_FAILED');
    const evidence = await getOfficialBrownfieldCoverage({
      coverageStore: store,
      organisationEntity: 73,
    });
    assert.strictEqual(evidence.retrieval.providerIndex, BROWNFIELD_COVERAGE_STATE.RETRIEVAL_FAILED);
    assert.strictEqual(evidence.organisation.providerIndex.state, null);
    assert.strictEqual(evidence.states.includes(BROWNFIELD_COVERAGE_STATE.PROVIDER_INDEX_ABSENT), false);
    assert.strictEqual(evidence.states.includes(BROWNFIELD_COVERAGE_STATE.PROVIDER_LISTED), false);
    assert.strictEqual(evidence.states.includes(BROWNFIELD_COVERAGE_STATE.SOURCE_ERROR), false);
    assertNoInference(evidence);
  });

  await test('ended listed authority and successor stay unjoined and are not zero sites', async () => {
    const store = createMemoryBrownfieldCoverageStore();
    await loadFoundation(store);
    const ended = await getOfficialBrownfieldCoverage({
      coverageStore: store,
      organisationEntity: 73,
      lpaReference: 'E60000021',
    });
    assert.strictEqual(ended.organisation.record.endDate, '2023-03-31');
    assert.strictEqual(ended.organisation.record.mappingState, BROWNFIELD_COVERAGE_STATE.ORGANISATION_LPA_MAPPED);
    assert.strictEqual(ended.organisation.record.matchedLpaReference, 'E60000021');
    assert.ok(ended.states.includes(BROWNFIELD_COVERAGE_STATE.PROVIDER_LISTED));
    const successor = await getOfficialBrownfieldCoverage({
      coverageStore: store,
      organisationEntity: 10000,
      lpaReference: 'E60000334',
    });
    assert.strictEqual(successor.organisation.record.matchedLpaReference, 'E60000334');
    assert.strictEqual(successor.organisation.providerIndex.state, BROWNFIELD_COVERAGE_STATE.PROVIDER_INDEX_ABSENT);
    assert.strictEqual(successor.lpa.mappedOrganisations.some((row) => row.organisationEntity === 73), false);
    assert.strictEqual(ended.lpa.mappedOrganisations.some((row) => row.organisationEntity === 10000), false);
    const blob = JSON.stringify({ ended, successor, limitations: COVERAGE_LIMITATIONS });
    assert.strictEqual(blob.includes('successorOf'), false);
    assert.strictEqual(blob.includes('predecessorOf'), false);
    assert.strictEqual(blob.includes('ZERO_MATCHING_SITES'), false);
    assert.strictEqual(blob.includes('NO_BROWNFIELD'), false);
    assertNoInference(ended);
    assertNoInference(successor);
  });

  await test('site dataset is rejected by organisation ingestion and no completeness percentage is emitted', async () => {
    const store = createMemoryBrownfieldCoverageStore();
    const rejected = await ingestBrownfieldOrganisationRecords({
      store,
      payload: [{
        entity: 1700000,
        dataset: 'brownfield-land',
        name: 'BFR001',
        'local-planning-authority': 'E60000334',
      }],
    });
    assert.strictEqual(rejected.status, 'SOURCE_ERROR');
    assert.strictEqual(rejected.reason, 'unexpected_dataset');
    await loadFoundation(store);
    const evidence = await getOfficialBrownfieldCoverage({
      coverageStore: store,
      organisationEntity: 336,
      lpaReference: 'E60000195',
    });
    assert.strictEqual(evidence.organisation.record.present, false);
    assert.strictEqual(evidence.organisation.providerIndex.state, BROWNFIELD_COVERAGE_STATE.PROVIDER_LISTED);
    assert.strictEqual(evidence.lpa.identityPresent, true);
    assertNoInference(evidence);
    assert.ok(evidence.limitations.some((line) => /completeness percentage/i.test(line)));
    assert.ok(evidence.limitations.some((line) => /not zero brownfield sites/i.test(line)));
  });

  await test('areaEvidenceProfile.v1 remains unwired to brownfield', async () => {
    assert.ok(!Object.values(profileContract.AREA_EVIDENCE_FAMILY).includes('brownfield'));
    assert.ok(!profileContract.AREA_EVIDENCE_FAMILY_ORDER.some((id) => /brownfield/i.test(id)));
  });

  await test('Phase 3B revision selection is unchanged', async () => {
    const older = { sourceEntityId: 1, contentFingerprint: 'a', entryDate: '2024-01-01' };
    const newer = { sourceEntityId: 1, contentFingerprint: 'b', entryDate: '2025-06-01' };
    const resolved = selectEffectiveBrownfieldObservation([newer, older]);
    assert.strictEqual(resolved.selectionStatus, BROWNFIELD_SELECTION.RESOLVED);
    assert.strictEqual(resolved.selectionBasis, 'source_entry_date');
    assert.strictEqual(resolved.effectiveObservation.contentFingerprint, 'b');
    const tied = selectEffectiveBrownfieldObservation([
      { sourceEntityId: 1, contentFingerprint: 'a', entryDate: '2024-01-01' },
      { sourceEntityId: 1, contentFingerprint: 'b', entryDate: '2024-01-01' },
    ]);
    assert.strictEqual(tied.selectionStatus, BROWNFIELD_SELECTION.AMBIGUOUS);
    assert.strictEqual(tied.ambiguityReason, 'tied_source_entry_date');
    assert.strictEqual(tied.effectiveObservation, null);
    const missing = selectEffectiveBrownfieldObservation([
      { sourceEntityId: 1, contentFingerprint: 'a', entryDate: null },
      { sourceEntityId: 1, contentFingerprint: 'b', entryDate: null },
    ]);
    assert.strictEqual(missing.selectionStatus, BROWNFIELD_SELECTION.AMBIGUOUS);
    assert.strictEqual(missing.effectiveObservation, null);
  });

  if (process.exitCode) {
    console.error(`officialBrownfieldCoverage ${passed} passed before failure`);
    process.exit(process.exitCode);
  }
  console.log(`officialBrownfieldCoverage ${passed} passed`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
