/**
 * Ingest supplied official coverage payloads. No live network and no site import.
 */

const {
  COVERAGE_FAMILY,
  COVERAGE_RUN_STATUS,
  LPA_SOURCE_URL,
  LPA_IDENTITY_PROVENANCE,
  PROVIDER_INDEX_URL,
  PROVIDER_INDEX_PROVENANCE,
  ORGANISATION_RECORD_PROVENANCE,
  coverageProvenance,
  ORGANISATION_DATASET_LABEL,
} = require('../../architecture/officialBrownfieldCoverage');
const {
  parseLpaIdentityPayload,
  parseProviderIndexPayload,
  parseOrganisationPayload,
} = require('./brownfieldCoverageParser');
const { createMemoryBrownfieldCoverageStore } = require('./brownfieldCoverageStore');

function requireStore(store) {
  return store || createMemoryBrownfieldCoverageStore();
}

async function recordBrownfieldCoverageFailure({
  store = null,
  family,
  status = COVERAGE_RUN_STATUS.RETRIEVAL_FAILED,
  reason = null,
  sourceUrl = null,
  retrievedAt = null,
} = {}) {
  const target = requireStore(store);
  if (!Object.values(COVERAGE_FAMILY).includes(family)) {
    throw new Error('unknown_coverage_family');
  }
  if (status !== COVERAGE_RUN_STATUS.RETRIEVAL_FAILED && status !== COVERAGE_RUN_STATUS.SOURCE_ERROR) {
    throw new Error('coverage_failure_status_required');
  }
  const provenance = coverageProvenance({
    dataset: family,
    sourceUrl,
    retrievedAt,
  });
  const run = await target.recordRun(family, status, {
    sourceUrl,
    retrievedAt,
    failureReason: reason || status,
    rowsAccepted: 0,
    rowsRejected: 0,
    provenance: { ...provenance, retrievedAt: retrievedAt || null },
  });
  return {
    store: target,
    family,
    status,
    reason: reason || status,
    runId: run.id,
  };
}

async function ingestBrownfieldLpaIdentities({
  store = null,
  payload = null,
  sourceUrl = LPA_SOURCE_URL,
  retrievedAt = null,
} = {}) {
  const target = requireStore(store);
  const parsed = parseLpaIdentityPayload(payload);
  if (!parsed.ok) {
    return recordBrownfieldCoverageFailure({
      store: target,
      family: COVERAGE_FAMILY.LPA_IDENTITY,
      status: COVERAGE_RUN_STATUS.SOURCE_ERROR,
      reason: parsed.reason,
      sourceUrl,
      retrievedAt,
    });
  }
  const provenance = {
    ...LPA_IDENTITY_PROVENANCE,
    retrievedAt: retrievedAt || null,
    sourceUrl,
  };
  const run = await target.replaceLpaIdentities(parsed.rows, {
    sourceUrl,
    retrievedAt,
    provenance,
    rowsAccepted: parsed.rows.length,
  });
  return {
    store: target,
    family: COVERAGE_FAMILY.LPA_IDENTITY,
    status: COVERAGE_RUN_STATUS.SUCCEEDED,
    acceptedCount: parsed.rows.length,
    runId: run.id,
  };
}

async function ingestBrownfieldProviderIndex({
  store = null,
  payload = null,
  sourceUrl = PROVIDER_INDEX_URL,
  retrievedAt = null,
} = {}) {
  const target = requireStore(store);
  const parsed = parseProviderIndexPayload(payload);
  if (!parsed.ok) {
    return recordBrownfieldCoverageFailure({
      store: target,
      family: COVERAGE_FAMILY.PROVIDER_INDEX,
      status: COVERAGE_RUN_STATUS.SOURCE_ERROR,
      reason: parsed.reason,
      sourceUrl,
      retrievedAt,
    });
  }
  const provenance = {
    ...PROVIDER_INDEX_PROVENANCE,
    retrievedAt: retrievedAt || null,
    sourceUrl,
  };
  const run = await target.replaceProviderIndex(parsed.rows, {
    sourceUrl,
    retrievedAt,
    provenance,
    rowsAccepted: parsed.rows.length,
  });
  return {
    store: target,
    family: COVERAGE_FAMILY.PROVIDER_INDEX,
    status: COVERAGE_RUN_STATUS.SUCCEEDED,
    acceptedCount: parsed.rows.length,
    runId: run.id,
  };
}

async function ingestBrownfieldOrganisationRecords({
  store = null,
  payload = null,
  sourceUrl = null,
  retrievedAt = null,
} = {}) {
  const target = requireStore(store);
  const parsed = parseOrganisationPayload(payload);
  if (!parsed.ok) {
    return recordBrownfieldCoverageFailure({
      store: target,
      family: COVERAGE_FAMILY.ORGANISATION_RECORD,
      status: COVERAGE_RUN_STATUS.SOURCE_ERROR,
      reason: parsed.reason,
      sourceUrl,
      retrievedAt,
    });
  }
  const provenance = {
    ...ORGANISATION_RECORD_PROVENANCE,
    dataset: ORGANISATION_DATASET_LABEL,
    retrievedAt: retrievedAt || null,
    sourceUrl,
  };
  const run = await target.replaceOrganisations(parsed.rows, {
    sourceUrl,
    retrievedAt,
    provenance,
    rowsAccepted: parsed.rows.length,
  });
  return {
    store: target,
    family: COVERAGE_FAMILY.ORGANISATION_RECORD,
    status: COVERAGE_RUN_STATUS.SUCCEEDED,
    acceptedCount: parsed.rows.length,
    runId: run.id,
  };
}

module.exports = {
  recordBrownfieldCoverageFailure,
  ingestBrownfieldLpaIdentities,
  ingestBrownfieldProviderIndex,
  ingestBrownfieldOrganisationRecords,
};
