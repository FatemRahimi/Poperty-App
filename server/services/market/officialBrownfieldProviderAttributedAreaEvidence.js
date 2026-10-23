/**
 * Standalone Brownfield provider-attributed area evidence.
 * Not wired into areaEvidenceProfile.v1.
 */

const {
  EVIDENCE_CLASS,
} = require('../../architecture/evidenceContract');
const {
  BROWNFIELD_SELECTION,
} = require('../../architecture/officialBrownfieldLandDataset');
const {
  PROVIDER_LAD_ATTRIBUTION_STATUS,
} = require('../../architecture/officialBrownfieldProviderLadAttribution');
const {
  isSupportedEnglandLadDistrictGssCode,
} = require('../../architecture/officialBrownfieldProviderLadAttribution');
const { attributeBrownfieldProviderLad } = require('./brownfieldProviderLadAttribution');
const {
  PROVIDER_ATTRIBUTED_AREA_EVIDENCE_KIND,
  PROVIDER_ATTRIBUTED_ATTRIBUTION_BASIS,
  PROVIDER_ATTRIBUTED_AREA_LIMITATIONS,
  FORBIDDEN_PROVIDER_ATTRIBUTED_AREA_KEYS,
  providerAttributedAreaProvenance,
} = require('../../architecture/officialBrownfieldProviderAttributedAreaEvidence');

const SUFFICIENCY = Object.freeze({
  SUFFICIENT: 'SUFFICIENT',
  PARTIAL: 'PARTIAL',
  UNAVAILABLE: 'UNAVAILABLE',
  UNRESOLVED: 'UNRESOLVED',
});

function assertNoForbidden(payload) {
  const text = JSON.stringify(payload);
  FORBIDDEN_PROVIDER_ATTRIBUTED_AREA_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key) || new RegExp(`"${key}"\\s*:`).test(text)) {
      throw new Error(`forbidden_provider_attributed_area_field:${key}`);
    }
  });
}

function knownCount(value) {
  return value == null || value === '' ? null : Number(value);
}

function emptyMetrics() {
  return {
    resolvedProviderAttributedRecordCount: 0,
    ambiguousRecordCount: 0,
    resolvedEndedRecordCount: 0,
    resolvedWithoutEndDateCount: 0,
  };
}

function emptyCapacity() {
  return {
    recordedMinimumDwellingCapacitySum: null,
    recordedMaximumDwellingCapacitySum: null,
    recordsWithMinimumCapacity: 0,
    recordsWithMaximumCapacity: 0,
    recordsMissingMinimumCapacity: 0,
    recordsMissingMaximumCapacity: 0,
    capacityLabel: 'Recorded Brownfield dwelling capacity associated with LAD-attributed providers',
    notApprovedHomes: true,
    notConstruction: true,
    notCompletion: true,
    notGuaranteedFutureSupply: true,
  };
}

function counterEvidence(metrics, capacity) {
  const items = [
    {
      code: 'provider_attribution_is_not_site_location',
      statement: 'Provider statistical geography does not prove each Brownfield site is inside the requested LAD.',
    },
    {
      code: 'source_coverage_may_be_incomplete',
      statement: 'Planning Data warns that Brownfield coverage may be incomplete and may not yet cover all of England.',
    },
    {
      code: 'non_lad_providers_excluded',
      statement: 'Providers whose statistical geography is not a supported LAD are excluded and are not assigned to a nearby LAD. Exclusion does not mean those records do not exist.',
    },
    {
      code: 'missing_organisation_entity_excluded',
      statement: 'Brownfield rows without organisation_entity cannot be attributed to a LAD by this method.',
    },
  ];
  if (metrics.ambiguousRecordCount > 0) {
    items.push({
      code: 'ambiguous_revisions_excluded',
      statement: 'Source entities with ambiguous effective state are excluded from factual aggregates and counted separately.',
    });
  }
  if (capacity.recordsMissingMinimumCapacity > 0 || capacity.recordsMissingMaximumCapacity > 0) {
    items.push({
      code: 'capacity_missing_on_some_resolved_records',
      statement: 'Some resolved records have no minimum or maximum dwelling capacity. Missing capacity is not zero.',
    });
  }
  if (metrics.resolvedEndedRecordCount > 0) {
    items.push({
      code: 'ended_register_rows_present',
      statement: 'Some resolved records have a register end-date. That date is not completion, delivery, or removal.',
    });
  }
  if (metrics.resolvedProviderAttributedRecordCount === 0) {
    items.push({
      code: 'zero_is_not_absence',
      statement: 'No resolved Brownfield records were found through the current provider-attribution method for this LAD. That is not proof that no Brownfield land exists there.',
    });
  }
  return items;
}

function investigateNext(metrics, capacity) {
  const items = [
    {
      code: 'verify_physical_site_geography',
      statement: 'Verify physical site geography before treating these records as located in the LAD.',
    },
    {
      code: 'investigate_non_lad_provider_geography',
      statement: 'Investigate providers with non-LAD statistical geography. They are outside this aggregation.',
    },
    {
      code: 'obtain_authoritative_spatial_mapping',
      statement: 'Site geometry or another authoritative spatial mapping is still required before a location claim.',
    },
  ];
  if (metrics.ambiguousRecordCount > 0) {
    items.push({
      code: 'investigate_ambiguous_source_revisions',
      statement: 'Investigate source entities whose revisions lack a defensible entry-date selection.',
    });
  }
  if (capacity.recordsMissingMinimumCapacity > 0 || capacity.recordsMissingMaximumCapacity > 0) {
    items.push({
      code: 'inspect_missing_dwelling_capacity',
      statement: 'Inspect resolved records whose minimum or maximum dwelling capacity is missing.',
    });
  }
  return items;
}

function baseResult({
  ladCode,
  status,
  reason,
  metrics = emptyMetrics(),
  capacity = emptyCapacity(),
  attributedProviderCount = 0,
  calculatedAt = null,
  artifactRefs = [],
  sourceEntityIds = [],
} = {}) {
  const result = {
    evidenceKind: PROVIDER_ATTRIBUTED_AREA_EVIDENCE_KIND,
    factClass: EVIDENCE_CLASS.AREA_CONTEXT,
    status,
    reason,
    geography: {
      type: 'LAD',
      code: ladCode,
    },
    attributionBasis: PROVIDER_ATTRIBUTED_ATTRIBUTION_BASIS,
    notSiteLocation: true,
    notProofOfNoBrownfield: true,
    notWiredToAreaEvidenceProfile: true,
    metrics,
    capacity,
    providerContext: {
      attributedProviderCount,
      attributedProviderMeaning: 'Provider organisations whose official statistical geography validated to this LAD and that have Brownfield observations in the queried store.',
    },
    sufficiency: status,
    provenance: {
      ...providerAttributedAreaProvenance({ ladCode, calculatedAt }),
      artifactRefs,
      resolvedSourceEntityIds: sourceEntityIds,
    },
    limitations: PROVIDER_ATTRIBUTED_AREA_LIMITATIONS.slice(),
    counterEvidence: counterEvidence(metrics, capacity),
    investigateNext: investigateNext(metrics, capacity),
  };
  assertNoForbidden(result);
  return result;
}

async function providersAttributedToLad(coverageStore, ladCode) {
  if (!coverageStore || typeof coverageStore.listOrganisations !== 'function') return [];
  const organisations = await coverageStore.listOrganisations();
  const matched = [];
  for (const organisation of organisations) {
    const attribution = attributeBrownfieldProviderLad(organisation.organisationEntity, organisation);
    if (
      attribution.status === PROVIDER_LAD_ATTRIBUTION_STATUS.PROVIDER_LAD_ATTRIBUTED
      && attribution.validatedLadGssCode === ladCode
    ) {
      matched.push(attribution);
    }
  }
  matched.sort((a, b) => a.organisationEntity - b.organisationEntity);
  return matched;
}

async function getOfficialBrownfieldProviderAttributedAreaEvidence({
  ladCode = null,
  coverageStore = null,
  brownfieldStore = null,
  calculatedAt = null,
} = {}) {
  const code = ladCode == null ? null : String(ladCode).trim();
  if (!isSupportedEnglandLadDistrictGssCode(code)) {
    return baseResult({
      ladCode: code,
      status: SUFFICIENCY.UNAVAILABLE,
      reason: 'unsupported_england_lad_district',
      calculatedAt,
    });
  }
  if (!coverageStore || !brownfieldStore) {
    return baseResult({
      ladCode: code,
      status: SUFFICIENCY.UNAVAILABLE,
      reason: 'brownfield_stores_not_provided',
      calculatedAt,
    });
  }

  const providers = await providersAttributedToLad(coverageStore, code);
  const metrics = emptyMetrics();
  const capacity = emptyCapacity();
  let minSum = 0;
  let maxSum = 0;
  let minSeen = false;
  let maxSeen = false;
  const artifactRefs = [];
  const sourceEntityIds = [];
  const seenArtifacts = new Set();
  let contributingProviders = 0;

  for (const provider of providers) {
    const query = await brownfieldStore.queryByOrganisationEntity(provider.organisationEntity);
    if (!query.matched) continue;
    contributingProviders += 1;
    (query.selections || []).forEach((selection) => {
      if (selection.selectionStatus === BROWNFIELD_SELECTION.AMBIGUOUS) {
        metrics.ambiguousRecordCount += 1;
      }
    });
    (query.observations || []).forEach((row) => {
      metrics.resolvedProviderAttributedRecordCount += 1;
      sourceEntityIds.push(row.sourceEntityId);
      if (row.endDate) metrics.resolvedEndedRecordCount += 1;
      else metrics.resolvedWithoutEndDateCount += 1;
      const minimum = knownCount(row.minimumNetDwellings);
      const maximum = knownCount(row.maximumNetDwellings);
      if (minimum == null || Number.isNaN(minimum)) capacity.recordsMissingMinimumCapacity += 1;
      else {
        capacity.recordsWithMinimumCapacity += 1;
        minSum += minimum;
        minSeen = true;
      }
      if (maximum == null || Number.isNaN(maximum)) capacity.recordsMissingMaximumCapacity += 1;
      else {
        capacity.recordsWithMaximumCapacity += 1;
        maxSum += maximum;
        maxSeen = true;
      }
      const sha = row.provenance && row.provenance.artifactSha256;
      if (sha && !seenArtifacts.has(sha) && artifactRefs.length < 5) {
        seenArtifacts.add(sha);
        artifactRefs.push({
          artifactSha256: sha,
          artifactSourceUrl: row.provenance.artifactSourceUrl || null,
        });
      }
    });
  }

  capacity.recordedMinimumDwellingCapacitySum = minSeen ? minSum : null;
  capacity.recordedMaximumDwellingCapacitySum = maxSeen ? maxSum : null;
  sourceEntityIds.sort((a, b) => a - b);

  let status = SUFFICIENCY.SUFFICIENT;
  let reason = 'provider_attributed_resolved_records';
  if (metrics.resolvedProviderAttributedRecordCount === 0 && metrics.ambiguousRecordCount > 0) {
    status = SUFFICIENCY.UNRESOLVED;
    reason = 'only_ambiguous_provider_attributed_records';
  } else if (metrics.resolvedProviderAttributedRecordCount === 0) {
    status = SUFFICIENCY.PARTIAL;
    reason = 'no_resolved_provider_attributed_records';
  } else if (
    metrics.ambiguousRecordCount > 0
    || capacity.recordsMissingMinimumCapacity > 0
    || capacity.recordsMissingMaximumCapacity > 0
  ) {
    status = SUFFICIENCY.PARTIAL;
    reason = 'resolved_records_with_disclosed_limits';
  }

  return baseResult({
    ladCode: code,
    status,
    reason,
    metrics,
    capacity,
    attributedProviderCount: contributingProviders,
    calculatedAt,
    artifactRefs,
    sourceEntityIds,
  });
}

module.exports = {
  SUFFICIENCY,
  getOfficialBrownfieldProviderAttributedAreaEvidence,
};
