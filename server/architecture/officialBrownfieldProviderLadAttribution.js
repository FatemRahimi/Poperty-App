/**
 * Brownfield provider → LAD attribution contract.
 *
 * This describes the statistical geography associated with the provider
 * organisation. It does NOT prove that each Brownfield site supplied by that
 * organisation is physically located inside that LAD.
 *
 * Separate from Phase 3C organisation → LPA.reference coverage mapping.
 */

const {
  officialDatasetProvenance,
  SHARED_LICENCE_LIMITATIONS,
} = require('./officialMarketDataset');

const PROVIDER_LAD_ATTRIBUTION_SOURCE = 'MHCLG_PLANNING_DATA';
const PROVIDER_LAD_ATTRIBUTION_DATASET = 'brownfield-provider-lad-attribution';
const PROVIDER_LAD_ATTRIBUTION_LABEL = 'Brownfield provider LAD attribution';

/**
 * Supported England local authority district / unitary GSS for area evidence.
 * Matches ONS LAD/LTLA families used by ONSPD localAuthorityCode and
 * population / deprivation / tenure keys in this repository:
 *   E06 unitary, E07 non-metropolitan district,
 *   E08 metropolitan district, E09 London borough.
 *
 * Deliberately narrower than /^E\d{8}$/, which also matches Planning Data
 * local-planning-authority references (E60...).
 */
const ENGLAND_LAD_DISTRICT_GSS_PATTERN = /^E0[6-9]\d{6}$/;

/** Planning Data local-planning-authority reference family observed in Phase 3C/3G. */
const PLANNING_DATA_LPA_REFERENCE_PATTERN = /^E60\d{6}$/;

const PROVIDER_LAD_ATTRIBUTION_STATUS = Object.freeze({
  PROVIDER_LAD_ATTRIBUTED: 'PROVIDER_LAD_ATTRIBUTED',
  STATISTICAL_GEOGRAPHY_MISSING: 'STATISTICAL_GEOGRAPHY_MISSING',
  STATISTICAL_GEOGRAPHY_NOT_LAD: 'STATISTICAL_GEOGRAPHY_NOT_LAD',
  STATISTICAL_GEOGRAPHY_AMBIGUOUS: 'STATISTICAL_GEOGRAPHY_AMBIGUOUS',
  ORGANISATION_UNRESOLVED: 'ORGANISATION_UNRESOLVED',
});

const PROVIDER_LAD_ATTRIBUTION_METHOD = Object.freeze({
  ORGANISATION_STATISTICAL_GEOGRAPHY: 'ORGANISATION_STATISTICAL_GEOGRAPHY',
  NONE: 'NONE',
});

const PROVIDER_LAD_ATTRIBUTION_LIMITATIONS = Object.freeze([
  ...SHARED_LICENCE_LIMITATIONS,
  'This attribution describes the statistical geography associated with the provider organisation.',
  'It does NOT prove that each Brownfield site supplied by that organisation is physically located inside that LAD.',
  'PROVIDER_ATTRIBUTED is not site location, not siteWithinArea, and not complete coverage.',
  'Phase 3C organisation→LPA.reference mapping is a separate coverage identity and is not overloaded here.',
  'LPA references such as E60…… are not LAD GSS codes and must not be treated as LAD.',
  'Historic or abolished LAD codes are not remapped to successors in this foundation.',
  'Multiple or ambiguous statistical-geography values stay unresolved; one value is never chosen silently.',
  'Diagnostic counts of provider LAD attribution are not England completeness, LPA completeness, or site-location accuracy.',
  'No area Brownfield metrics, capacity aggregation, ranking, or opportunity inference is supported by this contract.',
]);

const FORBIDDEN_PROVIDER_LAD_ATTRIBUTION_KEYS = Object.freeze([
  'siteLocated',
  'siteLad',
  'siteWithinArea',
  'completeCoverage',
  'completenessPercentage',
  'coveragePercentage',
  'opportunityScore',
  'developmentScore',
  'regenerationScore',
  'rank',
  'recommendation',
  'buyRecommendation',
  'letRecommendation',
  'sitesInLad',
  'capacityByLad',
]);

function isSupportedEnglandLadDistrictGssCode(value) {
  if (value == null || value === '') return false;
  return ENGLAND_LAD_DISTRICT_GSS_PATTERN.test(String(value).trim());
}

function isPlanningDataLpaReferenceCode(value) {
  if (value == null || value === '') return false;
  return PLANNING_DATA_LPA_REFERENCE_PATTERN.test(String(value).trim());
}

function providerLadAttributionProvenance({
  sourceUrl = null,
  retrievedAt = null,
  datasetVersion = PROVIDER_LAD_ATTRIBUTION_DATASET,
} = {}) {
  return officialDatasetProvenance({
    provider: 'Ministry of Housing, Communities and Local Government — Planning Data',
    dataset: PROVIDER_LAD_ATTRIBUTION_LABEL,
    sourceUrl,
    licence: 'Open Government Licence v3.0',
    requiredAttribution:
      'Contains public sector information licensed under the Open Government Licence v3.0. '
      + '© Crown copyright and database right. Source: Ministry of Housing, Communities and Local Government — Planning Data.',
    releaseDate: null,
    datasetVersion,
    geographicCoverage: 'England',
    limitations: PROVIDER_LAD_ATTRIBUTION_LIMITATIONS,
  });
}

module.exports = {
  PROVIDER_LAD_ATTRIBUTION_SOURCE,
  PROVIDER_LAD_ATTRIBUTION_DATASET,
  PROVIDER_LAD_ATTRIBUTION_LABEL,
  ENGLAND_LAD_DISTRICT_GSS_PATTERN,
  PLANNING_DATA_LPA_REFERENCE_PATTERN,
  PROVIDER_LAD_ATTRIBUTION_STATUS,
  PROVIDER_LAD_ATTRIBUTION_METHOD,
  PROVIDER_LAD_ATTRIBUTION_LIMITATIONS,
  FORBIDDEN_PROVIDER_LAD_ATTRIBUTION_KEYS,
  isSupportedEnglandLadDistrictGssCode,
  isPlanningDataLpaReferenceCode,
  providerLadAttributionProvenance,
};
