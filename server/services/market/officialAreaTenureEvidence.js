/**
 * Official Census 2021 LAD household tenure evidence (TS054).
 * AREA_CONTEXT + HISTORICAL_CENSUS_CONTEXT only. No current-tenure claim.
 * Raw categories = OFFICIAL_OBSERVATION. Aggregates = DERIVED. No shares in v1.
 */

const {
  CENSUS2021_TS054_SOURCE,
  CENSUS2021_TS054_DATASET,
  CENSUS2021_TS054_DATASET_ID,
  CENSUS2021_TS054_EDITION,
  CENSUS2021_TS054_VERSION,
  CENSUS2021_TS054_SOURCE_PRODUCT,
  CENSUS2021_TS054_RELEASE_LABEL,
  CENSUS2021_TS054_REFERENCE_PERIOD,
  CENSUS2021_TS054_RELEASE_DATE,
  CENSUS2021_TS054_VERSION_DATE,
  CENSUS2021_TS054_GEOGRAPHY_TYPE,
  CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
  CENSUS2021_TS054_LIMITATIONS,
  CENSUS2021_TS054_PROVENANCE,
  MARKET_RECORD_KIND,
  isEnglandWalesLadGssCode,
} = require('../../architecture/officialAreaEconomicDataset');
const {
  createEvidence,
  EVIDENCE_CLASS,
  SOURCE_TYPE,
  SPATIAL_RELATION,
} = require('../../architecture/evidenceContract');
const { DOMAIN_ID } = require('../../architecture/domainRegistry');
const { createSubjectRef, IDENTITY_KIND } = require('../../architecture/identityModel');
const { UNIT } = require('../../architecture/units');
const { canonicalPostcode } = require('./canonicalPostcode');
const { buildTenureAggregates } = require('./census2021Ts054TenureParser');

const SUFFICIENCY = Object.freeze({
  SUFFICIENT: 'SUFFICIENT',
  INSUFFICIENT: 'INSUFFICIENT',
  UNAVAILABLE: 'UNAVAILABLE',
  UNRESOLVED: 'UNRESOLVED',
});

const FORBIDDEN_INFERENCE_KEYS = Object.freeze([
  'investmentScore',
  'opportunityScore',
  'buyRecommendation',
  'letRecommendation',
  'goodArea',
  'badArea',
  'futureGrowth',
  'expectedGrowth',
  'rentalDemand',
  'achievableRent',
  'btlAttractiveness',
  'propertyQuality',
  'purchaseWinner',
  'currentTenure',
  'tenureShares',
  'privateRentedShare',
  'ownerOccupiedShare',
]);

function unavailableResult(reason, extras = {}) {
  return {
    status: SUFFICIENCY.UNAVAILABLE,
    reason,
    subject: extras.subject || null,
    geographyResolution: extras.geographyResolution || null,
    observations: [],
    aggregates: [],
    evidence: [],
    coverage: extras.coverage || null,
    geographyVintage: CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
    geographyVintageCompatibility: extras.geographyVintageCompatibility || 'UNPROVEN_NATIONWIDE',
    limitations: CENSUS2021_TS054_LIMITATIONS.slice(),
    provenance: CENSUS2021_TS054_PROVENANCE,
    recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
    factClass: EVIDENCE_CLASS.AREA_CONTEXT,
    historicalCensusContext: true,
    contextKind: 'HISTORICAL_CENSUS_CONTEXT',
    sharesImplemented: false,
  };
}

function unresolvedResult(reason, extras = {}) {
  return {
    ...unavailableResult(reason, extras),
    status: SUFFICIENCY.UNRESOLVED,
  };
}

function rawCategoryEvidence(observation) {
  return createEvidence({
    domain: DOMAIN_ID.MARKET,
    subjectRef: createSubjectRef({
      kind: IDENTITY_KIND.SITE,
      id: `lad:${observation.geographyCode}`,
    }),
    factType: `officialLadTenure.raw.${observation.categoryCode}`,
    classification: EVIDENCE_CLASS.AREA_CONTEXT,
    sourceType: SOURCE_TYPE.OFFICIAL,
    value: observation.householdCount,
    unit: UNIT.HOUSEHOLDS,
    authoritative: true,
    sharedPropertyEvidence: false,
    spatialRelation: SPATIAL_RELATION.AREA_CONTEXT,
    evidenceAsOf: CENSUS2021_TS054_REFERENCE_PERIOD,
    observedAt: CENSUS2021_TS054_REFERENCE_PERIOD,
    retrievedAt: observation.ingestedAt || null,
    provenance: {
      source: CENSUS2021_TS054_SOURCE,
      dataset: CENSUS2021_TS054_DATASET,
      datasetId: CENSUS2021_TS054_DATASET_ID,
      edition: CENSUS2021_TS054_EDITION,
      version: CENSUS2021_TS054_VERSION,
      sourceProduct: CENSUS2021_TS054_SOURCE_PRODUCT,
      provider: CENSUS2021_TS054_PROVENANCE.provider,
      licence: CENSUS2021_TS054_PROVENANCE.licence,
      requiredAttribution: CENSUS2021_TS054_PROVENANCE.requiredAttribution,
      releaseLabel: observation.releaseLabel || CENSUS2021_TS054_RELEASE_LABEL,
      releaseDate: CENSUS2021_TS054_RELEASE_DATE,
      versionDate: CENSUS2021_TS054_VERSION_DATE,
      referencePeriod: CENSUS2021_TS054_REFERENCE_PERIOD,
      geographyType: CENSUS2021_TS054_GEOGRAPHY_TYPE,
      geographyCode: observation.geographyCode,
      geographyVintage: CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
      categoryCode: observation.categoryCode,
      categoryLabel: observation.categoryLabel,
      recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
      historicalCensusContext: true,
      metricNature: 'CENSUS_OBSERVATION',
      contentFingerprint: observation.contentFingerprint,
    },
    limitations: CENSUS2021_TS054_LIMITATIONS.slice(),
    assessmentState: 'assessed',
  });
}

function derivedAggregateEvidence(aggregate, geographyCode) {
  return createEvidence({
    domain: DOMAIN_ID.MARKET,
    subjectRef: createSubjectRef({
      kind: IDENTITY_KIND.SITE,
      id: `lad:${geographyCode}`,
    }),
    factType: `officialLadTenure.aggregate.${aggregate.aggregateId}`,
    classification: EVIDENCE_CLASS.DERIVED,
    sourceType: SOURCE_TYPE.DERIVED,
    value: aggregate.householdCount,
    unit: UNIT.HOUSEHOLDS,
    authoritative: false,
    sharedPropertyEvidence: false,
    spatialRelation: SPATIAL_RELATION.AREA_CONTEXT,
    evidenceAsOf: CENSUS2021_TS054_REFERENCE_PERIOD,
    observedAt: CENSUS2021_TS054_REFERENCE_PERIOD,
    retrievedAt: null,
    provenance: {
      source: CENSUS2021_TS054_SOURCE,
      dataset: CENSUS2021_TS054_DATASET,
      datasetId: CENSUS2021_TS054_DATASET_ID,
      edition: CENSUS2021_TS054_EDITION,
      version: CENSUS2021_TS054_VERSION,
      releaseLabel: CENSUS2021_TS054_RELEASE_LABEL,
      releaseDate: CENSUS2021_TS054_RELEASE_DATE,
      versionDate: CENSUS2021_TS054_VERSION_DATE,
      referencePeriod: CENSUS2021_TS054_REFERENCE_PERIOD,
      geographyType: CENSUS2021_TS054_GEOGRAPHY_TYPE,
      geographyCode,
      geographyVintage: CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
      aggregateId: aggregate.aggregateId,
      recordKind: MARKET_RECORD_KIND.DERIVED_METRIC,
      aggregationKind: aggregate.aggregationKind,
      componentCodes: aggregate.componentCodes,
      components: aggregate.components,
      calculationMethod: aggregate.calculationMethod,
      note: aggregate.note,
      historicalCensusContext: true,
      metricNature: 'SOURCE_DIRECTED_AGGREGATION',
    },
    limitations: CENSUS2021_TS054_LIMITATIONS.slice(),
    assessmentState: aggregate.complete ? 'assessed' : 'not_assessed',
  });
}

function assertNoInferenceFields(payload) {
  const text = JSON.stringify(payload);
  FORBIDDEN_INFERENCE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key) || new RegExp(`"${key}"`).test(text)) {
      throw new Error(`forbidden_inference_field:${key}`);
    }
  });
}

async function resolveLadCode({ geographyCode = null, postcode = null, geographyStore = null } = {}) {
  if (geographyCode != null && String(geographyCode).trim() !== '') {
    const code = String(geographyCode).trim();
    if (!isEnglandWalesLadGssCode(code)) {
      return {
        ok: false,
        status: SUFFICIENCY.UNAVAILABLE,
        reason: 'invalid_lad_code',
        geographyResolution: { method: 'direct_lad_code', geographyCode: code },
      };
    }
    return {
      ok: true,
      geographyCode: code,
      geographyResolution: {
        method: 'direct_lad_code',
        geographyCode: code,
        geographyVintageCompatibility: 'UNPROVEN_NATIONWIDE',
      },
    };
  }

  if (!postcode) {
    return {
      ok: false,
      status: SUFFICIENCY.UNAVAILABLE,
      reason: 'geography_not_specified',
      geographyResolution: null,
    };
  }

  const parsed = canonicalPostcode(postcode);
  if (!parsed.ok) {
    return {
      ok: false,
      status: SUFFICIENCY.UNAVAILABLE,
      reason: 'invalid_postcode',
      geographyResolution: { method: 'postcode_crosswalk', postcode: null, matchStatus: 'INVALID' },
    };
  }
  if (!geographyStore) {
    return {
      ok: false,
      status: SUFFICIENCY.UNAVAILABLE,
      reason: 'crosswalk_not_provided',
      geographyResolution: { method: 'postcode_crosswalk', postcode: parsed.normalized },
    };
  }

  const lookup = await geographyStore.lookupByPostcode(parsed.normalized);
  if (lookup.matchStatus === 'NOT_IMPORTED') {
    return {
      ok: false,
      status: SUFFICIENCY.UNAVAILABLE,
      reason: 'crosswalk_not_imported',
      geographyResolution: {
        method: 'postcode_crosswalk',
        postcode: parsed.normalized,
        matchStatus: lookup.matchStatus,
        coverage: lookup.datasetCoverage || null,
      },
      coverage: lookup.datasetCoverage || null,
    };
  }
  if (lookup.matchStatus === 'AMBIGUOUS' || lookup.effectiveSelection === 'AMBIGUOUS') {
    return {
      ok: false,
      status: SUFFICIENCY.UNRESOLVED,
      reason: 'crosswalk_ambiguous',
      geographyResolution: {
        method: 'postcode_crosswalk',
        postcode: parsed.normalized,
        matchStatus: 'AMBIGUOUS',
        ambiguousReleases: lookup.ambiguousReleases || [],
      },
    };
  }
  if (lookup.matchStatus === 'ERROR' || lookup.datasetCoverage?.state === 'ERROR') {
    return {
      ok: false,
      status: SUFFICIENCY.UNAVAILABLE,
      reason: 'crosswalk_error',
      geographyResolution: {
        method: 'postcode_crosswalk',
        postcode: parsed.normalized,
        matchStatus: lookup.matchStatus,
      },
      coverage: lookup.datasetCoverage || null,
    };
  }
  if (!lookup.matched || lookup.matchStatus === 'NO_MATCH') {
    return {
      ok: false,
      status: SUFFICIENCY.UNAVAILABLE,
      reason: 'postcode_no_match',
      geographyResolution: {
        method: 'postcode_crosswalk',
        postcode: parsed.normalized,
        matchStatus: 'NO_MATCH',
      },
      coverage: lookup.datasetCoverage || null,
    };
  }

  const countryCode = lookup.geography?.countryCode || null;
  if (countryCode && countryCode !== 'E92000001' && countryCode !== 'W92000004') {
    return {
      ok: false,
      status: SUFFICIENCY.UNAVAILABLE,
      reason: 'non_england_wales_geography',
      geographyResolution: {
        method: 'postcode_crosswalk',
        postcode: parsed.normalized,
        matchStatus: lookup.matchStatus,
        countryCode,
        localAuthorityCode: lookup.geography?.localAuthorityCode || null,
      },
    };
  }

  const lad = lookup.geography?.localAuthorityCode || null;
  if (!lad) {
    return {
      ok: false,
      status: SUFFICIENCY.UNAVAILABLE,
      reason: 'local_authority_code_null',
      geographyResolution: {
        method: 'postcode_crosswalk',
        postcode: parsed.normalized,
        matchStatus: lookup.matchStatus,
        localAuthorityCode: null,
        crosswalkReleaseLabel: lookup.geography?.releaseLabel || null,
      },
    };
  }
  if (!isEnglandWalesLadGssCode(lad)) {
    return {
      ok: false,
      status: SUFFICIENCY.UNAVAILABLE,
      reason: 'invalid_lad_code',
      geographyResolution: {
        method: 'postcode_crosswalk',
        postcode: parsed.normalized,
        localAuthorityCode: lad,
      },
    };
  }

  return {
    ok: true,
    geographyCode: lad,
    geographyResolution: {
      method: 'postcode_crosswalk',
      postcode: parsed.normalized,
      matchStatus: lookup.matchStatus,
      localAuthorityCode: lad,
      crosswalkReleaseLabel: lookup.geography?.releaseLabel || null,
      countryCode,
      geographyVintageCompatibility: 'UNPROVEN_NATIONWIDE',
      note: 'Code equality only. Census 2021 LTLA versus LAD_2024 / LTLA_MID_2024 compatibility is not verified.',
    },
  };
}

async function getOfficialLadTenureEvidence({
  tenureStore,
  geographyStore = null,
  geographyCode = null,
  postcode = null,
  releaseLabel = CENSUS2021_TS054_RELEASE_LABEL,
  referencePeriod = CENSUS2021_TS054_REFERENCE_PERIOD,
} = {}) {
  if (!tenureStore) {
    return unavailableResult('tenure_store_not_provided');
  }

  const resolved = await resolveLadCode({ geographyCode, postcode, geographyStore });
  if (!resolved.ok) {
    const base = resolved.status === SUFFICIENCY.UNRESOLVED
      ? unresolvedResult(resolved.reason, resolved)
      : unavailableResult(resolved.reason, resolved);
    assertNoInferenceFields(base);
    return base;
  }

  const query = await tenureStore.queryByGeographyCode(resolved.geographyCode, {
    releaseLabel,
    referencePeriod,
  });
  if (query.datasetCoverage?.state === 'NOT_IMPORTED' || query.matchStatus === 'NOT_IMPORTED') {
    const result = unavailableResult('tenure_not_imported', {
      subject: {
        geographyType: CENSUS2021_TS054_GEOGRAPHY_TYPE,
        geographyCode: resolved.geographyCode,
        geographyVintage: CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
      },
      geographyResolution: resolved.geographyResolution,
      coverage: query.datasetCoverage,
    });
    assertNoInferenceFields(result);
    return result;
  }
  if (query.datasetCoverage?.state === 'ERROR') {
    const result = unavailableResult('tenure_error', {
      subject: {
        geographyType: CENSUS2021_TS054_GEOGRAPHY_TYPE,
        geographyCode: resolved.geographyCode,
        geographyVintage: CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
      },
      geographyResolution: resolved.geographyResolution,
      coverage: query.datasetCoverage,
    });
    assertNoInferenceFields(result);
    return result;
  }
  if (!query.matched) {
    const result = unavailableResult('lad_missing_from_tenure', {
      subject: {
        geographyType: CENSUS2021_TS054_GEOGRAPHY_TYPE,
        geographyCode: resolved.geographyCode,
        geographyVintage: CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
        referencePeriod,
      },
      geographyResolution: resolved.geographyResolution,
      coverage: query.datasetCoverage,
      geographyVintageCompatibility: 'UNPROVEN_NATIONWIDE',
    });
    assertNoInferenceFields(result);
    return result;
  }

  const aggregates = buildTenureAggregates(query.observations);
  const evidence = [
    ...query.observations.map((row) => rawCategoryEvidence(row)),
    ...aggregates.filter((item) => item.complete).map((item) => derivedAggregateEvidence(item, resolved.geographyCode)),
  ];

  const result = {
    status: SUFFICIENCY.SUFFICIENT,
    reason: null,
    subject: {
      geographyType: CENSUS2021_TS054_GEOGRAPHY_TYPE,
      geographyCode: resolved.geographyCode,
      geographyName: query.observations[0]?.geographyName || null,
      geographyVintage: CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
      referencePeriod: CENSUS2021_TS054_REFERENCE_PERIOD,
      postcode: resolved.geographyResolution?.postcode || null,
    },
    geographyResolution: resolved.geographyResolution,
    observations: query.observations.map((row) => ({
      recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
      source: row.source,
      dataset: row.dataset,
      datasetId: row.datasetId || CENSUS2021_TS054_DATASET_ID,
      edition: row.edition || CENSUS2021_TS054_EDITION,
      version: row.version == null ? CENSUS2021_TS054_VERSION : row.version,
      sourceProduct: row.sourceProduct || CENSUS2021_TS054_SOURCE_PRODUCT,
      releaseLabel: row.releaseLabel,
      referencePeriod: row.referencePeriod || CENSUS2021_TS054_REFERENCE_PERIOD,
      geographyType: row.geographyType,
      geographyVintage: row.geographyVintage,
      geographyCode: row.geographyCode,
      categoryCode: row.categoryCode,
      categoryLabel: row.categoryLabel,
      householdCount: row.householdCount,
      unit: UNIT.HOUSEHOLDS,
      contentFingerprint: row.contentFingerprint,
      historicalCensusContext: true,
    })),
    aggregates: aggregates.map((item) => ({
      ...item,
      unit: UNIT.HOUSEHOLDS,
      historicalCensusContext: true,
    })),
    evidence,
    coverage: query.datasetCoverage,
    geographyVintage: CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
    geographyVintageCompatibility: 'UNPROVEN_NATIONWIDE',
    limitations: CENSUS2021_TS054_LIMITATIONS.slice(),
    provenance: {
      ...CENSUS2021_TS054_PROVENANCE,
      releaseDate: CENSUS2021_TS054_VERSION_DATE,
      originalReleaseDate: CENSUS2021_TS054_RELEASE_DATE,
      referencePeriod: CENSUS2021_TS054_REFERENCE_PERIOD,
      versionDate: CENSUS2021_TS054_VERSION_DATE,
    },
    recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
    factClass: EVIDENCE_CLASS.AREA_CONTEXT,
    historicalCensusContext: true,
    contextKind: 'HISTORICAL_CENSUS_CONTEXT',
    sharesImplemented: false,
  };
  assertNoInferenceFields(result);
  return result;
}

module.exports = {
  SUFFICIENCY,
  FORBIDDEN_INFERENCE_KEYS,
  getOfficialLadTenureEvidence,
  resolveLadCode,
};
