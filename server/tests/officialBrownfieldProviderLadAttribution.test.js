/**
 * Phase 3H — Brownfield provider → LAD attribution validation.
 */

const assert = require('assert');
const {
  PROVIDER_LAD_ATTRIBUTION_STATUS,
  PROVIDER_LAD_ATTRIBUTION_METHOD,
  FORBIDDEN_PROVIDER_LAD_ATTRIBUTION_KEYS,
  isSupportedEnglandLadDistrictGssCode,
  isPlanningDataLpaReferenceCode,
} = require('../architecture/officialBrownfieldProviderLadAttribution');
const {
  attributeBrownfieldProviderLad,
  diagnoseBrownfieldProviderLadAttribution,
  inspectStatisticalGeographyRaw,
} = require('../services/market/brownfieldProviderLadAttribution');
const {
  createMemoryBrownfieldCoverageStore,
} = require('../services/market/brownfieldCoverageStore');
const {
  ingestBrownfieldLpaIdentities,
  ingestBrownfieldOrganisationRecords,
} = require('../services/market/ingestBrownfieldCoverage');
const {
  BROWNFIELD_COVERAGE_STATE,
} = require('../architecture/officialBrownfieldCoverage');
const { getOfficialBrownfieldCoverage } = require('../services/market/officialBrownfieldCoverage');
const { isEnglandLadGssCode } = require('../architecture/officialAreaEconomicDataset');
const {
  AREA_EVIDENCE_FAMILY,
} = require('../architecture/officialAreaEvidenceProfileContract');
const fs = require('fs');
const path = require('path');

async function test(name, fn) {
  await fn();
  console.log(`ok ${name}`);
}

(async () => {
  await test('supported England LAD district codes are accepted; LPA E60 codes are rejected', () => {
    assert.strictEqual(isSupportedEnglandLadDistrictGssCode('E07000028'), true);
    assert.strictEqual(isSupportedEnglandLadDistrictGssCode('E06000063'), true);
    assert.strictEqual(isSupportedEnglandLadDistrictGssCode('E08000025'), true);
    assert.strictEqual(isSupportedEnglandLadDistrictGssCode('E09000022'), true);
    assert.strictEqual(isSupportedEnglandLadDistrictGssCode('E60000021'), false);
    assert.strictEqual(isSupportedEnglandLadDistrictGssCode('E60000334'), false);
    assert.strictEqual(isPlanningDataLpaReferenceCode('E60000021'), true);
    assert.strictEqual(isPlanningDataLpaReferenceCode('E07000028'), false);
    // Existing broad validator still matches E60; attribution must not reuse it alone.
    assert.strictEqual(isEnglandLadGssCode('E60000021'), true);
    assert.strictEqual(isSupportedEnglandLadDistrictGssCode('E60000021'), false);
  });

  await test('valid supported LAD statistical geography attributes the provider', () => {
    const result = attributeBrownfieldProviderLad(10000, {
      name: 'Cumberland Council',
      statisticalGeography: 'E06000063',
      localPlanningAuthorityCode: 'E60000334',
      sourceUrl: 'https://www.planning.data.gov.uk/entity/10000',
      retrievedAt: '2026-10-23T12:00:00.000Z',
    });
    assert.strictEqual(result.status, PROVIDER_LAD_ATTRIBUTION_STATUS.PROVIDER_LAD_ATTRIBUTED);
    assert.strictEqual(result.validatedLadGssCode, 'E06000063');
    assert.strictEqual(result.statisticalGeographyRaw, 'E06000063');
    assert.strictEqual(
      result.attributionMethod,
      PROVIDER_LAD_ATTRIBUTION_METHOD.ORGANISATION_STATISTICAL_GEOGRAPHY
    );
    assert.strictEqual(result.notSiteLocation, true);
    assert.strictEqual(result.notProofOfSiteWithinLad, true);
    assert.ok(result.provenance.validationRule);
    assert.strictEqual(result.provenance.statisticalGeographyRaw, 'E06000063');
  });

  await test('known LPA/non-LAD statistical geography is rejected', () => {
    const result = attributeBrownfieldProviderLad(10, {
      name: 'Shared dataset manager',
      statisticalGeography: 'E60000195',
    });
    assert.strictEqual(result.status, PROVIDER_LAD_ATTRIBUTION_STATUS.STATISTICAL_GEOGRAPHY_NOT_LAD);
    assert.strictEqual(result.validatedLadGssCode, null);
    assert.strictEqual(result.statisticalGeographyRaw, 'E60000195');
    assert.strictEqual(result.reason, 'statistical_geography_is_planning_data_lpa_reference');
  });

  await test('missing statistical geography is classified', () => {
    const result = attributeBrownfieldProviderLad(356, {
      name: 'Waveney District Council',
      statisticalGeography: null,
    });
    assert.strictEqual(result.status, PROVIDER_LAD_ATTRIBUTION_STATUS.STATISTICAL_GEOGRAPHY_MISSING);
    assert.strictEqual(result.validatedLadGssCode, null);
  });

  await test('unresolved organisation stays unresolved', () => {
    const result = attributeBrownfieldProviderLad(999001, null);
    assert.strictEqual(result.status, PROVIDER_LAD_ATTRIBUTION_STATUS.ORGANISATION_UNRESOLVED);
    assert.strictEqual(result.validatedLadGssCode, null);
  });

  await test('malformed and ambiguous geography stay unresolved/not silently chosen', () => {
    const malformed = attributeBrownfieldProviderLad(1, {
      name: 'X',
      statisticalGeography: 'not-a-gss',
    });
    assert.strictEqual(malformed.status, PROVIDER_LAD_ATTRIBUTION_STATUS.STATISTICAL_GEOGRAPHY_NOT_LAD);

    const ambiguous = attributeBrownfieldProviderLad(2, {
      name: 'Y',
      statisticalGeography: 'E07000028,E06000063',
    });
    assert.strictEqual(ambiguous.status, PROVIDER_LAD_ATTRIBUTION_STATUS.STATISTICAL_GEOGRAPHY_AMBIGUOUS);
    assert.strictEqual(ambiguous.validatedLadGssCode, null);
    assert.deepStrictEqual(
      inspectStatisticalGeographyRaw('E07000028 E06000063').codes.sort(),
      ['E06000063', 'E07000028']
    );
  });

  await test('no site-location claim and forbidden keys stay absent', () => {
    const result = attributeBrownfieldProviderLad(73, {
      name: 'Carlisle City Council',
      statisticalGeography: 'E07000028',
    });
    FORBIDDEN_PROVIDER_LAD_ATTRIBUTION_KEYS.forEach((key) => {
      assert.strictEqual(Object.prototype.hasOwnProperty.call(result, key), false);
    });
    assert.ok(!JSON.stringify(result).includes('"siteLocated"'));
    assert.ok(!JSON.stringify(result).includes('"sitesInLad"'));
    assert.ok(result.limitations.some((line) => /does NOT prove/i.test(line)));
  });

  await test('Phase 3C organisation→LPA mapping remains unchanged and separate', async () => {
    const store = createMemoryBrownfieldCoverageStore();
    await ingestBrownfieldLpaIdentities({
      store,
      retrievedAt: '2026-10-23T12:00:00.000Z',
      payload: {
        entities: [{
          dataset: 'local-planning-authority',
          entity: 1,
          name: 'Cumberland',
          reference: 'E60000334',
        }],
      },
    });
    await ingestBrownfieldOrganisationRecords({
      store,
      retrievedAt: '2026-10-23T12:00:00.000Z',
      payload: {
        organisations: [{
          entity: 10000,
          dataset: 'local-authority',
          name: 'Cumberland Council',
          'local-planning-authority': 'E60000334',
          'statistical-geography': 'E06000063',
        }],
      },
    });
    const coverage = await getOfficialBrownfieldCoverage({
      coverageStore: store,
      organisationEntity: 10000,
    });
    assert.ok(coverage.states.includes(BROWNFIELD_COVERAGE_STATE.ORGANISATION_LPA_MAPPED));
    assert.strictEqual(coverage.organisation.record.matchedLpaReference, 'E60000334');

    const attribution = attributeBrownfieldProviderLad(10000, await store.getOrganisation(10000));
    assert.strictEqual(attribution.status, PROVIDER_LAD_ATTRIBUTION_STATUS.PROVIDER_LAD_ATTRIBUTED);
    assert.strictEqual(attribution.validatedLadGssCode, 'E06000063');
    assert.notStrictEqual(attribution.validatedLadGssCode, attribution.localPlanningAuthorityCode);
    assert.strictEqual(attribution.provenance.phase3cLpaMappingNotUsedAsGeography, true);
  });

  await test('diagnostics expose raw counts and no completeness inference', async () => {
    const store = createMemoryBrownfieldCoverageStore();
    await ingestBrownfieldOrganisationRecords({
      store,
      payload: {
        organisations: [
          {
            entity: 10000,
            name: 'Cumberland Council',
            'local-planning-authority': 'E60000334',
            'statistical-geography': 'E06000063',
          },
          {
            entity: 10,
            name: 'Shared dataset manager',
            'statistical-geography': 'E60000195',
          },
          {
            entity: 356,
            name: 'Waveney District Council',
            'statistical-geography': null,
          },
        ],
      },
    });
    const diagnostic = await diagnoseBrownfieldProviderLadAttribution({
      coverageStore: store,
      organisationEntities: [10000, 10, 356, 999001],
      observationCountsByOrganisation: {
        10000: 40,
        10: 2,
        356: 5,
        999001: 3,
      },
    });
    assert.strictEqual(diagnostic.notEnglandCompleteness, true);
    assert.strictEqual(diagnostic.notAreaBrownfieldMetric, true);
    assert.strictEqual(diagnostic.providerCounts.providerLadAttributed, 1);
    assert.strictEqual(diagnostic.providerCounts.statisticalGeographyNotLad, 1);
    assert.strictEqual(diagnostic.providerCounts.statisticalGeographyMissing, 1);
    assert.strictEqual(diagnostic.providerCounts.organisationUnresolved, 1);
    assert.strictEqual(
      diagnostic.observationRowCountsByStatus[PROVIDER_LAD_ATTRIBUTION_STATUS.PROVIDER_LAD_ATTRIBUTED],
      40
    );
    assert.strictEqual(
      diagnostic.observationRowCountsByStatus[PROVIDER_LAD_ATTRIBUTION_STATUS.ORGANISATION_UNRESOLVED],
      3
    );
    assert.ok(!Object.prototype.hasOwnProperty.call(diagnostic, 'completenessPercentage'));
    assert.ok(!Object.prototype.hasOwnProperty.call(diagnostic, 'coveragePercentage'));
  });

  await test('deterministic result and areaEvidenceProfile still has no brownfield family', async () => {
    const a = attributeBrownfieldProviderLad(73, { name: 'Carlisle', statisticalGeography: 'E07000028' });
    const b = attributeBrownfieldProviderLad(73, { name: 'Carlisle', statisticalGeography: 'E07000028' });
    assert.deepStrictEqual(a, b);
    assert.ok(!Object.values(AREA_EVIDENCE_FAMILY).includes('brownfield'));
    const profileSource = fs.readFileSync(
      path.join(__dirname, '../services/market/officialAreaEvidenceProfile.js'),
      'utf8'
    );
    assert.ok(!/brownfield/i.test(profileSource));
  });

  console.log('officialBrownfieldProviderLadAttribution: 10 passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
