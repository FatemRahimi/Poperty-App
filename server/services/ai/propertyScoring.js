/**
 * Intelligence scoring — documented weighted model by property category.
 */

const { assessConfidence } = require('./confidenceEngine');

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

const RESIDENTIAL_WEIGHTS = {
  market: 0.2,
  rent: 0.2,
  investment: 0.25,
  demand: 0.15,
  risk: 0.1,
  dataQuality: 0.1,
};

const COMMERCIAL_WEIGHTS = {
  market: 0.18,
  rent: 0.22,
  investment: 0.22,
  demand: 0.13,
  risk: 0.12,
  dataQuality: 0.13,
};

function labelFromScore(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= 80) return 'Strong';
  if (score >= 65) return 'Good';
  if (score >= 50) return 'Moderate';
  if (score >= 35) return 'Weak';
  return 'Limited';
}

function component(score, state, detail) {
  return { available: true, score: clamp(score), state, detail };
}

function componentUnavailable(state, reason) {
  return { available: false, score: null, state, reason };
}

/**
 * Per-dimension intelligence components.
 *
 * This deliberately no longer produces an aggregate `overall`. The previous
 * weighted blend mixed property quality, investment attractiveness, rent position,
 * demand, risk and data completeness into one number, so it could not be
 * interpreted or acted on — a property could score identically for opposite
 * reasons. It is superseded by the explicit Property Assessment and Personal Fit
 * axes; `overall` is retained as `null` for API compatibility only.
 *
 * Components that cannot be evidenced return `available: false` with a reason.
 * No dimension is filled with a neutral placeholder.
 */
function calculateIntelligenceScores(ctx) {
  const {
    property,
    dataQuality,
    rentIntel,
    investment,
    risks,
    opportunities,
    comparableCount,
  } = ctx;

  const weights =
    property.property_category === 'commercial' ? COMMERCIAL_WEIGHTS : RESIDENTIAL_WEIGHTS;

  // --- Market: requires comparable evidence. Previously started at a base of 40. ---
  let market;
  if (!comparableCount) {
    market = componentUnavailable(
      'no_comparable_evidence',
      'No comparable properties were found, so market position cannot be assessed.'
    );
  } else {
    let s = 45;
    if (comparableCount >= 10) s += 35;
    else if (comparableCount >= 5) s += 28;
    else if (comparableCount >= 3) s += 18;
    else s += 8;
    if (property.city && property.zip_code) s += 10;
    market = component(
      s,
      comparableCount >= 5 ? 'well_evidenced' : 'thinly_evidenced',
      `${comparableCount} comparable${comparableCount === 1 ? '' : 's'} available`
    );
  }

  // --- Rent: position requires both a market range and a current rent to compare. ---
  let rent;
  const currentRent = Number(rentIntel?.currentRent || ctx.monthlyRent || 0);
  if (!rentIntel?.success) {
    rent = componentUnavailable(
      'no_rent_evidence',
      'No reliable rental estimate is available for this property.'
    );
  } else if (!currentRent) {
    rent = componentUnavailable(
      'no_current_rent',
      'Property has no current rent recorded, so its rental position cannot be compared to the market.'
    );
  } else {
    const mid = (rentIntel.marketRange.low + rentIntel.marketRange.high) / 2;
    if (!mid) {
      rent = componentUnavailable('no_market_range', 'Rental market range unavailable.');
    } else {
      const ratio = currentRent / mid;
      const s = ratio >= 0.95 && ratio <= 1.05 ? 85 : ratio < 0.95 ? 65 : 45;
      // Confidence is reported separately and must not scale the score itself.
      rent = component(
        s,
        ratio < 0.95 ? 'below_market' : ratio > 1.05 ? 'above_market' : 'at_market',
        `Current rent is ${Math.round(ratio * 100)}% of the estimated market midpoint`
      );
    }
  }

  // --- Investment: gross yield needs rent and price; cash flow and DSCR additionally
  // need real operating-cost assumptions, so they are only applied when evidenced. ---
  let investmentComponent;
  const m = investment?.metrics;
  const costsDefaulted = Boolean(
    m?.assumptionCoverage?.materialDefaults?.some((k) =>
      ['maintenance', 'insurance', 'managementFee', 'serviceCharge', 'groundRent', 'taxes'].includes(k)
    )
  );
  if (!m || !(Number(m.grossYield) > 0)) {
    investmentComponent = componentUnavailable(
      'no_investment_inputs',
      'Investment performance requires a purchase price and an expected rent.'
    );
  } else {
    let s = 50;
    if (m.grossYield >= 7) s += 20;
    else if (m.grossYield >= 5) s += 12;
    else if (m.grossYield >= 3) s += 5;
    const detail = [`Gross yield ${m.grossYield}%`];
    if (costsDefaulted) {
      detail.push('cash flow and DSCR excluded — operating costs not supplied');
    } else {
      if (m.annualCashFlow > 0) s += 15;
      else if (m.annualCashFlow < 0) s -= 15;
      if (m.dscr !== null && m.dscr >= 1.2) s += 10;
    }
    investmentComponent = component(
      s,
      costsDefaulted ? 'yield_only' : 'fully_assessed',
      detail.join(' · ')
    );
  }

  // --- Demand: property-specific demand is not scored here. Area PropertyData
  // /demand is context only and must not fill this dimension. Previously
  // proxied from comparable count and listing status. ---
  const demand = componentUnavailable(
    'no_demand_data_source',
    'No property-specific demand data source is connected, so demand cannot be assessed. Area market demand is context only.'
  );

  // --- Risk: derived from the pre-v1 heuristic risk register (buildRisks).
  // TECHNICAL DEBT: Personal Decision dimensions.risk still consumes this
  // count of High/Medium items. Do not change the formula here; scoring
  // cleanup requires a separately justified methodology phase. ---
  let risk;
  if (!Array.isArray(risks)) {
    risk = componentUnavailable('risks_not_assessed', 'Risk register was not produced.');
  } else {
    const highRisks = risks.filter((r) => r.impact === 'High' || r.severity === 'High').length;
    const medRisks = risks.filter((r) => r.impact === 'Medium' || r.severity === 'Medium').length;
    risk = component(
      90 - highRisks * 18 - medRisks * 8,
      highRisks ? 'elevated' : medRisks ? 'moderate' : 'none_identified',
      `${highRisks} high and ${medRisks} medium risks identified`
    );
  }

  // --- Data quality: completeness of the property record. ---
  const dq = Number.isFinite(dataQuality?.score)
    ? component(dataQuality.score, (dataQuality.level || '').toLowerCase(), `${dataQuality.score}% of fields present`)
    : componentUnavailable('not_assessed', 'Property data completeness was not assessed.');

  const componentDetail = {
    market,
    rent,
    investment: investmentComponent,
    demand,
    risk,
    dataQuality: dq,
  };

  const assessed = Object.entries(componentDetail).filter(([, c]) => c.available);
  const notAssessed = Object.entries(componentDetail).filter(([, c]) => !c.available);
  const totalWeight = Object.keys(componentDetail).reduce((s, k) => s + (weights[k] || 0), 0);
  const retainedWeight = assessed.reduce((s, [k]) => s + (weights[k] || 0), 0);

  const opportunity = Array.isArray(opportunities)
    ? clamp(opportunities.length * 15 + (rentIntel?.underRented ? 25 : 0))
    : null;

  return {
    // Deprecated: an aggregate of these dimensions is not interpretable. Retained as
    // null so existing consumers do not throw; replaced by Property Assessment.
    overall: null,
    overallAvailable: false,
    overallDeprecated: true,
    overallDeprecationReason:
      'A single blended score mixing property quality, investment return, rent position, risk and data completeness cannot be interpreted — two properties could score alike for opposite reasons. Superseded by separate Property Assessment and Personal Fit results.',
    // Compatibility: flat map of scores, null where a dimension could not be evidenced.
    components: Object.fromEntries(
      Object.entries(componentDetail).map(([k, c]) => [k, c.score])
    ),
    componentDetail,
    weights,
    coverage: {
      weightRetained: totalWeight ? Math.round((retainedWeight / totalWeight) * 100) / 100 : 0,
      componentsScored: assessed.length,
      componentsTotal: assessed.length + notAssessed.length,
    },
    notAssessed: notAssessed.map(([key, c]) => ({
      component: key,
      weight: weights[key] || 0,
      state: c.state,
      reason: c.reason,
    })),
    labels: {
      marketPosition: labelFromScore(market.score),
      investmentQuality: labelFromScore(investmentComponent.score),
      rentalPosition: labelFromScore(rent.score),
      risk: risk.available ? (risk.score >= 70 ? 'Low' : risk.score >= 50 ? 'Moderate' : 'Elevated') : null,
      opportunity:
        opportunity === null ? null : opportunity >= 60 ? 'High' : opportunity >= 35 ? 'Moderate' : 'Limited',
      dataQuality: dq.available ? `${dq.score}%` : null,
    },
    methodology:
      'Per-dimension deterministic components for market, rent, investment, risk and data quality. Dimensions without evidence are returned as unavailable with a reason. No aggregate score is produced: the previous blended overall mixed unrelated concepts and has been deprecated in favour of explicit Property Assessment and Personal Fit results.',
  };
}

/**
 * Estimate confidence is owned by confidenceEngine. This wrapper preserves the
 * legacy `{ score, level, factors, note }` shape for existing consumers while
 * exposing the full evidence-based assessment alongside it.
 */
function calculateConfidence({
  dataQuality,
  comparableCount,
  avgSimilarity,
  comparables = null,
  target = null,
  methodEstimates = [],
  providerConfidence = null,
  providerCoverageAvailable = null,
  asOf,
}) {
  const assessment = assessConfidence({
    scope: 'property_estimate',
    comparables,
    target,
    dataQuality,
    methodEstimates,
    providerConfidence,
    providerCoverageAvailable,
    sampleSize: comparableCount,
    ...(asOf ? { asOf } : {}),
    ...(comparables
      ? {}
      : {
          evidence: {
            comparableCount: comparableCount || 0,
            medianSimilarity: Number.isFinite(avgSimilarity) ? avgSimilarity : null,
            medianAgeDays: null,
            staleCount: 0,
            datedCount: 0,
            medianProximity: null,
            typeMatchRate: null,
            bedroomMatchRate: null,
            floorAreaCoverage: null,
            targetFloorAreaKnown: Number(target?.square_feet) > 0,
            sparseEvidence: (comparableCount || 0) < 3,
          },
        }),
  });

  return {
    // Null when nothing could be assessed. Consumers must not coerce this to 0.
    score: assessment.score,
    level: assessment.level,
    assessed: assessment.assessed,
    factors: {
      dataQuality: dataQuality?.score,
      comparableCount,
      avgSimilarity: Number.isFinite(avgSimilarity) ? Math.round(avgSimilarity) : null,
    },
    note: assessment.unassessedReason || assessment.caps[0]?.reason || null,
    assessment,
  };
}

module.exports = {
  calculateIntelligenceScores,
  calculateConfidence,
  RESIDENTIAL_WEIGHTS,
  COMMERCIAL_WEIGHTS,
};
