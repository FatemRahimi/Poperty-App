/**
 * Official LAD mid-year population evidence from ONS MYE.
 * AREA_CONTEXT only. Official observations only. No growth, forecast, or investment signal.
 */

const {
  ONS_MYE_SOURCE,
  ONS_MYE_DATASET,
  ONS_MYE_SOURCE_PRODUCT,
  ONS_MYE_RELEASE_LABEL,
  ONS_MYE_REFERENCE_PERIOD,
  ONS_MYE_GEOGRAPHY_TYPE,
  ONS_MYE_GEOGRAPHY_VINTAGE,
  ONS_MYE_METRICS,
  ONS_MYE_LIMITATIONS,
  ONS_MYE_PROVENANCE,
  MARKET_RECORD_KIND,
  isLadGssCode,
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
  'populationGrowth',
  'populationCagr',
  'rentalDemand',
  'propertyQuality',
  'purchaseWinner',
  'growthCalculated',
]);

function unavailableResult(reason, extras = {}) {
  return {
    status: SUFFICIENCY.UNAVAILABLE,
    reason,
    subject: extras.subject || null,
    geographyResolution: extras.geographyResolution || null,
    observation: null,
    evidence: [],
    coverage: extras.coverage || null,
    geographyVintage: ONS_MYE_GEOGRAPHY_VINTAGE,
    geographyVintageCompatibility: extras.geographyVintageCompatibility || 'UNPROVEN_NATIONWIDE',
    limitations: ONS_MYE_LIMITATIONS.slice(),
    provenance: ONS_MYE_PROVENANCE,
    recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
    factClass: EVIDENCE_CLASS.AREA_CONTEXT,
    derivedGrowth: false,
  };
}

function unresolvedResult(reason, extras = {}) {
  return {
    ...unavailableResult(reason, extras),
    status: SUFFICIENCY.UNRESOLVED,
  };
}

function metricEvidence(observation) {
  const metric = ONS_MYE_METRICS.TOTAL_USUAL_RESIDENT_POPULATION;
  return createEvidence({
    domain: DOMAIN_ID.MARKET,
    subjectRef: createSubjectRef({
      kind: IDENTITY_KIND.SITE,
      id: `lad:${observation.geographyCode}`,
    }),
    factType: `officialLadPopulation.${metric.id}`,
    classification: EVIDENCE_CLASS.AREA_CONTEXT,
    sourceType: SOURCE_TYPE.OFFICIAL,
    value: observation.totalUsualResidentPopulation,
    unit: UNIT.PERSONS,
    authoritative: true,
    sharedPropertyEvidence: false,
    spatialRelation: SPATIAL_RELATION.AREA_CONTEXT,
    evidenceAsOf: observation.observationDate,
    observedAt: observation.observationDate,
    retrievedAt: observation.ingestedAt || null,
    provenance: {
      source: ONS_MYE_SOURCE,
      dataset: ONS_MYE_DATASET,
      sourceProduct: ONS_MYE_SOURCE_PRODUCT,
      provider: ONS_MYE_PROVENANCE.provider,
      licence: ONS_MYE_PROVENANCE.licence,
      requiredAttribution: ONS_MYE_PROVENANCE.requiredAttribution,
      releaseLabel: observation.releaseLabel || ONS_MYE_RELEASE_LABEL,
      referencePeriod: observation.observationDate,
      geographyType: ONS_MYE_GEOGRAPHY_TYPE,
      geographyCode: observation.geographyCode,
      geographyVintage: ONS_MYE_GEOGRAPHY_VINTAGE,
      metric: metric.id,
      valueKind: metric.valueKind,
      metricNature: 'ESTIMATE',
      contentFingerprint: observation.contentFingerprint,
    },
    limitations: ONS_MYE_LIMITATIONS.slice(),
    assessmentState: 'assessed',
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
    if (!isLadGssCode(code)) {
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
  if (!isLadGssCode(lad)) {
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
      countryCode: lookup.geography?.countryCode || null,
      geographyVintageCompatibility: 'UNPROVEN_NATIONWIDE',
      note: 'Code equality only. Nationwide LAD/ltla vintage alignment is not verified.',
    },
  };
}

async function getOfficialLadPopulationEvidence({
  populationStore,
  geographyStore = null,
  geographyCode = null,
  postcode = null,
  releaseLabel = ONS_MYE_RELEASE_LABEL,
  observationDate = ONS_MYE_REFERENCE_PERIOD,
} = {}) {
  if (!populationStore) {
    return unavailableResult('population_store_not_provided');
  }

  const resolved = await resolveLadCode({ geographyCode, postcode, geographyStore });
  if (!resolved.ok) {
    const base = resolved.status === SUFFICIENCY.UNRESOLVED
      ? unresolvedResult(resolved.reason, resolved)
      : unavailableResult(resolved.reason, resolved);
    assertNoInferenceFields(base);
    return base;
  }

  const query = await populationStore.queryByGeographyCode(resolved.geographyCode, {
    releaseLabel,
    observationDate,
  });
  if (query.datasetCoverage?.state === 'NOT_IMPORTED' || query.matchStatus === 'NOT_IMPORTED') {
    const result = unavailableResult('population_not_imported', {
      subject: {
        geographyType: ONS_MYE_GEOGRAPHY_TYPE,
        geographyCode: resolved.geographyCode,
        geographyVintage: ONS_MYE_GEOGRAPHY_VINTAGE,
      },
      geographyResolution: resolved.geographyResolution,
      coverage: query.datasetCoverage,
    });
    assertNoInferenceFields(result);
    return result;
  }
  if (query.datasetCoverage?.state === 'ERROR') {
    const result = unavailableResult('population_error', {
      subject: {
        geographyType: ONS_MYE_GEOGRAPHY_TYPE,
        geographyCode: resolved.geographyCode,
        geographyVintage: ONS_MYE_GEOGRAPHY_VINTAGE,
      },
      geographyResolution: resolved.geographyResolution,
      coverage: query.datasetCoverage,
    });
    assertNoInferenceFields(result);
    return result;
  }
  if (!query.matched) {
    const result = unavailableResult('lad_missing_from_population', {
      subject: {
        geographyType: ONS_MYE_GEOGRAPHY_TYPE,
        geographyCode: resolved.geographyCode,
        geographyVintage: ONS_MYE_GEOGRAPHY_VINTAGE,
        referencePeriod: observationDate || null,
      },
      geographyResolution: resolved.geographyResolution,
      coverage: query.datasetCoverage,
      geographyVintageCompatibility: 'UNPROVEN_NATIONWIDE',
    });
    assertNoInferenceFields(result);
    return result;
  }

  const observation = query.observations[query.observations.length - 1];
  const evidence = [metricEvidence(observation)];
  const result = {
    status: SUFFICIENCY.SUFFICIENT,
    reason: null,
    subject: {
      geographyType: ONS_MYE_GEOGRAPHY_TYPE,
      geographyCode: observation.geographyCode,
      geographyName: observation.geographyName,
      geographyVintage: ONS_MYE_GEOGRAPHY_VINTAGE,
      referencePeriod: observation.observationDate,
      postcode: resolved.geographyResolution?.postcode || null,
    },
    geographyResolution: resolved.geographyResolution,
    observation: {
      recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
      source: observation.source,
      dataset: observation.dataset,
      sourceProduct: observation.sourceProduct || ONS_MYE_SOURCE_PRODUCT,
      releaseLabel: observation.releaseLabel,
      referencePeriod: observation.observationDate,
      geographyType: observation.geographyType,
      geographyVintage: observation.geographyVintage,
      geographyCode: observation.geographyCode,
      totalUsualResidentPopulation: observation.totalUsualResidentPopulation,
      contentFingerprint: observation.contentFingerprint,
    },
    metrics: {
      totalUsualResidentPopulation: observation.totalUsualResidentPopulation,
    },
    evidence,
    coverage: query.datasetCoverage,
    geographyVintage: ONS_MYE_GEOGRAPHY_VINTAGE,
    geographyVintageCompatibility: 'UNPROVEN_NATIONWIDE',
    limitations: ONS_MYE_LIMITATIONS.slice(),
    provenance: observation.provenance || ONS_MYE_PROVENANCE,
    recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
    factClass: EVIDENCE_CLASS.AREA_CONTEXT,
    derivedGrowth: false,
  };
  assertNoInferenceFields(result);
  return result;
}

module.exports = {
  SUFFICIENCY,
  FORBIDDEN_INFERENCE_KEYS,
  getOfficialLadPopulationEvidence,
  resolveLadCode,
};
