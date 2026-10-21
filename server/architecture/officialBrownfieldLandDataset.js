/**
 * Official Brownfield Land register / development-site evidence contract.
 * MHCLG Planning Data dataset: brownfield-land (England).
 * Facts only — not applications pipeline, construction, delivery, or investment.
 */

const {
  officialDatasetProvenance,
  SHARED_LICENCE_LIMITATIONS,
  COVERAGE_STATE,
  MARKET_RECORD_KIND,
} = require('./officialMarketDataset');

const BROWNFIELD_SOURCE = 'MHCLG_PLANNING_DATA';
const BROWNFIELD_DATASET = 'brownfield-land';
const BROWNFIELD_DATASET_LABEL = 'Brownfield land';
const BROWNFIELD_SOURCE_PRODUCT = 'MHCLG Planning Data — brownfield-land entities';
/** Edition-family label for this evidence family — not a publication calendar date. */
const BROWNFIELD_RELEASE_LABEL = 'BROWNFIELD_LAND';
const BROWNFIELD_GEOGRAPHIC_SCOPE = 'England';
const BROWNFIELD_GEOGRAPHY_TYPE = 'SITE';
const BROWNFIELD_SOURCE_URL = 'https://www.planning.data.gov.uk/dataset/brownfield-land';
const BROWNFIELD_DOCS_URL = 'https://www.planning.data.gov.uk/docs';
const BROWNFIELD_API_ENTITY_URL = 'https://www.planning.data.gov.uk/entity.json?dataset=brownfield-land';

const BROWNFIELD_ATTRIBUTION =
  'Contains public sector information licensed under the Open Government Licence v3.0. '
  + '© Crown copyright and database right. Source: Ministry of Housing, Communities and Local Government — Planning Data (brownfield-land).';

const BROWNFIELD_DWELLING_NATURE = 'ESTIMATED_NET_DWELLING_CAPACITY';

const BROWNFIELD_LIMITATIONS = Object.freeze([
  ...SHARED_LICENCE_LIMITATIONS,
  'England only. Wales, Scotland and Northern Ireland are outside this Planning Data product.',
  'Provider/LPA coverage may be incomplete. The Planning Data platform does not claim complete England coverage.',
  'Absence of matching imported brownfield records does NOT prove that no brownfield land or development activity exists.',
  'A brownfield register site observation does NOT prove that development will occur.',
  'planningPermissionStatus / planningPermissionType do NOT prove construction has started or completed.',
  'minimumNetDwellings / maximumNetDwellings are ESTIMATED NET DWELLING CAPACITY from the register, not delivered homes, starts, or guaranteed future supply.',
  'ownershipStatus does NOT identify a developer, applicant, agent, or promoter.',
  'Site geometry/point proximity does NOT imply impact on a property or area.',
  'No growth, rental-demand, regeneration, opportunity, or investment inference is supported by this dataset alone.',
  'IngestedAt / retrievedAt are retrieval or import times. They are not source publication dates.',
  'Changed source content is retained as a distinct revision. The edition-family release label BROWNFIELD_LAND is not publication chronology and is not ordered lexically.',
  'Effective observation selection uses Planning Data entry-date only when present and unambiguous. Import order, ingest time, retrieval time, and database id are never used as publication chronology.',
  'When multiple changed revisions lack a defensible entry-date ordering, selection is AMBIGUOUS and no revision is presented as current fact.',
  'Licence text is product metadata, not a legal opinion and not a statement that commercial use for every product purpose is cleared.',
]);

const BROWNFIELD_SELECTION = Object.freeze({
  RESOLVED: 'RESOLVED',
  AMBIGUOUS: 'AMBIGUOUS',
  NONE: 'NONE',
});

const BROWNFIELD_PROVENANCE = officialDatasetProvenance({
  provider: 'Ministry of Housing, Communities and Local Government — Planning Data',
  dataset: BROWNFIELD_DATASET_LABEL,
  sourceUrl: BROWNFIELD_SOURCE_URL,
  licence: 'Open Government Licence v3.0',
  requiredAttribution: BROWNFIELD_ATTRIBUTION,
  releaseDate: null,
  datasetVersion: BROWNFIELD_RELEASE_LABEL,
  geographicCoverage: BROWNFIELD_GEOGRAPHIC_SCOPE,
  limitations: BROWNFIELD_LIMITATIONS,
});

const FORBIDDEN_BROWNFIELD_INFERENCE_KEYS = Object.freeze([
  'opportunityScore',
  'developmentScore',
  'regenerationScore',
  'growthScore',
  'investmentScore',
  'housingSupplyScore',
  'developerScore',
  'rank',
  'winner',
  'recommendation',
  'buyRecommendation',
  'letRecommendation',
  'underConstruction',
  'activeDevelopment',
  'deliveredHomes',
  'expectedDwellings',
  'midpointDwellings',
  'futureGrowth',
  'expectedGrowth',
  'rentalDemand',
  'developer',
  'goodArea',
  'badArea',
]);

module.exports = {
  BROWNFIELD_SOURCE,
  BROWNFIELD_DATASET,
  BROWNFIELD_DATASET_LABEL,
  BROWNFIELD_SOURCE_PRODUCT,
  BROWNFIELD_RELEASE_LABEL,
  BROWNFIELD_GEOGRAPHIC_SCOPE,
  BROWNFIELD_GEOGRAPHY_TYPE,
  BROWNFIELD_SOURCE_URL,
  BROWNFIELD_DOCS_URL,
  BROWNFIELD_API_ENTITY_URL,
  BROWNFIELD_ATTRIBUTION,
  BROWNFIELD_DWELLING_NATURE,
  BROWNFIELD_LIMITATIONS,
  BROWNFIELD_PROVENANCE,
  BROWNFIELD_SELECTION,
  FORBIDDEN_BROWNFIELD_INFERENCE_KEYS,
  COVERAGE_STATE,
  MARKET_RECORD_KIND,
};
