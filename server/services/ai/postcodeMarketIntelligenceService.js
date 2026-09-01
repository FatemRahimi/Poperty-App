/**
 * Postcode Property Intelligence — area market overview (deterministic).
 *
 * External authoritative data (PropertyData / HM Land Registry) takes priority.
 * Internal marketplace listings supplement only — never presented as the full postcode market.
 *
 * Reuses: ProviderRegistry, propertyDataParsers, comparableEngine stats, dataQualityEngine.
 */

const pool = require('../../models/db');
const { normalisePostcode } = require('../../utils/ukAddress');
const { compactPostcode } = require('./propertyIntelligenceSearch');
const { getMonthlyRent } = require('./propertyDataAggregator');
const { assessDataQuality } = require('./dataQualityEngine');
const { assessAreaEvidenceConfidence } = require('./confidenceEngine');
const { isExternalEnrichmentAvailable } = require('../../config/propertyIntelligence.config');
const { getProviderRegistry } = require('../providers/ProviderRegistry');
const {
  parseSoldPricesStats,
  parseSoldPricesPerSqf,
  parseSoldTransactionsFromPayload,
  parseRentsResponse,
  buildRentalEvidence,
  parseDemandResponse,
  buildMarketDemandEvidence,
  parseDemandRentResponse,
  buildRentalDemandEvidence,
} = require('../providers/propertyData/propertyDataParsers');

const COMMERCIAL_PATTERN = /commercial|office|retail|industrial|warehouse|shop|unit/i;

function median(values) {
  const nums = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2);
}

function minMax(values) {
  const nums = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!nums.length) return { min: null, max: null };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function roundPct(n) {
  return n != null && Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function normalizeListingCategory(category) {
  const c = String(category || '').toLowerCase();
  if (c === 'sale' || c === 'buy') return 'sale';
  if (c === 'rent') return 'rent';
  if (c === 'lease') return 'lease';
  return c || 'unknown';
}

function isCommercialListing(row) {
  if (normalizeListingCategory(row.category) === 'lease') return true;
  const type = `${row.property_type || ''} ${row.property_category || ''}`;
  return COMMERCIAL_PATTERN.test(type);
}

function normalizePropertyTypeLabel(type) {
  const t = String(type || '').toLowerCase();
  if (/flat|apartment|maisonette|studio|penthouse/.test(t)) return 'flat';
  if (/terraced|terrace/.test(t)) return 'terraced house';
  if (/semi/.test(t)) return 'semi-detached house';
  if (/detached/.test(t)) return 'detached house';
  if (/bungalow/.test(t)) return 'bungalow';
  if (/house/.test(t)) return 'house';
  return type || 'property';
}

function buildSegmentLabel(bedrooms, propertyType) {
  const beds = Number(bedrooms);
  const type = normalizePropertyTypeLabel(propertyType);
  if (beds > 0) return `${beds}-bed ${type}`;
  return type;
}

const RECENCY_DAYS = 180;

function isRecentListing(row) {
  const d = row.updated_at || row.created_at;
  if (!d) return true;
  const ageMs = Date.now() - new Date(d).getTime();
  return ageMs <= RECENCY_DAYS * 24 * 60 * 60 * 1000;
}

function buildSegmentKey(row, options = {}) {
  if (isCommercialListing(row)) return null;
  const beds = Number(row.bedrooms);
  const type = normalizePropertyTypeLabel(row.property_type || row.property_category);
  let key = `${beds || 0}|${type}`;
  if (options.includeSqftBand) {
    const band = sqftBand(row.square_feet);
    if (band) key += `|${band}`;
  }
  return key;
}

function sqftBand(sqft) {
  const s = Number(sqft);
  if (!s || s <= 0) return null;
  if (s < 500) return 'under_500';
  if (s < 800) return '500_800';
  if (s < 1200) return '800_1200';
  return '1200_plus';
}

/** Below this sample size a statistic is evidence, not a conclusion. */
const MIN_RELIABLE_SAMPLE = 3;

const EXTERNAL_OBSERVATION_PERIOD = 'Provider sold-price aggregate — exact transaction window not published';

function isSparse(sampleSize) {
  return !sampleSize || sampleSize < MIN_RELIABLE_SAMPLE;
}

/**
 * Real observation window from the rows used — never inferred or invented.
 */
function observationPeriod(rows, label = 'marketplace listings') {
  const dates = rows
    .map((r) => r.updated_at || r.created_at)
    .filter(Boolean)
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);

  if (!dates.length) return `Observation period unknown (${label} without timestamps)`;

  const from = dates[0].toISOString().slice(0, 10);
  const to = dates[dates.length - 1].toISOString().slice(0, 10);
  return from === to ? `${label} as at ${from}` : `${label} from ${from} to ${to}`;
}

function buildMetric(
  value,
  { source, sampleSize = null, label = null, period = null, confidence = null, underlyingSource = null }
) {
  const base = {
    source,
    underlyingSource,
    sampleSize,
    label,
    observationPeriod: period,
    confidence,
    sparseEvidence: isSparse(sampleSize),
  };
  if (value == null) return { available: false, ...base };
  return { available: true, value, ...base };
}

/** Area-level confidence is owned by confidenceEngine — this is a thin pass-through. */
function evidenceConfidence(sampleSize, external = false) {
  return assessAreaEvidenceConfidence(sampleSize, external);
}

function filterOutlierPrices(prices) {
  const sorted = prices.filter((p) => p > 0).sort((a, b) => a - b);
  if (sorted.length < 3) return sorted;
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const filtered = sorted.filter((p) => p >= lo && p <= hi);
  return filtered.length ? filtered : sorted;
}

function countByField(rows, field) {
  const counts = {};
  rows.forEach((r) => {
    const v = r[field] || 'Unknown';
    counts[v] = (counts[v] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

async function fetchInternalPostcodeListings(postcodeCompact) {
  const result = await pool.query(
    `SELECT id, title, category, price, monthly_rent, weekly_rent, bedrooms, bathrooms,
            property_type, property_category, square_feet, city, zip_code, epc_rating,
            status, updated_at, created_at
     FROM properties
     WHERE status = 'approved'
       AND REPLACE(UPPER(COALESCE(zip_code, '')), ' ', '') = $1
     ORDER BY updated_at DESC NULLS LAST`,
    [postcodeCompact]
  );
  return result.rows;
}

async function fetchExternalPostcodeEvidence(postcode, userIdOrContext) {
  const context = userIdOrContext && typeof userIdOrContext === 'object' ? userIdOrContext : {};
  const userId = context.userId != null ? context.userId : userIdOrContext;
  const skipResidentialRents = context.skipResidentialRents === true;
  if (!isExternalEnrichmentAvailable()) {
    return {
      available: false,
      message: 'External market data unavailable — statistics below are based on our marketplace listings only.',
      soldPrices: null,
      soldPricesPerSqft: null,
      rents: null,
      demand: null,
      demandRent: null,
      transactions: [],
      sources: [],
    };
  }

  const registry = getProviderRegistry();
  const provider = registry.getPrimaryMarketDataProvider();
  if (!provider?.isAvailable()) {
    return {
      available: false,
      message: 'External market data provider unavailable.',
      soldPrices: null,
      soldPricesPerSqft: null,
      rents: null,
      demand: null,
      demandRent: null,
      transactions: [],
      sources: [],
    };
  }

  const ctx = { userId, propertyId: null };
  const [sold, psf, rentsRes, demandRes, demandRentRes] = await Promise.all([
    provider.getSoldPrices(postcode, ctx).catch(() => ({ success: false })),
    provider.getSoldPricesPerSqf(postcode, ctx).catch(() => ({ success: false })),
    !skipResidentialRents && typeof provider.getRents === 'function'
      ? provider.getRents(postcode, ctx).catch(() => ({ success: false }))
      : Promise.resolve({ success: false, skipped: skipResidentialRents }),
    typeof provider.getDemand === 'function'
      ? provider.getDemand(postcode, ctx).catch(() => ({ success: false }))
      : Promise.resolve({ success: false }),
    !skipResidentialRents && typeof provider.getDemandRent === 'function'
      ? provider.getDemandRent(postcode, ctx).catch(() => ({ success: false }))
      : Promise.resolve({ success: false, skipped: skipResidentialRents }),
  ]);

  const soldStats = sold?.success ? parseSoldPricesStats(sold.data) : null;
  const psfStats = psf?.success ? parseSoldPricesPerSqf(psf.data) : null;
  const transactions = sold?.success ? parseSoldTransactionsFromPayload(sold.data).slice(0, 15) : [];
  const rentParsed = rentsRes?.success ? parseRentsResponse(rentsRes.data) : null;
  const rentEvidence = rentParsed
    ? buildRentalEvidence(rentParsed, { retrievedAt: rentsRes.provenance?.retrievedAt || null })
    : null;
  const demandParsed = demandRes?.success ? parseDemandResponse(demandRes.data) : null;
  const demandEvidence = demandParsed
    ? buildMarketDemandEvidence(demandParsed, {
        retrievedAt: demandRes.provenance?.retrievedAt || null,
      })
    : buildMarketDemandEvidence(null);
  const demandRentParsed = demandRentRes?.success ? parseDemandRentResponse(demandRentRes.data) : null;
  const demandRentEvidence = demandRentParsed
    ? buildRentalDemandEvidence(demandRentParsed, {
        retrievedAt: demandRentRes.provenance?.retrievedAt || null,
      })
    : buildRentalDemandEvidence(null);

  if (
    !soldStats &&
    !psfStats &&
    !rentEvidence?.available &&
    !demandEvidence?.available &&
    !demandRentEvidence?.available
  ) {
    return {
      available: false,
      message: 'No external sold-price, rental, or demand statistics returned for this postcode.',
      soldPrices: null,
      soldPricesPerSqft: null,
      rents: null,
      demand: null,
      demandRent: null,
      transactions: [],
      sources: [],
    };
  }

  const sources = ['PropertyData'];
  if (soldStats) sources.push('HM_Land_Registry');

  return {
    available: true,
    message: null,
    soldPrices: soldStats,
    soldPricesPerSqft: psfStats,
    rents: rentEvidence?.available ? rentEvidence : null,
    demand: demandEvidence?.available ? demandEvidence : null,
    demandRent: demandRentEvidence?.available ? demandRentEvidence : null,
    transactions,
    sources,
    retrievedAt: new Date().toISOString(),
  };
}

function shouldUseSqftBands(saleRows, rentRows) {
  const all = saleRows.concat(rentRows);
  if (all.length < 4) return false;
  const withSqft = all.filter((r) => Number(r.square_feet) > 0).length;
  return withSqft / all.length >= 0.5;
}

function preferRecentRows(rows) {
  const recent = rows.filter(isRecentListing);
  return recent.length >= Math.min(2, rows.length) ? recent : rows;
}

function buildResidentialSegments(saleRows, rentRows) {
  const useSqftBands = shouldUseSqftBands(saleRows, rentRows);
  const saleByKey = {};
  const rentByKey = {};

  preferRecentRows(saleRows).forEach((r) => {
    const key = buildSegmentKey(r, { includeSqftBand: useSqftBands });
    if (!key) return;
    if (!saleByKey[key]) saleByKey[key] = { rows: [], label: buildSegmentLabel(r.bedrooms, r.property_type) };
    saleByKey[key].rows.push(r);
  });

  preferRecentRows(rentRows).forEach((r) => {
    const key = buildSegmentKey(r, { includeSqftBand: useSqftBands });
    if (!key) return;
    if (!rentByKey[key]) rentByKey[key] = { rows: [], label: buildSegmentLabel(r.bedrooms, r.property_type) };
    rentByKey[key].rows.push(r);
  });

  const keys = new Set([...Object.keys(saleByKey), ...Object.keys(rentByKey)]);
  const segments = [];

  keys.forEach((key) => {
    const saleGroup = saleByKey[key];
    const rentGroup = rentByKey[key];
    const salePrices = filterOutlierPrices(
      (saleGroup?.rows || []).map((r) => Number(r.price)).filter((p) => p > 0)
    );
    const rents = (rentGroup?.rows || []).map((r) => getMonthlyRent(r)).filter((r) => r > 0);

    const typicalValue = median(salePrices);
    const typicalRent = median(rents);
    const segment = {
      key,
      label: saleGroup?.label || rentGroup?.label,
      propertyType: normalizePropertyTypeLabel(
        saleGroup?.rows[0]?.property_type || rentGroup?.rows[0]?.property_type
      ),
      bedrooms: Number(saleGroup?.rows[0]?.bedrooms || rentGroup?.rows[0]?.bedrooms) || null,
      saleSampleSize: salePrices.length,
      rentSampleSize: rents.length,
      typicalValue: buildMetric(typicalValue, {
        source: 'InternalMarketplace',
        sampleSize: salePrices.length,
        label: 'Median asking price (marketplace)',
        period: observationPeriod(saleGroup?.rows || [], 'sale listings'),
        confidence: evidenceConfidence(salePrices.length),
      }),
      typicalRent: buildMetric(typicalRent, {
        source: 'InternalMarketplace',
        sampleSize: rents.length,
        label: 'Median asking rent (marketplace)',
        period: observationPeriod(rentGroup?.rows || [], 'rental listings'),
        confidence: evidenceConfidence(rents.length),
      }),
      indicativeGrossYield: null,
    };

    if (typicalValue > 0 && typicalRent > 0) {
      const gross = roundPct((typicalRent * 12 * 100) / typicalValue);
      const weakestSample = Math.min(salePrices.length, rents.length);
      segment.indicativeGrossYield = {
        available: true,
        grossYieldPercent: gross,
        label: 'Indicative segment gross yield',
        disclaimer:
          'Matched by property type and bedrooms within this postcode using marketplace listings only. Not a property-specific yield.',
        source: 'InternalMarketplace',
        saleSampleSize: salePrices.length,
        rentSampleSize: rents.length,
        saleObservationPeriod: observationPeriod(saleGroup?.rows || [], 'sale listings'),
        rentObservationPeriod: observationPeriod(rentGroup?.rows || [], 'rental listings'),
        sparseEvidence: isSparse(weakestSample),
        comparable: !isSparse(weakestSample),
        confidence: evidenceConfidence(weakestSample),
        caution: isSparse(weakestSample)
          ? `Based on ${salePrices.length} sale and ${rents.length} rental record${rents.length === 1 ? '' : 's'} — too few to compare segments or draw a conclusion.`
          : null,
      };
    }

    segments.push(segment);
  });

  // Segments with adequate evidence rank first; sparse segments never lead the list.
  return segments.sort((a, b) => {
    const aOk = a.indicativeGrossYield?.comparable ? 1 : 0;
    const bOk = b.indicativeGrossYield?.comparable ? 1 : 0;
    if (aOk !== bOk) return bOk - aOk;
    const aYield = a.indicativeGrossYield?.grossYieldPercent || 0;
    const bYield = b.indicativeGrossYield?.grossYieldPercent || 0;
    return bYield - aYield;
  });
}

function buildBroadAreaYield(external, residentialRentRows, residentialSaleRows) {
  const rents = residentialRentRows.map((r) => getMonthlyRent(r)).filter((r) => r > 0);
  const medianRent = median(rents);

  let medianSale = null;
  let saleSource = null;
  let saleSample = 0;

  let saleObservationPeriod = null;

  if (external?.soldPrices?.average) {
    medianSale = external.soldPrices.average;
    saleSource = 'PropertyData_HM_Land_Registry';
    saleSample = external.soldPrices.sampleSize || 0;
    saleObservationPeriod = EXTERNAL_OBSERVATION_PERIOD;
  } else {
    const prices = filterOutlierPrices(
      residentialSaleRows.map((r) => Number(r.price)).filter((p) => p > 0)
    );
    medianSale = median(prices);
    saleSource = 'InternalMarketplace';
    saleSample = prices.length;
    saleObservationPeriod = observationPeriod(residentialSaleRows, 'sale listings');
  }

  if (!medianRent || !medianSale) {
    return {
      available: false,
      label: 'Indicative Area Gross Yield',
      message: 'Insufficient matched sale and rent evidence for a broad area yield indicator.',
    };
  }

  const weakestSample = Math.min(rents.length, saleSample);
  const externalBacked = saleSource.includes('PropertyData');

  return {
    available: true,
    label: 'Indicative Area Gross Yield',
    grossYieldPercent: roundPct((medianRent * 12 * 100) / medianSale),
    medianRent,
    medianSale,
    rentSource: 'InternalMarketplace',
    rentSampleSize: rents.length,
    rentObservationPeriod: observationPeriod(residentialRentRows, 'rental listings'),
    saleSource,
    saleSampleSize: saleSample,
    saleObservationPeriod,
    basis:
      saleSource === 'InternalMarketplace'
        ? 'asking_rent_vs_asking_sale'
        : 'asking_rent_vs_hmlr_sold',
    notTransactionBasedYield: true,
    sparseEvidence: isSparse(weakestSample),
    disclaimer:
      'Broad postcode-level indicator only — does NOT represent the yield of any individual property, and is not a realised (transaction) yield. Asking rents are compared with asking or sold area prices.',
    caution: isSparse(weakestSample)
      ? `Derived from ${rents.length} rental and ${saleSample} sale record${saleSample === 1 ? '' : 's'} — indicative only, not a realised market yield.`
      : 'Asking-based area indicator, not a completed-transaction yield.',
    confidence: evidenceConfidence(weakestSample, externalBacked),
  };
}

function buildLeaseSection(leaseRows) {
  if (!leaseRows.length) {
    return { available: false, message: 'No commercial lease listings on our platform in this postcode.' };
  }

  const rents = leaseRows.map((r) => getMonthlyRent(r)).filter((r) => r > 0);
  const mm = minMax(rents);

  return {
    available: true,
    listingCount: leaseRows.length,
    source: 'InternalMarketplace',
    label: 'Commercial lease (marketplace only)',
    observationPeriod: observationPeriod(leaseRows, 'lease listings'),
    sparseEvidence: isSparse(leaseRows.length),
    rent: {
      medianMonthly: median(rents),
      minMonthly: mm.min,
      maxMonthly: mm.max,
      sampleSize: rents.length,
      source: 'InternalMarketplace',
      observationPeriod: observationPeriod(leaseRows, 'lease listings'),
      sparseEvidence: isSparse(rents.length),
      confidence: evidenceConfidence(rents.length),
    },
    propertyTypes: {
      distribution: countByField(leaseRows, 'property_type'),
      sampleSize: leaseRows.length,
      source: 'InternalMarketplace',
      observationPeriod: observationPeriod(leaseRows, 'lease listings'),
      sparseEvidence: isSparse(leaseRows.length),
    },
    confidence: evidenceConfidence(leaseRows.length),
    disclaimer: 'Commercial lease rents are separate from residential rental intelligence and are not used in residential yield calculations.',
  };
}

function buildOverallConfidence(external, internalCount, segmentCount) {
  let score = 0;
  if (external?.available) score += 45;
  else if (isExternalEnrichmentAvailable()) score += 10;

  if (internalCount >= 10) score += 25;
  else if (internalCount >= 3) score += 15;
  else if (internalCount >= 1) score += 5;

  if (segmentCount >= 3) score += 20;
  else if (segmentCount >= 1) score += 10;

  // No external evidence, no listings and no matched segments means nothing was
  // measured. Reporting "Low" would imply the market was examined and found thin.
  const hasAnyEvidence = Boolean(external?.available) || internalCount > 0 || segmentCount > 0;

  let level = 'Not assessed';
  if (hasAnyEvidence) {
    level = 'Low';
    if (score >= 70) level = 'High';
    else if (score >= 40) level = 'Medium';
  }

  let summary;
  if (!hasAnyEvidence) {
    summary =
      'No sale, rental or external evidence is available for this postcode, so market confidence cannot be assessed.';
  } else if (!external?.available && internalCount <= 3) {
    summary =
      'Limited evidence — rely on external data configuration for authoritative postcode statistics.';
  } else if (external?.available) {
    summary = `Combined external sold evidence and ${internalCount} marketplace listing${internalCount === 1 ? '' : 's'}.`;
  } else {
    summary = `${internalCount} marketplace listing${internalCount === 1 ? '' : 's'} only — not representative of the full postcode market.`;
  }

  return {
    level,
    assessed: hasAnyEvidence,
    // Internal ordering index, null when nothing was assessed. Not a percentage.
    score: hasAnyEvidence ? Math.min(100, score) : null,
    summary,
  };
}

/**
 * Match a property to the best postcode segment for contextual comparison.
 */
function findMatchedSegment(property, segments) {
  if (!property || !segments?.length) return null;
  const key = buildSegmentKey(property);
  if (!key) return null;
  return segments.find((s) => s.key === key) || null;
}

/**
 * Compare individual property to postcode market context (deterministic).
 */
function buildPropertyMarketContext(property, postcodeMarket) {
  if (!property || !postcodeMarket?.success) return null;

  const askingPrice = Number(property.price) || 0;
  const monthlyRent = getMonthlyRent(property);
  const matchedSegment = findMatchedSegment(property, postcodeMarket.investment?.segments);

  const soldEvidence = postcodeMarket.snapshot?.soldPriceEvidence;
  const typicalPostcodeValue =
    soldEvidence?.available ? soldEvidence.average : postcodeMarket.snapshot?.typicalValue?.value || null;
  const typicalPostcodeValueSource = soldEvidence?.available
    ? 'PropertyData_HM_Land_Registry'
    : postcodeMarket.snapshot?.typicalValue?.source;

  let vsMatchedEvidence = null;
  if (askingPrice > 0 && matchedSegment?.typicalValue?.available) {
    const central = matchedSegment.typicalValue.value;
    const diffPct = roundPct(((askingPrice - central) / central) * 100);
    vsMatchedEvidence = {
      label: matchedSegment.label,
      typicalValue: central,
      askingPrice,
      differencePercent: diffPct,
      summary:
        Math.abs(diffPct) <= 3
          ? `Approximately in line with matched local evidence for ${matchedSegment.label}.`
          : diffPct > 0
            ? `Approximately ${diffPct}% above matched local evidence for ${matchedSegment.label}.`
            : `Approximately ${Math.abs(diffPct)}% below matched local evidence for ${matchedSegment.label}.`,
      source: 'InternalMarketplace',
      sampleSize: matchedSegment.saleSampleSize,
      confidence: matchedSegment.typicalValue.confidence,
    };
  } else if (askingPrice > 0 && typicalPostcodeValue) {
    const diffPct = roundPct(((askingPrice - typicalPostcodeValue) / typicalPostcodeValue) * 100);
    vsMatchedEvidence = {
      label: 'Postcode area',
      typicalValue: typicalPostcodeValue,
      askingPrice,
      differencePercent: diffPct,
      summary:
        Math.abs(diffPct) <= 5
          ? 'Asking price is broadly in line with typical postcode sold/asking evidence.'
          : diffPct > 0
            ? `Approximately ${diffPct}% above typical postcode value evidence.`
            : `Approximately ${Math.abs(diffPct)}% below typical postcode value evidence.`,
      source: typicalPostcodeValueSource,
      confidence: postcodeMarket.confidence,
    };
  }

  return {
    postcode: postcodeMarket.postcode,
    typicalPostcodeValue: typicalPostcodeValue
      ? buildMetric(typicalPostcodeValue, {
          source: typicalPostcodeValueSource,
          sampleSize: soldEvidence?.sampleSize || postcodeMarket.snapshot?.typicalValue?.sampleSize,
          label: soldEvidence?.available
            ? 'Typical sold price (HM Land Registry area stats)'
            : 'Typical asking price (marketplace)',
          confidence: postcodeMarket.confidence,
        })
      : { available: false },
    matchedSegment: matchedSegment
      ? {
          label: matchedSegment.label,
          typicalValue: matchedSegment.typicalValue,
          typicalRent: matchedSegment.typicalRent,
          indicativeGrossYield: matchedSegment.indicativeGrossYield,
        }
      : null,
    vsMatchedEvidence,
    segmentYieldNote:
      matchedSegment?.indicativeGrossYield?.available
        ? `Segment yield for ${matchedSegment.label}: ${matchedSegment.indicativeGrossYield.grossYieldPercent}% gross (marketplace matched evidence).`
        : null,
    propertyRent: monthlyRent > 0 ? monthlyRent : null,
    broadAreaYield: postcodeMarket.snapshot?.indicativeAreaYield || null,
  };
}

/**
 * Adapter for the Personal Decision Score and What-if Simulator.
 *
 * Performs NO calculation — it selects already-computed postcode evidence and
 * labels each value with provenance plus whether the sample is strong enough to
 * score against. Consumers (future scoring / simulation) own their own maths and
 * must reuse financialEngine for any recalculation.
 */
function buildDecisionContext(postcodeMarket, marketContext = null) {
  if (!postcodeMarket?.success) {
    return { available: false, message: 'No postcode market context available.' };
  }

  const snapshot = postcodeMarket.snapshot || {};
  const matched = marketContext?.matchedSegment || null;

  const reference = (metric, kind) => {
    if (!metric?.available) return null;
    return {
      kind,
      value: metric.value,
      source: metric.source,
      underlyingSource: metric.underlyingSource || null,
      sampleSize: metric.sampleSize ?? null,
      observationPeriod: metric.observationPeriod ?? null,
      confidence: metric.confidence?.level ?? null,
      sparseEvidence: Boolean(metric.sparseEvidence),
      usableAsBaseline: metric.available && !metric.sparseEvidence,
    };
  };

  const valueBaselines = [
    reference(matched?.typicalValue, 'matched_segment_value'),
    reference(snapshot.typicalValue, 'postcode_typical_value'),
  ].filter(Boolean);

  const rentBaselines = [
    reference(matched?.typicalRent, 'matched_segment_rent'),
    reference(snapshot.typicalRent, 'postcode_typical_rent'),
  ].filter(Boolean);

  return {
    available: true,
    layer: 'market_context',
    postcode: postcodeMarket.postcode,
    retrievedAt: postcodeMarket.retrievedAt,
    externalAvailable: postcodeMarket.externalAvailable,
    overallConfidence: postcodeMarket.confidence?.level ?? null,
    matchedSegmentLabel: matched?.label || null,
    valueBaselines,
    rentBaselines,
    preferredValueBaseline: valueBaselines.find((b) => b.usableAsBaseline) || null,
    preferredRentBaseline: rentBaselines.find((b) => b.usableAsBaseline) || null,
    areaYield: snapshot.indicativeAreaYield?.available
      ? {
          grossYieldPercent: snapshot.indicativeAreaYield.grossYieldPercent,
          scope: 'area_indicator_only',
          sparseEvidence: Boolean(snapshot.indicativeAreaYield.sparseEvidence),
          confidence: snapshot.indicativeAreaYield.confidence?.level ?? null,
        }
      : null,
    segmentYield: matched?.indicativeGrossYield?.available
      ? {
          grossYieldPercent: matched.indicativeGrossYield.grossYieldPercent,
          scope: 'matched_segment_indicator',
          comparable: Boolean(matched.indicativeGrossYield.comparable),
          confidence: matched.indicativeGrossYield.confidence?.level ?? null,
        }
      : null,
    priceVsLocalEvidence: marketContext?.vsMatchedEvidence
      ? {
          differencePercent: marketContext.vsMatchedEvidence.differencePercent,
          basis: marketContext.vsMatchedEvidence.label,
          summary: marketContext.vsMatchedEvidence.summary,
          sampleSize: marketContext.vsMatchedEvidence.sampleSize ?? null,
        }
      : null,
    marketDemand: snapshot.areaMarketDemand?.available
      ? {
          available: true,
          scope: 'area',
          demandType: 'buyer_market',
          propertyLevel: false,
          rentalDemand: false,
          band: snapshot.areaMarketDemand.band,
          value: snapshot.areaMarketDemand.value ?? null,
          sampleSize: snapshot.areaMarketDemand.sampleSize ?? null,
          observationPeriod: snapshot.areaMarketDemand.observationPeriod ?? null,
          observedAt: snapshot.areaMarketDemand.observedAt ?? null,
          retrievedAt: snapshot.areaMarketDemand.retrievedAt || postcodeMarket.retrievedAt || null,
          confidence: snapshot.areaMarketDemand.confidence ?? null,
          source: snapshot.areaMarketDemand.source || 'PropertyData',
          provider: snapshot.areaMarketDemand.provider || 'propertydata',
          providerEndpoint: snapshot.areaMarketDemand.providerEndpoint || '/demand',
          totalForSale: snapshot.areaMarketDemand.totalForSale ?? null,
          averageSalesPerMonth: snapshot.areaMarketDemand.averageSalesPerMonth ?? null,
          turnoverPerMonth: snapshot.areaMarketDemand.turnoverPerMonth ?? null,
          monthsOfInventory: snapshot.areaMarketDemand.monthsOfInventory ?? null,
          daysOnMarket: snapshot.areaMarketDemand.daysOnMarket ?? null,
          state: snapshot.areaMarketDemand.state || 'observed',
          methodology: snapshot.areaMarketDemand.methodology || null,
          role: 'context_only',
        }
      : {
          available: false,
          scope: 'area',
          demandType: 'buyer_market',
          propertyLevel: false,
          rentalDemand: false,
          band: null,
          value: null,
          state: 'notAssessed',
          role: 'context_only',
        },
    rentalMarketDemand: snapshot.areaRentalDemand?.available
      ? {
          available: true,
          scope: 'area',
          demandType: 'rental_market',
          propertyLevel: false,
          rentalDemand: true,
          band: snapshot.areaRentalDemand.band,
          value: snapshot.areaRentalDemand.value ?? null,
          sampleSize: snapshot.areaRentalDemand.sampleSize ?? null,
          observationPeriod: snapshot.areaRentalDemand.observationPeriod ?? null,
          observedAt: snapshot.areaRentalDemand.observedAt ?? null,
          retrievedAt: snapshot.areaRentalDemand.retrievedAt || postcodeMarket.retrievedAt || null,
          confidence: snapshot.areaRentalDemand.confidence ?? null,
          source: snapshot.areaRentalDemand.source || 'PropertyData',
          provider: snapshot.areaRentalDemand.provider || 'propertydata',
          providerEndpoint: snapshot.areaRentalDemand.providerEndpoint || '/demand-rent',
          totalForRent: snapshot.areaRentalDemand.totalForRent ?? null,
          transactionsPerMonth: snapshot.areaRentalDemand.transactionsPerMonth ?? null,
          turnoverPerMonth: snapshot.areaRentalDemand.turnoverPerMonth ?? null,
          monthsOfInventory: snapshot.areaRentalDemand.monthsOfInventory ?? null,
          daysOnMarket: snapshot.areaRentalDemand.daysOnMarket ?? null,
          radius: snapshot.areaRentalDemand.radius ?? null,
          radiusUnit: snapshot.areaRentalDemand.radiusUnit ?? null,
          state: snapshot.areaRentalDemand.state || 'observed',
          methodology: snapshot.areaRentalDemand.methodology || null,
          role: 'context_only',
        }
      : {
          available: false,
          scope: 'area',
          demandType: 'rental_market',
          propertyLevel: false,
          rentalDemand: true,
          band: null,
          value: null,
          state: 'notAssessed',
          role: 'context_only',
        },
    usage: {
      role: 'context_only',
      note: 'Context for property-level scoring and scenarios. Never substitute these area figures for a property-specific valuation or yield.',
      recalculationOwner: 'financialEngine',
    },
  };
}

function buildTemplateMarketSummary(payload) {
  const { postcode, confidence, snapshot, investment, externalAvailable } = payload;
  const parts = [`Property market intelligence for ${postcode}.`];

  if (snapshot?.typicalValue?.available) {
    const hedge = snapshot.typicalValue.sparseEvidence
      ? `, based on only ${snapshot.typicalValue.sampleSize} record${snapshot.typicalValue.sampleSize === 1 ? '' : 's'}`
      : '';
    parts.push(
      `Typical value evidence indicates around £${Number(snapshot.typicalValue.value).toLocaleString()} (${snapshot.typicalValue.label || 'area estimate'}${hedge}).`
    );
  }
  if (snapshot?.typicalRent?.available) {
    const hedge = snapshot.typicalRent.sparseEvidence
      ? ` from only ${snapshot.typicalRent.sampleSize} listing${snapshot.typicalRent.sampleSize === 1 ? '' : 's'}`
      : '';
    parts.push(
      `Typical asking rent is about £${Number(snapshot.typicalRent.value).toLocaleString()} per month${hedge}.`
    );
  }
  if (snapshot?.areaMarketDemand?.available && snapshot.areaMarketDemand.band) {
    parts.push(
      `Buyer demand in the surrounding market is currently labelled "${snapshot.areaMarketDemand.band}" by PropertyData. This is an area sales-market snapshot, not property-specific demand and not rental demand.`
    );
  }
  if (snapshot?.areaRentalDemand?.available && snapshot.areaRentalDemand.band) {
    parts.push(
      `Rental demand in the surrounding market is currently labelled "${snapshot.areaRentalDemand.band}" by PropertyData. This is an area rental-market snapshot, not property-specific tenant demand and not a letting-time prediction.`
    );
  }

  // Only compare segments when both sides carry adequate evidence.
  const comparableSegments = (investment?.segments || []).filter(
    (s) => s.indicativeGrossYield?.comparable
  );
  const anySegmentYields = (investment?.segments || []).filter((s) => s.indicativeGrossYield?.available);

  if (comparableSegments.length >= 2) {
    const best = comparableSegments[0];
    const weakest = comparableSegments[comparableSegments.length - 1];
    parts.push(
      `Among segments with adequate evidence, ${best.label} shows a higher indicative gross yield (${best.indicativeGrossYield.grossYieldPercent}%) than ${weakest.label} (${weakest.indicativeGrossYield.grossYieldPercent}%).`
    );
  } else if (anySegmentYields.length) {
    parts.push(
      `Segment yields are available for ${anySegmentYields.length} matched segment${anySegmentYields.length === 1 ? '' : 's'}, but the samples are too small to compare segments reliably.`
    );
  }

  if (snapshot?.indicativeAreaYield?.available) {
    const areaYield = snapshot.indicativeAreaYield;
    parts.push(
      `Broad indicative area gross yield is ${areaYield.grossYieldPercent}% — an area indicator, not the yield of any individual property.${areaYield.caution ? ` ${areaYield.caution}` : ''}`
    );
  }

  if (!externalAvailable) {
    parts.push('External sold-price data was unavailable; treat marketplace statistics as supplementary only.');
  }

  parts.push(
    `Overall confidence: ${confidence?.level || 'Not assessed'}. ${confidence?.summary || ''}`
  );
  return parts.join(' ');
}

async function getPostcodeMarketIntelligence(postcodeInput, context = {}) {
  const normalized = normalisePostcode(
    typeof postcodeInput === 'string' ? postcodeInput : postcodeInput?.postcode || postcodeInput?.zip_code || ''
  );
  if (!normalized || normalized.length < 5) {
    return { success: false, message: 'Enter a valid UK postcode (e.g. B19 2YF).' };
  }

  const postcodeCompact = compactPostcode(normalized);
  const retrievedAt = new Date().toISOString();

  const [listings, external] = await Promise.all([
    fetchInternalPostcodeListings(postcodeCompact),
    fetchExternalPostcodeEvidence(normalized, context),
  ]);

  const residentialSale = listings.filter(
    (r) => normalizeListingCategory(r.category) === 'sale' && !isCommercialListing(r)
  );
  const residentialRent = listings.filter(
    (r) => normalizeListingCategory(r.category) === 'rent' && !isCommercialListing(r)
  );
  const leaseRows = listings.filter(
    (r) => normalizeListingCategory(r.category) === 'lease' || isCommercialListing(r)
  );

  const salePrices = filterOutlierPrices(
    residentialSale.map((r) => Number(r.price)).filter((p) => p > 0)
  );
  const rents = residentialRent.map((r) => getMonthlyRent(r)).filter((r) => r > 0);
  const rentMm = minMax(rents);
  const beds = residentialSale.concat(residentialRent).map((r) => Number(r.bedrooms)).filter((b) => b > 0);
  const residentialListingCount = listings.filter((r) => !isCommercialListing(r)).length;
  const epcRows = listings.filter((r) => r.epc_rating);
  const segments = buildResidentialSegments(residentialSale, residentialRent);
  const broadAreaYield = buildBroadAreaYield(external, residentialRent, residentialSale);
  const lease = buildLeaseSection(leaseRows);
  const confidence = buildOverallConfidence(external, listings.length, segments.filter((s) => s.indicativeGrossYield?.available).length);

  const typicalValueExternal = external.soldPrices?.average || null;
  const typicalValueInternal = median(salePrices);
  const typicalValue = typicalValueExternal || typicalValueInternal;

  const marketEvidenceCount =
    (external.soldPrices?.sampleSize || 0) +
    (external.rents?.sampleSize || 0) +
    external.transactions.length +
    salePrices.length +
    rents.length;

  const dataSources = [];
  if (external.soldPrices) dataSources.push('PropertyData', 'HM_Land_Registry');
  if (external.rents) dataSources.push('PropertyData');
  if (external.demand) dataSources.push('PropertyData');
  if (external.demandRent) dataSources.push('PropertyData');
  if (listings.length) dataSources.push('InternalMarketplace');

  const snapshot = {
    typicalValue: buildMetric(typicalValue, {
      source: typicalValueExternal ? 'PropertyData_HM_Land_Registry' : 'InternalMarketplace',
      sampleSize: typicalValueExternal ? external.soldPrices.sampleSize : salePrices.length,
      label: typicalValueExternal ? 'Typical sold price (area)' : 'Median asking price (marketplace)',
      period: typicalValueExternal
        ? EXTERNAL_OBSERVATION_PERIOD
        : observationPeriod(residentialSale, 'sale listings'),
      underlyingSource: typicalValueExternal ? 'HM Land Registry' : null,
      confidence: evidenceConfidence(
        typicalValueExternal ? external.soldPrices.sampleSize : salePrices.length,
        Boolean(typicalValueExternal)
      ),
    }),
    soldPriceEvidence: external.soldPrices
      ? {
          available: true,
          average: external.soldPrices.average,
          range: external.soldPrices.range,
          sampleSize: external.soldPrices.sampleSize,
          observationPeriod: EXTERNAL_OBSERVATION_PERIOD,
          sparseEvidence: isSparse(external.soldPrices.sampleSize),
          confidence: evidenceConfidence(external.soldPrices.sampleSize || 0, true),
          source: 'PropertyData',
          underlyingSource: 'HM Land Registry',
        }
      : { available: false, message: 'External sold-price evidence unavailable' },
    pricePerSqft: external.soldPricesPerSqft
      ? {
          available: true,
          average: external.soldPricesPerSqft.averagePerSqft,
          range: external.soldPricesPerSqft.range,
          observationPeriod: EXTERNAL_OBSERVATION_PERIOD,
          sampleSize: external.soldPricesPerSqft.sampleSize ?? null,
          sparseEvidence: isSparse(external.soldPricesPerSqft.sampleSize),
          confidence: external.soldPricesPerSqft.sampleSize
            ? evidenceConfidence(external.soldPricesPerSqft.sampleSize, true)
            : { level: 'Medium', note: 'Provider aggregate — sample size not published' },
          source: 'PropertyData',
          underlyingSource: 'HM Land Registry + EPC',
        }
      : { available: false },
    typicalRent: buildMetric(median(rents), {
      source: 'InternalMarketplace',
      sampleSize: rents.length,
      label: 'Median asking rent (marketplace)',
      period: observationPeriod(residentialRent, 'rental listings'),
      confidence: evidenceConfidence(rents.length),
    }),
    externalAskingRent: external.rents?.available
      ? {
          available: true,
          valueWeekly: external.rents.central,
          valueMonthly: external.rents.centralMonthly,
          rangeWeekly: { low: external.rents.lower, high: external.rents.upper },
          rangeMonthly: { low: external.rents.lowerMonthly, high: external.rents.upperMonthly },
          unit: external.rents.unit,
          sampleSize: external.rents.sampleSize,
          radius: external.rents.radius,
          scope: external.rents.scope,
          rentType: external.rents.rentType,
          achieved: false,
          propertyLevel: false,
          observationPeriod: external.rents.observationPeriod,
          observedAt: external.rents.observedAt,
          confidence: external.rents.confidence,
          source: 'PropertyData',
          provider: 'propertydata',
          providerEndpoint: '/rents',
          retrievedAt: external.rents.retrievedAt,
          label: 'Area long-let asking rent (PropertyData)',
        }
      : { available: false, source: null, value: null, state: 'notAssessed' },
    areaMarketDemand: external.demand?.available
      ? {
          available: true,
          scope: 'area',
          demandType: 'buyer_market',
          propertyLevel: false,
          rentalDemand: false,
          value: external.demand.value,
          band: external.demand.band,
          sampleSize: external.demand.sampleSize,
          observationPeriod: external.demand.observationPeriod,
          observedAt: external.demand.observedAt,
          retrievedAt: external.demand.retrievedAt,
          confidence: external.demand.confidence,
          radius: external.demand.radius,
          radiusUnit: external.demand.radiusUnit,
          totalForSale: external.demand.totalForSale,
          averageSalesPerMonth: external.demand.averageSalesPerMonth,
          turnoverPerMonth: external.demand.turnoverPerMonth,
          turnoverPerMonthPercent: external.demand.turnoverPerMonthPercent,
          monthsOfInventory: external.demand.monthsOfInventory,
          daysOnMarket: external.demand.daysOnMarket,
          source: 'PropertyData',
          provider: 'propertydata',
          providerEndpoint: '/demand',
          endpoint: '/demand',
          state: external.demand.state,
          methodology: external.demand.methodology,
          label: 'Area buyer-market demand (PropertyData)',
        }
      : {
          available: false,
          scope: 'area',
          demandType: 'buyer_market',
          propertyLevel: false,
          rentalDemand: false,
          value: null,
          band: null,
          state: 'notAssessed',
          source: null,
        },
    areaRentalDemand: external.demandRent?.available
      ? {
          available: true,
          scope: 'area',
          demandType: 'rental_market',
          propertyLevel: false,
          rentalDemand: true,
          value: external.demandRent.value,
          band: external.demandRent.band,
          sampleSize: external.demandRent.sampleSize,
          observationPeriod: external.demandRent.observationPeriod,
          observedAt: external.demandRent.observedAt,
          retrievedAt: external.demandRent.retrievedAt,
          confidence: external.demandRent.confidence,
          radius: external.demandRent.radius,
          radiusUnit: external.demandRent.radiusUnit,
          totalForRent: external.demandRent.totalForRent,
          transactionsPerMonth: external.demandRent.transactionsPerMonth,
          turnoverPerMonth: external.demandRent.turnoverPerMonth,
          turnoverPerMonthPercent: external.demandRent.turnoverPerMonthPercent,
          monthsOfInventory: external.demandRent.monthsOfInventory,
          daysOnMarket: external.demandRent.daysOnMarket,
          source: 'PropertyData',
          provider: 'propertydata',
          providerEndpoint: '/demand-rent',
          endpoint: '/demand-rent',
          state: external.demandRent.state,
          methodology: external.demandRent.methodology,
          label: 'Area rental-market demand (PropertyData)',
        }
      : {
          available: false,
          scope: 'area',
          demandType: 'rental_market',
          propertyLevel: false,
          rentalDemand: true,
          value: null,
          band: null,
          state: 'notAssessed',
          source: null,
        },
    indicativeAreaYield: broadAreaYield,
    marketEvidenceCount,
    marketEvidenceBreakdown: {
      externalSoldRecords: external.soldPrices?.sampleSize || 0,
      externalTransactions: external.transactions.length,
      marketplaceSaleListings: salePrices.length,
      marketplaceRentalListings: rents.length,
      sources: dataSources,
      observationPeriod: observationPeriod(listings, 'listings'),
    },
    listingSupply: {
      total: listings.length,
      sale: residentialSale.length,
      rent: residentialRent.length,
      lease: leaseRows.length,
      source: 'InternalMarketplace',
      sampleSize: listings.length,
      observationPeriod: observationPeriod(listings, 'listings'),
      basis: 'complete_count_of_marketplace_listings',
      sparseEvidence: isSparse(listings.length),
      confidence: {
        level: 'High',
        note: 'Exact count of our marketplace listings — complete for this platform, not for the wider market.',
      },
      disclaimer: 'Listing supply reflects our marketplace only — not total market inventory.',
    },
    propertyTypeDistribution: {
      available: residentialListingCount > 0,
      distribution: countByField(
        listings.filter((r) => !isCommercialListing(r)),
        'property_type'
      ),
      sampleSize: residentialListingCount,
      source: 'InternalMarketplace',
      observationPeriod: observationPeriod(residentialSale.concat(residentialRent), 'listings'),
      sparseEvidence: isSparse(residentialListingCount),
      confidence: evidenceConfidence(residentialListingCount),
    },
    typicalBedrooms: {
      available: beds.length > 0,
      median: median(beds),
      sampleSize: beds.length,
      source: 'InternalMarketplace',
      observationPeriod: observationPeriod(residentialSale.concat(residentialRent), 'listings'),
      sparseEvidence: isSparse(beds.length),
      confidence: evidenceConfidence(beds.length),
    },
    epc: {
      available: epcRows.length > 0,
      sampleSize: epcRows.length,
      distribution: countByField(epcRows, 'epc_rating'),
      source: 'InternalMarketplace',
      observationPeriod: observationPeriod(epcRows, 'listings with EPC recorded'),
      sparseEvidence: isSparse(epcRows.length),
      confidence: evidenceConfidence(epcRows.length),
    },
    confidence,
    lastUpdated: retrievedAt,
  };

  const salesSection = {
    available: Boolean(external.soldPrices || salePrices.length),
    dataQuality: assessDataQuality({
      comparableCount: (external.soldPrices?.sampleSize || 0) + salePrices.length,
      fieldsPresent: external.available ? 2 : salePrices.length > 0 ? 1 : 0,
      fieldsTotal: 2,
    }),
    external: {
      soldPrices: external.soldPrices,
      soldPricesPerSqft: external.soldPricesPerSqft,
      recentTransactions: external.transactions,
      available: external.available,
      message: external.message,
    },
    internal: {
      askingPrices: {
        available: salePrices.length > 0,
        median: median(salePrices),
        min: minMax(salePrices).min,
        max: minMax(salePrices).max,
        sampleSize: salePrices.length,
        source: 'InternalMarketplace',
        observationPeriod: observationPeriod(residentialSale, 'sale listings'),
        sparseEvidence: isSparse(salePrices.length),
        confidence: evidenceConfidence(salePrices.length),
      },
      comparables: residentialSale.slice(0, 8).map((r) => ({
        id: r.id,
        title: r.title,
        price: r.price,
        bedrooms: r.bedrooms,
        property_type: r.property_type,
        source: 'InternalMarketplace',
        observedAt: r.updated_at || r.created_at || null,
      })),
      propertyTypes: {
        distribution: countByField(residentialSale, 'property_type'),
        sampleSize: residentialSale.length,
        source: 'InternalMarketplace',
        observationPeriod: observationPeriod(residentialSale, 'sale listings'),
        sparseEvidence: isSparse(residentialSale.length),
        confidence: evidenceConfidence(residentialSale.length),
      },
      supply: {
        count: residentialSale.length,
        sampleSize: residentialSale.length,
        source: 'InternalMarketplace',
        observationPeriod: observationPeriod(residentialSale, 'sale listings'),
        basis: 'complete_count_of_marketplace_listings',
        sparseEvidence: isSparse(residentialSale.length),
        confidence: {
          level: 'High',
          note: 'Exact count of marketplace sale listings in this postcode.',
        },
      },
    },
    priceTrend: {
      available: false,
      message: 'Historical price trend requires additional external time-series data — not yet connected.',
    },
  };

  const rentalSection = {
    available: rents.length > 0 || Boolean(external.rents?.available),
    dataQuality: assessDataQuality({
      comparableCount: rents.length + (external.rents?.sampleSize || 0),
      fieldsPresent: rents.length > 0 || external.rents?.available ? 1 : 0,
      fieldsTotal: 1,
    }),
    internal: {
      available: rents.length > 0,
      medianMonthly: median(rents),
      range: { low: rentMm.min, high: rentMm.max },
      sampleSize: rents.length,
      observationPeriod: observationPeriod(residentialRent, 'rental listings'),
      sparseEvidence: isSparse(rents.length),
      confidence: evidenceConfidence(rents.length),
      bySegment: segments
        .filter((s) => s.typicalRent?.available)
        .map((s) => ({
          label: s.label,
          medianMonthly: s.typicalRent.value,
          sampleSize: s.rentSampleSize,
          source: s.typicalRent.source,
          observationPeriod: s.typicalRent.observationPeriod,
          sparseEvidence: s.typicalRent.sparseEvidence,
          confidence: s.typicalRent.confidence,
        })),
      comparables: residentialRent.slice(0, 8).map((r) => ({
        id: r.id,
        title: r.title,
        monthly_rent: getMonthlyRent(r),
        bedrooms: r.bedrooms,
        property_type: r.property_type,
        source: 'InternalMarketplace',
        observedAt: r.updated_at || r.created_at || null,
      })),
      supply: {
        count: residentialRent.length,
        sampleSize: residentialRent.length,
        source: 'InternalMarketplace',
        observationPeriod: observationPeriod(residentialRent, 'rental listings'),
        basis: 'complete_count_of_marketplace_listings',
        sparseEvidence: isSparse(residentialRent.length),
        confidence: {
          level: 'High',
          note: 'Exact count of marketplace rental listings in this postcode.',
        },
      },
      source: 'InternalMarketplace',
    },
    external: external.rents?.available
      ? {
          available: true,
          source: 'PropertyData',
          provider: 'propertydata',
          providerEndpoint: '/rents',
          endpoint: '/rents',
          rentType: 'asking_long_let',
          achieved: false,
          propertyLevel: false,
          scope: external.rents.scope,
          unit: external.rents.unit,
          medianWeekly: external.rents.central,
          medianMonthly: external.rents.centralMonthly,
          rangeWeekly: { low: external.rents.lower, high: external.rents.upper },
          rangeMonthly: { low: external.rents.lowerMonthly, high: external.rents.upperMonthly },
          sampleSize: external.rents.sampleSize,
          radius: external.rents.radius,
          bedrooms: external.rents.bedrooms,
          propertyType: external.rents.propertyType,
          observationPeriod: external.rents.observationPeriod,
          observedAt: external.rents.observedAt,
          confidence: external.rents.confidence,
          retrievedAt: external.rents.retrievedAt,
          disclaimer:
            'PropertyData /rents is a live long-let asking-rent snapshot for the area, not achieved lettings and not a property-specific rental valuation.',
        }
      : {
          available: false,
          message: 'External rental asking-rent statistics were not returned for this postcode.',
        },
    rentTrend: {
      available: false,
      message: 'Rental trend requires historical rental data — not yet available.',
    },
  };

  const investmentSection = {
    available: segments.some((s) => s.indicativeGrossYield?.available) || broadAreaYield.available,
    indicativeAreaYield: broadAreaYield,
    segments: segments.filter((s) => s.typicalValue?.available || s.typicalRent?.available),
    priceToRentNote:
      'Segment yields match sale and rent evidence by property type and bedrooms within the postcode. Commercial lease data is excluded.',
    demandIndicators: external.demand?.available
      ? {
          available: true,
          scope: 'area',
          demandType: 'buyer_market',
          propertyLevel: false,
          rentalDemand: false,
          source: 'PropertyData',
          provider: 'propertydata',
          providerEndpoint: '/demand',
          endpoint: '/demand',
          band: external.demand.band,
          value: external.demand.value,
          sampleSize: external.demand.sampleSize,
          observationPeriod: external.demand.observationPeriod,
          observedAt: external.demand.observedAt,
          retrievedAt: external.demand.retrievedAt,
          confidence: external.demand.confidence,
          radius: external.demand.radius,
          totalForSale: external.demand.totalForSale,
          averageSalesPerMonth: external.demand.averageSalesPerMonth,
          turnoverPerMonth: external.demand.turnoverPerMonth,
          turnoverPerMonthPercent: external.demand.turnoverPerMonthPercent,
          monthsOfInventory: external.demand.monthsOfInventory,
          daysOnMarket: external.demand.daysOnMarket,
          state: external.demand.state,
          methodology: external.demand.methodology,
          listingSupplySeparate: true,
          note:
            'Area buyer-market snapshot. Not property-specific demand and not rental demand. Internal marketplace listing supply is reported separately and is not this demand figure.',
        }
      : {
          available: false,
          scope: 'area',
          demandType: 'buyer_market',
          propertyLevel: false,
          rentalDemand: false,
          state: 'notAssessed',
          message: 'Area buyer-market demand was not returned for this postcode.',
        },
    rentalDemandIndicators: external.demandRent?.available
      ? {
          available: true,
          scope: 'area',
          demandType: 'rental_market',
          propertyLevel: false,
          rentalDemand: true,
          source: 'PropertyData',
          provider: 'propertydata',
          providerEndpoint: '/demand-rent',
          endpoint: '/demand-rent',
          band: external.demandRent.band,
          value: external.demandRent.value,
          sampleSize: external.demandRent.sampleSize,
          observationPeriod: external.demandRent.observationPeriod,
          observedAt: external.demandRent.observedAt,
          retrievedAt: external.demandRent.retrievedAt,
          confidence: external.demandRent.confidence,
          radius: external.demandRent.radius,
          radiusUnit: external.demandRent.radiusUnit,
          totalForRent: external.demandRent.totalForRent,
          transactionsPerMonth: external.demandRent.transactionsPerMonth,
          turnoverPerMonth: external.demandRent.turnoverPerMonth,
          turnoverPerMonthPercent: external.demandRent.turnoverPerMonthPercent,
          monthsOfInventory: external.demandRent.monthsOfInventory,
          daysOnMarket: external.demandRent.daysOnMarket,
          state: external.demandRent.state,
          methodology: external.demandRent.methodology,
          listingSupplySeparate: true,
          askingRentSeparate: true,
          salesDemandSeparate: true,
          note:
            'Area rental-market snapshot. Not property-specific tenant demand, not rent valuation, and not sales /demand. Internal marketplace listing supply and PropertyData /rents asking rents are reported separately.',
        }
      : {
          available: false,
          scope: 'area',
          demandType: 'rental_market',
          propertyLevel: false,
          rentalDemand: true,
          state: 'notAssessed',
          message: 'Area rental-market demand was not returned for this postcode.',
        },
  };

  const result = {
    success: true,
    layer: 'market_context',
    layerNote:
      'Area market context. The flagship analysis is Individual Property Intelligence — select a property to analyse it.',
    postcode: normalized,
    title: `${normalized} — Property Market Intelligence`,
    retrievedAt,
    externalAvailable: external.available,
    externalMessage: external.available ? null : external.message,
    dataSources,
    confidence,
    snapshot,
    sales: salesSection,
    rental: rentalSection,
    investment: investmentSection,
    lease,
    methodology: {
      summary:
        'All statistics are calculated deterministically in application code. External sold-price data (PropertyData / HM Land Registry) is prioritised where configured. Marketplace listings supplement internal supply and asking-price context only.',
      aiRole: 'AI may summarise this evidence but does not calculate medians, yields, or financial metrics.',
      yieldRules:
        'Segment yields require matched residential sale and rent evidence by type and bedrooms. Broad area yield is labelled separately and never presented as an individual property yield.',
    },
    disclaimers: [
      'Marketplace listing counts do not represent total properties in the postcode.',
      external.available
        ? 'Sold-price statistics reflect HM Land Registry aggregates via PropertyData where returned. /rents figures are area long-let asking rents, not achieved lettings. /demand is an area sales-market snapshot. /demand-rent is an area rental-market snapshot, not property-specific tenant demand and not a time-to-let prediction.'
        : 'External market data unavailable — configure PropertyData for authoritative sold-price evidence.',
      'Indicative yields are gross and before costs — not financial advice.',
    ],
    personalisationHints: [
      { role: 'buyer', label: 'Buying?', action: 'Analyse properties below for price fairness and local context.' },
      { role: 'seller', label: 'Selling?', action: 'Use valuation and comparable evidence when listing.' },
      { role: 'landlord', label: 'Landlord / Investor?', action: 'Review rental and investment tabs for yield by segment.' },
      { role: 'agent', label: 'Estate agent?', action: 'Use area intelligence for vendor reports and pricing conversations.' },
    ],
  };

  result.marketSummary = buildTemplateMarketSummary(result);
  result.marketSummarySource = 'template';
  return result;
}

module.exports = {
  getPostcodeMarketIntelligence,
  buildPropertyMarketContext,
  buildDecisionContext,
  findMatchedSegment,
  buildSegmentKey,
  normalizePropertyTypeLabel,
  buildBroadAreaYield,
};
