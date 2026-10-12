/**
 * V1.2 — Valuation Evidence Readiness Study (read-only).
 * Traces identity → sources → parsing → eligibility → assessment safety → valuation.
 * Uses persisted enrichments only — no new PropertyData API calls.
 *
 * Usage: node scripts/valuation-evidence-readiness-study.js
 */
require('../config/loadEnv');
const pool = require('../models/db');
const { ensureIntelligenceSchema } = require('../db/ensureIntelligenceSchema');
const { extractCanonicalAddress } = require('../services/identity/canonicalAddress');
const { queryOfficialSaleTransactions } = require('../services/market/officialSaleTransactionQuery');
const { listEnrichmentsForProperty } = require('../services/enrichment/propertyIdentityRepository');
const { calculatePropertyValuation } = require('../services/ai/valuationEngine');
const {
  parseValuationSaleResponse,
  parseSoldPricesStats,
  parseSoldPricesPerSqf,
  parseUprnProfile,
  parseUprnSaleEstimate,
} = require('../services/providers/propertyData/propertyDataParsers');
const {
  evaluateComponentEligibility,
  applyValidityToEligibility,
  decideAssessment,
} = require('../services/ai/valuationEligibility');
const { validateSaleComponent } = require('../services/ai/valuationAssessmentSafety');
const { analyseSaleComparables, fetchSaleComparables } = require('../services/ai/saleIntelligenceService');
const { auditOutcomeCollection } = require('../services/ai/outcomeCollectionService');
const { loadBacktestDataset } = require('../services/ai/backtesting/backtestRepository');

const ASOF = '2026-09-01T20:00:00.000Z';
const HISTORICAL_232_PROPERTY_ID = 155;

const ENRICHMENT_TYPES = [
  'valuation_sale',
  'sold_prices',
  'uprn_profile',
  'sold_prices_per_sqf',
];

function summarisePayloadKeys(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  return Object.keys(root).slice(0, 30);
}

function auditPropertyDataPayload(type, row) {
  if (!row) {
    return { state: 'NOT_REQUESTED', cached: false };
  }
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
  const base = {
    state: 'RETURNED',
    cached: true,
    retrievedAt: row.retrieved_at,
    expiresAt: row.expires_at,
    topLevelKeys: summarisePayloadKeys(payload),
    provenance: row.provenance,
  };
  if (type === 'valuation_sale') {
    const parsed = parseValuationSaleResponse(payload);
    base.parsed = parsed
      ? {
          centralEstimate: parsed.centralEstimate,
          margin: parsed.margin,
          confidence: parsed.confidence,
          declaredUnit: parsed.declaredUnit,
          method: parsed.method,
        }
      : null;
    base.parseState = parsed ? 'PARSED' : 'REJECTED';
    base.propertySpecific = parsed ? true : null;
    base.geography = 'property-level AVM (provider contract)';
  }
  if (type === 'sold_prices') {
    const parsed = parseSoldPricesStats(payload);
    base.parsed = parsed
      ? {
          average: parsed.average,
          range: parsed.range,
          sampleSize: parsed.sampleSize,
          declaredUnit: parsed.declaredUnit,
          method: parsed.method,
        }
      : null;
    base.parseState = parsed ? 'PARSED' : 'REJECTED';
    base.propertySpecific = false;
    base.geography = 'postcode/area statistics';
  }
  if (type === 'uprn_profile') {
    const profile = parseUprnProfile(payload);
    const est = parseUprnSaleEstimate(payload);
    base.parsed = {
      uprn: profile.uprn,
      internalArea: profile.internalArea,
      lastSold: profile.lastSold,
      saleEstimate: est
        ? {
            centralEstimate: est.centralEstimate,
            method: est.method,
            declaredUnit: est.declaredUnit,
          }
        : null,
    };
    base.parseState = est ? 'PARSED' : profile.uprn ? 'PARSED_PARTIAL' : 'REJECTED';
    base.propertySpecific = Boolean(est);
  }
  if (type === 'sold_prices_per_sqf') {
    const parsed = parseSoldPricesPerSqf(payload);
    base.parsed = parsed
      ? {
          averagePerSqft: parsed.averagePerSqft,
          range: parsed.range,
          declaredUnit: parsed.declaredUnit,
        }
      : null;
    base.parseState = parsed ? 'PARSED' : 'REJECTED';
    base.propertySpecific = false;
    base.geography = 'area £/sqft rate';
  }
  return base;
}

async function buildExternalEnrichmentFromCache(propertyId) {
  const rows = await listEnrichmentsForProperty(propertyId);
  const byType = {};
  rows.forEach((row) => {
    if (row.source === 'PropertyData') {
      byType[row.enrichment_type] = row;
    }
  });
  const enrichments = {};
  ENRICHMENT_TYPES.forEach((type) => {
    const row = byType[type];
    if (!row) return;
    enrichments[type] = {
      success: true,
      enrichmentType: type,
      source: 'PropertyData',
      data: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      fromPersistence: true,
      cacheHit: true,
      creditsUsed: 0,
    };
  });
  return {
    available: Object.keys(enrichments).length > 0,
    enrichments,
    sources: Object.keys(enrichments).map((k) => `PropertyData:${k}`),
    cacheOnly: true,
  };
}

function classifyInternalComparableGap(target, candidates, ranked, internalResult) {
  if (internalResult?.success) {
    return {
      cause: 'ASKING_NOT_TRANSACTION',
      candidateCount: candidates.length,
      rankedCount: ranked.length,
      note: 'Internal asking listings found but cannot solely assess valuation',
    };
  }
  if (!candidates.length) return { cause: 'NO_CANDIDATES', candidateCount: 0, rankedCount: 0 };
  if (!ranked.length) {
    const hasCity = Boolean(target.city);
    const hasType = Boolean(target.property_type);
    if (!hasCity) return { cause: 'GEOGRAPHIC_FILTER', candidateCount: candidates.length, rankedCount: 0 };
    if (!hasType) return { cause: 'PROPERTY_TYPE_MISMATCH', candidateCount: candidates.length, rankedCount: 0 };
    return { cause: 'OTHER', candidateCount: candidates.length, rankedCount: 0 };
  }
  return { cause: 'PRICE_INVALID', candidateCount: candidates.length, rankedCount: ranked.length };
}

async function traceInternalComparables(property) {
  const candidates = await fetchSaleComparables({
    city: property.city,
    propertyType: property.property_type,
    bedrooms: property.bedrooms,
  });
  const internal = await analyseSaleComparables(property);
  const { rankSaleComparables } = require('../services/ai/comparableEngine');
  const ranked = rankSaleComparables(
    {
      id: property.id,
      city: property.city,
      zip_code: property.zip_code,
      bedrooms: property.bedrooms,
      property_type: property.property_type,
      price: property.price,
      latitude: property.latitude,
      longitude: property.longitude,
    },
    candidates,
    30
  );
  const gap = classifyInternalComparableGap(property, candidates, ranked, internal);
  return {
    state: internal.success ? 'RETURNED' : ranked.length ? 'REJECTED' : 'SKIPPED',
    eligibleForValuation: false,
    evidenceKind: 'asking_listing',
    cannotSolelyAssess: true,
    comparableCount: internal.comparableCount || ranked.length,
    gap,
    comparablesSample: (internal.comparables || []).slice(0, 3).map((c) => ({
      id: c.id,
      price: c.price,
      city: c.city,
      property_type: c.property_type,
    })),
  };
}

async function traceHmlr(property, identity) {
  const result = await queryOfficialSaleTransactions({
    identity: { ...identity, uprn: property.uprn || identity.uprn },
    property,
  });
  return {
    status: result.status,
    matchMethod: result.matchMethod,
    subjectTransactionCount: result.subjectOfficialTransactionCount ?? result.subjectTransactions?.length ?? 0,
    areaTransactionCount: result.areaOfficialTransactionCount ?? result.areaTransactions?.length ?? 0,
    uprnAvailable: result.uprnAvailable,
    latestOfficialTransactionDate: result.latestOfficialTransactionDate,
    subjectReachesValuation: false,
    areaIsContextOnly: true,
    note: 'HMLR transactions are not auto-promoted to valuation components in current methodology',
    subjectSample: (result.subjectTransactions || []).slice(0, 2).map((tx) => ({
      price: tx.price,
      transfer_date: tx.transfer_date,
      paon: tx.paon,
      saon: tx.saon,
    })),
  };
}

function traceValuationPath(property, externalEnrichment) {
  return calculatePropertyValuation(property, externalEnrichment, {
    asOf: ASOF,
  });
}

function componentTrace(valuationResult) {
  const components = valuationResult.components || [];
  const eligibility = valuationResult.evidenceEligibility?.methods || [];
  const assessment = valuationResult.evidenceEligibility?.assessment || null;
  const safety = valuationResult.evidenceEligibility?.assessmentSafety
    || valuationResult.assessmentSafety
    || null;

  return {
    componentCount: components.length,
    components: components.map((c) => ({
      method: c.method,
      centralEstimate: c.centralEstimate,
      declaredUnit: c.declaredUnit,
      validation: c.componentValidation || validateSaleComponent(c),
    })),
    eligibility: eligibility.map((e) => ({
      method: e.method,
      eligibleForAssessment: e.eligibleForAssessment,
      canAssessAlone: e.canAssessAlone,
      propertySpecificity: e.propertySpecificity,
      transactionBasis: e.transactionBasis,
      rejectionReasons: e.rejectionReasons,
      limitations: e.limitations,
    })),
    assessmentDecision: assessment,
    assessmentSafety: safety
      ? {
          assess: safety.assess,
          reason: safety.reason,
          situation: safety.situation,
          quarantined: safety.quarantined,
          retainedMethods: (safety.retained || []).map((r) => r.method),
        }
      : null,
    outcome: valuationResult.success
      ? 'ASSESSED'
      : valuationResult.notAssessed
        ? 'NOT_ASSESSED'
        : 'FAILED',
    message: valuationResult.message || null,
    centralEstimate: valuationResult.centralEstimate || null,
  };
}

async function inventoryIdentityFunnel(rows) {
  const total = rows.length;
  const saleWithPrice = rows.filter((p) => p.category === 'sale' && Number(p.price) > 0);
  const withPostcode = rows.filter((p) => (p.zip_code || p.postcode || p.identity_postcode || '').trim());
  const withPaon = rows.filter((p) => (p.paon || '').trim());
  const unitLike = rows.filter((p) => /flat|apartment|maisonette|unit/i.test(p.property_type || ''));
  const unitWithSaon = unitLike.filter((p) => (p.saon || '').trim());
  const withUprn = rows.filter((p) => (p.uprn || '').trim());

  let hmlrExact = 0;
  let hmlrAreaOnly = 0;
  for (const p of saleWithPrice) {
    const identity = extractCanonicalAddress(p);
    const h = await traceHmlr(p, identity);
    if (h.subjectTransactionCount > 0) hmlrExact += 1;
    else if (h.areaTransactionCount > 0) hmlrAreaOnly += 1;
  }

  const enrichmentCounts = { valuation_sale: 0, sold_prices: 0, uprn_profile: 0, sold_prices_per_sqf: 0 };
  let assessedWithCache = 0;
  let componentsButNotAssessed = 0;
  let noComponents = 0;

  for (const p of saleWithPrice) {
    const cached = await buildExternalEnrichmentFromCache(p.id);
    ENRICHMENT_TYPES.forEach((t) => {
      if (cached.enrichments[t]) enrichmentCounts[t] += 1;
    });
    const val = traceValuationPath(p, cached);
    if (val.success) assessedWithCache += 1;
    else if ((val.components || []).length) componentsButNotAssessed += 1;
    else noComponents += 1;
  }

  return {
    totalProperties: total,
    saleCompatibleWithPrice: saleWithPrice.length,
    pct: (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null),
    identity: {
      withPostcode: { count: withPostcode.length, pct: Math.round((withPostcode.length / total) * 1000) / 10 },
      withPaon: { count: withPaon.length, pct: Math.round((withPaon.length / total) * 1000) / 10 },
      unitLike: unitLike.length,
      unitLikeWithSaon: { count: unitWithSaon.length, pct: unitLike.length ? Math.round((unitWithSaon.length / unitLike.length) * 1000) / 10 : null },
      withUprn: { count: withUprn.length, pct: Math.round((withUprn.length / total) * 1000) / 10 },
      hmlrExactMatchOnSale: { count: hmlrExact, pct: Math.round((hmlrExact / saleWithPrice.length) * 1000) / 10 },
      hmlrAreaOnlyOnSale: { count: hmlrAreaOnly, pct: Math.round((hmlrAreaOnly / saleWithPrice.length) * 1000) / 10 },
    },
    providerCache: {
      valuation_sale: enrichmentCounts.valuation_sale,
      sold_prices: enrichmentCounts.sold_prices,
      uprn_profile: enrichmentCounts.uprn_profile,
      sold_prices_per_sqf: enrichmentCounts.sold_prices_per_sqf,
    },
    valuationWithCacheOnly: {
      assessed: assessedWithCache,
      componentsButNotAssessed,
      noComponents,
      assessedPct: Math.round((assessedWithCache / saleWithPrice.length) * 1000) / 10,
    },
  };
}

async function loadProperties() {
  const result = await pool.query(`
    SELECT
      p.*,
      pi.uprn,
      pi.paon,
      pi.saon,
      pi.postcode AS identity_postcode,
      pi.postcode_compact,
      (SELECT COUNT(*)::int FROM official_epb_certificates e
         WHERE e.property_id = p.id AND e.is_current = TRUE) AS epb_count
    FROM properties p
    LEFT JOIN property_identities pi ON pi.property_id = p.id
    ORDER BY p.id
  `);
  return result.rows;
}

async function historical232Review() {
  const rows = await pool.query(`
    SELECT id, property_id, created_at,
      output_data->'marketIntelligence'->'sale' AS sale_val,
      output_data->'marketIntelligence'->'pricePosition' AS price_pos,
      output_data->'residentialMethodology' AS methodology
    FROM ai_requests
    WHERE request_type = 'property_intelligence'
      AND property_id = $1
    ORDER BY id
  `, [HISTORICAL_232_PROPERTY_ID]);

  const property = (await pool.query('SELECT * FROM properties WHERE id = $1', [HISTORICAL_232_PROPERTY_ID])).rows[0];
  const cached = property ? await buildExternalEnrichmentFromCache(property.id) : { enrichments: {} };
  const currentVal = property ? traceValuationPath(property, cached) : null;

  const historical = rows.rows.map((r) => ({
    aiRequestId: r.id,
    createdAt: r.created_at,
    centralEstimate: r.sale_val?.centralEstimate ?? r.sale_val?.value ?? null,
    assessmentState: r.sale_val?.assessmentState ?? r.sale_val?.state ?? null,
    methodology: r.methodology,
  }));

  return {
    propertyId: HISTORICAL_232_PROPERTY_ID,
    listingPrice: property?.price ?? null,
    historicalSnapshots: historical,
    currentWithCache: currentVal
      ? {
          outcome: currentVal.success ? 'ASSESSED' : 'NOT_ASSESSED',
          message: currentVal.message,
          componentMethods: (currentVal.components || []).map((c) => c.method),
          safetyReason: currentVal.assessmentSafety?.reason || currentVal.evidenceEligibility?.assessmentSafety?.reason,
        }
      : null,
    regressionNote:
      'Historical £232 path preserved for audit; current safety blocks asking-only / insufficient independent evidence',
  };
}

async function pickSample(allRows) {
  const forced = allRows.find((p) => p.id === HISTORICAL_232_PROPERTY_ID);
  const sale = allRows.filter((p) => p.category === 'sale' && Number(p.price) > 0);
  const strongest = [...sale].sort((a, b) => Number(b.price) - Number(a.price))[0];
  const flat = sale.find((p) => /flat|apartment|maisonette/i.test(p.property_type || ''));
  const uprn = allRows.find((p) => p.uprn);
  const epb = allRows.find((p) => p.epb_count > 0);
  const normalHouse = sale.find((p) => /terraced|detached|semi/i.test(p.property_type || ''));

  const ids = new Map();
  [
    ['strongest_sale', strongest],
    ['normal_house', normalHouse],
    ['flat_unit', flat],
    ['with_uprn', uprn],
    ['with_epb', epb],
    ['historical_232', forced],
    ['mid_price_sale', sale[Math.floor(sale.length / 2)]],
  ].forEach(([role, p]) => {
    if (p) ids.set(p.id, role);
  });

  return Array.from(ids.entries()).map(([id, role]) => ({
    role,
    property: allRows.find((p) => p.id === id),
  }));
}

async function traceProperty(property, role) {
  const identity = extractCanonicalAddress(property);
  const enrichRows = await listEnrichmentsForProperty(property.id);
  const pdByType = {};
  enrichRows.filter((r) => r.source === 'PropertyData').forEach((r) => {
    pdByType[r.enrichment_type] = r;
  });

  const propertyDataAudit = {};
  ENRICHMENT_TYPES.forEach((type) => {
    propertyDataAudit[type] = auditPropertyDataPayload(type, pdByType[type]);
  });

  const externalEnrichment = await buildExternalEnrichmentFromCache(property.id);
  const hmlr = await traceHmlr(property, identity);
  const internal = await traceInternalComparables(property);
  const valuation = traceValuationPath(property, externalEnrichment);
  const path = componentTrace(valuation);

  return {
    role,
    propertyId: property.id,
    title: property.title,
    category: property.category,
    price: property.price,
    property_type: property.property_type,
    bedrooms: property.bedrooms,
    city: property.city,
    zip_code: property.zip_code,
    identity: {
      postcode: identity.postcode || property.zip_code,
      paon: identity.paon || property.paon,
      saon: identity.saon || property.saon,
      uprn: property.uprn || identity.uprn,
      epbCount: property.epb_count,
    },
    propertyData: propertyDataAudit,
    hmlr,
    internalComparables: internal,
    valuation: path,
  };
}

async function outcomeStatus() {
  try {
    const dataset = await loadBacktestDataset();
    const audit = auditOutcomeCollection(dataset);
    return {
      uniqueSaleOutcomes: audit.pairing?.uniqueSaleOutcomes ?? audit.uniqueSaleOutcomes ?? 0,
      eligiblePredictions: audit.metrics?.eligiblePredictions ?? 'UNKNOWN',
      calibrationReadiness: audit.metrics?.calibrationReadiness ?? 'NO_DATA',
      firstOutcomeBlockers: audit.firstOutcomeBlockers,
    };
  } catch (err) {
    return { error: err.message, uniqueSaleOutcomes: 'UNKNOWN' };
  }
}

async function main() {
  await ensureIntelligenceSchema();
  const allRows = await loadProperties();
  const funnel = await inventoryIdentityFunnel(allRows);
  const sample = await pickSample(allRows);
  const traces = [];
  for (const row of sample) {
    if (row.property) traces.push(await traceProperty(row.property, row.role));
  }
  const historical232 = await historical232Review();
  const outcomes = await outcomeStatus();

  const output = {
    study: 'V1.2_VALUATION_EVIDENCE_READINESS',
    measuredAt: ASOF,
    constraints: {
      noNewProviderCalls: true,
      cacheAndPersistenceOnly: true,
      noMethodologyChanges: true,
    },
    inventoryCount: allRows.length,
    funnel,
    sampleTraces: traces,
    historical232,
    outcomes,
  };

  console.log(JSON.stringify(output, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
