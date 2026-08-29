/**
 * Evidence-driven sale valuation — combines external AVM, market statistics,
 * internal comparables and £/sqft. Never uses LLM for arithmetic.
 */

const { createProvenance, wrapValue } = require('../../utils/provenance');
const { assessConfidence } = require('./confidenceEngine');
const { analyseSaleComparables } = require('./saleIntelligenceService');
const {
  parseValuationSaleResponse,
  parseSoldPricesStats,
  parseSoldPricesPerSqf,
  parseUprnProfile,
  parseUprnSaleEstimate,
  parseSoldTransactionsFromPayload,
} = require('../providers/propertyData/propertyDataParsers');

/**
 * Counts corroborating sources only. Retained because callers still use it as a
 * coarse signal, but it is no longer what drives valuation confidence — see
 * confidenceEngine, which judges evidence quality rather than source count.
 */
function confidenceFromEvidence(signals) {
  const count = signals.filter(Boolean).length;
  if (count >= 3) return 'high';
  if (count >= 2) return 'medium';
  if (count >= 1) return 'low';
  return 'insufficient';
}

function weightedBlend(estimates) {
  const valid = estimates.filter((e) => e && e.centralEstimate > 0);
  if (!valid.length) return null;

  const weightMap = {
    valuation_sale_avm: 0.35,
    uprn_profile: 0.3,
    sold_prices_statistics: 0.2,
    internal_sale_comparables: 0.25,
    sqft_implied: 0.15,
  };

  let totalWeight = 0;
  let weightedSum = 0;
  let lowerSum = 0;
  let upperSum = 0;
  let lowerWeight = 0;
  let upperWeight = 0;

  valid.forEach((item) => {
    const w = weightMap[item.method] || 0.15;
    totalWeight += w;
    weightedSum += item.centralEstimate * w;
    if (item.lowerEstimate) {
      lowerSum += item.lowerEstimate * w;
      lowerWeight += w;
    }
    if (item.upperEstimate) {
      upperSum += item.upperEstimate * w;
      upperWeight += w;
    }
  });

  const central = Math.round(weightedSum / totalWeight);
  const lower = lowerWeight ? Math.round(lowerSum / lowerWeight) : null;
  const upper = upperWeight ? Math.round(upperSum / upperWeight) : null;

  return {
    central,
    lower,
    upper,
    boundsAvailable: lower != null && upper != null,
    evidenceCount: valid.length,
  };
}

function buildSqftImpliedEstimate(property, psfStats) {
  const sqft = Number(property.square_feet);
  const avg = psfStats?.averagePerSqft;
  if (!sqft || !avg) return null;

  const central = Math.round(sqft * avg);
  const lowPsf = psfStats.range?.low;
  const highPsf = psfStats.range?.high;

  return {
    centralEstimate: central,
    lowerEstimate: Number.isFinite(lowPsf) ? Math.round(sqft * lowPsf) : null,
    upperEstimate: Number.isFinite(highPsf) ? Math.round(sqft * highPsf) : null,
    pricePerSqft: avg,
    method: 'sqft_implied',
    source: psfStats.source,
    underlyingSource: psfStats.underlyingSource,
  };
}

/**
 * @param {object} property - full property record
 * @param {object} externalEnrichment - from propertyEnrichmentService
 */
async function calculatePropertyValuation(property, externalEnrichment = null) {
  const askingPrice = Number(property.price) || 0;
  const components = [];
  const externalTransactions = [];

  if (property.category !== 'sale' && askingPrice <= 0) {
    return {
      success: false,
      message: 'Sale valuation requires a property listed for sale with an asking price.',
      askingPrice,
    };
  }

  const enrichments = externalEnrichment?.enrichments || {};

  let providerReportedConfidence = null;
  const valuationEnrichment = enrichments.valuation_sale;
  if (valuationEnrichment?.success && valuationEnrichment?.data) {
    const parsed = parseValuationSaleResponse(valuationEnrichment.data);
    if (parsed) {
      providerReportedConfidence = parsed.confidence ?? null;
      components.push({
        ...parsed,
        provenance: createProvenance({
          source: 'PropertyData',
          method: 'valuation_sale_avm',
          confidence: parsed.confidence,
          providerEndpoint: '/valuation-sale',
        }),
      });
    }
  }

  const soldPricesEnrichment = enrichments.sold_prices;
  if (soldPricesEnrichment?.success && soldPricesEnrichment?.data) {
    const stats = parseSoldPricesStats(soldPricesEnrichment.data);
    if (stats) {
      components.push({
        centralEstimate: stats.average,
        lowerEstimate: stats.range.low,
        upperEstimate: stats.range.high,
        method: stats.method,
        source: stats.source,
        sampleSize: stats.sampleSize,
        provenance: createProvenance({
          source: 'PropertyData',
          method: stats.method,
          notes: stats.underlyingSource,
          providerEndpoint: '/sold-prices',
        }),
      });
      externalTransactions.push(...parseSoldTransactionsFromPayload(soldPricesEnrichment.data));
    }
  }

  const uprnEnrichment = enrichments.uprn_profile;
  let lastSold = {
    available: false,
    price: null,
    date: null,
    state: 'notAssessed',
  };
  if (uprnEnrichment?.success && uprnEnrichment?.data) {
    const profile = parseUprnProfile(uprnEnrichment.data);
    if (profile.lastSoldPrice || profile.lastSoldDate) {
      lastSold = {
        available: true,
        price: profile.lastSoldPrice,
        date: profile.lastSoldDate,
        state: 'observed',
        provenance: createProvenance({
          source: 'PropertyData',
          method: 'uprn_profile',
          observedAt: profile.lastSoldDate,
          providerEndpoint: '/uprn',
          notes: 'HM Land Registry last sale via PropertyData UPRN. created_at/updated_at are not used.',
        }),
      };
    }
    const uprnEst = parseUprnSaleEstimate(uprnEnrichment.data);
    if (uprnEst) {
      components.push({
        centralEstimate: uprnEst.centralEstimate,
        lowerEstimate: Number.isFinite(uprnEst.lowerEstimate)
          ? uprnEst.lowerEstimate
          : null,
        upperEstimate: Number.isFinite(uprnEst.upperEstimate)
          ? uprnEst.upperEstimate
          : null,
        method: uprnEst.method,
        lastSoldPrice: uprnEst.lastSoldPrice,
        lastSoldDate: uprnEst.lastSoldDate,
        provenance: createProvenance({
          source: 'PropertyData',
          method: uprnEst.method,
          notes: uprnEst.underlyingSource,
          providerEndpoint: '/uprn',
        }),
      });
    }
  }

  const psfEnrichment = enrichments.sold_prices_per_sqf;
  let psfStats = null;
  if (psfEnrichment?.success && psfEnrichment?.data) {
    psfStats = parseSoldPricesPerSqf(psfEnrichment.data);
    const sqftEst = buildSqftImpliedEstimate(property, psfStats);
    if (sqftEst) {
      components.push({
        ...sqftEst,
        provenance: createProvenance({
          source: 'PropertyData',
          method: 'sqft_implied',
          notes: 'Local sold £/sqft applied to listing floor area',
          providerEndpoint: '/sold-prices-per-sqf',
        }),
      });
    }
  }

  let internalSale = null;
  try {
    internalSale = await analyseSaleComparables(property);
    if (internalSale.success) {
      components.push({
        centralEstimate: internalSale.recommendedPrice,
        lowerEstimate: internalSale.marketRange.low,
        upperEstimate: internalSale.marketRange.high,
        method: 'internal_sale_comparables',
        comparableCount: internalSale.comparableCount,
        provenance: internalSale.provenance,
      });
    }
  } catch {
    internalSale = { success: false };
  }

  const blend = weightedBlend(components);

  if (!blend) {
    return {
      success: false,
      insufficientEvidence: true,
      message:
        'Insufficient evidence for a reliable sale valuation. External market data and internal comparables were unavailable.',
      askingPrice,
      components,
      internalSale,
      externalTransactions: externalTransactions.slice(0, 10),
      lastSold,
    };
  }

  const confidenceAssessment = assessConfidence({
    scope: 'sale_valuation',
    comparables: internalSale?.comparables || [],
    target: property,
    dataQuality: internalSale?.dataQuality || null,
    methodEstimates: components.map((c) => ({ method: c.method, value: c.centralEstimate })),
    providerConfidence: providerReportedConfidence,
    providerCoverageAvailable: Boolean(
      enrichments.valuation_sale?.success ||
        enrichments.sold_prices?.success ||
        enrichments.uprn_profile?.success ||
        enrichments.sold_prices_per_sqf?.success
    ),
  });
  const level = confidenceAssessment.level.toLowerCase();

  const result = {
    success: true,
    askingPrice: askingPrice || null,
    centralEstimate: wrapValue(blend.central, {
      source: 'BlendedEvidence',
      method: 'weighted_evidence_blend',
      confidence: level,
    }),
    lowerEstimate:
      blend.lower != null
        ? wrapValue(blend.lower, {
            source: 'BlendedEvidence',
            method: 'weighted_evidence_blend',
          })
        : {
            value: null,
            available: false,
            state: 'notAssessed',
            reason: 'No evidenced lower bound was supplied by any valuation method. A ±6% band is not invented.',
          },
    upperEstimate:
      blend.upper != null
        ? wrapValue(blend.upper, {
            source: 'BlendedEvidence',
            method: 'weighted_evidence_blend',
          })
        : {
            value: null,
            available: false,
            state: 'notAssessed',
            reason: 'No evidenced upper bound was supplied by any valuation method. A ±6% band is not invented.',
          },
    boundsAvailable: Boolean(blend.boundsAvailable),
    confidence: level,
    confidenceAssessment,
    evidenceCount: blend.evidenceCount,
    components,
    internalComparables: internalSale?.comparables || [],
    externalTransactions: externalTransactions.slice(0, 10),
    lastSold,
    pricePerSqft: psfStats
      ? wrapValue(psfStats.averagePerSqft, {
          source: 'PropertyData',
          method: 'sold_prices_per_sqf',
          notes: psfStats.underlyingSource,
        })
      : property.square_feet && blend.central
        ? wrapValue(Math.round(blend.central / Number(property.square_feet)), {
            source: 'BlendedEvidence',
            method: 'implied_from_central_estimate',
          })
        : null,
    localPricePerSqft: psfStats?.range
      ? {
          low: psfStats.range.low,
          high: psfStats.range.high,
          average: psfStats.averagePerSqft,
        }
      : null,
    methodology:
      'Weighted blend of available evidence sources (PropertyData AVM, HM Land Registry statistics, UPRN profile, internal comparables, £/sqft).',
    disclaimer:
      'Indicative analytical estimate only — not a RICS survey or mortgage valuation.',
  };

  return result;
}

module.exports = { calculatePropertyValuation, weightedBlend, confidenceFromEvidence };
