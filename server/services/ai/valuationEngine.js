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
const {
  isFinitePositiveMoney,
  isValidBlendEstimate,
  isValidBlendWeight,
  parsePositiveMoney,
  parsePositiveArea,
  optionalPositiveBound,
  isIndependentValuationMethod,
  isAskingListingMethod,
  hasProvenancedAssessableFloorArea,
} = require('./valuationIntegrity');
const {
  evaluateComponentEligibility,
  decideAssessment,
  selectAssessableComponents,
  prepareSoldTransactions,
  lastSoldFact,
} = require('./valuationEligibility');
const {
  ASSESSMENT_SAFETY_VERSION,
  ORDER_OF_MAGNITUDE_RATIO,
  validateSaleComponent,
  evaluatePlausibility,
  validateAssessedBounds,
} = require('./valuationAssessmentSafety');

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

const BLEND_WEIGHTS = {
  valuation_sale_avm: 0.35,
  uprn_profile: 0.3,
  sold_prices_statistics: 0.2,
  internal_sale_comparables: 0.25,
  sqft_implied: 0.15,
};

function resolveBlendWeight(item) {
  if (item && Object.prototype.hasOwnProperty.call(item, 'weight')) {
    return isValidBlendWeight(item.weight) ? Number(item.weight) : null;
  }
  const mapped = BLEND_WEIGHTS[item?.method];
  return isValidBlendWeight(mapped) ? mapped : 0.15;
}

function weightedBlend(estimates) {
  const valid = [];
  (estimates || []).forEach((item) => {
    if (!item || isAskingListingMethod(item.method)) return;
    if (!isIndependentValuationMethod(item.method)) return;
    if (!isValidBlendEstimate(item.centralEstimate)) return;
    const weight = resolveBlendWeight(item);
    if (!isValidBlendWeight(weight)) return;
    valid.push({
      ...item,
      centralEstimate: Number(item.centralEstimate),
      weight,
      lowerEstimate: optionalPositiveBound(item.lowerEstimate),
      upperEstimate: optionalPositiveBound(item.upperEstimate),
    });
  });

  if (!valid.length) return null;
  if (!valid.some((item) => isIndependentValuationMethod(item.method))) return null;

  let totalWeight = 0;
  let weightedSum = 0;
  let lowerSum = 0;
  let upperSum = 0;
  let lowerWeight = 0;
  let upperWeight = 0;

  valid.forEach((item) => {
    totalWeight += item.weight;
    weightedSum += item.centralEstimate * item.weight;
    if (item.lowerEstimate != null) {
      lowerSum += item.lowerEstimate * item.weight;
      lowerWeight += item.weight;
    }
    if (item.upperEstimate != null) {
      upperSum += item.upperEstimate * item.weight;
      upperWeight += item.weight;
    }
  });

  if (!isValidBlendWeight(totalWeight) || !Number.isFinite(weightedSum)) return null;

  const centrals = valid.map((item) => item.centralEstimate);
  const minCentral = Math.min(...centrals);
  const maxCentral = Math.max(...centrals);
  if (valid.length >= 2 && minCentral > 0 && maxCentral / minCentral >= ORDER_OF_MAGNITUDE_RATIO) {
    return null;
  }

  const central = Math.round(weightedSum / totalWeight);
  if (!isFinitePositiveMoney(central)) return null;

  const lower = lowerWeight ? Math.round(lowerSum / lowerWeight) : null;
  const upper = upperWeight ? Math.round(upperSum / upperWeight) : null;
  const safeLower = optionalPositiveBound(lower);
  const safeUpper = optionalPositiveBound(upper);

  return {
    central,
    lower: safeLower,
    upper: safeUpper,
    boundsAvailable: safeLower != null && safeUpper != null,
    evidenceCount: valid.length,
  };
}

function buildSqftImpliedEstimate(property, psfStats, uprnInternalArea = null) {
  if (!hasProvenancedAssessableFloorArea(property, uprnInternalArea)) return null;
  const sqft = parsePositiveArea(property.square_feet);
  const avg = parsePositiveMoney(psfStats?.averagePerSqft);
  if (sqft == null || avg == null) return null;

  const rateUnit = psfStats?.declaredUnit || psfStats?.unit || 'gbp_per_sqft';
  if (String(rateUnit).toLowerCase().replace(/\s+/g, '_') !== 'gbp_per_sqft') return null;

  const central = Math.round(sqft * avg);
  if (!isFinitePositiveMoney(central)) return null;

  const lowPsf = parsePositiveMoney(psfStats.range?.low);
  const highPsf = parsePositiveMoney(psfStats.range?.high);
  const conversionBasis = {
    area: sqft,
    areaUnit: 'sqft',
    rate: avg,
    rateUnit: 'gbp_per_sqft',
  };

  return {
    centralEstimate: central,
    lowerEstimate: lowPsf != null ? Math.round(sqft * lowPsf) : null,
    upperEstimate: highPsf != null ? Math.round(sqft * highPsf) : null,
    pricePerSqft: avg,
    method: 'sqft_implied',
    valueUnit: 'gbp_total',
    conversionBasis,
    source: psfStats.source,
    underlyingSource: psfStats.underlyingSource,
  };
}

function attachComponentContract(component, extras = {}) {
  const next = {
    ...component,
    valueUnit: extras.valueUnit || component.valueUnit || component.declaredUnit || extras.declaredUnit || null,
    declaredUnit: extras.declaredUnit || component.declaredUnit || null,
  };
  return {
    ...next,
    componentValidation: validateSaleComponent(next),
  };
}

function applyValidityToEligibility(eligibility, validation) {
  if (!validation || validation.valid) {
    return { ...eligibility, componentValidation: validation || null };
  }
  return {
    ...eligibility,
    eligibleForAssessment: false,
    canAssessAlone: false,
    rejectionReasons: [...new Set([...(eligibility.rejectionReasons || []), ...validation.reasonCodes])],
    componentValidation: validation,
  };
}

function insufficientValuation({
  askingPrice,
  components,
  internalSale,
  externalTransactions,
  lastSold,
  evidenceEligibility,
  assessmentSafety,
  message,
}) {
  return {
    success: false,
    insufficientEvidence: true,
    notAssessed: true,
    assessmentState: 'notAssessed',
    assessmentSafetyVersion: ASSESSMENT_SAFETY_VERSION,
    assessmentSafety: assessmentSafety || null,
    message:
      message ||
      'Insufficient evidence for a reliable sale valuation. Internal asking listings alone cannot assess sale value, and no eligible property-specific valuation method was available.',
    askingPrice,
    components,
    internalSale,
    externalTransactions: (externalTransactions || []).slice(0, 10),
    lastSold,
    internalComparables: internalSale?.comparables || [],
    evidenceEligibility: evidenceEligibility || null,
  };
}

/**
 * @param {object} property - full property record
 * @param {object} externalEnrichment - from propertyEnrichmentService
 * @param {object} [options]
 * @param {Function} [options.analyseSaleComparables]
 */
async function calculatePropertyValuation(property, externalEnrichment = null, options = {}) {
  const analyseInternal = options.analyseSaleComparables || analyseSaleComparables;
  const askingPrice = parsePositiveMoney(property.price);
  const components = [];
  const externalTransactions = [];

  if (property.category !== 'sale' && askingPrice == null) {
    return {
      success: false,
      message: 'Sale valuation requires a property listed for sale with an asking price.',
      askingPrice: null,
    };
  }

  const enrichments = externalEnrichment?.enrichments || {};

  let providerReportedConfidence = null;
  const valuationEnrichment = enrichments.valuation_sale;
  if (valuationEnrichment?.success && valuationEnrichment?.data) {
    const parsed = parseValuationSaleResponse(valuationEnrichment.data);
    if (parsed && isValidBlendEstimate(parsed.centralEstimate)) {
      providerReportedConfidence = parsed.confidence ?? null;
      components.push(attachComponentContract({
        ...parsed,
        provenance: createProvenance({
          source: 'PropertyData',
          method: 'valuation_sale_avm',
          confidence: parsed.confidence,
          providerEndpoint: '/valuation-sale',
        }),
      }, { declaredUnit: parsed.declaredUnit }));
    }
  }

  const soldPricesEnrichment = enrichments.sold_prices;
  if (soldPricesEnrichment?.success && soldPricesEnrichment?.data) {
    const stats = parseSoldPricesStats(soldPricesEnrichment.data);
    if (stats && isValidBlendEstimate(stats.average)) {
      components.push(attachComponentContract({
        centralEstimate: stats.average,
        lowerEstimate: optionalPositiveBound(stats.range?.low),
        upperEstimate: optionalPositiveBound(stats.range?.high),
        method: stats.method,
        source: stats.source,
        sampleSize: stats.sampleSize,
        provenance: createProvenance({
          source: 'PropertyData',
          method: stats.method,
          notes: stats.underlyingSource,
          providerEndpoint: '/sold-prices',
        }),
      }, { declaredUnit: stats.declaredUnit }));
      const prepared = prepareSoldTransactions(parseSoldTransactionsFromPayload(soldPricesEnrichment.data));
      externalTransactions.push(...prepared.transactions);
    }
  }

  const uprnEnrichment = enrichments.uprn_profile;
  let lastSold = {
    available: false,
    price: null,
    date: null,
    state: 'notAssessed',
  };
  let uprnInternalArea = null;
  if (uprnEnrichment?.success && uprnEnrichment?.data) {
    const profile = parseUprnProfile(uprnEnrichment.data);
    uprnInternalArea = profile.internalArea;
    lastSold = lastSoldFact(profile);
    if (lastSold.available) {
      lastSold.provenance = createProvenance({
        source: 'PropertyData',
        method: 'uprn_profile',
        observedAt: lastSold.date,
        providerEndpoint: '/uprn',
        notes: 'HM Land Registry last sale via PropertyData UPRN. created_at/updated_at are not used.',
      });
    }
    const uprnEst = parseUprnSaleEstimate(uprnEnrichment.data);
    if (uprnEst && isValidBlendEstimate(uprnEst.centralEstimate)) {
      components.push(attachComponentContract({
        centralEstimate: uprnEst.centralEstimate,
        lowerEstimate: optionalPositiveBound(uprnEst.lowerEstimate),
        upperEstimate: optionalPositiveBound(uprnEst.upperEstimate),
        method: uprnEst.method,
        lastSoldPrice: uprnEst.lastSoldPrice,
        lastSoldDate: uprnEst.lastSoldDate,
        provenance: createProvenance({
          source: 'PropertyData',
          method: uprnEst.method,
          notes: uprnEst.underlyingSource,
          providerEndpoint: '/uprn',
        }),
      }, { declaredUnit: uprnEst.declaredUnit }));
    }
  }

  const psfEnrichment = enrichments.sold_prices_per_sqf;
  let psfStats = null;
  if (psfEnrichment?.success && psfEnrichment?.data) {
    psfStats = parseSoldPricesPerSqf(psfEnrichment.data);
    const sqftEst = buildSqftImpliedEstimate(property, psfStats, uprnInternalArea);
    if (sqftEst) {
      components.push(attachComponentContract({
        ...sqftEst,
        provenance: createProvenance({
          source: 'PropertyData',
          method: 'sqft_implied',
          notes: 'Local sold £/sqft applied to listing floor area with provenanced sqft',
          providerEndpoint: '/sold-prices-per-sqf',
        }),
      }, { declaredUnit: 'gbp_total' }));
    }
  }

  let internalSale = null;
  try {
    internalSale = await analyseInternal(property);
  } catch {
    internalSale = { success: false };
  }

  const eligibilityContext = {
    property,
    uprnProfile: uprnEnrichment?.success ? parseUprnProfile(uprnEnrichment.data) : {},
  };
  const evidenceEligibility = components.map((component) =>
    applyValidityToEligibility(
      evaluateComponentEligibility(component, eligibilityContext),
      component.componentValidation || validateSaleComponent(component)
    )
  );
  const assessment = decideAssessment(evidenceEligibility);
  const selectedComponents = assessment.assess
    ? selectAssessableComponents(components, evidenceEligibility)
    : [];
  const assessmentSafety = evaluatePlausibility({
    selectedComponents,
    eligibilities: evidenceEligibility,
    askingPrice,
  });
  const assessedComponents = assessmentSafety.assess ? assessmentSafety.retained : [];
  const blend = assessment.assess && assessmentSafety.assess ? weightedBlend(assessedComponents) : null;
  const bounds = blend ? validateAssessedBounds(blend) : { valid: false };

  if (!blend || !bounds.valid) {
    return insufficientValuation({
      askingPrice,
      components,
      internalSale,
      externalTransactions,
      lastSold,
      evidenceEligibility: { methods: evidenceEligibility, assessment, assessmentSafety },
      assessmentSafety,
    });
  }

  const independentComponents = assessedComponents.filter((c) => isIndependentValuationMethod(c.method));
  const confidenceAssessment = assessConfidence({
    scope: 'sale_valuation',
    comparables: internalSale?.comparables || [],
    target: property,
    dataQuality: internalSale?.dataQuality || null,
    methodEstimates: independentComponents.map((c) => ({ method: c.method, value: c.centralEstimate })),
    providerConfidence: providerReportedConfidence,
    providerCoverageAvailable: Boolean(
      enrichments.valuation_sale?.success ||
        enrichments.sold_prices?.success ||
        enrichments.uprn_profile?.success ||
        enrichments.sold_prices_per_sqf?.success
    ),
  });
  const level = confidenceAssessment.level.toLowerCase();

  const assessableArea = hasProvenancedAssessableFloorArea(property, uprnInternalArea);
  const result = {
    success: true,
    notAssessed: false,
    assessmentState: 'assessed',
    assessmentSafetyVersion: ASSESSMENT_SAFETY_VERSION,
    assessmentSafety,
    askingPrice,
    centralEstimate: wrapValue(bounds.central, {
      source: 'BlendedEvidence',
      method: 'weighted_evidence_blend',
      confidence: level,
    }),
    lowerEstimate:
      bounds.lower != null
        ? wrapValue(bounds.lower, {
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
      bounds.upper != null
        ? wrapValue(bounds.upper, {
            source: 'BlendedEvidence',
            method: 'weighted_evidence_blend',
          })
        : {
            value: null,
            available: false,
            state: 'notAssessed',
            reason: 'No evidenced upper bound was supplied by any valuation method. A ±6% band is not invented.',
          },
    boundsAvailable: Boolean(bounds.boundsAvailable),
    confidence: level,
    confidenceAssessment,
    evidenceCount: blend.evidenceCount,
    evidenceEligibility: {
      methods: evidenceEligibility,
      assessment,
      assessmentSafety,
      assessedMethods: assessedComponents.map((c) => c.method),
      methodFamilies: assessment.families,
    },
    components,
    internalComparables: internalSale?.comparables || [],
    askingListingEvidence: internalSale?.success
      ? {
          present: true,
          evidenceKind: 'asking_listing',
          notTransactionEvidence: true,
          cannotSolelyAssessValuation: true,
          comparableCount: internalSale.comparableCount,
          recommendedPrice: internalSale.recommendedPrice ?? null,
        }
      : null,
    externalTransactions: externalTransactions.slice(0, 10),
    lastSold,
    pricePerSqft: psfStats
      ? wrapValue(psfStats.averagePerSqft, {
          source: 'PropertyData',
          method: 'sold_prices_per_sqf',
          notes: psfStats.underlyingSource,
        })
      : assessableArea && bounds.central
        ? wrapValue(Math.round(bounds.central / parsePositiveArea(property.square_feet)), {
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
      'Weighted blend of independent evidence sources (PropertyData AVM, HM Land Registry statistics, UPRN profile, provenanced £/sqft). Internal asking listings are contextual only.',
    disclaimer:
      'Indicative analytical estimate only — not a RICS survey or mortgage valuation.',
  };

  return result;
}

module.exports = {
  calculatePropertyValuation,
  weightedBlend,
  confidenceFromEvidence,
  buildSqftImpliedEstimate,
  ASSESSMENT_SAFETY_VERSION,
};
