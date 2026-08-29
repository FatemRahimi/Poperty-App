/**
 * Canonical landlord Personal Decision for Property Intelligence.
 * Uses scorePersonalDecision — no second scorer, weights, or formulas.
 */

const { scorePersonalDecision } = require('./personalDecisionEngine');

function numericFinanceValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (
      Object.prototype.hasOwnProperty.call(value, 'value')
      || Object.prototype.hasOwnProperty.call(value, 'amount')
    ) {
      const n = Number(value.value ?? value.amount);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Apply explicit analyse/scenario purchase price onto a clone.
 * Same semantics as What-if offerPrice: listing asking is preserved as listedPrice.
 */
function propertyWithFinanceScenario(property, finance = {}) {
  if (!property || typeof property !== 'object') return property;
  const clone = { ...property };
  const purchase = numericFinanceValue(finance.purchasePrice);
  if (purchase != null) {
    const listing = numericFinanceValue(clone.listedPrice) ?? numericFinanceValue(clone.price);
    if (clone.listedPrice == null && listing != null) clone.listedPrice = listing;
    clone.price = purchase;
  }
  return clone;
}

function intelligenceForLandlordScore({
  confidence = null,
  sale = null,
  rentIntel = null,
  pricePosition = null,
  decisionContext = null,
  areaRentalDemand = null,
  risks = [],
  dataQuality = null,
  opportunities = null,
  comparableCount = 0,
  marketIntelligence = null,
  presentedInvestment = null,
} = {}) {
  return {
    confidence,
    sale,
    rentIntel,
    rent: rentIntel,
    pricePosition,
    decisionContext,
    areaRentalDemand,
    risks: Array.isArray(risks) ? risks : [],
    dataQuality,
    opportunities,
    comparableCount,
    presentedInvestment: presentedInvestment || null,
    marketIntelligence: marketIntelligence || {
      sale,
      rent: rentIntel,
      pricePosition,
      decisionContext,
      areaRentalDemand,
    },
  };
}

function intelligenceFromCanonicalReport(report = {}) {
  const market = report.marketIntelligence || {};
  return intelligenceForLandlordScore({
    confidence: report.confidence || null,
    sale: market.sale || null,
    rentIntel: market.rent || null,
    pricePosition: market.pricePosition || null,
    decisionContext: market.decisionContext || null,
    areaRentalDemand: market.areaRentalDemand || null,
    // TECHNICAL DEBT: report.risks is the pre-v1 heuristic register retained
    // so Personal Decision risk and What-if re-score stay numerically stable.
    risks: report.risks || [],
    dataQuality: report.dataQuality || null,
    opportunities: report.opportunities || null,
    comparableCount: market.comparableCount || 0,
    marketIntelligence: market,
    // presentedInvestment is live canonical assemble only. Omitting it here
    // keeps What-if on its frozen scoring path.
  });
}

function scoreCanonicalLandlordDecision({
  property,
  finance = {},
  intelligence = {},
  asOf,
  preferences = {},
} = {}) {
  return scorePersonalDecision({
    profile: 'landlord',
    property: propertyWithFinanceScenario(property, finance),
    preferences,
    intelligence,
    finance,
    asOf,
  });
}

function publicLandlordPersonalDecision(decision) {
  if (!decision) return null;
  const dimensions = {};
  Object.entries(decision.dimensions || {}).forEach(([key, value]) => {
    dimensions[key] = {
      key: value.key || key,
      weight: value.weight,
      available: Boolean(value.available),
      score: value.available ? value.score : null,
      state: value.state || (value.available ? 'assessed' : 'notAssessed'),
      evidence: value.evidence || [],
      unavailableReason: value.available ? null : value.unavailableReason || null,
    };
  });
  return {
    profile: 'landlord',
    available: Boolean(decision.available),
    state: decision.available ? 'assessed' : 'notAssessed',
    score: Number.isFinite(decision.score) ? decision.score : null,
    outcome: decision.outcome || null,
    decision: decision.decision || null,
    decisionStrength: decision.decisionStrength || 'none',
    dimensions,
    notAssessed: decision.notAssessed || [],
    coverage: decision.coverage || null,
    constraintFailures: decision.constraintFailures || [],
    explanation: decision.deterministicExplanation || null,
    model: decision.model || null,
    confidence: decision.confidence || null,
    unavailableReason: decision.unavailableReason || null,
    assessedAt: decision.assessedAt || null,
    marketContext: decision.marketContext || null,
    scoreLabel: 'Landlord fit score',
    role: 'landlord_fit',
    notPurchaseAdvice: true,
    notInvestmentQualityScore: true,
    notConfidence: true,
  };
}

function scorePublicLandlordPersonalDecision(input = {}) {
  return publicLandlordPersonalDecision(scoreCanonicalLandlordDecision(input));
}

module.exports = {
  numericFinanceValue,
  propertyWithFinanceScenario,
  intelligenceForLandlordScore,
  intelligenceFromCanonicalReport,
  scoreCanonicalLandlordDecision,
  publicLandlordPersonalDecision,
  scorePublicLandlordPersonalDecision,
};
