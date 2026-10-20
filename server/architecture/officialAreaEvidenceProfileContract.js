/**
 * Composition contract for Unified Area Evidence Profile v1.
 * Versions the profile envelope only — not individual dataset versions.
 */

const AREA_EVIDENCE_PROFILE_SCHEMA_VERSION = 'areaEvidenceProfile.v1';

const AREA_EVIDENCE_FAMILY = Object.freeze({
  GEOGRAPHY: 'geography',
  MARKET: 'market',
  POPULATION: 'population',
  DEPRIVATION: 'deprivation',
  HOUSING_TENURE: 'housing.tenure',
});

/** Deterministic familyStatus / unknowns ordering. */
const AREA_EVIDENCE_FAMILY_ORDER = Object.freeze([
  AREA_EVIDENCE_FAMILY.GEOGRAPHY,
  AREA_EVIDENCE_FAMILY.MARKET,
  AREA_EVIDENCE_FAMILY.POPULATION,
  AREA_EVIDENCE_FAMILY.DEPRIVATION,
  AREA_EVIDENCE_FAMILY.HOUSING_TENURE,
]);

const AREA_EVIDENCE_PROFILE_STATUS = Object.freeze({
  SUFFICIENT: 'SUFFICIENT',
  PARTIAL: 'PARTIAL',
  UNAVAILABLE: 'UNAVAILABLE',
  UNRESOLVED: 'UNRESOLVED',
});

/** Composer-only reason when a family producer throws/rejects after geography is resolved. */
const AREA_EVIDENCE_FAMILY_RUNTIME_REASON = 'family_runtime_error';

const AREA_EVIDENCE_FAILURE_KIND = Object.freeze({
  RUNTIME_EXCEPTION: 'RUNTIME_EXCEPTION',
});

const AREA_EVIDENCE_PROFILE_LIMITATIONS = Object.freeze([
  'Composition only. Evidence families may use different geography vintages; nationwide vintage alignment is not proven.',
  'Evidence families may represent different time periods. Historical evidence is not a forecast and is not current by default.',
  'Missing, not-imported, empty, or errored evidence is not zero and must not be treated as a measured absence.',
  'This profile is area evidence context. It is not an investment recommendation, area score, ranking, BUY/LET recommendation, or Opportunity Discovery result.',
  'localAuthorityCode and ukhpiGeographyCode are distinct identities and are not interchangeable. Transactions may remain postcode-scoped.',
]);

const FORBIDDEN_PROFILE_INFERENCE_KEYS = Object.freeze([
  'areaScore',
  'investmentScore',
  'growthScore',
  'BTLScore',
  'btlScore',
  'confidenceScore',
  'qualityScore',
  'opportunityScore',
  'rank',
  'winner',
  'recommendation',
  'buyRecommendation',
  'letRecommendation',
  'dataDate',
  'purchaseWinner',
  'goodArea',
  'badArea',
  'futureGrowth',
  'expectedGrowth',
  'rentalDemand',
]);

module.exports = {
  AREA_EVIDENCE_PROFILE_SCHEMA_VERSION,
  AREA_EVIDENCE_FAMILY,
  AREA_EVIDENCE_FAMILY_ORDER,
  AREA_EVIDENCE_PROFILE_STATUS,
  AREA_EVIDENCE_FAMILY_RUNTIME_REASON,
  AREA_EVIDENCE_FAILURE_KIND,
  AREA_EVIDENCE_PROFILE_LIMITATIONS,
  FORBIDDEN_PROFILE_INFERENCE_KEYS,
};
