/**
 * Deterministic historical market evidence from stored official observations.
 * Derived percentages are not official UKHPI rows, forecasts, or recommendations.
 */

const { MARKET_RECORD_KIND, classifyImportCoverage } = require('../../architecture/officialMarketDataset');
const { toCanonicalTransaction } = require('../../architecture/officialSaleTransaction');
const { canonicalPostcode } = require('./canonicalPostcode');
const { parseIsoDate } = require('./hmlrPricePaidParser');

const CALCULATION_METHOD = 'observed_to_observed';
const MIN_MEDIAN_SAMPLE = 5;
const HORIZONS = Object.freeze([
  { id: 'oneYear', years: 1, label: '1Y' },
  { id: 'threeYear', years: 3, label: '3Y' },
  { id: 'fiveYear', years: 5, label: '5Y' },
]);

const ANALYTICS_LIMITATIONS = Object.freeze([
  'A historical index change is not a forecast and not an investment recommendation.',
  'Postcode sale evidence is not local-authority UKHPI evidence.',
  'A local-authority index does not describe an individual home.',
  'Licence text is product metadata, not a legal opinion.',
]);

const SUFFICIENCY = Object.freeze({
  SUFFICIENT: 'SUFFICIENT',
  INSUFFICIENT: 'INSUFFICIENT',
  UNAVAILABLE: 'UNAVAILABLE',
  UNRESOLVED: 'UNRESOLVED',
});

function addMonths(isoDate, months) {
  const [year, month, day] = String(isoDate).slice(0, 10).split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, day));
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${mm}-${dd}`;
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

function observedPercentChange(startIndex, endIndex) {
  return round6(((endIndex / startIndex) - 1) * 100);
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function usableIndex(value, role) {
  if (value == null || value === '') return { ok: false, reason: role === 'start' ? 'null_index' : 'null_index' };
  const number = Number(value);
  if (!Number.isFinite(number)) return { ok: false, reason: 'null_index' };
  if (role === 'start' && number === 0) return { ok: false, reason: 'zero_denominator' };
  return { ok: true, value: number };
}

function observationRef(row) {
  return {
    recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
    source: row.source || 'UK_HOUSE_PRICE_INDEX',
    dataset: row.dataset || 'UK House Price Index',
    geographyCode: row.geographyCode,
    propertyCategory: row.propertyCategory,
    observationDate: row.observationDate,
    indexValue: row.indexValue,
    releaseLabel: row.releaseLabel || null,
    datasetVersion: row.provenance?.datasetVersion || row.releaseLabel || null,
    contentFingerprint: row.contentFingerprint || null,
  };
}

function unavailableHorizon(horizon, reason, extra = {}) {
  const status = reason === 'ambiguous_official_release'
    ? SUFFICIENCY.UNRESOLVED
    : (reason === 'dataset_not_imported' || reason === 'coverage_error' || reason === 'dataset_empty')
      ? SUFFICIENCY.UNAVAILABLE
      : SUFFICIENCY.INSUFFICIENT;
  return {
    recordKind: MARKET_RECORD_KIND.DERIVED_METRIC,
    factClass: 'DERIVED',
    metric: `ukhpi_index_change_${horizon.label}`,
    horizon: horizon.label,
    status,
    value: null,
    percentageChange: null,
    unit: 'PERCENT',
    startDate: extra.startDate || null,
    endDate: extra.endDate || null,
    startIndex: extra.startIndex == null ? null : extra.startIndex,
    endIndex: extra.endIndex == null ? null : extra.endIndex,
    calculationMethod: CALCULATION_METHOD,
    observationsUsed: extra.observationsUsed || [],
    coverage: extra.coverage || null,
    sufficiency: { state: status, reason },
    provenance: extra.provenance || null,
    limitations: ANALYTICS_LIMITATIONS.slice(),
    geographyCode: extra.geographyCode || null,
    propertyCategory: extra.propertyCategory || null,
  };
}

function trailingTwelveMonths(asOf) {
  const end = String(asOf).slice(0, 10);
  const start = addMonths(end, -12);
  const [year, month, day] = start.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return {
    start: `${next.getUTCFullYear()}-${mm}-${dd}`,
    end,
    policy: 'trailing_12_months_inclusive',
  };
}

function ambiguousDates(query) {
  const dates = new Set();
  (query.ambiguous || []).forEach((group) => {
    (group.records || []).forEach((row) => {
      if (row.observationDate) dates.add(String(row.observationDate).slice(0, 10));
    });
  });
  return dates;
}

function hpiHorizons({ query, geographyCode, propertyCategory }) {
  const coverage = query.datasetCoverage || null;
  const base = { coverage, geographyCode, propertyCategory };
  if (!query || coverage?.state === 'NOT_IMPORTED') {
    return mapHorizons((horizon) => unavailableHorizon(horizon, 'dataset_not_imported', base));
  }
  if (coverage?.state === 'ERROR') {
    return mapHorizons((horizon) => unavailableHorizon(horizon, 'coverage_error', base));
  }
  if (coverage?.state === 'EMPTY') {
    return mapHorizons((horizon) => unavailableHorizon(horizon, 'dataset_empty', base));
  }
  const blocked = ambiguousDates(query);
  const series = (query.observations || []).filter((row) => (
    row.geographyCode === geographyCode
    && (row.propertyCategory || 'all') === propertyCategory
    && !blocked.has(String(row.observationDate).slice(0, 10))
  ));
  if (!series.length) {
    const reason = (query.ambiguous || []).length ? 'ambiguous_official_release' : 'missing_end_observation';
    return mapHorizons((horizon) => unavailableHorizon(horizon, reason, base));
  }
  const endDate = series.map((row) => String(row.observationDate).slice(0, 10)).sort().pop();
  const byDate = new Map(series.map((row) => [String(row.observationDate).slice(0, 10), row]));
  const endRow = byDate.get(endDate);
  return mapHorizons((horizon) => {
    const startDate = addMonths(endDate, horizon.years * -12);
    if (blocked.has(startDate) || blocked.has(endDate)) {
      return unavailableHorizon(horizon, 'ambiguous_official_release', { ...base, startDate, endDate });
    }
    const startRow = byDate.get(startDate);
    if (!startRow) {
      return unavailableHorizon(horizon, 'missing_start_observation', {
        ...base,
        startDate,
        endDate,
        observationsUsed: [observationRef(endRow)],
      });
    }
    if (startRow.geographyCode !== endRow.geographyCode || (startRow.propertyCategory || 'all') !== (endRow.propertyCategory || 'all')) {
      return unavailableHorizon(horizon, 'incompatible_series', { ...base, startDate, endDate });
    }
    const endIndex = usableIndex(endRow.indexValue, 'end');
    const startIndex = usableIndex(startRow.indexValue, 'start');
    if (!endIndex.ok) {
      return unavailableHorizon(horizon, endIndex.reason, {
        ...base,
        startDate,
        endDate,
        observationsUsed: [observationRef(startRow), observationRef(endRow)],
      });
    }
    if (!startIndex.ok) {
      return unavailableHorizon(horizon, startIndex.reason, {
        ...base,
        startDate,
        endDate,
        endIndex: endIndex.value,
        observationsUsed: [observationRef(startRow), observationRef(endRow)],
      });
    }
    const percentageChange = observedPercentChange(startIndex.value, endIndex.value);
    const observationsUsed = [observationRef(startRow), observationRef(endRow)];
    return {
      recordKind: MARKET_RECORD_KIND.DERIVED_METRIC,
      factClass: 'DERIVED',
      metric: `ukhpi_index_change_${horizon.label}`,
      horizon: horizon.label,
      status: SUFFICIENCY.SUFFICIENT,
      value: percentageChange,
      percentageChange,
      unit: 'PERCENT',
      startDate,
      endDate,
      startIndex: startIndex.value,
      endIndex: endIndex.value,
      calculationMethod: CALCULATION_METHOD,
      observationsUsed,
      coverage,
      sufficiency: { state: SUFFICIENCY.SUFFICIENT, reason: null },
      provenance: {
        dataset: 'UK House Price Index',
        geographyCode,
        propertyCategory,
        startRelease: startRow.releaseLabel || null,
        endRelease: endRow.releaseLabel || null,
        calculationMethod: CALCULATION_METHOD,
      },
      limitations: ANALYTICS_LIMITATIONS.slice(),
      geographyCode,
      propertyCategory,
    };
  });
}

function mapHorizons(builder) {
  const hpi = { endDate: null };
  HORIZONS.forEach((horizon) => {
    hpi[horizon.id] = builder(horizon);
  });
  hpi.endDate = hpi.oneYear.endDate || hpi.threeYear.endDate || hpi.fiveYear.endDate || null;
  return hpi;
}

function isUsableTransaction(row) {
  if (!row || row.live === false || row.record_status === 'D') return false;
  if (row.source_transaction_id == null || String(row.source_transaction_id).trim() === '') return false;
  return Boolean(parseIsoDate(row.transfer_date));
}

function priceForMedian(row) {
  const canonical = toCanonicalTransaction(row);
  if (!canonical.pricePresent) return null;
  return canonical.priceGbp;
}

async function saleRows(store, compact) {
  if (!store) return [];
  if (typeof store.snapshot === 'function') {
    return store.snapshot().filter((row) => row.live !== false && row.postcode_compact === compact);
  }
  if (typeof store.findLiveByPostcode === 'function') {
    return store.findLiveByPostcode(compact, { limit: 100000 });
  }
  return [];
}

async function saleCoverage(store) {
  if (!store || typeof store.latestRun !== 'function') {
    return { state: 'NOT_IMPORTED', proofOfNoSales: false };
  }
  const latest = await store.latestRun();
  let coverage = classifyImportCoverage({ latestRun: latest });
  if (coverage.state === 'EMPTY' && typeof store.snapshot === 'function' && store.snapshot().length > 0) {
    coverage = { ...coverage, state: 'AVAILABLE', acceptedCount: store.snapshot().length };
  }
  return coverage;
}

async function transactionActivity({ store, postcode, asOf }) {
  const parsed = canonicalPostcode(postcode);
  const subject = {
    scope: 'POSTCODE',
    postcode: parsed.ok ? parsed.normalized : null,
    sourceGeography: 'England and Wales',
  };
  if (!asOf) {
    return unavailableTransactions(subject, null, null, 'period_not_specified');
  }
  const period = trailingTwelveMonths(asOf);
  const coverage = await saleCoverage(store);
  if (!parsed.ok) {
    return unavailableTransactions(subject, period, coverage, 'invalid_postcode');
  }
  if (coverage.state === 'NOT_IMPORTED') return unavailableTransactions(subject, period, coverage, 'dataset_not_imported');
  if (coverage.state === 'ERROR') return unavailableTransactions(subject, period, coverage, 'coverage_error');
  if (coverage.state === 'EMPTY') return unavailableTransactions(subject, period, coverage, 'dataset_empty');
  const rows = (await saleRows(store, parsed.compact)).filter((row) => {
    const date = parseIsoDate(row.transfer_date);
    return isUsableTransaction(row) && date >= period.start && date <= period.end;
  });
  const prices = rows.map(priceForMedian).filter((price) => price != null);
  const transactionCount = rows.length;
  const priceSampleCount = prices.length;
  const medianValue = priceSampleCount ? median(prices) : null;
  const medianSufficiency = priceSampleCount >= MIN_MEDIAN_SAMPLE
    ? { state: SUFFICIENCY.SUFFICIENT, reason: null }
    : { state: SUFFICIENCY.INSUFFICIENT, reason: 'insufficient_price_sample' };
  const provenance = {
    dataset: 'Price Paid Data',
    source: 'HMLR_PRICE_PAID_DATA',
    postcode: parsed.normalized,
    period,
    transactionCount,
    priceSampleCount,
    calculationMethod: 'median_actual_sold_price',
    medianSufficiency,
  };
  return {
    recordKind: 'FACT',
    factClass: 'FACT',
    ...subject,
    period,
    transactionCount,
    priceSampleCount,
    count: transactionCount,
    countAliasOf: 'transactionCount',
    sampleCount: priceSampleCount,
    sampleCountAliasOf: 'priceSampleCount',
    medianSoldPrice: medianValue,
    medianUnit: 'GBP',
    medianRecordKind: MARKET_RECORD_KIND.DERIVED_METRIC,
    medianFactClass: 'DERIVED',
    status: SUFFICIENCY.SUFFICIENT,
    sufficiency: {
      transactions: {
        state: SUFFICIENCY.SUFFICIENT,
        reason: transactionCount === 0 ? 'no_matching_transactions' : null,
      },
      count: {
        state: SUFFICIENCY.SUFFICIENT,
        reason: transactionCount === 0 ? 'no_matching_transactions' : null,
      },
      median: medianSufficiency,
    },
    calculationMethod: 'live_official_sales_in_period',
    provenance,
    coverage,
    limitations: ANALYTICS_LIMITATIONS.slice(),
    medianEvidence: {
      recordKind: MARKET_RECORD_KIND.DERIVED_METRIC,
      factClass: 'DERIVED',
      metric: 'median_sold_price',
      value: medianValue,
      unit: 'GBP',
      transactionCount,
      priceSampleCount,
      calculationMethod: 'median_actual_sold_price',
      sufficiency: medianSufficiency,
      provenance,
      limitations: ANALYTICS_LIMITATIONS.slice(),
    },
  };
}

function unavailableTransactions(subject, period, coverage, reason) {
  return {
    recordKind: 'FACT',
    factClass: 'FACT',
    ...subject,
    period,
    transactionCount: null,
    priceSampleCount: null,
    count: null,
    countAliasOf: 'transactionCount',
    sampleCount: null,
    sampleCountAliasOf: 'priceSampleCount',
    medianSoldPrice: null,
    medianUnit: 'GBP',
    medianRecordKind: MARKET_RECORD_KIND.DERIVED_METRIC,
    medianFactClass: 'DERIVED',
    medianEvidence: null,
    status: SUFFICIENCY.UNAVAILABLE,
    sufficiency: { state: SUFFICIENCY.UNAVAILABLE, reason },
    calculationMethod: 'live_official_sales_in_period',
    provenance: {
      dataset: 'Price Paid Data',
      source: 'HMLR_PRICE_PAID_DATA',
      postcode: subject.postcode,
      period,
      transactionCount: null,
      priceSampleCount: null,
      calculationMethod: 'median_actual_sold_price',
      medianSufficiency: { state: SUFFICIENCY.UNAVAILABLE, reason },
    },
    coverage,
    limitations: ANALYTICS_LIMITATIONS.slice(),
  };
}

function benchmarkHorizon(area, bench) {
  if (!area || !bench) return { status: SUFFICIENCY.UNAVAILABLE, differencePercentagePoints: null, reason: 'benchmark_not_requested' };
  if (area.status === SUFFICIENCY.UNRESOLVED || bench.status === SUFFICIENCY.UNRESOLVED) {
    return { status: SUFFICIENCY.UNRESOLVED, differencePercentagePoints: null, reason: 'ambiguous_official_release', area, benchmark: bench };
  }
  if (area.status !== SUFFICIENCY.SUFFICIENT || bench.status !== SUFFICIENCY.SUFFICIENT) {
    return { status: SUFFICIENCY.INSUFFICIENT, differencePercentagePoints: null, reason: 'missing_benchmark_observation', area, benchmark: bench };
  }
  if (area.startDate !== bench.startDate || area.endDate !== bench.endDate || area.propertyCategory !== bench.propertyCategory) {
    return { status: SUFFICIENCY.INSUFFICIENT, differencePercentagePoints: null, reason: 'incompatible_period', area, benchmark: bench };
  }
  return {
    recordKind: MARKET_RECORD_KIND.DERIVED_METRIC,
    factClass: 'DERIVED',
    status: SUFFICIENCY.SUFFICIENT,
    metric: `ukhpi_index_change_difference_${area.horizon}`,
    unit: 'PERCENTAGE_POINTS',
    value: round6(area.percentageChange - bench.percentageChange),
    differencePercentagePoints: round6(area.percentageChange - bench.percentageChange),
    areaPercentageChange: area.percentageChange,
    benchmarkPercentageChange: bench.percentageChange,
    horizon: area.horizon,
    startDate: area.startDate,
    endDate: area.endDate,
    propertyCategory: area.propertyCategory,
    calculationMethod: 'observed_to_observed_difference',
    observationsUsed: [...area.observationsUsed, ...bench.observationsUsed],
    sufficiency: { state: SUFFICIENCY.SUFFICIENT, reason: null },
    limitations: ANALYTICS_LIMITATIONS.slice(),
  };
}

async function analyseOfficialMarket({
  ukhpiStore,
  saleStore = null,
  geographyCode,
  geographyName = null,
  geographyType = null,
  propertyCategory = 'all',
  postcode = null,
  asOf = null,
  benchmarkGeographyCode = null,
  benchmarkPropertyCategory = null,
} = {}) {
  const category = propertyCategory || 'all';
  const query = ukhpiStore
    ? await ukhpiStore.queryObservations({
      geographyCode,
      propertyCategory: category,
      selection: 'effective',
    })
    : { observations: [], ambiguous: [], datasetCoverage: { state: 'NOT_IMPORTED' }, effectiveSelection: 'NONE' };
  const hpi = hpiHorizons({ query, geographyCode, propertyCategory: category });
  let benchmark = { status: SUFFICIENCY.UNAVAILABLE, reason: 'benchmark_not_requested', horizons: null };
  if (benchmarkGeographyCode) {
    if (benchmarkPropertyCategory && benchmarkPropertyCategory !== category) {
      benchmark = {
        status: 'UNAVAILABLE',
        reason: 'incompatible_category',
        geographyCode: benchmarkGeographyCode,
        horizons: null,
      };
    } else if (benchmarkGeographyCode === geographyCode) {
      benchmark = { status: 'UNAVAILABLE', reason: 'benchmark_not_distinct', horizons: null, geographyCode: benchmarkGeographyCode };
    } else {
      const benchQuery = await ukhpiStore.queryObservations({
        geographyCode: benchmarkGeographyCode,
        propertyCategory: category,
        selection: 'effective',
      });
      const benchHpi = hpiHorizons({
        query: benchQuery,
        geographyCode: benchmarkGeographyCode,
        propertyCategory: category,
      });
      const horizons = {
        oneYear: benchmarkHorizon(hpi.oneYear, benchHpi.oneYear),
        threeYear: benchmarkHorizon(hpi.threeYear, benchHpi.threeYear),
        fiveYear: benchmarkHorizon(hpi.fiveYear, benchHpi.fiveYear),
      };
      benchmark = {
        status: Object.values(horizons).some((item) => item.status === SUFFICIENCY.SUFFICIENT) ? 'AVAILABLE' : 'UNAVAILABLE',
        geographyCode: benchmarkGeographyCode,
        propertyCategory: category,
        scope: 'UKHPI_GEOGRAPHY',
        horizons,
      };
    }
  }
  const transactions = await transactionActivity({ store: saleStore, postcode, asOf });
  const evidence = [hpi.oneYear, hpi.threeYear, hpi.fiveYear];
  if (benchmark.horizons) evidence.push(benchmark.horizons.oneYear, benchmark.horizons.threeYear, benchmark.horizons.fiveYear);
  evidence.push(transactions);
  if (transactions.medianEvidence) evidence.push(transactions.medianEvidence);
  return {
    recordKind: MARKET_RECORD_KIND.DERIVED_METRIC,
    subject: {
      geographyCode: geographyCode || null,
      geographyName,
      geographyType,
      propertyCategory: category,
      postcode: transactions.postcode || null,
      hpiScope: 'UKHPI_GEOGRAPHY',
      transactionScope: postcode ? 'POSTCODE' : null,
    },
    hpi,
    transactions,
    benchmark,
    evidence,
    coverage: {
      ukhpi: query.datasetCoverage || { state: 'NOT_IMPORTED' },
      hmlr: transactions.coverage || { state: 'NOT_IMPORTED' },
    },
    limitations: ANALYTICS_LIMITATIONS.slice(),
    provenance: evidence.map((item) => item.provenance).filter(Boolean),
  };
}

module.exports = {
  ANALYTICS_LIMITATIONS,
  CALCULATION_METHOD,
  HORIZONS,
  MIN_MEDIAN_SAMPLE,
  SUFFICIENCY,
  addMonths,
  analyseOfficialMarket,
  median,
  observedPercentChange,
  trailingTwelveMonths,
};
