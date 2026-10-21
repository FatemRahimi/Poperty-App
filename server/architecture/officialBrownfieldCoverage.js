/**
 * Official Brownfield provider-coverage contract.
 * Planning Data identities and provider index only.
 * Not site observations, not area counts, not a statutory duty census.
 */

const {
  officialDatasetProvenance,
  SHARED_LICENCE_LIMITATIONS,
} = require('./officialMarketDataset');

const COVERAGE_SOURCE = 'MHCLG_PLANNING_DATA';
const COVERAGE_PROVIDER = 'Ministry of Housing, Communities and Local Government — Planning Data';
const COVERAGE_LICENCE = 'Open Government Licence v3.0';
const COVERAGE_GEOGRAPHIC_SCOPE = 'England';

const COVERAGE_FAMILY = Object.freeze({
  LPA_IDENTITY: 'LPA_IDENTITY',
  PROVIDER_INDEX: 'PROVIDER_INDEX',
  ORGANISATION_RECORD: 'ORGANISATION_RECORD',
});

const COVERAGE_RUN_STATUS = Object.freeze({
  STARTED: 'STARTED',
  SUCCEEDED: 'SUCCEEDED',
  SOURCE_ERROR: 'SOURCE_ERROR',
  RETRIEVAL_FAILED: 'RETRIEVAL_FAILED',
});

/** Bounded answers. Absence of a site row is not one of these. */
const BROWNFIELD_COVERAGE_STATE = Object.freeze({
  COVERAGE_RETRIEVAL_NOT_RUN: 'COVERAGE_RETRIEVAL_NOT_RUN',
  SOURCE_ERROR: 'SOURCE_ERROR',
  RETRIEVAL_FAILED: 'RETRIEVAL_FAILED',
  LPA_IDENTITY_PRESENT: 'LPA_IDENTITY_PRESENT',
  PROVIDER_LISTED: 'PROVIDER_LISTED',
  PROVIDER_INDEX_ABSENT: 'PROVIDER_INDEX_ABSENT',
  ORGANISATION_LPA_MAPPED: 'ORGANISATION_LPA_MAPPED',
  ORGANISATION_LPA_UNMAPPED: 'ORGANISATION_LPA_UNMAPPED',
});

const COVERAGE_STATE_ORDER = Object.freeze([
  BROWNFIELD_COVERAGE_STATE.COVERAGE_RETRIEVAL_NOT_RUN,
  BROWNFIELD_COVERAGE_STATE.SOURCE_ERROR,
  BROWNFIELD_COVERAGE_STATE.RETRIEVAL_FAILED,
  BROWNFIELD_COVERAGE_STATE.LPA_IDENTITY_PRESENT,
  BROWNFIELD_COVERAGE_STATE.PROVIDER_LISTED,
  BROWNFIELD_COVERAGE_STATE.PROVIDER_INDEX_ABSENT,
  BROWNFIELD_COVERAGE_STATE.ORGANISATION_LPA_MAPPED,
  BROWNFIELD_COVERAGE_STATE.ORGANISATION_LPA_UNMAPPED,
]);

const LPA_DATASET = 'local-planning-authority';
const LPA_DATASET_LABEL = 'Local planning authority';
const LPA_SOURCE_URL = 'https://www.planning.data.gov.uk/dataset/local-planning-authority';
const LPA_ENTITY_SEARCH_URL = 'https://www.planning.data.gov.uk/entity.json?dataset=local-planning-authority';

const PROVIDER_INDEX_DATASET = 'brownfield-land';
const PROVIDER_INDEX_LABEL = 'Brownfield land data providers';
const PROVIDER_INDEX_URL = 'https://www.planning.data.gov.uk/data-provider/brownfield-land';

const ORGANISATION_DATASET_LABEL = 'Organisation';
const ORGANISATION_ENTITY_URL_PREFIX = 'https://www.planning.data.gov.uk/entity/';

const COVERAGE_ATTRIBUTION =
  'Contains public sector information licensed under the Open Government Licence v3.0. '
  + '© Crown copyright and database right. Source: Ministry of Housing, Communities and Local Government — Planning Data.';

const COVERAGE_LIMITATIONS = Object.freeze([
  ...SHARED_LICENCE_LIMITATIONS,
  'This layer records Planning Data LPA identities, the brownfield provider index, and organisation-to-LPA reference links. It does not import brownfield site observations.',
  'The Planning Data local-planning-authority dataset is not a statutory census of every authority required to maintain a brownfield register.',
  'No national completeness percentage is calculated from provider counts, site-organisation counts, or LPA counts.',
  'A listed provider is not proof that the provider dataset is complete.',
  'Absence from the provider index is not proof that an authority has no brownfield register.',
  'An LPA identity is not itself a brownfield provider.',
  'A mapped organisation is not complete brownfield coverage for that LPA.',
  'No imported site rows is not zero brownfield sites. This layer does not answer how many sites exist.',
  'An ended or abolished authority is not zero brownfield sites.',
  'A successor authority is not automatically mapped from its predecessor. Only an exact local-planning-authority code matching an LPA reference creates a link.',
  'local-planning-authority.organisation-entity is the organisation that manages the LPA dataset entity. It is not the council identity and is not used for mapping.',
  'Mapping uses organisation.local-planning-authority compared exactly to LPA.reference. Names, postcodes, and statistical-geography codes are not substitutes.',
  'RetrievedAt is the time this payload was supplied or retrieved. It is not a source publication date.',
  'LPA boundary geometry is not stored. Omitting geometry does not clear OS or other boundary-data rights that apply to the source dataset.',
  'Licence text is product metadata, not a legal opinion and not a statement that commercial use for every product purpose is cleared.',
]);

const FORBIDDEN_COVERAGE_INFERENCE_KEYS = Object.freeze([
  'ZERO_MATCHING_SITES',
  'zeroMatchingSites',
  'LPA_HAS_NOT_PROVIDED',
  'lpaHasNotProvided',
  'COMPLETE_COVERAGE',
  'completeCoverage',
  'NO_BROWNFIELD',
  'noBrownfield',
  'ZERO_BROWNFIELD',
  'zeroBrownfield',
  'FULL_ENGLAND_COVERAGE',
  'fullEnglandCoverage',
  'completenessPercentage',
  'coveragePercentage',
  'coverageRatio',
  'opportunityScore',
  'developmentScore',
  'regenerationScore',
  'rank',
  'winner',
  'recommendation',
  'buyRecommendation',
  'letRecommendation',
  'siteCount',
  'zeroSites',
  'successorOf',
  'predecessorOf',
]);

function coverageProvenance({
  dataset,
  sourceUrl,
  retrievedAt = null,
  datasetVersion = null,
} = {}) {
  return officialDatasetProvenance({
    provider: COVERAGE_PROVIDER,
    dataset,
    sourceUrl,
    licence: COVERAGE_LICENCE,
    requiredAttribution: COVERAGE_ATTRIBUTION,
    releaseDate: null,
    datasetVersion,
    ingestedAt: null,
    geographicCoverage: COVERAGE_GEOGRAPHIC_SCOPE,
    limitations: COVERAGE_LIMITATIONS,
    sourceType: 'OFFICIAL',
  });
}

const LPA_IDENTITY_PROVENANCE = coverageProvenance({
  dataset: LPA_DATASET_LABEL,
  sourceUrl: LPA_SOURCE_URL,
  datasetVersion: LPA_DATASET,
});

const PROVIDER_INDEX_PROVENANCE = coverageProvenance({
  dataset: PROVIDER_INDEX_LABEL,
  sourceUrl: PROVIDER_INDEX_URL,
  datasetVersion: PROVIDER_INDEX_DATASET,
});

const ORGANISATION_RECORD_PROVENANCE = coverageProvenance({
  dataset: ORGANISATION_DATASET_LABEL,
  sourceUrl: 'https://www.planning.data.gov.uk/entity/',
  datasetVersion: 'organisation',
});

module.exports = {
  COVERAGE_SOURCE,
  COVERAGE_PROVIDER,
  COVERAGE_LICENCE,
  COVERAGE_GEOGRAPHIC_SCOPE,
  COVERAGE_FAMILY,
  COVERAGE_RUN_STATUS,
  BROWNFIELD_COVERAGE_STATE,
  COVERAGE_STATE_ORDER,
  LPA_DATASET,
  LPA_DATASET_LABEL,
  LPA_SOURCE_URL,
  LPA_ENTITY_SEARCH_URL,
  PROVIDER_INDEX_DATASET,
  PROVIDER_INDEX_LABEL,
  PROVIDER_INDEX_URL,
  ORGANISATION_DATASET_LABEL,
  ORGANISATION_ENTITY_URL_PREFIX,
  COVERAGE_ATTRIBUTION,
  COVERAGE_LIMITATIONS,
  FORBIDDEN_COVERAGE_INFERENCE_KEYS,
  coverageProvenance,
  LPA_IDENTITY_PROVENANCE,
  PROVIDER_INDEX_PROVENANCE,
  ORGANISATION_RECORD_PROVENANCE,
};
