/**
 * Standalone official brownfield-land register evidence.
 * Site/register observations only. Not wired into areaEvidenceProfile.v1.
 * No construction, delivery, regeneration, or investment inference.
 */

const {
  BROWNFIELD_SOURCE,
  BROWNFIELD_DATASET,
  BROWNFIELD_DATASET_LABEL,
  BROWNFIELD_SOURCE_PRODUCT,
  BROWNFIELD_RELEASE_LABEL,
  BROWNFIELD_GEOGRAPHIC_SCOPE,
  BROWNFIELD_GEOGRAPHY_TYPE,
  BROWNFIELD_DWELLING_NATURE,
  BROWNFIELD_LIMITATIONS,
  BROWNFIELD_PROVENANCE,
  FORBIDDEN_BROWNFIELD_INFERENCE_KEYS,
  MARKET_RECORD_KIND,
} = require('../../architecture/officialBrownfieldLandDataset');
const {
  EVIDENCE_CLASS,
} = require('../../architecture/evidenceContract');

const SUFFICIENCY = Object.freeze({
  SUFFICIENT: 'SUFFICIENT',
  INSUFFICIENT: 'INSUFFICIENT',
  UNAVAILABLE: 'UNAVAILABLE',
  UNRESOLVED: 'UNRESOLVED',
});

function assertNoInferenceFields(payload) {
  const text = JSON.stringify(payload);
  FORBIDDEN_BROWNFIELD_INFERENCE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key) || new RegExp(`"${key}"\\s*:`).test(text)) {
      throw new Error(`forbidden_brownfield_inference_field:${key}`);
    }
  });
}

function unavailableResult(reason, extras = {}) {
  return {
    status: SUFFICIENCY.UNAVAILABLE,
    reason,
    subject: extras.subject || null,
    observations: [],
    evidence: [],
    coverage: extras.coverage || null,
    geographicScope: BROWNFIELD_GEOGRAPHIC_SCOPE,
    geographyType: BROWNFIELD_GEOGRAPHY_TYPE,
    limitations: BROWNFIELD_LIMITATIONS.slice(),
    provenance: BROWNFIELD_PROVENANCE,
    recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
    factClass: EVIDENCE_CLASS.AREA_CONTEXT,
    dwellingNature: BROWNFIELD_DWELLING_NATURE,
    notProofOfNoDevelopment: true,
    notConstructionEvidence: true,
    notHousingDelivery: true,
    notRegenerationEvidence: true,
  };
}

function publicObservation(row) {
  return {
    recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
    source: row.source || BROWNFIELD_SOURCE,
    dataset: row.dataset || BROWNFIELD_DATASET,
    datasetLabel: row.datasetLabel || BROWNFIELD_DATASET_LABEL,
    sourceProduct: row.sourceProduct || BROWNFIELD_SOURCE_PRODUCT,
    sourceEntityId: row.sourceEntityId,
    organisationEntity: row.organisationEntity,
    reference: row.reference,
    name: row.name,
    siteAddress: row.siteAddress,
    ownershipStatus: row.ownershipStatus,
    planningPermissionStatus: row.planningPermissionStatus,
    planningPermissionType: row.planningPermissionType,
    planningPermissionDate: row.planningPermissionDate,
    minimumNetDwellings: row.minimumNetDwellings,
    maximumNetDwellings: row.maximumNetDwellings,
    dwellingNature: BROWNFIELD_DWELLING_NATURE,
    deliverable: row.deliverable,
    hectares: row.hectares,
    pointWkt: row.pointWkt,
    latitude: row.latitude,
    longitude: row.longitude,
    geometryWkt: row.geometryWkt,
    coordinateReferenceSystem: row.coordinateReferenceSystem,
    entryDate: row.entryDate,
    startDate: row.startDate,
    endDate: row.endDate,
    notes: row.notes,
    sitePlanUrl: row.sitePlanUrl,
    releaseLabel: row.releaseLabel,
    contentFingerprint: row.contentFingerprint,
    retrievedAt: row.retrievedAt || null,
    ingestedAt: row.ingestedAt || null,
    provenance: row.provenance || null,
  };
}

async function getOfficialBrownfieldLandEvidence({
  brownfieldStore = null,
  sourceEntityId = null,
  organisationEntity = null,
  releaseLabel = BROWNFIELD_RELEASE_LABEL,
} = {}) {
  if (!brownfieldStore) {
    const result = unavailableResult('brownfield_store_not_provided');
    assertNoInferenceFields(result);
    return result;
  }

  let query;
  let subject = {
    geographyType: BROWNFIELD_GEOGRAPHY_TYPE,
    geographicScope: BROWNFIELD_GEOGRAPHIC_SCOPE,
    sourceEntityId: sourceEntityId == null ? null : Number(sourceEntityId),
    organisationEntity: organisationEntity == null ? null : Number(organisationEntity),
  };

  if (sourceEntityId != null && sourceEntityId !== '') {
    query = await brownfieldStore.queryBySourceEntityId(sourceEntityId, { releaseLabel });
  } else if (organisationEntity != null && organisationEntity !== '') {
    query = await brownfieldStore.queryByOrganisationEntity(organisationEntity, { releaseLabel });
  } else {
    query = await brownfieldStore.listObservations({ releaseLabel });
    query.matched = (query.observations || []).length > 0;
    query.matchStatus = query.matched
      ? 'MATCHED'
      : (query.datasetCoverage?.state === 'NOT_IMPORTED' ? 'NOT_IMPORTED' : 'EMPTY');
  }

  if (query.datasetCoverage?.state === 'NOT_IMPORTED' || query.matchStatus === 'NOT_IMPORTED') {
    const result = unavailableResult('brownfield_not_imported', {
      subject,
      coverage: query.datasetCoverage,
    });
    assertNoInferenceFields(result);
    return result;
  }
  if (query.datasetCoverage?.state === 'ERROR') {
    const result = unavailableResult('brownfield_error', {
      subject,
      coverage: query.datasetCoverage,
    });
    assertNoInferenceFields(result);
    return result;
  }
  if (!query.matched || !(query.observations || []).length) {
    const result = unavailableResult(
      sourceEntityId != null || organisationEntity != null
        ? 'brownfield_no_match'
        : 'brownfield_empty',
      {
        subject,
        coverage: query.datasetCoverage,
      }
    );
    assertNoInferenceFields(result);
    return result;
  }

  const observations = query.observations.map(publicObservation);
  const result = {
    status: SUFFICIENCY.SUFFICIENT,
    reason: null,
    subject,
    observations,
    evidence: observations.map((row) => ({
      recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
      factClass: EVIDENCE_CLASS.AREA_CONTEXT,
      sourceEntityId: row.sourceEntityId,
      reference: row.reference,
      dwellingNature: BROWNFIELD_DWELLING_NATURE,
      minimumNetDwellings: row.minimumNetDwellings,
      maximumNetDwellings: row.maximumNetDwellings,
      planningPermissionStatus: row.planningPermissionStatus,
      ownershipStatus: row.ownershipStatus,
      contentFingerprint: row.contentFingerprint,
      provenance: row.provenance,
    })),
    coverage: query.datasetCoverage,
    geographicScope: BROWNFIELD_GEOGRAPHIC_SCOPE,
    geographyType: BROWNFIELD_GEOGRAPHY_TYPE,
    limitations: BROWNFIELD_LIMITATIONS.slice(),
    provenance: observations[0]?.provenance || BROWNFIELD_PROVENANCE,
    recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
    factClass: EVIDENCE_CLASS.AREA_CONTEXT,
    dwellingNature: BROWNFIELD_DWELLING_NATURE,
    notProofOfNoDevelopment: true,
    notConstructionEvidence: true,
    notHousingDelivery: true,
    notRegenerationEvidence: true,
  };
  assertNoInferenceFields(result);
  return result;
}

module.exports = {
  SUFFICIENCY,
  FORBIDDEN_BROWNFIELD_INFERENCE_KEYS,
  getOfficialBrownfieldLandEvidence,
};
