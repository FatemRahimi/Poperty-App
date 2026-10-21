/**
 * Brownfield provider-coverage lookup.
 * Preserves uncertainty. Does not answer "zero brownfield sites".
 */

const {
  BROWNFIELD_COVERAGE_STATE,
  COVERAGE_STATE_ORDER,
  COVERAGE_FAMILY,
  COVERAGE_RUN_STATUS,
  COVERAGE_LIMITATIONS,
  COVERAGE_ATTRIBUTION,
  COVERAGE_LICENCE,
  COVERAGE_PROVIDER,
  FORBIDDEN_COVERAGE_INFERENCE_KEYS,
  LPA_IDENTITY_PROVENANCE,
  PROVIDER_INDEX_PROVENANCE,
  ORGANISATION_RECORD_PROVENANCE,
} = require('../../architecture/officialBrownfieldCoverage');

function assertNoInference(payload) {
  const text = JSON.stringify(payload);
  FORBIDDEN_COVERAGE_INFERENCE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key) || new RegExp(`"${key}"\\s*:`).test(text)) {
      throw new Error(`forbidden_coverage_inference_field:${key}`);
    }
  });
  if (/"completenessPercentage"\s*:/.test(text) || /"coveragePercentage"\s*:/.test(text)) {
    throw new Error('forbidden_coverage_percentage');
  }
}

function retrievalState(run) {
  if (!run) return BROWNFIELD_COVERAGE_STATE.COVERAGE_RETRIEVAL_NOT_RUN;
  const status = String(run.status || '');
  if (status === COVERAGE_RUN_STATUS.SOURCE_ERROR) return BROWNFIELD_COVERAGE_STATE.SOURCE_ERROR;
  if (status === COVERAGE_RUN_STATUS.RETRIEVAL_FAILED) return BROWNFIELD_COVERAGE_STATE.RETRIEVAL_FAILED;
  if (status === COVERAGE_RUN_STATUS.SUCCEEDED) return COVERAGE_RUN_STATUS.SUCCEEDED;
  return BROWNFIELD_COVERAGE_STATE.COVERAGE_RETRIEVAL_NOT_RUN;
}

function orderedStates(states) {
  const present = new Set(states.filter(Boolean));
  return COVERAGE_STATE_ORDER.filter((state) => present.has(state));
}

function publicOrganisation(row, providerState) {
  return {
    organisationEntity: row.organisationEntity,
    name: row.name,
    localPlanningAuthorityCode: row.localPlanningAuthorityCode || null,
    statisticalGeography: row.statisticalGeography || null,
    startDate: row.startDate || null,
    endDate: row.endDate || null,
    mappingState: row.mappingStatus,
    matchedLpaReference: row.matchedLpaReference || null,
    matchedLpaEntityId: row.matchedLpaEntityId == null ? null : row.matchedLpaEntityId,
    providerIndexState: providerState,
    retrievedAt: row.retrievedAt || null,
    sourceUrl: row.sourceUrl || null,
  };
}

async function getOfficialBrownfieldCoverage({
  coverageStore = null,
  organisationEntity = null,
  lpaReference = null,
} = {}) {
  const subject = {
    organisationEntity: organisationEntity == null || organisationEntity === ''
      ? null
      : Number(organisationEntity),
    lpaReference: lpaReference == null || String(lpaReference).trim() === ''
      ? null
      : String(lpaReference).trim(),
  };

  if (!coverageStore) {
    const result = {
      states: [BROWNFIELD_COVERAGE_STATE.COVERAGE_RETRIEVAL_NOT_RUN],
      subject,
      retrieval: {
        lpaIdentity: BROWNFIELD_COVERAGE_STATE.COVERAGE_RETRIEVAL_NOT_RUN,
        providerIndex: BROWNFIELD_COVERAGE_STATE.COVERAGE_RETRIEVAL_NOT_RUN,
        organisationRecord: BROWNFIELD_COVERAGE_STATE.COVERAGE_RETRIEVAL_NOT_RUN,
      },
      organisation: null,
      lpa: null,
      notProofOfNoBrownfieldLand: true,
      notZeroMatchingSites: true,
      notNationalCompleteness: true,
      notStatutoryBrownfieldDutyCensus: true,
      limitations: COVERAGE_LIMITATIONS.slice(),
      provenance: {
        provider: COVERAGE_PROVIDER,
        licence: COVERAGE_LICENCE,
        requiredAttribution: COVERAGE_ATTRIBUTION,
        notACommercialClearance: true,
        notLegalAdvice: true,
        releaseDate: null,
      },
    };
    assertNoInference(result);
    return result;
  }

  const lpaRun = await coverageStore.latestRun(COVERAGE_FAMILY.LPA_IDENTITY);
  const providerRun = await coverageStore.latestRun(COVERAGE_FAMILY.PROVIDER_INDEX);
  const organisationRun = await coverageStore.latestRun(COVERAGE_FAMILY.ORGANISATION_RECORD);
  const lpaRetrieval = retrievalState(lpaRun);
  const providerRetrieval = retrievalState(providerRun);
  const organisationRetrieval = retrievalState(organisationRun);
  const lpaReady = lpaRetrieval === COVERAGE_RUN_STATUS.SUCCEEDED;
  const providerReady = providerRetrieval === COVERAGE_RUN_STATUS.SUCCEEDED;
  const organisationReady = organisationRetrieval === COVERAGE_RUN_STATUS.SUCCEEDED;

  const states = [];
  [lpaRetrieval, providerRetrieval, organisationRetrieval].forEach((state) => {
    if (state !== COVERAGE_RUN_STATUS.SUCCEEDED) states.push(state);
  });

  let organisation = null;
  if (subject.organisationEntity != null) {
    let providerIndexState = null;
    let providerRecord = null;
    if (providerReady) {
      providerRecord = await coverageStore.getProvider(subject.organisationEntity);
      providerIndexState = providerRecord
        ? BROWNFIELD_COVERAGE_STATE.PROVIDER_LISTED
        : BROWNFIELD_COVERAGE_STATE.PROVIDER_INDEX_ABSENT;
      states.push(providerIndexState);
    }
    let record = null;
    if (organisationReady) {
      record = await coverageStore.getOrganisation(subject.organisationEntity);
      if (record) states.push(record.mappingStatus);
    }
    organisation = {
      organisationEntity: subject.organisationEntity,
      providerIndex: {
        retrievalState: providerRetrieval,
        state: providerIndexState,
        name: providerRecord ? providerRecord.name : null,
        sourceUrl: providerRecord ? providerRecord.sourceUrl : (providerRun && providerRun.source_url) || null,
        retrievedAt: providerRecord
          ? providerRecord.retrievedAt
          : (providerRun && (providerRun.retrieved_at || providerRun.retrievedAt)) || null,
      },
      record: {
        retrievalState: organisationRetrieval,
        present: Boolean(record),
        name: record ? record.name : null,
        localPlanningAuthorityCode: record ? record.localPlanningAuthorityCode : null,
        statisticalGeography: record ? record.statisticalGeography : null,
        startDate: record ? record.startDate : null,
        endDate: record ? record.endDate : null,
        mappingState: record ? record.mappingStatus : null,
        matchedLpaReference: record ? record.matchedLpaReference : null,
        matchedLpaEntityId: record ? record.matchedLpaEntityId : null,
        sourceUrl: record ? record.sourceUrl : null,
        retrievedAt: record ? record.retrievedAt : null,
      },
    };
  }

  let lpa = null;
  if (subject.lpaReference != null) {
    let identity = null;
    if (lpaReady) {
      identity = await coverageStore.getLpaByReference(subject.lpaReference);
      if (identity) states.push(BROWNFIELD_COVERAGE_STATE.LPA_IDENTITY_PRESENT);
    }
    let mapped = [];
    if (organisationReady) {
      mapped = await coverageStore.listOrganisationsMappedToReference(subject.lpaReference);
    }
    const mappedOrganisations = [];
    for (const row of mapped) {
      let providerIndexState = null;
      if (providerReady) {
        const listed = await coverageStore.getProvider(row.organisationEntity);
        providerIndexState = listed
          ? BROWNFIELD_COVERAGE_STATE.PROVIDER_LISTED
          : BROWNFIELD_COVERAGE_STATE.PROVIDER_INDEX_ABSENT;
        states.push(providerIndexState);
      }
      if (row.mappingStatus) states.push(row.mappingStatus);
      mappedOrganisations.push(publicOrganisation(row, providerIndexState));
    }
    lpa = {
      reference: subject.lpaReference,
      retrievalState: lpaRetrieval,
      identityPresent: Boolean(identity),
      sourceEntityId: identity ? identity.sourceEntityId : null,
      name: identity ? identity.name : null,
      entryDate: identity ? identity.entryDate : null,
      startDate: identity ? identity.startDate : null,
      endDate: identity ? identity.endDate : null,
      sourceUrl: identity ? identity.sourceUrl : (lpaRun && lpaRun.source_url) || null,
      retrievedAt: identity
        ? identity.retrievedAt
        : (lpaRun && (lpaRun.retrieved_at || lpaRun.retrievedAt)) || null,
      mappedOrganisations,
      providerIndexRetrievalState: providerRetrieval,
      notCompleteProviderCoverage: true,
    };
  }

  const result = {
    states: orderedStates(states),
    subject,
    retrieval: {
      lpaIdentity: lpaRetrieval,
      providerIndex: providerRetrieval,
      organisationRecord: organisationRetrieval,
    },
    organisation,
    lpa,
    notProofOfNoBrownfieldLand: true,
    notZeroMatchingSites: true,
    notNationalCompleteness: true,
    notStatutoryBrownfieldDutyCensus: true,
    limitations: COVERAGE_LIMITATIONS.slice(),
    provenance: {
      provider: COVERAGE_PROVIDER,
      licence: COVERAGE_LICENCE,
      requiredAttribution: COVERAGE_ATTRIBUTION,
      notACommercialClearance: true,
      notLegalAdvice: true,
      releaseDate: null,
      retrievedAtIsNotPublicationDate: true,
      families: {
        lpaIdentity: LPA_IDENTITY_PROVENANCE,
        providerIndex: PROVIDER_INDEX_PROVENANCE,
        organisationRecord: ORGANISATION_RECORD_PROVENANCE,
      },
    },
  };
  assertNoInference(result);
  return result;
}

module.exports = {
  getOfficialBrownfieldCoverage,
};
