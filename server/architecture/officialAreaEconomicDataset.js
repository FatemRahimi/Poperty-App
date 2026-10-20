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
};
