/**
 * Brownfield provider-attributed area evidence.
 *
 * Groups Brownfield observations by the statistical geography of their
 * provider organisation. It does NOT establish that each Brownfield site is
 * physically located within the requested LAD.
 *
 * Not wired into areaEvidenceProfile.v1. Not site-location intelligence.
 */

const {
  officialDatasetProvenance,
  SHARED_LICENCE_LIMITATIONS,
} = require('./officialMarketDataset');
const {
  PROVIDER_LAD_ATTRIBUTION_LIMITATIONS,
} = require('./officialBrownfieldProviderLadAttribution');

const PROVIDER_ATTRIBUTED_AREA_EVIDENCE_KIND = 'BROWNFIELD_PROVIDER_ATTRIBUTED_AREA_EVIDENCE';
const PROVIDER_ATTRIBUTED_ATTRIBUTION_BASIS = 'PROVIDER_STATISTICAL_GEOGRAPHY';

const PROVIDER_ATTRIBUTED_AREA_LIMITATIONS = Object.freeze([
  ...SHARED_LICENCE_LIMITATIONS,
  ...PROVIDER_LAD_ATTRIBUTION_LIMITATIONS,
  'The aggregation groups Brownfield observations by the statistical geography of their provider organisation.',
  'It does NOT establish that each Brownfield site is physically located within the requested LAD.',
  'resolvedProviderAttributedRecordCount is not a count of Brownfield sites physically in the LAD.',
  'Recorded Brownfield dwelling capacity is estimated register capacity. It is not approved homes, construction, completion, or guaranteed future supply.',
  'An end-date on a register record is not completion, delivery, failure, or removal.',
  'Zero provider-attributed records does not mean no Brownfield land exists in the LAD.',
  'Planning Data warns that Brownfield coverage may be incomplete and may not yet cover all of England.',
  'Providers with non-LAD statistical geography, missing geography, ambiguous geography, or no organisation record are excluded from LAD aggregation and are not assigned to a nearby LAD.',
  'Rows without organisation_entity cannot be attributed to a LAD by this method.',
  'Ambiguous revisions are excluded from factual aggregates and remain visible as ambiguousRecordCount.',
  'This evidence is area context. It is not an opportunity, regeneration, growth, or investment result.',
]);

const FORBIDDEN_PROVIDER_ATTRIBUTED_AREA_KEYS = Object.freeze([
  'siteCount',
  'sitesInLad',
  'futureHousingSupply',
  'approvedHomes',
  'plannedHomesDelivered',
  'homesComing',
  'developmentPipeline',
  'coveragePercentage',
  'completenessPercentage',
  'EnglandCoverage',
  'LpaCompleteness',
  'completeCoverage',
  'investmentOpportunity',
  'regenerationPotential',
  'developmentPotential',
  'growthPotential',
  'priceImpact',
  'rentImpact',
  'opportunityScore',
  'developmentScore',
  'regenerationScore',
  'rank',
  'winner',
  'recommendation',
  'buyRecommendation',
  'letRecommendation',
  'BUY',
  'AVOID',
]);

function providerAttributedAreaProvenance({
  ladCode = null,
  calculatedAt = null,
} = {}) {
  return {
    ...officialDatasetProvenance({
      provider: 'Ministry of Housing, Communities and Local Government — Planning Data',
      dataset: 'Brownfield provider-attributed area evidence',
      sourceUrl: 'https://www.planning.data.gov.uk/dataset/brownfield-land',
      licence: 'Open Government Licence v3.0',
      requiredAttribution:
        'Contains public sector information licensed under the Open Government Licence v3.0. '
        + '© Crown copyright and database right. Source: Ministry of Housing, Communities and Local Government — Planning Data.',
      releaseDate: null,
      datasetVersion: 'BROWNFIELD_LAND',
      geographicCoverage: 'England',
      limitations: PROVIDER_ATTRIBUTED_AREA_LIMITATIONS,
    }),
    requestedLadCode: ladCode,
    attributionBasis: PROVIDER_ATTRIBUTED_ATTRIBUTION_BASIS,
    effectiveSelection: 'phase_3b_source_entry_date',
    calculatedAt: calculatedAt || null,
    notSiteLocation: true,
  };
}

module.exports = {
  PROVIDER_ATTRIBUTED_AREA_EVIDENCE_KIND,
  PROVIDER_ATTRIBUTED_ATTRIBUTION_BASIS,
  PROVIDER_ATTRIBUTED_AREA_LIMITATIONS,
  FORBIDDEN_PROVIDER_ATTRIBUTED_AREA_KEYS,
  providerAttributedAreaProvenance,
};
