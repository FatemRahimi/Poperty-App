/**
 * Official LAD deprivation evidence from IoD 2025 File 10 v2.
 * AREA_CONTEXT only. No ranking, forecast, or investment recommendation.
 */

const {
  IOD2025_SOURCE,
  IOD2025_DATASET,
  IOD2025_SOURCE_PRODUCT,
  IOD2025_RELEASE_LABEL,
  IOD2025_GEOGRAPHY_TYPE,
  IOD2025_GEOGRAPHY_VINTAGE,
  IOD2025_METRICS,
  IOD2025_LIMITATIONS,
  IOD2025_PROVENANCE,
  MARKET_RECORD_KIND,
  isEnglandLadGssCode,
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
  'propertyQuality',
  'purchaseWinner',
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
    geographyVintage: IOD2025_GEOGRAPHY_VINTAGE,
    geographyVintageCompatibility: extras.geographyVintageCompatibility || 'UNPROVEN_NATIONWIDE',
    limitations: IOD2025_LIMITATIONS.slice(),
    provenance: IOD2025_PROVENANCE,
    recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
    factClass: EVIDENCE_CLASS.AREA_CONTEXT,
  };
}

function unresolvedResult(reason, extras = {}) {
  return {
    ...unavailableResult(reason, extras),
    status: SUFFICIENCY.UNRESOLVED,
  };
}

function metricEvidence(observation, metric, value, unit) {
  return createEvidence({
    domain: DOMAIN_ID.MARKET,
    subjectRef: createSubjectRef({
      kind: IDENTITY_KIND.SITE,
      id: `lad:${observation.geographyCode}`,
    }),
    factType: `officialLadDeprivation.${metric.id}`,
    classification: EVIDENCE_CLASS.AREA_CONTEXT,
    sourceType: SOURCE_TYPE.OFFICIAL,
    value,
    unit,
    authoritative: true,
    sharedPropertyEvidence: false,
    spatialRelation: SPATIAL_RELATION.AREA_CONTEXT,
    evidenceAsOf: '2025-10-30',
    observedAt: '2025-10-30',
    retrievedAt: observation.ingestedAt || null,
    provenance: {
      source: IOD2025_SOURCE,
      dataset: IOD2025_DATASET,
      sourceProduct: IOD2025_SOURCE_PRODUCT,
      provider: IOD2025_PROVENANCE.provider,
      licence: IOD2025_PROVENANCE.licence,
      requiredAttribution: IOD2025_PROVENANCE.requiredAttribution,
      releaseLabel: observation.releaseLabel || IOD2025_RELEASE_LABEL,
      geographyType: IOD2025_GEOGRAPHY_TYPE,
      geographyCode: observation.geographyCode,
      geographyVintage: IOD2025_GEOGRAPHY_VINTAGE,
      metric: metric.id,
      valueKind: metric.valueKind,
      rankInterpretation: metric.rankInterpretation || null,
      contentFingerprint: observation.contentFingerprint,
    },
    limitations: IOD2025_LIMITATIONS.slice(),
    assessmentState: 'assessed',
  });
}

function buildEvidenceBundle(observation) {
  const items = [];
  items.push(metricEvidence(
    observation,
    IOD2025_METRICS.IMD_AVERAGE_SCORE,
    observation.imdAverageScore,
    UNIT.SCORE
  ));
  items.push(metricEvidence(
    observation,
    IOD2025_METRICS.IMD_RANK_OF_AVERAGE_SCORE,
    observation.imdRankOfAverageScore,
    UNIT.RANK
  ));
  items.push(metricEvidence(
    observation,
    IOD2025_METRICS.IMD_PROPORTION_MOST_DEPRIVED_10,
    observation.imdProportionMostDeprived10,
    UNIT.RATIO
  ));
  return items;
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
    if (!isEnglandLadGssCode(code)) {
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
  if (countryCode && countryCode !== 'E92000001') {
    return {
      ok: false,
      status: SUFFICIENCY.UNAVAILABLE,
      reason: 'non_england_geography',
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
  if (!isEnglandLadGssCode(lad)) {
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
      note: 'Code equality only. Nationwide LAD_2024 vintage alignment is not verified.',
    },
  };
}

async function getOfficialLadDeprivationEvidence({
  iodStore,
  geographyStore = null,
  geographyCode = null,
  postcode = null,
  releaseLabel = IOD2025_RELEASE_LABEL,
} = {}) {
  if (!iodStore) {
    return unavailableResult('iod_store_not_provided');
  }

  const resolved = await resolveLadCode({ geographyCode, postcode, geographyStore });
  if (!resolved.ok) {
    const base = resolved.status === SUFFICIENCY.UNRESOLVED
      ? unresolvedResult(resolved.reason, resolved)
      : unavailableResult(resolved.reason, resolved);
    assertNoInferenceFields(base);
    return base;
  }

  const query = await iodStore.queryByGeographyCode(resolved.geographyCode, { releaseLabel });
  if (query.datasetCoverage?.state === 'NOT_IMPORTED' || query.matchStatus === 'NOT_IMPORTED') {
    const result = unavailableResult('iod_not_imported', {
      subject: {
        geographyType: IOD2025_GEOGRAPHY_TYPE,
        geographyCode: resolved.geographyCode,
        geographyVintage: IOD2025_GEOGRAPHY_VINTAGE,
      },
      geographyResolution: resolved.geographyResolution,
      coverage: query.datasetCoverage,
    });
    assertNoInferenceFields(result);
    return result;
  }
  if (query.datasetCoverage?.state === 'ERROR') {
    const result = unavailableResult('iod_error', {
      subject: {
        geographyType: IOD2025_GEOGRAPHY_TYPE,
        geographyCode: resolved.geographyCode,
        geographyVintage: IOD2025_GEOGRAPHY_VINTAGE,
      },
      geographyResolution: resolved.geographyResolution,
      coverage: query.datasetCoverage,
    });
    assertNoInferenceFields(result);
    return result;
  }
  if (!query.matched) {
    const result = unavailableResult('lad_missing_from_iod', {
      subject: {
        geographyType: IOD2025_GEOGRAPHY_TYPE,
        geographyCode: resolved.geographyCode,
        geographyVintage: IOD2025_GEOGRAPHY_VINTAGE,
      },
      geographyResolution: resolved.geographyResolution,
      coverage: query.datasetCoverage,
      geographyVintageCompatibility: 'UNPROVEN_NATIONWIDE',
    });
    assertNoInferenceFields(result);
    return result;
  }

  const observation = query.observations[0];
  const evidence = buildEvidenceBundle(observation);
  const result = {
    status: SUFFICIENCY.SUFFICIENT,
    reason: null,
    subject: {
      geographyType: IOD2025_GEOGRAPHY_TYPE,
      geographyCode: observation.geographyCode,
      geographyName: observation.geographyName,
      geographyVintage: IOD2025_GEOGRAPHY_VINTAGE,
      postcode: resolved.geographyResolution?.postcode || null,
    },
    geographyResolution: resolved.geographyResolution,
    observation: {
      recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
      source: observation.source,
      dataset: observation.dataset,
      sourceProduct: observation.sourceProduct || IOD2025_SOURCE_PRODUCT,
      releaseLabel: observation.releaseLabel,
      geographyType: observation.geographyType,
      geographyVintage: observation.geographyVintage,
      geographyCode: observation.geographyCode,
      imdAverageScore: observation.imdAverageScore,
      imdRankOfAverageScore: observation.imdRankOfAverageScore,
      imdProportionMostDeprived10: observation.imdProportionMostDeprived10,
      contentFingerprint: observation.contentFingerprint,
    },
    metrics: {
      imdAverageScore: observation.imdAverageScore,
      imdRankOfAverageScore: observation.imdRankOfAverageScore,
      imdProportionMostDeprived10: observation.imdProportionMostDeprived10,
    },
    evidence,
    coverage: query.datasetCoverage,
    geographyVintage: IOD2025_GEOGRAPHY_VINTAGE,
    geographyVintageCompatibility: 'UNPROVEN_NATIONWIDE',
    limitations: IOD2025_LIMITATIONS.slice(),
    provenance: observation.provenance || IOD2025_PROVENANCE,
    recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
    factClass: EVIDENCE_CLASS.AREA_CONTEXT,
  };
  assertNoInferenceFields(result);
  return result;
}

module.exports = {
  SUFFICIENCY,
  FORBIDDEN_INFERENCE_KEYS,
  getOfficialLadDeprivationEvidence,
  resolveLadCode,
};
