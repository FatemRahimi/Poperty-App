/**
 * Official area / economic dataset contracts.
 * IoD LAD summaries are area context, not property facts or investment scores.
 */

const { officialDatasetProvenance, SHARED_LICENCE_LIMITATIONS, COVERAGE_STATE, MARKET_RECORD_KIND } = require('./officialMarketDataset');

const IOD2025_SOURCE = 'MHCLG_IOD_2025';
const IOD2025_DATASET = 'English Indices of Deprivation 2025';
const IOD2025_SOURCE_PRODUCT = 'File 10 v2 — Local Authority District summaries';
const IOD2025_RELEASE_LABEL = 'IoD2025_File10_v2';
const IOD2025_GEOGRAPHY_TYPE = 'LAD';
const IOD2025_GEOGRAPHY_VINTAGE = 'LAD_2024';
const IOD2025_SHEET_NAME = 'IMD';
const IOD2025_SOURCE_URL = 'https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025';
const IOD2025_FILE_URL = 'https://assets.publishing.service.gov.uk/media/6917412ebc34c86ce4e6e7fc/File_10_-_IoD2025_Local_Authority_District_Summaries__lower-tier__v2.xlsx';

const IOD2025_ATTRIBUTION =
  'Contains public sector information licensed under the Open Government Licence v3.0. Source: Ministry of Housing, Communities and Local Government — English Indices of Deprivation 2025 (File 10 v2).';

const IOD2025_LIMITATIONS = Object.freeze([
  ...SHARED_LICENCE_LIMITATIONS,
  'England only. Wales, Scotland and Northern Ireland are outside this IoD product.',
  'LAD-level area context only. Not property-level evidence and not a statement about one home.',
  'Relative deprivation statistics among English local authority districts. Rank 1 is most deprived on that summary measure, not “best” and not investment quality.',
  'A proportion of 0 means no LSOAs in the most deprived 10% nationally for that measure. It does not mean “no deprivation”.',
  'Not a house-price forecast and not an investment recommendation.',
  'IoD File 10 v2 uses LAD 2024 geography codes. Nationwide crosswalk vintage compatibility is not claimed from fixture matches alone.',
  'Licence text is product metadata, not a legal opinion and not a statement that commercial use for every product purpose is cleared.',
]);

const IOD2025_METRICS = Object.freeze({
  IMD_AVERAGE_SCORE: {
    id: 'imd_average_score',
    header: 'IMD - Average score',
    unit: 'SCORE',
    valueKind: 'SCORE',
  },
  IMD_RANK_OF_AVERAGE_SCORE: {
    id: 'imd_rank_of_average_score',
    header: 'IMD - Rank of average score',
    unit: 'RANK',
    valueKind: 'RANK',
    rankInterpretation: '1 = most deprived on that LAD summary measure',
  },
  IMD_PROPORTION_MOST_DEPRIVED_10: {
    id: 'imd_proportion_most_deprived_10',
    header: 'IMD - Proportion of LSOAs in most deprived 10% nationally',
    unit: 'RATIO',
    valueKind: 'PROPORTION',
  },
});

const IOD2025_HEADERS = Object.freeze({
  geographyCode: 'Local Authority District code (2024)',
  geographyName: 'Local Authority District name (2024)',
  averageScore: IOD2025_METRICS.IMD_AVERAGE_SCORE.header,
  rankOfAverageScore: IOD2025_METRICS.IMD_RANK_OF_AVERAGE_SCORE.header,
  proportionMostDeprived10: IOD2025_METRICS.IMD_PROPORTION_MOST_DEPRIVED_10.header,
});

const IOD2025_PROVENANCE = officialDatasetProvenance({
  provider: 'Ministry of Housing, Communities and Local Government',
  dataset: IOD2025_DATASET,
  sourceUrl: IOD2025_SOURCE_URL,
  licence: 'Open Government Licence v3.0',
  requiredAttribution: IOD2025_ATTRIBUTION,
  releaseDate: '2025-10-30',
  datasetVersion: IOD2025_RELEASE_LABEL,
  geographicCoverage: 'England',
  limitations: IOD2025_LIMITATIONS,
});

function isEnglandLadGssCode(value) {
  return /^E\d{8}$/.test(String(value || '').trim());
}

function isLadGssCode(value) {
  return /^[EWSN]\d{8}$/.test(String(value || '').trim());
}

const ONS_MYE_SOURCE = 'ONS_MID_YEAR_POPULATION_ESTIMATES';
const ONS_MYE_DATASET = 'Mid-year population estimates';
const ONS_MYE_SOURCE_PRODUCT = 'Explore Local Statistics — population-count ltla CSV (total usual residents)';
/** Edition-family label for mid-2024 observations — NOT the ONS publication calendar date. */
const ONS_MYE_RELEASE_LABEL = 'MYE_MID_2024';
/** Mid-year population reference date (30 June). Distinct from publication/release date. */
const ONS_MYE_REFERENCE_PERIOD = '2024-06-30';
/**
 * Authoritative publication date for the implemented Explore Local Statistics
 * population-count (ltla) extract: ONS ELS indicator page “published 26 September 2025”,
 * aligned with the UK mid-2024 MYE bulletin release date (26 September 2025).
 */
const ONS_MYE_RELEASE_DATE = '2025-09-26';
const ONS_MYE_GEOGRAPHY_TYPE = 'LAD';
const ONS_MYE_GEOGRAPHY_VINTAGE = 'LTLA_MID_2024';
const ONS_MYE_INDICATOR = 'Total population';
const ONS_MYE_SOURCE_URL = 'https://www.ons.gov.uk/Peoplepopulationandcommunity/Populationandmigration/Populationestimates/Datasets/Populationestimatesforukenglandandwalesscotlandandnorthernireland';
const ONS_MYE_ELS_INDICATOR_URL = 'https://www.ons.gov.uk/explore-local-statistics/indicators/population-count';
const ONS_MYE_UK_BULLETIN_URL = 'https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/bulletins/annualmidyearpopulationestimates/mid2024';
const ONS_MYE_EDITIONS_URL = 'https://www.ons.gov.uk/datasets/mid-year-pop-est/editions';

const ONS_MYE_ATTRIBUTION =
  'Contains public sector information licensed under the Open Government Licence v3.0. Source: Office for National Statistics — Mid-year population estimates (total usual residents).';

const ONS_MYE_LIMITATIONS = Object.freeze([
  ...SHARED_LICENCE_LIMITATIONS,
  'Values are mid-year population ESTIMATES of usual residents, not Census counts and not an exact headcount.',
  'LAD/ltla-level area context only. Not property-level evidence and not a statement about one home.',
  'Not a house-price forecast, rental-demand measure, or investment recommendation.',
  'Population size or change must not be treated as property-price growth or investment attractiveness.',
  'Phase 2B v1 stores official observations only. App-derived population growth is not calculated here.',
  'observationDate / referencePeriod is the mid-year population reference date (30 June). It is not the dataset publication date.',
  'provenance.releaseDate is the Explore Local Statistics / UK mid-2024 MYE publication date (2025-09-26). It is not the mid-year reference date.',
  'releaseLabel MYE_MID_2024 names the mid-2024 observation edition family. It is not a publication calendar date and does not by itself encode revision chronology.',
  'Geography vintage is release/edition specific. Nationwide crosswalk vintage compatibility is not claimed from fixture matches alone.',
  'Licence text is product metadata, not a legal opinion and not a statement that commercial use for every product purpose is cleared.',
]);

const ONS_MYE_METRICS = Object.freeze({
  TOTAL_USUAL_RESIDENT_POPULATION: {
    id: 'total_usual_resident_population',
    indicator: ONS_MYE_INDICATOR,
    unit: 'PERSONS',
    valueKind: 'ESTIMATE_COUNT',
  },
});

const ONS_MYE_HEADERS = Object.freeze({
  indicator: 'indicator',
  geographyCode: 'areacd',
  geographyName: 'areanm',
  period: 'period',
  value: 'value',
});

const ONS_MYE_PROVENANCE = officialDatasetProvenance({
  provider: 'Office for National Statistics',
  dataset: ONS_MYE_DATASET,
  sourceUrl: ONS_MYE_ELS_INDICATOR_URL,
  licence: 'Open Government Licence v3.0',
  requiredAttribution: ONS_MYE_ATTRIBUTION,
  releaseDate: ONS_MYE_RELEASE_DATE,
  datasetVersion: ONS_MYE_RELEASE_LABEL,
  geographicCoverage: 'United Kingdom local authorities (ltla) as published in the selected extract',
  limitations: ONS_MYE_LIMITATIONS,
});

module.exports = {
  COVERAGE_STATE,
  MARKET_RECORD_KIND,
  IOD2025_SOURCE,
  IOD2025_DATASET,
  IOD2025_SOURCE_PRODUCT,
  IOD2025_RELEASE_LABEL,
  IOD2025_GEOGRAPHY_TYPE,
  IOD2025_GEOGRAPHY_VINTAGE,
  IOD2025_SHEET_NAME,
  IOD2025_SOURCE_URL,
  IOD2025_FILE_URL,
  IOD2025_ATTRIBUTION,
  IOD2025_LIMITATIONS,
  IOD2025_METRICS,
  IOD2025_HEADERS,
  IOD2025_PROVENANCE,
  isEnglandLadGssCode,
  isLadGssCode,
  ONS_MYE_SOURCE,
  ONS_MYE_DATASET,
  ONS_MYE_SOURCE_PRODUCT,
  ONS_MYE_RELEASE_LABEL,
  ONS_MYE_REFERENCE_PERIOD,
  ONS_MYE_RELEASE_DATE,
  ONS_MYE_GEOGRAPHY_TYPE,
  ONS_MYE_GEOGRAPHY_VINTAGE,
  ONS_MYE_INDICATOR,
  ONS_MYE_SOURCE_URL,
  ONS_MYE_ELS_INDICATOR_URL,
  ONS_MYE_UK_BULLETIN_URL,
  ONS_MYE_EDITIONS_URL,
  ONS_MYE_ATTRIBUTION,
  ONS_MYE_LIMITATIONS,
  ONS_MYE_METRICS,
  ONS_MYE_HEADERS,
  ONS_MYE_PROVENANCE,
};
