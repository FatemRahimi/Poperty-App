/**
 * Unified Area Evidence Profile v1 — composition only.
 * Orchestrates existing geography / market / population / deprivation / tenure producers.
 * No new dataset, score, forecast, ranking, or recommendation.
 */

const {
  AREA_EVIDENCE_PROFILE_SCHEMA_VERSION,
  AREA_EVIDENCE_FAMILY,
  AREA_EVIDENCE_FAMILY_ORDER,
  AREA_EVIDENCE_PROFILE_STATUS,
  AREA_EVIDENCE_FAMILY_RUNTIME_REASON,
  AREA_EVIDENCE_FAILURE_KIND,
  AREA_EVIDENCE_PROFILE_LIMITATIONS,
  FORBIDDEN_PROFILE_INFERENCE_KEYS,
} = require('../../architecture/officialAreaEvidenceProfileContract');
const { canonicalPostcode } = require('./canonicalPostcode');
const { analyseOfficialMarket } = require('./officialMarketAnalytics');
const { getOfficialLadPopulationEvidence } = require('./officialAreaPopulationEvidence');
const { getOfficialLadDeprivationEvidence } = require('./officialAreaDeprivationEvidence');
const { getOfficialLadTenureEvidence } = require('./officialAreaTenureEvidence');

function isRuntimeFamilyFailure(result) {
  return Boolean(
    result
    && result.failureKind === AREA_EVIDENCE_FAILURE_KIND.RUNTIME_EXCEPTION
    && result.reason === AREA_EVIDENCE_FAMILY_RUNTIME_REASON
  );
}

function marketRuntimeFailureEnvelope() {
  return {
    status: 'UNAVAILABLE',
    reason: AREA_EVIDENCE_FAMILY_RUNTIME_REASON,
    failureKind: AREA_EVIDENCE_FAILURE_KIND.RUNTIME_EXCEPTION,
    recordKind: null,
    subject: null,
    hpi: null,
    transactions: null,
    benchmark: null,
    evidence: [],
    coverage: {
      ukhpi: { state: 'ERROR' },
      hmlr: { state: 'ERROR' },
    },
    limitations: [],
    provenance: null,
  };
}

function populationRuntimeFailureEnvelope() {
  return {
    status: 'UNAVAILABLE',
    reason: AREA_EVIDENCE_FAMILY_RUNTIME_REASON,
    failureKind: AREA_EVIDENCE_FAILURE_KIND.RUNTIME_EXCEPTION,
    subject: null,
    observation: null,
    metrics: null,
    evidence: [],
    coverage: { state: 'ERROR' },
    geographyVintage: null,
    limitations: [],
    provenance: null,
    derivedGrowth: false,
  };
}

function deprivationRuntimeFailureEnvelope() {
  return {
    status: 'UNAVAILABLE',
    reason: AREA_EVIDENCE_FAMILY_RUNTIME_REASON,
    failureKind: AREA_EVIDENCE_FAILURE_KIND.RUNTIME_EXCEPTION,
    subject: null,
    observation: null,
    evidence: [],
    coverage: { state: 'ERROR' },
    geographyVintage: null,
    limitations: [],
    provenance: null,
  };
}

function tenureRuntimeFailureEnvelope() {
  return {
    status: 'UNAVAILABLE',
    reason: AREA_EVIDENCE_FAMILY_RUNTIME_REASON,
    failureKind: AREA_EVIDENCE_FAILURE_KIND.RUNTIME_EXCEPTION,
    subject: null,
    observations: [],
    aggregates: [],
    evidence: [],
    coverage: { state: 'ERROR' },
    geographyVintage: null,
    limitations: [],
    provenance: null,
    historicalCensusContext: null,
    sharesImplemented: false,
  };
}

async function isolateFamily(run, envelopeFactory) {
  try {
    return await run();
  } catch {
    return envelopeFactory();
  }
}

function assertNoInferenceFields(payload) {
  const text = JSON.stringify(payload);
  FORBIDDEN_PROFILE_INFERENCE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key) || new RegExp(`"${key}"`).test(text)) {
      throw new Error(`forbidden_profile_inference_field:${key}`);
    }
  });
  if (Object.prototype.hasOwnProperty.call(payload, 'dataDate')) {
    throw new Error('forbidden_profile_inference_field:dataDate');
  }
}

function familyStatusEntry({
  family,
  status,
  coverageState = null,
  sufficiency = null,
  reason = null,
  geographyVintage = null,
  referencePeriod = null,
}) {
  return {
    family,
    status,
    coverageState,
    sufficiency,
    reason,
    geographyVintage,
    referencePeriod,
  };
}

function sortByFamilyOrder(entries) {
  const rank = new Map(AREA_EVIDENCE_FAMILY_ORDER.map((id, index) => [id, index]));
  return entries.slice().sort((a, b) => {
    const left = rank.has(a.family) ? rank.get(a.family) : 999;
    const right = rank.has(b.family) ? rank.get(b.family) : 999;
    if (left !== right) return left - right;
    return String(a.family).localeCompare(String(b.family));
  });
}

async function resolveProfileGeography({ postcode = null, geographyStore = null } = {}) {
  if (!postcode) {
    return {
      ok: false,
      status: AREA_EVIDENCE_PROFILE_STATUS.UNAVAILABLE,
      reason: 'geography_not_specified',
      geographyResolution: null,
      subject: {
        postcode: null,
        localAuthorityCode: null,
        ukhpiGeographyCode: null,
        countryCode: null,
        geographyType: 'COMPOSITE',
      },
    };
  }
  if (!geographyStore) {
    return {
      ok: false,
      status: AREA_EVIDENCE_PROFILE_STATUS.UNAVAILABLE,
      reason: 'crosswalk_not_provided',
      geographyResolution: {
        method: 'postcode_crosswalk',
        postcode: null,
        matchStatus: 'STORE_NOT_PROVIDED',
      },
      subject: {
        postcode: null,
        localAuthorityCode: null,
        ukhpiGeographyCode: null,
        countryCode: null,
        geographyType: 'COMPOSITE',
      },
    };
  }

  const parsed = canonicalPostcode(postcode);
  if (!parsed.ok) {
    return {
      ok: false,
      status: AREA_EVIDENCE_PROFILE_STATUS.UNAVAILABLE,
      reason: 'invalid_postcode',
      geographyResolution: {
        method: 'postcode_crosswalk',
        postcode: null,
        matchStatus: 'INVALID',
      },
      subject: {
        postcode: null,
        localAuthorityCode: null,
        ukhpiGeographyCode: null,
        countryCode: null,
        geographyType: 'COMPOSITE',
      },
    };
  }

  let lookup;
  try {
    lookup = await geographyStore.lookupByPostcode(parsed.normalized);
  } catch {
    return {
      ok: false,
      status: AREA_EVIDENCE_PROFILE_STATUS.UNAVAILABLE,
      reason: 'crosswalk_runtime_error',
      geographyResolution: {
        method: 'postcode_crosswalk',
        postcode: parsed.normalized,
        matchStatus: 'ERROR',
        effectiveSelection: null,
        ambiguousReleases: [],
        coverage: { state: 'ERROR' },
        localAuthorityCode: null,
        ukhpiGeographyCode: null,
        countryCode: null,
        crosswalkReleaseLabel: null,
      },
      subject: {
        postcode: parsed.normalized,
        localAuthorityCode: null,
        ukhpiGeographyCode: null,
        countryCode: null,
        geographyType: 'COMPOSITE',
      },
    };
  }

  const geographyResolution = {
    method: 'postcode_crosswalk',
    postcode: parsed.normalized,
    matchStatus: lookup.matchStatus,
    effectiveSelection: lookup.effectiveSelection || null,
    ambiguousReleases: lookup.ambiguousReleases || [],
    coverage: lookup.datasetCoverage || null,
    localAuthorityCode: lookup.geography?.localAuthorityCode || null,
    ukhpiGeographyCode: lookup.geography?.ukhpiGeographyCode || null,
    countryCode: lookup.geography?.countryCode || null,
    crosswalkReleaseLabel: lookup.geography?.releaseLabel || null,
  };

  if (lookup.matchStatus === 'INVALID') {
    return {
      ok: false,
      status: AREA_EVIDENCE_PROFILE_STATUS.UNAVAILABLE,
      reason: 'invalid_postcode',
      geographyResolution,
      subject: {
        postcode: parsed.normalized,
        localAuthorityCode: null,
        ukhpiGeographyCode: null,
        countryCode: null,
        geographyType: 'COMPOSITE',
      },
      lookup,
    };
  }
  if (lookup.matchStatus === 'NOT_IMPORTED') {
    return {
      ok: false,
      status: AREA_EVIDENCE_PROFILE_STATUS.UNAVAILABLE,
      reason: 'crosswalk_not_imported',
      geographyResolution,
      subject: {
        postcode: parsed.normalized,
        localAuthorityCode: null,
        ukhpiGeographyCode: null,
        countryCode: null,
        geographyType: 'COMPOSITE',
      },
      lookup,
    };
  }
  if (lookup.matchStatus === 'ERROR' || lookup.datasetCoverage?.state === 'ERROR') {
    return {
      ok: false,
      status: AREA_EVIDENCE_PROFILE_STATUS.UNAVAILABLE,
      reason: 'crosswalk_error',
      geographyResolution,
      subject: {
        postcode: parsed.normalized,
        localAuthorityCode: null,
        ukhpiGeographyCode: null,
        countryCode: null,
        geographyType: 'COMPOSITE',
      },
      lookup,
    };
  }
  if (lookup.matchStatus === 'AMBIGUOUS' || lookup.effectiveSelection === 'AMBIGUOUS') {
    return {
      ok: false,
      status: AREA_EVIDENCE_PROFILE_STATUS.UNRESOLVED,
      reason: 'crosswalk_ambiguous',
      geographyResolution: { ...geographyResolution, matchStatus: 'AMBIGUOUS' },
      subject: {
        postcode: parsed.normalized,
        localAuthorityCode: null,
        ukhpiGeographyCode: null,
        countryCode: null,
        geographyType: 'COMPOSITE',
      },
      lookup,
    };
  }
  if (!lookup.matched || lookup.matchStatus === 'NO_MATCH') {
    return {
      ok: false,
      status: AREA_EVIDENCE_PROFILE_STATUS.UNAVAILABLE,
      reason: 'postcode_no_match',
      geographyResolution,
      subject: {
        postcode: parsed.normalized,
        localAuthorityCode: null,
        ukhpiGeographyCode: null,
        countryCode: null,
        geographyType: 'COMPOSITE',
      },
      lookup,
    };
  }

  const localAuthorityCode = lookup.geography?.localAuthorityCode || null;
  const ukhpiGeographyCode = lookup.geography?.ukhpiGeographyCode || null;
  if (!localAuthorityCode && !ukhpiGeographyCode) {
    return {
      ok: false,
      status: AREA_EVIDENCE_PROFILE_STATUS.UNAVAILABLE,
      reason: 'canonical_geography_identity_missing',
      geographyResolution,
      subject: {
        postcode: parsed.normalized,
        localAuthorityCode: null,
        ukhpiGeographyCode: null,
        countryCode: lookup.geography?.countryCode || null,
        geographyType: 'COMPOSITE',
      },
      lookup,
    };
  }

  return {
    ok: true,
    status: AREA_EVIDENCE_PROFILE_STATUS.SUFFICIENT,
    reason: null,
    geographyResolution,
    subject: {
      postcode: parsed.normalized,
      localAuthorityCode,
      ukhpiGeographyCode,
      countryCode: lookup.geography?.countryCode || null,
      geographyType: 'COMPOSITE',
    },
    lookup,
  };
}

function summarizeAreaFamily(family, result) {
  if (!result) {
    return familyStatusEntry({
      family,
      status: 'UNAVAILABLE',
      reason: 'family_result_absent',
    });
  }
  const coverageState = result.coverage?.state
    || result.coverage?.ukhpi?.state
    || null;
  return familyStatusEntry({
    family,
    status: result.status || 'UNAVAILABLE',
    coverageState,
    sufficiency: result.status || null,
    reason: result.reason || null,
    geographyVintage: result.geographyVintage || result.subject?.geographyVintage || null,
    referencePeriod: result.subject?.referencePeriod
      || result.observation?.referencePeriod
      || result.provenance?.referencePeriod
      || null,
  });
}

function summarizeMarketFamily(market) {
  if (!market) {
    return familyStatusEntry({
      family: AREA_EVIDENCE_FAMILY.MARKET,
      status: 'UNAVAILABLE',
      reason: 'market_result_absent',
    });
  }
  if (isRuntimeFamilyFailure(market)) {
    return familyStatusEntry({
      family: AREA_EVIDENCE_FAMILY.MARKET,
      status: 'UNAVAILABLE',
      coverageState: market.coverage?.ukhpi?.state || market.coverage?.hmlr?.state || 'ERROR',
      sufficiency: 'UNAVAILABLE',
      reason: AREA_EVIDENCE_FAMILY_RUNTIME_REASON,
      geographyVintage: null,
      referencePeriod: null,
    });
  }
  const ukhpiState = market.coverage?.ukhpi?.state || null;
  const hmlrState = market.coverage?.hmlr?.state || null;
  const txStatus = market.transactions?.status || null;
  const hpiAny = market.hpi
    && ['oneYear', 'threeYear', 'fiveYear'].some((key) => market.hpi[key]?.status === 'SUFFICIENT');
  const status = (hpiAny || txStatus === 'SUFFICIENT') ? 'PARTIAL' : 'UNAVAILABLE';
  let reason = null;
  if (!hpiAny && txStatus !== 'SUFFICIENT') {
    reason = market.transactions?.reason || 'market_families_unavailable';
  }
  return familyStatusEntry({
    family: AREA_EVIDENCE_FAMILY.MARKET,
    status,
    coverageState: ukhpiState || hmlrState,
    sufficiency: txStatus,
    reason,
    geographyVintage: null,
    referencePeriod: market.transactions?.period
      ? `${market.transactions.period.start}/${market.transactions.period.end}`
      : null,
  });
}

function buildUnknowns(familyStatus) {
  const unknowns = [];
  familyStatus.forEach((entry) => {
    if (entry.status === 'SUFFICIENT') return;
    if (entry.family === AREA_EVIDENCE_FAMILY.MARKET && entry.status === 'PARTIAL') {
      // Market can be PARTIAL with some usable evidence; only list if fully unavailable.
      return;
    }
    unknowns.push({
      family: entry.family,
      reason: entry.reason || entry.status,
      coverageState: entry.coverageState,
      status: entry.status,
    });
  });
  return sortByFamilyOrder(unknowns);
}

function profileStatusFromFamilies(familyStatus) {
  const relevant = familyStatus.filter((entry) => entry.family !== AREA_EVIDENCE_FAMILY.GEOGRAPHY);
  const usable = relevant.filter((entry) => (
    entry.status === 'SUFFICIENT' || entry.status === 'PARTIAL'
  ));
  if (usable.length === 0) return AREA_EVIDENCE_PROFILE_STATUS.UNAVAILABLE;
  if (usable.length === relevant.length
    && relevant.every((entry) => entry.status === 'SUFFICIENT')) {
    return AREA_EVIDENCE_PROFILE_STATUS.SUFFICIENT;
  }
  return AREA_EVIDENCE_PROFILE_STATUS.PARTIAL;
}

function hasFamilyProvenance(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function provenanceRefsFromFamilies(families) {
  const refs = [];
  if (hasFamilyProvenance(families?.geography?.provenance)) {
    refs.push({ family: AREA_EVIDENCE_FAMILY.GEOGRAPHY });
  }
  if (hasFamilyProvenance(families?.market?.provenance)) {
    refs.push({ family: AREA_EVIDENCE_FAMILY.MARKET });
  }
  if (hasFamilyProvenance(families?.population?.provenance)) {
    refs.push({ family: AREA_EVIDENCE_FAMILY.POPULATION });
  }
  if (hasFamilyProvenance(families?.deprivation?.provenance)) {
    refs.push({ family: AREA_EVIDENCE_FAMILY.DEPRIVATION });
  }
  if (hasFamilyProvenance(families?.housing?.tenure?.provenance)) {
    refs.push({ family: AREA_EVIDENCE_FAMILY.HOUSING_TENURE });
  }
  return sortByFamilyOrder(refs);
}

async function getOfficialAreaEvidenceProfile({
  postcode = null,
  geographyStore = null,
  ukhpiStore = null,
  saleStore = null,
  populationStore = null,
  iodStore = null,
  tenureStore = null,
  asOf = null,
  propertyCategory = 'all',
  generatedAt = new Date().toISOString(),
} = {}) {
  let geo;
  try {
    geo = await resolveProfileGeography({ postcode, geographyStore });
  } catch {
    geo = {
      ok: false,
      status: AREA_EVIDENCE_PROFILE_STATUS.UNAVAILABLE,
      reason: 'geography_runtime_error',
      geographyResolution: {
        method: 'postcode_crosswalk',
        postcode: null,
        matchStatus: 'ERROR',
      },
      subject: {
        postcode: null,
        localAuthorityCode: null,
        ukhpiGeographyCode: null,
        countryCode: null,
        geographyType: 'COMPOSITE',
      },
    };
  }

  if (!geo.ok) {
    const familyStatus = sortByFamilyOrder([
      familyStatusEntry({
        family: AREA_EVIDENCE_FAMILY.GEOGRAPHY,
        status: geo.status,
        coverageState: geo.geographyResolution?.coverage?.state || null,
        sufficiency: geo.status,
        reason: geo.reason,
      }),
    ]);
    const profile = {
      schemaVersion: AREA_EVIDENCE_PROFILE_SCHEMA_VERSION,
      generatedAt,
      status: geo.status,
      reason: geo.reason,
      subject: geo.subject,
      geographyResolution: geo.geographyResolution,
      geographyCompatibility: {
        status: 'UNPROVEN_NATIONWIDE',
        note: 'Geography was not safely resolved; evidence families were not composed.',
      },
      families: null,
      familyStatus,
      unknowns: sortByFamilyOrder([
        {
          family: AREA_EVIDENCE_FAMILY.GEOGRAPHY,
          reason: geo.reason,
          coverageState: geo.geographyResolution?.coverage?.state || null,
          status: geo.status,
        },
        {
          family: 'composition',
          reason: 'geography_not_resolved',
          coverageState: null,
          status: geo.status,
        },
      ]),
      provenanceRefs: [],
      limitations: AREA_EVIDENCE_PROFILE_LIMITATIONS.slice(),
    };
    assertNoInferenceFields(profile);
    return profile;
  }

  const { subject, geographyResolution, lookup } = geo;

  const geographyFamily = {
    recordKind: 'GEOGRAPHY_CROSSWALK',
    status: 'SUFFICIENT',
    reason: null,
    subject: {
      postcode: subject.postcode,
      localAuthorityCode: subject.localAuthorityCode,
      ukhpiGeographyCode: subject.ukhpiGeographyCode,
      countryCode: subject.countryCode,
    },
    matchStatus: geographyResolution.matchStatus,
    effectiveSelection: geographyResolution.effectiveSelection,
    coverage: lookup.datasetCoverage || null,
    provenance: lookup.provenance || null,
    limitations: lookup.limitations || [],
    geographyVintage: null,
    note: 'localAuthorityCode and ukhpiGeographyCode are distinct. Names are labels only.',
  };

  const market = await isolateFamily(
    () => analyseOfficialMarket({
      ukhpiStore,
      saleStore,
      geographyCode: subject.ukhpiGeographyCode,
      geographyName: lookup.geography?.ukhpiGeographyName || null,
      geographyType: subject.ukhpiGeographyCode ? 'UKHPI_GEOGRAPHY' : null,
      propertyCategory,
      postcode: subject.postcode,
      asOf,
    }),
    marketRuntimeFailureEnvelope
  );

  const population = await isolateFamily(
    () => getOfficialLadPopulationEvidence({
      populationStore,
      geographyStore,
      postcode: subject.postcode,
      geographyCode: subject.localAuthorityCode,
    }),
    populationRuntimeFailureEnvelope
  );

  const deprivation = await isolateFamily(
    () => getOfficialLadDeprivationEvidence({
      iodStore,
      geographyStore,
      postcode: subject.postcode,
      geographyCode: subject.localAuthorityCode,
    }),
    deprivationRuntimeFailureEnvelope
  );

  const tenure = await isolateFamily(
    () => getOfficialLadTenureEvidence({
      tenureStore,
      geographyStore,
      postcode: subject.postcode,
      geographyCode: subject.localAuthorityCode,
    }),
    tenureRuntimeFailureEnvelope
  );

  const families = {
    geography: geographyFamily,
    market,
    population,
    deprivation,
    housing: {
      tenure,
    },
  };

  const familyStatus = sortByFamilyOrder([
    familyStatusEntry({
      family: AREA_EVIDENCE_FAMILY.GEOGRAPHY,
      status: 'SUFFICIENT',
      coverageState: geographyFamily.coverage?.state || null,
      sufficiency: 'SUFFICIENT',
      reason: null,
    }),
    summarizeMarketFamily(market),
    summarizeAreaFamily(AREA_EVIDENCE_FAMILY.POPULATION, population),
    summarizeAreaFamily(AREA_EVIDENCE_FAMILY.DEPRIVATION, deprivation),
    summarizeAreaFamily(AREA_EVIDENCE_FAMILY.HOUSING_TENURE, tenure),
  ]);

  const profile = {
    schemaVersion: AREA_EVIDENCE_PROFILE_SCHEMA_VERSION,
    generatedAt,
    status: profileStatusFromFamilies(familyStatus),
    reason: null,
    subject,
    geographyResolution,
    geographyCompatibility: {
      status: 'UNPROVEN_NATIONWIDE',
      note: 'Same profile does not prove LAD_2024, LTLA_MID_2024, CENSUS_2021_LTLA, UKHPI geography, and crosswalk release vintages are equivalent.',
      familyVintages: {
        deprivation: deprivation.geographyVintage || null,
        population: population.geographyVintage || null,
        housingTenure: tenure.geographyVintage || null,
      },
    },
    families,
    familyStatus,
    unknowns: buildUnknowns(familyStatus),
    provenanceRefs: provenanceRefsFromFamilies(families),
    limitations: AREA_EVIDENCE_PROFILE_LIMITATIONS.slice(),
  };

  assertNoInferenceFields(profile);
  return profile;
}

module.exports = {
  getOfficialAreaEvidenceProfile,
  resolveProfileGeography,
  AREA_EVIDENCE_PROFILE_SCHEMA_VERSION,
  AREA_EVIDENCE_FAMILY_RUNTIME_REASON,
};
