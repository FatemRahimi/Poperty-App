/**
 * Provider → LAD attribution for Brownfield organisations.
 * Derives attribution dynamically from official organisation records.
 * Does not mutate site observations and does not claim site location.
 */

const {
  PROVIDER_LAD_ATTRIBUTION_STATUS,
  PROVIDER_LAD_ATTRIBUTION_METHOD,
  PROVIDER_LAD_ATTRIBUTION_LIMITATIONS,
  FORBIDDEN_PROVIDER_LAD_ATTRIBUTION_KEYS,
  isSupportedEnglandLadDistrictGssCode,
  isPlanningDataLpaReferenceCode,
  providerLadAttributionProvenance,
} = require('../../architecture/officialBrownfieldProviderLadAttribution');

const validators = {
  isSupportedEnglandLadDistrictGssCode,
  isPlanningDataLpaReferenceCode,
};
const {
  ORGANISATION_ENTITY_URL_PREFIX,
  ORGANISATION_RECORD_PROVENANCE,
} = require('../../architecture/officialBrownfieldCoverage');

function assertNoForbidden(payload) {
  const text = JSON.stringify(payload);
  FORBIDDEN_PROVIDER_LAD_ATTRIBUTION_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key) || new RegExp(`"${key}"\\s*:`).test(text)) {
      throw new Error(`forbidden_provider_lad_attribution_field:${key}`);
    }
  });
  if (/"completenessPercentage"\s*:/.test(text) || /"coveragePercentage"\s*:/.test(text)) {
    throw new Error('forbidden_coverage_percentage');
  }
}

function blank(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

/**
 * Split raw statistical geography without silently choosing among alternatives.
 * A single token → one code. Multiple tokens or separators → ambiguous.
 */
function inspectStatisticalGeographyRaw(raw) {
  const text = blank(raw);
  if (!text) {
    return { kind: 'missing', raw: null, codes: [] };
  }
  if (/[,\n;|/]/.test(text) || /\s/.test(text)) {
    const parts = text.split(/[,\n;|/\s]+/).map((part) => part.trim()).filter(Boolean);
    const unique = [...new Set(parts)];
    if (unique.length > 1) {
      return { kind: 'ambiguous', raw: text, codes: unique };
    }
    if (unique.length === 1 && parts.length === 1) {
      return { kind: 'single', raw: text, codes: unique };
    }
    return { kind: 'ambiguous', raw: text, codes: unique };
  }
  return { kind: 'single', raw: text, codes: [text] };
}

function baseAttribution({
  organisationEntity,
  statisticalGeographyRaw = null,
  validatedLadGssCode = null,
  attributionMethod = PROVIDER_LAD_ATTRIBUTION_METHOD.NONE,
  status,
  reason = null,
  organisationName = null,
  organisationSourceUrl = null,
  organisationRetrievedAt = null,
  localPlanningAuthorityCode = null,
  notSiteLocation = true,
} = {}) {
  const result = {
    organisationEntity: organisationEntity == null ? null : Number(organisationEntity),
    organisationName: organisationName || null,
    statisticalGeographyRaw,
    validatedLadGssCode,
    attributionMethod,
    status,
    reason,
    localPlanningAuthorityCode: localPlanningAuthorityCode || null,
    notSiteLocation,
    notProofOfSiteWithinLad: true,
    notAreaBrownfieldMetric: true,
    limitations: PROVIDER_LAD_ATTRIBUTION_LIMITATIONS.slice(),
    provenance: {
      ...providerLadAttributionProvenance({
        sourceUrl: organisationSourceUrl,
        retrievedAt: organisationRetrievedAt,
      }),
      organisationEntity: organisationEntity == null ? null : Number(organisationEntity),
      organisationSourceUrl: organisationSourceUrl || (
        organisationEntity == null ? null : `${ORGANISATION_ENTITY_URL_PREFIX}${organisationEntity}`
      ),
      organisationRetrievedAt: organisationRetrievedAt || null,
      organisationRecordProvenance: ORGANISATION_RECORD_PROVENANCE,
      validationRule: 'england_lad_district_gss_E06_E07_E08_E09',
      statisticalGeographyRaw,
      phase3cLpaMappingNotUsedAsGeography: true,
    },
  };
  assertNoForbidden(result);
  return result;
}

/**
 * Attribute one provider organisation from an official organisation record.
 * organisationRecord shape matches coverage store getOrganisation / parser row.
 */
function attributeBrownfieldProviderLad(organisationEntity, organisationRecord = null) {
  const entity = organisationEntity == null || organisationEntity === ''
    ? null
    : Number(organisationEntity);
  if (entity == null || !Number.isFinite(entity) || entity <= 0) {
    return baseAttribution({
      organisationEntity: null,
      status: PROVIDER_LAD_ATTRIBUTION_STATUS.ORGANISATION_UNRESOLVED,
      reason: 'invalid_organisation_entity',
    });
  }

  if (!organisationRecord) {
    return baseAttribution({
      organisationEntity: entity,
      status: PROVIDER_LAD_ATTRIBUTION_STATUS.ORGANISATION_UNRESOLVED,
      reason: 'organisation_record_absent',
    });
  }

  const inspected = inspectStatisticalGeographyRaw(
    organisationRecord.statisticalGeography ?? organisationRecord.statistical_geography
  );
  const name = organisationRecord.name || organisationRecord.organisationName || null;
  const sourceUrl = organisationRecord.sourceUrl
    || organisationRecord.source_url
    || `${ORGANISATION_ENTITY_URL_PREFIX}${entity}`;
  const retrievedAt = organisationRecord.retrievedAt || organisationRecord.retrieved_at || null;
  const lpaCode = organisationRecord.localPlanningAuthorityCode
    || organisationRecord.local_planning_authority_code
    || null;

  if (inspected.kind === 'missing') {
    return baseAttribution({
      organisationEntity: entity,
      organisationName: name,
      statisticalGeographyRaw: null,
      status: PROVIDER_LAD_ATTRIBUTION_STATUS.STATISTICAL_GEOGRAPHY_MISSING,
      reason: 'statistical_geography_missing',
      organisationSourceUrl: sourceUrl,
      organisationRetrievedAt: retrievedAt,
      localPlanningAuthorityCode: lpaCode,
    });
  }

  if (inspected.kind === 'ambiguous') {
    return baseAttribution({
      organisationEntity: entity,
      organisationName: name,
      statisticalGeographyRaw: inspected.raw,
      status: PROVIDER_LAD_ATTRIBUTION_STATUS.STATISTICAL_GEOGRAPHY_AMBIGUOUS,
      reason: 'statistical_geography_ambiguous',
      organisationSourceUrl: sourceUrl,
      organisationRetrievedAt: retrievedAt,
      localPlanningAuthorityCode: lpaCode,
    });
  }

  const code = inspected.codes[0];
  if (isSupportedEnglandLadDistrictGssCode(code)) {
    return baseAttribution({
      organisationEntity: entity,
      organisationName: name,
      statisticalGeographyRaw: inspected.raw,
      validatedLadGssCode: code,
      attributionMethod: PROVIDER_LAD_ATTRIBUTION_METHOD.ORGANISATION_STATISTICAL_GEOGRAPHY,
      status: PROVIDER_LAD_ATTRIBUTION_STATUS.PROVIDER_LAD_ATTRIBUTED,
      reason: 'organisation_statistical_geography_supported_lad',
      organisationSourceUrl: sourceUrl,
      organisationRetrievedAt: retrievedAt,
      localPlanningAuthorityCode: lpaCode,
    });
  }

  const reason = isPlanningDataLpaReferenceCode(code)
    ? 'statistical_geography_is_planning_data_lpa_reference'
    : 'statistical_geography_not_supported_england_lad_district';

  return baseAttribution({
    organisationEntity: entity,
    organisationName: name,
    statisticalGeographyRaw: inspected.raw,
    validatedLadGssCode: null,
    status: PROVIDER_LAD_ATTRIBUTION_STATUS.STATISTICAL_GEOGRAPHY_NOT_LAD,
    reason,
    organisationSourceUrl: sourceUrl,
    organisationRetrievedAt: retrievedAt,
    localPlanningAuthorityCode: lpaCode,
  });
}

async function resolveOrganisationRecord(coverageStore, organisationEntity) {
  if (!coverageStore || typeof coverageStore.getOrganisation !== 'function') {
    return null;
  }
  return coverageStore.getOrganisation(organisationEntity);
}

/**
 * Diagnostic classification over distinct Brownfield provider organisations.
 * observationCountsByOrganisation: Map|object of organisationEntity → row count.
 * Does not produce area metrics or completeness percentages.
 */
async function diagnoseBrownfieldProviderLadAttribution({
  coverageStore = null,
  organisationEntities = [],
  observationCountsByOrganisation = null,
  retrievedAt = null,
} = {}) {
  const entities = [...new Set(
    (organisationEntities || [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
  )].sort((a, b) => a - b);

  const counts = observationCountsByOrganisation instanceof Map
    ? observationCountsByOrganisation
    : new Map(
      Object.entries(observationCountsByOrganisation || {}).map(([key, value]) => [Number(key), Number(value)])
    );

  const byStatus = {
    [PROVIDER_LAD_ATTRIBUTION_STATUS.PROVIDER_LAD_ATTRIBUTED]: [],
    [PROVIDER_LAD_ATTRIBUTION_STATUS.STATISTICAL_GEOGRAPHY_MISSING]: [],
    [PROVIDER_LAD_ATTRIBUTION_STATUS.STATISTICAL_GEOGRAPHY_NOT_LAD]: [],
    [PROVIDER_LAD_ATTRIBUTION_STATUS.STATISTICAL_GEOGRAPHY_AMBIGUOUS]: [],
    [PROVIDER_LAD_ATTRIBUTION_STATUS.ORGANISATION_UNRESOLVED]: [],
  };

  const observationRowsByStatus = {
    [PROVIDER_LAD_ATTRIBUTION_STATUS.PROVIDER_LAD_ATTRIBUTED]: 0,
    [PROVIDER_LAD_ATTRIBUTION_STATUS.STATISTICAL_GEOGRAPHY_MISSING]: 0,
    [PROVIDER_LAD_ATTRIBUTION_STATUS.STATISTICAL_GEOGRAPHY_NOT_LAD]: 0,
    [PROVIDER_LAD_ATTRIBUTION_STATUS.STATISTICAL_GEOGRAPHY_AMBIGUOUS]: 0,
    [PROVIDER_LAD_ATTRIBUTION_STATUS.ORGANISATION_UNRESOLVED]: 0,
  };

  let missingOrganisationEntityRows = 0;
  if (counts.has(null) || counts.has(0) || counts.has(NaN)) {
    missingOrganisationEntityRows += Number(counts.get(null) || 0)
      + Number(counts.get(0) || 0)
      + Number(counts.get(NaN) || 0);
  }

  for (const entity of entities) {
    const record = await resolveOrganisationRecord(coverageStore, entity);
    const attribution = attributeBrownfieldProviderLad(entity, record);
    if (retrievedAt && attribution.provenance) {
      attribution.provenance.diagnosticRetrievedAt = retrievedAt;
    }
    const rowCount = Number(counts.get(entity) || 0);
    byStatus[attribution.status].push({
      ...attribution,
      brownfieldObservationRowCount: rowCount,
    });
    observationRowsByStatus[attribution.status] += rowCount;
  }

  const providerCounts = {
    distinctBrownfieldOrganisationEntities: entities.length,
    providerLadAttributed: byStatus[PROVIDER_LAD_ATTRIBUTION_STATUS.PROVIDER_LAD_ATTRIBUTED].length,
    statisticalGeographyMissing: byStatus[PROVIDER_LAD_ATTRIBUTION_STATUS.STATISTICAL_GEOGRAPHY_MISSING].length,
    statisticalGeographyNotLad: byStatus[PROVIDER_LAD_ATTRIBUTION_STATUS.STATISTICAL_GEOGRAPHY_NOT_LAD].length,
    statisticalGeographyAmbiguous: byStatus[PROVIDER_LAD_ATTRIBUTION_STATUS.STATISTICAL_GEOGRAPHY_AMBIGUOUS].length,
    organisationUnresolved: byStatus[PROVIDER_LAD_ATTRIBUTION_STATUS.ORGANISATION_UNRESOLVED].length,
  };

  const result = {
    diagnosticKind: 'brownfield_provider_lad_attribution_validation',
    notEnglandCompleteness: true,
    notLpaCompleteness: true,
    notSiteLocationAccuracy: true,
    notAreaBrownfieldMetric: true,
    providerCounts,
    observationRowCountsByStatus: observationRowsByStatus,
    missingOrganisationEntityObservationRows: missingOrganisationEntityRows,
    attributionsByStatus: byStatus,
    limitations: PROVIDER_LAD_ATTRIBUTION_LIMITATIONS.slice(),
    provenance: providerLadAttributionProvenance({ retrievedAt }),
  };
  assertNoForbidden(result);
  return result;
}

module.exports = {
  inspectStatisticalGeographyRaw,
  attributeBrownfieldProviderLad,
  diagnoseBrownfieldProviderLadAttribution,
  ...validators,
  PROVIDER_LAD_ATTRIBUTION_STATUS,
  PROVIDER_LAD_ATTRIBUTION_METHOD,
};
