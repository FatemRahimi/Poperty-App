/**
 * Provenance and coverage for official market datasets.
 * Metadata only. Not a legal opinion and not an analytics result.
 */

const { HMLR_OGL_ATTRIBUTION, SOURCE_GEOGRAPHY } = require('./officialSaleTransaction');

const COVERAGE_STATE = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  EMPTY: 'EMPTY',
  NOT_IMPORTED: 'NOT_IMPORTED',
  STALE: 'STALE',
  ERROR: 'ERROR',
});

const DATASET_ID = Object.freeze({
  HMLR_PRICE_PAID: 'HMLR_PRICE_PAID_DATA',
  UKHPI: 'UK_HOUSE_PRICE_INDEX',
});

function officialDatasetProvenance({
  provider,
  dataset,
  sourceType = 'OFFICIAL',
  sourceUrl = null,
  licence = null,
  requiredAttribution = null,
  releaseDate = null,
  datasetVersion = null,
  ingestedAt = null,
  geographicCoverage = null,
  limitations = [],
} = {}) {
  return {
    provider: provider || null,
    dataset: dataset || null,
    sourceType,
    sourceUrl,
    licence,
    requiredAttribution,
    releaseDate,
    datasetVersion,
    ingestedAt,
    geographicCoverage,
    limitations: Array.isArray(limitations) ? limitations.slice() : [],
    notLegalAdvice: true,
    notACommercialClearance: true,
  };
}

const SHARED_LICENCE_LIMITATIONS = Object.freeze([
  'Licence text is product metadata, not a legal opinion and not a statement that commercial use is unrestricted.',
  'Third-party rights may apply to some source fields.',
]);

const HMLR_PRICE_PAID_PROVENANCE = officialDatasetProvenance({
  provider: 'HM Land Registry',
  dataset: 'Price Paid Data',
  sourceUrl: 'https://www.gov.uk/government/collections/price-paid-data',
  licence: 'Open Government Licence v3.0',
  requiredAttribution: HMLR_OGL_ATTRIBUTION,
  geographicCoverage: SOURCE_GEOGRAPHY,
  limitations: [
    ...SHARED_LICENCE_LIMITATIONS,
    'Address columns already stored on official_sale_transactions (paon, saon, street, locality, town_city, district, county) may include third-party rights. This store is not a national gazetteer. Market analytics must not depend on those address fields.',
    'An import that has not run is not evidence that no sales occurred.',
  ],
});

const UKHPI_PROVENANCE = officialDatasetProvenance({
  provider: 'HM Land Registry',
  dataset: 'UK House Price Index',
  sourceUrl: 'https://www.gov.uk/government/collections/uk-house-price-index-reports',
  licence: 'Open Government Licence v3.0',
  requiredAttribution: HMLR_OGL_ATTRIBUTION,
  geographicCoverage: 'United Kingdom',
  limitations: [
    ...SHARED_LICENCE_LIMITATIONS,
    'UKHPI observations are not individual sale transactions and are not a valuation of one home.',
    'A missing index, average price, or percentage change is unknown. It is not zero.',
  ],
});

function classifyImportCoverage({
  latestRun = null,
  ingestedAt = null,
  staleAfterMs = null,
  now = Date.now(),
} = {}) {
  if (!latestRun) {
    return {
      state: COVERAGE_STATE.NOT_IMPORTED,
      proofOfNoSales: false,
      proofOfZeroGrowth: false,
    };
  }
  const status = String(latestRun.status || '');
  if (status === 'FAILED' || status === 'ERROR') {
    return {
      state: COVERAGE_STATE.ERROR,
      proofOfNoSales: false,
      proofOfZeroGrowth: false,
    };
  }
  if (status !== 'SUCCEEDED') {
    return {
      state: COVERAGE_STATE.NOT_IMPORTED,
      proofOfNoSales: false,
      proofOfZeroGrowth: false,
    };
  }
  const accepted = Number(latestRun.inserted_count || 0)
    + Number(latestRun.updated_count || 0)
    + Number(latestRun.unchanged_count || 0);
  const finishedAt = ingestedAt || latestRun.finished_at || latestRun.ingested_at || null;
  if (staleAfterMs != null && finishedAt) {
    const age = now - new Date(finishedAt).getTime();
    if (Number.isFinite(age) && age > staleAfterMs) {
      return {
        state: COVERAGE_STATE.STALE,
        acceptedCount: accepted,
        proofOfNoSales: false,
        proofOfZeroGrowth: false,
      };
    }
  }
  if (accepted <= 0) {
    return {
      state: COVERAGE_STATE.EMPTY,
      acceptedCount: 0,
      proofOfNoSales: false,
      proofOfZeroGrowth: false,
    };
  }
  return {
    state: COVERAGE_STATE.AVAILABLE,
    acceptedCount: accepted,
    proofOfNoSales: false,
    proofOfZeroGrowth: false,
  };
}

function annualChangeFromObservation(observation) {
  if (!observation || observation.annualChange == null || observation.annualChange === '') return null;
  const value = Number(observation.annualChange);
  return Number.isFinite(value) ? value : null;
}

module.exports = {
  COVERAGE_STATE,
  DATASET_ID,
  SHARED_LICENCE_LIMITATIONS,
  HMLR_PRICE_PAID_PROVENANCE,
  UKHPI_PROVENANCE,
  officialDatasetProvenance,
  classifyImportCoverage,
  annualChangeFromObservation,
};
