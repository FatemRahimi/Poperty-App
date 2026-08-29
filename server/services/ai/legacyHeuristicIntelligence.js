/**
 * DEPRECATED — legacy heuristic intelligence (pre-canonical landlord path).
 *
 * Isolated from the canonical Property Intelligence analysis pipeline.
 * New landlord reports must not emit strengths / weaknesses / opportunities /
 * primaryRecommendation as a decision narrative. Decision Intelligence already
 * replaces that role.
 *
 * Historical compatibility:
 * Saved reports may still contain those fields. The UI may render them as
 * "Earlier-model analysis" only when Decision Intelligence is absent.
 * Do not rewrite stored output_data. Do not backfill old reports.
 *
 * TECHNICAL DEBT (do not silently remove):
 * `buildRisks` is still invoked during canonical assemble so Personal Decision
 * `dimensions.risk` (via propertyScoring) and What-if re-score from
 * `report.risks` stay numerically stable. Invented probability / riskExposure
 * values must not enter Decision Intelligence, confidence, material findings,
 * investigation priorities, or sensitivity drivers. Scoring cleanup requires a
 * separately justified methodology phase after v1.
 */

const { listingObservedCharges } = require('./listingObservedFields');

const IMPACT_WEIGHT = { Low: 0.33, Medium: 0.66, High: 1 };

/** @deprecated Narrative only. Not called for new canonical landlord analyses. */
function buildStrengths(property, rentIntel, investment, dataQuality) {
  const strengths = [];

  if (property.city && property.zip_code) {
    strengths.push({
      title: 'Location data on file',
      evidence: `${property.city}, ${property.zip_code}`,
    });
  }
  if (Number(property.square_feet) >= 900) {
    strengths.push({
      title: 'Generous floor area',
      evidence: `${Number(property.square_feet).toLocaleString()} sq ft`,
    });
  }
  if (property.parking_spaces > 0 || property.has_garage) {
    strengths.push({
      title: 'Parking provision',
      evidence: property.has_garage
        ? 'Garage available'
        : `${property.parking_spaces} parking space(s)`,
    });
  }
  if (property.has_garden) {
    strengths.push({ title: 'Garden', evidence: 'Garden flagged in property record' });
  }
  if (property.epc_rating && ['A', 'B', 'C'].includes(String(property.epc_rating).toUpperCase().charAt(0))) {
    strengths.push({ title: 'Good EPC rating', evidence: `EPC: ${property.epc_rating}` });
  }
  if (rentIntel?.success && rentIntel.underRented) {
    strengths.push({
      title: 'Rent uplift opportunity',
      evidence: `Current rent below estimated market range (£${rentIntel.marketRange.low}–£${rentIntel.marketRange.high})`,
    });
  }
  if (investment?.metrics?.grossYield >= 5) {
    strengths.push({
      title: 'Competitive gross yield',
      evidence: `${investment.metrics.grossYield}% gross yield under stated assumptions`,
    });
  }
  if (rentIntel?.success && rentIntel.comparables?.length >= 3) {
    strengths.push({
      title: 'Comparable rental listings in database',
      evidence: `${rentIntel.comparables.length} comparable rental listings identified`,
    });
  }
  if (dataQuality.score >= 75) {
    strengths.push({
      title: 'Strong property data completeness',
      evidence: `Data quality score: ${dataQuality.score}/100`,
    });
  }

  return strengths;
}

/** @deprecated Narrative only. Not called for new canonical landlord analyses. */
function buildWeaknesses(property, rentIntel, investment, dataQuality, marketingGaps) {
  const weaknesses = [];

  if (rentIntel?.success && rentIntel.currentRent > 0) {
    const mid = (rentIntel.marketRange.low + rentIntel.marketRange.high) / 2;
    if (rentIntel.currentRent > mid * 1.05) {
      weaknesses.push({
        title: 'Rent above comparable midpoint',
        evidence: `Current £${rentIntel.currentRent.toLocaleString()} vs midpoint ~£${Math.round(mid).toLocaleString()}`,
      });
    }
  }
  if (!property.epc_rating && !property.epc_document_url) {
    weaknesses.push({ title: 'Missing EPC information', evidence: 'No EPC rating or document on file' });
  }
  if (Number(listingObservedCharges(property).serviceCharge.value) > 2000) {
    weaknesses.push({
      title: 'High service charge',
      evidence: `£${Number(property.service_charge).toLocaleString()} annual service charge`,
    });
  }
  if (investment?.presented?.annualCashFlow?.available && investment.metrics.annualCashFlow < 0) {
    weaknesses.push({
      title: 'Negative cash flow under assumptions',
      evidence: `Estimated annual cash flow: £${investment.metrics.annualCashFlow.toLocaleString()}`,
    });
  }
  if (!rentIntel?.success) {
    weaknesses.push({
      title: 'Limited comparable rental data',
      evidence: rentIntel?.message || 'Insufficient comparables in database',
    });
  }
  if (dataQuality.requiredMissing?.length) {
    weaknesses.push({
      title: 'Incomplete core property data',
      evidence: `Missing: ${dataQuality.requiredMissing.join(', ')}`,
    });
  }
  marketingGaps.slice(0, 2).forEach((g) => {
    weaknesses.push({ title: 'Listing positioning gap', evidence: g.message });
  });

  return weaknesses;
}

/** @deprecated Narrative only. Not called for new canonical landlord analyses. */
function buildOpportunities(property, rentIntel, marketingGaps) {
  const opportunities = [];

  if (rentIntel?.success && rentIntel.underRented && rentIntel.potentialAnnualUplift) {
    opportunities.push({
      id: 'rent-opportunity',
      category: 'RENT',
      title: 'Rent opportunity',
      currentRent: rentIntel.currentRent,
      marketRange: rentIntel.marketRange,
      recommendedPosition: rentIntel.recommendedRent,
      potentialAnnualImprovement: rentIntel.potentialAnnualUplift,
      confidence: rentIntel.confidence,
      confidenceLabel: rentIntel.confidenceLevel || 'Not assessed',
      evidence: `${rentIntel.comparables.length} internal comparables`,
    });
  }

  marketingGaps.forEach((g, i) => {
    opportunities.push({
      id: `marketing-${i}`,
      category: 'MARKETING',
      title: 'Marketing opportunity',
      description: g.message,
      evidence: g.evidence,
      confidence: 85,
      confidenceLabel: 'High',
    });
  });

  return opportunities.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

/**
 * @deprecated Invented probability / riskExposure register.
 * Still used only as the Personal Decision risk-dimension input (technical debt).
 * Must not be mapped into Decision Intelligence or shown as canonical risk.
 */
function buildRisks(property, rentIntel, investment, dataQuality) {
  const risks = [];

  if (rentIntel?.success && rentIntel.currentRent > 0) {
    const mid = (rentIntel.marketRange.low + rentIntel.marketRange.high) / 2;
    if (rentIntel.currentRent < mid * 0.94) {
      const pctBelow = ((mid - rentIntel.currentRent) / mid) * 100;
      const prob = Math.min(0.95, 0.5 + rentIntel.confidence / 200);
      const impact = pctBelow > 10 ? 'High' : 'Medium';
      risks.push({
        id: 'rent-below-market',
        category: 'RENTAL',
        title: 'Current rent appears below comparable midpoint',
        severity: impact,
        probability: Math.round(prob * 100) / 100,
        impact,
        riskExposure: Math.round(prob * IMPACT_WEIGHT[impact] * 100) / 100,
        evidence: `Current rent is ${pctBelow.toFixed(1)}% below estimated market midpoint.`,
        recommendedAction: 'Review rent at next tenancy event.',
      });
    }
    if (rentIntel.currentRent > mid * 1.06) {
      const prob = Math.min(0.9, 0.45 + rentIntel.confidence / 200);
      risks.push({
        id: 'rent-above-market',
        category: 'RENTAL',
        title: 'Current rent appears above comparable midpoint',
        severity: 'Medium',
        probability: Math.round(prob * 100) / 100,
        impact: 'Medium',
        riskExposure: Math.round(prob * IMPACT_WEIGHT.Medium * 100) / 100,
        evidence: `Current rent exceeds estimated market midpoint.`,
        recommendedAction: 'Monitor void risk and tenant retention.',
      });
    }
  }

  if (investment?.presented?.annualCashFlow?.available && investment.metrics.annualCashFlow < 0) {
    risks.push({
      id: 'negative-cashflow',
      category: 'FINANCIAL',
      title: 'Negative cash flow under current assumptions',
      severity: 'High',
      probability: 0.72,
      impact: 'High',
      riskExposure: 0.72,
      evidence: `Annual cash flow: £${investment.metrics.annualCashFlow.toLocaleString()}`,
      recommendedAction: 'Review financing, costs, or rent positioning.',
    });
  }

  if (!property.epc_rating) {
    risks.push({
      id: 'missing-epc',
      category: 'DOCUMENT',
      title: 'EPC documentation missing',
      severity: 'Medium',
      probability: 0.95,
      impact: 'Medium',
      riskExposure: 0.63,
      evidence: 'No EPC rating or document on file.',
      recommendedAction: 'Upload EPC certificate.',
    });
  }

  if (dataQuality.score < 50) {
    risks.push({
      id: 'poor-data',
      category: 'DATA',
      title: 'Insufficient property data for high-confidence analysis',
      severity: 'Medium',
      probability: 0.9,
      impact: 'Medium',
      riskExposure: 0.59,
      evidence: `Data quality score: ${dataQuality.score}/100`,
      recommendedAction: 'Complete missing property fields.',
    });
  }

  if (property.break_clause) {
    risks.push({
      id: 'break-clause',
      category: 'LEASE',
      title: 'Break clause present on lease',
      severity: 'Medium',
      probability: 0.55,
      impact: 'Medium',
      riskExposure: 0.36,
      evidence: 'Break clause flagged in property record.',
      recommendedAction: 'Review lease obligations before renewal.',
    });
  }

  return risks.sort((a, b) => b.riskExposure - a.riskExposure);
}

/** @deprecated Parallel buy/proceed narrative. Not called for new canonical landlord analyses. */
function buildPrimaryRecommendation({ opportunities, risks, dataQuality, investment, rentIntel }) {
  if (!dataQuality.sufficientForAnalysis) {
    return {
      action: 'Insufficient data — collect additional property information.',
      why: 'Core property fields are incomplete for reliable intelligence.',
      evidence: dataQuality.requiredMissing?.length
        ? `Missing: ${dataQuality.requiredMissing.join(', ')}`
        : `Data quality score: ${dataQuality.score}/100`,
      expectedImpact: 'Improved analysis confidence and accuracy.',
      confidence: Math.min(dataQuality.score, 40),
      confidenceLabel: 'Low',
    };
  }

  const topOpp = opportunities[0];
  if (topOpp?.category === 'RENT') {
    return {
      action: 'Review rental pricing.',
      why: 'Current rent appears below the estimated market range based on internal comparables.',
      evidence: topOpp.evidence,
      expectedImpact: topOpp.potentialAnnualImprovement
        ? `Potential £${Math.round(topOpp.potentialAnnualImprovement.low).toLocaleString()}–£${Math.round(topOpp.potentialAnnualImprovement.high).toLocaleString()} annual improvement`
        : 'Potential rental income improvement',
      confidence: topOpp.confidence,
      confidenceLabel: topOpp.confidenceLabel,
    };
  }

  const topRisk = risks[0];
  if (topRisk?.category === 'FINANCIAL') {
    return {
      action: 'Proceed with further investment analysis.',
      why: topRisk.title,
      evidence: topRisk.evidence,
      expectedImpact: 'Clarify financing and cost assumptions before committing.',
      confidence: 65,
      confidenceLabel: 'Medium',
    };
  }

  if (topOpp?.category === 'MARKETING') {
    return {
      action: 'Improve listing positioning before reducing price.',
      why: topOpp.description,
      evidence: topOpp.evidence,
      expectedImpact: 'Better marketing may improve enquiry quality without price changes.',
      confidence: topOpp.confidence,
      confidenceLabel: topOpp.confidenceLabel,
    };
  }

  if (investment?.hasMortgageAssumptions === false && investment?.metrics) {
    return {
      action: 'Add mortgage assumptions for leveraged cash-flow analysis.',
      why: 'Purchase price and rent are available but financing inputs were not supplied.',
      evidence: `Gross yield: ${investment.metrics.grossYield}%`,
      expectedImpact: 'Complete DSCR and cash-flow projections.',
      confidence: 70,
      confidenceLabel: 'Medium',
    };
  }

  return {
    action: rentIntel?.success ? 'Monitor market position and maintain listing quality.' : 'Expand property data and comparable coverage.',
    why: 'No dominant opportunity or risk identified from current data.',
    evidence: `Intelligence based on ${dataQuality.score}/100 data quality score.`,
    expectedImpact: 'Maintains current positioning.',
    confidence: 55,
    confidenceLabel: 'Medium',
  };
}

module.exports = {
  IMPACT_WEIGHT,
  buildStrengths,
  buildWeaknesses,
  buildOpportunities,
  buildRisks,
  buildPrimaryRecommendation,
};
